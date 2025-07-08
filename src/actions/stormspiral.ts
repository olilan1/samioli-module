import { MeasuredTemplateDocumentPF2e } from "foundry-pf2e";
import { checkTemplateRollOptionsForString, delay, getTokenIdsFromTokens, shuffleArray } from "../utils.ts";
import { getTemplateTokens, replaceTargets } from "../templatetarget.ts";

export async function checkIfTemplatePlacedIsStormSpiral(template: MeasuredTemplateDocumentPF2e) {
    if (!checkTemplateRollOptionsForString(template, "origin:item:storm-spiral")) {
        return;
    }
    initiateStormSpiral(template);
}

async function initiateStormSpiral(template: MeasuredTemplateDocumentPF2e) {

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
        
        let sequence = new Sequence({moduleName: "PF2e Animations", softFail: true})
        .effect()
            .file("jb2a.call_lightning.high_res.blue")
            .atLocation({ x: locationOfTemplateX, y: locationOfTemplateY })
            .fadeIn(1500)
            .fadeOut(1000)
            .duration(10000)
            .opacity(0.5)
            .scale(0.5)
        for (let i = 0; i < targetTokens.length; i++) {
            sequence
                .effect()
                    .delay(3000, 8000)
                    .file("jb2a.lightning_strike.blue")
                    .atLocation(targetTokens[i])
                    .randomizeMirrorY()
                    .opacity(1)
        }
        sequence.play()
}

