import { TokenDocumentPF2e } from "foundry-pf2e";
import { triggerSnare } from "./actions/snare.ts";

export class samiOliModuleAPI {
    
    static async handleSnareRegionEnter(snareId: string, itemUuid: string, deployerUuid: string, token: TokenDocumentPF2e, x: number, y: number) {
        triggerSnare(snareId, itemUuid, deployerUuid, token, x, y);
    }
}