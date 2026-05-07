import type {
    ActorPF2e,
    ChatMessagePF2e,
    EffectPF2e,
    EffectSource,
    TokenPF2e,
    WeaponPF2e,
    SpellPF2e,
} from "foundry-pf2e";
import { addOrUpdateEffectOnActor, getTokenFromUuid, MODULE_ID } from "../utils.ts";
import {
    getSocket,
    DANCING_BLADE_APPLY_TARGET,
    DANCING_BLADE_APPLY_GUARD,
    DANCING_BLADE_CLEANUP,
} from "../sockets.ts";
import { sendDamageRollToChat, DAMAGE_TAG_CONFIG } from "../damagehelper.ts";
import { addSustainEffectToActor } from "../sustain.ts";
import type { ImageFilePath } from "foundry-pf2e/foundry/common/constants.mjs";
import {
    endBladeAnimation,
    playBladeAnimationSequence,
    playDancingBladeAttackAnimation,
    playDancingBladeGuardAnimation,
    promptForBladeAction,
    promptForTarget,
    promptForWeapon,
    startDancingBladePersistentAnimation,
} from "./dancingblade-ui.ts";

const SHORTHAND_DAMAGE_TYPES: Record<string, string> = {
    b: "bludgeoning",
    p: "piercing",
    s: "slashing",
};

type DancingBladeAction = "strike" | "guard" | "push";

/**
 * Tracking data stored on the sustain effect for Dancing Blade.
 */
interface DancingBladeFlags {
    castRank: number;
    isAmped: boolean;
    targetUuid: string;
    skipSustainChat: boolean;
    weaponId: string;
}

// --- Entry Points ---

/**
 * Handles the initial casting of the Dancing Blade spell.
 * Orchestrates weapon selection, targeting, and initial action resolution.
 * @param token The caster's token.
 * @param message The chat message from the spell cast.
 */
export async function startDancingBlade(token: TokenPF2e, message: ChatMessagePF2e) {
    const actor = token.actor;
    if (!actor) return;

    // 1. Weapon Selection
    const weapons = actor.itemTypes.weapon;
    if (weapons.length === 0) {
        ui.notifications.warn("You have no weapons to use with Dancing Blade.");
        return;
    }

    const weaponId = await promptForWeapon(weapons);
    const weapon = weaponId ? (actor.items.get(weaponId) as WeaponPF2e) : null;
    if (!weapon) {
        await abortDancingBlade();
        return;
    }

    // 2. Cleanup any previous cast of this weapon
    await handleExistingCasting(actor, weapon);

    // 3. Initial Animation near Caster
    const context = getCastContext(message);
    const effectName = `dancing-blade-${weapon.id}`;
    playBladeAnimationSequence({ weapon, effectName, target: token });

    // 4. Partnering
    const range = getDancingBladeRange(actor);
    const target = await promptForTarget(token, range);
    if (!target) {
        await abortDancingBlade(weapon.id);
        return;
    }
    await partnerWithTarget(target, token, weapon, token, weapon.id);

    // 5. Initial Action
    const damageTypes = await getWeaponDamageTypes(weapon);
    const result = await promptForBladeAction(weapon.name, context.isAmped, true, damageTypes);
    if (!result) {
        await abortDancingBlade(weapon.id, target);
        return;
    }

    await resolveBladeAction(result.choice as DancingBladeAction, token, target, weapon, {
        ...context,
        attackNumber: result.attackNumber,
        damageType: result.damageType,
        weaponId: weapon.id,
    });

    // 6. Setup Sustain Tracking
    await createSustainEffect(actor, weapon, target, context);
}

/**
 * Handles the sustain action for Dancing Blade.
 * Provides the interactive menu for Strike, Guard, Push, or Change Partner.
 * @param effect The sustain effect being processed.
 */
