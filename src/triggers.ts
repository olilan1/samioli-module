import { MeasuredTemplateDocumentPF2e, EffectPF2e } from "foundry-pf2e";
import { initiateStormSpiral } from "./actions/stormspiral.ts";
import { animateLightningDash } from "./actions/lightningdash.ts";
import { chooseEffectOfPerniciousPoltergeist, initiatePerniciousPoltergeist } from "./spells/perniciouspoltergeist.ts";
import { initiateBlazingDive } from "./spells/blazingdive.ts";
import { initiateFloatingFlame, sustainFloatingFlame, removeFloatingFlame } from "./spells/floatingflame.ts";
import { removeWallOfFire } from "./spells/walloffire.ts";
import { sustainDancingBlade } from "./spells/dancingblade.ts";

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
    "origin:item:floating-flame": sustainFloatingFlame,
    "origin:item:dancing-blade": sustainDancingBlade
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

export function runMatchingSustainFunction(document: MeasuredTemplateDocumentPF2e | EffectPF2e): boolean {
    const mappings: Record<string, (doc: MeasuredTemplateDocumentPF2e | EffectPF2e) => void> = 
        SUSTAIN_MAPPINGS as Record<string, (doc: MeasuredTemplateDocumentPF2e | EffectPF2e) => void>;
    return runMatchingFunctionsFromMappings(document, mappings);
}

export function runMatchingTemplateDeletionFunction(template: MeasuredTemplateDocumentPF2e): boolean {
   return runMatchingFunctionsFromMappings(template, TEMPLATE_DELETION_MAPPINGS);
}

function runMatchingFunctionsFromMappings<T extends MeasuredTemplateDocumentPF2e | EffectPF2e>(
    document: T,
    mappings: Record<string, (doc: T) => void>
) {
    for (const [originString, func] of Object.entries(mappings)) {
        if (rollOptionsContains(document, originString)) {
            func(document);
            return true;
        }
    }
    return false;
}

function rollOptionsContains(document: MeasuredTemplateDocumentPF2e | EffectPF2e, rollOption: string) {
    const rollOptions = document.flags.pf2e?.origin?.rollOptions;
    if (rollOptions?.includes(rollOption)) return true;

    if (document.type === "effect" && document.slug) {
        const spellSlug = document.slug.replace("sustaining-effect-", "");
        if (`origin:item:${spellSlug}` === rollOption) return true;
    }

    return false;
}