import type { 
    ActorPF2e, 
    ChatMessagePF2e, 
    EffectPF2e, 
    TokenPF2e, 
    WeaponPF2e, 
    EffectSource,
    SpellPF2e,
} from "foundry-pf2e";
import { 
    addOrUpdateEffectOnActor, 
    getCollidableCallbacks, 
    getTokensAtLocation, 
    MODULE_ID 
} from "../utils.ts";
import { sendDamageRollToChat, DAMAGE_TAG_CONFIG } from "../damagehelper.ts";
import type { Point } from "foundry-pf2e/foundry/common/_types.mjs";
import type { ImageFilePath } from "foundry-pf2e/foundry/common/constants.mjs";

const { DialogV2 } = foundry.applications.api;

const STRIKE_ANIM = "jb2a.impact.003.blue";
const PUSH_ANIM = "jb2a.impact.010.orange";
const CAST_SOUND =  "modules/samioli-module/sounds/GDM/Gamemaster Audio - Pro Sound Collection/spell_harness_magic_01.m4a";
const TRANSIT_SOUND =  "modules/samioli-module/sounds/GDM/Medieval Fantasy SFX Pack/Spell - Air 2.m4a";
const STRIKE_SOUND = "modules/samioli-module/sounds/GDM/Medieval Fantasy SFX Pack/Axe 3.m4a";
const PUSH_SOUND = "modules/samioli-module/sounds/GDM/Medieval Fantasy SFX Pack/Hammer 2.m4a";
const GUARD_SOUND = "modules/samioli-module/sounds/GDM/Gamemaster Audio - Pro Sound Collection/unsheathe_sword_with_ringout.m4a";

const SHORTHAND_DAMAGE_TYPES: Record<string, string> = {
    "b": "bludgeoning",
    "p": "piercing",
    "s": "slashing"
};

/**
 * Tracking data stored on the sustain effect for Dancing Blade.
 */
interface DancingBladeFlags {
    dancingWeaponId: string;
    castRank: number;
    isAmped: boolean;
    targetUuid: string;
    skipSustainChat: boolean;
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
    if (!weaponId) return;

    const weapon = actor.items.get(weaponId) as WeaponPF2e;
    if (!weapon) return;

    // 2. Metadata Assessment
    const castRank = message.flags.pf2e.origin?.castRank ?? 5;
    const rollOptions = message.flags?.pf2e?.origin?.rollOptions;
    const isAmped = !!(rollOptions?.includes("origin:item:tag:amped"));

    // 3. Initial Animation near Caster
    const casterId = actor.id;
    const effectName = `dancing-blade-${casterId}`;
    playBladeAnimationSequence({
        animFile: getPersistentAnimation(weapon),
        effectName,
        target: token
    });

    // 4. Targeting
    const range = getDancingBladeRange(actor);
    const target = await promptForTarget(token, range);
    if (!target) {
        Sequencer.EffectManager.endEffects({ name: `dancing-blade-${casterId}` });
        return;
    }

    // 5. Setup Partnership
    const targetEffect = await partnerWithTarget(target, token, weapon, token);
    if (!targetEffect) {
        Sequencer.EffectManager.endEffects({ name: `dancing-blade-${casterId}` });
        return;
    }

    // 6. Initial Action
    await handleBladeAction(token, target, weapon, {
        castRank,
        isAmped,
        isInitialCast: true
    });

    // 6. Setup Sustain Tracking
    const sustainEffect = actor.itemTypes.effect.find(
        e => e.slug === "sustaining-effect-dancing-blade"
    );
    if (sustainEffect) {
        const flags: DancingBladeFlags = {
            dancingWeaponId: weapon.id,
            castRank,
            isAmped,
            targetUuid: target.document.uuid,
            skipSustainChat: true
        };
        await sustainEffect.update({ [`flags.${MODULE_ID}`]: flags });
    }
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

    if (!flags?.dancingWeaponId) {
        ui.notifications.error("Could not find Dancing Blade tracking data on the effect.");
        return;
    }

