import { ActorPF2e, ChatMessagePF2e } from "foundry-pf2e";

async function applyUnstableEffect(actor: ActorPF2e) {
    const unstableEffectItemId = "olpkQDGDzmYZCvQH";
    const compendiumPack = game.packs.get("pf2e.feat-effects");
    if (!compendiumPack) return;
    const unstableEffect = await compendiumPack.getDocument(unstableEffectItemId);
    if (!unstableEffect) return;
    await actor.createEmbeddedDocuments("Item", [unstableEffect.toObject()]);
}

export function checkForUnstableCheck(chatMessage: ChatMessagePF2e) {
    if (!chatMessage.flags?.pf2e?.context || !chatMessage.flags?.pf2e?.context?.options) return;
    if (chatMessage.flags?.pf2e?.context?.options.includes("unstable-check") 
        && chatMessage.flags?.pf2e?.context?.type === "flat-check"
        && (chatMessage.flags?.pf2e?.context?.outcome === "failure" 
            || chatMessage.flags?.pf2e?.context?.outcome === "criticalFailure" )) {
            const actorId = chatMessage.flags.pf2e.context.actor;
            if (actorId) {
                const actor = game.actors.get(actorId);
                if (actor) applyUnstableEffect(actor);
            }
    } 
}