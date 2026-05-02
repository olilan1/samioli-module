import type { 
    ActorPF2e, 
    ChatMessagePF2e, 
    EffectPF2e, 
    TokenPF2e, 
    WeaponPF2e, 
    EffectSource,
    TokenDocumentPF2e,
} from "foundry-pf2e";
import { addOrUpdateEffectOnActor, getCollidableCallbacks, getTokensAtLocation } from "../utils.ts";
import type { Point } from "foundry-pf2e/foundry/common/_types.mjs";
import type { ImageFilePath } from "foundry-pf2e/foundry/common/constants.mjs";

const { DialogV2 } = foundry.applications.api;

const SHORTHAND_DAMAGE_TYPES: Record<string, string> = {
    "b": "bludgeoning",
    "p": "piercing",
    "s": "slashing"
};

// --- Entry Points ---

/**
 * Handles the initial casting of the Dancing Blade spell.
 */
export async function startDancingBlade(token: TokenPF2e, message: ChatMessagePF2e) {
    const actor = token.actor;
    if (!actor) return;

    const weapons = actor.itemTypes.weapon;
    if (weapons.length === 0) {
        ui.notifications.warn("You have no weapons to use with Dancing Blade.");
        return;
    }

    const castRank = message.flags.pf2e.origin?.castRank ?? 5;
    const rollOptions = message.flags?.pf2e?.origin?.rollOptions;
    const isAmped = !!(rollOptions?.includes("origin:item:tag:amped"));

    const weaponId = await promptForWeapon(weapons);
    if (!weaponId) return;

    const weapon = actor.items.get(weaponId) as WeaponPF2e;
    if (!weapon) return;

    const spell = actor.itemTypes.spell.find(s => s.slug === "dancing-blade");
    const rangeValue = spell?.system.range.value ?? "30";
    const range = parseInt(rangeValue.replace(/[^0-9]/g, "")) || 30;

    const target = await promptForTarget(token, range);
    if (!target) return;

    // Apply partner effect and start persistent animation BEFORE the strike
    const targetEffect = await applyTargetEffect(target, token, weapon.img);
    if (targetEffect) {
        startDancingBladePersistentAnimation(target, targetEffect);
    }

    await resolveDancingBladeStrike(token, target, weapon, castRank, isAmped);

    const sustainEffect = actor.itemTypes.effect.find(
        e => e.slug === "sustaining-effect-dancing-blade"
    );
    if (sustainEffect) {
        await sustainEffect.update({
            "flags.samioli-module": {
                dancingWeaponId: weapon.id,
                castRank,
                isAmped,
                targetUuid: target.document.uuid
            }
        });
    }
}

/**
 * Handles the sustain action for Dancing Blade.
 */
export async function sustainDancingBlade(effect: EffectPF2e) {
    const actor = effect.actor;
    if (!actor) return;

    const token = actor.getActiveTokens()[0];
    if (!token) return;

    const weaponId = effect.getFlag("samioli-module", "dancingWeaponId") as string;
    const castRank = effect.getFlag("samioli-module", "castRank") as number;
    const isAmped = effect.getFlag("samioli-module", "isAmped") as boolean;
    const targetUuid = effect.getFlag("samioli-module", "targetUuid") as string;

    const weapon = actor.items.get(weaponId) as WeaponPF2e;
    if (!weapon) {
        ui.notifications.warn("The original dancing weapon was not found.");
        return;
    }

    const choice = await promptForSustainAction(weapon.name);
    if (!choice) return;

    if (choice === "strike") {
        const targetDoc = fromUuidSync(targetUuid);
        const targetToken = (targetDoc instanceof foundry.documents.BaseToken 
            ? (targetDoc as TokenDocumentPF2e).object : null) as TokenPF2e | null;

        if (!targetToken) {
            ui.notifications.warn("The target is no longer on the board.");
            return;
        }
        await resolveDancingBladeStrike(token, targetToken, weapon, castRank, isAmped);
    } else if (choice === "partner") {
        const spell = actor.itemTypes.spell.find(s => s.slug === "dancing-blade");
        const rangeValue = spell?.system.range.value ?? "30";
        const range = parseInt(rangeValue.replace(/[^0-9]/g, "")) || 30;

        const newTarget = await promptForTarget(token, range);
        if (!newTarget) return;

        const oldTargetDoc = fromUuidSync(targetUuid);
        const oldTargetActor = (oldTargetDoc instanceof foundry.documents.BaseToken 
            ? (oldTargetDoc as TokenDocumentPF2e).actor : null) as ActorPF2e | null;

        if (oldTargetActor && oldTargetDoc?.uuid !== newTarget.document.uuid) {
            const oldEffect = oldTargetActor.itemTypes.effect.find(
                e => e.slug === "target-dancing-blade"
            );
            await oldEffect?.delete();
        }

        const targetEffect = await applyTargetEffect(newTarget, token, weapon.img);
        if (targetEffect) {
            startDancingBladePersistentAnimation(newTarget, targetEffect);
        }

        await effect.setFlag("samioli-module", "targetUuid", newTarget.document.uuid);
        ui.notifications.info(`Dancing Blade is now partnering with ${newTarget.name}.`);
    }
}

