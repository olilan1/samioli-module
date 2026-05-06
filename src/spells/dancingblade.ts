import type {
    ActorPF2e,
    ChatMessagePF2e,
    EffectPF2e,
    EffectSource,
    TokenPF2e,
    WeaponPF2e,
    SpellPF2e,
} from "foundry-pf2e";
import { addOrUpdateEffectOnActor, MODULE_ID } from "../utils.ts";
import { sendDamageRollToChat, DAMAGE_TAG_CONFIG } from "../damagehelper.ts";
import { addSustainEffectToActor } from "../sustain.ts";
import type { ImageFilePath } from "foundry-pf2e/foundry/common/constants.mjs";
import {
    promptForWeapon,
    promptForTarget,
    promptForBladeAction,
    playBladeAnimationSequence,
    getPersistentAnimation,
    startDancingBladePersistentAnimation,
    playDancingBladeAttackAnimation,
    playDancingBladeGuardAnimation,
} from "./dancingblade-ui.ts";

const SHORTHAND_DAMAGE_TYPES: Record<string, string> = {
    b: "bludgeoning",
    p: "piercing",
    s: "slashing",
};

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
    if (!weaponId) {
        ui.notifications.info("Dancing Blade cancelled.");
        return;
    }

    const weapon = actor.items.get(weaponId) as WeaponPF2e;
    if (!weapon) return;

    // 2. Overwrite Protection
    const existingSustain = actor.itemTypes.effect.find(
        (e) => e.slug === `sustaining-effect-dancing-blade-${weaponSlugId(weapon.id)}`,
    );
    if (existingSustain) {
        await cleanupDancingBlade(existingSustain);
        await existingSustain.delete();
    }

    // 3. Metadata Assessment
    const castRank = message.flags.pf2e.origin?.castRank ?? 5;
    const rollOptions = message.flags?.pf2e?.origin?.rollOptions;
    const isAmped = !!rollOptions?.includes("origin:item:tag:amped");

    // 4. Initial Animation near Caster
    const effectName = `dancing-blade-${weapon.id}`;
    playBladeAnimationSequence({
        animFile: getPersistentAnimation(weapon),
        effectName,
        target: token,
    });

    // 5. Targeting
    const range = getDancingBladeRange(actor);
    const target = await promptForTarget(token, range);
    if (!target) {
        endBladeAnimation(weapon.id);
        return;
    }

    // 6. Setup Partnership
    const targetEffect = await partnerWithTarget(target, token, weapon, token, weapon.id);
    if (!targetEffect) {
        endBladeAnimation(weapon.id);
        return;
    }

    // 7. Initial Action
    const actionTaken = await handleBladeAction(token, target, weapon, {
        castRank,
        isAmped,
        isInitialCast: true,
        weaponId: weapon.id,
    });

    if (!actionTaken) {
        endBladeAnimation(weapon.id);
        await cleanupTargetEffects(target, weapon.id);
        ui.notifications.info("Dancing Blade cancelled.");
        return;
    }

    // 8. Setup Sustain Tracking
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
            castRank,
            isAmped,
            targetUuid: target.document.uuid,
            skipSustainChat: true,
            weaponId: weapon.id,
        },
        spell.img ?? weapon.img,
    );
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
        const range = getDancingBladeRange(actor);
        const newTarget = await promptForTarget(token, range);
        if (!newTarget) return;

        // Cleanup old target
        if (currentTargetToken && currentTargetToken.document.uuid !== newTarget.document.uuid) {
            await cleanupTargetEffects(currentTargetToken, weaponId);
        }

        const targetEffect = await partnerWithTarget(
            newTarget,
            token,
            weapon,
            currentTargetToken ?? token,
            weaponId,
        );
        if (targetEffect) {
            await effect.setFlag(MODULE_ID, "targetUuid", newTarget.document.uuid);
            await ChatMessage.create({
                content: `<strong>Dancing Blade</strong> is now partnering with ${newTarget.name}.`,
                speaker: ChatMessage.getSpeaker({ token: token.document }),
            });
        }
    } else {
        await handleBladeAction(token, currentTargetToken!, weapon, {
            castRank,
            isAmped,
            isInitialCast: false,
            choice,
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
 * Centralizes the resolution of a blade action (Strike, Guard, Push).
 */
async function handleBladeAction(
    caster: TokenPF2e,
    target: TokenPF2e,
    weapon: WeaponPF2e,
    context: {
        castRank: number;
        isAmped: boolean;
        isInitialCast: boolean;
        choice?: string;
        attackNumber?: number;
        damageType?: string;
        weaponId: string;
    },
): Promise<boolean> {
    const { castRank, isAmped, isInitialCast, weaponId } = context;
    let choice = context.choice;
    let attackNumber = context.attackNumber ?? 1;
    let damageType = context.damageType;

    if (!choice) {
        const damageTypes = await getWeaponDamageTypes(weapon);
        const result = await promptForBladeAction(weapon.name, isAmped, isInitialCast, damageTypes);
        if (!result) return false;
        choice = result.choice;
        attackNumber = result.attackNumber;
        damageType = result.damageType;
    }

    switch (choice) {
        case "strike":
            await resolveDancingBladeStrike(
                caster,
                target,
                weapon,
                castRank,
                isAmped,
                attackNumber,
                damageType,
            );
            break;
        case "guard":
            await applyDancingBladeGuard(caster, target, weapon, weaponId);
            break;
        case "push": {
            const spell = getDancingBladeSpell(caster.actor!);
            if (spell) await resolveDancingBladePush(caster, target, weapon, spell, attackNumber);
            break;
        }
    }

    return true;
}

/**
 * Sets up a new partner for the Dancing Blade, including visuals and tracking effects.
 */
async function partnerWithTarget(
    target: TokenPF2e,
    caster: TokenPF2e,
    weapon: WeaponPF2e,
    previousLocationToken: TokenPF2e,
    weaponId: string,
): Promise<EffectPF2e | undefined> {
    const targetEffect = await applyTargetEffect(target, caster, weapon.img, weaponId);
    if (targetEffect) {
        startDancingBladePersistentAnimation(
            target,
            targetEffect,
            weapon,
            previousLocationToken,
            weaponId,
        );
    }
    return targetEffect;
}

/**
 * Removes Dancing Blade related effects from a token.
 */
async function cleanupTargetEffects(target: TokenPF2e, weaponId?: string) {
    const targetActor = target.actor;
    if (!targetActor) return;

    const targetSlugs = weaponId
        ? [
            `target-dancing-blade-${weaponSlugId(weaponId)}`,
            `dancing-blade-guard-${weaponSlugId(weaponId)}`,
        ]
        : ["target-dancing-blade", "dancing-blade-guard"];

    const oldEffects = targetActor.itemTypes.effect.filter((e) => targetSlugs.includes(e.slug!));
    for (const e of oldEffects) await e.delete();
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

    const spell = getDancingBladeSpell(actor);
    const statistic = spell?.spellcasting?.statistic;
    if (!statistic) {
        ui.notifications.error("Could not find spellcasting statistic for Dancing Blade.");
        return;
    }

    await playDancingBladeAttackAnimation(target, "strike");

    const materialType = weapon.system.material?.type;
    const strikeTraits = ["attack"];
    if (materialType) strikeTraits.push(materialType);

    const weaponOptions = weapon.getRollOptions("item");
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
    if (materialType) extraRollOptions.push(`item:material:${materialType}`);

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
 */
export async function applyDancingBladeGuard(
    caster: TokenPF2e,
    target: TokenPF2e,
    weapon: WeaponPF2e,
    weaponId: string,
) {
    await playDancingBladeGuardAnimation(target);

    const guardEffectSource = createGuardEffect(caster, weapon.img, weaponId);
    await addOrUpdateEffectOnActor(target.actor!, guardEffectSource);
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
    const numDice = 3 + Math.floor((castRank - 5) / 2);
    const dieSize = isAmped ? "d10" : "d6";
    const formula = isCritical ? `(${numDice}${dieSize} * 2)` : `${numDice}${dieSize}`;

    const damageTypes = [dmgType];
    if (materialType) damageTypes.push(materialType);
    const damageRollFormula = `{${formula}[${damageTypes}]}`;

    const DamageRoll = CONFIG.Dice.rolls.find((r) => r.name === "DamageRoll") as typeof Roll;
    const damageRoll = await new DamageRoll(damageRollFormula).evaluate();

    const damageOptions = Array.from(
        new Set([...rollOptions, ...weaponOptions, "melee", "melee-attack-roll"]),
    );
    if (materialType) damageOptions.push(`item:material:${materialType}`);

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

/** Ends the persistent floating-blade Sequencer animation for a given weapon. */
function endBladeAnimation(weaponId: string) {
    Sequencer.EffectManager.endEffects({ name: `dancing-blade-${weaponId}` });
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
 * Resolves a token document UUID to its live Token object on the canvas.
 * Returns null if the UUID is invalid or the token is not on the active scene.
 */
export function getTokenFromUuid(uuid: string | null): TokenPF2e | null {
    if (!uuid) return null;
    const doc = fromUuidSync(uuid);
    if (doc instanceof foundry.documents.BaseToken) {
        return (doc as unknown as { object: TokenPF2e }).object;
    }
    return null;
}

/**
 * Creates the "Dancing Blade Guard" effect source that grants +2 circumstance AC vs melee.
 * The effect expires at the start of the caster's next turn.
 */
function createGuardEffect(caster: TokenPF2e, icon: string, weaponId: string): EffectSource {
    const spell = caster.actor ? getDancingBladeSpell(caster.actor) : undefined;
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

    if (weapon.system.damage.damageType) {
        types.add(weapon.system.damage.damageType);
    }

    for (const trait of weapon.system.traits.value) {
        if (trait.startsWith("versatile-")) {
            const vType = trait.replace("versatile-", "");
            types.add(SHORTHAND_DAMAGE_TYPES[vType] ?? vType);
        }
    }

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
                        if (dType in CONFIG.PF2E.damageTypes) types.add(dType);
                    }
                }
            }
        }
    } catch (e) {
        console.error("Dancing Blade: Error extracting damage types", e);
    }

    const pf2eDamageTypes = CONFIG.PF2E.damageTypes;
    return [...types].filter((t) => typeof t === "string" && t.length > 0 && t in pf2eDamageTypes);
}

/**
 * Applies the partner tracking effect to the spell's current target.
 */
async function applyTargetEffect(
    target: TokenPF2e,
    caster: TokenPF2e,
    icon: string,
    weaponId: string,
): Promise<EffectPF2e | undefined> {
    const targetActor = target.actor;
    if (!targetActor) return;

    const effectSource = {
        type: "effect",
        name: "Target: Dancing Blade",
        img: icon as ImageFilePath,
        system: {
            slug: `target-dancing-blade-${weaponSlugId(weaponId)}`,
            tokenIcon: { show: true },
            duration: { value: 0, unit: "unlimited", expiry: null },
        },
        flags: { [MODULE_ID]: { casterUuid: caster.document.uuid, weaponId } },
    } as DeepPartial<EffectSource> as EffectSource;

    return await addOrUpdateEffectOnActor(targetActor, effectSource);
}
