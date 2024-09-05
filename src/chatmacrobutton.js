import { startWallOfFire } from "./spells/walloffire.js";
import { startDiveAndBreach } from "./spells/diveandbreach.js";
import { editSkillRoll } from "./actions/enjoytheshow.js";

export function chatMacroButton(ChatMessagePF2e, html) {
    
    //Check if passed message is a spell
    if (ChatMessagePF2e.flags.pf2e.origin?.type === 'spell') {
        //if it is a spell, check if it's one we have a macro for
        let slugPrefix = 'origin:item:slug:';
        let spellSlugIndex = ChatMessagePF2e.flags.pf2e.origin.rollOptions.findIndex(item => item.startsWith(slugPrefix));
        let spellSlug = ChatMessagePF2e.flags.pf2e.origin.rollOptions[spellSlugIndex].slice(slugPrefix.length);
        
        findRelevantSpell(spellSlug, ChatMessagePF2e, html)      

    } else if (ChatMessagePF2e.flags.pf2e.origin?.type === 'feat') {
        //if it's a feat, check if it's one we have a macro for
        let slugPrefix = 'origin:item:slug:';
        let featSlugIndex = ChatMessagePF2e.flags.pf2e.origin.rollOptions.findIndex(item => item.startsWith(slugPrefix));
        let featSlug = ChatMessagePF2e.flags.pf2e.origin.rollOptions[featSlugIndex].slice(slugPrefix.length);

        findRelevantFeat(featSlug, ChatMessagePF2e, html)
    }
    else    
    {
        return;
    }
}

function findRelevantSpell(spellSlug, ChatMessagePF2e, html) {
    
    let $spellButtonDiv;
    let tokenId; 
    let newButton;
    
    switch (spellSlug) {
        case "wall-of-fire":
            $spellButtonDiv = html.find('.spell-button');
            tokenId = (ChatMessagePF2e.speaker.token) 
            newButton = createWallOfFireButton(tokenId);
            $spellButtonDiv.after(newButton);
        break;
        case "dive-and-breach":
            $spellButtonDiv = html.find('.spell-button');
            tokenId = (ChatMessagePF2e.speaker.token) 
            newButton = createDiveAndBreach(tokenId);
            $spellButtonDiv.after(newButton);
        break;
        default:
        //console.log("Spell Slug did not match to any macros.");
        return
      }
}

function findRelevantFeat(featSlug, ChatMessagePF2e, html) {

    switch (featSlug) {
        case "enjoy-the-show":
            let actor = game.actors.get(ChatMessagePF2e.speaker.actor)
            editSkillRoll(html, actor);
        break;
        default:
        //console.log("Feat Slug did not match to any macros.");
        return
      }
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