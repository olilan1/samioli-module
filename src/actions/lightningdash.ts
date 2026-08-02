import {
    RegionDocumentPF2e,
    TokenPF2e
} from "foundry-pf2e";
import { getTokensInRegion, replaceTargets } from "../templatetarget.ts";
import {
    getActorFromRegion,
    getTokenFromActor,
    getTokenIdsFromTokens,
    postUINotification,
    getRegionDirection,
    getRegionLengthInUnits,
    getRegionOrigin
} from "../utils.ts";
import { Point } from "foundry-pf2e/foundry/common/_types.mjs";

export async function animateLightningDash(region: RegionDocumentPF2e) {
    const casterToken = getTokenFromActor(getActorFromRegion(region));

    if (!casterToken) {
        postUINotification("No caster token", "warn");
        return;
    }

    const destination = findDestination(casterToken, region);

    if (!destination) {
        postUINotification("No valid destination", "warn");
        return;
    }
    
    const targetTokens = (getTokensInRegion(region))
        .filter(token => casterToken.distanceTo(token) <= casterToken.distanceTo(destination));
    await region.delete();
    
    const seq = buildSequence(casterToken, destination, targetTokens);
    await preloadAnimations();
    await seq.play();

    replaceTargets(getTokenIdsFromTokens(targetTokens));
}

function findDestination(token: TokenPF2e, region: RegionDocumentPF2e) {
    const feetToCoords = canvas.grid.size / canvas.grid.distance;
    const direction = getRegionDirection(region);
    const radianAngle = direction * (Math.PI / 180);
    const origin = getRegionOrigin(region);
    if (!origin) return null;

    const scene = canvas.scene;
    if (!scene || scene.width === null || scene.height === null) return null;

    const halfSquare = 2.5 * feetToCoords;
    const minX = scene.width * scene.padding + halfSquare;
    const minY = scene.height * scene.padding + halfSquare;
    const maxX = scene.width + minX - 2 * halfSquare;
    const maxY = scene.height + minY - 2 * halfSquare;
    
    const cos = Math.cos(radianAngle);
    const sin = Math.sin(radianAngle);

    // Reach comes from the placed line: Lightning Dash gains 5ft of length every 3 levels, and the
    // caster lands in the furthest unblocked square of the area the player placed.
    const gridDistance = canvas.grid.distance;
    const lineLength = getRegionLengthInUnits(region);
    if (lineLength === null) return null;
    const furthestCentre = lineLength - gridDistance / 2;

    let x: number;
    let y: number;
    for (let dist = furthestCentre; dist >= 0; dist -= gridDistance) {
        x = origin.x + dist * feetToCoords * cos;
        y = origin.y + dist * feetToCoords * sin;
        if (x > minX && x < maxX && y > minY && y < maxY
                && !token.checkCollision({x, y}) ) {
            return {
                x: x,
                y: y
            };
        }
    }
    
    return null;
}

async function preloadAnimations() {
    await Sequencer.Preloader.preloadForClients([
                "jb2a.static_electricity.02.blue",
                "jb2a.chain_lightning.primary.blue",
                "jb2a.static_electricity.03.blue"
            ]);
}

function buildSequence(casterToken: TokenPF2e, destination: Point, targetTokens: TokenPF2e[]) {
    const seq = new Sequence();
    seq
        .sound()
            .volume(0.3)
            .file("sound/NWN2-Sounds/sfx_conj_Electricity.WAV")
        .effect()
            .file("jb2a.static_electricity.02.blue")
            .atLocation(casterToken)
            .attachTo(casterToken)
            .fadeIn(500)
            .scaleToObject(1.2)
            .repeats(3)
            .wait(1100)
        .animation()
            .on(casterToken)
            .fadeOut(400, {ease: "easeInCubic"})
            .opacity(0)
        .effect()
            .file("jb2a.chain_lightning.primary.blue")
            .atLocation(casterToken)
            .stretchTo(destination)
            .wait(300);
                
    for (let i = 0; i < targetTokens.length; i++) {
        seq
            .effect()
                .attachTo(targetTokens[i])
                .file("jb2a.static_electricity.03.blue")
                .scaleToObject(1.2)
                .randomRotation()
                .repeats(1, 2500)
                .delay(400, 900)
    }            
    seq
        .sound()
            .volume(0.3)
            .file("sound/NWN2-Sounds/sfx_hit_Electricity.WAV")
            .delay(200)
            .wait(1)
        .effect()
            .file("jb2a.static_electricity.02.blue")
            .attachTo(casterToken)
            .scaleToObject(1.2)
            .repeats(3)
            .wait(300)
        .animation()
            .on(casterToken)
            .teleportTo(destination)
            .snapToGrid()
            .waitUntilFinished()
        .animation()
            .on(casterToken)
            .fadeIn(400, {ease: "easeInCubic"})
            .opacity(1.0);
    
    return seq; 
}
