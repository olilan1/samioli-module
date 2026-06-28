import { ActorPF2e, CombatantPF2e, EffectSource, ItemPF2e, MeasuredTemplateDocumentPF2e, SpellPF2e, SpellSource, TokenPF2e } from "foundry-pf2e";
import { addOrUpdateEffectOnActor, delay, sendBasicChatMessage } from "./utils.ts";
import { getTemplateTokens, isTokenInTemplateArea, replaceTargets } from "./templatetarget.ts";

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

export async function addEffectsToTokensInStartOfTurnTemplates(template: MeasuredTemplateDocumentPF2e) {

    // @ts-expect-error slug is valid
    const spellSlug = template.flags.pf2e?.origin?.slug;
    const spellUuid = template.flags.pf2e?.origin?.uuid as string;

    if (!START_OF_TURN_SPELLS.includes(spellSlug)) return;

    let spell = fromUuidSync(spellUuid) as SpellPF2e;
    let isTransient = false;

    // for spells cast from item activations get the spell object from the message
    if (!spell) {
        const messageId = template.flags.pf2e?.messageId as string;
        if (messageId) {
            const message = game.messages.get(messageId);
            spell = message?.item as SpellPF2e;
            isTransient = true;
        }
    }

    if (!spell) return;

    await template.setFlag("samioli-module", "isStartOfTurnSpell", true);
    if (isTransient) {
        await template.setFlag("samioli-module", "spellSource", spell.toObject());
        await template.setFlag("samioli-module", "casterUuid", spell.actor?.uuid);
    }

    const tokenWithinTemplate = await getTemplateTokens(template);

    for (const token of tokenWithinTemplate) {
        await addWithinEffectToTokenActor(token, spell, template);
    }
}

async function addWithinEffectToTokenActor(token: TokenPF2e, spell: SpellPF2e, template: MeasuredTemplateDocumentPF2e) {
    // create the within effect from the spell
    const effectSource = createWithinEffectSource(spell, template);
    // add the within effect to the actor
    if (!token.actor) return;
    const effectItem = await addOrUpdateEffectOnActor(token.actor, effectSource);
    if (!effectItem) return;
    const effectUuid = effectItem.uuid as string;
    const templateLinkedUuids = template.getFlag('samioli-module', 'startOfTurnEffectUuid') as string[] ?? [];

    // Check if the new UUID is already in the array, add if not
    if (!templateLinkedUuids.includes(effectUuid)) {
        templateLinkedUuids.push(effectUuid);
    }

    // update template with new UUIDs
    await template.setFlag("samioli-module", 'startOfTurnEffectUuid', templateLinkedUuids);
}

async function removeWithinEffectFromTokenActor(token: TokenPF2e, spellEffect: ItemPF2e,
    template: MeasuredTemplateDocumentPF2e) {

    if (!token.actor) return;
    const spellEffectUuid = spellEffect.uuid;
    await spellEffect.delete();
    // update the template to remove the within effect
    const templateLinkedUuids = template.getFlag('samioli-module', 'startOfTurnEffectUuid') as string[];
    const newTemplateLinkedUuids = templateLinkedUuids.filter(uuid => uuid !== spellEffectUuid);
    await template.setFlag("samioli-module", 'startOfTurnEffectUuid', newTemplateLinkedUuids);
}

