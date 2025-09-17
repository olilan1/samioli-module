import { MeasuredTemplateDocumentPF2e, TokenPF2e } from "foundry-pf2e";
import { getTemplateTokens, replaceTargets } from "../templatetarget.ts";
import { getTokenIdsFromTokens, postUINotification } from "../utils.ts";
import { Point } from "foundry-pf2e/foundry/common/_types.mjs";

export async function animateLightningDash(template: MeasuredTemplateDocumentPF2e) {
    const casterToken = template.actor?.getActiveTokens()[0];
    if (!casterToken) {
        postUINotification("No caster token", "warn");
        return;
    }

    const destination = findDestination(casterToken, template);

    if (!destination) {
        postUINotification("No valid destination", "warn");
        return;
    }
    
    const targetTokens = (await getTemplateTokens(template))
        .filter(token => casterToken.distanceTo(token) <= casterToken.distanceTo(destination));
    template.delete();
    
    const seq = buildSequence(casterToken, destination, targetTokens);
    await preloadAnimations();
    await seq.play();

    replaceTargets(getTokenIdsFromTokens(targetTokens));
}

function findDestination(token: TokenPF2e, template: MeasuredTemplateDocumentPF2e) {
    const feetToCoords = canvas.grid.size / canvas.grid.distance;
    const radianAngle = template.direction * (Math.PI / 180);
    const halfSquare = 2.5 * feetToCoords;
    const width = canvas.scene?.width ?? 0;
    const height = canvas.scene?.height ?? 0;
    const padding = canvas.scene?.padding ?? 0;
    const minX = width * padding + halfSquare;
    const minY = height * padding + halfSquare;
    const maxX = width + minX - 2 * halfSquare;
    const maxY = height + minY - 2 * halfSquare;
    
    const cos = Math.cos(radianAngle);
    const sin = Math.sin(radianAngle);

    let x: number;
    let y: number;
    // Test destination points from the end of the line backwards
    for (let dist = 27.5; dist >= 0; dist -= 5) {
        x = template.x + dist * feetToCoords * cos;
        y = template.y + dist * feetToCoords * sin;
        if (x > minX && x < maxX && y > minY && y < maxY
                && !token.checkCollision({x, y}) ) {
            // Found valid destination
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
