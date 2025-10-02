import { startWallOfFire } from "./spells/walloffire.ts";
import { startDiveAndBreach } from "./spells/diveandbreach.ts";
import { playRisingHurricaneAtLastPlacedTemplate } from "./actions/risinghurricane.ts";
import { ChatMessagePF2e, TokenPF2e } from "foundry-pf2e";
import { startSonicDash } from "./actions/sonicdash.ts";
import { startDazzlingDisplay } from "./actions/dazzlingdisplay.ts";

const SLUG_PREFIX = 'origin:item:slug:';

type ButtonSpec = {
    label: string;
    function: (token: TokenPF2e) => void;
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
    }
}

export function addAutoButtonIfNeeded(message: ChatMessagePF2e, html: JQuery<HTMLElement>) {
    const origin = message.flags.pf2e.origin;
    const rollOptions = origin?.rollOptions;
    if (!rollOptions) return;

    const token = message.token?.object;
    if (!token) return;

    const slug = rollOptions.find(item => item.startsWith(SLUG_PREFIX))?.slice(SLUG_PREFIX.length);
    if (!slug) return;

    addMatchingButtons(slug, AUTO_BUTTONS_SPELLS, '.spell-button', token, html);
    addMatchingButtons(slug, AUTO_BUTTONS_ACTIONS, '.card-content', token, html);
}

function addMatchingButtons(slug: string, mappings: Record<string, ButtonSpec>,
        divLookup: string, token: TokenPF2e, html: JQuery<HTMLElement>) {
    for (const [key, buttonSpec] of Object.entries(mappings)) {
        if (slug === key) {
            const div = html.find(divLookup);
            const button = $('<button type="button">' + buttonSpec.label + '</button>');
            button.on("click", function() {
                buttonSpec.function(token);
            });
            div.after(button);
        }
    }
}
