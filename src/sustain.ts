import { 
    ActorPF2e, 
    ChatMessagePF2e, 
    EffectPF2e, 
    ItemPF2e, 
    SpellPF2e, 
    EffectSource, 
    MeasuredTemplateDocumentPF2e 
} from "foundry-pf2e";
import { 
    addOrUpdateEffectOnActor, 
    deleteTemplateById, 
    isEffect, 
    MODULE_ID 
} from "./utils.ts";
import { 
    runMatchingSustainFunction, 
    runMatchingSustainDeletionFunction 
} from "./triggers.ts";
import { createChatMessageWithButton } from "./chatbuttonhelper.ts";

/**
 * Checks if a spell cast message should trigger a sustain effect tracking.
 * Automatically applies a "Sustaining: [Spell]" effect to the actor.
 */
export async function checkIfSpellInChatIsSustain(message: ChatMessagePF2e) {
    const messageItem: ItemPF2e | null = message.item;
    if (isSpellPF2e(messageItem)) {
        if (messageItem.system.duration.sustained) {
            if (!message.actor) return;
            const effect = createEffect(messageItem);
            await addOrUpdateEffectOnActor(message.actor, effect);
        }
    }
}

function isSpellPF2e(item: ItemPF2e | null | undefined): item is SpellPF2e {
    return !!item && item.type === "spell";
}

/**
 * Creates a "Sustaining: [Spell]" effect source.
 * This effect tracks the spell's duration and links it to templates or special automation.
 */
function createEffect(spell: SpellPF2e) {
    const sustainedEffectPrefix = 'Sustaining: ';
    const effectName = `${sustainedEffectPrefix}${spell.name}`;
    const description = spell.system.description.value;
    const effectLevel = spell.system.level?.value ?? spell.parent?.level ?? 1;

    const effect = {
        type: 'effect',
        name: effectName,
        img: spell.img,
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
            [MODULE_ID]: {
                sustainedSpellId: spell.id
            }
        }
    };
    
    return effect as DeepPartial<EffectSource> as EffectSource;
}

/**
 * Triggers a sustain prompt if the actor has active sustain effects.
 * Typically called at the start of an actor's turn.
 */
export async function ifActorHasSustainEffectCreateMessage(actor: ActorPF2e) {
    const sustainedEffects = getActorSustainedEffects(actor);
    if (!sustainedEffects) return;

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
    const sustainedEffects = actor.items.filter(item => 
        item.type === 'effect' && (item.slug?.startsWith('sustaining-effect-') ?? false)
    );
    return sustainedEffects.length > 0 ? sustainedEffects : undefined;
}

function getSpellBySlug(spellSlug: string, actor: ActorPF2e): SpellPF2e | null {
    return actor.itemTypes.spell.find(s => s.slug === spellSlug) ?? null;
}

/**
 * Handles the sustain action, updating duration and running triggers.
 * Orchestrates template updates or interactive sustain menus (via triggers.ts).
 */
export async function handleSustainSpell(actorId: string, effectSlug: string) {
    const actor = game.actors.get(actorId);
    if (!actor || !actor.isOwner) {
        ui.notifications.warn("You do not have permission to sustain this spell.");
        return;
    }

    const effect = actor.items.find(item => 
        item.slug === effectSlug && item.type === 'effect'
    ) as EffectPF2e;
    if (!effect) {
        ui.notifications.error("Could not find the sustained effect on the actor.");
        return;
    }

    // Update effect to next turn
    const currentStartValue = effect.system.start.value;
    const newStartValue = currentStartValue + 6;

    await effect.update({
        "system.duration.value": 1,
        "system.start.value": newStartValue,
    });

    await addSustainedSpellBackIntoChat(effect, actor);

    // Run sustain triggers (e.g., Dancing Blade menu or Floating Flame movement)
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

/**
 * Re-posts the spell card to chat during sustain, unless suppressed by flags.
 */
async function addSustainedSpellBackIntoChat(effect: EffectPF2e, actor: ActorPF2e) {
    const skipChat = !!effect.getFlag(MODULE_ID, "skipSustainChat");
    if (skipChat) return;

    const spellId = effect.getFlag(MODULE_ID, "sustainedSpellId");
    if (typeof spellId !== "string" || !spellId) return;

    const spellUuid = `Actor.${actor.id}.Item.${spellId}`;
    const spell = fromUuidSync(spellUuid);
    if (spell instanceof CONFIG.PF2E.Item.documentClasses.spell) {
        await spell.toMessage();
    }
}

/**
 * Creates the chat message with the "Sustain" button.
 */
async function createSustainChatMessage(actor: ActorPF2e, spell: SpellPF2e) {
    const effectSlug = `sustaining-effect-${spell.slug}`;
    const content = `<p>Do you want to sustain <strong>${spell.name}</strong>?</p>`;

    await createChatMessageWithButton({
        slug: "sustain-spell",
        actor: actor,
        content: content,
        button_label: "Sustain",
        params: [actor.id, effectSlug]
    });
}

/**
 * Posts a chat message notification when a sustained spell is lost (effect deleted).
 */
export async function createSpellNotSustainedChatMessage(item: ItemPF2e) {
    if (!isEffect(item) || !item.slug?.startsWith('sustaining-effect-')) return;

    const spellName = item.name.replace('Sustaining: ', '');
    const content = `<p><strong>${spellName}</strong> was not sustained.</p>`;
    await ChatMessage.create({
        content: content,
        speaker: ChatMessage.getSpeaker({ actor: item.actor })
    });
}

async function associateTemplateWithEffect(
    template: MeasuredTemplateDocumentPF2e, 
    effect: EffectPF2e
) {
    await effect.update({
        [`flags.${MODULE_ID}.sustainedTemplateId`]: template.id
    });
}

/**
 * Links a placed template to an active sustain effect.
 */
export async function checkIfTemplatePlacedHasSustainEffect(
    template: MeasuredTemplateDocumentPF2e
) {
    if (!template.actor) return;

    const sustainedEffectsOnActor = getActorSustainedEffects(template.actor);
    if (!sustainedEffectsOnActor) return;

    const spellSlugFromTemplate = template.item?.slug;
    if (!spellSlugFromTemplate) return;

    const matchingEffect = sustainedEffectsOnActor.find(effect =>
        effect.slug?.replace('sustaining-effect-', '') === spellSlugFromTemplate
    );

    if (matchingEffect) {
        await associateTemplateWithEffect(template, matchingEffect as EffectPF2e);
    }
}

/**
 * Handles cleanup when a sustain effect is deleted (templates, triggers, etc).
 */
export async function handleSustainedEffectDeletion(item: ItemPF2e) {
    if (!isEffect(item)) return;

    // 1. Automatic template cleanup
    const templateId = item.getFlag(MODULE_ID, "sustainedTemplateId"); 
    if (typeof templateId === "string" && templateId) {
        await deleteTemplateById(templateId);
    }

    // 2. Run generic spell-specific cleanup triggers (e.g., Dancing Blade target cleanup)
    runMatchingSustainDeletionFunction(item);
}
