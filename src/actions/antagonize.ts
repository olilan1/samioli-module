import { ActorPF2e, ChatMessagePF2e, CheckContextChatFlag, EffectPF2e, ItemPF2e } from "foundry-pf2e"
import { getDisplayNameFromActor, getOwnersFromActor, isCondition } from "../utils.ts";
import { ImageFilePath } from "foundry-pf2e/foundry/common/constants.mjs";

export async function applyAntagonizeIfValid(chatMessage: ChatMessagePF2e) {
    const context = chatMessage.flags.pf2e.context as CheckContextChatFlag;

    if (!context?.options?.includes("action:demoralize")) return;

    if (!(context.outcome === "success" || context.outcome === "criticalSuccess")) {
        return;
    }

    const demoralizer = chatMessage.actor;

    if (!demoralizer?.items.some(item => item.type === "feat" && item.system.slug === "antagonize")) {
        return;
    }

    const targetActorId = context?.target?.actor?.split('.').pop();
    if (!targetActorId) return;

    const target = chatMessage.target?.actor;
    if (!target) return;

    await applyAntagonizedEffect(target, demoralizer);
}

async function applyAntagonizedEffect(target: ActorPF2e, antagonizer: ActorPF2e) {
    const image = "icons/skills/social/intimidation-impressing.webp";
    const antagonizerName = getDisplayNameFromActor(antagonizer);
    const antagonizedEffectData = {
        name: `Antagonized by ${antagonizerName}`,
        type: "effect",
        img: image as ImageFilePath,
        system: {
            slug: "samioli-antagonized",
            description: {
                value: `<p>Antagonized by ${antagonizerName}.</p>
                <p>Its frightened condition can't decrease to less than 1 at the end of its turn until it either uses a hostile action against ${antagonizerName} or can no longer observe or sense them for at least 1 round.</p>`
            },
            duration: {
                value: null,
                unit: "unlimited",
                sustained: false,
                expiry: null
            },
            tokenIcon: {
                show: true
            }
        },
        flags: {
            samioli: {
                antagonizer: antagonizer.id
            }
        }
    };

    await target.createEmbeddedDocuments("Item", [antagonizedEffectData]);
    
}

export async function createChatMessageIfActorIsAntagonized(actor: ActorPF2e) {

    const antagonizedEffects = getActorAntagonizedEffects(actor);

    for (const effect of antagonizedEffects) {
        const antagonizerId = effect.flags.samioli?.antagonizer as string;
        const antagonizer = game.actors.get(antagonizerId);
        if (!antagonizer) return;

        await createAntagonizedChatMessage(actor, antagonizer);
    }
}

export function getActorAntagonizedEffects(actor: ActorPF2e) {
    return actor.items.filter(item => item.type === 'effect' && 
        item.slug === 'samioli-antagonized') as EffectPF2e[];
}

async function createAntagonizedChatMessage(actor: ActorPF2e, antagonizer: ActorPF2e) {

    const recipients = getOwnersFromActor(actor);
    const antagonizerName = getDisplayNameFromActor(antagonizer)
    const actorName = getDisplayNameFromActor(actor);
    const content = 
        `<p><strong>${actorName}</strong> is antangonized by <strong>${antagonizerName}</strong>.</p>`;

    await ChatMessage.create({
        content: content,
        whisper: recipients.map(user => user.id),
        speaker: ChatMessage.getSpeaker({ actor: actor }),
    });
}

export function warnIfDeletedItemIsFrightenedWhileAntagonized(item: ItemPF2e) {
    
    if (!isCondition(item)) return;

    if (item.rollOptionSlug !== "frightened") {
        return;
    }

    if (item.system.value.value !== 1) {
        return;
    }

    const actor = item.actor;
    if (!actor) return;

    const hasAntagonizeEffect = actor.items.some(item => 
        item.type === "effect" && item.system.slug === "samioli-antagonized"
    );

    if (!hasAntagonizeEffect) return;

    const actorName = getDisplayNameFromActor(actor);

    ui.notifications.warn(actorName + " is antagonized. Frightened should not be removed unless they took a hostile action against their antagonizer, or they can no longer observe or sense them for at least one round.");

}