export async function sustainDancingBlade(effect: EffectPF2e) {
    const actor = effect.actor;
    if (!actor || !actor.getActiveTokens()[0]) return;

    const token = actor.getActiveTokens()[0]!;
    const flags = getDancingBladeFlags(effect);

    if (!flags) {
        ui.notifications.error("Could not find Dancing Blade tracking data on the effect.");
        return;
    }

    const { castRank, isAmped, targetUuid, weaponId } = flags;
    const weapon = actor.items.get(weaponId) as WeaponPF2e;
    if (!weapon) {
        ui.notifications.warn("The original dancing weapon was not found.");
        return;
    }

    const currentTargetToken = getTokenFromUuid(targetUuid);

    let choice = "partner";
    let attackNumber = 1;
    let damageType: string | undefined;

    if (!currentTargetToken) {
        ui.notifications.info(
            "The previous partner is no longer on the board. Please choose a new partner.",
        );
    } else {
        const damageTypes = await getWeaponDamageTypes(weapon);
        const result = await promptForBladeAction(weapon.name, isAmped, false, damageTypes);
        if (!result) return;
        choice = result.choice;
        attackNumber = result.attackNumber;
        damageType = result.damageType;
    }

    if (choice === "partner") {
        await handleChangePartner(effect, token, currentTargetToken, weapon, weaponId);
    } else {
        await resolveBladeAction(choice as DancingBladeAction, token, currentTargetToken!, weapon, {
            castRank,
            isAmped,
            attackNumber,
            damageType,
            weaponId,
        });
    }
}

// --- Logic Helpers ---

/**
 * Safely retrieves and types the Dancing Blade flags from an effect.
 */
function getDancingBladeFlags(effect: EffectPF2e): DancingBladeFlags | null {
    const castRank = effect.getFlag(MODULE_ID, "castRank") as number | undefined;
    const isAmped = effect.getFlag(MODULE_ID, "isAmped") as boolean | undefined;
    const targetUuid = effect.getFlag(MODULE_ID, "targetUuid") as string | undefined;
    const skipSustainChat = effect.getFlag(MODULE_ID, "skipSustainChat") as boolean | undefined;
    const weaponId = effect.getFlag(MODULE_ID, "weaponId") as string | undefined;

    if (castRank === undefined || isAmped === undefined || !targetUuid || !weaponId) {
        return null;
    }

    return {
        castRank,
        isAmped,
        targetUuid,
        skipSustainChat: skipSustainChat ?? false,
        weaponId,
    };
}

/**
 * Resolves the chosen action (Strike, Guard, or Push) for the Dancing Blade.
 */
async function resolveBladeAction(
    choice: DancingBladeAction,
    caster: TokenPF2e,
    target: TokenPF2e,
    weapon: WeaponPF2e,
    context: {
        castRank: number;
        isAmped: boolean;
        attackNumber: number;
        damageType?: string;
        weaponId: string;
    },
): Promise<void> {
    const { castRank, isAmped, attackNumber, damageType, weaponId } = context;

    const spell = getDancingBladeSpell(caster.actor!);
    if (!spell) {
        ui.notifications.error("Could not find Dancing Blade spell on actor.");
        return;
    }

    switch (choice) {
        case "strike":
            await resolveDancingBladeStrike(
                caster,
                target,
                weapon,
                spell,
                castRank,
                isAmped,
                attackNumber,
                damageType,
            );
            break;
        case "guard":
            await applyDancingBladeGuard(caster, target, weapon, spell, weaponId);
            break;
        case "push":
            await resolveDancingBladePush(caster, target, weapon, spell, attackNumber);
            break;
    }
}

/**
 * Handles the process of changing the Dancing Blade's partner.
 * Includes target selection, redundant selection checks, and cleanup of the old partner.
 */
async function handleChangePartner(
    effect: EffectPF2e,
    token: TokenPF2e,
    currentTargetToken: TokenPF2e | null,
    weapon: WeaponPF2e,
    weaponId: string,
) {
    const actor = token.actor!;
    const newTarget = await promptForTarget(token, getDancingBladeRange(actor));
    if (!newTarget) return;

    if (newTarget.document.uuid === currentTargetToken?.document.uuid) {
        ui.notifications.info(`${newTarget.name} is already the current partner.`);
        return;
    }

    if (currentTargetToken) {
        await cleanupTargetEffects(currentTargetToken, weaponId);
    }

    await partnerWithTarget(newTarget, token, weapon, currentTargetToken ?? token, weaponId);
    await effect.setFlag(MODULE_ID, "targetUuid", newTarget.document.uuid);
    await ChatMessage.create({
        content: `<strong>Dancing Blade</strong> is now partnering with ${newTarget.name}.`,
        speaker: ChatMessage.getSpeaker({ token: token.document }),
    });
}

/**
 * Delegates partner setup to the GM via socket.
 * The GM-side function handles both effect creation and animation.
 */