export async function addOrRemoveWithinEffectIfNeeded(token: TokenPF2e, costInFeet: number) {

    const validTemplates = canvas.templates.placeables.filter(
        template => template.document.getFlag('samioli-module', 'isStartOfTurnSpell'));

    if (validTemplates.length === 0) {
        return;
    }

    const gridDistance = canvas.grid.distance;
    const costInSquares = costInFeet / gridDistance;

    // add a required delay based on the movement distance to ensure the calculation occurs at the
    // correct time, or it triggers too early and doesn't detect that it's within the template
    // TODO: find a better way to handle this timing issue
    if (costInSquares <= 3) {
        await delay(costInSquares * 220);
    } else {
        await delay(costInSquares * 170);
    }

    const actor = token.actor;
    if (!actor) return;

    // for all templates flagged with start of turn logic, is the token within one?
    for (const template of validTemplates) {

        const effect = actor.items.find(item => item.type === 'effect'
            && (item.flags?.["samioli-module"]?.startOfTurnTemplateId === template.id));

        if (await isTokenInTemplateArea(token, template.document)) {
            // Token is in template area and has no effect, add effect
            if (!effect) {
                const spellUuid = template.document.flags.pf2e.origin?.uuid as string;
                const spellSource = template.document.getFlag(
                    "samioli-module",
                    "spellSource"
                ) as SpellSource | undefined;
                const casterUuid = template.document.getFlag(
                    "samioli-module",
                    "casterUuid"
                ) as string | undefined;
                const spell = getSpellOrFallback(spellUuid, spellSource, casterUuid);
                if (!spell) continue;
                await addWithinEffectToTokenActor(token, spell, template.document);
            }
        } else {
            // token is not within the template
            if (effect) {
                // remove effect if it exists as it's outside the template area.
                await removeWithinEffectFromTokenActor(token, effect, template.document);
            }
        }
    }
}

export async function postMessagesForWithinEffects(combatant: CombatantPF2e) {
    const actor = combatant.token?.actor;
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

export async function deleteWithinEffectsForTemplate(template: MeasuredTemplateDocumentPF2e) {
    const effectUuids = template.getFlag('samioli-module', 'startOfTurnEffectUuid') as string[];
    if (effectUuids && effectUuids.length > 0) {
        for (const effectUuid of effectUuids) {
            const effect = fromUuidSync(effectUuid) as ItemPF2e;
            if (!effect) continue;
            await effect.delete();
        }
    }

    const spellSource = template.getFlag(
        "samioli-module",
        "spellSource"
    ) as SpellSource | undefined;
    
    if (spellSource) {
        const casterUuid = template.flags.pf2e?.origin?.actor as string
            || template.getFlag("samioli-module", "casterUuid") as string;
        const caster = casterUuid ? fromUuidSync(casterUuid) as ActorPF2e : null;
        if (caster && spellSource._id) {
            (caster.items as unknown as Map<string, ItemPF2e>).delete(spellSource._id);
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
        const caster = casterUuid ? fromUuidSync(casterUuid) as ActorPF2e : null;
        const spellViaFallback = new CONFIG.Item.documentClass(
            spellSource,
            { parent: caster }
        ) as SpellPF2e;

        if (caster) {
            // Inject synthetic spell in-memory for standard rolls.
            (caster.items as unknown as Map<string, ItemPF2e>).set(
                spellViaFallback.id,
                spellViaFallback
            );
        }

        return spellViaFallback;
    }

    return null;
}

function createWithinEffectSource(spell: SpellPF2e, template: MeasuredTemplateDocumentPF2e): EffectSource {

    const effectName = `Within: ${spell.name}`;

    const effectLevel = spell.system.level?.value ?? spell.parent?.level ?? 1;
    const image = spell.img;
    const spellSource = template.getFlag("samioli-module", "spellSource");

    const effect = {
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
                startOfTurnTemplateId: template.id,
                startOfTurnCasterUuid: spell.actor?.uuid,
                ...(spellSource ? { startOfTurnSpellSource: spellSource } : {})
            }
        }
    };

    return effect as DeepPartial<EffectSource> as EffectSource;

}

/**
 * Determines if the template originates from a known start-of-turn spell.
 */
export function isStartOfTurnSpellTemplate(template: MeasuredTemplateDocumentPF2e): boolean {
    const slug = (template.flags.pf2e?.origin as { slug?: string } | undefined)?.slug;
    return !!slug && START_OF_TURN_SPELLS.includes(slug);
}

/**
 * Checks if the template has flags indicating it was placed for a start-of-turn spell.
 */
export function hasStartOfTurnFlags(template: MeasuredTemplateDocumentPF2e): boolean {
    return !!template.getFlag("samioli-module", "startOfTurnEffectUuid")
        || !!template.getFlag("samioli-module", "spellSource");
}