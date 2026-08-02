import { RegionDocumentPF2e, EffectPF2e } from "foundry-pf2e";
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
import { sustainDancingBlade, cleanupDancingBlade } from "./spells/dancingblade.ts";
import { MODULE_ID } from "./utils.ts";
import { RegionOriginFlag } from "./types.ts";

/**
 * Spells that opt-out of automatic sustain effect creation on cast,
 * managing their own sustain effects manually.
 */
export const MANUAL_SUSTAIN_SPELLS = new Set(["dancing-blade"]);

type RegionTriggerFunction = (doc: RegionDocumentPF2e) => void;

/**
 * Mappings for functions that run when a Scene Region is created.
 * Key: origin:item:[slug] roll option.
 */
const REGION_MAPPINGS_RUN_AS_CREATOR: Record<string, RegionTriggerFunction> = {
    "origin:item:storm-spiral": initiateStormSpiral as RegionTriggerFunction,
    "origin:item:lightning-dash": animateLightningDash as RegionTriggerFunction,
    "origin:item:pernicious-poltergeist": initiatePerniciousPoltergeist as RegionTriggerFunction,
    "origin:item:blazing-dive": initiateBlazingDive as RegionTriggerFunction
};

/**
 * Mappings for region creation functions that must run with GM authority.
 */
const REGION_MAPPINGS_RUN_AS_GM: Record<string, RegionTriggerFunction> = {
    "origin:item:floating-flame": initiateFloatingFlame as RegionTriggerFunction
};

/**
 * Mappings for functions triggered by the "Sustain" action.
 */
type SustainTriggerFunction = (doc: RegionDocumentPF2e | EffectPF2e) => void;

const SUSTAIN_MAPPINGS: Record<string, SustainTriggerFunction> = {
    "origin:item:pernicious-poltergeist": chooseEffectOfPerniciousPoltergeist as SustainTriggerFunction,
    "origin:item:floating-flame": sustainFloatingFlame as SustainTriggerFunction,
    "origin:item:dancing-blade": sustainDancingBlade as SustainTriggerFunction
};

/**
 * Mappings for cleanup functions triggered when a Scene Region is deleted.
 */
const REGION_DELETION_MAPPINGS: Record<string, RegionTriggerFunction> = {
    "origin:item:floating-flame": removeFloatingFlame as RegionTriggerFunction
};

/**
 * Mappings for cleanup functions triggered when a Sustain Tracking Effect is deleted.
 */
const SUSTAIN_DELETION_MAPPINGS = {
    "origin:item:dancing-blade": cleanupDancingBlade
};

// --- Trigger Runners ---

export function runMatchingRegionFunctionAsCreator(
    region: RegionDocumentPF2e
): boolean {
    return runMatchingFunctionsFromMappings(region, REGION_MAPPINGS_RUN_AS_CREATOR);
}

export function runMatchingRegionFunctionAsGm(
    region: RegionDocumentPF2e
): boolean {
    return runMatchingFunctionsFromMappings(region, REGION_MAPPINGS_RUN_AS_GM);
}

export function runMatchingSustainFunction(
    document: RegionDocumentPF2e | EffectPF2e
): boolean {
    return runMatchingFunctionsFromMappings(document, SUSTAIN_MAPPINGS);
}

export function runMatchingRegionDeletionFunction(
    region: RegionDocumentPF2e
): boolean {
   return runMatchingFunctionsFromMappings(region, REGION_DELETION_MAPPINGS);
}

export function runMatchingSustainDeletionFunction(effect: EffectPF2e): boolean {
    return runMatchingFunctionsFromMappings(effect, SUSTAIN_DELETION_MAPPINGS);
}

// --- Internal Helper ---

/**
 * Iterates through a mapping object and executes the first function whose key
 * matches the document's origin roll options.
 */
function runMatchingFunctionsFromMappings<T extends RegionDocumentPF2e | EffectPF2e>(
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

/** Narrows a trigger document to an Effect. Regions have no `type` field. */
function isEffectDocument(
    document: RegionDocumentPF2e | EffectPF2e
): document is EffectPF2e {
    return document.documentName === "Item";
}

/**
 * Checks if a document (Region or Effect) contains a specific origin roll option.
 * Falls back to slug checking for effects that may lack explicit origin flags.
 */
function rollOptionsContains(
    document: RegionDocumentPF2e | EffectPF2e,
    rollOption: string
) {
    const origin = document.flags.pf2e?.origin as RegionOriginFlag | undefined;
    if (origin?.rollOptions?.includes(rollOption)) return true;

    // Sustaining effects often don't have full origin data, so we check the flag or slug
    if (isEffectDocument(document)) {
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
