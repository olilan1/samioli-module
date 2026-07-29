import { ActorPF2e, TokenPF2e, RegionDocumentPF2e, ItemPF2e, ConditionPF2e, EffectPF2e, EffectSource, CharacterPF2e, TokenDocumentPF2e, SpellPF2e } from "foundry-pf2e";
import { getSetting, SETTINGS } from "./settings.ts";
import { MeasuredTemplateType } from "foundry-pf2e/foundry/common/constants.mjs";
import { Point } from "foundry-pf2e/foundry/common/_types.mjs";
import { TokenMovementMethod } from "foundry-pf2e/foundry/client/documents/_module.mjs";
import { CrosshairUpdatable } from "./types.ts";

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

export function logd(...args: unknown[]) {
    if (game.settings && getSetting(SETTINGS.DEBUG_LOGGING)) {
        console.log(...args);
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

export async function deleteRegionById(regionId: string) {
    if (!canvas.scene) return;

    const region = canvas.scene.regions.get(regionId);
    if (!region) {
        logd(`Region with ID ${regionId} not found on current scene.`);
        return;
    }

    try {
        await canvas.scene.deleteEmbeddedDocuments("Region", [regionId]);
        logd(`Deleted Region with ID: ${regionId}`);
    } catch (error) {
        console.error("Error deleting Region:", error);
        ui.notifications.error(`Failed to delete Region with ID ${regionId}.`);
    }
}

export function getTokenFromActor(actor: ActorPF2e | null): TokenPF2e | null {
    return actor?.getActiveTokens()[0] ?? null;
}

/**
 * Returns the User(s) who have ownership or control over a given Actor.
 */
export function getOwnersFromActor(actor: ActorPF2e, includeGM: boolean = true): User[] {
    return game.users.filter((user) => {
        if (!includeGM && user.isGM) return false;
        return actor.testUserPermission(user, "OWNER");
    });
}

/**
 * Checks if a region has a flag with a lightId, and if so, deletes the associated light.
 */
export async function deleteLightFromRegion(region: RegionDocumentPF2e) {
    const lightId = region.getFlag(MODULE_ID, "lightId");
    if (!lightId) return;

    const light = canvas.scene?.lights.find(l => l.id === lightId);

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

/** Checks if an item is a spell. */
export function isSpellPF2e(item: ItemPF2e | null | undefined): item is SpellPF2e {
    return !!item && item.type === "spell";
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


export function getEnemyTokensFromTokenArray(self: TokenPF2e, tokens: TokenPF2e[]): TokenPF2e[] {
    return tokens.filter(token => token.document.disposition === self.document.disposition * -1);
}

export async function createRegionAtPoint(
    point: Point,
    _userId: string,
    radius: number,
    shapeType: MeasuredTemplateType | "ellipse" | "circle" | "rectangle" = "ellipse"
): Promise<RegionDocumentPF2e> {
    if (!canvas.scene) throw new Error("No active scene found");

    const shape = {
        type: shapeType === "circle" ? "ellipse" : shapeType,
        x: point.x,
        y: point.y,
        radiusX: radius,
        radiusY: radius
    };

    const regionData = {
        name: "Custom Region",
        shapes: [shape],
        color: "#000000" as `#${string}`
    };

    const region = await RegionDocument.create(regionData, { parent: canvas.scene });
    if (!region) throw new Error("Failed to create region");
    return region as RegionDocumentPF2e;
}

export async function createTemplateAtPoint(
    point: Point,
    userId: string,
    radius: number,
    shape: MeasuredTemplateType
): Promise<RegionDocumentPF2e> {
    return createRegionAtPoint(point, userId, radius, shape);
}

export async function addOrUpdateEffectOnActor(
    actor: ActorPF2e,
    effectSource: EffectSource
): Promise<EffectPF2e | void> {
    const sourceClone = foundry.utils.deepClone(effectSource);
    const existingEffect = actor.items.find(
        item => item.slug === sourceClone.system.slug && item.type === "effect"
    ) as EffectPF2e | undefined;
    if (existingEffect) {
        if (existingEffect.isExpired || existingEffect.remainingDuration.expired) {
            await existingEffect.delete();
        } else {
            await existingEffect.update(sourceClone);
            return existingEffect;
        }
    }
    const [newEffect] = await actor.createEmbeddedDocuments("Item", [sourceClone]) as EffectPF2e[];
    return newEffect;
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

export async function moveTokenToPoint(token: TokenPF2e, point: Point, ignoreWalls?: boolean, ignoreCost?: boolean) {

    const waypoints = [{
        x: point.x,
        y: point.y
    }];

    const moveOptions = {
        method: "api" as TokenMovementMethod,
        autoRotate: false,
        showRuler: false,
        constrainOptions: {
            ignoreWalls: ignoreWalls,
            ignoreCost: ignoreCost
        }
    };

    await token.document.move(waypoints, moveOptions);
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

export function getCollidableCallbacks(actionName: string, icon: string): CrosshairCallbackData {
    return {
        [Sequencer.Crosshair.CALLBACKS.COLLIDE]: (crosshair: CrosshairUpdatable) => {
            crosshair.updateCrosshair({
                "icon.texture": "icons/svg/cancel.svg"
            });
        },
        [Sequencer.Crosshair.CALLBACKS.STOP_COLLIDING]: (crosshair: CrosshairUpdatable) => {
            crosshair.updateCrosshair({
                "icon.texture": icon
            });
        },
        [Sequencer.Crosshair.CALLBACKS.CANCEL]: () => {
            ui.notifications.warn(`${actionName} cancelled.`);
            return false;
        },
        [Sequencer.Crosshair.CALLBACKS.INVALID_PLACEMENT]: () => {
            ui.notifications.warn("Invalid selection.");
        },
        show: undefined,
        move: undefined,
        mouseMove: undefined,
        placed: undefined
    };
}

/**
 * Resolves a token document UUID to its live Token object on the canvas.
 * Returns null if the UUID is invalid or the token is not on the active scene.
 */
export function getTokenFromUuid(uuid: string | null): TokenPF2e | null {
    if (!uuid) return null;
    const doc = fromUuidSync<TokenDocumentPF2e>(uuid);
    return doc?.object ?? null;
}

/**
 * Checks if an actor is conscious and alive based on their HP and conditions.
 */
export function isConsciousAndAlive(actor: ActorPF2e): boolean {
    if (!actor || actor.isDead) return false;
    return !actor.hasCondition("unconscious");
}

export function getRegionOrigin(
    region: RegionDocumentPF2e | { x?: number; y?: number; points?: number[]; base?: unknown }
): Point | null {
    if (!region) return null;
    const target = "shapes" in region ? region.shapes?.at(0) : region;
    if (!target) return null;

    if ("x" in target && "y" in target && typeof target.x === "number" && typeof target.y === "number") {
        return { x: target.x, y: target.y };
    }
    if ("points" in target && Array.isArray(target.points) && target.points.length >= 2) {
        return { x: target.points[0], y: target.points[1] };
    }
    if ("base" in target && target.base) {
        return getRegionOrigin(target.base as RegionDocumentPF2e);
    }
    return null;
}

export function getRegionStartPoint(region: RegionDocumentPF2e): Point {
    const shape = region.shapes?.at(0) as { x?: number; y?: number } | undefined;
    return { x: shape?.x ?? 0, y: shape?.y ?? 0 };
}

export function getRegionDirection(region: RegionDocumentPF2e): number {
    return (region.shapes?.at(0) as { rotation?: number })?.rotation ?? 0;
}

export function getTokensWithinRadius(
    center: Point,
    radiusFeet: number,
    options: { checkWalls?: boolean; scene?: Scene } = {}
): TokenPF2e[] {
    const scene = options.scene ?? canvas.scene;
    if (!scene) return [];

    const grid = canvas.grid;
    const gridDistance = grid.distance;
    const gridUnits = radiusFeet / gridDistance;
    const maxPixelDistance = gridUnits * grid.size;

    return canvas.tokens.placeables.filter((token: TokenPF2e) => {
        const actor = token.actor;
        if (!actor || token.document.hidden) return false;
        if (!actor.isOfType("creature", "hazard", "vehicle") || actor.isDead) return false;

        const distanceInUnits = token.distanceTo(center);
        if (distanceInUnits > radiusFeet) return false;

        if (options.checkWalls) {
            const wallBackend = CONFIG.Canvas.polygonBackends["sight"];
            const footprint = token.footprint;
            const hasUnblockedSpace = footprint.some(offset => {
                const spaceCenter = grid.getCenterPoint(offset);
                return !wallBackend.testCollision(
                    center, spaceCenter, { type: "sight", mode: "any" }
                );
            });
            if (!hasUnblockedSpace) return false;
        }

        return true;
    });
}

export async function deleteItemFromActor(
    item: ItemPF2e | null | undefined
): Promise<boolean> {
    if (!item?.actor) return false;

    try {
        await item.delete();
        return true;
    } catch {
        return false;
    }
}