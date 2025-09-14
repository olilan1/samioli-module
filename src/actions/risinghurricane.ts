import { TokenPF2e, UserPF2e } from "foundry-pf2e";
import { getTemplateTokens, replaceTargets } from "../templatetarget.ts";
import { delay, getTokenIdsFromTokens } from "../utils.ts";

export async function playRisingHurricaneAtLastPlacedTemplate() {
    
    Hooks.once('createMeasuredTemplate', async (measuredTemplateDocumentPF2e) => {
        const player = game.user;
        //get target tokens and store
        const targets: Set<TokenPF2e> = 
            new Set<TokenPF2e>(await getTemplateTokens(measuredTemplateDocumentPF2e));
        //clear targets for the animation
        await clearTargets(player);
        //remove template
        const location = { x: measuredTemplateDocumentPF2e.x, y: measuredTemplateDocumentPF2e.y };
        await measuredTemplateDocumentPF2e.delete();
        //animate on target tokens        
        await playAnimation(targets, location);
        //add tokens back to player targets 
        await replaceTargets(getTokenIdsFromTokens(Array.from(targets)))
    });
    
    const templateData = {
        t: "circle",
        sort: 99,
        distance: 15,
        direction: 0,
        fillColor: "#87CEEB",
        borderColor: "#FFFFFF",
    } as const;

    await canvas.templates.createPreview(templateData);
}

async function clearTargets(player: UserPF2e) {
    player.clearTargets();
    await delay(200);
}

function calculateOrbitalPath(center: { x: number, y: number }, token: TokenPF2e, numSteps = 12) {

    const angle = Math.atan2(token.center.y - center.y, token.center.x - center.x);
    const radius = Math.hypot(token.center.x - center.x, token.center.y - center.y);
    const totalAngle = 2 * Math.PI;
    const angularVelocity = totalAngle / numSteps;
    const xInterpolation = [];
    const yInterpolation = [];
    for (let i = 0; i < numSteps; i++) {
        const newAngle = angle + i * angularVelocity;
        const newX = center.x + radius * Math.cos(newAngle);
        const newY = center.y + radius * Math.sin(newAngle);
        const relativeX = newX - token.x;
        const relativeY = newY - token.y;
        const offset = calculateTokenOffset(token)

        xInterpolation.push(Math.round(relativeX - offset.x));
        yInterpolation.push(Math.round(relativeY - offset.y));
    }

    return { x: xInterpolation, y: yInterpolation };
}

function calculateTokenOffset(token: TokenPF2e) {

    const tokenCenter = token.center;
    const tokenCoords = { x: token.x, y: token.y };

    const offsetX = tokenCenter.x - tokenCoords.x;
    const offsetY = tokenCenter.y - tokenCoords.y;

    return { x: offsetX, y: offsetY };
}

async function playAnimation(targets: Set<TokenPF2e>, centreLocation: { x: number, y: number }) {

    const duration = 5000;
    const whirlwind = "jb2a.whirlwind.bluegrey"
    const whirlwindSound = "sound/NWN2-Sounds/al_en_wind_lp_6.WAV"
    const landingSounds = ["sound/NWN2-Sounds/cb_ht_fleshston1.WAV", 
        "sound/NWN2-Sounds/cb_ht_fleshston2.WAV","sound/NWN2-Sounds/cb_ht_fleshwood1.WAV", 
        "sound/NWN2-Sounds/cb_ht_fleshwood2.WAV",]

    const sequenceWhirlwind = new Sequence()
        .effect()
            .atLocation({ x: centreLocation.x, y: centreLocation.y })
            .file(whirlwind)
            .fadeIn(1000)
            .duration(duration + 1000)
            .opacity(1)
            .fadeOut(1000)
            .zIndex(500)
            .size(6, {gridUnits: true})
        .sound()
            .file(whirlwindSound)
            .duration(duration)
            .fadeInAudio(100)
            .fadeOutAudio(1000)
    sequenceWhirlwind.play();

    for (const target of targets) {
        const rotation = Sequencer.Helpers.random_int_between(360 * 5, 360 * 15);
        const fallAngle = Sequencer.Helpers.random_int_between(120, 240);
        const rotationSpeed = Sequencer.Helpers.random_int_between(100, 200);
        const height = Sequencer.Helpers.random_float_between(1.3, 1.8);
        const opacityVariance = Sequencer.Helpers.random_float_between(0.7, 0.9);
        const landingVariance = Sequencer.Helpers.random_int_between(0, 500);
        const { x, y } = calculateOrbitalPath(centreLocation, target);
        const sequenceSpin = new Sequence()
            .animation()
                .on(target)
                .opacity(0)
                .fadeIn(200)
                .duration(duration)
            .effect()
                .copySprite(target)
                .opacity(opacityVariance)
                .zIndex(1000)
                .animateProperty("sprite", "scale.x",
                    {
                        from: 1,
                        to: height,
                        duration: (duration/8)*5
                    }
                )
                .animateProperty("sprite", "scale.y",
                    {
                        from: 1,
                        to: height,
                        duration: (duration/8)*5
                    }
                )
                .animateProperty("sprite", "rotation",
                    {
                        from: 0,
                        to: rotation,
                        duration: duration
                    }
                )
                .loopProperty("spriteContainer", "position.x", 
                    {
                        values: x,
                        pingPong: true,
                        ease: "linear",
                        duration: rotationSpeed
                    }
                )
                .loopProperty("spriteContainer", "position.y", 
                    {
                        values: y,
                        pingPong: true,
                        ease: "linear",
                        duration: rotationSpeed
                    }
                )
                .animateProperty("sprite", "scale.x",
                    {
                        from: 1,
                        to: 0.5,
                        duration: (duration/8)*1,
                        delay: (duration/8)*6,
                        // @ts-expect-error - absolute is ok
                        absolute: false
                    }
                )
                .animateProperty("sprite", "scale.y",
                    {
                        from: 1,
                        to: 0.5,
                        duration: (duration/8)*1,
                        delay: (duration/8)*6,
                        // @ts-expect-error - absolute is ok
                        absolute: false
                    }
                )
                .fadeOut(500)
                .duration(duration)
            .effect()
                .atLocation(target)
                .file("jb2a.impact.ground_crack.white.01")
                .belowTokens()
                .randomRotation()
                .opacity(0.2)
                .scale(0.7)
                .delay(duration - landingVariance)
            .sound()
                .file(landingSounds)
                .delay(duration - landingVariance)
                .volume(0.2)
            .effect()
                .fadeIn(200)
                .opacity(1)
                .copySprite(target)
                .rotate(fallAngle)
                .duration(3000)
                .fadeOut(500)
                .delay(duration)
                .waitUntilFinished()
            .animation()
                .on(target)
                .opacity(1)
                .fadeIn(500)
        sequenceSpin.play();
    }

    await delay(duration + 3000);
}