    const { dancingWeaponId, castRank, isAmped, targetUuid } = flags;
    const weapon = actor.items.get(dancingWeaponId) as WeaponPF2e;
    if (!weapon) {
        ui.notifications.warn("The original dancing weapon was not found.");
        return;
    }

    const choice = await promptForBladeAction(weapon.name, isAmped, false);
    if (!choice) return;

    const currentTargetToken = getTokenFromUuid(targetUuid);

    if (choice === "partner") {
        const range = getDancingBladeRange(actor);
        const newTarget = await promptForTarget(token, range);
        if (!newTarget) return;

        // Cleanup old target
        if (currentTargetToken && currentTargetToken.document.uuid !== newTarget.document.uuid) {
            await cleanupTargetEffects(currentTargetToken);
        }

        const targetEffect = await partnerWithTarget(newTarget, token, weapon, currentTargetToken ?? token);
        if (targetEffect) {
            await effect.setFlag(MODULE_ID, "targetUuid", newTarget.document.uuid);
            await ChatMessage.create({
                content: `<strong>Dancing Blade</strong> is now partnering with ${newTarget.name}.`,
                speaker: ChatMessage.getSpeaker({ token: token.document })
            });
        }
    } else {
        if (!currentTargetToken) {
            ui.notifications.warn("The target is no longer on the board.");
            return;
        }
        await handleBladeAction(token, currentTargetToken, weapon, {
            castRank,
            isAmped,
            isInitialCast: false,
            choice
        });
    }
}

// --- Logic Helpers ---

/**
 * Safely retrieves and types the Dancing Blade flags from an effect.
 */
function getDancingBladeFlags(effect: EffectPF2e): DancingBladeFlags | null {
    const dancingWeaponId = effect.getFlag(MODULE_ID, "dancingWeaponId") as string | undefined;
    const castRank = effect.getFlag(MODULE_ID, "castRank") as number | undefined;
    const isAmped = effect.getFlag(MODULE_ID, "isAmped") as boolean | undefined;
    const targetUuid = effect.getFlag(MODULE_ID, "targetUuid") as string | undefined;
    const skipSustainChat = effect.getFlag(MODULE_ID, "skipSustainChat") as boolean | undefined;

    if (!dancingWeaponId || castRank === undefined || isAmped === undefined || !targetUuid) {
        return null;
    }

    return {
        dancingWeaponId,
        castRank,
        isAmped,
        targetUuid,
        skipSustainChat: skipSustainChat ?? false
    };
}

/**
 * Centralizes the resolution of a blade action (Strike, Guard, Push).
 */
async function handleBladeAction(
    caster: TokenPF2e, 
    target: TokenPF2e, 
    weapon: WeaponPF2e,
    context: { castRank: number, isAmped: boolean, isInitialCast: boolean, choice?: string }
) {
    const { castRank, isAmped, isInitialCast } = context;
    let choice = context.choice;

    if (!choice) {
        choice = await promptForBladeAction(weapon.name, isAmped, isInitialCast);
    }
    if (!choice) return;

    switch (choice) {
        case "strike":
            await resolveDancingBladeStrike(caster, target, weapon, castRank, isAmped);
            break;
        case "guard":
            await applyDancingBladeGuard(caster, target, weapon);
            break;
        case "push": {
            const spell = getDancingBladeSpell(caster.actor!);
            if (spell) await resolveDancingBladePush(caster, target, weapon, spell);
            break;
        }
    }
}

/**
 * Sets up a new partner for the Dancing Blade, including visuals and tracking effects.
 */
async function partnerWithTarget(
    target: TokenPF2e, 
    caster: TokenPF2e, 
    weapon: WeaponPF2e,
    previousLocationToken: TokenPF2e
): Promise<EffectPF2e | undefined> {
    const targetEffect = await applyTargetEffect(target, caster, weapon.img);
    if (targetEffect) {
        startDancingBladePersistentAnimation(target, targetEffect, weapon, previousLocationToken);
    }
    return targetEffect;
}

