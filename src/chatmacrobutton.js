import { startWallOfFire } from "./spells/walloffire.js";
import { startDiveAndBreach } from "./spells/diveandbreach.js";
import { editSkillRoll } from "./actions/enjoytheshow.js";
import { playRisingHurricaneAtLastPlacedTemplate } from "./actions/risinghurricane.js";
import { logd } from "./utils.js";

export function chatMacroButton(chatMessagePF2e, html) {
    
    //Check if passed message is a spell
    if (chatMessagePF2e.flags.pf2e.origin?.type === 'spell') {
        //if it is a spell, check if it's one we have a macro for
        let slugPrefix = 'origin:item:slug:';
        let spellSlugIndex = chatMessagePF2e.flags.pf2e.origin.rollOptions.findIndex(item => item.startsWith(slugPrefix));
        let spellSlug = chatMessagePF2e.flags.pf2e.origin.rollOptions[spellSlugIndex].slice(slugPrefix.length);
        
        findRelevantSpell(spellSlug, chatMessagePF2e, html)      

    } else if (chatMessagePF2e.flags.pf2e.origin?.type === 'feat') {
        //if it's a feat, check if it's one we have a macro for
        let slugPrefix = 'origin:item:slug:';
        let featSlugIndex = chatMessagePF2e.flags.pf2e.origin.rollOptions.findIndex(item => item.startsWith(slugPrefix));
        let featSlug = chatMessagePF2e.flags.pf2e.origin.rollOptions[featSlugIndex].slice(slugPrefix.length);

        findRelevantFeat(featSlug, chatMessagePF2e, html)
    }
    
    else    
    {
        return;
    }
}

function findRelevantSpell(spellSlug, chatMessagePF2e, html) {
    
    let $spellButtonDiv;
    let tokenId; 
    let newButton;
    
    switch (spellSlug) {
        case "wall-of-fire":
            $spellButtonDiv = html.find('.spell-button');
            tokenId = (chatMessagePF2e.speaker.token) 
            newButton = createWallOfFireButton(tokenId);
            $spellButtonDiv.after(newButton);
            break;
        case "dive-and-breach":
            $spellButtonDiv = html.find('.spell-button');
            tokenId = (chatMessagePF2e.speaker.token) 
            newButton = createDiveAndBreach(tokenId);
            $spellButtonDiv.after(newButton);
            break;
        default:
            return;
      }
}

function findRelevantFeat(featSlug, chatMessagePF2e, html) {

    let actor = game.actors.get(chatMessagePF2e.speaker.actor);

    let $featButtonDiv;
    let tokenId; 
    let newButton;

    switch (featSlug) {
        case "enjoy-the-show":
            editSkillRoll(html, actor);
            break;
        case "rising-hurricane":
            $featButtonDiv = html.find('.card-content');
            tokenId = (chatMessagePF2e.speaker.token) 
            newButton = createRisingHurricaneButton(tokenId);
            $featButtonDiv.after(newButton);
            break;
        default:
            return;
      }
}

function createRisingHurricaneButton(speakerTokenId) {
    const button = $('<button type="button">Deploy Rising Hurricane!</button>');
    button.click(function() {
        playRisingHurricaneAtLastPlacedTemplate(speakerTokenId);
    });

    return button;
}

function createWallOfFireButton(speakerTokenId) {
    const button = $('<button type="button">Deploy Wall of Fire!</button>');
    button.click(function() {
        startWallOfFire(speakerTokenId);
    });

    return button;
}

function createDiveAndBreach(speakerTokenId) {
    const button = $('<button type="button">Start diving!</button>');
    button.click(function() {
        startDiveAndBreach(speakerTokenId);
    });

    return button;
}