import { ActorPF2e, ChatMessagePF2e, TokenDocumentPF2e } from "foundry-pf2e";
import { getEidolonActor, isCharacter, MODULE_ID } from "../utils.ts";
import { CrosshairUpdatable } from "../types.ts";
import { Point } from "foundry-pf2e/foundry/common/_types.mjs";

export async function manifestEidolon(message: ChatMessagePF2e) {

    // Find summoner's associated eidolon actor
    const summonerActor = message.actor;
    const summonerToken = message.token;
    if (!summonerActor || !isCharacter(summonerActor) || !summonerToken) return;

    // Find eidolon actor associated with the summoner
    const eidolonActor = getEidolonActor(summonerActor);
    if (!eidolonActor) return;

    // Check if that eidolon already has a token on the current scene
    const eidolonTokens = getEidolonTokenOnCurrentScene(eidolonActor);
    if (!eidolonTokens) {
        const selectedEidolonManifestLocation = await selectEidolonManifestLocation(summonerToken, eidolonActor);
        if (!selectedEidolonManifestLocation) return;
        createChatMessageForGMClientDeManifest(summonerToken, eidolonActor, selectedEidolonManifestLocation);
        return;
    } else {
        for (const eidolonToken of eidolonTokens) {
            createChatMessageForGMClientDemanifest(summonerToken, eidolonToken);
        }
    }
}

function getEidolonTokenOnCurrentScene(eidolonActor: ActorPF2e): TokenDocumentPF2e[] | null {

    const currentScene = canvas.scene!;
    const tokens = currentScene.tokens.filter(t => t.actorId === eidolonActor.id);

    if (tokens.length === 0) return null;

    return tokens;
}

export async function manifestEidolonAsGm(message: ChatMessagePF2e) {

    const eidolonActor = game.actors.get(message.flags[MODULE_ID].eidolonActorId as string);
    if (!eidolonActor) return;
    const manifestLocationCenter = message.flags[MODULE_ID].manifestLocation as Point;
    if (!manifestLocationCenter) return;

    const offset = canvas.grid.size / 2;

    const manifestLocationTopLeft = {
        x: manifestLocationCenter.x - offset,
        y: manifestLocationCenter.y - offset
    } as Point

    await animateManifesting(message.token!, eidolonActor, manifestLocationCenter, manifestLocationTopLeft);

}

export async function demanifestEidolonAsGM(message: ChatMessagePF2e) {
    const eidolonToken = canvas.tokens.get(message.flags[MODULE_ID].eidolonTokenId as string);
    if (!eidolonToken) return;
    await animateDemanifesting(eidolonToken.document);
}

async function animateManifesting(summonerToken: TokenDocumentPF2e, eidolonActor: ActorPF2e,
    animationLocation: Point, eidolonPlacementLocation: Point) {

    const castingAnimation = "jb2a.sacred_flame.source.blue"
    const manifestAnimation = "jb2a.sacred_flame.target.blue"
    const castingSound = "sound/NWN2-Sounds/sff_summon3.WAV"
    const manifestSound = "sound/NWN2-Sounds/cs_sunboom.WAV"

    const sequence = new Sequence()
        .effect()
            .atLocation(summonerToken)
            .file(castingAnimation)
        .sound()
            .file(castingSound)
        .effect()
            .atLocation(animationLocation)
            .file(manifestAnimation)
            .delay(1000)
            .fadeIn(1000)
            .waitUntilFinished(-3000)
        .sound()
            .file(manifestSound)
        .thenDo(async () => await createTokenForActorAtPosition(eidolonActor, eidolonPlacementLocation))
    sequence.play();
}

