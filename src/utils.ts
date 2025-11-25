import { ActorPF2e, TokenPF2e, MeasuredTemplateDocumentPF2e, ItemPF2e, ConditionPF2e, EffectPF2e, EffectSource, CharacterPF2e, TokenDocumentPF2e } from "foundry-pf2e";
import { getSetting, SETTINGS } from "./settings.ts";
import { MeasuredTemplateType } from "foundry-pf2e/foundry/common/constants.mjs";
import { Point } from "foundry-pf2e/foundry/common/_types.mjs";

export type Tradition = "occult" | "arcane" | "divine" | "primal";

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
        console.log("No active scene found.");
        return;
    }

    // Check if the template exists before attempting to delete
    const template = canvas.scene.templates.get(templateId);
    if (!template) {
        console.log(`Measured Template with ID ${templateId} not found on the current scene.`);
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

export function getTokenFromActor(actor: ActorPF2e | null): TokenPF2e | null {
    return actor?.getActiveTokens()[0] ?? null;
}

/**
 * Returns the User(s) who have ownership or control over a given Actor.
 */
export function getOwnersFromActor(actor: ActorPF2e): User[] {
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

export function isCondition(item: ItemPF2e): item is ConditionPF2e {
    return item.type === "condition";
}

export function isEffect(item: ItemPF2e): item is EffectPF2e {
    return item.type === "effect";
}

export function isCharacter(actor: ActorPF2e): actor is CharacterPF2e {
    return actor.type === "character";
}

export async function sendBasicChatMessage(content: string, speaker: ActorPF2e,
    recipients?: string[]) {
    const isWhisper = recipients && recipients.length > 0;
    await ChatMessage.create({
        content: content,
        speaker: ChatMessage.getSpeaker({ actor: speaker }),
        ...(isWhisper ? { whisper: recipients } : {})
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

export function getHtmlElement(htmlOrJquery: JQuery | HTMLElement) {
    if (htmlOrJquery instanceof jQuery) {
        return (htmlOrJquery as JQuery)[0] as HTMLElement;
    }
    // Otherwise, it's HTML, just return it
    return htmlOrJquery as HTMLElement;
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

export async function addOrUpdateEffectOnActor(actor: ActorPF2e, effectSource: EffectSource):
    Promise<EffectPF2e | void> {
    const existingEffect = actor.items.find(item => item.slug === effectSource.system.slug
        && item.type === 'effect');
    if (existingEffect) {
        await existingEffect.update(effectSource);
        return existingEffect as EffectPF2e;
    }
    await actor.createEmbeddedDocuments('Item', [effectSource]);
    const newEffect = actor.items.find(item => item.slug === effectSource.system.slug
        && item.type === 'effect');
    return newEffect as EffectPF2e;
}

export async function performFlatCheck(actor: ActorPF2e, dc: number, title: string, rollOptions: string[] = []): Promise<void> {

    const checkModifierInstance = new game.pf2e.CheckModifier(
        title, 
        { modifiers: [] }
    );

    const combinedRollOptions = [
        'check',       
        'flat-check',
        ...rollOptions,
    ];

    const rollContextOptions = {
        actor: actor,
        dc: { 
            value: dc,
            slug: 'flat-check',
        },
        options: new Set(combinedRollOptions),
        speaker: actor,
        type: 'flat-check' as const,
    };

    await game.pf2e.Check.roll(
        checkModifierInstance,
        rollContextOptions
    );
}

export function getLevelBasedDC(level: number): number {
    const DC_LOOKUP: Record<number, number> = {
        0: 14,
        1: 15,
        2: 16,
        3: 18,
        4: 19,
        5: 20,
        6: 22,
        7: 23,
        8: 24,
        9: 26,
        10: 27,
        11: 28,
        12: 30,
        13: 31,
        14: 32,
        15: 34,
        16: 35,
        17: 36,
        18: 38,
        19: 39,
        20: 40,
        21: 42,
        22: 44,
        23: 46,
        24: 48,
        25: 50
    };
    
    return DC_LOOKUP[level];
}

export function getEidolonActor(summonerActor: ActorPF2e): ActorPF2e | null {

    // @ts-expect-error modules exists when pf2e-toolbelt is installed and eidolon is linked with summoner
    const sharedActors: Set<string> | undefined = (summonerActor.modules)?.["pf2e-toolbelt"]?.shareData?.slaves;

    if (!sharedActors || sharedActors.size === 0) {
        logd(`${summonerActor.name} does not have any shared actors.`);
        return null;
    }

    if (sharedActors.size === 1) {
        const uuid = sharedActors.values().next().value;
        if (!uuid) return null;

        const eidolonId = uuid.split(".")[1];
        const eidolonActor = game.actors.get(eidolonId);

        if (!eidolonActor) {
            logd(`Could not find an Actor with ID: ${eidolonId}`);
            return null;
        }
        return eidolonActor;
    }

    logd(`${summonerActor.name} has multiple shared actors (${sharedActors.size}). Unable to determine which is the Eidolon.`);
    return null;
}

export function getTokensOnCurrentSceneForActor(actor: ActorPF2e): TokenDocumentPF2e[] {

    const currentScene = canvas.scene!;
    const tokens = currentScene.tokens.filter(t => t.actorId === actor.id);

    return tokens;
}

/**
 * Returns all tokens at a given location, except for loot and party tokens.
 */
export function getTokensAtLocation(location: Point, includeHidden?: boolean): TokenPF2e[] {

    const locationGridOffset = canvas.grid.getOffset(location);
    const allTokensOnScene = canvas.tokens.placeables;
    
    const validTokens = allTokensOnScene.filter(token => {
        
        const actorType = token.actor?.type;
        if (actorType === "loot" || actorType === "party") {
            return false;
        }
        return token.footprint.some(footprint => {
            return footprint.i === locationGridOffset.i && footprint.j === locationGridOffset.j;
        });
    }) as TokenPF2e[];

    if (includeHidden) {
        return validTokens;
    }

    const visibleTokens = validTokens.filter(token => { 
        return token.document.hidden === false;
    });

    return visibleTokens;
}