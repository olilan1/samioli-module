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

    animateCourageousAnthem(token);

    // Send payload to GM client via socket to apply effects
    await getSocket().executeAsGM(
        COURAGEOUS_ANTHEM_APPLY,
        casterActor.uuid,
        spell.uuid,
        token.document.uuid,
        targetActorUuids
    );
}

/**
 * GM-side handler to apply Courageous Anthem effect on multiple actors.
 */
export async function applyCourageousAnthemEffectAsGM(
    casterActorUuid: string,
    spellUuid: string,
    casterTokenUuid: string,
    targetActorUuids: string[]
): Promise<void> {
    const effectSource = await getCourageousAnthemEffectSource();
    if (!effectSource) return;

    effectSource.system.context = {
        origin: {
            actor: casterActorUuid,
            item: spellUuid,
            token: casterTokenUuid,
        }
    } as unknown as EffectSource["system"]["context"];

    for (const uuid of targetActorUuids) {
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

function animateCourageousAnthem(caster: TokenPF2e) {

    const anim = 'jb2a.bardic_inspiration.blueyellow';
    const sounds = [
        "sound/NWN2-Sounds/bardsong_lute_01.WAV",
        "sound/NWN2-Sounds/bardsong_lute_02.WAV",
        "sound/NWN2-Sounds/bardsong_lute_03.WAV",
        "sound/NWN2-Sounds/bardsong_lute_04.WAV"
    ];

    const sequence = new Sequence()
        .effect()
            .file(anim)
            .atLocation(caster)
            .scale(1)
            .fadeIn(300)
            .fadeOut(500)
        .sound()
            .file(Sequencer.Helpers.random_array_element(sounds))
            .volume(0.5)
            .fadeInAudio(100)
            .fadeOutAudio(300)
    sequence.play();

}