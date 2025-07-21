import { MeasuredTemplateDocumentPF2e } from "foundry-pf2e";
import { getTemplateTokens, replaceTargets, targetTokensUnderTemplate } from "../templatetarget.ts";
import { delay, findRelevantToken } from "../utils.ts";

export async function initiatePerniciousPoltergeist(template: MeasuredTemplateDocumentPF2e) {
    animateTemplate(template);
    chooseEffectOfPerniciousPoltergeist(template);
}

export async function chooseEffectOfPerniciousPoltergeist(template: MeasuredTemplateDocumentPF2e) {

    const dialogOptions = {
        left: (window.innerWidth - 450) / 2,
        top: 200,
    };
    const dialog = new Dialog({
        title: "Which Effect Do You Want To Apply?",
        buttons: {
            deathlyassault: {
                label: "Deathly Assault",
                callback: () => deathlyAssault(template)
            },
            frighten: {
                label: "Frighten",
                callback: () => frighten(template)
            },
            telekineticstorm: {
                label: "Telekinetic Storm",
                callback: () => telekineticStorm(template)
            }
        }
    }, dialogOptions);
    dialog.render(true);
}

async function deathlyAssault(template: MeasuredTemplateDocumentPF2e) {
    const targets = await getTemplateTokens(template);
    if (!targets.length) {
        ui.notifications.warn("There are no valid targets in the area.");
        return;
    }

    const originalTargetIds = game.user.targets.map((t) => t.id);
    let assaultClicked = false;

    let dialogContent = `
        <form style="display: flex; flex-direction: column;">
            <p style="margin-bottom: 5px;">Choose a target for Deathly Assault:</p>
            <div class="form-group" style="display: flex; flex-direction: column; gap: 4px; max-height: 400px; overflow-y: auto;">
    `;

    for (const target of targets) {
        dialogContent += `
            <label style="display: flex; align-items: center; padding: 2px; cursor: pointer;">
                <input type="radio" name="target" value="${target.id}" style="margin-right: 8px;">
                <img src="${target.document.texture.src}" width="36" height="36" style="vertical-align: middle; border: 1px solid #000; margin-right: 8px;">
                <span>${target.name}</span>
            </label>
        `;
    }

    dialogContent += `</div></form>`;

    const dialogWidth = 250;
    const assaultDialogOptions = {
        width: dialogWidth,
        height: "auto",
        left: (window.innerWidth - dialogWidth) / 2,
        top: 200,
    };
    new Dialog({
        title: "Deathly Assault Target",
        content: dialogContent,
        buttons: {
            assault: {
                icon: '<i class="fas fa-skull-crossbones"></i>',
                label: "Assault",
                callback: (html) => {
                    assaultClicked = true;
                    const selectedId = (html.find('input[name="target"]:checked')[0] as HTMLInputElement)?.value;
                    if (selectedId) {
                        const selectedTarget = canvas.tokens.get(selectedId);
                        animateDeathlyAssault(template, selectedTarget);
                    } else {
                        ui.notifications.warn("You must select a target.");
                        replaceTargets(originalTargetIds);
                    }
                }
            },
            cancel: {
                icon: '<i class="fas fa-times"></i>',
                label: "Cancel"
            }
        },
        default: "assault",
        render: (html) => {
            // Clear any existing targets when the dialog appears
            replaceTargets([]);

            html.find('input[name="target"]').on("change", (event) => {
                const selectedId = (event.currentTarget as HTMLInputElement).value;
                replaceTargets([selectedId]);
            });
        },
        close: () => {
            if (!assaultClicked) {
                replaceTargets(originalTargetIds);
            }
        },
    }, assaultDialogOptions).render(true);
}

async function frighten(template: MeasuredTemplateDocumentPF2e) {
    animateFrighten(template);
    await delay(2000);
    targetTokensUnderTemplate(template, game.user.id);
}

async function telekineticStorm(template: MeasuredTemplateDocumentPF2e) {
    animateTelekineticStorm(template);
    await delay(10000);
    targetTokensUnderTemplate(template, game.user.id);
}

function animateTemplate(template: MeasuredTemplateDocumentPF2e) {
    
    const castAnimation = "jb2a.template_circle.vortex.loop.purple"
    const templateAnimation = "jb2a.spirit_guardians.dark_purple.particles"

    const sequence = new Sequence()
        .effect()
            .file(castAnimation)
            .atLocation(template)
            .opacity(0.5)
            .fadeIn(500)
            .fadeOut(500)
            .duration(2500)
        .effect()
            .mirrorY(true)
            .delay(1000)
            .fadeIn(750)
            .file(templateAnimation)
            .attachTo(template)
            .loopOptions({loopDelay: 0, loops: 3600, endOnLastLoop: false})
        sequence.play();
}

function animateFrighten(template: MeasuredTemplateDocumentPF2e) {

    const skullAnimation = "jb2a.toll_the_dead.purple.skull_smoke";
    const castingAnimation = "jb2a.soundwave.01.purple"
    const caster = findRelevantToken({ actorId: template.actor?._id })

    const sequence = new Sequence()
        .effect()
            .file(castingAnimation)
            .atLocation(caster)
        .effect()
            .delay(200)
            .file(skullAnimation)
            .atLocation(template)
            .scale(1.7)
        sequence.play()
}

