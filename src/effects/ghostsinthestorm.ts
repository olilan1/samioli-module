import { EffectPF2e, EffectSource, TokenDocumentPF2e } from "foundry-pf2e";
import { addOrUpdateEffectOnActor } from "../utils.ts";

export const GHOSTS_IN_THE_STORM_EFFECT_SLUG = "effect-ghosts-in-the-storm";
const GHOSTS_IN_THE_STORM_MOVE_SLUG = "effect-ghosts-in-the-storm-move";
const GHOSTS_IN_THE_STORM_MOVE_ITEM_ID = "Sb3ZdFs61atILypS";

export async function applyGhostsInTheStormMoveEffect(token: TokenDocumentPF2e): Promise<void> {
    const actor = token.actor;
    if (!actor) return;

    // Skip if a non-expired move effect exists so addOrUpdateEffectOnActor does not overwrite
    // the active effect's start time with 0.
    const existingEffect = actor.items.find(
        item => item.type === "effect" && item.slug === GHOSTS_IN_THE_STORM_MOVE_SLUG
    ) as EffectPF2e | undefined;
    if (existingEffect && !existingEffect.isExpired && !existingEffect.remainingDuration?.expired) {
        return;
    }

    const compendiumPack = game.packs.get("pf2e.feat-effects");
    const moveEffect = await compendiumPack?.getDocument(GHOSTS_IN_THE_STORM_MOVE_ITEM_ID);
    if (!moveEffect) return;

    await addOrUpdateEffectOnActor(actor, moveEffect.toObject() as EffectSource);
}
