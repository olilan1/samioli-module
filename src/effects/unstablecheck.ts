import { ActorPF2e, ChatMessagePF2e } from "foundry-pf2e";

async function applyUnstableEffect(actor: ActorPF2e) {
    const unstableEffectItemId = "olpkQDGDzmYZCvQH";
    const compendiumPack = game.packs.get("pf2e.feat-effects");
    const unstableEffect = await compendiumPack?.getDocument(unstableEffectItemId);
    if (!unstableEffect) return;
    await actor.createEmbeddedDocuments("Item", [unstableEffect.toObject()]);
}

export function checkForUnstableCheck(chatMessage: ChatMessagePF2e) {
    const context = chatMessage.flags.pf2e.context;
    if (!context?.options) return;
    if (context.options.includes("unstable-check") 
        && context.type === "flat-check"
        && (context.outcome === "failure" || context.outcome === "criticalFailure" )) {
        const actorId = context.actor;
        if (actorId) {
            const actor = game.actors.get(actorId);
            if (actor) applyUnstableEffect(actor);
        }
    } 
}