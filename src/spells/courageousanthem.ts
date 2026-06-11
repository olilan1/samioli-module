import { ActorPF2e, ChatMessagePF2e, EffectSource, TokenPF2e } from "foundry-pf2e";
import {
    addOrUpdateEffectOnActor,
    hasLineOfEffect,
    isAlly,
    isConsciousAndAlive,
    isWithinDistance
} from "../utils.ts";
import { getSocket, COURAGEOUS_ANTHEM_APPLY } from "../sockets.ts";
import { ActorUUID } from "foundry-pf2e/foundry/common/documents/_module.mjs";

/**
 * Handles casting the Courageous Anthem spell and applies the spell effect to allies.
 */
export async function startCourageousAnthem(token: TokenPF2e, message: ChatMessagePF2e) {
    const casterActor = token.actor;
    if (!casterActor) return;

    const spell = message.item;
    if (!spell || spell.type !== "spell") {
        ui.notifications.error("Could not find spell item for Courageous Anthem.");
        return;
    }

    const effectSource = await getCourageousAnthemEffectSource();
    if (!effectSource) {
        ui.notifications.error("Could not find Spell Effect: Courageous Anthem.");
        return;
    }

    // Set the origin context so the duration tracks the caster's turn
    effectSource.system.context = {
        origin: {
            actor: casterActor.uuid,
            item: spell.uuid,
            token: token.document.uuid,
        }
    } as unknown as EffectSource["system"]["context"];

    // Find all allies within 60 feet on the current scene who have line of effect and are alive
    const allTokens = canvas.tokens.placeables as TokenPF2e[];
    const targetTokens = allTokens.filter(t => {
        if (t === token) return true; // Caster is always included

        const actor = t.actor;
        if (!actor || (actor.type !== "character" && actor.type !== "npc")) {
            return false;
        }

        if (!isAlly(t, casterActor, token)) return false;
        if (!isWithinDistance(token, t, 60)) return false;
        if (!isConsciousAndAlive(actor)) return false;
        if (!hasLineOfEffect(token, t)) return false;

        return true;
    });

    const targetActorUuids = targetTokens
        .map(t => t.actor?.uuid)
        .filter((uuid): uuid is ActorUUID => !!uuid);

    if (targetActorUuids.length === 0) return;

    // Send payload to GM client via socket to apply effects
    await getSocket().executeAsGM(COURAGEOUS_ANTHEM_APPLY, targetActorUuids, effectSource);
}

/**
 * GM-side handler to apply Courageous Anthem effect on multiple actors.
 */
export async function applyCourageousAnthemEffectAsGM(
    actorUuids: string[],
    effectSource: EffectSource
): Promise<void> {
    for (const uuid of actorUuids) {
        const actor = fromUuidSync(uuid) as ActorPF2e | null;
        if (actor) {
            await addOrUpdateEffectOnActor(actor, effectSource);
        }
    }
}

/**
 * Loads the Spell Effect: Courageous Anthem source.
 */
async function getCourageousAnthemEffectSource(): Promise<EffectSource | null> {
    const uuid = "Compendium.pf2e.spell-effects.Item.gqHQpaUNrwBnttr3";
    const effect = await fromUuid(uuid);
    if (effect) {
        return effect.toObject() as EffectSource;
    }
    const pack = game.packs.get("pf2e.spell-effects");
    if (pack) {
        const index = await pack.getIndex({ fields: ["system.slug"] });
        const entry = index.find(e =>
            e.system?.slug === "spell-effect-courageous-anthem" ||
            e.system?.slug === "spell-effect-inspire-courage" ||
            e.slug === "courageous-anthem" ||
            e.slug === "inspire-courage"
        );
        if (entry) {
            const document = await pack.getDocument(entry._id);
            return (document?.toObject() ?? null) as EffectSource | null;
        }
    }
    return null;
}
