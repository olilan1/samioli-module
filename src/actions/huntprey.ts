import { ActorPF2e, ChatMessagePF2e, ScenePF2e, TokenDocumentPF2e } from "foundry-pf2e";
import { ImageFilePath } from "foundry-pf2e/foundry/common/constants.mjs";
import { REMOVE_AND_APPLY_HUNT_PREY, getSocket } from "../sockets.ts";

export async function removeAndApplyHuntPreyAsGM(rangerUuid: string, targetUuids: string[]) {

    const ranger = fromUuidSync<ActorPF2e>(rangerUuid);
    if (!ranger) return;
    const targets: TokenDocumentPF2e[] = [];
    for (const uuid of targetUuids) {
        const token = fromUuidSync<TokenDocumentPF2e>(uuid);
        if (token) {
            targets.push(token);
        }
    }

    await removeHuntPreyFromOtherTokens(ranger);
    await applyHuntPrey(ranger, targets);
}

export async function startHuntPrey(message: ChatMessagePF2e) {
    const ranger = message.actor;
    if (!ranger) return;

    if (!message.flags?.pf2e?.origin?.rollOptions?.includes("origin:item:hunt-prey")) {
        return;
    }

    const targets = message.author?.targets;

    if (!targets || targets.size === 0) {
        ui.notifications.error("Please target a creature to hunt");
        return;
    }

    const allowedNumberOfTargets = getNumberOfTargetsRangerCanHunt(ranger);
    if (targets.size > allowedNumberOfTargets) {
        ui.notifications.error(`Please select a maximum of ${allowedNumberOfTargets} creature(s) to hunt`);
        return;
    }

    getSocket().executeAsGM(REMOVE_AND_APPLY_HUNT_PREY, ranger.uuid, Array.from(targets).map(t => t.document.uuid));
}

async function applyHuntPrey(rangerActor: ActorPF2e, targetTokens: TokenDocumentPF2e<ScenePF2e | null>[]) {

    const huntPreyEffectData = {
        name: `Hunted by ${rangerActor.prototypeToken.name}`,
        type: "effect",
        img: rangerActor.prototypeToken.texture.src as ImageFilePath,
        system: {
            description: {
                value: `<p>This creature has been hunted by ${rangerActor.prototypeToken.name}</p>`
            },
            slug: `samioli-hunt-prey`,
            duration: { value: 1, unit: "days" },
            level: { value: 0 },
            tokenIcon: { show: true }
        },
        flags: {
            samioli: {
                hunterActorId: rangerActor.id
            }
        }
    };

    const huntedPreyTokenUuids = [];

    for (const token of targetTokens) {
        await token?.actor?.createEmbeddedDocuments("Item", [huntPreyEffectData]);
        huntedPreyTokenUuids.push(token.uuid);
    }

    await rangerActor.setFlag("samioli-module", "huntedPreyTokenUuids", huntedPreyTokenUuids)
}

function getNumberOfTargetsRangerCanHunt(actor: ActorPF2e): number {
    const items = actor.items.contents;

    if (items.some(item => item.type === "feat" && item.system.slug === "triple-threat")) {
        return 3;
    } else if (items.some(item => item.type === "feat" && item.system.slug === "double-prey")) {
        return 2;
    } else {
        return 1;
    }
}

async function removeHuntPreyFromOtherTokens(hunterActor: ActorPF2e) {
    const oldHuntedPreyTokenUuids = await hunterActor.getFlag("samioli-module", "huntedPreyTokenUuids");
    if (!Array.isArray(oldHuntedPreyTokenUuids)) return;
    for (const uuid of oldHuntedPreyTokenUuids) {
        const huntedTokenDocument = fromUuidSync<TokenDocumentPF2e>(uuid);
        if (!huntedTokenDocument) continue;
        const huntedActor = huntedTokenDocument.actor;
        if (!huntedActor) continue; 
        const items = huntedActor.items.contents;
        const huntPreyEffects = items.filter(item => 
            item.type === "effect" && 
            item.system.slug === `samioli-hunt-prey` 
        );
        
        for (const huntPreyEffect of huntPreyEffects) {
            if (huntPreyEffect.flags?.samioli?.hunterActorId === hunterActor.id) {
                await huntPreyEffect.delete();
            }
        }
    }
}