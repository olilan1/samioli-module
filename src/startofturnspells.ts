import { ActorPF2e, CombatantPF2e, EffectSource, ItemPF2e, RegionDocumentPF2e, SpellPF2e, SpellSource, TokenPF2e } from "foundry-pf2e";
import {
    addOrUpdateEffectOnActor,
    deleteItemFromActor,
    sendBasicChatMessage,
    MODULE_ID
} from "./utils.ts";
import { getTemplateTokens, replaceTargets } from "./templatetarget.ts";
import { RegionOriginFlag } from "./types.ts";

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

/**
 * Resolves the spell behind a region.
 *
 * Spells cast from an item activation are transient and their UUID does not resolve. Those are
 * rebuilt from the source stored on the region, which outlives the originating chat message. The
 * message is consulted only on first placement, before that flag has been written.
 */
function resolveSpellForRegion(
    region: RegionDocumentPF2e
): { spell: SpellPF2e; isTransient: boolean } | null {
    const origin = region.flags.pf2e?.origin as RegionOriginFlag | undefined;
    const spellUuid = origin?.uuid ?? "";

    const resolved = spellUuid ? fromUuidSync<SpellPF2e>(spellUuid) : null;
    if (resolved) return { spell: resolved, isTransient: false };

    const spellSource = region.getFlag(MODULE_ID, "spellSource") as SpellSource | undefined;
    if (spellSource) {
        const casterUuid = region.getFlag(MODULE_ID, "casterUuid") as string | undefined;
        const stored = getSpellOrFallback(spellUuid, spellSource, casterUuid);
        if (stored) return { spell: stored, isTransient: true };
    }

    const messageId = region.flags.pf2e?.messageId as string | undefined;
    if (!messageId) return null;
    const transient = game.messages.get(messageId)?.item as SpellPF2e | undefined;
    return transient ? { spell: transient, isTransient: true } : null;
}

/**
 * Records the region flags that "Within" effects and turn-start messaging read back.
 *
 * For a spell cast from an item activation the spell is transient and its UUID will not resolve
 * later, so the source is stored on the region and copied onto each effect.
 */
async function recordStartOfTurnRegionFlags(
    region: RegionDocumentPF2e,
    resolved: { spell: SpellPF2e; isTransient: boolean }
) {
    if (region.getFlag(MODULE_ID, "isStartOfTurnSpell")) return;

    await region.setFlag(MODULE_ID, "isStartOfTurnSpell", true);
    if (resolved.isTransient) {
        await region.setFlag(MODULE_ID, "spellSource", resolved.spell.toObject());
        await region.setFlag(MODULE_ID, "casterUuid", resolved.spell.actor?.uuid);
    }
}

/**
 * Prepares a newly placed start-of-turn spell region: records its flags, attaches the tracking
 * behaviors, then applies the "Within" effect to tokens already in the area.
 *
 * The steps run in that order because `createWithinEffectSource` reads the region flags, and
 * attaching the behaviors fires `tokenEnter` for tokens already inside, which builds an effect.
 */
export async function initialiseStartOfTurnRegion(region: RegionDocumentPF2e) {
    if (!isStartOfTurnSpellRegion(region)) return;

    const resolved = resolveSpellForRegion(region);
    if (!resolved) return;

    await recordStartOfTurnRegionFlags(region, resolved);
    await attachStartOfTurnBehaviorsToRegion(region);
    await addEffectsToTokensInStartOfTurnTemplates(region);
}

/**
 * Applies the "Within" effect to tokens already inside a start-of-turn spell area at the moment it
 * is placed, and records the flags that effect creation and turn-start messaging depend on.
 *
 * Runs on region creation as GM. Tokens entering later are handled by the attached tokenEnter
 * behavior; this covers the ones that were already standing there.
 */
export async function addEffectsToTokensInStartOfTurnTemplates(region: RegionDocumentPF2e) {
    if (!isStartOfTurnSpellRegion(region)) return;

    const resolved = resolveSpellForRegion(region);
    if (!resolved) return;

    await recordStartOfTurnRegionFlags(region, resolved);

    const tokensWithinRegion = await getTemplateTokens(region);

    // Routed through handleStartOfTurnTokenEnter so this path and the tokenEnter behavior share one
    // existing-effect check and one in-flight lock, keeping them from both creating the effect.
    for (const token of tokensWithinRegion) {
        await handleStartOfTurnTokenEnter(token, region);
    }
}

async function addWithinEffectToTokenActor(
    token: TokenPF2e,
    spell: SpellPF2e,
    region: RegionDocumentPF2e
) {
    if (!token.actor) return;
    const effectSource = createWithinEffectSource(spell, region);
    await addOrUpdateEffectOnActor(token.actor, effectSource);
}

const inFlightTokenEnters = new Set<string>();

