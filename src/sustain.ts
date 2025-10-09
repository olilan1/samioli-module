import { ActorPF2e, ChatMessagePF2e, EffectPF2e, ItemPF2e, SpellPF2e, EffectSource, MeasuredTemplateDocumentPF2e } from "foundry-pf2e";
import { addEffectToActor, deleteTemplateById, isEffect } from "./utils.ts";
import { runMatchingSustainFunction } from "./triggers.ts";
import { createChatMessageWithButton } from "./chatbuttonhelper.ts";

export async function checkIfSpellInChatIsSustain(message: ChatMessagePF2e) {
    const messageItem = message.item;
    if (messageItem?.type === 'spell') {
        const spell = messageItem as SpellPF2e;
        if (spell.system.duration.sustained) {
            if (!message.actor) {
                return;
            }
            const effect = createEffect(spell);
            await addEffectToActor(message.actor, effect);
        }
    }
}

function createEffect(spell: SpellPF2e) {

    const sustainedEffectPrefix = 'Sustaining: '

    const effectName = `${sustainedEffectPrefix}${spell.name}`;
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
                value: 1,
                unit: "rounds",
                sustained: true,
                expiry: 'turn-end'
            },
            description: {
                ...spell.system.description,
                value: description
            },
            unidentified: false,
            level: { value: effectLevel },
            slug: `sustaining-effect-${spell.system.slug}`
        },
        flags: {
            "samioli-module": {
                sustainedSpellId: spell.id
            }
        }
    };
    
    return effect as DeepPartial<EffectSource> as EffectSource;
}

export async function ifActorHasSustainEffectCreateMessage(actor: ActorPF2e) {
    const sustainedEffects = getActorSustainedEffects(actor);
    if (!sustainedEffects) {
        return;
    }

    for (const effect of sustainedEffects) {
        if (!effect.slug) continue;
        const spellSlug = effect.slug.replace('sustaining-effect-', '');
        const spell = getSpellBySlug(spellSlug, actor);
        if (spell) {
            await createSustainChatMessage(actor, spell);
        }
    }
}

function getActorSustainedEffects(actor: ActorPF2e) {
    const sustainedEffects = actor.items.filter(item => item.type === 'effect' &&
        (item.slug?.startsWith('sustaining-effect-') ?? false));
    if (sustainedEffects.length === 0) {
        return;
    }
    return sustainedEffects;
}

function getSpellBySlug(spellSlug: string, actor: ActorPF2e): SpellPF2e | null {
    return actor.itemTypes.spell.find(s => s.slug === spellSlug) ?? null;
}

export async function handleSustainSpell(actorId: string, effectSlug: string) {
    const actor = game.actors.get(actorId);
    if (!actor || !actor.isOwner) {
        ui.notifications.warn("You do not have permission to sustain this spell.");
        return;
    }

    const effect = actor.items.find(item => item.slug === effectSlug
        && item.type === 'effect') as EffectPF2e;
    if (!effect) {
        ui.notifications.error("Could not find the sustained effect on the actor.");
        return;
    }

    const currentStartValue = effect.system.start.value;
    const newStartValue = currentStartValue + 6;

    await effect.update({
        "system.duration.value": 1,
        "system.start.value": newStartValue,
    });

    await addSustainedSpellBackIntoChat(effect, actor);

    const template = getTemplateFromEffect(effect);
    if (template) {
        runMatchingSustainFunction(template);
    }
}

function getTemplateFromEffect(effect: EffectPF2e) {
    const templateId = effect.getFlag("samioli-module", "sustainedTemplateId");
    if (typeof templateId !== "string" || !templateId) return;
    if (!canvas.scene) return;
    return canvas.scene.templates.get(templateId);
}

async function addSustainedSpellBackIntoChat(effect: EffectPF2e, actor: ActorPF2e) {
    const spellId = effect.getFlag("samioli-module", "sustainedSpellId");
    if (typeof spellId !== "string" || !spellId) return;
    if (!spellId) return;
    const spellUuid = 'Actor.' + actor.id + '.Item.' + spellId;
    const spell = fromUuidSync(spellUuid);
    if (!(spell instanceof CONFIG.PF2E.Item.documentClasses.spell)) return;
    await spell.toMessage();
}

async function createSustainChatMessage(actor: ActorPF2e, spell: SpellPF2e) {
    const effectSlug = `sustaining-effect-${spell.slug}`;
    const content = `
        <p>Do you want to sustain <strong>${spell.name}</strong>?</p>
    `;

    await createChatMessageWithButton({
        slug: "sustain-spell",
        actor: actor,
        content: content,
        button_label: "Sustain",
        params: [actor.id, effectSlug]
    });
}

export async function createSpellNotSustainedChatMessage(item: ItemPF2e) {
    
    if (!isEffect(item)) return;

    if (!item.slug?.startsWith('sustaining-effect-')) return;

    const spellName = item.name.replace('Sustaining: ', '');
    const content = `<p><strong>${spellName}</strong> was not sustained.</p>`;
    await ChatMessage.create({
        content: content,
        speaker: ChatMessage.getSpeaker({ actor: item.actor })
    });
}

async function associateTemplateWithEffect(template: MeasuredTemplateDocumentPF2e,
    effect: EffectPF2e) {
    await effect.update({
        'flags.samioli-module': {
            sustainedTemplateId: template.id
        }
    });
}

export async function checkIfTemplatePlacedHasSustainEffect(template: MeasuredTemplateDocumentPF2e) {

    if (!template.actor) return;

    const sustainedEffectsOnActor = getActorSustainedEffects(template.actor);
    if (!sustainedEffectsOnActor) return;

    const spellSlugFromTemplate = template.item?.slug;
    if (!spellSlugFromTemplate) return;

    const matchingEffect = sustainedEffectsOnActor.find(effect =>
        effect.slug?.replace('sustaining-effect-', '') === spellSlugFromTemplate);

    if (matchingEffect) {
        await associateTemplateWithEffect(template, matchingEffect as EffectPF2e);
    }
}

export async function deleteTemplateLinkedToSustainedEffect(item: ItemPF2e) {
    if (!isEffect(item)) return;

    const templateId = item.getFlag("samioli-module", "sustainedTemplateId"); 
    if (typeof templateId !== "string" || !templateId) {
        return;
    }

    await deleteTemplateById(templateId);

}
