import { ActorPF2e, ChatMessagePF2e } from "foundry-pf2e";

async function applyUnstableEffect(actor: ActorPF2e) {
    const unstableEffectItemId = "olpkQDGDzmYZCvQH";
    const compendiumPack = game.packs.get("pf2e.feat-effects");
    const unstableEffect = await compendiumPack?.getDocument(unstableEffectItemId);
    if (!unstableEffect) return;
    await actor.createEmbeddedDocuments("Item", [unstableEffect.toObject()]);
}

export function applyUnstableEffectOnFailure(chatMessage: ChatMessagePF2e) {
    // `actor` is present on the check-context variants but not on the ChatContextFlag union.
    const context = chatMessage.flags.pf2e.context as { actor?: string } | undefined;
    const actorId = context?.actor;
    if (actorId) {
        const actor = game.actors.get(actorId);
        if (actor) applyUnstableEffect(actor);
    }
}