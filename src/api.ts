import { RegionDocumentPF2e, TokenDocumentPF2e, TokenPF2e } from "foundry-pf2e";
import { triggerSnare } from "./actions/snare.ts";
import { displayShiftingWeaponDialogViaMacro } from "./actions/shifting.ts";
import { startEmote } from "./actions/emote.ts";
import {
    addEffectsToTokensInStartOfTurnTemplates,
    handleStartOfTurnTokenEnter,
    handleStartOfTurnTokenExit
} from "./startofturnspells.ts";

export class samiOliModuleAPI {

    static async handleSnareRegionEnter(
        snareId: string,
        itemUuid: string,
        deployerUuid: string,
        token: TokenDocumentPF2e,
        x: number,
        y: number
    ) {
        triggerSnare(snareId, itemUuid, deployerUuid, token, x, y);
    }

    static async handleShiftingWeapon(token: TokenPF2e) {
        displayShiftingWeaponDialogViaMacro(token);
    }

    static async handleEmote(token: TokenPF2e) {
        startEmote(token);
    }

    static async addEffectsToTokensInStartOfTurnTemplates(region: RegionDocumentPF2e) {
        return addEffectsToTokensInStartOfTurnTemplates(region);
    }

    static async handleStartOfTurnTokenEnter(token: TokenPF2e, region: RegionDocumentPF2e) {
        return handleStartOfTurnTokenEnter(token, region);
    }

    static async handleStartOfTurnTokenExit(token: TokenPF2e, region: RegionDocumentPF2e) {
        return handleStartOfTurnTokenExit(token, region);
    }
}