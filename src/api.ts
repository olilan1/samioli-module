import { TokenDocumentPF2e, TokenPF2e } from "foundry-pf2e";
import { triggerSnare } from "./actions/snare.ts";
import { displayShiftingWeaponDialogViaMacro } from "./actions/shifting.ts";

export class samiOliModuleAPI {
    
    static async handleSnareRegionEnter(snareId: string, itemUuid: string, deployerUuid: string, token: TokenDocumentPF2e, x: number, y: number) {
        triggerSnare(snareId, itemUuid, deployerUuid, token, x, y);
    }

    static async handleShiftingWeapon(token: TokenPF2e) {
        displayShiftingWeaponDialogViaMacro(token);
    }
}