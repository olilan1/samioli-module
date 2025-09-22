import { ActorPF2e, ChatMessagePF2e, CombatantPF2e, ConditionPF2e, EffectPF2e, TokenPF2e } from "foundry-pf2e";
import { getOwnersFromActor, logd, sendBasicChatMessage } from "../utils.ts";
import { getActorAntagonizedEffects, removeAntagonizeEffect } from "../actions/antagonize.ts";

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
    <p>Has ${token.name} taken a hostile action against them, or have they been unable to observe or sense ${antagonizerToken.name} for at least one round?</p>
    <div style="display: flex; justify-content: center; gap: 10px; margin-top: 10px;">
        <button type="button" data-action="remove-frightened-and-antagonize" 
        data-frightened-condition-id="${frightenedCondition.id}" 
        data-token-id="${token.id}" 
        data-antagonized-effect-id="${antagonizeEffect.id}">
            Yes, Remove Frightened and Antagonized
        </button>
    </div>
    `
    
    const recipients = getOwnersFromActor(actor).map(user => user.id);
    
    await ChatMessage.create({
        content: content,
        whisper: recipients,
        speaker: ChatMessage.getSpeaker({ actor: actor }),
        flags: {
            samioli: {
                buttonSlug: `remove-frightened-and-antagonize-button`
            }
        }
    });
}

export function addClickHandlerToFrightenedAndAntagonizeButtonIfNeeded(chatMessagePF2e: ChatMessagePF2e, html: JQuery<HTMLElement>) {
    const buttonSlug = chatMessagePF2e.flags?.samioli?.buttonSlug;
    if (!buttonSlug) return;
    
    if (buttonSlug === 'remove-frightened-and-antagonize-button') {
        const removeButton = html.find('button[data-action="remove-frightened-and-antagonize"]');
        if (removeButton.length > 0) {
            removeButton.on('click', (event) => {
                const button = event.currentTarget;
                const { frightenedConditionId, tokenId, antagonizedEffectId } = button.dataset;
                if (frightenedConditionId && tokenId && antagonizedEffectId){
                    removeFrightenedAndAntagonize(frightenedConditionId, tokenId, antagonizedEffectId);
                }
            });
        }
    }
}

async function removeFrightenedAndAntagonize(frightenedConditionId: string, tokenId: string, antagonizedEffectId: string) {
    
    const token = canvas.scene?.tokens.get(tokenId)?.object
    const actor = token?.actor;
    if (!actor) return;
    await removeAntagonizeEffect(tokenId, antagonizedEffectId);  
    
    const antagonizedEffects = getActorAntagonizedEffects(actor);

    if (antagonizedEffects.length !== 0) {
        const content = `<strong>${token.name}</strong> is still antagonized from a different source. Keeping Frightened value at 1.`;
        const recipients = getOwnersFromActor(actor).map(user => user.id);
        await sendBasicChatMessage(content, recipients, actor);
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

    await sendBasicChatMessage(content, recipients, actor);
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
    <div style="display: flex; justify-content: center; gap: 10px; margin-top: 10px;">
        <button type="button" data-action="remove-antagonize" 
        data-token-id="${token.id}" 
        data-antagonized-effect-id="${antagonizeEffect.id}">
            Yes, Remove Antagonized
        </button>
    </div>
    `

    const recipients = getOwnersFromActor(actor).map(user => user.id);

    await ChatMessage.create({
        content: content,
        whisper: recipients,
        speaker: ChatMessage.getSpeaker({ actor: actor }),
        flags: {
            samioli: {
                buttonSlug: `remove-antagonize-button`
            }
        }
    });
}

export function addClickHandlerToRemoveAntagonizeButtonIfNeeded(chatMessagePF2e: ChatMessagePF2e, html: JQuery<HTMLElement>) {
    const buttonSlug = chatMessagePF2e.flags?.samioli?.buttonSlug;
    if (!buttonSlug) return;
    
    if (buttonSlug === 'remove-antagonize-button') {
        const removeButton = html.find('button[data-action="remove-antagonize"]');
        if (removeButton.length > 0) {
            removeButton.on('click', (event) => {
                const button = event.currentTarget;
                const { tokenId, antagonizedEffectId } = button.dataset;
                if (tokenId && antagonizedEffectId){
                    removeAntagonizeEffect(tokenId, antagonizedEffectId);
                }
            });
        }
    }
}