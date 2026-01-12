import { ActorPF2e, ChatMessagePF2e, TokenDocumentPF2e } from "foundry-pf2e";
import { getEidolonActor, getTokensOnCurrentSceneForActor, isCharacter } from "../utils.ts";
import { CrosshairUpdatable } from "../types.ts";
import { Point } from "foundry-pf2e/foundry/common/_types.mjs";
import { DEMANIFEST_EIDOLON, getSocket, MANIFEST_EIDOLON } from "../sockets.ts";

export async function manifestEidolon(message: ChatMessagePF2e) {

    if (!message.flags.pf2e.origin?.rollOptions?.includes("origin:item:slug:manifest-eidolon")) return;

    const summonerActor = message.actor;
    const summonerToken = message.token;
    if (!summonerActor || !isCharacter(summonerActor) || !summonerToken) return;

    // Find eidolon actor associated with the summoner
    const eidolonActor = getEidolonActor(summonerActor);
    if (!eidolonActor) return;

    // Check if that eidolon already has a token on the current scene
    const eidolonTokens = getTokensOnCurrentSceneForActor(eidolonActor);
    if (eidolonTokens.length === 0) {
        const selectedEidolonManifestLocation = await selectEidolonManifestLocation(summonerToken, eidolonActor);
        if (!selectedEidolonManifestLocation) return;
        getSocket().executeAsGM(MANIFEST_EIDOLON, summonerToken.uuid, eidolonActor.uuid, selectedEidolonManifestLocation);
    } else {
        for (const eidolonToken of eidolonTokens) {
            getSocket().executeAsGM(DEMANIFEST_EIDOLON, eidolonToken.uuid);
        }
    }
}

export async function manifestEidolonAsGM(summonerTokenid: string,
    eidolonActorUuid: string, manifestLocationCenter: Point) {

    const summonerToken = await fromUuid<TokenDocumentPF2e>(summonerTokenid);
    const eidolonActor = await fromUuid<ActorPF2e>(eidolonActorUuid);
    if (!summonerToken || !eidolonActor) return;

    // TODO: Take eidolon's size into consideration for anim

    const offset = canvas.grid.size / 2;

    const manifestLocationTopLeft = {
        x: manifestLocationCenter.x - offset,
        y: manifestLocationCenter.y - offset
    } as Point

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
            .atLocation(manifestLocationCenter)
            .file(manifestAnimation)
            .delay(1000)
            .fadeIn(1000)
            .waitUntilFinished(-3000)
        .sound()
            .file(manifestSound)
        .thenDo(async () => await createTokenForActorAtPosition(eidolonActor, manifestLocationTopLeft))
    sequence.play();

}

export async function demanifestEidolonAsGM(eidolonTokenUuid: string) {

    const eidolonToken: TokenDocumentPF2e | null = await fromUuid(eidolonTokenUuid);
    if (!eidolonToken) return;

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
            .animateProperty("sprite", "rotation", { from: 0, to: -360, duration: 600, delay: 400, ease: "easeInOutCubic" })
            .animateProperty("sprite", "scale.x", { from: 1, to: 0, duration: 600, delay: 400, ease: "easeInOutCubic" })
            .animateProperty("sprite", "scale.y", { from: 1, to: 0, duration: 600, delay: 400, ease: "easeInOutCubic" })
        .sound()
            .file(demanifestSound2)
            .delay(1000)
            .volume(0.5)
        .animation()
            .delay(1100)
            .on(eidolonToken)
            .fadeOut(50)
            .waitUntilFinished()
        .thenDo(async () => { await eidolonToken.delete(); })
    sequence.play();

}


async function createTokenForActorAtPosition(actor: ActorPF2e, location: Point) {

    const currentScene = canvas.scene!;

    const tokenData = await actor.getTokenDocument({
        x: location.x,
        y: location.y
    });

    await currentScene.createEmbeddedDocuments('Token', [tokenData.toObject()]);
}

async function selectEidolonManifestLocation(summonerToken: TokenDocumentPF2e, eidolonActor: ActorPF2e): Promise<Point | false> {

    const eidolonImg = eidolonActor.prototypeToken.texture.src;
    if (!eidolonImg) return false;
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