export async function handleStartOfTurnTokenEnter(
    token: TokenPF2e,
    region: RegionDocumentPF2e
) {
    if (!token.actor) return;
    if (!isStartOfTurnSpellRegion(region)) return;

    const existingEffect = token.actor.items.find(
        item => item.type === "effect" &&
                item.flags?.[MODULE_ID]?.startOfTurnRegionId === region.id
    );
    if (existingEffect) return;

    const lockKey = `${token.id}-${region.id}`;
    if (inFlightTokenEnters.has(lockKey)) return;
    inFlightTokenEnters.add(lockKey);

    try {
        const resolved = resolveSpellForRegion(region);
        if (resolved) {
            await addWithinEffectToTokenActor(token, resolved.spell, region);
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

/**
 * Builds the source for an executeScript behavior that forwards a region event to the module API.
 *
 * Foundry dispatches region events to every connected client without user filtering, so the script
 * opens with an `isActiveGM` guard to keep effect creation on one client. `isActiveGM` rather than
 * `isGM` covers the case of two connected GMs.
 */
function buildStartOfTurnScript(apiMethod: string): string {
    return `
if (!game.user.isActiveGM) return;
const tokenDoc = event.data.token;
if (!tokenDoc?.object) return;
const api = game.modules.get("samioli-module")?.api;
api?.${apiMethod}?.(tokenDoc.object, event.region);
`;
}

/**
 * Attaches the tokenEnter/tokenExit tracking behaviors to a start-of-turn spell region.
 *
 * Runs as GM once the region exists. `BaseRegion##canCreate` refuses a Region created by a non-GM
 * that already carries behaviors, while RegionBehavior creation is permitted to GMs separately: the
 * player places the bare region and the GM attaches the behaviors to it.
 */
export async function attachStartOfTurnBehaviorsToRegion(region: RegionDocumentPF2e) {
    if (!isStartOfTurnSpellRegion(region)) return;

    const behaviors = [
        {
            name: "Start of Turn Enter",
            type: "executeScript",
            disabled: false,
            system: {
                events: ["tokenEnter"],
                source: buildStartOfTurnScript("handleStartOfTurnTokenEnter")
            }
        },
        {
            name: "Start of Turn Exit",
            type: "executeScript",
            disabled: false,
            system: {
                events: ["tokenExit"],
                source: buildStartOfTurnScript("handleStartOfTurnTokenExit")
            }
        }
    ];

    try {
        await region.createEmbeddedDocuments("RegionBehavior", behaviors);
    } catch (error) {
        console.error("Failed to attach start-of-turn behaviors to region:", error);
    }
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
            await deleteItemFromActor(effect);
        }
    }

    const spellSource = region.getFlag(
        MODULE_ID,
        "spellSource"
    ) as SpellSource | undefined;
    
    if (spellSource?._id) {
        const origin = region.flags.pf2e?.origin as RegionOriginFlag | undefined;
        const casterUuid = origin?.actor
            || (region.getFlag(MODULE_ID, "casterUuid") as string | undefined);
        const caster = casterUuid ? fromUuidSync<ActorPF2e>(casterUuid) : null;
        // getSpellOrFallback injects the transient spell into the in-memory collection only, so it
        // is removed the same way. A database delete would target a real item on the caster.
        caster?.items.delete(spellSource._id);
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
        const caster = casterUuid ? fromUuidSync<ActorPF2e>(casterUuid) : null;
        const spellViaFallback = new CONFIG.Item.documentClass(
            spellSource,
            { parent: caster }
        ) as SpellPF2e;

        if (caster) {
            // Inject the synthetic spell in-memory so standard rolls can resolve it. The cast
            // narrows the parent to non-null, which the collection's element type requires.
            caster.items.set(spellViaFallback.id, spellViaFallback as ItemPF2e<ActorPF2e>);
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
    } as DeepPartial<EffectSource> as EffectSource;
}

/**
 * Determines if the region originates from a known start-of-turn spell.
 *
 * PF2e writes the item slug to `flags.pf2e.origin.slug` when it places a spell area
 * (see `placeRegionFromItem`), so that is the only check needed.
 */
export function isStartOfTurnSpellRegion(
    region: RegionDocumentPF2e
): boolean {
    const origin = region.flags.pf2e?.origin as RegionOriginFlag | undefined;

    return START_OF_TURN_SPELLS.includes(origin?.slug ?? "");
}

/**
 * Checks if the region has flags indicating it was placed for a start-of-turn spell.
 */
export function hasStartOfTurnRegionFlags(region: RegionDocumentPF2e): boolean {
    return !!region.getFlag(MODULE_ID, "isStartOfTurnSpell")
        || !!region.getFlag(MODULE_ID, "spellSource")
        || isStartOfTurnSpellRegion(region);
}