async function partnerWithTarget(
    target: TokenPF2e,
    caster: TokenPF2e,
    weapon: WeaponPF2e,
    previousLocationToken: TokenPF2e,
    weaponId: string,
): Promise<void> {
    await getSocket().executeAsGM(
        DANCING_BLADE_APPLY_TARGET,
        target.document.uuid,
        caster.document.uuid,
        weaponId,
        weapon.img,
        previousLocationToken.document.uuid,
    );
}

/**
 * Delegates removal of Dancing Blade effects from a target to the GM via socket.
 */
async function cleanupTargetEffects(target: TokenPF2e, weaponId?: string) {
    await getSocket().executeAsGM(
        DANCING_BLADE_CLEANUP,
        target.document.uuid,
        weaponId,
    );
}

/**
 * Generic cleanup function for Dancing Blade sustain effect deletion.
 * Registered in SUSTAIN_DELETION_MAPPINGS.
 */
export async function cleanupDancingBlade(effect: EffectPF2e) {
    const targetUuid = effect.getFlag(MODULE_ID, "targetUuid") as string | undefined;
    const weaponId = effect.getFlag(MODULE_ID, "weaponId") as string | undefined;

    if (weaponId) {
        endBladeAnimation(weaponId);
    }

    if (!targetUuid) return;

    const targetToken = getTokenFromUuid(targetUuid);

    if (targetToken) {
        await cleanupTargetEffects(targetToken, weaponId);
    }
}

// --- Strike and Action Resolution ---

/**
 * Resolves a strike for Dancing Blade, including attack roll and message prep.
 */
export async function resolveDancingBladeStrike(
    caster: TokenPF2e,
    target: TokenPF2e,
    weapon: WeaponPF2e,
    spell: SpellPF2e<ActorPF2e>,
    castRank: number,
    isAmped: boolean,
    attackNumber: number = 1,
    selectedDamageType?: string,
) {
    const actor = caster.actor;
    if (!actor) return;

    const damageTypes = await getWeaponDamageTypes(weapon);
    if (!selectedDamageType) {
        selectedDamageType = damageTypes[0];
    }
    if (!selectedDamageType) return;

    const statistic = spell.spellcasting?.statistic;
    if (!statistic) {
        ui.notifications.error("Could not find spellcasting statistic for Dancing Blade.");
        return;
    }

    await playDancingBladeAttackAnimation(target, "strike");

    const materialType = weapon.system.material?.type;
    const strikeTraits = ["attack"];
    if (materialType) strikeTraits.push(materialType);

    const weaponOptions = weapon.getRollOptions("item");

    // Module-specific values here are used when damage card is created from buttons.
    const extraRollOptions = Array.from(
        new Set([
            ...weaponOptions,
            `${MODULE_ID}:dancing-blade-attack`,
            `${MODULE_ID}:cast-rank:${castRank}`,
            `${MODULE_ID}:is-amped:${isAmped}`,
            `${MODULE_ID}:damage-type:${selectedDamageType}`,
            `${MODULE_ID}:weapon-id:${weapon.id}`,
            `${MODULE_ID}:weapon-name:${weapon.name}`,
            "melee",
            "melee-attack-roll",
        ]),
    );
    if (materialType) {
        extraRollOptions.push(`item:material:${materialType}`);
    }

    await statistic.roll({
        target: target.actor ?? null,
        title: `Dancing Blade Strike: ${weapon.name}`,
        item: spell,
        melee: true,
        traits: strikeTraits,
        attackNumber,
        extraRollOptions,
    });
}

/**
 * Applies the Guard amped effect to a target.
 * Effect creation and animation are delegated to the GM via socket.
 */
export async function applyDancingBladeGuard(
    caster: TokenPF2e,
    target: TokenPF2e,
    weapon: WeaponPF2e,
    spell: SpellPF2e<ActorPF2e>,
    weaponId: string,
) {
    await getSocket().executeAsGM(
        DANCING_BLADE_APPLY_GUARD,
        target.document.uuid,
        caster.document.uuid,
        spell.uuid,
        weapon.img,
        weaponId,
    );
    await ChatMessage.create({
        content: `<strong>Dancing Blade</strong> is now guarding ${target.name}.`,
        speaker: ChatMessage.getSpeaker({ token: caster.document }),
    });
}

/**
 * Resolves a Push amped action for Dancing Blade.
 */
