import { MeasuredTemplateDocumentPF2e } from "foundry-pf2e";
import { getTemplateTokens } from "../templatetarget.ts";
import { logd, postUINotification } from "../utils.ts";

export async function animateLightningDash(template: MeasuredTemplateDocumentPF2e) {
    logd(template);
    const seq = new Sequence();
    const tokenD = template.actor?.getActiveTokens()[0];
    if (!tokenD) {
        postUINotification("No caster token", "warn");
        return;
    }

    const targetTokens = await getTemplateTokens(template);
    
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
    let x;
    let y;
    for (let dist = 27.5; dist >= 0; dist -= 5) {
        x = template.x + dist * feetToCoords * cos;
        y = template.y + dist * feetToCoords * sin;
        if (x > minX && x < maxX && y > minY && y < maxY) {
            break;
        }
    }
    
    const targetLocation = {
        x: x,
        y: y
    }
    
    await Sequencer.Preloader.preloadForClients([
                "jb2a.static_electricity.02.blue",
                "jb2a.chain_lightning.primary.blue",
                "jb2a.static_electricity.03.blue"
            ])
            seq
            .sound()
                .volume(0.3)
                .file("sound/NWN2-Sounds/sfx_conj_Electricity.WAV")
            .effect()
                .file("jb2a.static_electricity.02.blue")
                .atLocation(tokenD)
                .attachTo(tokenD)
                .fadeIn(500)
                .scaleToObject(1.2)
                .repeats(3)
                .wait(1100)
            .animation()
                .on(tokenD)
                .fadeOut(400, {ease: "easeInCubic"})
                .opacity(0)
            .effect()
                .file("jb2a.chain_lightning.primary.blue")
                .atLocation(tokenD)
                .stretchTo(targetLocation)
                .wait(300)
                
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
                .attachTo(tokenD)
                .scaleToObject(1.2)
                .repeats(3)
                .wait(300)
            .animation()
                .on(tokenD)
                .teleportTo(targetLocation)
                .snapToGrid()
                .waitUntilFinished()
            .animation()
                .on(tokenD)
                .fadeIn(400, {ease: "easeInCubic"})
                .opacity(1.0)
    
    await seq.play()
}
