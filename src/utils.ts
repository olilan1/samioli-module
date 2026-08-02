import { ActorPF2e, TokenPF2e, RegionDocumentPF2e, ItemPF2e, ConditionPF2e, EffectPF2e, EffectSource, CharacterPF2e, TokenDocumentPF2e, SpellPF2e } from "foundry-pf2e";
import { getSetting, SETTINGS } from "./settings.ts";
import { Point } from "foundry-pf2e/foundry/common/_types.mjs";
import { TokenMovementMethod } from "foundry-pf2e/foundry/client/documents/_module.mjs";
import { CrosshairUpdatable, RegionOriginFlag, RegionShapeGeometry } from "./types.ts";

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
 * Returns the actor a region originated from, or null.
 *
 * PF2e records the caster's UUID in `flags.pf2e.origin.actor` when it places a spell area.
 */
export function getActorFromRegion(region: RegionDocumentPF2e): ActorPF2e | null {
    const origin = region.flags.pf2e?.origin as RegionOriginFlag | undefined;
    return origin?.actor ? fromUuidSync<ActorPF2e>(origin.actor) : null;
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
    const selfDisposition = self.document.disposition;
    if (selfDisposition === null) return [];
    return tokens.filter(token => token.document.disposition === selfDisposition * -1);
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
    });

    if (includeHidden) {
        return validTokens;
    }

    const visibleTokens = validTokens.filter(token => {
        return token.document.hidden === false;
    });

    return visibleTokens;
}

/** Default icon shown on a crosshair when the hovered square cannot be used. */
const INVALID_CROSSHAIR_ICON = "icons/svg/cancel.svg";

/**
 * Preloads a crosshair's valid and invalid icons and returns a function that switches between them.
 *
 * Changing the icon through Sequencer's updateCrosshair freezes the canvas on Foundry v14. It
 * starts an unawaited icon redraw that v14 re-enters through the crosshair's move callbacks, so a
 * second redraw destroys the icon the first is still writing to. Use this helper instead: the
 * function it returns assigns an already-loaded texture to the control icon, which repaints in
 * place with no redraw to re-enter.
 */
export async function createCrosshairIconSwitcher(
    validIcon: string,
    invalidIcon: string = INVALID_CROSSHAIR_ICON
): Promise<(crosshair: CrosshairUpdatable, isValid: boolean) => void> {
    // loadTexture resolves a spritesheet for JSON sources and null for ones it cannot read; an
    // icon path always yields a texture.
    const [validTexture, invalidTexture] = await Promise.all(
        [validIcon, invalidIcon].map(async src => {
            const texture = await foundry.canvas.loadTexture(src);
            return texture instanceof PIXI.Texture ? texture : PIXI.Texture.EMPTY;
        })
    );

    return (crosshair, isValid) => {
        crosshair.controlIcon.texture = isValid ? validTexture : invalidTexture;
    };
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

/**
 * Returns the origin of a region's first shape, or null if it has none.
 *
 * Reads the shape's own `origin` getter, which Foundry defines per shape type: an emanation
 * resolves to the centre of its base token and a polygon to its stored origin or centroid, neither
 * of which is the shape's `x`/`y`.
 */
export function getRegionOrigin(region: RegionDocumentPF2e): Point | null {
    const shape = region?.shapes?.at(0) as RegionShapeGeometry | undefined;
    const origin = shape?.origin;
    return origin ? { x: origin.x, y: origin.y } : null;
}

/**
 * Returns the rotation of a region's first shape in degrees.
 *
 * PF2e emits `line` shapes for line areas, carrying the direction in `rotation`, which corresponds
 * to the pre-v14 `MeasuredTemplate#direction`.
 */
export function getRegionDirection(region: RegionDocumentPF2e): number {
    const shape = region.shapes?.at(0) as RegionShapeGeometry | undefined;
    return shape?.rotation ?? 0;
}

/**
 * Returns the length of a region's `line` shape in grid units (feet), or null for other shapes.
 *
 * Shape dimensions are stored in pixels, so this converts back to the scene's distance units.
 */
export function getRegionLengthInUnits(region: RegionDocumentPF2e): number | null {
    const shape = region.shapes?.at(0) as RegionShapeGeometry | undefined;
    if (typeof shape?.length !== "number") return null;
    return (shape.length / canvas.grid.size) * canvas.grid.distance;
}

export function getTokensWithinRadius(
    center: Point,
    radiusFeet: number,
    options: { checkWalls?: boolean; scene?: Scene } = {}
): TokenPF2e[] {
    const scene = options.scene ?? canvas.scene;
    if (!scene) return [];

    const grid = canvas.grid;

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

/**
 * Deletes an item from its owning actor, reporting whether it happened.
 *
 * The collection check keeps a concurrent deletion from reaching the server, which would otherwise
 * log an error for a document that no longer exists.
 */
export async function deleteItemFromActor(
    item: ItemPF2e | null | undefined
): Promise<boolean> {
    if (!item?.actor) return false;
    if (!item.actor.items.has(item.id)) return false;

    try {
        await item.delete();
        return true;
    } catch {
        return false;
    }
}