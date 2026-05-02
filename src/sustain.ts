import { ActorPF2e, ChatMessagePF2e, EffectPF2e, ItemPF2e, SpellPF2e, EffectSource, MeasuredTemplateDocumentPF2e } from "foundry-pf2e";
import { addOrUpdateEffectOnActor, deleteTemplateById, isEffect, postUINotification, isSpellPF2e } from "./utils.ts";
import { runMatchingSustainFunction } from "./triggers.ts";
import { createChatMessageWithButton } from "./chatbuttonhelper.ts";

const MODULE_ID = "samioli-module";

const SLUGS = {
    SUSTAINING_EFFECT_PREFIX: "Sustaining: ",
    SUSTAINING_EFFECT_SLUG_PREFIX: "sustaining-effect-",
} as const;

const FLAGS = {
    SUSTAINED_SPELL_ID: "sustainedSpellId",
    SUSTAINED_TEMPLATE_ID: "sustainedTemplateId",
} as const;

/**
 * Hooked to createChatMessage. Checks if the cast spell is sustained and applies the effect.
 */
export async function checkIfSpellInChatIsSustain(message: ChatMessagePF2e) {
    const spell = message.item;
    if (!isSustainedSpell(spell) || !message.actor) return;

    await applySustainingEffect(message.actor, spell);
}

/**
 * Applies the "Sustaining: [Spell]" effect to an actor.
 */
export async function applySustainingEffect(actor: ActorPF2e, spell: SpellPF2e) {
    const effectSource = createSustainingEffectSource(spell);
    await addOrUpdateEffectOnActor(actor, effectSource);
}

/**
 * Hooked to pf2e.startTurn. Creates a chat prompt if the actor is sustaining any spells.
 */
export async function ifActorHasSustainEffectCreateMessage(actor: ActorPF2e) {
    const sustainedEffects = getActorSustainedEffects(actor);

    for (const effect of sustainedEffects) {
        const spellId = effect.getFlag(MODULE_ID, FLAGS.SUSTAINED_SPELL_ID);
        if (typeof spellId !== "string") continue;

        const spell = actor.items.get(spellId) as SpellPF2e | null;
        if (spell) {
            await createSustainChatMessage(actor, spell, effect);
        }
    }
}

/**
 * Triggered by the "Sustain" button in chat.
 */
export async function handleSustainSpell(actorId: string, effectSlug: string) {
    const actor = game.actors.get(actorId) as ActorPF2e | null;
    if (!actor || !actor.isOwner) {
        postUINotification("You do not have permission to sustain this spell.", "warn");
        return;
    }

    const effect = actor.itemTypes.effect.find(e => e.slug === effectSlug);
    if (!effect) {
        postUINotification("Could not find the sustained effect on the actor.", "error");
        return;
    }

    // Increment the start value by 6 seconds (1 round) to keep the effect active
    const currentStartValue = effect.system.start.value ?? 0;
    await effect.update({
        "system.duration.value": 1,
        "system.start.value": currentStartValue + 6,
    });

    await postSustainedSpellToChat(effect, actor);

    const template = getTemplateFromEffect(effect);
    if (template) {
        runMatchingSustainFunction(template);
    }
}

/**
 * Hooked to createMeasuredTemplate. Links a newly placed template to a sustaining effect.
 */
export async function checkIfTemplatePlacedHasSustainEffect(
    template: MeasuredTemplateDocumentPF2e
) {
    const actor = template.actor;
    const item = template.item;
    if (!actor || !item) return;

    // Find the sustained effect for this spell that hasn't been linked to a template yet
    const matchingEffect = getActorSustainedEffects(actor).find(effect =>
        effect.getFlag(MODULE_ID, FLAGS.SUSTAINED_SPELL_ID) === item.id &&
        !effect.getFlag(MODULE_ID, FLAGS.SUSTAINED_TEMPLATE_ID)
    );

    if (matchingEffect) {
        await matchingEffect.setFlag(MODULE_ID, FLAGS.SUSTAINED_TEMPLATE_ID, template.id);
    }
}

