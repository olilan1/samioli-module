import { ActorPF2e, ChatMessagePF2e, ConditionPF2e, EffectPF2e } from "foundry-pf2e";
import { getDisplayNameFromActor, getOwnersFromActor, logd } from "../utils.ts";
import { getActorAntagonizedEffects } from "../actions/antagonize.ts";

export async function handleFrightenedAtTurnEnd(actor: ActorPF2e) {

    const frightenedCondition = actor.items.find(item =>
        item.type === "condition" && item.slug === "frightened") as ConditionPF2e<ActorPF2e> | undefined;

    if (!frightenedCondition) return;

    const antagonizedEffects = getActorAntagonizedEffects(actor);

    if ((frightenedCondition.value && frightenedCondition.value > 1) || !antagonizedEffects.length) {
        await decrementFrightenedCondition(frightenedCondition);
        return;
    }
    else {
        for (const antagonizeEffect of antagonizedEffects) {
            createFrightenedRemovalConfirmationChatMessage(actor, antagonizeEffect, frightenedCondition);
        }
    }
}

async function decrementFrightenedCondition(condition: ConditionPF2e<ActorPF2e>) {
    
    const currentValue = condition.value ?? 0;
    if (currentValue === null) {
        return;
    }

    if (currentValue === 1) {
        await condition.delete();
        sendFrightenedReducedMessage(condition.actor, currentValue);
    } else if (currentValue > 1) {
        await condition.decrease();
        sendFrightenedReducedMessage(condition.actor, currentValue);
    } else {
        logd(`Frightened value of ${currentValue} not expected.`);
    }
}

async function createFrightenedRemovalConfirmationChatMessage(actor: ActorPF2e, antagonizeEffect: EffectPF2e, frightenedCondition: ConditionPF2e) {

    const antagonizerId = antagonizeEffect.flags.samioli?.antagonizer as string;
    const antagonizer = game.actors.get(antagonizerId);
    if (!antagonizer) return;
    const antagonizerName = getDisplayNameFromActor(antagonizer);
    const actorName = getDisplayNameFromActor(actor);

    const content = `
    <p>${actorName} is Antagonized by ${antagonizerName}.</p>
    <p>Has ${actorName} taken a hostile action against them, or have they been unable to observe or sense ${antagonizerName} for at least one round?</p>
    <div style="display: flex; justify-content: center; gap: 10px; margin-top: 10px;">
        <button type="button" data-action="remove-frightened-and-antagonize" 
        data-frightened-condition-id="${frightenedCondition.id}" 
        data-actor-id="${actor.id}" 
        data-antagonized-effect-id="${antagonizeEffect.id}">
            Yes, Remove Frightened and Antagonize
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
        const sustainButton = html.find('button[data-action="remove-frightened-and-antagonize"]');
        if (sustainButton.length > 0) {
            sustainButton.on('click', (event) => {
                const button = event.currentTarget;
                const { frightenedConditionId, actorId, antagonizedEffectId } = button.dataset;
                if (frightenedConditionId && actorId && antagonizedEffectId){
                    removeFrightenedAndAntagonize(frightenedConditionId, actorId, antagonizedEffectId);
                }
            });
        }
    }
}

async function removeFrightenedAndAntagonize(frightenedConditionId: string, actorId: string, antagonizedEffectId: string) {
       
    const token = canvas.tokens.placeables.find(t => t.actor?.id === actorId);
    const actor = token?.actor;

    if (!actor || !actor.isOwner) {
        ui.notifications.warn("You do not have permission to remove this effect.");
        return;
    }

    const effect = actor.items.find(item => item.id === antagonizedEffectId) as EffectPF2e;
    if (effect) {
        await effect.delete();  
    } else {  
        logd(`Could not find the antagonized effect on the actor.`);  
    }  

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
    if (frightenedValue === 1) {
        content = `${actorName} is no longer Frightened.`;
    } else {
        frightenedValue--;
        content = `${actorName} is now Frightened ${frightenedValue}`
    }

    await ChatMessage.create({
        content: content,
        whisper: recipients,
        speaker: ChatMessage.getSpeaker({ actor: actor }),
    });
}