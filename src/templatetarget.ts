import { TokenPF2e, RegionDocumentPF2e } from "foundry-pf2e";
import { getSocket } from "./sockets.ts";

interface RegionDetails {
    regionId: string,
    tokenIds: string[]
}

let lastRegionDetails: RegionDetails | null;

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
        region: RegionDocumentPF2e, creatorUserId: string) {
    if (game.user.id !== creatorUserId) {
        return;
    }

    const tokens = await getTemplateTokens(region);
    const tokenIds = tokens.map((token) => token.id);

    replaceTargets(tokenIds);

    lastRegionDetails = {
        regionId: region.id,
        tokenIds: tokenIds
    };
}

export function isLastTargetedRegion(regionId: string): boolean {
    return lastRegionDetails?.regionId === regionId;
}

export function deleteRegionTargets(_region: RegionDocumentPF2e) {
    const lastDetails = lastRegionDetails;
    if (!lastDetails) {
        return;
    }

    const currentTargets = game.user.targets.map((token) => token.id);
    const newTargets = Array.from(
        currentTargets.filter(item => !lastDetails.tokenIds.includes(item)));
    replaceTargets(newTargets);
    lastRegionDetails = null;
}

export async function getTemplateTokens(
    regionDocument: RegionDocumentPF2e
): Promise<TokenPF2e[]> {
    if (!regionDocument) return [];

    const boundTokens = regionDocument.tokens ? Array.from(regionDocument.tokens)
        .map(tDoc => tDoc.object)
        .filter((t): t is TokenPF2e => !!t)
        .filter((token) => {
            const actor = token.actor;
            if (!actor || token.document.hidden) return false;
            return actor.isOfType("creature", "hazard", "vehicle") && !actor.isDead;
        }) : [];

    if (boundTokens.length === 0 && regionDocument.testPoint) {
        return canvas.tokens.placeables.filter((token: TokenPF2e) => {
            const actor = token.actor;
            if (!actor || token.document.hidden) return false;
            if (!actor.isOfType("creature", "hazard", "vehicle") || actor.isDead) return false;

            return regionDocument.testPoint!({
                x: token.center.x,
                y: token.center.y,
                elevation: token.document.elevation
            });
        });
    }

    return boundTokens;
}

export function setRegionColorToBlack(region: RegionDocumentPF2e): void {
    if (!region.getFlag("samioli-module", "ignoreTemplateColourOverride")) {
        region.updateSource({ color: "#000000" });
    }
}