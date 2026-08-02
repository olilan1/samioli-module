import { RegionDocumentPF2e, TokenPF2e } from "foundry-pf2e";
import { getTemplateTokens, replaceTargets, targetTokensUnderRegion } from "../templatetarget.ts";
import { delay, getActorFromRegion, getRegionOrigin, getTokenFromActor } from "../utils.ts";

const { DialogV2 } = foundry.applications.api;

export async function initiatePerniciousPoltergeist(region: RegionDocumentPF2e) {
    animateRegion(region);
    chooseEffectOfPerniciousPoltergeist(region);
}

export async function chooseEffectOfPerniciousPoltergeist(region: RegionDocumentPF2e) {

    const dialog = new DialogV2({
        window: {
            title: "Which Effect Do You Want To Apply?"
        },
        position: {
            left: (window.innerWidth - 450) / 2,
            top: 200
        },
        buttons: [
            {
                action: "deathlyassault",
                label: "Deathly Assault",
                callback: async () => { await deathlyAssault(region); }
            },
            {
                action: "frighten",
                label: "Frighten",
                callback: async () => { await frighten(region); }
            },
            {
                action: "telekineticstorm",
                label: "Telekinetic Storm",
                callback: async () => { await telekineticStorm(region); }
            }
        ]
    });
    dialog.render(true);
}

async function deathlyAssault(region: RegionDocumentPF2e) {
    const targets = await getTemplateTokens(region);
    if (!targets.length) {
        ui.notifications.warn("There are no valid targets in the area.");
        return;
    }

    const originalTargetIds = Array.from(game.user.targets).map((t) => t.id);

    // Rows use core's `label.checkbox`, which sizes the radio and stops it being flex-shrunk.
    //
    // The first target is pre-selected because a radio group with nothing checked is
    // `:indeterminate`, and core paints an indeterminate radio's mark in
    // --checkbox-checkmark-color, which is transparent. Every radio would be invisible until the
    // first click.
    let dialogContent = `
        <form style="display: flex; flex-direction: column;">
            <p style="margin-bottom: 5px;">Choose a target for Deathly Assault:</p>
            <div style="display: flex; flex-direction: column; gap: 4px; max-height: 400px; overflow-y: auto;">
    `;

    for (const [index, target] of targets.entries()) {
        dialogContent += `
            <label class="checkbox" style="gap: 8px; padding: 2px; cursor: pointer;">
                <input type="radio" name="target" value="${target.id}"${index === 0 ? " checked" : ""}>
                <img src="${target.document.texture.src}" width="36" height="36" style="border: 1px solid #000;">
                <span>${target.name}</span>
            </label>
        `;
    }

    dialogContent += `</div></form>`;

    const dialogWidth = 250;

    // Resolves to the chosen token id, or null if the dialog was cancelled or dismissed. Restoring
    // targets is done on the result rather than in `close`, which also fires after a button press.
    const selectedId = await DialogV2.wait({
        window: {
            title: "Deathly Assault Target"
        },
        position: {
            width: dialogWidth,
            height: "auto",
            left: (window.innerWidth - dialogWidth) / 2,
            top: 200
        },
        content: dialogContent,
        buttons: [
            {
                action: "assault",
                icon: "fas fa-skull-crossbones",
                label: "Assault",
                default: true,
                callback: (_event: PointerEvent | SubmitEvent, _button: HTMLButtonElement,
                    dialog: InstanceType<typeof DialogV2>) => {
                    const checked = dialog.element.querySelector<HTMLInputElement>(
                        'input[name="target"]:checked');
                    return checked?.value ?? null;
                }
            },
            {
                action: "cancel",
                icon: "fas fa-times",
                label: "Cancel",
                callback: () => null
            }
        ],
        // The typings declare this parameter as HTMLDialogElement, but v14 passes the DialogV2
        // instance (client/applications/api/dialog.mjs:421).
        render: (_event: Event, dialog: unknown) => {
            const element = (dialog as InstanceType<typeof DialogV2>).element;

            // Preview the pre-selected target when the dialog appears, then each new selection
            const checked = element.querySelector<HTMLInputElement>('input[name="target"]:checked');
            replaceTargets(checked ? [checked.value] : []);

            const inputs = element.querySelectorAll<HTMLInputElement>('input[name="target"]');
            for (const input of Array.from(inputs)) {
                input.addEventListener("change", () => replaceTargets([input.value]));
            }
        }
    }) as string | null;

    if (!selectedId) {
        replaceTargets(originalTargetIds);
        return;
    }

    const selectedTarget = canvas.tokens.get(selectedId);
    if (!selectedTarget) {
        replaceTargets(originalTargetIds);
        return;
    }

    animateDeathlyAssault(region, selectedTarget);
}

