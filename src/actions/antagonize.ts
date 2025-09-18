import { ActorPF2e, ChatMessagePF2e, CheckContextChatFlag, ConditionPF2e, EffectPF2e } from "foundry-pf2e"
import { getOwnersFromActor } from "../utils.ts";

export async function checkForAntagonizeFeat(chatMessage: ChatMessagePF2e) {
    const context = chatMessage?.flags?.pf2e?.context as CheckContextChatFlag;
    if (!context) {
        return;
    }
    if (!context.options?.includes("action:demoralize")){
        return;
    }

    const antagonizer = game.actors.get(context.actor as string);
    if (!antagonizer) {
        return;
    }

    if (!antagonizer.items.contents.some(item => item.type === "feat" && item.system.slug === "antagonize")) {
        return;
    }

    if (!(context.outcome === "success" || context.outcome === "criticalSuccess")) {
        return;
    }

    const targetActorId = context?.target?.actor?.split('.').pop();
    if (!targetActorId) return;

    const target = game.actors.get(targetActorId);
    if (!target) {
        return;
    }

    await applyAntagonizedEffect(target, antagonizer);
}

async function applyAntagonizedEffect(target: ActorPF2e, antagonizer: ActorPF2e) {
    const icon = "icons/skills/social/intimidation-impressing.webp";
    const antagonizerName = antagonizer.prototypeToken?.name ?? antagonizer.name;
        const antagonizedEffectData = {
            name: `Antagonized by ${antagonizerName}`,
            type: "effect",
            img: icon,
            system: {
                description: {
                    value: `<p>This creature has been antagonized by ${antagonizerName}.</p>
                    <p>Its frightened condition can't decrease to less than 1 at the end of its turn until it either uses a hostile action against ${antagonizerName} or can no longer observe or sense them for at least 1 round.</p>`
                },
                slug: `antagonize`,
                duration: { value: 1, unit: "days" },
                level: { value: 0 },
                tokenIcon: { show: true }
            },
            flags: {
                samioli: {
                    antagonizer: antagonizer.id
                }
            }
        };

        await target.createEmbeddedDocuments("Item", [antagonizedEffectData]);
        
}

export async function automatedAntagonize(actor: ActorPF2e) {

    const antagonizedEffects = checkIfActorIsAntagonized(actor);
    if (!antagonizedEffects) {
        return;
    }

    for (const effect of antagonizedEffects) {
        const antagonizerId = effect.flags.samioli?.antagonizer;
        if (typeof antagonizerId !== 'string' || !antagonizerId) {
            continue;
        }

        const antagonizer = game.actors.get(antagonizerId);
        if (!antagonizer) {
            return;
        }    
        await createAntagonizedChatMessage(actor, antagonizer);
    }
}

export function checkIfActorIsAntagonized(actor: ActorPF2e) {
    const antagonizedEffects = actor.items.filter(item => item.type === 'effect' &&
        item.slug === 'antagonize');
    
        if (antagonizedEffects.length === 0) {
        return;
    }
    return antagonizedEffects as EffectPF2e[];
}

async function createAntagonizedChatMessage(actor: ActorPF2e, antagonizer: ActorPF2e) {

    const recipients = getOwnersFromActor(actor);
    const antagonizerName = antagonizer.prototypeToken?.name ?? antagonizer.name;
    const content = 
        `<p><strong>${antagonizerName}</strong> is antangonizing <strong>${actor.name}</strong>.</p>`;

    await ChatMessage.create({
        content: content,
        whisper: recipients,
        speaker: ChatMessage.getSpeaker({ actor: actor }),
    });
}

export function checkIfDeletedItemIsFrightenedWhileAntagonized(condition: ConditionPF2e) {
    
    if (condition.type !== "condition" || condition.rollOptionSlug !== "frightened") {
        return;
    }

    if (condition.system.value.value !== 1){
        return;
    }

    const actor = condition.actor;
    if (!actor) {
        return; 
    }

    const hasAntagonizeEffect = actor.items.some(item => 
        item.type === "effect" && item.system.slug === "antagonize"
    );

    if (!hasAntagonizeEffect) {
        return;
    }

    ui.notifications.warn("Actor is antagonized. Frightened should not be removed unless they took a hostile action against their antagonizer, or they can no longer observe or sense them for at least one round.");

}