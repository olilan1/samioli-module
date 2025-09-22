import { ActorPF2e, ChatMessagePF2e, CombatantPF2e, ConditionPF2e, EffectPF2e, TokenPF2e } from "foundry-pf2e";
import { getDisplayNameFromActor, getOwnersFromActor, logd } from "../utils.ts";
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

    if (frightenedValue > 1 || !hasAntagonizedEffects) {
        await decrementFrightenedCondition(frightenedCondition);
        if (hasAntagonizedEffects) {
            for (const effect of antagonizedEffects) {
                await createAntagonizeRemovalConfirmationChatMessage(token, effect);
            }
        }
        return;
    }

    if (frightenedValue === 1 && hasAntagonizedEffects) {
        for (const effect of antagonizedEffects) {
            await createFrightenedAndAntagonizeRemovalConfirmationChatMessage(token, effect, frightenedCondition);
        }
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
    const antagonizer = canvas?.scene?.tokens.get(antagonizerTokenId)?.object;
    if (!antagonizer || !antagonizer.actor) return;
    const antagonizerName = getDisplayNameFromActor(antagonizer.actor);
    const actorName = getDisplayNameFromActor(actor);
    
    const content = `
    <p><strong>${actorName}</strong> is Antagonized by <strong>${antagonizerName}</strong>.</p>
    <p>Has ${actorName} taken a hostile action against them, or have they been unable to observe or sense ${antagonizerName} for at least one round?</p>
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
    
    const token = canvas?.scene?.tokens.get(tokenId)?.object
    const actor = token?.actor;
    if (!actor || !actor.isOwner) {
        ui.notifications.warn("You do not have permission to remove this effect.");
        return;
    }
    
    await removeAntagonizeEffect(tokenId, antagonizedEffectId);  
    
    const antagonizedEffects = getActorAntagonizedEffects(actor);

    if (antagonizedEffects.length !== 0) {
        const actorName = getDisplayNameFromActor(actor);
        ui.notifications.warn(actorName + " is still antagonized from a different source. Keeping Frightened value at 1.");
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
    const actorName = getDisplayNameFromActor(actor);
    let content = ``;
    const newFrightenedValue = frightenedValue - 1;

    if (newFrightenedValue === 0) {
        content = `<strong>${actorName}</strong> is no longer Frightened.`;
    } else {
        content = `<strong>${actorName}'s</strong> Frightened is reduced to ${newFrightenedValue}.`
    }
    await ChatMessage.create({
        content: content,
        whisper: recipients,
        speaker: ChatMessage.getSpeaker({ actor: actor }),
    });
}

async function createAntagonizeRemovalConfirmationChatMessage(token: TokenPF2e, antagonizeEffect: EffectPF2e) {

    const actor = token.actor;
    if (!actor) return;

    const antagonizerTokenId = antagonizeEffect.flags.samioli?.antagonizerTokenId as string;
    const antagonizer = canvas?.scene?.tokens.get(antagonizerTokenId)?.object;
    if (!antagonizer || !antagonizer.actor) return;
    const antagonizerName = getDisplayNameFromActor(antagonizer.actor);
    const actorName = getDisplayNameFromActor(actor);

    const content = `
    <p><strong>${actorName}</strong> is Antagonized by <strong>${antagonizerName}</strong>.</p>
    <p>Has ${actorName} taken a hostile action against them, or have they been unable to observe or sense <strong>${antagonizerName}</strong> for at least one round?</p>
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