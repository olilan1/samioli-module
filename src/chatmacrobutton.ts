import { startWallOfFire } from "./spells/walloffire.ts";
import { startDiveAndBreach } from "./spells/diveandbreach.ts";
import { editSkillRoll } from "./actions/enjoytheshow.ts";
import { playRisingHurricaneAtLastPlacedTemplate } from "./actions/risinghurricane.ts";
import { ChatMessagePF2e, TokenPF2e } from "foundry-pf2e";

const SLUG_PREFIX = 'origin:item:slug:';

export function addMacroButtonIfSupported(chatMessagePF2e: ChatMessagePF2e, html: JQuery<HTMLElement>) {
    const origin = chatMessagePF2e.flags.pf2e.origin;
    const rollOptions = origin?.rollOptions;
    if (!rollOptions) {
        return;
    }

    const slug = rollOptions.find(item => item.startsWith(SLUG_PREFIX))?.slice(SLUG_PREFIX.length);
    if (!slug) {
        return;
    }

    if (origin.type === 'spell') {
        // It's a spell, check if it's one we have a macro for
        findRelevantSpell(slug, chatMessagePF2e, html);
    } else if (origin.type === 'feat') {
        // It's a feat, check if it's one we have a macro for
        findRelevantFeat(slug, chatMessagePF2e, html);
    }
}

function findRelevantSpell(spellSlug: string, message: ChatMessagePF2e, html: JQuery<HTMLElement>) {
    if (!message.token?.object) {
        return;
    }

    switch (spellSlug) {
        case "wall-of-fire": {
            const $spellButtonDiv = html.find('.spell-button');
            const newButton = createWallOfFireButton(message.token.object);
            $spellButtonDiv.after(newButton);
            break;
        }
        case "dive-and-breach": {
            const $spellButtonDiv = html.find('.spell-button');
            const newButton = createDiveAndBreach(message.token.object);
            $spellButtonDiv.after(newButton);
            break;
        }
    }
}

function findRelevantFeat(featSlug: string, message: ChatMessagePF2e, html: JQuery<HTMLElement>) {
    switch (featSlug) {
        case "enjoy-the-show": {
            editSkillRoll(html, message.actor);
            break;
        }
        case "rising-hurricane": {
            if (!message.token?.object) {
                return;
            }
            const $featButtonDiv = html.find('.card-content');
            const newButton = createRisingHurricaneButton(message.token.object);
            $featButtonDiv.after(newButton);
            break;
        }
        default:
            return;
      }
}

function createRisingHurricaneButton(token: TokenPF2e) {
    const button = $('<button type="button">Deploy Rising Hurricane!</button>');
    button.on("click", function() {
        playRisingHurricaneAtLastPlacedTemplate(token);
    });

    return button;
}

function createWallOfFireButton(token: TokenPF2e) {
    const button = $('<button type="button">Deploy Wall of Fire!</button>');
    button.on("click", function() {
        startWallOfFire(token);
    });

    return button;
}

function createDiveAndBreach(token: TokenPF2e) {
    const button = $('<button type="button">Start diving!</button>');
    button.on("click", function() {
        startDiveAndBreach(token);
    });

    return button;
}