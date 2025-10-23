import { ActorPF2e, CombatantPF2e, EffectSource, ItemPF2e, MeasuredTemplateDocumentPF2e, SpellPF2e, TokenPF2e } from "foundry-pf2e";
import { addOrUpdateEffectOnActor, delay, sendBasicChatMessage } from "./utils.ts";
import { getTemplateTokens, isTokenInTemplateArea } from "./templatetarget.ts";

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

export async function addEffectsToTokensInStartOfTurnTemplates(template: MeasuredTemplateDocumentPF2e) {
    
    // @ts-expect-error slug is valid
    const spellSlug = template.flags.pf2e?.origin?.slug;

    const spellUuid = template.flags.pf2e?.origin?.uuid as string;

    if (!START_OF_TURN_SPELLS.includes(spellSlug)) return;

    const spell = fromUuidSync(spellUuid) as SpellPF2e;
    if (!spell) return;

    await template.setFlag("samioli-module", 'isStartOfTurnSpell', true);

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

async function removeSpellEffectFromTokenActor(token: TokenPF2e, spellEffect: ItemPF2e, 
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
                const spell = fromUuidSync(spellUuid) as SpellPF2e;
                if (!spell) return;
                await addWithinEffectToTokenActor(token, spell, template.document);
            }
        } else {
            // token is not within the template
            if (effect) {
                // remove effect if it exists as it's outside the template area.
                await removeSpellEffectFromTokenActor(token, effect, template.document);
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
        const spell = fromUuidSync(spellUuid) as SpellPF2e;
        const content = `${combatant.name} has started their turn within ${spell?.name}`
        await sendBasicChatMessage(content, speaker);
        await spell?.toMessage();
    }
}

export async function deleteWithinEffectsForTemplate(template: MeasuredTemplateDocumentPF2e) {
    const effectUuids = template.getFlag('samioli-module', 'startOfTurnEffectUuid') as string[];
    if (!effectUuids || effectUuids.length === 0) return;

    for (const effectUuid of effectUuids) {
        const effect = fromUuidSync(effectUuid) as ItemPF2e;
        if (!effect) continue;
        await effect.delete();
    }
}

function createWithinEffectSource(spell: SpellPF2e, template: MeasuredTemplateDocumentPF2e) : EffectSource {

    const effectName = `Within: ${spell.name}`;

    const effectLevel = spell.system.level?.value ?? spell.parent?.level ?? 1;
    const image = spell.img;

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
                startOfTurnCasterUuid: spell.actor?.uuid
            }
        }
    };

    return effect as DeepPartial<EffectSource> as EffectSource;

}