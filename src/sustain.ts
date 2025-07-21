import { ActorPF2e, ChatMessagePF2e, EffectPF2e, SpellPF2e } from "foundry-pf2e";
import { deleteTemplateById, getOwnersFromActor } from "./utils.ts";
import { runMatchingSustainFunction } from "./triggers.ts";

export async function checkIfSpellInChatIsSustain(message: ChatMessagePF2e) {
    const spell = message.item;
    if (spell?.type === 'spell' && spell.system.duration.sustained) {
        if (!message.actor) {
            return;
        }
        const effect = createEffect(spell);
        await addEffectToActor(message.actor, effect);
    }
}

function createEffect(spell: SpellPF2e) {

    const sustainedEffectPrefix = 'Sustaining: '

    const effectName = `${sustainedEffectPrefix}${spell.name}`;
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
            source: spell.system.source,
            slug: `sustaining-effect-${spell.system.slug}`
        },
        flags: {
            samioli: {
                spellId: spell.id
            }
        }
    };
}

async function addEffectToActor(actor: ActorPF2e, effectData: any) {
    const existingEffect = actor.items.find(item => item.slug === effectData.system.slug
        && item.type === 'effect');
    if (existingEffect) {
        await existingEffect.update(effectData);
        return;
    }
    await actor.createEmbeddedDocuments('Item', [effectData]);
}

export async function ifActorHasSustainEffectCreateMessage(actor: ActorPF2e) {
    const sustainedEffects = getActorSustainedEffects(actor);
    if (!sustainedEffects) {
        return;
    }

    for (const effect of sustainedEffects) {
        const spellSlug = effect.slug.replace('sustaining-effect-', '');
        const spell = getSpellBySlug(spellSlug, actor);
        if (spell) {
            await createSustainChatMessage(actor, spell);
        }
    }
}

function getActorSustainedEffects(actor: ActorPF2e) {
    const sustainedEffects = actor.items.filter(item => item.type === 'effect' &&
        item.slug?.startsWith('sustaining-effect-'));
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

    runMatchingSustainFunction(getTemplateFromEffect(effect));
}

function getTemplateFromEffect(effect: EffectPF2e) {
    const templateId = effect.flags.samioli?.templateId;
    if (!templateId) return;
    return canvas.scene.templates.get(templateId);
}

async function addSustainedSpellBackIntoChat(effect: EffectPF2e, actor: ActorPF2e) {

    const spellId = effect.flags.samioli.spellId;
    if (!spellId) return;
    const spellUuid = 'Actor.' + actor.id + '.Item.' + spellId;
    const spell = fromUuidSync(spellUuid);
    if (!spell) return;
    await spell.toMessage();
}

async function createSustainChatMessage(actor: ActorPF2e, spell: SpellPF2e) {
    const effectSlug = `sustaining-effect-${spell.slug}`;
    const recipients = getOwnersFromActor(actor);
    const content = `
        <p>Do you want to sustain <strong>${spell.name}</strong>?</p>
        <div style="display: flex; justify-content: center; gap: 10px; margin-top: 10px;">
            <button type="button" data-action="sustain-spell" data-actor-id="${actor.id}" 
            data-effect-slug="${effectSlug}">
                Sustain
            </button>
        </div>
    `;

    await ChatMessage.create({
        content: content,
        whisper: recipients,
        speaker: ChatMessage.getSpeaker({ actor: actor }),
        flags: {
            samioli: {
                buttonSlug: `sustain-button`
            }
        }
    });
}

export async function createSpellNotSustainedChatMessage(effect: EffectPF2e) {
    if (!effect.slug?.startsWith('sustaining-effect-')) return;

    const spellName = effect.name.replace('Sustaining: ', '');
    const content = `<p><strong>${spellName}</strong> was not sustained.</p>`;
    await ChatMessage.create({
        content: content,
        speaker: ChatMessage.getSpeaker({ actor: effect.actor })
    });
}

async function associateTemplateWithEffect(template: MeasuredTemplateDocumentPF2e,
    effect: EffectPF2e) {
    await effect.update({
        'flags.samioli': {
            templateId: template.id
        }
    });
}

export async function checkIfTemplatePlacedHasSustainEffect(template: MeasuredTemplateDocumentPF2e) {

    if (!template.actor) return;

    const sustainedEffectsOnActor = getActorSustainedEffects(template.actor);
    if (!sustainedEffectsOnActor) return;

    const spellSlugFromTemplate = template.flags.pf2e.origin?.slug;
    if (!spellSlugFromTemplate) return;

    const matchingEffect = sustainedEffectsOnActor.find(effect =>
        effect.slug.replace('sustaining-effect-', '') === spellSlugFromTemplate);

    if (matchingEffect) {
        await associateTemplateWithEffect(template, matchingEffect);
    }
}

export async function deleteTemplateLinkedToSustainedEffect(effect: EffectPF2e) {

    const templateId = effect.flags.samioli?.templateId;
    if (!templateId) return;

    await deleteTemplateById(templateId);

}

export function checkIfChatMessageIsSustainButton(chatMessagePF2e: ChatMessagePF2e, html: JQuery<HTMLElement>) {
    const buttonSlug = chatMessagePF2e.flags?.samioli?.buttonSlug;
    if (!buttonSlug) return;

    if (buttonSlug === 'sustain-button') {
        const sustainButton = html.find('button[data-action="sustain-spell"]');
        if (sustainButton.length > 0) {
            sustainButton.on('click', (event) => {
                const button = event.currentTarget;
                const { actorId, effectSlug } = button.dataset;
                if (actorId && effectSlug) {
                    handleSustainSpell(actorId, effectSlug);
                }
            });
        }
    }
}