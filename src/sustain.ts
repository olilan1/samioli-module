import { ActorPF2e, ChatMessagePF2e, EffectPF2e, ItemPF2e, SpellPF2e, EffectSource, MeasuredTemplateDocumentPF2e } from "foundry-pf2e";
import { addOrUpdateEffectOnActor, deleteTemplateById, isEffect, MODULE_ID, isSpellPF2e } from "./utils.ts";
import { runMatchingSustainFunction, runMatchingSustainDeletionFunction, MANUAL_SUSTAIN_SPELLS } from "./triggers.ts";
import { createChatMessageWithButton } from "./chatbuttonhelper.ts";

export async function checkIfSpellInChatIsSustain(message: ChatMessagePF2e) {
    const messageItem = message.item;
    if (isSpellPF2e(messageItem)) {
        if (hasSustainedDuration(messageItem)) {
            if (MANUAL_SUSTAIN_SPELLS.has(getSpellSlug(messageItem))) return;
            if (!message.actor) return;
            await addSustainEffectToActor(message.actor, messageItem as unknown as SpellPF2e);
        }
    }
}

/**
 * Safely extracts the slug from a SpellPF2e.
 * We cast through unknown to break the deep type recursion of the PF2e Spell type,
 * which otherwise causes "Type instantiation is excessively deep" errors.
 */
function getSpellSlug(spell: SpellPF2e): string {
    return (spell as unknown as { slug: string | null }).slug ?? "";
}

function hasSustainedDuration(spell: SpellPF2e): boolean {
    // We cast through unknown to avoid "Type instantiation is excessively deep" errors 
    // caused by the complexity of the PF2e system's Spell types.
    const system = spell.system as unknown as { duration?: { sustained?: boolean } };
    return !!system.duration?.sustained;
}

export async function addSustainEffectToActor(
    actor: ActorPF2e,
    spell: SpellPF2e,
    extraSlugStr?: string,
    extraFlags?: Record<string, unknown>,
    imgOverride?: string,
) {

    const sustainedEffectPrefix = 'Sustaining: ';
    const subtitle = extraFlags?.sustainedSubtitle as string | undefined;
    const effectName = subtitle ? `${sustainedEffectPrefix}${spell.name} (${subtitle})` : `${sustainedEffectPrefix}${spell.name}`;
    const description = spell.system.description.value;

    const effectLevel = spell.system.level?.value ?? spell.parent?.level ?? 1;
    const image = imgOverride ?? spell.img;
    const slugSuffixStr = extraSlugStr ? `-${extraSlugStr}` : "";

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
            slug: `sustaining-effect-${spell.system.slug}${slugSuffixStr}`
        },
        flags: {
            [MODULE_ID]: {
                sustainedSpellId: spell.id,
                ...(extraFlags ?? {})
            }
        }
    };
    
    return addOrUpdateEffectOnActor(actor, effect as DeepPartial<EffectSource> as EffectSource);
}

export async function ifActorHasSustainEffectCreateMessage(actor: ActorPF2e) {
    const sustainedEffects = getActorSustainedEffects(actor);
    if (!sustainedEffects) {
        return;
    }

    for (const effect of sustainedEffects) {
        if (!effect.slug) continue;
        const spellId = effect.getFlag(MODULE_ID, "sustainedSpellId") as string;
        const spell = actor.items.get(spellId) as SpellPF2e;
        if (spell) {
            await createSustainChatMessage(actor, spell, effect as EffectPF2e);
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

    await effect.update({
        "system.duration.value": 1,
        "system.start.value": game.time.worldTime,
    });

    await addSustainedSpellBackIntoChat(effect, actor);

    const template = getTemplateFromEffect(effect);
    if (template) {
        runMatchingSustainFunction(template);
    } else {
        runMatchingSustainFunction(effect);
    }
}

function getTemplateFromEffect(effect: EffectPF2e) {
    const templateId = effect.getFlag(MODULE_ID, "sustainedTemplateId");
    if (typeof templateId !== "string" || !templateId) return;
    return canvas.scene?.templates.get(templateId);
}

async function addSustainedSpellBackIntoChat(effect: EffectPF2e, actor: ActorPF2e) {
    const skipChat = !!effect.getFlag(MODULE_ID, "skipSustainChat");
    if (skipChat) return;

    const spellId = effect.getFlag(MODULE_ID, "sustainedSpellId");
    if (typeof spellId !== "string" || !spellId) return;
    const spellUuid = 'Actor.' + actor.id + '.Item.' + spellId;
    const spell = fromUuidSync(spellUuid);
    if (!(spell instanceof CONFIG.PF2E.Item.documentClasses.spell)) return;
    await spell.toMessage();
}

async function createSustainChatMessage(actor: ActorPF2e, spell: SpellPF2e, effect: EffectPF2e) {
    const effectSlug = effect.slug;
    const subtitle = effect.getFlag(MODULE_ID, "sustainedSubtitle") as string | undefined;

    const spellNameStr = subtitle ? `${spell.name} (${subtitle})` : spell.name;
    const content = `<p>Do you want to sustain <strong>${spellNameStr}</strong>?</p>`;

    await createChatMessageWithButton({
        slug: "sustain-spell",
        actor: actor,
        content: content,
        button_label: "Sustain",
        params: [actor.id, effectSlug ?? ""]
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
        [`flags.${MODULE_ID}.sustainedTemplateId`]: template.id
    });
}

export async function checkIfTemplatePlacedHasSustainEffect(template: MeasuredTemplateDocumentPF2e) {

    if (!template.actor) return;

    const sustainedEffectsOnActor = getActorSustainedEffects(template.actor);
    if (!sustainedEffectsOnActor) return;

    const spellSlugFromTemplate = template.item?.slug;
    if (!spellSlugFromTemplate) return;

    const matchingEffect = sustainedEffectsOnActor.find(effect => {
        const spellId = effect.getFlag(MODULE_ID, "sustainedSpellId") as string;
        const spell = template.actor!.items.get(spellId) as SpellPF2e;
        return spell?.slug === spellSlugFromTemplate;
    });

    if (matchingEffect) {
        await associateTemplateWithEffect(template, matchingEffect as EffectPF2e);
    }
}

export async function handleSustainedEffectDeletion(item: ItemPF2e) {
    if (!isEffect(item)) return;

    const templateId = item.getFlag(MODULE_ID, "sustainedTemplateId"); 
    if (typeof templateId === "string" && templateId) {
        await deleteTemplateById(templateId);
    }

    runMatchingSustainDeletionFunction(item);
}
