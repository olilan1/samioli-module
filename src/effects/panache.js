export function checkForBravado(ChatMessagePF2e) {
    if (ChatMessagePF2e.flags?.pf2e?.context?.options.includes("item:trait:bravado")) {
        console.log("Detected a skill check or action with the bravado trait")
        checkIfProvidesPanache(ChatMessagePF2e)
    } else{
        return;
    }
}

function checkIfProvidesPanache(ChatMessagePF2e) {
    if (ChatMessagePF2e.flags.pf2e.context.outcome === "criticalSuccess" 
    || ChatMessagePF2e.flags.pf2e.context.outcome === "success" ) {
        console.log("success means unlimited panache")
        applyPanache(game.actors.get(ChatMessagePF2e.speaker.actor))
    } else if (ChatMessagePF2e.flags.pf2e.context.outcome === "failure") {
        console.log("failure means panache but only until the end of your next turn")
        applyPanache(game.actors.get(ChatMessagePF2e.speaker.actor))
    } else {
        console.log("critical failure means no panache")
    }
}

async function applyPanache(actor) {
    const panacheItemId = "uBJsxCzNhje8m8jj"
    const compendiumPack = game.packs.get("pf2e.feat-effects")
    const panacheEffect = await compendiumPack.getDocument(panacheItemId);
    const panacheEffectObject = panacheEffect.toObject()

    await delay(4000)

    await actor.createEmbeddedDocuments("Item", [panacheEffectObject]);
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }