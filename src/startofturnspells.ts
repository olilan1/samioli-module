import { ActorPF2e, CombatantPF2e, ItemPF2e, MeasuredTemplateDocumentPF2e, SpellPF2e, TokenPF2e } from "foundry-pf2e";
import { addEffectToActor, delay, logd, sendBasicChatMessage } from "./utils.ts";
import { getTemplateTokens, isTokenInTemplateArea } from "./templatetarget.ts";

export async function checkIfTemplatePlacedIsStartOfTurnSpell(template: MeasuredTemplateDocumentPF2e) {
    const validSlugs = [
        'ash-cloud'
    ]
    //field of life
    //sea of thought
    //visions of danger
    //flammable fumes
    //earthquake
    //corrosive muck
    //frozen fog
    //control sand
    //rust cloud
    //petal storm
    //antlion trap

    // @ts-expect-error slug is valid
    const spellSlug = template.flags.pf2e?.origin?.slug;
    const spellUuid = template.flags.pf2e?.origin?.uuid as string;

    if (!validSlugs.includes(spellSlug)) return;

    logd(`Template is a start of turn spell`)

    const spell = fromUuidSync(spellUuid) as SpellPF2e;
    if (!spell) return;

    await template.setFlag("samioli-module", 'isStartOfTurnSpell', true);

    const tokenWithinTemplate = await getTemplateTokens(template);

    for (const token of tokenWithinTemplate) {
        await addSpellEffectToTokenActor(token, spell, template);
    }
}

async function addSpellEffectToTokenActor(token: TokenPF2e, spell: SpellPF2e, template: MeasuredTemplateDocumentPF2e) {
    // create the effect from the spell
    const spellEffect = createStartOfTurnEffect(spell, template);
    // add the effect to the actor
    if (!token.actor) return;
    logd(`Adding spell effect to token actor`);
    logd(spellEffect);
    logd(`actor items`);
    logd(token.actor.items);
    await addEffectToActor(token.actor, spellEffect);
    logd(`actor items post update`);
    logd(token.actor.items);

    // --- Step 1: Get the UUID of the NEW effect ---
    const spellSlug = spell.slug;
    const effectSlug = `start-of-turn-spell-${spellSlug}`;
    const effectItem = token.actor?.items.find(item => item.type === 'effect' && item.slug === effectSlug);
    if (!effectItem) {
        logd(`Error: Effect item with slug ${effectSlug} not found on the token's actor.`);
        return; // Exit if the source effect isn't there
    }
    const effectUuid = effectItem.uuid as string; // Your original variable name
    logd(`effect uuid:`);
    logd(effectUuid);

    // --- Step 2: Retrieve Existing UUIDs and Normalize to Array ---

    // Retrieve the stored flag value. It might be null, undefined, a single string, or an array.
    let currentTemplateLinkedUuids: unknown = template.getFlag('samioli-module', 'effectUuid');

    // Ensure 'currentTemplateLinkedUuids' is always an array of strings (or an empty array)
    if (typeof currentTemplateLinkedUuids === 'string') {
        // If a single string was stored (e.g., from an old save), convert it to an array
        currentTemplateLinkedUuids = [currentTemplateLinkedUuids];
    } else if (!Array.isArray(currentTemplateLinkedUuids)) {
        // If it's undefined, null, or any other non-array value, treat it as empty
        currentTemplateLinkedUuids = [];
    }

    // Now we can safely cast and use the current UUIDs array
    const templateLinkedUuids: string[] = currentTemplateLinkedUuids as string[]; // Your target variable name
    logd(`current template linked uuids (after retrieval check):`);
    logd(templateLinkedUuids); // NOTE: I'm logging your new array here to show the current contents

    // --- Step 3: Check for Duplicates and Merge ---

    // Check if the new UUID is already in the array
    if (templateLinkedUuids.includes(effectUuid)) {
        logd(`UUID ${effectUuid} already linked to template.`);
    } else {
        // If the UUID is new, add it to the array
        logd(`Adding new effect uuid to template linked uuids array`);
        templateLinkedUuids.push(effectUuid);
    }

    logd(`Final template linked uuids to save:`);
    logd(templateLinkedUuids);
    
    // --- Step 4: Update the flags on the template ---
    await template.setFlag("samioli-module", 'effectUuid', templateLinkedUuids);
    // // update the template to include new effect
    // const spellSlug = spell.slug;
    // const effectSlug = `start-of-turn-spell-${spellSlug}`;
    // const effectUuid = token.actor.items.find(item => item.type === 'effect' && item.slug === effectSlug)?.uuid as string;
    // logd(`effect uuid:`);
    // logd(effectUuid);
    // const templateLinkedUuids = [];
    // const currentTemplateLinkedUuids = template.getFlag('samioli-module', 'effectUuid') as string[];
    // logd(`current template linked uuids:`);
    // logd(currentTemplateLinkedUuids);

    // if (currentTemplateLinkedUuids) {
    //     logd(`adding effect uuid to current template linked uuids`);
    //     currentTemplateLinkedUuids.forEach(uuid => templateLinkedUuids.push(uuid));
    //     logd(`post merge current template linked uuids:`);
    //     logd(currentTemplateLinkedUuids);
    // } else {
    //     logd(`no current template linked uuids`);
    //     logd(`adding effect uuid to new template linked uuids array`);
    //     templateLinkedUuids.push(effectUuid);
    //     logd(`new template linked uuids:`);
    //     logd(templateLinkedUuids);
    // }
    
    // await template.setFlag("samioli-module", 'effectUuid', templateLinkedUuids);
}

