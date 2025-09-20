import { ActorPF2e, ChatMessagePF2e, ConditionPF2e, EffectPF2e } from "foundry-pf2e";
import { getOwnersFromActor, logd } from "../utils.ts";
import { checkIfActorIsAntagonized } from "../actions/antagonize.ts";

export async function checkIfTokenIsFrightened(actor: ActorPF2e) {
    
    const frightenedCondition = actor.items.find(item =>
        item.type === "condition" && item.slug === "frightened") as ConditionPF2e | undefined;

    if (frightenedCondition) {
        const antagonizedEffects = checkIfActorIsAntagonized(actor);
        if ((frightenedCondition.value && frightenedCondition.value > 1) || !antagonizedEffects) {
            await decrementFrightenedCondition(frightenedCondition as ConditionPF2e<ActorPF2e>);
            return;
        }
        else {
            for (const antagonizeEffect of antagonizedEffects) {
                createFrightenedRemovalConfirmationChatMessage(actor, antagonizeEffect, frightenedCondition);
            }
        }
        
    } else {
        return;
    }
}

async function decrementFrightenedCondition(condition: ConditionPF2e<ActorPF2e>) {
    
    const currentValue = condition.value;
    if (currentValue === null) {
        return;
    }

    if (currentValue === 1) {
        await condition.delete();
    } else if (currentValue > 1) {
        await condition.decrease();
    } else {
        logd(`Frightened value of ${currentValue} not expected.`);
    }
}

async function createFrightenedRemovalConfirmationChatMessage(actor: ActorPF2e, antagonizeEffect: EffectPF2e, frightenedCondition: ConditionPF2e) {

    const antagonizerId = antagonizeEffect?.flags?.samioli?.antagonizer as string | undefined;
    const antagonizer = antagonizerId ? game.actors.get(antagonizerId) : undefined;
    const antagonizerName = antagonizer?.prototypeToken?.name ?? "Unknown";

    const content = `
    <p>${actor.name} is currently Antagonized by ${antagonizerName}.</p>
    <p>Has ${actor.name} taken a hostile action against them, or can they no longer observer or sense them for at least one round?</p>
    <div style="display: flex; justify-content: center; gap: 10px; margin-top: 10px;">
        <button type="button" data-action="remove-frightened-and-antagonize" 
        data-frightened-condition-id="${frightenedCondition.id}" 
        data-actor-id="${actor.id}" 
        data-antagonized-effect-id="${antagonizeEffect.id}">
            Remove Frightened and Antagonize
        </button>
    </div>
    `

    const recipients = getOwnersFromActor(actor);

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

export function checkIfFrightenedAndAntagonizeButtonMessage(chatMessagePF2e: ChatMessagePF2e, html: JQuery<HTMLElement>) {
    const buttonSlug = chatMessagePF2e.flags?.samioli?.buttonSlug;
    if (!buttonSlug) return;
    
    if (buttonSlug === 'remove-frightened-and-antagonize-button') {
        const sustainButton = html.find('button[data-action="remove-frightened-and-antagonize"]');
        if (sustainButton.length > 0) {
            sustainButton.on('click', (event) => {
                const button = event.currentTarget;
                const { frightenedConditionId, actorId, antagonizedEffectId } = button.dataset;
                if (frightenedConditionId && actorId && antagonizedEffectId){
                    handleRemoveFrightenedAndAntagonize(frightenedConditionId, actorId, antagonizedEffectId);
                }
            });
        }
    }
}

async function handleRemoveFrightenedAndAntagonize(frightenedConditionId: string, actorId: string, antagonizedEffectId: string) {
       
    const token = canvas.tokens.placeables.find(t => t.actor?.id === actorId);
    const actor = token?.actor;

    if (!actor || !actor.isOwner) {
        ui.notifications.warn("You do not have permission to remove this effect.");
        return;
    }


    const condition = actor.items.find(item => item.id === frightenedConditionId) as ConditionPF2e;
    if (!condition) {
        logd(`Could not find the frightened condition on the actor.`);
        return;
    }

    const effect = actor.items.find(item => item.id === antagonizedEffectId) as EffectPF2e;
    if (!effect) {
        logd(`Could not find the antagonized effect on the actor.`);
        return;
    }

    await effect.delete();
    await condition.delete();
}