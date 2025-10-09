import { MeasuredTemplateDocumentPF2e } from "foundry-pf2e";
import { initiateStormSpiral } from "./actions/stormspiral.ts";
import { animateLightningDash } from "./actions/lightningdash.ts";
import { chooseEffectOfPerniciousPoltergeist, initiatePerniciousPoltergeist } from "./spells/perniciouspoltergeist.ts";
import { initiateBlazingDive } from "./spells/blazingdive.ts";
import { initiateFloatingFlame, sustainFloatingFlame, removeFloatingFlame } from "./spells/floatingflame.ts";
import { removeWallOfFire } from "./spells/walloffire.ts";

const TEMPLATE_MAPPINGS_RUN_AS_CREATOR = {
    "origin:item:storm-spiral": initiateStormSpiral,
    "origin:item:lightning-dash": animateLightningDash,
    "origin:item:pernicious-poltergeist": initiatePerniciousPoltergeist,
    "origin:item:blazing-dive": initiateBlazingDive
};

const TEMPLATE_MAPPINGS_RUN_AS_GM = {
    "origin:item:floating-flame": initiateFloatingFlame
}

const SUSTAIN_MAPPINGS = {
    "origin:item:pernicious-poltergeist": chooseEffectOfPerniciousPoltergeist,
    "origin:item:floating-flame": sustainFloatingFlame
};

const TEMPLATE_DELETION_MAPPINGS = {
    "origin:item:floating-flame": removeFloatingFlame,
    "origin:item:wall-of-fire": removeWallOfFire
};

export function runMatchingTemplateFunctionAsCreator(template: MeasuredTemplateDocumentPF2e): boolean {
    return runMatchingFunctionsFromMappings(template, TEMPLATE_MAPPINGS_RUN_AS_CREATOR);
}

export function runMatchingTemplateFunctionAsGm(template: MeasuredTemplateDocumentPF2e): boolean {
    return runMatchingFunctionsFromMappings(template, TEMPLATE_MAPPINGS_RUN_AS_GM);
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