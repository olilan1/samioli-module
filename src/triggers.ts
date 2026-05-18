import { MeasuredTemplateDocumentPF2e, EffectPF2e } from "foundry-pf2e";
import { initiateStormSpiral } from "./actions/stormspiral.ts";
import { animateLightningDash } from "./actions/lightningdash.ts";
import { 
    chooseEffectOfPerniciousPoltergeist, 
    initiatePerniciousPoltergeist 
} from "./spells/perniciouspoltergeist.ts";
import { initiateBlazingDive } from "./spells/blazingdive.ts";
import { 
    initiateFloatingFlame, 
    sustainFloatingFlame, 
    removeFloatingFlame 
} from "./spells/floatingflame.ts";
import { removeWallOfFire } from "./spells/walloffire.ts";
import { sustainDancingBlade, cleanupDancingBlade } from "./spells/dancingblade.ts";
import { MODULE_ID } from "./utils.ts";

/**
 * Spells that opt-out of automatic sustain effect creation on cast,
 * managing their own sustain effects manually.
 */
export const MANUAL_SUSTAIN_SPELLS = new Set(["dancing-blade"]);

/**
 * Mappings for functions that run when a Measured Template is created.
 * Key: origin:item:[slug] roll option.
 */
const TEMPLATE_MAPPINGS_RUN_AS_CREATOR = {
    "origin:item:storm-spiral": initiateStormSpiral,
    "origin:item:lightning-dash": animateLightningDash,
    "origin:item:pernicious-poltergeist": initiatePerniciousPoltergeist,
    "origin:item:blazing-dive": initiateBlazingDive
};

/**
 * Mappings for template creation functions that must run with GM authority.
 */
const TEMPLATE_MAPPINGS_RUN_AS_GM = {
    "origin:item:floating-flame": initiateFloatingFlame
};

/**
 * Mappings for functions triggered by the "Sustain" action.
 */
const SUSTAIN_MAPPINGS = {
    "origin:item:pernicious-poltergeist": chooseEffectOfPerniciousPoltergeist,
    "origin:item:floating-flame": sustainFloatingFlame,
    "origin:item:dancing-blade": sustainDancingBlade
};

/**
 * Mappings for cleanup functions triggered when a Measured Template is deleted.
 */
const TEMPLATE_DELETION_MAPPINGS = {
    "origin:item:floating-flame": removeFloatingFlame,
    "origin:item:wall-of-fire": removeWallOfFire
};

/**
 * Mappings for cleanup functions triggered when a Sustain Tracking Effect is deleted.
 */
const SUSTAIN_DELETION_MAPPINGS = {
    "origin:item:dancing-blade": cleanupDancingBlade
};

// --- Trigger Runners ---

export function runMatchingTemplateFunctionAsCreator(
    template: MeasuredTemplateDocumentPF2e
): boolean {
    return runMatchingFunctionsFromMappings(template, TEMPLATE_MAPPINGS_RUN_AS_CREATOR);
}

export function runMatchingTemplateFunctionAsGm(
    template: MeasuredTemplateDocumentPF2e
): boolean {
    return runMatchingFunctionsFromMappings(template, TEMPLATE_MAPPINGS_RUN_AS_GM);
}

export function runMatchingSustainFunction(
    document: MeasuredTemplateDocumentPF2e | EffectPF2e
): boolean {
    const mappings: Record<string, (doc: MeasuredTemplateDocumentPF2e | EffectPF2e) => void> = 
        SUSTAIN_MAPPINGS;
    return runMatchingFunctionsFromMappings(document, mappings);
}

export function runMatchingTemplateDeletionFunction(
    template: MeasuredTemplateDocumentPF2e
): boolean {
   return runMatchingFunctionsFromMappings(template, TEMPLATE_DELETION_MAPPINGS);
}

export function runMatchingSustainDeletionFunction(effect: EffectPF2e): boolean {
    return runMatchingFunctionsFromMappings(effect, SUSTAIN_DELETION_MAPPINGS);
}

// --- Internal Helper ---

/**
 * Iterates through a mapping object and executes the first function whose key
 * matches the document's origin roll options.
 */
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

/**
 * Checks if a document (Template or Effect) contains a specific origin roll option.
 * Falls back to slug checking for effects that may lack explicit origin flags.
 */
function rollOptionsContains(
    document: MeasuredTemplateDocumentPF2e | EffectPF2e, 
    rollOption: string
) {
    const rollOptions = document.flags.pf2e?.origin?.rollOptions;
    if (rollOptions?.includes(rollOption)) return true;

    // Sustaining effects often don't have full origin data, so we check the flag or slug
    if (document.type === "effect") {
        const spellId = document.getFlag(MODULE_ID, "sustainedSpellId");
        if (spellId) {
            const spell = document.actor?.items.get(spellId as string);
            if (spell && `origin:item:${spell.slug}` === rollOption) return true;
        } else if (document.slug) {
            const spellSlug = document.slug.replace("sustaining-effect-", "");
            if (`origin:item:${spellSlug}` === rollOption) return true;
        }
    }

    return false;
}
