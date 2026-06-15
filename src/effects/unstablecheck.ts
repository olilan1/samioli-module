import { ActorPF2e, ChatMessagePF2e } from "foundry-pf2e";

async function applyUnstableEffect(actor: ActorPF2e) {
    const unstableEffectItemId = "olpkQDGDzmYZCvQH";
    const compendiumPack = game.packs.get("pf2e.feat-effects");
    const unstableEffect = await compendiumPack?.getDocument(unstableEffectItemId);
    if (!unstableEffect) return;
    await actor.createEmbeddedDocuments("Item", [unstableEffect.toObject()]);
}

export function applyUnstableEffectOnFailure(chatMessage: ChatMessagePF2e) {
    const actorId = chatMessage.flags.pf2e.context?.actor;
    if (actorId) {
        const actor = game.actors.get(actorId);
        if (actor) applyUnstableEffect(actor);
    }
}