function animateDeathlyAssault(template: MeasuredTemplateDocumentPF2e, target: Token) {

    const skullAnimation = "jb2a.icon.skull.purple";
    const projectileAnimation = "jb2a.spell_projectile.skull.pinkpurple.90ft";
    const { start, end } = calculateAnimationPath(template, target);
    const impactAnimation = "jb2a.impact.004.pinkpurple";
    const castingAnimation = "jb2a.soundwave.01.purple"
    const caster = findRelevantToken({ actorId: template.actor?._id })

    const sequence = new Sequence()
        .effect()
            .file(castingAnimation)
            .atLocation(caster)
        .effect()
            .delay(200)
            .file(skullAnimation)
            .atLocation(start)
            .duration(2500)
            .fadeIn(1000)
            .opacity(0.4)
            .scale(1.1)
            .scaleIn(0, 2500)
            .fadeOut(1000)
            .waitUntilFinished(-800)
            .zIndex(2)
        .effect()
            .file(projectileAnimation)
            .atLocation(start)
            .stretchTo(end)
            .scale(1.7)
            .fadeIn(800)
            .opacity(0.8)
            .endTime(1800)
            .fadeOut(1000)
            .zIndex(1)
            .waitUntilFinished(-570)
        .effect()
            .file(impactAnimation)
            .atLocation(target)
            .scale(0.5)
            .opacity(0.8)
        .canvasPan()
            .shake()
            .delay(50)
    sequence.play();
}

function calculateAnimationPath(template: MeasuredTemplateDocumentPF2e, target: Token): { start: { x: number, y: number }, end: { x: number, y: number } } {
    // Calculate starting location
    const angle = Math.random() * 360;
    const distanceInFeet = 25;
    const distanceInPixels = distanceInFeet * (canvas.scene.grid.size / canvas.scene.grid.distance);
    const start = calculateNewCoordinates(template.x, template.y, angle, distanceInPixels);

    // Calculate ending location
    const targetCenter = target.center;
    const dx = targetCenter.x - start.x;
    const dy = targetCenter.y - start.y;
    const angleDegrees = Math.atan2(dy, dx) * (180 / Math.PI);
    const distanceToTargetInPixels = Math.hypot(dx, dy);
    const extraDistanceInFeet = 60;
    const extraDistanceInPixels = extraDistanceInFeet * (canvas.scene.grid.size / canvas.scene.grid.distance);
    const totalDistanceInPixels = distanceToTargetInPixels + extraDistanceInPixels;
    const end = calculateNewCoordinates(start.x, start.y, angleDegrees, totalDistanceInPixels);

    return { start, end };
}

function calculateNewCoordinates(x: number, y: number, angleDegrees: number, hypotenuseLength: number): { x: number, y: number } {
    // Convert angle from degrees to radians
    const angleRadians = angleDegrees * (Math.PI / 180);

    // Calculate changes in x and y
    const deltaX = hypotenuseLength * Math.cos(angleRadians);
    const deltaY = hypotenuseLength * Math.sin(angleRadians);

    // Calculate new coordinates
    const newX = x + deltaX;
    const newY = y + deltaY;

    return { x: newX, y: newY };
}

async function animateTelekineticStorm(template: MeasuredTemplateDocumentPF2e) {
    const vortexAnimation = "jb2a.aura_themed.01.orbit.loop.metal.01.red"
    const castingAnimation = "jb2a.soundwave.01.purple"
    const debrisAnimation1 = "jb2a.explosion.side_fracture.flask.02.1"
    const caster = findRelevantToken({ actorId: template.actor?._id })
    const hitAnimation = "jb2a.impact.007.red"
    const targets = await getTemplateTokens(template);
    const gridSize = canvas.scene!.grid.size;
    const impacts = targets.length * 5;

    const sequence = new Sequence()
        .effect()
            .file(castingAnimation)
            .atLocation(caster)
        
        for (let i = 0; i < impacts; i++)  {
            sequence.effect()
                .delay(Sequencer.Helpers.random_int_between(1500, 7000))
                .randomRotation(true)
                .file(hitAnimation)
                .spriteOffset(
                    { 
                        x: Sequencer.Helpers.random_int_between(0, gridSize/3), 
                        y: Sequencer.Helpers.random_int_between(0, gridSize/3) 
                    }
                )
                .scale(Sequencer.Helpers.random_float_between(0.05, 0.15))
                .atLocation(Sequencer.Helpers.random_array_element(targets))
        }

        sequence.effect()
            .delay(200)
            .fadeIn(500)
            .filter("ColorMatrix", {
                hue: 0,     
                brightness: 1,
                contrast: 1, 
                saturate: -1
            })
            .atLocation(template)
            .tint("#800080")
            .file(vortexAnimation)
            .atLocation(template)
            .scale(1.2)
            .duration(10000)
            .playbackRate(1.3)
            .opacity(0.7)
            .fadeOut(500)
        sequence.effect()
            .delay(200)
            .fadeIn(500)
            .file(debrisAnimation1)
            .atLocation(template)
            .timeRange(2000, 4500)
            .scale({ x: 1.7, y: 1.2 })
            .loopOptions({ loopDelay: 0, loops: 3, endOnLastLoop: false })
            .loopProperty("sprite", "rotation", { from: 0, to: 2000, duration: 10000})
            .fadeOut(500)
        sequence.play();
}