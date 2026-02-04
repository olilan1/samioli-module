import { triggerSnare } from "./actions/snare.ts";

export class samiOliModuleAPI {
    
    static async handleSnareRegionEnter(string: String) {
        console.log(string);
        triggerSnare();
    }
}