export async function resolveDancingBladePush(
    _caster: TokenPF2e,
    target: TokenPF2e,
    weapon: WeaponPF2e,
    spell: SpellPF2e<ActorPF2e>,
    attackNumber: number = 1,
) {
    const statistic = spell.spellcasting?.statistic;
    if (!statistic) {
        ui.notifications.error("Could not find spellcasting statistic for Dancing Blade.");
        return;
    }

    const fortitudeDc = target.actor?.saves?.fortitude?.dc?.value;
    if (fortitudeDc === undefined) {
        ui.notifications.error("Could not find Fortitude DC for the target.");
        return;
    }

    await playDancingBladeAttackAnimation(target, "push");

    await statistic.roll({
        target: target.actor ?? null,
        dc: { value: fortitudeDc },
        title: `Dancing Blade Push - ${weapon.name}`,
        item: spell,
        traits: ["attack"],
        attackNumber,
        action: "shove",
        extraRollOptions: [`${MODULE_ID}:dancing-blade-push`, "action:shove"],
        extraRollNotes: [
            {
                selector: "dancing-blade-push",
                title: "Critical Success",
                text: "You push the target up to 10 feet.",
                outcome: ["criticalSuccess"],
            },
            {
                selector: "dancing-blade-push",
                title: "Success",
                text: "You push the target back 5 feet.",
                outcome: ["success"],
            },
        ],
    });
}

/**
 * Rolls damage for Dancing Blade when triggered by chat card buttons.
 */
export async function rollDancingBladeDamage(message: ChatMessagePF2e, isCritical: boolean) {
    const rollOptions = message.flags.pf2e.context?.options ?? [];
    const getOption = (p: string) => rollOptions.find((o) => o.startsWith(p))?.substring(p.length);

    const castRankStr = getOption(`${MODULE_ID}:cast-rank:`);
    const isAmpedStr = getOption(`${MODULE_ID}:is-amped:`);
    const dmgType = getOption(`${MODULE_ID}:damage-type:`);
    const weaponId = getOption(`${MODULE_ID}:weapon-id:`);
    const weaponName = getOption(`${MODULE_ID}:weapon-name:`);

    const context = message.flags.pf2e.context;
    const targetUuid = context && "target" in context ? context.target?.token : null;

    if (!castRankStr || !dmgType || !targetUuid || !weaponId) {
        ui.notifications.error("Could not find Dancing Blade attack or target data.");
        return;
    }

    const weapon = message.actor?.items.get(weaponId) as WeaponPF2e | undefined;
    const materialType = weapon?.system.material?.type || undefined;
    const weaponOptions = weapon?.getRollOptions("item") ?? [];

    const castRank = parseInt(castRankStr);
    const isAmped = isAmpedStr === "true";
    const formula = getDancingBladeDamageFormula(castRank, isAmped, isCritical);

    const damageTypes = [dmgType];
    if (materialType) damageTypes.push(materialType);
    const damageRollFormula = `{${formula}[${damageTypes}]}`;

    const DamageRoll = CONFIG.Dice.rolls.find((r) => r.name === "DamageRoll") as typeof Roll;
    const damageRoll = await new DamageRoll(damageRollFormula).evaluate();

    const damageOptions = Array.from(
        new Set([...rollOptions, ...weaponOptions, "melee", "melee-attack-roll"]),
    );
    if (materialType) damageOptions.push(`item:material:${materialType}`);

    // Add relevant "traits" as defined in the damage helper (e.g. Ghost Touch)
    const traitsToInclude: string[] = [];
    if (weapon) {
        for (const [key, config] of Object.entries(DAMAGE_TAG_CONFIG)) {
            if (config.group !== "trait") continue;
            if (weaponOptions.includes(config.value) && config.hasTag) {
                traitsToInclude.push(key);
            }
        }
    }

    await sendDamageRollToChat({
        roll: damageRoll,
        title: `Dancing Blade:`,
        subtitle: `${weaponName}`,
        damageType: dmgType,
        targetUuid,
        traits: traitsToInclude,
        material: materialType,
        speaker: ChatMessage.getSpeaker({ token: message.token }),
        rollOptions: damageOptions,
    });
}

// --- Data Helpers ---

/**
 * Normalises a weapon ID for use in effect slugs.
 * Foundry lowercases slugs internally, so we must match that convention.
 */
function weaponSlugId(id: string): string {
    return id.toLowerCase();
}

/**
 * Cancels the initial Dancing Blade cast.
 * Cleans up animations and any temporary effects applied to a target.
 */