/**
 * Hooked to preDeleteItem. Notifies when a sustained spell ends.
 */
export async function createSpellNotSustainedChatMessage(item: ItemPF2e) {
    if (!isEffect(item) || !item.slug?.startsWith(SLUGS.SUSTAINING_EFFECT_SLUG_PREFIX)) return;

    const spellName = item.name.replace(SLUGS.SUSTAINING_EFFECT_PREFIX, '');
    const content = `<p><strong>${spellName}</strong> was not sustained.</p>`;

    await ChatMessage.create({
        content: content,
        speaker: ChatMessage.getSpeaker({ actor: item.actor })
    });
}

/**
 * Hooked to preDeleteItem. Deletes any template linked to the deleted sustaining effect.
 */
export async function deleteTemplateLinkedToSustainedEffect(item: ItemPF2e) {
    if (!isEffect(item)) return;

    const templateId = item.getFlag(MODULE_ID, FLAGS.SUSTAINED_TEMPLATE_ID);
    if (typeof templateId === "string" && templateId) {
        await deleteTemplateById(templateId);
    }
}

// --- Helper Functions ---

/**
 * Minimal interface to bypass deep type instantiation errors on SpellPF2e.system
 */
interface MinimalSpellSystem {
    duration: { sustained: boolean };
    description: { value: string; [key: string]: unknown };
    level: { value: number };
    slug: string | null;
}

function getSpellSystem(spell: SpellPF2e): MinimalSpellSystem {
    return spell.system as unknown as MinimalSpellSystem;
}

function isSustainedSpell(item: ItemPF2e | null | undefined): item is SpellPF2e {
    if (!item || !isSpellPF2e(item)) return false;
    return getSpellSystem(item).duration.sustained;
}

function getActorSustainedEffects(actor: ActorPF2e): EffectPF2e[] {
    return actor.itemTypes.effect.filter(effect =>
        effect.slug?.startsWith(SLUGS.SUSTAINING_EFFECT_SLUG_PREFIX)
    );
}

function getTemplateFromEffect(effect: EffectPF2e): MeasuredTemplateDocumentPF2e | null {
    const templateId = effect.getFlag(MODULE_ID, FLAGS.SUSTAINED_TEMPLATE_ID);
    if (typeof templateId !== "string" || !templateId) return null;
    const template = canvas.scene?.templates.get(templateId) as MeasuredTemplateDocumentPF2e;
    return template ?? null;
}

async function postSustainedSpellToChat(effect: EffectPF2e, actor: ActorPF2e) {
    const spellId = effect.getFlag(MODULE_ID, FLAGS.SUSTAINED_SPELL_ID);
    if (typeof spellId !== "string") return;

    const spell = actor.items.get(spellId);
    if (spell && isSpellPF2e(spell)) {
        await spell.toMessage();
    }
}

async function createSustainChatMessage(actor: ActorPF2e, spell: SpellPF2e, effect: EffectPF2e) {
    const content = `<p>Do you want to sustain <strong>${spell.name}</strong>?</p>`;

    await createChatMessageWithButton({
        slug: "sustain-spell",
        actor: actor,
        content: content,
        button_label: "Sustain",
        params: [actor.id, effect.slug ?? ""]
    });
}

function createSustainingEffectSource(spell: SpellPF2e): EffectSource {
    const effectLevel = spell.system.level?.value ?? spell.parent?.level ?? 1;

    const source = {
        type: 'effect',
        name: `${SLUGS.SUSTAINING_EFFECT_PREFIX}${spell.name}`,
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
            },
            unidentified: false,
            level: { value: effectLevel },
            slug: `${SLUGS.SUSTAINING_EFFECT_SLUG_PREFIX}${spell.system.slug}`
        },
        flags: {
            [MODULE_ID]: {
                [FLAGS.SUSTAINED_SPELL_ID]: spell.id
            }
        }
    };

    return source as DeepPartial<EffectSource> as EffectSource;
}
