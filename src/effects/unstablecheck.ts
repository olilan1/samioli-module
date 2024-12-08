async function applyUnstableEffect(actor) {
    const unstableEffectItemId = "olpkQDGDzmYZCvQH";
    const compendiumPack = game.packs.get("pf2e.feat-effects");
    const unstableEffect = await compendiumPack.getDocument(unstableEffectItemId);
    await actor.createEmbeddedDocuments("Item", [unstableEffect.toObject()]);
}

export function checkForUnstableCheck(chatMessage) {
    if (chatMessage.flags?.pf2e?.context?.options.includes("unstable-check") 
        && chatMessage.flags?.pf2e?.context?.type === "flat-check"
        && (chatMessage.flags?.pf2e?.context?.outcome === "failure" || chatMessage.flags?.pf2e?.context?.outcome === "criticalFailure" )) {
            applyUnstableEffect(game.actors.get(chatMessage.flags.pf2e.context.actor));
    } 
}