async function frighten(region: RegionDocumentPF2e) {
    animateFrighten(region);
    await delay(2000);
    targetTokensUnderRegion(region, game.user.id);
}

async function telekineticStorm(region: RegionDocumentPF2e) {
    animateTelekineticStorm(region);
    await delay(10000);
    targetTokensUnderRegion(region, game.user.id);
}

function animateRegion(region: RegionDocumentPF2e) {

    const castAnimation = "jb2a.template_circle.vortex.loop.purple"
    const regionAnimation = "jb2a.spirit_guardians.dark_purple.particles"

    const sequence = new Sequence()
        .effect()
            .file(castAnimation)
            .atLocation(region)
            .opacity(0.5)
            .fadeIn(500)
            .fadeOut(500)
            .duration(2500)
        .effect()
            .mirrorY(true)
            .delay(1000)
            .fadeIn(750)
            .file(regionAnimation)
            .attachTo(region)
            .loopOptions({loopDelay: 0, loops: 3600, endOnLastLoop: false})
        sequence.play();
}

function animateFrighten(region: RegionDocumentPF2e) {

    const skullAnimation = "jb2a.toll_the_dead.purple.skull_smoke";
    const castingAnimation = "jb2a.soundwave.01.purple"
    const caster = getTokenFromActor(getActorFromRegion(region));
    if (!caster) return;

    const sequence = new Sequence()
        .effect()
            .file(castingAnimation)
            .atLocation(caster)
        .effect()
            .delay(200)
            .file(skullAnimation)
            .atLocation(region)
            .scale(1.7)
        sequence.play()
}

function animateDeathlyAssault(region: RegionDocumentPF2e, target: TokenPF2e) {

    const skullAnimation = "jb2a.icon.skull.purple";
    const projectileAnimation = "jb2a.spell_projectile.skull.pinkpurple.90ft";
    const impactAnimation = "jb2a.impact.004.pinkpurple";
    const castingAnimation = "jb2a.soundwave.01.purple"
    const caster = getTokenFromActor(getActorFromRegion(region));
    if (!caster) return;

    const path = calculateAnimationPath(region, target);
    if (!path) return;
    const { start, end } = path;

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

function calculateAnimationPath(region: RegionDocumentPF2e, target: TokenPF2e): { start: { x: number, y: number }, end: { x: number, y: number } } | null {
    // The burst's centre, which a circle shape reports as its origin
    const origin = getRegionOrigin(region);
    if (!origin) return null;

    // Calculate starting location
    const angle = Math.random() * 360;
    const distanceInFeet = 25;
    const distanceInPixels = distanceInFeet * (canvas.grid.size / canvas.grid.distance);
    const start = calculateNewCoordinates(origin.x, origin.y, angle, distanceInPixels);

    // Calculate ending location
    const targetCenter = target.center;
    const dx = targetCenter.x - start.x;
    const dy = targetCenter.y - start.y;
    const angleDegrees = Math.atan2(dy, dx) * (180 / Math.PI);
    const distanceToTargetInPixels = Math.hypot(dx, dy);
    const extraDistanceInFeet = 60;
    const extraDistanceInPixels = extraDistanceInFeet * (canvas.grid.size / canvas.grid.distance);
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

async function animateTelekineticStorm(region: RegionDocumentPF2e) {
    const vortexAnimation = "jb2a.aura_themed.01.orbit.loop.metal.01.red"
    const castingAnimation = "jb2a.soundwave.01.purple"
    const debrisAnimation1 = "jb2a.explosion.side_fracture.flask.02.1"
    const caster = getTokenFromActor(getActorFromRegion(region));
    if (!caster) return;
    const hitAnimation = "jb2a.impact.007.red"
    const targets = await getTemplateTokens(region);
    const gridSize = canvas.grid.size;
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
            .atLocation(region)
            .tint("#800080")
            .file(vortexAnimation)
            .atLocation(region)
            .scale(1.2)
            .duration(10000)
            .playbackRate(1.3)
            .opacity(0.7)
            .fadeOut(500)
        sequence.effect()
            .delay(200)
            .fadeIn(500)
            .file(debrisAnimation1)
            .atLocation(region)
            .timeRange(2000, 4500)
            .scale({ x: 1.7, y: 1.2 })
            .loopOptions({ loopDelay: 0, loops: 3, endOnLastLoop: false })
            .loopProperty("sprite", "rotation", { from: 0, to: 2000, duration: 10000})
            .fadeOut(500)
        sequence.play();
}