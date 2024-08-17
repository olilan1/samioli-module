import { startWallOfFire } from "./spells/walloffire.js";

export function chatMacroButton(ChatMessagePF2e, html) {
    
    //Check if passed message is a spell
    if (ChatMessagePF2e.flags.pf2e.origin?.type !== 'spell') {
        // Not a spell
        return;
    } else    
    {
        //if it is a spell, check if it's one we have a macro for
        let slugPrefix = 'origin:item:slug:';
        let spellSlugIndex = ChatMessagePF2e.flags.pf2e.origin.rollOptions.findIndex(item => item.startsWith(slugPrefix));
        let spellSlug = ChatMessagePF2e.flags.pf2e.origin.rollOptions[spellSlugIndex].slice(slugPrefix.length);
        
        findRelevantSpell(spellSlug, ChatMessagePF2e, html)       
    }
}

function findRelevantSpell(spellSlug, ChatMessagePF2e, html) {
    switch (spellSlug) {
        case "wall-of-fire":
            const $spellButtonDiv = html.find('.spell-button');
            let tokenId = (ChatMessagePF2e.speaker.token) 
            const newButton = createWallOfFireButton(tokenId);
            $spellButtonDiv.after(newButton);
        break;
        default:
        console.log("Spell Slug did not match to any macros.");
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