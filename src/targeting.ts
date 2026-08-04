import { RegionDocumentPF2e } from "foundry-pf2e";
import { getSocket } from "./sockets.ts";
import { getTokensInRegion } from "./areatargeting.ts";

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

    const tokens = getTokensInRegion(region);
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

/**
 * Blacks out a spell area at creation.
 *
 * Gated on `flags.pf2e.origin`, which PF2e writes only when placing an area from an item. Regions
 * are a general-purpose scene tool in v14, so an ordinary region a GM draws is left alone.
 */
export function setRegionColorToBlack(region: RegionDocumentPF2e): void {
    if (!region.flags.pf2e?.origin) return;
    region.updateSource({ color: "#000000" });
}