/**
 * Removes Dancing Blade related effects from a token.
 */
async function cleanupTargetEffects(target: TokenPF2e) {
    const targetActor = target.actor;
    if (!targetActor) return;

    const oldEffects = targetActor.itemTypes.effect.filter(
        e => ["target-dancing-blade", "dancing-blade-guard"].includes(e.slug!)
    );
    for (const e of oldEffects) await e.delete();
}

/**
 * Generic cleanup function for Dancing Blade sustain effect deletion.
 * Registered in SUSTAIN_DELETION_MAPPINGS.
 */
export async function cleanupDancingBlade(effect: EffectPF2e) {
    const targetUuid = effect.getFlag(MODULE_ID, "targetUuid") as string | undefined;
    if (!targetUuid) return;

    const targetDoc = fromUuidSync(targetUuid);
    const targetToken = targetDoc instanceof foundry.documents.BaseToken 
        ? targetDoc.object as TokenPF2e : null;
    
    if (targetToken) {
        await cleanupTargetEffects(targetToken);
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
    isAmped: boolean
) {
    const actor = caster.actor;
    if (!actor) return;

    const damageTypes = await getWeaponDamageTypes(weapon);
    let selectedDamageType = damageTypes[0];

    if (damageTypes.length > 1) {
        selectedDamageType = (await promptForDamageType(damageTypes)) ?? "";
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
    const extraRollOptions = Array.from(new Set([
        ...weaponOptions,
        `${MODULE_ID}:dancing-blade-attack`,
        `${MODULE_ID}:cast-rank:${castRank}`,
        `${MODULE_ID}:is-amped:${isAmped}`,
        `${MODULE_ID}:damage-type:${selectedDamageType}`,
        `${MODULE_ID}:weapon-id:${weapon.id}`,
        `${MODULE_ID}:weapon-name:${weapon.name}`,
        "melee",
        "melee-attack-roll"
    ]));
    if (materialType) extraRollOptions.push(`item:material:${materialType}`);

    await statistic.roll({
        target: target.actor ?? null,
        title: `Dancing Blade Strike: ${weapon.name}`,
        item: spell ?? null,
        domains: ["melee-attack-roll"],
        traits: strikeTraits,
        extraRollOptions
    });
}

/**
 * Applies the Guard amped effect to a target.
 */
export async function applyDancingBladeGuard(
    caster: TokenPF2e, 
    target: TokenPF2e, 
    weapon: WeaponPF2e
) {
    await playDancingBladeGuardAnimation(target);

    const guardEffectSource = createGuardEffect(caster, weapon.img);
    await addOrUpdateEffectOnActor(target.actor!, guardEffectSource);
    await ChatMessage.create({
        content: `<strong>Dancing Blade</strong> is now guarding ${target.name}.`,
        speaker: ChatMessage.getSpeaker({ token: caster.document })
    });
}

/**
 * Resolves a Push amped action for Dancing Blade.
 */
export async function resolveDancingBladePush(
    _caster: TokenPF2e, 
    target: TokenPF2e, 
    weapon: WeaponPF2e, 
    spell: SpellPF2e
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
        extraRollOptions: [
            `${MODULE_ID}:dancing-blade-push`,
            "action:push"
        ]
    });
}

/**
 * Rolls damage for Dancing Blade when triggered by chat card buttons.
 */
