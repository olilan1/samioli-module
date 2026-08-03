import { RegionDocumentPF2e, TokenPF2e } from "foundry-pf2e";
import { Point } from "foundry-pf2e/foundry/common/_types.mjs";

/**
 * Whether a token can be affected by a spell area.
 *
 * Excludes tokens with no actor, hidden tokens, anything that is not a creature, hazard or vehicle,
 * and the dead.
 */
export function isValidAreaTarget(token: TokenPF2e): boolean {
    const actor = token.actor;
    if (!actor || token.document.hidden) return false;
    return actor.isOfType("creature", "hazard", "vehicle") && !actor.isDead;
}

/**
 * Applies the rules shared by every area: only valid targets, and only those the area covers.
 *
 * Each area helper supplies its own geometry through `isInArea`.
 */
export function getAffectedTokens(isInArea: (token: TokenPF2e) => boolean): TokenPF2e[] {
    if (!canvas.scene) return [];

    return canvas.tokens.placeables.filter(
        (token: TokenPF2e) => isValidAreaTarget(token) && isInArea(token)
    );
}

/**
 * Returns the tokens in an emanation of the given radius from a creature.
 *
 * Distance is PF2e's token-to-token measurement, which runs outward from the creature's own squares,
 * so `origin` is expected to be a token's centre. For an area centred on an arbitrary point — a
 * burst placed by a crosshair, which may snap to a grid corner — use `getTokensInBurst` instead:
 * this measures from the whole grid square containing `origin`, which is offset from a corner by
 * half a square in each axis.
 */
export function getTokensInEmanation(origin: Point, radiusFeet: number): TokenPF2e[] {
    return getAffectedTokens(token => token.distanceTo(origin) <= radiusFeet);
}

/**
 * Returns the tokens covered by a burst of the given radius centred on a point.
 *
 * The burst polygon comes from the grid itself, so it follows the world's diagonal rule and is
 * symmetric about `origin` even when that is a grid corner. Every square of a token's footprint is
 * tested, so a large token counts as covered when any one of its squares is inside.
 *
 * Use `getTokensInEmanation` instead for an area emanating from a creature.
 */
export function getTokensInBurst(origin: Point, radiusFeet: number): TokenPF2e[] {
    // The polygon's diagonal edge runs through the centres of the squares at the burst's cut-off —
    // the ones the grid's diagonal rule counts as out of range — so those centres land exactly on
    // the boundary, where containment is unreliable. Shrinking the radius fractionally makes the
    // test strictly interior; it is far smaller than the gap to any square that is genuinely inside.
    const burst = new PIXI.Polygon(canvas.grid.getCircle(origin, radiusFeet - 0.01));

    return getAffectedTokens(token => token.footprint.some(offset => {
        const squareCentre = canvas.grid.getCenterPoint(offset);
        return burst.contains(squareCentre.x, squareCentre.y);
    }));
}

/**
 * Returns the tokens inside a region that are valid targets: visible, living creatures, hazards or
 * vehicles whose footprint overlaps the region's shape.
 */
export function getTokensInRegion(regionDocument: RegionDocumentPF2e): TokenPF2e[] {
    if (!regionDocument) return [];

    // testInsideRegion throws when the token and region belong to different scenes.
    if (!canvas.scene || regionDocument.parent !== canvas.scene) return [];

    return getAffectedTokens(token => token.document.testInsideRegion(regionDocument));
}

/**
 * Returns the tokens occupying a grid square.
 *
 * Deliberately outside `getAffectedTokens`: this reports occupancy without judging whether a token
 * is a valid area target, because snare placement needs a downed creature to count as filling a
 * square. Callers targeting an area should filter with `isValidAreaTarget`.
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
