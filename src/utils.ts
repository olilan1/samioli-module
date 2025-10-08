import { ActorPF2e, TokenPF2e, MeasuredTemplateDocumentPF2e, ItemPF2e, ConditionPF2e, EffectPF2e, EffectSource } from "foundry-pf2e";
import { getSetting, SETTINGS } from "./settings.ts";
import { MeasuredTemplateType } from "foundry-pf2e/foundry/common/constants.mjs";
import { Point } from "foundry-pf2e/foundry/common/_types.mjs";

export const MODULE_ID = "samioli-module";

export function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function getRandomNumberBetween(min: number, max: number) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function shuffleArray<T>(array: T[]): T[] {
    let currentIndex = array.length, randomIndex;

    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;

        [array[currentIndex], array[randomIndex]] = [
            array[randomIndex], array[currentIndex]];
    }

    return array;
}

export function getTokenIdsFromTokens(tokens: TokenPF2e[]) {
    return tokens.map(token => token.id);
}

export function getHashCode(str: string) {
    let hash = 0;
    if (str.length === 0) return hash;

    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer 
    }

    return hash;
}

export function logd(message: unknown) {
    if (getSetting(SETTINGS.DEBUG_LOGGING)) {
        console.log(message);
    }
}

export function postUINotification(message: string, type: "info" | "warn" | "error") {
    switch (type) {
        case "info": 
            ui.notifications.info(message); 
            break;
        case "warn": 
            ui.notifications.warn(message);
            break;
        case "error": 
            ui.notifications.error(message); 
            break;
    }
}

export async function deleteTemplateById(templateId: string) {
    if (!canvas.scene) {
        ui.notifications.error("No active scene found.");
        return;
    }

    if (!templateId) {
        ui.notifications.warn("No template ID provided for deletion.");
        return;
    }

    // Check if the template exists before attempting to delete
    const template = canvas.scene.templates.get(templateId);
    if (!template) {
        ui.notifications.warn(`Measured Template with ID ${templateId} not found on the current scene.`);
        return;
    }

    try {
        // The deleteEmbeddedDocuments method expects an array of IDs
        await canvas.scene.deleteEmbeddedDocuments("MeasuredTemplate", [templateId]);
        console.log(`Deleted Measured Template with ID: ${templateId}`);
    } catch (error) {
        console.error("Error deleting Measured Template:", error);
        ui.notifications.error(`Failed to delete Measured Template with ID ${templateId}. See console for details.`);
    }
}

export function getTokenFromActor(actor: ActorPF2e | null) : TokenPF2e | null {
    return actor?.getActiveTokens()[0] ?? null;
}

/**
 * Returns the User(s) who have ownership or control over a given Actor.
 */
export function getOwnersFromActor(actor: ActorPF2e) : User[] {
  const controllingUsers = [];
  for (const userId in actor.ownership) {
    // Skip the "default" entry, which applies to all users unless overridden.
    if (userId === "default") continue;

    const permissionLevel = actor.ownership[userId] ?? 0;
    if (permissionLevel >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) {
      const user = game.users.get(userId);
      if (user) {
        controllingUsers.push(user);
      }
    }
  }
  
  return controllingUsers;
}

/**
 * Checks if a template has a flag with a lightId, and if so, deletes the associated light.
 */
export async function deleteLightFromTemplate(template: MeasuredTemplateDocumentPF2e) {
    // Get the lightId from the template's flag.
    const lightId = template.getFlag(MODULE_ID, "lightId");
    if (!lightId) return;

    // Find the light document in the current scene's lights collection.
    const light = canvas.scene?.lights.find(l => l.id === lightId);

    // If the light is found, delete it.
    if (light) {
        try {
            await light.delete();
            logd(`Successfully deleted light with ID: ${lightId}`);
        } catch (error) {
            logd(`Error deleting light with ID: ${lightId}`);
            logd(error);
        }
    } else {
        logd(`Light with ID: ${lightId} not found on the canvas.`);
    }
}

export function isCondition(item: ItemPF2e) : item is ConditionPF2e {  
    return item.type === "condition";  
}

export function isEffect(item: ItemPF2e) : item is EffectPF2e {  
    return item.type === "effect";  
}

export async function sendBasicChatMessage(content: string, recipients: string[], speaker: ActorPF2e) {
    await ChatMessage.create({
        content: content,
        whisper: recipients,
        speaker: ChatMessage.getSpeaker({ actor: speaker }),
    });
}

export function returnStringOfNamesFromArray(names: string[]): string {
  if (names.length === 0) {
    return "";
  }

  if (names.length === 1) {
    return names[0];
  }

  const allButLast = names.slice(0, -1).join(", ");
  const last = names[names.length - 1];

  return `${allButLast} and ${last}`;
}

export function getEnemyTokensFromTokenArray(self: TokenPF2e, tokens: TokenPF2e[]): TokenPF2e[] {
    return tokens.filter(token => token.document.disposition === (self.document.disposition ?? 0) * -1)
}

export async function createTemplateAtPoint(point: Point, userId: string, radius: number, shape: MeasuredTemplateType): Promise<MeasuredTemplateDocumentPF2e> {
    
    const templateData = {
        t: shape,
        distance: radius,
        x: point.x,
        y: point.y,
        user: userId
    };

    const template = await MeasuredTemplateDocument.create(templateData, { parent: canvas.scene }) as MeasuredTemplateDocumentPF2e;
    if (!template) {
        throw new Error("Failed to create template");
    }
    return template;
}

export async function addEffectToActor(actor: ActorPF2e, effect: EffectSource) {
    const existingEffect = actor.items.find(item => item.slug === effect.system.slug
        && item.type === 'effect');
    if (existingEffect) {
        await existingEffect.update(effect);
        return;
    }
    await actor.createEmbeddedDocuments('Item', [effect]);
}