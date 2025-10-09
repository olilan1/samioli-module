import { ActorPF2e, CombatantPF2e, ConditionPF2e, EffectPF2e, TokenPF2e } from "foundry-pf2e";
import { getOwnersFromActor, logd, sendBasicChatMessage } from "../utils.ts";
import { getActorAntagonizedEffects, removeAntagonizeEffect } from "../actions/antagonize.ts";
import { createChatMessageWithButton } from "../chatbuttonhelper.ts";

export async function handleFrightenedAtTurnEnd(combatant: CombatantPF2e) {
    const token = combatant.token?.object;
    if (!token) return;
    const actor = token.actor;
    if (!actor) return;

    const frightenedCondition = actor.items.find(item =>
         item.type === "condition" && item.slug === "frightened") as ConditionPF2e<ActorPF2e> | undefined;
    if (!frightenedCondition) return;
    
    const frightenedValue = frightenedCondition.value;
    if (frightenedValue === null) return;

    const antagonizedEffects = getActorAntagonizedEffects(actor);
    const hasAntagonizedEffects = antagonizedEffects.length > 0;

    if (hasAntagonizedEffects) {  
        if (frightenedValue > 1) {  
            await decrementFrightenedCondition(frightenedCondition);  
            for (const effect of antagonizedEffects) {  
                await createAntagonizeRemovalConfirmationChatMessage(token, effect);  
            }  
        } else {  
            for (const effect of antagonizedEffects) {  
                await createFrightenedAndAntagonizeRemovalConfirmationChatMessage(token, effect, frightenedCondition);  
            }  
        }  
    } else {  
        await decrementFrightenedCondition(frightenedCondition);  
    }  
}

async function decrementFrightenedCondition(condition: ConditionPF2e<ActorPF2e>) {
    const currentValue = condition.value ?? 0;
    if (currentValue > 0) {
        await condition.decrease();
        sendFrightenedReducedMessage(condition.actor, currentValue);
    } else {
        logd(`Frightened value of ${currentValue} not expected.`);
    }
}

async function createFrightenedAndAntagonizeRemovalConfirmationChatMessage
    (token: TokenPF2e, antagonizeEffect: EffectPF2e, frightenedCondition: ConditionPF2e) {
    
    const actor = token.actor;
    if (!actor) return;

    const antagonizerTokenId = antagonizeEffect.flags.samioli?.antagonizerTokenId as string;
    const antagonizerToken = canvas.scene?.tokens.get(antagonizerTokenId)?.object;
    if (!antagonizerToken) return;
    
    const content = `
    <p><strong>${token.name}</strong> is Antagonized by <strong>${antagonizerToken.name}</strong>.</p>
    <p>Has ${token.name} taken a hostile action against them, or have they been unable to observe or sense ${antagonizerToken.name} for at least one round?</p>`;

    await createChatMessageWithButton({
        slug: "remove-frightened-and-antagonize",
        actor: actor,
        content: content,
        button_label: "Yes, Remove Frightened and Antagonized",
        params: [frightenedCondition.id, token.id, antagonizeEffect.id]
    });
}

export async function removeFrightenedAndAntagonize(frightenedConditionId: string, tokenId: string, antagonizedEffectId: string) {
    const token = canvas.scene?.tokens.get(tokenId)?.object
    const actor = token?.actor;
    if (!actor) return;
    await removeAntagonizeEffect(tokenId, antagonizedEffectId);  
    
    const antagonizedEffects = getActorAntagonizedEffects(actor);

    if (antagonizedEffects.length !== 0) {
        const content = `<strong>${token.name}</strong> is still antagonized from a different source. Keeping Frightened value at 1.`;
        const recipients = getOwnersFromActor(actor).map(user => user.id);
        await sendBasicChatMessage(content, actor, recipients);
        return;
    }
    
    const condition = actor.items.find(item => item.id === frightenedConditionId) as ConditionPF2e;
    
    if (condition) {  
        await condition.delete();  
    } else {  
        logd(`Could not find the frightened condition on the actor.`);  
    }  
}

async function sendFrightenedReducedMessage(actor: ActorPF2e, frightenedValue: number) {
    const recipients = getOwnersFromActor(actor).map(user => user.id);
    const actorName = (actor.token ?? actor.prototypeToken).name;
    let content;
    const newFrightenedValue = frightenedValue - 1;

    if (newFrightenedValue === 0) {
        content = `<strong>${actorName}</strong> is no longer Frightened.`;
    } else {
        content = `<strong>${actorName}'s</strong> Frightened is reduced to ${newFrightenedValue}.`
    }

    await sendBasicChatMessage(content, actor, recipients);
}

async function createAntagonizeRemovalConfirmationChatMessage(token: TokenPF2e, antagonizeEffect: EffectPF2e) {

    const actor = token.actor;
    if (!actor) return;

    const antagonizerTokenId = antagonizeEffect.flags.samioli?.antagonizerTokenId as string;
    const antagonizerToken = canvas.scene?.tokens.get(antagonizerTokenId)?.object;
    if (!antagonizerToken) return;

    const content = `
    <p><strong>${token.name}</strong> is Antagonized by <strong>${antagonizerToken.name}</strong>.</p>
    <p>Has ${token.name} taken a hostile action against them, or have they been unable to observe or sense <strong>${antagonizerToken.name}</strong> for at least one round?</p>
    `

    await createChatMessageWithButton({
        slug: "remove-antagonize",
        actor: actor,
        content: content,
        button_label: "Yes, remove Antagonized",
        params: [token.id, antagonizeEffect.id]
    });
}
