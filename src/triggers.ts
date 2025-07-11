import { MeasuredTemplateDocumentPF2e } from "foundry-pf2e";
import { initiateStormSpiral } from "./actions/stormspiral.ts";
import { animateLightningDash } from "./actions/lightningdash.ts";

const TEMPLATE_MAPPINGS = {
  "origin:item:storm-spiral": initiateStormSpiral,
  "origin:item:lightning-dash": animateLightningDash
};

export function runMatchingTemplateFunction(template: MeasuredTemplateDocumentPF2e): boolean {
    for (const [originString, func] of Object.entries(TEMPLATE_MAPPINGS)) {
        if (templateRollOptionsContains(template, originString)) {
            func(template);
            return true;
        }
    }
    return false;
}

function templateRollOptionsContains(template: MeasuredTemplateDocumentPF2e, rollOption: string) {
    const rollOptions = template.flags.pf2e?.origin?.rollOptions;
    return rollOptions?.includes(rollOption) ?? false;
}