import { MeasuredTemplateDocumentPF2e } from "foundry-pf2e";
import { initiateStormSpiral } from "./actions/stormspiral.ts";
import { animateLightningDash } from "./actions/lightningdash.ts";
import { chooseEffectOfPerniciousPoltergeist, initiatePerniciousPoltergeist } from "./spells/perniciouspoltergeist.ts";
import { initiateBlazingDive } from "./spells/blazingdive.ts";

const TEMPLATE_MAPPINGS = {
    "origin:item:storm-spiral": initiateStormSpiral,
    "origin:item:lightning-dash": animateLightningDash,
    "origin:item:pernicious-poltergeist": initiatePerniciousPoltergeist,
    "origin:item:blazing-dive": initiateBlazingDive,
};

const SUSTAIN_MAPPINGS = {
    "origin:item:pernicious-poltergeist": chooseEffectOfPerniciousPoltergeist,
};

export function runMatchingTemplateFunction(template: MeasuredTemplateDocumentPF2e, creatorUserId: string): boolean {
    if (game.user.id !== creatorUserId) {
        return false;
    }
    for (const [originString, func] of Object.entries(TEMPLATE_MAPPINGS)) {
        if (templateRollOptionsContains(template, originString)) {
            func(template);
            return true;
        }
    }
    return false;
}

export function runMatchingSustainFunction(template: MeasuredTemplateDocumentPF2e): boolean {
    for (const [originString, func] of Object.entries(SUSTAIN_MAPPINGS)) {
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