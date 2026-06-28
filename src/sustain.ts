import { ActorPF2e, ChatMessagePF2e, EffectPF2e, ItemPF2e, SpellPF2e, EffectSource, MeasuredTemplateDocumentPF2e } from "foundry-pf2e";
import { addOrUpdateEffectOnActor, deleteTemplateById, isEffect, MODULE_ID, isSpellPF2e, sendBasicChatMessage } from "./utils.ts";
import { runMatchingSustainFunction, runMatchingSustainDeletionFunction, MANUAL_SUSTAIN_SPELLS } from "./triggers.ts";
import { createChatMessageWithButton } from "./chatbuttonhelper.ts";
import { getSocket, DELETE_SUMMON } from "./sockets.ts";

export async function addSustainEffectToCaster(message: ChatMessagePF2e) {
    if (message.actor && isSpellPF2e(message.item)) {
        await addSustainEffectToActor(message.actor, message.item as unknown as SpellPF2e);
    }
}

export function isAutomaticSustainSpell(item: ItemPF2e | null): boolean {
    if (!isSpellPF2e(item)) return false;
    const spell = item as unknown as SpellPF2e;
    return hasSustainedDuration(spell) && !MANUAL_SUSTAIN_SPELLS.has(getSpellSlug(spell));
}

/**
 * Safely extracts the slug from a SpellPF2e.
 * We cast through unknown to break the deep type recursion of the PF2e Spell type,
 * which otherwise causes "Type instantiation is excessively deep" errors.
 */
function getSpellSlug(spell: SpellPF2e): string {
    return (spell as unknown as { slug: string | null }).slug ?? "";
}

export function hasSustainedDuration(spell: SpellPF2e): boolean {
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
                sustained: true,
                ...(extraFlags ?? {})
            }
        }
    };

    return addOrUpdateEffectOnActor(actor, effect as DeepPartial<EffectSource> as EffectSource);
}

export async function postSustainMessagesForActor(actor: ActorPF2e) {
    const sustainedEffects = getActorSustainedEffects(actor);
    if (!sustainedEffects) {
        return;
    }

    await resetSustainFlagsForActor(actor);

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
        [`flags.${MODULE_ID}.sustained`]: true,
    });

    await postSustainChatMessage(effect);

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

async function postSustainChatMessage(effect: EffectPF2e) {

    const spell = getSpellFromEffect(effect)
    if (!spell) return;

    const skipChat = !!effect.getFlag(MODULE_ID, "skipSustainChat");
    // Do not add spell message back into chat if spell is a summon
    // Instead, we add a message to confirm that it's been sustained
    if (spell.traits.has('summon') || skipChat) {
        const content = `<p><strong>${spell.name}</strong> was sustained.</p>`;
        sendBasicChatMessage(content, spell.actor!);
        return;
    }
    await spell.toMessage();
}

function getSpellFromEffect(effect: EffectPF2e): SpellPF2e | undefined {
    const spellId = effect.getFlag(MODULE_ID, "sustainedSpellId");
    if (typeof spellId !== "string" || !spellId) return;
    const spellUuid = 'Actor.' + effect.actor!.id + '.Item.' + spellId;
    const spell = fromUuidSync(spellUuid);
    if (!(spell instanceof CONFIG.PF2E.Item.documentClasses.spell)) return;
    return spell;
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

    const spell = getSpellFromEffect(item as EffectPF2e)
    if (!spell) return;

    const isSummonAssistantEnabled = game.modules.get('pf2e-summons-assistant')?.active;
    const isSpellASummon = spell.traits.has('summon');
    const casterHasActiveSummons = !!getSummonedTokensFromCanvas(item.actor?.id!)

    // if spell is a summon, module is active and there are relevant summons on the canvas 
    // create a chat with a button to remove the summoned token    
    if (isSummonAssistantEnabled && isSpellASummon && casterHasActiveSummons) {
        if (!item.actor) return;
        await createChatMessageWithButton({
            slug: "remove-summon",
            actor: item.actor,
            content: content,
            button_label: "Remove summon?",
            params: [item.actor.id]
        });
        return;
    }

    await ChatMessage.create({
        content: content,
        speaker: ChatMessage.getSpeaker({ actor: item.actor })
    });
}

