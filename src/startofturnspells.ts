import { ActorPF2e, CombatantPF2e, EffectSource, ItemPF2e, MeasuredTemplateDocumentPF2e, SpellPF2e, TokenPF2e } from "foundry-pf2e";
import { addEffectToActor, delay, sendBasicChatMessage } from "./utils.ts";
import { getTemplateTokens, isTokenInTemplateArea } from "./templatetarget.ts";

export async function checkIfTemplatePlacedIsStartOfTurnSpell(template: MeasuredTemplateDocumentPF2e) {
    const validStartsTurnSlugs = [
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
    ]

    // @ts-expect-error slug is valid
    const spellSlug = template.flags.pf2e?.origin?.slug;

    const spellUuid = template.flags.pf2e?.origin?.uuid as string;

    if (!validStartsTurnSlugs.includes(spellSlug)) return;

    const spell = fromUuidSync(spellUuid) as SpellPF2e;
    if (!spell) return;

    await template.setFlag("samioli-module", 'isStartOfTurnSpell', true);

    const tokenWithinTemplate = await getTemplateTokens(template);

    for (const token of tokenWithinTemplate) {
        await addSpellEffectToTokenActor(token, spell, template);
    }
}

async function addSpellEffectToTokenActor(token: TokenPF2e, spell: SpellPF2e, template: MeasuredTemplateDocumentPF2e) {
    // get the effect from the spell
    const spellEffect = getStartOfTurnEffect(spell, template);
    // add the effect to the actor
    if (!token.actor) return;
    await addEffectToActor(token.actor, spellEffect);

    // Get the UUID of the new effect
    const spellSlug = spell.slug;
    const effectSlug = `start-of-turn-spell-${spellSlug}`;
    const effectItem = token.actor?.items.find(item => item.type === 'effect' && item.slug === effectSlug);
    if (!effectItem) {
        return; 
    }
    const effectUuid = effectItem.uuid as string;

    // Retrieve Existing UUIDs
    const current = template.getFlag('samioli-module', 'startOfTurnEffectUuid');
    const uuids = Array.isArray(current) ? current : current ? [current] : [];

    const templateLinkedUuids: string[] = uuids as string[]; 

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
    // update the template to remove the effect
    const templateLinkedUuids = template.getFlag('samioli-module', 'startOfTurnEffectUuid') as string[];
    const newTemplateLinkedUuids = templateLinkedUuids.filter(uuid => uuid !== spellEffectUuid);
    await template.setFlag("samioli-module", 'startOfTurnEffectUuid', newTemplateLinkedUuids);
}

export async function checkIfTokenIsWithinTemplateBoundsAndUpdateIfNeeded(token: TokenPF2e, 
    spaces: number) {

    // check if there are any templates on the canvas
    const activeTemplates = canvas.templates.placeables;

    if (activeTemplates.length === 0) {
        return;
    }

    const validTemplates = [];

    // are any of the templates flagged with start of turn logic?
    for (const template of activeTemplates) {

        if (template.document.getFlag('samioli-module', 'isStartOfTurnSpell')) {
            validTemplates.push(template);
        }
    }

    if (validTemplates.length === 0) {
        return;
    }

    // add a required delay based on the movement distance to ensure the calculation occurs at the
    // correct time, or it triggers too early and doesn't detect that it's within the template
    if (spaces <= 3) {
        await delay(spaces * 220);
    } else {
        await delay(spaces * 170);
    }

    // for all templates flagged with start of turn logic, is the token within one?
    for (const template of validTemplates) {
        if (await isTokenInTemplateArea(token, template.document)) {
            // token is within the template, check if token.actor already has the effect.
            const actor = token.actor;
            if (!actor) return;
            const effect = actor.items.find(item => item.type === 'effect' 
                && (item.flags?.["samioli-module"]?.startOfTurnTemplateId === template.id));
            // apply effect if not found
            if (!effect) {
                const spellUuid = template.document.flags.pf2e.origin?.uuid as string;
                const spell = fromUuidSync(spellUuid) as SpellPF2e;
                if (!spell) return;
                await addSpellEffectToTokenActor(token, spell, template.document);
            }
            
        } else {
            // token is not within the template, check if token.actor already has the effect.
            const actor = token.actor;
            if (!actor) return;
            const effect = actor.items.find(item => item.type === 'effect' 
                && (item.flags?.["samioli-module"]?.startOfTurnTemplateId === template.id));
            if (effect) {
                // remove effect if it exists as it's outside the template area.
                await removeSpellEffectFromTokenActor(token, effect, template.document);
            }
        }   
    }
}

export async function checkIfCombatantIsStartingTurnWithRelevantEffect(combatant: CombatantPF2e) {
    const actor = combatant.token?.actor;
    if (!actor) return;
    const startOfTurnEffects = actor.items.filter(item => 
        item.type === 'effect' && typeof item.slug === 'string' 
        && item.slug.startsWith('start-of-turn-spell-')
    );
    if (startOfTurnEffects.length === 0) {
        return;
    }

    for (const effect of startOfTurnEffects) {

        const speakerUuid = effect.flags["samioli-module"]?.startOfTurnActorUuid as string;
        if (!speakerUuid) continue;
        const speaker = fromUuidSync(speakerUuid) as ActorPF2e;
        if (!speaker) continue;
        const spellUuid = effect.flags["samioli-module"]?.startOfTurnSpellUuid as string;
        const spellName = fromUuidSync(spellUuid)?.name as string;
        if (!spellName) continue;
        
        const content = `${combatant.name} has started their turn within ${spellName}`
        await sendBasicChatMessage(content, speaker);
        await addSpellBackIntoChat(effect);
    }
}

export async function checkIfTemplateHasEffectsAndDeleteIfNeeded(template: MeasuredTemplateDocumentPF2e) {
    const effectUuids = template.getFlag('samioli-module', 'startOfTurnEffectUuid') as string[];
    if (!effectUuids || effectUuids.length === 0) return;

    for (const effectUuid of effectUuids) {
        const effect = fromUuidSync(effectUuid) as ItemPF2e;
        if (!effect) continue;
        await effect.delete();
    }
}

async function addSpellBackIntoChat(effect: ItemPF2e) {
    const spellUuid = effect.flags["samioli-module"].startOfTurnSpellUuid as string;
    if (!spellUuid) return;
    const spell = fromUuidSync(spellUuid) as SpellPF2e;
    if (!spell) return;
    await spell.toMessage();
}

function getStartOfTurnEffect(spell: SpellPF2e, template: MeasuredTemplateDocumentPF2e) : EffectSource {

    const startOfTurnSpellEffectPrefix = 'Within: '

    const effectName = `${ startOfTurnSpellEffectPrefix}${spell.name}`;
    const description = spell.system.description.value;

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
                value: description
            },
            unidentified: false,
            level: { value: effectLevel },
            slug: `start-of-turn-spell-${spell.system.slug}`
        },
        flags: {
            pf2e: { 
                rulesSelections: {}, 
                itemGrants: {}, 
                grantedBy: null 
            },
            "samioli-module": { 
                startOfTurnSpellUuid: spell.uuid,
                startOfTurnTemplateId: template.id,
                startOfTurnActorUuid: spell.actor?.uuid
            }
        }
    };

    return effect as DeepPartial<EffectSource> as EffectSource;

}