async function removeSpellEffectFromTokenActor(token: TokenPF2e, spellEffect: ItemPF2e, template: MeasuredTemplateDocumentPF2e) {
    if (!token.actor) return;
    const spellEffectUuid = spellEffect.uuid;
    await spellEffect.delete();
    // update the template to remove the effect
    const templateLinkedUuids = template.getFlag('samioli-module', 'effectUuid') as string[];
    const newTemplateLinkedUuids = templateLinkedUuids.filter(uuid => uuid !== spellEffectUuid);
    await template.setFlag("samioli-module", 'effectUuid', newTemplateLinkedUuids);
}

export async function checkIfTokenIsWithinTemplateBoundsAndUpdateIfNeeded(token: TokenPF2e, spaces: number) {
    // check if there are any templates
    logd(`Checking if there are any templates`);
    const activeTemplates = canvas.templates.placeables;

    if (activeTemplates.length === 0) {
        logd(`There are no templates on the canvas. No need to calculate.`)
        return;
    }
    const validTemplates = [];

    logd(`Checking if there are any valid templates`);

    // are any of the templates flagged with start of turn logic?
    for (const template of activeTemplates) {

        if (template.document.getFlag('samioli-module', 'isStartOfTurnSpell')) {
            logd(`Template ${template.id} is a start of turn spell`);
            validTemplates.push(template);
        }
    }

    if (validTemplates.length === 0) {
        logd(`There are no valid templates on the canvas. No need to calculate.`)
        return;
    }

    logd(`There are valid templates on the canvas, so tracking token movement`)
    logd(`Adding a delay to see if this allows the token to finish moving before checking if it's in the template area`)
    await delay(spaces * 170);

    // for all templates flagged with start of turn logic, is the token within one?
    for (const template of validTemplates) {
        if (await isTokenInTemplateArea(token, template.document)) {
            // token is within the template
            logd(`Token ${token.id} is within template ${template.id}`)
            // check if token.actor already has the effect.
            const actor = token.actor;
            if (!actor) return;
            const effect = actor.items.find(item => item.type === 'effect' && (item.flags?.["samioli-module"]?.templateId === template.id));
            // apply if it doesn't.
            if (!effect) {
                logd(`Token does not have effect`);
                const spellUuid = template.document.flags.pf2e.origin?.uuid as string;
                const spell = fromUuidSync(spellUuid) as SpellPF2e;
                if (!spell) return;
                logd(`Adding spell effect to token actor`);
                await addSpellEffectToTokenActor(token, spell, template.document);
            }
            
        } else {
            // token is not within the template
            logd(`Token is not within template`)
            // check if token.actor already has the effect.
            const actor = token.actor;
            if (!actor) return;
            const effect = actor.items.find(item => item.type === 'effect' && (item.flags?.["samioli-module"]?.templateId === template.id));
            if (effect) {
                logd(`Token has effect`)
                // remove if it does.
                logd(`Removing spell effect from token actor`);
                removeSpellEffectFromTokenActor(token, effect, template.document);
                // update template to remove effect uuid from it
            } else {
                logd(`Token does not have effect, so nothing to remove`);
            }
        }   
    }
}

export async function checkIfCombatantIsStartingTurnWhileUnderTemplate(combatant: CombatantPF2e) {
    const actor = combatant.token?.actor;
    if (!actor) return;
    const startOfTurnEffects = actor.items.filter(item => 
        item.type === 'effect' && typeof item.slug === 'string' && item.slug.startsWith('start-of-turn-spell-')
    );
    if (startOfTurnEffects.length === 0) {
        return;
    }

    for (const effect of startOfTurnEffects) {

        const speakerUuid = effect.flags["samioli-module"]?.actorUuid as string;
        if (!speakerUuid) return;
        const speaker = fromUuidSync(speakerUuid) as ActorPF2e;
        if (!speaker) return;
        const spellUuid = effect.flags["samioli-module"]?.spellUuid as string;
        const spellName = fromUuidSync(spellUuid)?.name as string;
        
        const content = `${combatant.name} has started their turn within ${spellName}`

        await sendBasicChatMessage(content, [], speaker);

        await addSpellBackIntoChat(effect);
    }
}

export async function checkIfTemplateHasEffectsAndDeleteIfNeeded(template: MeasuredTemplateDocumentPF2e) {
    const effectUuids = template.getFlag('samioli-module', 'effectUuid') as string[];
    if (effectUuids.length === 0) return;

    logd(`Effects that should be deleted:`)
    logd(effectUuids)

    for (const effectUuid of effectUuids) {
        const effect = fromUuidSync(effectUuid) as ItemPF2e;
        if (!effect) continue;
        await effect.delete();
    }
}

async function addSpellBackIntoChat(effect: ItemPF2e) {
    const spellUuid = effect.flags["samioli-module"].spellUuid as string;
    if (!spellUuid) return;
    const spell = fromUuidSync(spellUuid) as SpellPF2e;
    if (!spell) return;
    await spell.toMessage();
}

function createStartOfTurnEffect(spell: SpellPF2e, template: MeasuredTemplateDocumentPF2e) {

    const startOfTurnSpellEffectPrefix = 'Within: '

    const effectName = `${ startOfTurnSpellEffectPrefix}${spell.name}`;
    const description = spell.system.description.value;

    const effectLevel = spell.system.level?.value ?? spell.parent?.level ?? 1;
    const image = spell.img;

    return {
        type: 'effect',
        name: effectName,
        img: image,
        system: {
            tokenIcon: { show: true },
            duration: {
                value: null,
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
            source: spell.system.source,
            slug: `start-of-turn-spell-${spell.system.slug}`
        },
        flags: {
            "samioli-module": {
                spellUuid: spell.uuid,
                templateId: template.id,
                actorUuid: spell.actor?.uuid
            }
        }
    };
}