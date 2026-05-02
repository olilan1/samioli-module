import { ActorPF2e, CombatantPF2e, EffectSource, MeasuredTemplateDocumentPF2e, SpellPF2e, TokenDocumentPF2e, ItemPF2e, TokenPF2e } from "foundry-pf2e";
import { addOrUpdateEffectOnActor, sendBasicChatMessage, isSpellPF2e, delay } from "./utils.ts";
import { getTemplateTokens } from "./templatetarget.ts";

const MODULE_ID = "samioli-module";

const FLAGS = {
    IS_START_OF_TURN_SPELL: "isStartOfTurnSpell",
    START_OF_TURN_SPELL_UUID: "startOfTurnSpellUuid",
    START_OF_TURN_TEMPLATE_ID: "startOfTurnTemplateId",
    START_OF_TURN_CASTER_UUID: "startOfTurnCasterUuid",
} as const;

const SLUGS = {
    START_OF_TURN_SPELL_PREFIX: "start-of-turn-spell-",
} as const;

const START_OF_TURN_SPELLS = [
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
 * When a template is created, if it's a start-of-turn spell, flag it and add effects 
 * to tokens inside.
 */
export async function addEffectsToTokensInStartOfTurnTemplates(
    template: MeasuredTemplateDocumentPF2e
) {
    const spellUuid = template.flags.pf2e?.origin?.uuid;
    if (typeof spellUuid !== "string") return;

    const spell = fromUuidSync(spellUuid) as ItemPF2e | null;
    if (!spell || !isSpellPF2e(spell)) return;

    const spellSlug = spell.slug;
    if (typeof spellSlug !== "string" || !START_OF_TURN_SPELLS.includes(spellSlug)) return;

    await template.setFlag(MODULE_ID, FLAGS.IS_START_OF_TURN_SPELL, true);

    const tokensInTemplate = await getTemplateTokens(template);
    for (const token of tokensInTemplate) {
        if (token.actor) {
            await applyWithinEffect(token.actor, spell, template);
        }
    }
}

/**
 * Applies the "Within: [Spell]" effect to an actor.
 */
async function applyWithinEffect(
    actor: ActorPF2e, 
    spell: SpellPF2e, 
    template: MeasuredTemplateDocumentPF2e
) {
    const effectSource = createWithinEffectSource(spell, template);
    await addOrUpdateEffectOnActor(actor, effectSource);
}

/**
 * Removes the "Within: [Spell]" effect from an actor.
 */
async function removeWithinEffect(actor: ActorPF2e, templateId: string) {
    const effect = actor.itemTypes.effect.find(e =>
        e.getFlag(MODULE_ID, FLAGS.START_OF_TURN_TEMPLATE_ID) === templateId
    );
    if (effect) {
        await effect.delete();
    }
}

/**
 * Hooked to updateToken. Evaluates if a token has moved into or out of a start-of-turn 
 * spell area.
 */
export async function evaluateAreaEffectsOnTokenUpdate(
    tokenDoc: TokenDocumentPF2e, 
    changedData: DeepPartial<foundry.documents.TokenSource>,
    context: Record<string, unknown> & { animate?: boolean }
) {
    // Only care if position changed
    if (changedData.x === undefined && changedData.y === undefined) return;

    const actor = tokenDoc.actor;
    if (!actor) return;

    // If the token is moving, wait for the animation to finish so scrolling text appears at the
    // destination
    if (context?.animate !== false) {
        // Wait a frame for the animation to be registered
        await delay(20);

        try {
            const token = tokenDoc.object;
            if (token) {
                // Foundry V12/V13 uses movementAnimationPromise for movement animations.
                // We cast to access it as it might be missing from some type definitions.
                await (token as TokenPF2e & { movementAnimationPromise?: Promise<void> }).movementAnimationPromise;
            }
        } catch (e) {
            // Animation might be cancelled, but we still want to evaluate the position
        }

        // Wait one more frame after the animation resolves to ensure the canvas has 
        // synchronized visual coordinates with the document.
        await delay(20);
    }

    const startOfTurnTemplates = canvas.scene?.templates.filter(t =>
        !!t.getFlag(MODULE_ID, FLAGS.IS_START_OF_TURN_SPELL)
    ) ?? [];

    if (startOfTurnTemplates.length === 0) return;

    // Optimization: Gather all existing within-effects once to avoid O(N^2) lookups
    const existingEffectsByTemplateId = new Set(
        actor.itemTypes.effect
            .map(e => e.getFlag(MODULE_ID, FLAGS.START_OF_TURN_TEMPLATE_ID))
            .filter((id): id is string => typeof id === "string")
    );

    const destination = {
        x: changedData.x ?? tokenDoc.x,
        y: changedData.y ?? tokenDoc.y
    };

    for (const template of startOfTurnTemplates) {
        const hasEffect = existingEffectsByTemplateId.has(template.id);
        const isInside = isTokenAtLocationInTemplate(tokenDoc, destination, template);

        if (isInside && !hasEffect) {
            const spellUuid = template.flags.pf2e?.origin?.uuid;
            if (typeof spellUuid !== "string") continue;
            const spell = fromUuidSync(spellUuid) as ItemPF2e | null;
            if (spell && isSpellPF2e(spell)) {
                await applyWithinEffect(actor, spell, template);
            }
        } else if (!isInside && hasEffect) {
            await removeWithinEffect(actor, template.id);
        }
    }
}

/**
 * Checks if a token at a specific location is within a template's highlight area.
 * Bypasses the need for canvas animations by checking against the cached highlight layer.
 */
function isTokenAtLocationInTemplate(
    tokenDoc: TokenDocumentPF2e, 
    position: { x: number, y: number }, 
    template: MeasuredTemplateDocumentPF2e
): boolean {
    const templateObject = template.object;
    if (!templateObject) return false;

    const highlightLayer = canvas.interface.grid.getHighlightLayer(templateObject.highlightId);
    if (!highlightLayer) return false;

    const gridSize = canvas.grid.size;

    // Check all squares the token occupies at its destination
    for (let h = 0; h < tokenDoc.height; h++) {
        for (let w = 0; w < tokenDoc.width; w++) {
            const x = Math.floor(position.x / gridSize) * gridSize + (w * gridSize);
            const y = Math.floor(position.y / gridSize) * gridSize + (h * gridSize);
            const gridKey = `${x},${y}`;

            // The highlight layer stores a Set of positions in 'positions' (string format "x,y")
            // Note: This relies on how PF2e/Foundry highlights templates.
            if (highlightLayer.positions.has(gridKey)) {
                return true;
            }
        }
    }

    return false;
}

/**
 * When a turn starts, check if the combatant is within any start-of-turn spell areas and notify.
 */
export async function postMessagesForWithinEffects(combatant: CombatantPF2e) {
    const actor = combatant.token?.actor;
    if (!actor) return;

    const startOfTurnEffects = actor.itemTypes.effect.filter(e =>
        e.getFlag(MODULE_ID, FLAGS.START_OF_TURN_SPELL_UUID)
    );

    for (const effect of startOfTurnEffects) {
        const spellUuid = effect.getFlag(MODULE_ID, FLAGS.START_OF_TURN_SPELL_UUID);
        const casterUuid = effect.getFlag(MODULE_ID, FLAGS.START_OF_TURN_CASTER_UUID);

        if (typeof spellUuid !== "string") continue;

        const spell = fromUuidSync(spellUuid) as ItemPF2e | null;
        if (!spell || !isSpellPF2e(spell)) continue;

        const speaker = typeof casterUuid === "string" ? 
            (fromUuidSync(casterUuid) as ActorPF2e | null) : null;

        const content = `${combatant.name} has started their turn within ` +
                        `${spell.name}`;
        
        if (speaker) {
            await sendBasicChatMessage(content, speaker);
        } else {
            await ChatMessage.create({ content, speaker: ChatMessage.getSpeaker({ actor }) });
        }
        
        await spell.toMessage();
    }
}

/**
 * Clean up "Within" effects on all tokens when a start-of-turn template is deleted.
 */
export async function deleteWithinEffectsForTemplate(template: MeasuredTemplateDocumentPF2e) {
    if (!template.getFlag(MODULE_ID, FLAGS.IS_START_OF_TURN_SPELL)) return;

    const scene = template.parent;
    if (!scene) return;

    for (const token of scene.tokens) {
        const actor = token.actor;
        if (!actor) continue;

        const effect = actor.itemTypes.effect.find(e =>
            e.getFlag(MODULE_ID, FLAGS.START_OF_TURN_TEMPLATE_ID) === template.id
        );
        
        if (effect) {
            await effect.delete();
        }
    }
}

/**
 * Creates the EffectSource for the "Within: [Spell]" effect.
 */
function createWithinEffectSource(
    spell: SpellPF2e, 
    template: MeasuredTemplateDocumentPF2e
): EffectSource {
    const effectLevel = spell.system.level?.value ?? spell.parent?.level ?? 1;

    const source = {
        type: 'effect',
        name: `Within: ${spell.name}`,
        img: spell.img,
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
            slug: `${SLUGS.START_OF_TURN_SPELL_PREFIX}${spell.system.slug}`
        },
        flags: {
            [MODULE_ID]: {
                [FLAGS.START_OF_TURN_SPELL_UUID]: spell.uuid,
                [FLAGS.START_OF_TURN_TEMPLATE_ID]: template.id,
                [FLAGS.START_OF_TURN_CASTER_UUID]: spell.actor?.uuid
            }
        }
    };

    return source as DeepPartial<EffectSource> as EffectSource;
}
