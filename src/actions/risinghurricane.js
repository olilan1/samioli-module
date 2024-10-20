import { logd, delay } from "../utils.js";
const { GRID_SNAPPING_MODES } = foundry.CONST;
const { CONST } = foundry;

export async function playRisingHurricaneAtLastPlacedTemplate(tokenId) {
    
    Hooks.once('createMeasuredTemplate', async (measuredTemplateDocumentPF2e) => {
        const token = canvas.tokens.placeables.find(t => t.id === tokenId);
        const player = game.user;
        
        await delay(200);
        let targets = new Set();
        targets = await captureTargets(player);
        await clearTargets(player);
        //remove template
        const location = { x: measuredTemplateDocumentPF2e.x, y: measuredTemplateDocumentPF2e.y };
        await measuredTemplateDocumentPF2e.delete();
        //animate on target tokens
        await playAnimation(targets, token, location);
        //add tokens back to player targets 
        await addTargetsToUser(targets, token);
    });

    let templateData = {
        t: "circle",
        sort: 99,
        distance: 15,
        direction: 0,
        fillColor: "#000000",
        borderColor: "#000000",
    };

    await canvas.templates.createPreview(templateData);

}

async function captureTargets(player) {
    let targets = new Set();
    if (player.targets.size > 0) {
        player.targets.forEach(token => {
            targets.add(token);
        });
    }
    await delay(200);
    return targets
}

async function clearTargets(player) {
    await player.clearTargets();
    await delay(200);
}

async function addTargetsToUser(targets, player) {
    let targetIds = Array.from(targets).map(token => token.id);
    targetIds = targetIds.filter(targetId => targetId !== player.id);
    const currentTargets = game.user.targets;
    const newTargets = new Set([...currentTargets, ...targetIds]);
    await game.user.updateTokenTargets(Array.from(newTargets));
}

function calculateOrbitalPath(center, token, numSteps = 12) {

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

function calculateTokenOffset(token) {

    const tokenCenter = token.center;
    const tokenCoords = { x: token.x, y: token.y };

    const offsetX = tokenCenter.x - tokenCoords.x;
    const offsetY = tokenCenter.y - tokenCoords.y;

    return { x: offsetX, y: offsetY };
}

async function playAnimation(targets, playerToken, centreLocation) {

    const duration = 5000;
    const whirlwind = "jb2a.whirlwind.bluegrey"

    let sequenceWhirlwind = new Sequence({ moduleName: "PF2e Animations", softFail: true })
        .effect()
            .atLocation({ x: centreLocation.x, y: centreLocation.y })
            .file(whirlwind)
            .fadeIn(1000)
            .duration(duration + 1000)
            .opacity(1)
            .fadeOut(1000)
            .zIndex(500)
            .size(6, {gridUnits: true})
    sequenceWhirlwind.play();

    for (const target of targets) {
        const rotation = Sequencer.Helpers.random_int_between(360 * 5, 360 * 15);
        const fallAngle = Sequencer.Helpers.random_int_between(120, 240);
        const rotationSpeed = Sequencer.Helpers.random_int_between(100, 200);
        const height = Sequencer.Helpers.random_float_between(1.3, 1.8);
        const opacityVariance = Sequencer.Helpers.random_float_between(0.7, 0.9);
        const landingVariance = Sequencer.Helpers.random_int_between(0, 200);
        const { x, y } = calculateOrbitalPath(centreLocation, target);
        let sequenceSpin = new Sequence({ moduleName: "PF2e Animations", softFail: true })
            .animation()
                .on(target)
                .opacity(0)
                .fadeIn(200)
                .duration(duration)
            .effect()
                .from(target)
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
                        absolute: false
                    }
                )
                .animateProperty("sprite", "scale.y",
                    {
                        from: 1,
                        to: 0.5,
                        duration: (duration/8)*1,
                        delay: (duration/8)*6,
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
            .effect()
                .fadeIn(200)
                .opacity(1)
                .from(target)
                .rotate(fallAngle)
                .duration(3000)
                .fadeOut(500)
                .delay(duration)
                .waitUntilFinished()
            .animation()
                .on(target)
                .opacity(1)
                .fadeIn(500)
                //.delay(duration + 500)
        sequenceSpin.play();
    }

    await delay(duration + 3000);
}