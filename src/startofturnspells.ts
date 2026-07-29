import { ActorPF2e, CombatantPF2e, EffectSource, ItemPF2e, MeasuredTemplateDocumentPF2e, RegionDocumentPF2e, SpellPF2e, SpellSource, TokenPF2e } from "foundry-pf2e";
import {
    addOrUpdateEffectOnActor,
    deleteItemFromActor,
    sendBasicChatMessage,
    MODULE_ID
} from "./utils.ts";
import { getTemplateTokens, replaceTargets } from "./templatetarget.ts";

export const START_OF_TURN_SPELLS = [
    'ash-cloud',
    'field-of-life',
    'sea-of-thought',
    'visions-of-danger',
    'flammable-fumes',
    'earthquake',
    'corrosive-muck',
    'frozen-fog',
    'control-sand',
    'rust-cloud',
    'petal-storm',
    'antlion-trap',
    'wall-of-fire',
    'wall-of-virtue'
];

export async function addEffectsToTokensInStartOfTurnTemplates(region: RegionDocumentPF2e) {
    const pf2eFlags = (region.flags.pf2e as Record<string, unknown> | undefined);
    const pf2eOrigin = pf2eFlags?.origin as Record<string, unknown> | undefined;
    const spellSlug = (pf2eOrigin?.slug ?? "") as string;
    const spellUuid = (pf2eOrigin?.uuid ?? "") as string;
    const uuidSlug = spellUuid ? spellUuid.split(".").pop()! : "";
    const isMatchingSpell = START_OF_TURN_SPELLS.includes(spellSlug)
        || START_OF_TURN_SPELLS.includes(uuidSlug);
    if (!isMatchingSpell) return;

    let spell = (spellUuid ? fromUuidSync(spellUuid) : null) as SpellPF2e | null;
    let isTransient = false;

    // for spells cast from item activations get the spell object from the message
    if (!spell) {
        const messageId = (region.flags.pf2e as Record<string, unknown> | undefined)?.messageId as string;
        if (messageId) {
            const message = game.messages.get(messageId);
            spell = message?.item as SpellPF2e;
            isTransient = true;
        }
    }

    if (!spell) return;

    await region.setFlag(MODULE_ID, "isStartOfTurnSpell", true);
    if (isTransient) {
        await region.setFlag(MODULE_ID, "spellSource", spell.toObject());
        await region.setFlag(MODULE_ID, "casterUuid", spell.actor?.uuid);
    }

    const tokensWithinRegion = await getTemplateTokens(region);

    for (const token of tokensWithinRegion) {
        await addWithinEffectToTokenActor(token, spell, region);
    }
}

async function addWithinEffectToTokenActor(
    token: TokenPF2e,
    spell: SpellPF2e,
    region: RegionDocumentPF2e
) {
    const effectSource = createWithinEffectSource(spell, region);
    await addOrUpdateEffectOnActor(token.actor, effectSource);
}

const inFlightTokenEnters = new Set<string>();

export async function handleStartOfTurnTokenEnter(
    token: TokenPF2e,
    region: RegionDocumentPF2e
) {
    const existingEffect = token.actor.items.find(
        item => item.type === "effect" &&
                item.flags?.[MODULE_ID]?.startOfTurnRegionId === region.id
    );
    if (existingEffect) return;

    const lockKey = `${token.id}-${region.id}`;
    if (inFlightTokenEnters.has(lockKey)) return;
    inFlightTokenEnters.add(lockKey);

    try {
        const pf2eFlags = (region.flags.pf2e as Record<string, unknown> | undefined);
        const origin = pf2eFlags?.origin as Record<string, unknown> | undefined;
        const spellSlug = (origin?.slug ?? "") as string;
        const spellUuid = (origin?.uuid ?? "") as string;

        if (
            !START_OF_TURN_SPELLS.includes(spellSlug) &&
            !START_OF_TURN_SPELLS.some(s => spellUuid.toLowerCase().includes(s))
        ) {
            return;
        }

        let spell = (spellUuid ? fromUuidSync(spellUuid) : null) as SpellPF2e | null;

        if (!spell) {
            const messageId = (region.flags.pf2e as Record<string, unknown> | undefined)?.messageId as string;
            if (messageId) {
                const message = game.messages.get(messageId);
                spell = message?.item as SpellPF2e;
            }
        }

        if (spell) {
            await addWithinEffectToTokenActor(token, spell, region);
        }
    } finally {
        inFlightTokenEnters.delete(lockKey);
    }
}

