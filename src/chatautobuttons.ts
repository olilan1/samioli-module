import { startWallOfFire } from "./spells/walloffire.ts";
import { startDiveAndBreach } from "./spells/diveandbreach.ts";
import { playRisingHurricaneAtLastPlacedTemplate } from "./actions/risinghurricane.ts";
import { ChatMessagePF2e, TokenPF2e } from "foundry-pf2e";
import { startSonicDash } from "./actions/sonicdash.ts";
import { startDazzlingDisplay } from "./actions/dazzlingdisplay.ts";
import { startTectonicStomp } from "./actions/tectonicstomp.ts";
import { startRedistributePotential } from "./spells/redistributepotential.ts";

const SLUG_PREFIX = 'origin:item:slug:';

type ButtonSpec = {
    label: string;
    function: (token: TokenPF2e, message: ChatMessagePF2e) => void;
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
    }
}

const AUTO_SWAP_BUTTONS_SPELLS: Record<string, ButtonSpec> = {
    "redistribute-potential": {
        label: "Redistribute Potential!",
        function: startRedistributePotential
    }
};

export function addAutoButtonIfNeeded(message: ChatMessagePF2e, html: JQuery<HTMLElement>) {
    const origin = message.flags.pf2e.origin;
    const rollOptions = origin?.rollOptions;
    if (!rollOptions) return;

    const token = message.token?.object;
    if (!token) return;

    const slug = rollOptions.find(item => item.startsWith(SLUG_PREFIX))?.slice(SLUG_PREFIX.length);
    if (!slug) return;

    addMatchingButtons(slug, AUTO_BUTTONS_SPELLS, '.spell-button', token, message, html);
    addMatchingButtons(slug, AUTO_BUTTONS_ACTIONS, '.card-content', token, message, html);
    swapTemplateButtons(slug, AUTO_SWAP_BUTTONS_SPELLS, '.spell-button', 'button[data-action="spell-template"]', token, message, html);
}

function addMatchingButtons(slug: string, mappings: Record<string, ButtonSpec>,
        divLookup: string, token: TokenPF2e, message: ChatMessagePF2e, html: JQuery<HTMLElement>) {
    for (const [key, buttonSpec] of Object.entries(mappings)) {
        if (slug === key) {
            const div = html.find(divLookup);
            const button = $('<button type="button">' + buttonSpec.label + '</button>');
            button.on("click", function() {
                buttonSpec.function(token, message);
            });
            div.after(button);
        }
    }
}

function swapTemplateButtons(slug: string, mappings: Record<string, ButtonSpec>,
        divLookup: string, buttonDataAction: string, token: TokenPF2e,  
        message: ChatMessagePF2e, html: JQuery<HTMLElement>) {
    for (const [key, buttonSpec] of Object.entries(mappings)) {
        if (slug === key) {
            const templateButton = html.find(buttonDataAction);
            const parentDiv = templateButton.closest(`div${divLookup}`);
            const button = $('<button type="button">' + buttonSpec.label + '</button>');
            button.on("click", function() {
                buttonSpec.function(token, message);
            });
            parentDiv.after(button);
            parentDiv.remove();
        }
    }
}