// --- Strike Logic ---

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

    const spell = actor.itemTypes.spell.find(s => s.slug === "dancing-blade");
    const statistic = spell?.spellcasting?.statistic;
    if (!statistic) {
        ui.notifications.error("Could not find spellcasting statistic for Dancing Blade.");
        return;
    }

    // Trigger strike animation (handles hiding persistent anim)
    await playDancingBladeStrikeAnimation(caster, target);

    await statistic.roll({
        target: target.actor ?? null,
        title: `Dancing Blade Attack - ${weapon.name}`,
        item: spell ?? null,
        extraRollOptions: [
            "samioli-module:dancing-blade-attack",
            `samioli-module:cast-rank:${castRank}`,
            `samioli-module:is-amped:${isAmped}`,
            `samioli-module:damage-type:${selectedDamageType}`,
            `samioli-module:weapon-id:${weapon.id}`,
            `samioli-module:weapon-name:${weapon.name}`
        ]
    });
}

/**
 * Rolls damage for Dancing Blade when triggered by the chat card buttons.
 */
export async function rollDancingBladeDamage(message: ChatMessagePF2e, isCritical: boolean) {
    const rollOptions = message.flags.pf2e.context?.options ?? [];
    const getOption = (p: string) => rollOptions.find(o => o.startsWith(p))?.split(":")[2];

    const castRankStr = getOption("samioli-module:cast-rank:");
    const isAmpedStr = getOption("samioli-module:is-amped:");
    const dmgType = getOption("samioli-module:damage-type:");
    const weaponName = getOption("samioli-module:weapon-name:");
    
    const context = message.flags.pf2e.context;
    const targetUuid = (context && "target" in context) ? context.target?.token : null;

    if (!castRankStr || !dmgType || !targetUuid) {
        ui.notifications.error("Could not find Dancing Blade attack or target data.");
        return;
    }

    const castRank = parseInt(castRankStr);
    const isAmped = isAmpedStr === "true";
    const numDice = 3 + Math.floor((castRank - 5) / 2);
    const dieSize = isAmped ? "d10" : "d6";
    const formula = isCritical ? `(${numDice}${dieSize} * 2)` : `${numDice}${dieSize}`;
    const damageRollFormula = `${formula}[${dmgType}]`;
    
    const DamageRoll = CONFIG.Dice.rolls.find((r) => r.name === "DamageRoll") as typeof Roll;
    const damageRoll = await new DamageRoll(damageRollFormula).evaluate();
    
    await damageRoll.toMessage({
        speaker: ChatMessage.getSpeaker({ token: message.token }),
        flavor: `<h4>Dancing Blade ${isCritical ? "Critical " : ""}Damage (${weaponName})</h4>`,
        flags: {
            pf2e: {
                context: {
                    type: "damage-roll",
                    sourceType: "spell",
                    target: (context && "target" in context) ? context.target : null,
                    options: []
                }
            },
            "pf2e-toolbelt": { targetHelper: { targets: [targetUuid] } }
        }
    });
}

/**
 * Adds Damage and Critical buttons to the attack roll card.
 */
export function addDancingBladeDamageButtons(message: ChatMessagePF2e, html: JQuery<HTMLElement>) {
    const context = message.flags.pf2e.context;
    if (context?.type !== "attack-roll") return;
    
    const isDancingBlade = context.options?.includes("samioli-module:dancing-blade-attack");
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

    const buttonContainer = $('<div class="card-buttons flexrow" style="gap: 5px; margin-top: 4px;" />');
    buttonContainer.append(damageButton, criticalButton);

    const footer = html.find("footer");
    if (footer.length > 0) {
        footer.before(buttonContainer);
    } else {
        html.append(buttonContainer);
    }
}

// --- Data Helpers ---

