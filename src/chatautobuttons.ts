import { startWallOfFire } from "./spells/walloffire.ts";
import { startDiveAndBreach } from "./spells/diveandbreach.ts";
import { playRisingHurricaneAtLastPlacedTemplate } from "./actions/risinghurricane.ts";
import { ChatMessagePF2e, TokenPF2e } from "foundry-pf2e";
import { startSonicDash } from "./actions/sonicdash.ts";
import { startDazzlingDisplay } from "./actions/dazzlingdisplay.ts";
import { startTectonicStomp } from "./actions/tectonicstomp.ts";
import { startRedistributePotential } from "./spells/redistributepotential.ts";
import { summonGhostlyCarrier } from "./spells/ghostlycarrier.ts";
import { selectForceBarrageTargets } from "./spells/forcebarrage.ts";
import { displayShiftingWeaponDialogFromActivationsModule } from "./actions/shifting.ts";
import { deploySnare, removeSnare } from "./actions/snare.ts";
import { startTranslocate, startWarpStep } from "./spells/translocate.ts";

const SLUG_PREFIX = 'origin:item:slug:';
const CATEGORY_PREFIX = 'origin:item:category:';
const TEMPLATE_BUTTON_SPELL = 'button[data-action="spell-template"]';
const DAMAGE_BUTTON_SPELL = 'button[data-action="spell-damage"]';
const USE_BUTTON_CONSUMABLE = 'button[data-action="consume"]';

export type ButtonSpec = {
    matcher?: string; // If not provided, the key is used as the matcher
    label: string;
    function: (token: TokenPF2e, message: ChatMessagePF2e) => void;
    condition?: (message: ChatMessagePF2e) => boolean;
}
export interface ButtonSwapSpec extends ButtonSpec {
    buttonToReplace: string;
}

const AUTO_BUTTONS_SPELLS: Record<string, ButtonSpec> = {
    "wall-of-fire": {
        label: "Deploy Wall of Fire!",
        function: startWallOfFire
    },
    "dive-and-breach": {
        label: "Start diving!",
        function: startDiveAndBreach
    },
    "ghostly-carrier": {
        label: "Summon a ghostly carrier!",
        function: summonGhostlyCarrier
    },
    "translocate": {
        label: "Translocate!",
        function: startTranslocate
    },
    "dimension-door": {
        label: "Translocate!",
        function: startTranslocate
    },
    "warp-step": {
        label: "Warp!",
        function: startWarpStep,
        condition: (message: ChatMessagePF2e) =>
            !!(message.flags?.pf2e?.origin?.rollOptions?.includes("origin:item:tag:amped"))
    }
};

const AUTO_BUTTONS_ACTIONS: Record<string, ButtonSpec> = {
    "rising-hurricane": {
        label: "Deploy Rising Hurricane!",
        function: playRisingHurricaneAtLastPlacedTemplate
    },
    "sonic-dash": {
        label: "Start dashing!",
        function: startSonicDash
    },
    "dazzling-display": {
        label: "Start dazzling!",
        function: startDazzlingDisplay
    },
    "tectonic-stomp": {
        label: "Start stomping!",
        function: startTectonicStomp
    },
    "activation-shift-weapon": {
        label: "Shift weapon!",
        function: displayShiftingWeaponDialogFromActivationsModule
    }
}

const AUTO_SWAP_BUTTONS_SPELLS: Record<string, ButtonSwapSpec> = {
    "redistribute-potential": {
        label: "Redistribute Potential!",
        function: startRedistributePotential,
        buttonToReplace: TEMPLATE_BUTTON_SPELL
    },
    "force-barrage": {
        label: "Select Targets",
        function: selectForceBarrageTargets,
        buttonToReplace: DAMAGE_BUTTON_SPELL
    }
};

const AUTO_SWAP_BUTTONS_CONSUMABLES: Record<string, ButtonSwapSpec> = {
    "deploy-snare": {
        matcher: "snare",
        label: "Deploy Snare!",
        function: deploySnare,
        buttonToReplace: USE_BUTTON_CONSUMABLE,
        condition: (message: ChatMessagePF2e) => !(message.flags['samioli-module']?.snareId)
    },
    "remove-snare": {
        matcher: "snare",
        label: "Remove Snare?",
        function: removeSnare,
        buttonToReplace: USE_BUTTON_CONSUMABLE,
        condition: (message: ChatMessagePF2e) => !!(message.flags['samioli-module']?.snareId)
    }
};

/**
 * Checks a chat message for specific roll options (slugs or categories) 
 * and triggers the addition or swapping of custom UI buttons on the chat card.
 */
export function addAutoButtonIfNeeded(message: ChatMessagePF2e, html: JQuery<HTMLElement>) {
    const origin = message.flags.pf2e.origin;
    const rollOptions = origin?.rollOptions;
    if (!rollOptions) return;

    const token = message.token?.object;
    if (!token) return;

    const slug = rollOptions.find(item => item.startsWith(SLUG_PREFIX))?.slice(SLUG_PREFIX.length);
    if (slug) {
        console.log(message);
        if (message.flags.pf2e.casting) {
            addMatchingButtons(slug, AUTO_BUTTONS_SPELLS, '.card-buttons', token, message, html);
            swapButtons(slug, AUTO_SWAP_BUTTONS_SPELLS, '.spell-button', token, message, html);
        }
        addMatchingButtons(slug, AUTO_BUTTONS_ACTIONS, '.card-content', token, message, html);
    }

    const category = rollOptions.find(item => item.startsWith(CATEGORY_PREFIX))?.slice(CATEGORY_PREFIX.length);
    if (category) {
        swapButtons(category, AUTO_SWAP_BUTTONS_CONSUMABLES, '.card-buttons', token, message, html);
    }
}

function addMatchingButtons(slug: string, mappings: Record<string, ButtonSpec>,
    containerLookup: string, token: TokenPF2e, message: ChatMessagePF2e, html: JQuery<HTMLElement>) {
    for (const [key, buttonSpec] of Object.entries(mappings)) {
        const matcher = buttonSpec.matcher ?? key;
        
        if (slug !== matcher || (buttonSpec.condition && !buttonSpec.condition(message))) {
            continue;
        }

        const button = $(`<button type="button">${buttonSpec.label}</button>`);
        button.on("click", () => buttonSpec.function(token, message));

        // If the target container exists, place the new button at the end of it
        const targetContainer = html.find(containerLookup);
        if (targetContainer.length > 0) {
            targetContainer.after(button);
        }
    }
}

/**
 * Replaces an existing button (defined by buttonToReplace) with a custom button 
 * mapped to the provided slug.
 */
function swapButtons(slug: string, mappings: Record<string, ButtonSwapSpec>,
    divLookup: string, token: TokenPF2e,
    message: ChatMessagePF2e, html: JQuery<HTMLElement>) {
    for (const [key, buttonSpec] of Object.entries(mappings)) {
        const matcher = buttonSpec.matcher ?? key;

        if (slug !== matcher || (buttonSpec.condition && !buttonSpec.condition(message))) {
            continue;
        }

        const buttonDataAction = buttonSpec.buttonToReplace!;
        const templateButton = html.find(buttonDataAction);
        const parentDiv = templateButton.closest(`div${divLookup}`);
        const button = $(`<button type="button">${buttonSpec.label}</button>`);
        button.on("click", () => buttonSpec.function(token, message));
        parentDiv.after(button);
        parentDiv.remove();
    }
}