async function animateDemanifesting(eidolonToken: TokenDocumentPF2e) {

    const demanifestAnimation = "jb2a.particle_burst.01.circle.green"
    const demanifestSound1 = "sound/NWN2-Sounds/sff_howlodd.WAV"
    const demanifestSound2 = "sound/NWN2-Sounds/sfx_Implosion.WAV"

    const sequence = new Sequence()
        .effect()
            .atLocation(eidolonToken)
            .file(demanifestAnimation)
            .zIndex(51)
        .sound()
            .file(demanifestSound1)
        .effect()
            .delay(1000)
            .copySprite(eidolonToken)
            .zIndex(50)
            .animateProperty("sprite", "rotation", { from: 0, to: -360, duration: 600, delay: 400, ease: "easeInOutCubic"})
            .animateProperty("sprite", "scale.x", { from: 1, to: 0, duration: 600, delay: 400, ease: "easeInOutCubic"})
            .animateProperty("sprite", "scale.y", { from: 1, to: 0, duration: 600, delay: 400, ease: "easeInOutCubic"})
        .sound()
            .file(demanifestSound2)
            .delay(1000)
            .volume(0.5)
        .animation()
            .delay(1100)
            .on(eidolonToken)
            .fadeOut(50)
            .waitUntilFinished()
        .thenDo(async () => await deleteToken(eidolonToken))
    sequence.play();
}

async function deleteToken(token: TokenDocumentPF2e) {
    await token.delete();
}

async function createTokenForActorAtPosition(actor: ActorPF2e, location: Point) {

    const currentScene = canvas.scene!;

    const tokenData = await actor.getTokenDocument({
        x: location.x,
        y: location.y
    });

    await currentScene.createEmbeddedDocuments('Token', [tokenData.toObject()]);
}

async function selectEidolonManifestLocation(summonerToken: TokenDocumentPF2e, eidolonActor: ActorPF2e): Promise<Point | undefined> {

    const eidolonImg = eidolonActor.prototypeToken.texture.src;
    if (!eidolonImg) return;
    const centrePoint = await Sequencer.Crosshair.show({
        location: {
            obj: summonerToken,
            limitMaxRange: 5,
            limitMinRange: 5,
            wallBehavior: Sequencer.Crosshair.PLACEMENT_RESTRICTIONS.NO_COLLIDABLES
        },
        icon: {
            texture: eidolonImg
        },
        direction: 0,
        lockManualRotation: true,
        angle: 0,
        snap: {
            position: CONST.GRID_SNAPPING_MODES.CENTER,
            resolution: 1,
            size: CONST.GRID_SNAPPING_MODES.CENTER,
            direction: 0
        }
    }, {
        [Sequencer.Crosshair.CALLBACKS.COLLIDE]: (crosshair: CrosshairUpdatable) => {
            crosshair.updateCrosshair({
                "icon.texture": "icons/svg/cancel.svg"
            })
        },
        [Sequencer.Crosshair.CALLBACKS.STOP_COLLIDING]: (crosshair: CrosshairUpdatable) => {
            crosshair.updateCrosshair({
                "icon.texture": eidolonImg
            })
        },
        [Sequencer.Crosshair.CALLBACKS.CANCEL]: () => {
            ui.notifications.warn("Manifest Eidolon Cancelled.");
            return false;
        },
        show: undefined,
        move: undefined,
        mouseMove: undefined,
        invalidPlacement: undefined,
        placed: undefined
    });
    return centrePoint;
}

function createChatMessageForGMClientDeManifest(summonerToken: TokenDocumentPF2e, eidolonActor: ActorPF2e, manifestLocation: Point) {
    const messageContent = `<div>${summonerToken.name} is manifesting ${eidolonActor.name}</div>`;
    ChatMessage.create({
        content: messageContent,
        whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id),
        speaker: ChatMessage.getSpeaker({ actor: summonerToken.actor }),
        flags: {
            [MODULE_ID]: {
                manifestLocation: manifestLocation,
                eidolonActorId: eidolonActor.id,
                type: "custom-manifest-eidolon"
            }
        }
    });
}

function createChatMessageForGMClientDemanifest(summonerToken: TokenDocumentPF2e, eidolonToken: TokenDocumentPF2e) {
    const messageContent = `<div>${summonerToken.name} is demanifesting ${eidolonToken.name}</div>`;
    ChatMessage.create({
        content: messageContent,
        whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id),
        speaker: ChatMessage.getSpeaker({ actor: summonerToken.actor }),
        flags: {
            [MODULE_ID]: {
                eidolonTokenId: eidolonToken.id,
                type: "custom-demanifest-eidolon"
            }
        }
    });
}