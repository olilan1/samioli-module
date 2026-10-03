import { EffectPF2e, EffectSource, ItemPF2e, TokenDocumentPF2e, TokenPF2e } from "foundry-pf2e";
import { addOrUpdateEffectOnActor, isEffect } from "../utils.ts";

export const GHOSTS_IN_THE_STORM_EFFECT_SLUG = "effect-ghosts-in-the-storm";
export const GHOSTS_IN_THE_STORM_MOVE_SLUG = "effect-ghosts-in-the-storm-move";
const GHOSTS_IN_THE_STORM_MOVE_ITEM_ID = "Sb3ZdFs61atILypS";

const MOVE_PUFF_ANIMATION = "jb2a.smoke.puff.centered.grey.0";
const MOVE_SPARK_ANIMATION = "jb2a.static_electricity.02.blue";
const CONCEALMENT_CLOUD_ANIMATION = "jb2a.sleep.cloud.02.blue";
const MOVE_SOUND =
    "modules/samioli-module/sounds/Khron Studio/Elemental Spells Vol 1/Wind_Whoosh_01.m4a";

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

export async function handleGhostsInTheStormCreated(item: ItemPF2e): Promise<void> {
    if (!isEffect(item) || item.slug !== GHOSTS_IN_THE_STORM_MOVE_SLUG) return;
    const tokens = item.actor?.getActiveTokens() ?? [];
    if (tokens.length === 0) return;

    await playGhostsInTheStormAnimation(tokens, item);
}

export async function playGhostsInTheStormAnimation(
    tokens: TokenPF2e[],
    effect: EffectPF2e
): Promise<void> {
    if (tokens.length === 0) return;

    await Sequencer.Preloader.preloadForClients([
        MOVE_PUFF_ANIMATION,
        MOVE_SPARK_ANIMATION,
        CONCEALMENT_CLOUD_ANIMATION,
    ]);

    const sequence = new Sequence()
        .sound()
            .file(MOVE_SOUND)
            .volume(0.35);

    for (const token of tokens) {
        sequence.addSequence(getGhostsInTheStormTokenSequence(token, effect));
    }

    await sequence.play();
}

function getGhostsInTheStormTokenSequence(
    token: TokenPF2e,
    effect: EffectPF2e
): Sequence {
    return new Sequence()
        .effect()
            .file(MOVE_PUFF_ANIMATION)
            .attachTo(token)
            .scaleToObject(1.4)
            .opacity(0.7)
            .fadeOut(400)
        .effect()
            .file(MOVE_SPARK_ANIMATION)
            .attachTo(token)
            .scaleToObject(1.2)
            .opacity(0.6)
            .fadeOut(400)
        .effect()
            .file(CONCEALMENT_CLOUD_ANIMATION)
            .attachTo(token)
            .belowTokens()
            .scaleToObject(1.9)
            .opacity(0.75)
            .filter("ColorMatrix", { saturate: -0.7 })
            .origin(effect.uuid)
            .persist()
            .tieToDocuments(effect)
            .fadeIn(400)
            .fadeOut(400);
}
