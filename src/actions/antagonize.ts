import { ActorPF2e, ChatMessagePF2e, CheckContextChatFlag, CombatantPF2e, EffectPF2e, ItemPF2e, TokenPF2e } from "foundry-pf2e"
import { getDisplayNameFromActor, getOwnersFromActor, isCondition, logd } from "../utils.ts";
import { ImageFilePath } from "foundry-pf2e/foundry/common/constants.mjs";

export async function applyAntagonizeIfValid(chatMessage: ChatMessagePF2e) {
    const context = chatMessage.flags.pf2e.context as CheckContextChatFlag;

    if (!context?.options?.includes("action:demoralize")) return;

    if (!(context.outcome === "success" || context.outcome === "criticalSuccess")) {
        return;
    }

    const demoralizer = chatMessage.token?.object;

    if (!demoralizer?.actor?.items.some(item => item.type === "feat" 
        && item.system.slug === "antagonize")) {
        return;
    }

    const target = chatMessage.target?.token?.object;
    if (!target) return;

    await applyAntagonizedEffect(target, demoralizer);
}

async function applyAntagonizedEffect(targetToken: TokenPF2e, antagonizerToken: TokenPF2e) {
    const image = "icons/skills/social/intimidation-impressing.webp";
    const target = targetToken.actor;
    const antagonizer = antagonizerToken.actor;
    if (!target || !antagonizer) return;
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
                antagonizerTokenId: antagonizerToken.id
            }
        }
    };

    await target.createEmbeddedDocuments("Item", [antagonizedEffectData]);
    
}

export async function createChatMessageOnTurnStartIfTokenIsAntagonized(combatant: CombatantPF2e) {

    const token = combatant.token?.object;
    if (!token) return;

    const actor = token.actor;
    if (!actor) return;

    const antagonizedEffects = getActorAntagonizedEffects(actor);

    for (const effect of antagonizedEffects) {
        const antagonizerTokenId = effect.flags.samioli?.antagonizerTokenId as string;
        const antagonizerToken = canvas?.scene?.tokens.get(antagonizerTokenId)?.object;
        if (!antagonizerToken) return;

        await createAntagonizedChatMessage(token, antagonizerToken);
    }
}

export function getActorAntagonizedEffects(actor: ActorPF2e) {
    return actor.items.filter(item => item.type === 'effect' && 
        item.slug === 'samioli-antagonized') as EffectPF2e[];
}

async function createAntagonizedChatMessage(token: TokenPF2e, antagonizerToken: TokenPF2e) {

    if (!token.actor || !antagonizerToken.actor) return;

    const recipients = getOwnersFromActor(token.actor);
    const antagonizerName = getDisplayNameFromActor(antagonizerToken.actor)
    const actorName = getDisplayNameFromActor(token.actor);
    const content = 
        `<p><strong>${actorName}</strong> is antangonized by <strong>${antagonizerName}</strong>.</p>`;

    await ChatMessage.create({
        content: content,
        whisper: recipients.map(user => user.id),
        speaker: ChatMessage.getSpeaker({ actor: token.actor }),
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

export async function removeAntagonizeEffect(tokenId: string, antagonizedEffectId: string) {

    const token = canvas?.scene?.tokens.get(tokenId)?.object
    const actor = token?.actor;
    if (!actor) return;
    const effect = actor.items.find(item => item.id === antagonizedEffectId) as EffectPF2e;
    if (effect) {
        await effect.delete(); 
    } else {  
        logd(`Could not find the antagonized effect on the actor.`);  
    }  
}