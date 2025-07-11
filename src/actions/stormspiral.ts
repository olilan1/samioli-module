import { MeasuredTemplateDocumentPF2e } from "foundry-pf2e";
import { delay, getRandomNumberBetween, getTokenIdsFromTokens, shuffleArray } from "../utils.ts";
import { getTemplateTokens, replaceTargets } from "../templatetarget.ts";

export async function initiateStormSpiral(template: MeasuredTemplateDocumentPF2e) {
    let targetTokens = await getTemplateTokens(template);

    if (targetTokens.length != 0) {
        targetTokens = shuffleArray(targetTokens)
        template.delete();    
        await animateStormSpiral(template, targetTokens);
        await delay(11000);
        replaceTargets(getTokenIdsFromTokens(targetTokens));
    }
}

async function animateStormSpiral(template: MeasuredTemplateDocumentPF2e, targetTokens: Token[]) {
    const locationOfTemplateX = template.x;
    const locationOfTemplateY = template.y;
    const lightningSounds = ["sound/NWN2-Sounds/as_wt_thundercl1.WAV", 
        "sound/NWN2-Sounds/as_wt_thundercl2.WAV"]
        
        const sequence = new Sequence()
        .effect()
            .file("jb2a.call_lightning.high_res.blue")
            .atLocation({ x: locationOfTemplateX, y: locationOfTemplateY })
            .fadeIn(1500)
            .fadeOut(1000)
            .duration(10000)
            .opacity(0.5)
            .scale(0.5)
        .sound()
            .file("sound/NWN2-Sounds/al_en_thunder_dist_03.WAV")
            .duration(10000)
            .fadeInAudio(500)
            .fadeOutAudio(1500)
        for (let i = 0; i < targetTokens.length; i++) {
            const randomDelay = getRandomNumberBetween(3000, 7000);
            sequence
                .effect()
                    .delay(randomDelay)
                    .file("jb2a.lightning_strike.blue")
                    .atLocation(targetTokens[i])
                    .randomizeMirrorY()
                    .opacity(1)
                .sound()
                    .file(lightningSounds)
                    .fadeInAudio(100)
                    .fadeOutAudio(1000)
                    .delay(randomDelay)
                    .duration(3000)
        }
        sequence.play()
}