const inFlightTokenExits = new Set<string>();

export async function handleStartOfTurnTokenExit(
    token: TokenPF2e,
    region: RegionDocumentPF2e
) {
    if (!token?.actor) return;
    if (!canvas.scene?.regions.has(region.id)) {
        return;
    }

    const effect = token.actor.items.find(
        i => i.type === "effect" &&
             i.flags?.[MODULE_ID]?.startOfTurnRegionId === region.id
    );
    if (!effect) return;

    const lockKey = `${token.id}-${region.id}`;
    if (inFlightTokenExits.has(lockKey)) return;
    inFlightTokenExits.add(lockKey);

    try {
        await effect.delete();
    } catch {
        // Document was already deleted concurrently
    } finally {
        inFlightTokenExits.delete(lockKey);
    }
}

export async function injectStartOfTurnBehaviorsToRegion(region: RegionDocumentPF2e) {
    if (!isStartOfTurnSpellRegion(region)) return;

    const enterBehavior = {
        name: "Start of Turn Enter",
        type: "executeScript",
        disabled: false,
        system: {
            events: ["tokenEnter"],
            source: `
                const region = event.region;
                const tokenDoc = event.data.token;
                if (tokenDoc?.object) {
                    const module = game.modules.get("samioli-module");
                    module?.api?.handleStartOfTurnTokenEnter?.(tokenDoc.object, region);
                }
            `
        }
    };

    const exitBehavior = {
        name: "Start of Turn Exit",
        type: "executeScript",
        disabled: false,
        system: {
            events: ["tokenExit"],
            source: `
                const region = event.region;
                const tokenDoc = event.data.token;
                if (tokenDoc?.object) {
                    const module = game.modules.get("samioli-module");
                    module?.api?.handleStartOfTurnTokenExit?.(tokenDoc.object, region);
                }
            `
        }
    };

    const behaviors = [enterBehavior, exitBehavior];
    region.updateSource({ behaviors: [...((region._source as { behaviors?: object[] }).behaviors ?? []), ...behaviors] });
}

export async function postMessagesForWithinEffects(combatant: CombatantPF2e) {
    const actor = combatant.actor;
    if (!actor) return;
    const startOfTurnEffects = actor.items.filter(item =>
        item.type === 'effect' && item.flags["samioli-module"]?.startOfTurnSpellUuid != null);

    if (startOfTurnEffects.length === 0) return;

    for (const effect of startOfTurnEffects) {
        const speakerUuid = effect.flags["samioli-module"]?.startOfTurnCasterUuid as string;
        const speaker = fromUuidSync(speakerUuid) as ActorPF2e;
        const spellUuid = effect.flags["samioli-module"]?.startOfTurnSpellUuid as string;
        const spellSource = effect.flags["samioli-module"]?.startOfTurnSpellSource as
            SpellSource | undefined;
        const spell = getSpellOrFallback(spellUuid, spellSource, speakerUuid);
        const content = `${combatant.name} has started their turn within ${spell?.name}`
        if (combatant.tokenId) {
            await replaceTargets([combatant.tokenId]);
        }
        await sendBasicChatMessage(content, speaker);
        await spell?.toMessage();
    }
}