export async function rollDancingBladeDamage(message: ChatMessagePF2e, isCritical: boolean) {
    const rollOptions = message.flags.pf2e.context?.options ?? [];
    const getOption = (p: string) => rollOptions.find(o => o.startsWith(p))?.split(":")[2];

    const castRankStr = getOption(`${MODULE_ID}:cast-rank:`);
    const isAmpedStr = getOption(`${MODULE_ID}:is-amped:`);
    const dmgType = getOption(`${MODULE_ID}:damage-type:`);
    const weaponId = getOption(`${MODULE_ID}:weapon-id:`);
    const weaponName = getOption(`${MODULE_ID}:weapon-name:`);
    
    const context = message.flags.pf2e.context;
    const targetUuid = (context && "target" in context) ? context.target?.token : null;

    if (!castRankStr || !dmgType || !targetUuid || !weaponId) {
        ui.notifications.error("Could find Dancing Blade attack or target data.");
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
    
    const damageOptions = Array.from(new Set([
        ...rollOptions, 
        ...weaponOptions, 
        "melee", 
        "melee-attack-roll"
    ]));
    if (materialType) damageOptions.push(`item:material:${materialType}`);

    const traitsToInclude: string[] = [];
    if (weapon) {
        for (const [key, config] of Object.entries(DAMAGE_TAG_CONFIG)) {
            if (config.group !== 'trait') continue;
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
        rollOptions: damageOptions
    });
}

/**
 * Injects Damage and Critical buttons into the attack roll card footer.
 */
export function addDancingBladeDamageButtons(message: ChatMessagePF2e, html: JQuery<HTMLElement>) {
    const context = message.flags.pf2e.context;
    if (context?.type !== "attack-roll") return;
    
    const isDancingBlade = context.options?.includes(`${MODULE_ID}:dancing-blade-attack`);
    if (!isDancingBlade) return;

    const damageButton = $('<button type="button" data-action="damage">Damage</button>');
    const criticalButton = $('<button type="button" data-action="critical">Critical</button>');

    damageButton.on("click", (e) => { 
        e.stopPropagation(); 
        rollDancingBladeDamage(message, false); 
    });
    criticalButton.on("click", (e) => { 
        e.stopPropagation(); 
        rollDancingBladeDamage(message, true); 
    });

    const buttonContainer = $(`
        <div class="card-buttons flexrow" style="gap: 5px; margin-top: 4px;" />
    `);
    buttonContainer.append(damageButton, criticalButton);

    const footer = html.find("footer");
    if (footer.length > 0) {
        footer.before(buttonContainer);
    } else {
        html.append(buttonContainer);
    }
}

// --- Data Helpers ---

function getDancingBladeSpell(actor: ActorPF2e): SpellPF2e | undefined {
    return actor.itemTypes.spell.find(s => s.slug === "dancing-blade");
}

function getDancingBladeRange(actor: ActorPF2e): number {
    const spell = getDancingBladeSpell(actor);
    const rangeValue = spell?.system.range.value ?? "30";
    return parseInt(rangeValue.replace(/[^0-9]/g, "")) || 30;
}

function getTokenFromUuid(uuid: string | null): TokenPF2e | null {
    if (!uuid) return null;
    const doc = fromUuidSync(uuid);
    if (doc instanceof foundry.documents.BaseToken) {
        return (doc as any).object as TokenPF2e;
    }
    return null;
}

function createGuardEffect(caster: TokenPF2e, icon: string): EffectSource {
    const spell = caster.actor ? getDancingBladeSpell(caster.actor) : undefined;
    return {
        type: "effect",
        name: "Dancing Blade Guard",
        img: icon as ImageFilePath,
        system: {
            slug: "dancing-blade-guard",
            tokenIcon: { show: true },
            duration: { value: 1, unit: "rounds", expiry: "turn-start" },
            context: {
                origin: {
                    actor: caster.actor?.uuid,
                    item: spell?.uuid,
                    token: caster.document.uuid
                }
            },
            rules: [
                {
                    key: "FlatModifier",
                    selector: "ac",
                    value: 2,
                    type: "circumstance",
                    predicate: ["melee"]
                }
            ]
        }
    } as DeepPartial<EffectSource> as EffectSource;
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
            const strike = actor.system.actions?.find(a => a.item?.id === weapon.id);
            
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
    return [...types].filter(t => typeof t === "string" && t.length > 0 && t in pf2eDamageTypes);
}

/**
 * Applies the partner tracking effect to the spell's current target.
 */
async function applyTargetEffect(
    target: TokenPF2e, 
    caster: TokenPF2e, 
    icon: string
): Promise<EffectPF2e | undefined> {
    const targetActor = target.actor;
    if (!targetActor) return;

    const effectSource = {
        _id: "",
        type: "effect",
        name: "Target: Dancing Blade",
        img: icon as ImageFilePath,
        system: {
            slug: "target-dancing-blade",
            tokenIcon: { show: true },
            duration: { value: 0, unit: "unlimited", expiry: null }
        },
        flags: { [MODULE_ID]: { casterUuid: caster.document.uuid } }
    } as DeepPartial<EffectSource> as EffectSource;

    const result = await addOrUpdateEffectOnActor(targetActor, effectSource);
    return result || undefined;
}

// --- Animation Helpers ---

/**
 * Returns the most appropriate spiritual weapon animation for the given weapon.
 * Supports 1H/2H variants and specific overrides like Javelins or Picks.
 */
function getPersistentAnimation(weapon: WeaponPF2e): string {
    const slug = weapon.slug ?? weapon.name.slugify();
    const group = weapon.group;
    const isTwoHanded = weapon.system.usage.value === "held-in-two-hands";

    if (slug.includes("scythe")) return "jb2a.spiritual_weapon.scythe.spectral.blue";
    if (slug.includes("maul")) return "jb2a.spiritual_weapon.maul.spectral.blue";
    if (slug.includes("mace")) return "jb2a.spiritual_weapon.mace.spectral.blue";
    if (slug.includes("katana")) return "jb2a.spiritual_weapon.katana.01.astral.01.blue";
    if (slug.includes("rapier")) return "jb2a.spiritual_weapon.rapier.01.astral.01.blue";
    if (slug.includes("scimitar")) return "jb2a.spiritual_weapon.scimitar.01.astral.01.blue";
    if (slug.includes("trident")) return "jb2a.spiritual_weapon.trident.01.astral.01.blue";
    if (slug.includes("glaive")) return "jb2a.spiritual_weapon.glaive.01.astral.01.blue";
    if (slug.includes("falchion")) return "jb2a.spiritual_weapon.falchion.01.astral.01.blue";
    if (slug.includes("staff")) return "jb2a.spiritual_weapon.quarterstaff.01.astral.01.blue";
    if (slug.includes("javelin")) return "jb2a.spiritual_weapon.javelin.01.astral.01.blue";

    switch (group) {
        case "pick": return "jb2a.spiritual_weapon.scythe.spectral.blue";
        case "axe": return isTwoHanded 
            ? "jb2a.spiritual_weapon.greataxe.01.astral.01.blue" 
            : "jb2a.spiritual_weapon.handaxe.01.astral.01.blue";
        case "club": return isTwoHanded 
            ? "jb2a.spiritual_weapon.greatclub.01.astral.01.blue" 
            : "jb2a.spiritual_weapon.club.01.astral.01.blue";
        case "hammer": return isTwoHanded 
            ? "jb2a.spiritual_weapon.hammer.01.astral.01.blue" 
            : "jb2a.spiritual_weapon.warhammer.01.astral.01.blue";
        case "sword": return isTwoHanded 
            ? "jb2a.spiritual_weapon.greatsword.01.astral.01.blue" 
            : "jb2a.spiritual_weapon.sword.spectral.blue";
        case "knife": return "jb2a.spiritual_weapon.dagger.02.astral.01.blue";
        case "polearm": return "jb2a.spiritual_weapon.halberd.01.astral.01.blue";
        case "spear": return "jb2a.spiritual_weapon.spear.01.astral.01.blue";
        case "flail": return "jb2a.spiritual_weapon.mace.spectral.blue";
        default: return "jb2a.spiritual_weapon.sword.spectral.blue";
    }
}

/**
 * Shared logic for playing the Dancing Blade animation sequence.
 */
function playBladeAnimationSequence(config: {
    animFile: string,
    effectName: string,
    target: TokenPF2e,
    previousLocationToken?: TokenPF2e,
    tieToEffect?: EffectPF2e
}) {
    const { animFile, effectName, target, previousLocationToken, tieToEffect } = config;
    const seq = new Sequence();
    const gridOffset = { x: 0.6, y: -0.6 };
    const attachOffset = { offset: { x: 0.6, y: -0.6 }, gridUnits: true };

    // Cleanup existing effects with the same name
    Sequencer.EffectManager.endEffects({ name: effectName });

    // Handle transit if there's a different previous location
    const isTransiting = previousLocationToken && previousLocationToken.id !== target.id;
    if (isTransiting) {
        seq
        .sound()
            .file(TRANSIT_SOUND)
        .effect()
            .file(animFile)
            .atLocation({
                x: previousLocationToken.center.x + (gridOffset.x * canvas.grid.size),
                y: previousLocationToken.center.y + (gridOffset.y * canvas.grid.size)
            })
            .moveTowards({
                x: target.center.x + (gridOffset.x * canvas.grid.size),
                y: target.center.y + (gridOffset.y * canvas.grid.size)
            }, { ease: "easeInOutQuint" })
            .moveSpeed(600)
            .scale(0.5)
            .fadeOut(100)
            .waitUntilFinished(-100);
    }

    // Persistent floating blade
    const persistEffect = seq.effect()
        .file(animFile)
        .attachTo(target, attachOffset)
        .name(effectName)
        .persist()
        .scale(0.5)
        .fadeOut(500);

    if (tieToEffect) {
        persistEffect.tieToDocuments(tieToEffect);
    }

    if (isTransiting) {
        persistEffect.fadeIn(100);
    } else {
        // Initial cast
        persistEffect.fadeIn(500);
        seq.sound()
            .file(CAST_SOUND);
    }

    seq.play();
}

/**
 * Starts the persistent floating weapon animation tied to the target's effect.
 */
async function startDancingBladePersistentAnimation(
    target: TokenPF2e, 
    effect: EffectPF2e, 
    weapon: WeaponPF2e,
    previousLocationToken: TokenPF2e
) {
    const casterUuid = effect.getFlag(MODULE_ID, "casterUuid") as string;
    const casterToken = getTokenFromUuid(casterUuid);
    const casterId = casterToken?.actor?.id;
    if (!casterId) return;

    const effectName = `dancing-blade-${casterId}`;
    const animFile = getPersistentAnimation(weapon);

    playBladeAnimationSequence({
        animFile,
        effectName,
        target,
        previousLocationToken,
        tieToEffect: effect
    });
}

/**
 * Plays a quick impact animation over the target.
 */
async function playDancingBladeAttackAnimation(target: TokenPF2e, type: "strike" | "push") {
    new Sequence()
        .effect()
            .file(type == "strike" ? STRIKE_ANIM : PUSH_ANIM)
            .atLocation(target)
            .spriteOffset({ x: 0.3, y: -0.3 }, { gridUnits: true })
            .scale(0.5)
            .playbackRate(0.6)
        .sound()
            .file(type == "strike" ? STRIKE_SOUND : PUSH_SOUND)
        .play();
}

/**
 * Plays the guard animation over the target.
 */
async function playDancingBladeGuardAnimation(target: TokenPF2e) {
    new Sequence()
        .effect()
            .file("jb2a.icon.shield.blue")
            .atLocation(target)
            .scale(0.5)
            .scaleIn(0, 500, { ease: "easeOutBack" })
            .scaleOut(0, 500, { ease: "easeInBack" })
            .fadeIn(250)
            .fadeOut(250)
            .duration(1500)
        .sound()
            .file(GUARD_SOUND)
        .play();
}

// --- UI Helpers ---

async function promptForWeapon(weapons: WeaponPF2e[]): Promise<string | undefined> {
    return await DialogV2.wait({
        window: { title: "Select Dancing Weapon" },
        position: { width: 350 },
        content: `
            <form>
                <div class="form-group">
                    <label style="flex-grow: 0">Weapon:</label>
                    <select name="weaponSelect">
                        ${weapons.map(w => `<option value="${w.id}">${w.name}</option>`).join("")}
                    </select>
                </div>
            </form>
        `,
        buttons: [{
            action: "select",
            label: "Dance!",
            icon: "fa-solid fa-sparkles",
            default: true,
            callback: (_e, _b, dialog) => 
                (dialog as InstanceType<typeof DialogV2>).element.querySelector<HTMLSelectElement>(
                    "select"
                )?.value
        }],
        rejectClose: false
    }) as string | undefined;
}

async function promptForTarget(token: TokenPF2e, range: number): Promise<TokenPF2e | undefined> {
    let target: TokenPF2e | undefined;
    while (!target) {
        const selectedLocation = await startCrosshairsTargetSelection(token, range) as Point;
        if (!selectedLocation) return undefined;

        const targetTokens = getTokensAtLocation(selectedLocation);
        if (targetTokens.length === 1) {
            target = targetTokens[0];
        } else if (targetTokens.length > 1) {
            ui.notifications.warn("Multiple tokens found. Please click a specific target.");
        } else {
            ui.notifications.warn("No target found here. Please click an enemy.");
        }
    }
    return target;
}

async function promptForDamageType(damageTypes: string[]): Promise<string | undefined> {
    return await DialogV2.wait({
        window: { title: "Select Damage Type" },
        position: { width: 350 },
        content: `
            <form>
                <div class="form-group">
                    <label>Damage Type:</label>
                    <select name="typeSelect">
                        ${damageTypes.map(t => {
                            const pf2eConfig = CONFIG.PF2E;
                            const label = game.i18n.localize(
                                pf2eConfig.damageTypes[t as keyof typeof pf2eConfig.damageTypes] 
                                ?? t
                            );
                            return `<option value="${t}">${label}</option>`;
                        }).join("")}
                    </select>
                </div>
            </form>
        `,
        buttons: [{
            action: "select",
            label: "Strike!",
            icon: "fa-solid fa-sword",
            default: true,
            callback: (_e, _b, dialog) => 
                (dialog as InstanceType<typeof DialogV2>).element.querySelector<HTMLSelectElement>(
                    "select"
                )?.value
        }],
        rejectClose: false
    }) as string | undefined;
}

async function promptForBladeAction(
    weaponName: string, 
    isAmped: boolean, 
    isInitialCast: boolean
): Promise<string | undefined> {
    const buttons = [
        { action: "strike", label: "Strike", icon: "fa-solid fa-swords" }
    ];

    if (isAmped) {
        buttons.push(
            { action: "guard", label: "Guard", icon: "fa-solid fa-shield-halved" },
            { action: "push", label: "Push", icon: "fa-solid fa-hand-sparkles" }
        );
    }

    if (!isInitialCast) {
        buttons.push({ 
            action: "partner", 
            label: "Change Partner", 
            icon: "fa-solid fa-people-arrows" 
        });
    }

    const title = isInitialCast ? "Dancing Blade Action" : "Sustain Dancing Blade";

    return await DialogV2.wait({
        window: { title },
        content: `<p>What do you want to do with your <b>Dancing ${weaponName}</b>?</p>`,
        buttons,
        rejectClose: false
    }) as string | undefined;
}

async function startCrosshairsTargetSelection(token: TokenPF2e, range: number) {
    const labelText = `Select a target for Dancing Blade (${range} ft range)`;
    const iconTexture = "icons/svg/target.svg";
    const placementRestrictions = Sequencer.Crosshair.PLACEMENT_RESTRICTIONS;

    return await Sequencer.Crosshair.show({
        distance: 0,
        fillColor: "#000000ff",
        label: { text: labelText, dy: -100 },
        location: {
            obj: token,
            limitMaxRange: range,
            wallBehavior: placementRestrictions.NO_COLLIDABLES,
        },
        icon: { texture: iconTexture }, 
        snap: { position: CONST.GRID_SNAPPING_MODES.CENTER }
    }, getCollidableCallbacks("Dancing Blade", iconTexture));
}
