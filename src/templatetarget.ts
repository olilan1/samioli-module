import { MeasuredTemplateDocumentPF2e, TokenPF2e, RegionDocumentPF2e, TokenDocumentPF2e } from "foundry-pf2e";
import { delay } from "./utils.ts";
import { getSocket } from "./sockets.ts";

const GRID_HIGHLIGHT_RETRY_TIME = 20;
const GRID_HIGHLIGHT_MAX_TIME = 1000;

interface TemplateDetails {
    templateId: string,
    tokenIds: string[]
}

let lastTemplateDetails: TemplateDetails | null;

export async function replaceTargets(arrayOfTokenIds: string[]) {
    canvas.tokens.setTargets(arrayOfTokenIds, {mode: "replace"});
}

export async function replaceTargetsForUser(userId: string, arrayOfTokenIds: string[]) {
    await getSocket().executeAsUser(replaceTargets, userId, arrayOfTokenIds);
}

export async function replaceTargetsForUsers(userIds: string[], arrayOfTokenIds: string[]) {
    await getSocket().executeForUsers(replaceTargets, userIds, arrayOfTokenIds);
}

export async function targetTokensUnderRegion(
        region: MeasuredTemplateDocumentPF2e | RegionDocumentPF2e, creatorUserId: string) {
    if (game.user.id !== creatorUserId) {
        return;
    }

    const tokens = await getTemplateTokens(region);
    const tokenIds = tokens.map((token) => token.id);

    replaceTargets(tokenIds);

    lastTemplateDetails = {
        templateId: region.id,
        tokenIds: tokenIds
    };
}

export const targetTokensUnderTemplate = targetTokensUnderRegion;

export function isLastTargetedRegion(regionId: string): boolean {
    return lastTemplateDetails?.templateId === regionId;
}

export const isLastTargetedTemplate = isLastTargetedRegion;

export function deleteRegionTargets(_region: MeasuredTemplateDocumentPF2e | RegionDocumentPF2e) {
    const lastDetails = lastTemplateDetails;
    if (!lastDetails) {
        return;
    }

    const currentTargets = game.user.targets.map((token) => token.id);
    const newTargets = Array.from(
        currentTargets.filter(item => !lastDetails.tokenIds.includes(item)));
    replaceTargets(newTargets);
    lastTemplateDetails = null;
}

export const deleteTemplateTargets = deleteRegionTargets;

export async function getTemplateTokens(
    regionDocument: MeasuredTemplateDocumentPF2e | RegionDocumentPF2e
): Promise<TokenPF2e[]> {
    if ("tokens" in regionDocument) {
        const boundTokens = Array.from(regionDocument.tokens)
            .map(tDoc => (tDoc as TokenDocumentPF2e).object)
            .filter((t): t is TokenPF2e => !!t)
            .filter((token) => {
                const actor = token.actor;
                if (!actor || token.document.hidden) return false;
                if (!actor.isOfType("creature", "hazard", "vehicle") || actor.isDead) return false;
                return true;
            });

        if (boundTokens.length === 0) {
            return (canvas.tokens?.placeables ?? []).filter((token: TokenPF2e) => {
                const actor = token.actor;
                if (!actor || token.document.hidden) return false;
                if (!actor.isOfType("creature", "hazard", "vehicle") || actor.isDead) return false;

                const point = {
                    x: token.center.x,
                    y: token.center.y,
                    elevation: token.document.elevation ?? 0
                };
                const regDoc = regionDocument as RegionDocumentPF2e;
                if (typeof regDoc.testPoint === "function") {
                    return regDoc.testPoint(point);
                }
                return false;
            }) as TokenPF2e[];
        }

        return boundTokens;
    }

    const template = regionDocument.object;
    if (!template) {
        return [];
    }

    const gridSize = canvas.grid.size;
    const origin = template.center;

    // It can take a few moments for the gridHighlight to be updated.
    let gridHighlight;
    let waitTime = 0;
    while ((!gridHighlight || gridHighlight.getLocalBounds(undefined, true).x == 0)
            && waitTime < GRID_HIGHLIGHT_MAX_TIME) {
        await delay(GRID_HIGHLIGHT_RETRY_TIME);
        waitTime += GRID_HIGHLIGHT_RETRY_TIME;
        gridHighlight = canvas.interface.grid.getHighlightLayer(template.highlightId);
    }

    if (!gridHighlight) {
        return [];
    }

    const tokens = canvas.tokens.quadtree.getObjects(
        gridHighlight.getLocalBounds(undefined, true)
    );

    const containedTokens = [];
    for (const token of tokens) {
        const actorType = token.actor?.type;
        if (actorType !== "character" && actorType !== "npc") {
            continue;
        }

        const tokenDoc = token.document;
        const tokenPositions = [];

        for (let h = 0; h < tokenDoc.height; h++) {
            const tokenX = Math.floor(token.x / gridSize) * gridSize;
            const tokenY = Math.floor(token.y / gridSize) * gridSize;
            const y = tokenY + h * gridSize;

            tokenPositions.push(`${tokenX},${y}`);

            if (tokenDoc.width > 1) {
                for (let w = 1; w < tokenDoc.width; w++) {
                    tokenPositions.push(`${tokenX + w * gridSize},${y}`);
                }
            }
        }

        for (const position of tokenPositions) {
            if (!gridHighlight.positions.has(position)) {
                continue;
            }

            const [gx, gy] = position.split(",").map((s) => Number(s));
            const destination = {
                x: gx + canvas.dimensions.size * 0.5,
                y: gy + canvas.dimensions.size * 0.5,
            };
            if (destination.x < 0 || destination.y < 0) continue;

            const collisionType = "move";
            const hasCollision = CONFIG.Canvas.polygonBackends[collisionType].testCollision(
                origin,
                destination,
                {
                    type: collisionType,
                    mode: "any",
                }
            );

            if (!hasCollision) {
                containedTokens.push(token);
                break;
            }
        }
    }

    return containedTokens as TokenPF2e[];
}

export function setRegionColorToBlack(
    region: MeasuredTemplateDocumentPF2e | RegionDocumentPF2e
): void {
    if (!region.getFlag('samioli-module', 'ignoreTemplateColourOverride')) {
        if ("color" in region) {
            region.updateSource({
                color: "#000000"
            });
        } else {
            region.updateSource({
                fillColor: "#000000",
                borderColor: "#000000"
            });
        }
    }
}

/** Backward-compatibility alias for setRegionColorToBlack */
export const setTemplateColorToBlack = setRegionColorToBlack;