function getSummonedTokensFromCanvas(casterId: string) {
    const tokens = canvas.tokens?.placeables ?? [];
    const summons = tokens.filter(token => {
        const actor = token.actor;
        if (!actor) return false;
        const summonerId = actor.getFlag("pf2e-summons-assistant", "summoner.id");
        return actor.traits.has("summoned") && summonerId === casterId;
    });
    return summons;
}

export async function handleRemoveSummon(casterId: string) {
    if (typeof casterId !== "string" || !casterId) return;

    const summons = getSummonedTokensFromCanvas(casterId);

    if (summons.length === 0) {
        ui.notifications?.info("No matching summoned tokens found on the canvas.");
        return;
    }

    if (summons.length === 1) {
        const summon = summons[0];
        if (summon.id) {
            getSocket().executeAsGM(DELETE_SUMMON, summon.id);
        }
        return;
    }

    const { DialogV2 } = foundry.applications.api;
    const optionsHtml = summons
        .map(s => new Option(s.name, s.id).outerHTML)
        .join("");

    const summonId = await DialogV2.wait({
        window: { title: "Which Summon was not sustained?" },
        content: `
            <form>
                <div class="form-group">
                    <select name="summonSelect">
                        ${optionsHtml}
                    </select>
                </div>
            </form>
        `,
        buttons: [{
            action: "remove",
            label: "Remove",
            default: true,
            callback: async (_event, _button, dialog) => {
                const selectElement = dialog.element.querySelector<HTMLSelectElement>(
                    '[name="summonSelect"]'
                );
                return selectElement?.value;
            }
        }],
        rejectClose: false
    }) as string | undefined;

    if (summonId) {
        getSocket().executeAsGM(DELETE_SUMMON, summonId);
    }
}

export async function deleteSummonAsGM(summonId: string) {
    if (typeof summonId !== "string") return;
    const tokenDocument = canvas.scene?.tokens.get(summonId);
    if (tokenDocument) {
        await tokenDocument.delete();
    }
}

async function associateTemplateWithEffect(template: MeasuredTemplateDocumentPF2e,
    effect: EffectPF2e) {
    await effect.update({
        [`flags.${MODULE_ID}.sustainedTemplateId`]: template.id
    });
}

export async function associateTemplateWithSustainedEffect(
    template: MeasuredTemplateDocumentPF2e
) {
    const actor = template.actor;
    if (!actor) return;

    const sustainedEffectsOnActor = getActorSustainedEffects(actor);
    if (!sustainedEffectsOnActor) return;

    const spellSlugFromTemplate = template.item?.slug;
    if (!spellSlugFromTemplate) return;

    const matchingEffect = sustainedEffectsOnActor.find(effect => {
        const spellId = effect.getFlag(MODULE_ID, "sustainedSpellId") as string;
        const spell = actor.items.get(spellId) as SpellPF2e;
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

/**
 * Checks if the actor associated with the template has any active sustaining effects.
 */
export function hasSustainingEffect(template: MeasuredTemplateDocumentPF2e): boolean {
    return template.actor?.items.some(
        i => i.type === "effect" && (i.slug?.startsWith("sustaining-effect-") ?? false)
    ) ?? false;
}

async function resetSustainFlagsForActor(actor: ActorPF2e) {
    const sustainedEffects = getActorSustainedEffects(actor);
    if (!sustainedEffects) return;

    for (const effect of sustainedEffects) {
        if (effect.getFlag(MODULE_ID, "sustained") !== false) {
            await effect.update({ [`flags.${MODULE_ID}.sustained`]: false });
        }
    }
}

export async function expireUnsustainedEffectsForActor(actor: ActorPF2e) {
    const sustainedEffects = getActorSustainedEffects(actor);
    if (!sustainedEffects) return;

    for (const effect of sustainedEffects) {
        if (effect.getFlag(MODULE_ID, "sustained") === false) {
            await effect.delete();
        }
    }
}