async function abortDancingBlade(weaponId?: string, target?: TokenPF2e) {
    if (weaponId) {
        endBladeAnimation(weaponId);
    }
    if (target) {
        await cleanupTargetEffects(target, weaponId);
    }
    ui.notifications.info("Dancing Blade cancelled.");
}

/** Finds the Dancing Blade spell item on the given actor. */
function getDancingBladeSpell(actor: ActorPF2e): SpellPF2e<ActorPF2e> | undefined {
    return actor.itemTypes.spell.find((s) => s.slug === "dancing-blade");
}

/** Extracts the spell's range in feet, defaulting to 30 ft. */
function getDancingBladeRange(actor: ActorPF2e): number {
    const spell = getDancingBladeSpell(actor);
    const rangeValue = spell?.system.range.value ?? "30";
    return parseInt(rangeValue.replace(/[^0-9]/g, "")) || 30;
}

/**
 * Creates the "Dancing Blade Guard" effect source that grants +2 circumstance AC vs melee.
 * The effect expires at the start of the caster's next turn.
 */
function createGuardEffect(
    caster: TokenPF2e,
    spell: SpellPF2e<ActorPF2e>,
    icon: string,
    weaponId: string,
): EffectSource {
    return {
        type: "effect",
        name: "Dancing Blade Guard",
        img: icon as ImageFilePath,
        system: {
            slug: `dancing-blade-guard-${weaponSlugId(weaponId)}`,
            tokenIcon: { show: true },
            duration: { value: 1, unit: "rounds", expiry: "turn-start" },
            context: {
                origin: {
                    actor: caster.actor?.uuid,
                    item: spell?.uuid,
                    token: caster.document.uuid,
                },
            },
            rules: [
                {
                    key: "FlatModifier",
                    selector: "ac",
                    value: 2,
                    type: "circumstance",
                    predicate: ["melee"],
                },
            ],
        },
    } as unknown as EffectSource;
}

/**
 * Dynamically retrieves available damage types for the weapon.
 * Scans base damage, versatile traits, and character strike formulas.
 */
async function getWeaponDamageTypes(weapon: WeaponPF2e): Promise<string[]> {
    const types = new Set<string>();
    const pf2eDamageTypes = CONFIG.PF2E.damageTypes;

    // 1. Base Damage Type
    const baseType = weapon.system.damage.damageType;
    if (baseType in pf2eDamageTypes) types.add(baseType);

    // 2. Versatile Traits
    for (const trait of weapon.system.traits.value) {
        if (trait.startsWith("versatile-")) {
            const vShorthand = trait.replace("versatile-", "");
            const vType = SHORTHAND_DAMAGE_TYPES[vShorthand];
            if (vType) types.add(vType);
        }
    }

    // 3. Retrieve the damage formula from the caster's strike action, and extract all damage types
    // from it. (There does not appear to be a way to do this from the weapon itself)
    try {
        const actor = weapon.actor;
        if (actor?.isOfType("creature")) {
            const strike = actor.system.actions?.find((a) => a.item?.id === weapon.id);
            if (strike && typeof strike.damage === "function") {
                const result = await strike.damage({ getFormula: true });
                const formulaString = typeof result === "string" ? result : result?.formula;

                if (formulaString) {
                    const words = formulaString.match(/[a-z-]+/gi) ?? [];
                    for (const word of words) {
                        const dType = word.toLowerCase();
                        if (dType in pf2eDamageTypes) types.add(dType);
                    }
                }
            }
        }
    } catch (e) {
        console.error("Dancing Blade: Error extracting damage types", e);
    }

    return Array.from(types);
}

// --- GM-Side Socket Functions ---
// These run on the GM's client via socketlib.executeAsGM().
// They handle privileged effect CRUD on actors the casting player doesn't own.

/**
 * GM-side: Applies the "Target: Dancing Blade" tracking effect to the target
 * and starts the persistent floating weapon animation tied to it.
 */
