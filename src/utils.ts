import { ActorPF2e, MeasuredTemplateDocumentPF2e } from "foundry-pf2e";
import { getSetting, SETTINGS } from "./settings.ts";

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

export function getTokenIdsFromTokens(tokens: Token[]) {
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

/**
 * Finds the most relevant Token on the canvas based on a combination of criteria.
 * Criteria are checked in a prioritized order.
 *
 * @param {object} options - An object containing search criteria.
 * @param {string} [options.actorId] - The ID of the Actor to find a token for.
 * @param {string} [options.actorName] - The name of the Actor to find a token for.
 * @param {string} [options.tokenId] - The specific ID of the Token to find.
 * @param {string} [options.tokenName] - The name of the Token to find.
 * @param {string} [options.userId] - The ID of the User who might own/control the token.
 * @param {boolean} [options.controlled] - Whether to prioritize a token currently controlled by the current user.
 * @param {boolean} [options.inCombat] - Whether to prioritize a token currently in the combat tracker.
 * @returns {Token | null} The most relevant Token found, or null if none matches.
 */
export function findRelevantToken(options: {
    actorId?: string;
    actorName?: string;
    tokenId?: string;
    tokenName?: string;
    userId?: string;
    controlled?: boolean;
    inCombat?: boolean;
}): Token | null {
    if (!canvas.tokens || !canvas.scene) {
        console.warn("Canvas tokens or scene not ready.");
        return null;
    }

    const { actorId, actorName, tokenId, tokenName, userId, controlled, inCombat } = options;

    let candidates: Token[] = Array.from(canvas.tokens.placeables); // Start with all tokens

    // --- Prioritized Filtering Steps ---

    // 1. Exact Token ID Match (Highest Priority)
    if (tokenId) {
        const tokenById = candidates.find(t => t.id === tokenId);
        if (tokenById) {
        console.log(`Found token by exact ID: ${tokenById.name}`);
        return tokenById;
        }
    }

    // 2. Filter by User ID and their designated character

    let actorFromUser: Actor | null = null;
    if (userId) {
        const user = game.users.get(userId);
        if (user && user.character) {
        actorFromUser = user.character;
        // Filter candidates to only include those linked to this user's character
        candidates = candidates.filter(t => t.actor === actorFromUser);
        if (candidates.length === 1) {
            console.log(`Found single candidate token linked to user's character: ${candidates[0].name}`);
            return candidates[0]; // If only one, it's likely the one
        }
        } else if (user) {
            // If user provided but no character, still filter by ownership if other criteria aren't specific
            candidates = candidates.filter(token => token.document.testUserPermission(user, "OBSERVER"));
        }
    }

    // 3. Filter by Actor ID or Actor Name
    let targetActor: Actor | null = null;
    if (actorId) {
        targetActor = game.actors.get(actorId) || null;
    } else if (actorName) {
        targetActor = game.actors.getName(actorName) || null;
    }

    if (targetActor) {
        // If we already filtered by user's character and it matches this actor, no further filtering needed
        if (actorFromUser && actorFromUser === targetActor) {
        // Candidates are already filtered based on this actor
        } else {
        candidates = candidates.filter(t => t.actor === targetActor);
        }

        if (candidates.length === 1) {
        console.log(`Found single candidate token for actor: ${candidates[0].name}`);
        return candidates[0];
        }
    }

    // 4. Filter by Token Name (less reliable due to duplicates, but useful as a fall-back)
    if (tokenName) {
        const nameMatches = candidates.filter(t => t.name === tokenName);
        if (nameMatches.length === 1) {
        console.log(`Found single candidate token by name: ${nameMatches[0].name}`);
        return nameMatches[0];
        } else if (nameMatches.length > 1) {
        // If multiple tokens have the same name, continue filtering with other criteria
        candidates = nameMatches;
        }
    }

    // --- Secondary Prioritization for Remaining Candidates ---

    // 5. Prioritize Controlled Token (if requested and by current user)
    if (controlled && game.user) {
        const controlledTokens = candidates.filter(t => t.controlled && t.document.testUserPermission(game.user, "OWNER"));
        if (controlledTokens.length === 1) {
        console.log(`Prioritizing single controlled token: ${controlledTokens[0].name}`);
        return controlledTokens[0];
        } else if (controlledTokens.length > 1) {
        console.warn("Multiple controlled tokens found, returning the first one.");
        return controlledTokens[0];
        }
    }

    // 6. Prioritize Token in Combat (if requested)
    if (inCombat && game.combat) {
        const combatTokens = candidates.filter(t =>
        game.combat?.combatants.some(c => c.token === t.document)
        );
        if (combatTokens.length === 1) {
        console.log(`Prioritizing single combat token: ${combatTokens[0].name}`);
        return combatTokens[0];
        } else if (combatTokens.length > 1) {
        // If multiple in combat, return the active combatant's token if available
        if (game.combat.combatant?.token && candidates.includes(canvas.tokens.get(game.combat.combatant.token.id)!)) {
            console.log(`Prioritizing active combatant's token: ${canvas.tokens.get(game.combat.combatant.token.id)!.name}`);
            return canvas.tokens.get(game.combat.combatant.token.id)!;
        }
        console.warn("Multiple combat tokens found, returning the first one.");
        return combatTokens[0];
        }
    }

    // 7. Last Resort: If only one candidate remains, return it
    if (candidates.length === 1) {
        console.log(`Returning sole remaining candidate token: ${candidates[0].name}`);
        return candidates[0];
    }

    // No single relevant token found based on criteria
    if (candidates.length > 1) {
        console.warn(`Multiple tokens matched criteria, but no single most relevant could be determined. Candidates:`, candidates.map(t => t.name));
    } else {
        console.log("No relevant token found based on provided criteria.");
    }

    return null;
    }
    
export function getRandomSignedInt(number: number): number {
    const absoluteNumber = Math.abs(number);

    if (Math.random() < 0.5) {
        return -absoluteNumber;
    } else {
        return absoluteNumber;
    }
}

/**
 * Retrieves the User(s) who have ownership or control over a given Actor.
 *
 * @param {Actor} actor The Actor document to check.
 * @returns {User[]} An array of User documents who have permission over the actor.
 */
export function getOwnersFromActor(actor: ActorPF2e) {
  const controllingUsers = [];

  // actor.ownership is an object where keys are user IDs and values are permission levels.
  // Example: { "default": 0, "userId123": 3, "userId456": 2 }
  // Permission Levels:
  //   0: None
  //   1: Limited
  //   2: Observer
  //   3: Owner

  for (const userId in actor.ownership) {
    // Skip the "default" entry, which applies to all users unless overridden.
    if (userId === "default") continue;

    const permissionLevel = actor.ownership[userId] ?? 0;

    // We typically want users with at least OBSERVER (2) or OWNER (3) permission
    // to be considered "controlling" or "owning" the actor for most purposes.
    // Adjust the minimum permission level as needed for your specific logic.
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
 * @param {MeasuredTemplateDocumentPF2e} template - The template document to check.
 */
export async function deleteLightFromTemplate(template: MeasuredTemplateDocumentPF2e) {
    // Get the lightId from the template's flag.
    const lightId = template.getFlag(MODULE_ID, "lightId");

    // Check if the flag exists and has a value.
    if (!lightId) {
        return;
    }

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