import { MeasuredTemplateDocumentPF2e, TokenPF2e } from "foundry-pf2e";
import { delay, getTokenIdsFromTokens } from "../utils.ts";
import { MeasuredTemplateType } from "foundry-pf2e/foundry/common/constants.mjs";
import { getTemplateTokens, replaceTargets } from "../templatetarget.ts";
import { Point } from "foundry-pf2e/foundry/common/_types.mjs";

export async function startTectonicStomp(token: TokenPF2e) {

    // create the template at tokens's locations
    const creatorUserId = game?.user.id;
    const template = await createTemplateAtTokenPosition(token, creatorUserId);
    if (!template) return;
    const locationOfTemplate: Point = {x: template.x, y: template.y};
    
    // capture all targets in the area of effect
    const allTargets = await getTemplateTokens(template);
    
    // remove player's token
    const remainingTargets = allTargets.filter((t) => t !== token);

    // delete the template
    template.delete();

    // run animation
    await animateTectonicStomp(token, remainingTargets, locationOfTemplate);

    const tokenIdsToTarget = getTokenIdsFromTokens(remainingTargets);

    // add captured targets to player
    replaceTargets(tokenIdsToTarget);
}

async function createTemplateAtTokenPosition(token: TokenPF2e, userId: string): Promise<MeasuredTemplateDocumentPF2e | null> {

    const halfGrid = canvas.grid.size / 2;

    const templateData = {
        t: "circle" as MeasuredTemplateType,
        distance: 30,
        x: token.x + halfGrid,
        y: token.y + halfGrid,
        user: userId
    };

    const template = await MeasuredTemplateDocument.create(templateData, { parent: canvas.scene }) as MeasuredTemplateDocumentPF2e;
    if (!template) {
        throw new Error("Failed to create template");
    }
    return template;
}

async function animateTectonicStomp(stomper: TokenPF2e, targets: TokenPF2e[], locationOfTemplate: Point) {

        const initialDelay = 1000;
        const setupJumpAnimationTime = 750;
        const jumpAnimationTime = 1000;
        const landAnimationTime = 300;
        const combinedAnimationTime = initialDelay + setupJumpAnimationTime + jumpAnimationTime + landAnimationTime;
        const endDelay = 2000;
        const rotateFallTime = 200;
        const rotateBackUpTime = 1000;
        const explosionAnimation = "jb2a.explosion.shrapnel.bomb.01.red";
        const groundCracksAnimation = "jb2a.ground_cracks.01.orange";
        const jumpPuffAnimation = "jb2a.smoke.puff.ring.01.white.0";
        const landingPuffAnimation = "jb2a.smoke.puff.ring.02.white.0";
        const hittingFloorAnimation = "jb2a.smoke.puff.ring.01.white.1";
        const tokenScaleX = stomper.document.texture.scaleX;
        const tokenScaleY = stomper.document.texture.scaleY;
    
        const sequence = new Sequence()
            // hide stomper token
            .animation()
                .on(stomper)
                .opacity(0)
                .fadeIn(200)
                .duration(combinedAnimationTime)
            // create effect on stomper
            .effect()
                .copySprite(stomper)
                // pause for a moment
                .animateProperty("sprite", "scale.x", { from : tokenScaleX, to: tokenScaleX, duration: initialDelay }) 
                .animateProperty("sprite", "scale.y", { from : tokenScaleY, to: tokenScaleY, duration: initialDelay })
                // small shrink before the jump
                .animateProperty("sprite", "scale.x", { from : 1, to: 0.8, duration: setupJumpAnimationTime, ease: "easeOutQuart", delay: initialDelay }) 
                .animateProperty("sprite", "scale.y", { from : 1, to: 0.8, duration: setupJumpAnimationTime, ease: "easeOutQuart", delay: initialDelay })
                // animate caster moving up
                .animateProperty("sprite", "scale.x", { from : 1, to: 2, duration: jumpAnimationTime, ease: "easeOutQuart", delay: initialDelay + setupJumpAnimationTime, }) 
                .animateProperty("sprite", "scale.y", { from : 1, to: 2, duration: jumpAnimationTime, ease: "easeOutQuart", delay: initialDelay + setupJumpAnimationTime, })
                // animate stomper landing
                .animateProperty("sprite", "scale.x", { from : 1, to: 0.625, duration: landAnimationTime, ease: "easeInCubic", delay: initialDelay + setupJumpAnimationTime + jumpAnimationTime })
                .animateProperty("sprite", "scale.y", { from : 1, to: 0.625, duration: landAnimationTime, ease: "easeInCubic", delay: initialDelay + setupJumpAnimationTime + jumpAnimationTime })
                // keep the effect in action for a little longer
                .animateProperty("sprite", "scale.x", { from : 1, to: 1, duration: endDelay, delay: combinedAnimationTime })
                .animateProperty("sprite", "scale.y", { from : 1, to: 1, duration: endDelay, delay: combinedAnimationTime })
                // fade out effect
                .animateProperty("sprite", "opacity", { from : 1, to: 0, duration: endDelay, delay: combinedAnimationTime + endDelay })
            // create smoke puff at stomper location
            .effect()
                .file(jumpPuffAnimation)
                .atLocation(stomper)
                .scale(1)
                .belowTokens()
                .opacity(0.5)
                .delay(initialDelay + setupJumpAnimationTime)
            // create explosion template
            .effect()
                .file(explosionAnimation)
                .atLocation(locationOfTemplate)
                .scale(1.5)
                .delay(combinedAnimationTime)
                .opacity(0.3)
            // add ground cracks
            .effect()
                .file(groundCracksAnimation)
                .atLocation(locationOfTemplate)
                .delay(combinedAnimationTime)
                .fadeIn(100)
                .scale(2.2)
                .opacity(0.4)
                .belowTokens()
                .duration(5000)
                .fadeOut(1500)
            // puff animation on impact
            .effect()
                .file(landingPuffAnimation)
                .atLocation(locationOfTemplate)
                .delay(combinedAnimationTime)
                .belowTokens()
                .scale(3)
                .opacity(0.7)
            // shake screen
            .canvasPan()
                .shake()
                .delay(combinedAnimationTime)
            .animation()
                .on(stomper)
                // make caster visible
                .opacity(1)
                .fadeIn(endDelay)
                .delay(combinedAnimationTime)

        for (const target of targets) {

            let targetFallRotation;

            if  (target.x <= stomper.x) {
                targetFallRotation = -90;
            } else {
                targetFallRotation = 90;
            }

            const landingVariance = Sequencer.Helpers.random_int_between(0, 200);

            sequence.animation()
                .on(target)
                .rotateIn(targetFallRotation, rotateFallTime)
                .delay(combinedAnimationTime + landingVariance)
            .effect()
                .atLocation(target)
                .belowTokens()
                .file(hittingFloorAnimation)
                .opacity(0.3)
                .delay(combinedAnimationTime + landingVariance - 200)
            .animation()
                .on(target)
                .rotateIn(0, rotateBackUpTime)
                .delay(combinedAnimationTime + 5000)
        }

        sequence.play();
        
        await delay(combinedAnimationTime + 5000);
        
}