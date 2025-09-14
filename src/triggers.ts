import { MeasuredTemplateDocumentPF2e } from "foundry-pf2e";
import { initiateStormSpiral } from "./actions/stormspiral.ts";
import { animateLightningDash } from "./actions/lightningdash.ts";
import { chooseEffectOfPerniciousPoltergeist, initiatePerniciousPoltergeist } from "./spells/perniciouspoltergeist.ts";
import { initiateFloatingFlame, sustainFloatingFlame, removeFloatingFlame } from "./spells/floatingflame.ts";

const TEMPLATE_MAPPINGS = {
    "origin:item:storm-spiral": initiateStormSpiral,
    "origin:item:lightning-dash": animateLightningDash,
    "origin:item:pernicious-poltergeist": initiatePerniciousPoltergeist,
    "origin:item:floating-flame": initiateFloatingFlame
};

const SUSTAIN_MAPPINGS = {
    "origin:item:pernicious-poltergeist": chooseEffectOfPerniciousPoltergeist,
    "origin:item:floating-flame": sustainFloatingFlame
};

const TEMPLATE_DELETION_MAPPINGS = {
    "origin:item:floating-flame": removeFloatingFlame
};

export function runMatchingTemplateFunction(template: MeasuredTemplateDocumentPF2e, creatorUserId: string): boolean {
    if (game.user.id !== creatorUserId) {
        return false;
    }
    return runMatchingFunctionsFromMappings(template, TEMPLATE_MAPPINGS);
}

export function runMatchingSustainFunction(template: MeasuredTemplateDocumentPF2e): boolean {
    return runMatchingFunctionsFromMappings(template, SUSTAIN_MAPPINGS);
}

export function runMatchingTemplateDeletionFunction(template: MeasuredTemplateDocumentPF2e): boolean {
   return runMatchingFunctionsFromMappings(template, TEMPLATE_DELETION_MAPPINGS);
}

function runMatchingFunctionsFromMappings(template: MeasuredTemplateDocumentPF2e,
    mappings: Record<string, (template: MeasuredTemplateDocumentPF2e) => void>) {
    for (const [originString, func] of Object.entries(mappings)) {
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