/**
 * Dynamically retrieves all available damage types for the weapon by parsing its strike formula.
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
 * Applies or updates the tracking effect on the spell's current partner.
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
        flags: { "samioli-module": { casterUuid: caster.document.uuid } }
    } as DeepPartial<EffectSource> as EffectSource;

    const result = await addOrUpdateEffectOnActor(targetActor, effectSource);
    return result || undefined;
}

// --- Animation Helpers ---

const PERSISTENT_ANIM = "jb2a.spiritual_weapon.sword.spectral.blue";
const STRIKE_ANIM = "jb2a.impact.003.blue";

/**
 * Starts the persistent floating weapon animation tied to the target's effect.
 */
async function startDancingBladePersistentAnimation(target: TokenPF2e, effect: EffectPF2e) {
    const casterUuid = effect.getFlag("samioli-module", "casterUuid") as string;
    const casterDoc = fromUuidSync(casterUuid);
    const casterActor = (casterDoc instanceof foundry.documents.BaseToken ? casterDoc.actor : null);
    const casterId = casterActor?.id;
    if (!casterId) return;

    new Sequence()
        .effect()
            .file(PERSISTENT_ANIM)
            .attachTo(target)
            .name(`dancing-blade-${casterId}`)
            .persist()
            .scale(0.5)
            .spriteOffset({ x: 0.6, y: -0.6 }, { gridUnits: true })
            .tieToDocuments(effect)
        .play();
}

/**
 * Plays a quick impact animation over the target.
 */
async function playDancingBladeStrikeAnimation(_caster: TokenPF2e, target: TokenPF2e) {
    new Sequence()
        .effect()
            .file(STRIKE_ANIM)
            .atLocation(target)
            .spriteOffset({ x: 0.3, y: -0.3 }, { gridUnits: true })
            .scale(0.5)
        .play();
}

// --- UI Helpers ---

async function promptForWeapon(weapons: WeaponPF2e[]): Promise<string | undefined> {
    return await DialogV2.wait({
        window: { title: "Select Dancing Weapon" },
        content: `
            <form>
                <div class="form-group">
                    <label>Weapon:</label>
                    <select name="weaponSelect">
                        ${weapons.map(w => `<option value="${w.id}">${w.name}</option>`).join("")}
                    </select>
                </div>
            </form>
        `,
        buttons: [{
            action: "select",
            label: "Dance!",
            default: true,
            callback: (_e, _b, dialog) => 
                (dialog as foundry.applications.api.DialogV2).element.querySelector<HTMLSelectElement>("select")?.value
        }],
        rejectClose: false
    }) as string | undefined;
}

async function promptForTarget(token: TokenPF2e, range: number): Promise<TokenPF2e | undefined> {
    let target: TokenPF2e | undefined;
    while (!target) {
        const selectedLocation = await startCrosshairsTargetSelection(token, range) as Point;
        if (!selectedLocation) return undefined; // Cancelled

        const targetTokens = getTokensAtLocation(selectedLocation);
        if (targetTokens.length === 1) {
            target = targetTokens[0];
        } else if (targetTokens.length > 1) {
            ui.notifications.warn("Multiple tokens found at this location. Please click a specific target.");
        } else {
            ui.notifications.warn("No target found here. Please click an enemy.");
        }
    }
    return target;
}

async function promptForDamageType(damageTypes: string[]): Promise<string | undefined> {
    return await DialogV2.wait({
        window: { title: "Select Damage Type" },
        content: `
            <form>
                <div class="form-group">
                    <label>Damage Type:</label>
                    <select name="typeSelect">
                        ${damageTypes.map(t => {
                            const pf2eConfig = CONFIG.PF2E;
                            const label = game.i18n.localize(pf2eConfig.damageTypes[t as keyof typeof pf2eConfig.damageTypes] ?? t);
                            return `<option value="${t}">${label}</option>`;
                        }).join("")}
                    </select>
                </div>
            </form>
        `,
        buttons: [{
            action: "select",
            label: "Strike!",
            default: true,
            callback: (_e, _b, dialog) => 
                (dialog as foundry.applications.api.DialogV2).element.querySelector<HTMLSelectElement>("select")?.value
        }],
        rejectClose: false
    }) as string | undefined;
}

async function promptForSustainAction(weaponName: string): Promise<string | undefined> {
    return await DialogV2.wait({
        window: { title: "Sustain Dancing Blade" },
        content: `<p>What do you want to do with your <b>Dancing ${weaponName}</b>?</p>`,
        buttons: [
            { action: "strike", label: "Strike", icon: "fa-solid fa-swords" },
            { action: "partner", label: "Change Partner", icon: "fa-solid fa-people-arrows" }
        ],
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
