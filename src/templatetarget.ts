import {delay} from "./utils.ts";

const GRID_HIGHLIGHT_RETRY_TIME = 20;
const GRID_HIGHLIGHT_MAX_TIME = 1000;

let lastTemplateDetails;

export async function targetTokensUnderTemplate(template, userId) {
    if (game.user.id !== userId) {
        return;
    }

    const tokens = await getTemplateTokens(template);
    const tokenIds = tokens.map((token) => token.id);

    game.user.updateTokenTargets(tokenIds);
    game.user.broadcastActivity({ targets: tokenIds });

    lastTemplateDetails = {
        templateId: template.id,
        tokenIds: tokenIds
    };
}

export function deleteTemplateTargets(template) {
    if (lastTemplateDetails?.templateId != template.id) {
        return;
    }

    const currentTargets = game.user.targets.map((token) => token.id);
    const newTargets = currentTargets.filter(item => !lastTemplateDetails.tokenIds.includes(item));
    game.user.updateTokenTargets(newTargets);
    if (newTargets.size > 0) {
        game.user.broadcastActivity({ targets: newTargets });
    } else {
        game.user.broadcastActivity({ targets: [] });
    }
    lastTemplateDetails = null;
}

async function getTemplateTokens(measuredTemplateDocument) {
    const grid = canvas.interface.grid;
    const dimensions = canvas.dimensions;
    const template = measuredTemplateDocument.object;

    const gridSize = canvas.grid.size;
    const origin = template.center;

    // It can take a few moments for the gridHighlight to be updated.
    let gridHighlight;
    let waitTime = 0;
    while ((!gridHighlight || gridHighlight.getLocalBounds(undefined, true).x == 0)
            && waitTime < GRID_HIGHLIGHT_MAX_TIME) {
        await delay(GRID_HIGHLIGHT_RETRY_TIME);
        waitTime += GRID_HIGHLIGHT_RETRY_TIME;
        gridHighlight = grid.getHighlightLayer(template.highlightId);
    }

    if (!gridHighlight) {
        return [];
    }

    const tokens = canvas.tokens.quadtree.getObjects(
        gridHighlight.getLocalBounds(undefined, true)
    );

    const containedTokens = [];
    for (const token of tokens) {
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
                x: gx + dimensions.size * 0.5,
                y: gy + dimensions.size * 0.5,
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

    return containedTokens;
}