export async function applyTargetEffectAsGM(
    targetUuid: string,
    casterUuid: string,
    weaponId: string,
    weaponIcon: string,
    previousLocationTokenUuid: string,
) {
    const targetToken = getTokenFromUuid(targetUuid);
    const casterToken = getTokenFromUuid(casterUuid);
    const previousLocationToken = getTokenFromUuid(previousLocationTokenUuid);
    if (!targetToken?.actor || !casterToken?.actor || !previousLocationToken) return;

    const weapon = casterToken.actor.items.get(weaponId) as WeaponPF2e;
    if (!weapon) return;

    const effectSource = {
        type: "effect",
        name: "Target: Dancing Blade",
        img: weaponIcon as ImageFilePath,
        system: {
            slug: `target-dancing-blade-${weaponSlugId(weaponId)}`,
            tokenIcon: { show: true },
            duration: { value: 0, unit: "unlimited", expiry: null },
        },
        flags: { [MODULE_ID]: { casterUuid: casterToken.document.uuid, weaponId } },
    } as DeepPartial<EffectSource> as EffectSource;

    const targetEffect = await addOrUpdateEffectOnActor(targetToken.actor, effectSource);
    if (targetEffect) {
        startDancingBladePersistentAnimation(
            targetToken,
            targetEffect,
            weapon,
            previousLocationToken,
            weaponId,
        );
    }
}

/**
 * GM-side: Applies the "Dancing Blade Guard" effect to the target
 * and plays the guard animation.
 */
export async function applyGuardEffectAsGM(
    targetUuid: string,
    casterUuid: string,
    spellUuid: string,
    weaponIcon: string,
    weaponId: string,
) {
    const targetToken = getTokenFromUuid(targetUuid);
    const casterToken = getTokenFromUuid(casterUuid);
    if (!targetToken?.actor || !casterToken) return;

    const spell = fromUuidSync(spellUuid) as SpellPF2e<ActorPF2e> | null;
    if (!spell) return;

    const guardEffectSource = createGuardEffect(casterToken, spell, weaponIcon, weaponId);
    await addOrUpdateEffectOnActor(targetToken.actor, guardEffectSource);
    playDancingBladeGuardAnimation(targetToken);
}

/**
 * GM-side: Removes Dancing Blade related effects (target tracking and guard)
 * from a target token.
 */
export async function cleanupDancingBladeAsGM(targetUuid: string, weaponId?: string) {
    const targetToken = getTokenFromUuid(targetUuid);
    if (!targetToken?.actor) return;

    const slugs = weaponId
        ? ["target-dancing-blade", "dancing-blade-guard"].map(
              (s) => `${s}-${weaponSlugId(weaponId)}`,
          )
        : ["target-dancing-blade", "dancing-blade-guard"];

    const effects = targetToken.actor.itemTypes.effect.filter((e) =>
        slugs.includes(e.slug ?? ""),
    );
    for (const effect of effects) {
        await effect.delete();
    }
}

/**
 * Extracts essential spellcasting context from the initial spell message.
 */
function getCastContext(message: ChatMessagePF2e): { castRank: number; isAmped: boolean } {
    const castRank = message.flags.pf2e.origin?.castRank ?? 5;
    const isAmped = !!message.flags.pf2e.origin?.rollOptions?.includes("origin:item:tag:amped");
    return { castRank, isAmped };
}

/**
 * Checks for an existing Dancing Blade cast for the specified weapon and cleans it up.
 */
async function handleExistingCasting(actor: ActorPF2e, weapon: WeaponPF2e) {
    const slug = `sustaining-effect-dancing-blade-${weaponSlugId(weapon.id)}`;
    const existing = actor.itemTypes.effect.find((e) => e.slug === slug);
    if (existing) {
        await cleanupDancingBlade(existing);
        await existing.delete();
    }
}

/**
 * Creates and applies the sustain tracking effect for a new Dancing Blade cast.
 */
async function createSustainEffect(
    actor: ActorPF2e,
    weapon: WeaponPF2e,
    target: TokenPF2e,
    context: { castRank: number; isAmped: boolean },
) {
    const spell = getDancingBladeSpell(actor);
    if (!spell) {
        ui.notifications.error("Could not find Dancing Blade spell on actor.");
        return;
    }

    await addSustainEffectToActor(
        actor,
        spell,
        weapon.id,
        {
            sustainedSubtitle: weapon.name,
            castRank: context.castRank,
            isAmped: context.isAmped,
            targetUuid: target.document.uuid,
            skipSustainChat: true,
            weaponId: weapon.id,
        },
        spell.img ?? weapon.img,
    );
}

/**
 * Calculates the damage formula based on cast rank, amped status, and critical success.
 */
function getDancingBladeDamageFormula(rank: number, isAmped: boolean, isCritical: boolean): string {
    const numDice = 3 + Math.floor((rank - 5) / 2);
    const dieSize = isAmped ? "d10" : "d6";
    return isCritical ? `(${numDice}${dieSize} * 2)` : `${numDice}${dieSize}`;
}