export async function deleteWithinEffectsForRegion(
    region: RegionDocumentPF2e
) {
    const sceneTokens = canvas.tokens.placeables;
    for (const token of sceneTokens) {
        const actor = token.actor;
        if (!actor) continue;
        const matchingEffects = actor.items.filter(i =>
            i.type === "effect" &&
            i.flags?.[MODULE_ID]?.startOfTurnRegionId === region.id
        );
        for (const effect of matchingEffects) {
            await deleteItemFromActor(effect as ItemPF2e);
        }
    }

    const spellSource = region.getFlag(
        MODULE_ID,
        "spellSource"
    ) as SpellSource | undefined;
    
    if (spellSource?._id) {
        const pf2eFlags = (region.flags.pf2e as Record<string, unknown> | undefined);
        const origin = pf2eFlags?.origin as Record<string, unknown> | undefined;
        const casterUuid = (origin?.actor as string | undefined)
            || (region.getFlag(MODULE_ID, "casterUuid") as string | undefined);
        const caster = casterUuid ? (fromUuidSync(casterUuid) as ActorPF2e | null) : null;
        if (caster?.items.has(spellSource._id)) {
            await caster.deleteEmbeddedDocuments("Item", [spellSource._id]);
        }
    }
}

// Resolves a spell via UUID, falling back to reconstructing from source data if transient.
function getSpellOrFallback(
    spellUuid: string,
    spellSource: SpellSource | undefined,
    casterUuid: string | undefined
): SpellPF2e | null {
    const spell = fromUuidSync(spellUuid) as SpellPF2e;
    if (spell) {
        return spell;
    }

    if (spellSource) {
        const caster = casterUuid ? (fromUuidSync(casterUuid) as ActorPF2e | null) : null;
        const spellViaFallback = new CONFIG.Item.documentClass(
            spellSource,
            { parent: caster }
        ) as SpellPF2e;

        if (caster) {
            caster.items.set(spellViaFallback.id, spellViaFallback);
        }

        return spellViaFallback;
    }

    return null;
}

function createWithinEffectSource(spell: SpellPF2e, region: RegionDocumentPF2e): EffectSource {
    const effectName = `Within: ${spell.name}`;
    const effectLevel = spell.system.level?.value ?? spell.parent?.level ?? 1;
    const image = spell.img;
    const spellSource = region.getFlag(MODULE_ID, "spellSource");

    return {
        type: 'effect',
        name: effectName,
        img: image,
        system: {
            tokenIcon: { show: true },
            duration: {
                value: 0,
                unit: "unlimited",
                sustained: false,
                expiry: null
            },
            description: {
                ...spell.system.description,
            },
            unidentified: false,
            level: { value: effectLevel },
            slug: `start-of-turn-spell-${spell.system.slug}`
        },
        flags: {
            "samioli-module": {
                startOfTurnSpellUuid: spell.uuid,
                startOfTurnRegionId: region.id,
                startOfTurnCasterUuid: spell.actor?.uuid,
                ...(spellSource ? { startOfTurnSpellSource: spellSource } : {})
            }
        }
    } as EffectSource;
}

/**
 * Determines if the region originates from a known start-of-turn spell.
 */
export function isStartOfTurnSpellRegion(
    region: RegionDocumentPF2e
): boolean {
    const pf2eFlags = (region.flags.pf2e as Record<string, unknown> | undefined);
    const origin = pf2eFlags?.origin as Record<string, unknown> | undefined;
    const slug = (origin?.slug ?? "") as string;
    const uuid = (origin?.uuid ?? "") as string;
    const uuidSlug = uuid ? uuid.split(".").pop()! : "";

    return START_OF_TURN_SPELLS.includes(slug) || START_OF_TURN_SPELLS.includes(uuidSlug);
}

/**
 * Checks if the region has flags indicating it was placed for a start-of-turn spell.
 */
export function hasStartOfTurnRegionFlags(region: RegionDocumentPF2e): boolean {
    return !!region.getFlag(MODULE_ID, "isStartOfTurnSpell")
        || !!region.getFlag(MODULE_ID, "spellSource")
        || isStartOfTurnSpellRegion(region);
}