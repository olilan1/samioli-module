import { MeasuredTemplateDocumentPF2e, TokenPF2e } from "foundry-pf2e";
import { getTemplateTokens, replaceTargets } from "../templatetarget.ts";
import { CrosshairUpdatable } from "../types.ts";
import { deleteLightFromTemplate, MODULE_ID } from "../utils.ts";
import { Point } from "foundry-pf2e/foundry/common/_types.mjs";

const floatingFlameAnimation = "jb2a.flaming_sphere.200px.orange.02";
const floatingFlameCastAnimation = "jb2a.cast_generic.fire.01.orange.0";
const castSound = "sound/BG2-Sounds/sim_pulsfire.wav";
const fireLoopSound = "sound/NWN2-Sounds/al_cv_firesmldr1.WAV"

export async function initiateFloatingFlame(template: MeasuredTemplateDocumentPF2e) {
    const caster = template.actor?.getActiveTokens()[0];

    await new Sequence()
        .sound()
            .volume(0.5)
            .file(castSound)
        .effect()
            .atLocation(caster)
            .file(floatingFlameCastAnimation)
            .waitUntilFinished(-1300)
        .play()

    // Create a new source of light at the template location
    const floatingFlameLight = await AmbientLightDocument.create({
        x: template.x + canvas.grid.size / 2,
        y: template.y + canvas.grid.size / 2,
    
        flags: {
            [MODULE_ID]: {
                templateId: template.id
            }
        },

        config: {
            bright: 1,
            dim: 15,
            alpha: 0.5,
            angle: 360,
            color: "#ff8800",
            coloration: 10,
            attenuation: 0.5,
            luminosity: 0.5,
            saturation: 0,
            contrast: 0,
            shadows: 0,
            animation: {
                type: "flame",
                speed: 5,
                intensity: 8,
                reverse: false
            }
        },
        
        darkness: {
            min: 0,
            max: 1
        }
    }, { parent: canvas.scene });

    // add light id to template flags for later reference
    if (floatingFlameLight){
        await template.setFlag(MODULE_ID, "lightId", floatingFlameLight.id);
    }

    await new Sequence()
        .sound()
            .volume(0.5)
            .file(fireLoopSound)
            .duration(2500)
            .fadeOutAudio(200)
        .effect()
            .atLocation({ x: template.x + canvas.grid.size / 2, y: template.y + canvas.grid.size / 2 })
            .file(floatingFlameAnimation)
            .scale(1)
            .scaleIn(0, 1000, { ease: "easeOutCubic" })
            .persist()
            .loopOptions({ loopDelay: 0, loops: 3600, endOnLastLoop: false })
            .name(`floating-flame-${template.id}`)
        .play()
}

export async function sustainFloatingFlame(template: MeasuredTemplateDocumentPF2e) {
    const templateLocation = { x: template.x, y: template.y };
    const templateCenter = { x: templateLocation.x + canvas.grid.size / 2, y: templateLocation.y + canvas.grid.size / 2 };
    const tokensToCaptureAndTarget: TokenPF2e[] = [];

    // clear user's targets
    replaceTargets([]);
    //capture tokens under the initial template location and store them
    tokensToCaptureAndTarget.push(...await getTemplateTokens(template));

    // create crosshairs for user to select first location within 5 feet
    ui.notifications.info("Select your first space within 5 feet to move Floating Flame.");
    const firstLocationCenter = await selectLocation(templateCenter, true);
    // Check for cancellation
    if (!firstLocationCenter) {
        ui.notifications.warn("Floating Flame movement cancelled.");
        return;
    }

    // move template and capture target tokens in the area and store them
    tokensToCaptureAndTarget.push(...await moveTemplateAndCaptureTokens(template, firstLocationCenter));

    // check if first movement was diagonal
    const diagonalMove = isDiagonalMove(templateCenter, firstLocationCenter);

    // create crosshairs for user to select second location within 5 feet of first location
    // (if first movement is diagonal, second must not be diagonal)
    ui.notifications.info("Select an additional space within 5 feet to move Floating Flame.");
    const secondLocationCenter = await selectLocation(firstLocationCenter, !diagonalMove);
    // Check for cancellation
    if (!secondLocationCenter) {
        // reset template to original location
        await template.update({ x: templateLocation.x, y: templateLocation.y });
        ui.notifications.warn("Floating Flame movement cancelled.");
        return;
    }

    // move template and capture target tokens in the area and store them
    tokensToCaptureAndTarget.push(...await moveTemplateAndCaptureTokens(template, secondLocationCenter));

    // animate flame moving between the two locations
    await animateFloatingFlameMove(templateCenter, firstLocationCenter, secondLocationCenter, template);
    // Add targets to user
    replaceTargets(tokensToCaptureAndTarget.map(token => token.id));
}

async function selectLocation(startLocation: Point, allowDiagonal: boolean): Promise<Point> {

    const validLocations = getValidMoveLocations(startLocation, allowDiagonal);

    const moveLocation = await Sequencer.Crosshair.show({
        location: {
            obj: startLocation,
            limitMaxRange: 5,
            wallBehavior: Sequencer.Crosshair.PLACEMENT_RESTRICTIONS.NO_COLLIDABLES,
        },
        icon: {
            texture: "icons/svg/fire.svg"
        },
        snap: {
            position: CONST.GRID_SNAPPING_MODES.CENTER,
        },
        t: CONST.MEASURED_TEMPLATE_TYPES.CIRCLE
    }, {
        [Sequencer.Crosshair.CALLBACKS.COLLIDE]: (crosshair: CrosshairUpdatable) => {
            crosshair.updateCrosshair({
                "icon.texture": "icons/svg/cancel.svg"
            });
        },
        [Sequencer.Crosshair.CALLBACKS.STOP_COLLIDING]: (crosshair: CrosshairUpdatable) => {
            crosshair.updateCrosshair({
                "icon.texture": "icons/svg/fire.svg"
            });
        },
        [Sequencer.Crosshair.CALLBACKS.MOUSE_MOVE]: (crosshair: CrosshairUpdatable) => {
            const locationKey = `${crosshair.x},${crosshair.y}`;
            if (validLocations.has(locationKey)) {
                crosshair.updateCrosshair({ "icon.texture": "icons/svg/fire.svg" });
            } else {
                crosshair.updateCrosshair({ "icon.texture": "icons/svg/cancel.svg" });
            }
        },
        [Sequencer.Crosshair.CALLBACKS.PLACED]: (crosshair: CrosshairUpdatable) => {
            const locationKey = `${crosshair.source.x},${crosshair.source.y}`;
            if (!validLocations.has(locationKey)) {
                ui.notifications.error("Two diagonal moves in a row are not allowed.");
                throw new Error("Two diagonal moves in a row are not allowed.");
            }
        },
        [Sequencer.Crosshair.CALLBACKS.CANCEL]: () => {
            return false;
        },
        show: undefined,
        move: undefined,
        invalidPlacement: undefined
    });

    return moveLocation;
}

async function animateFloatingFlameMove(startLocation: Point, midLocation: Point, endLocation: Point, template: MeasuredTemplateDocumentPF2e) {
    // Animation logic for moving Floating Flame
    const floatingFlameEffect = Sequencer.EffectManager.getEffects({ name: `floating-flame-${template.id}` })[0];

    if (floatingFlameEffect) {
        Sequencer.EffectManager.endEffects({ name: `floating-flame-${template.id}` });
    }

    const floatingFlameLight = canvas.scene?.lights.find(light => {
        return light.getFlag(MODULE_ID, "templateId") === template.id;
    }) as AmbientLightDocument<Scene | null>;

    await new Sequence()
        .sound()
            .volume(0.5)
            .file(fireLoopSound)
            .duration(2500)
            .fadeOutAudio(200)
        .animation()
            .on(floatingFlameLight)
            .moveSpeed(5)
            .moveTowards(midLocation)
        .effect()
            .atLocation(startLocation)
            .file(floatingFlameAnimation)
            .moveTowards(midLocation)
            .moveSpeed(250)
            .fadeOut(50)
            .waitUntilFinished(-100)
        .thenDo(async () => {
            // Workaround for Sequencer issue when animating light object
            if (floatingFlameLight.object) {
                floatingFlameLight.object.x = midLocation.x;
                floatingFlameLight.object.y = midLocation.y;
            }
        })
        .animation()
            .on(floatingFlameLight)
            .moveSpeed(5)
            .moveTowards(endLocation)
        .effect()
            .atLocation(midLocation)
            .file(floatingFlameAnimation)
            .moveTowards(endLocation)
            .moveSpeed(250)
            .fadeOut(50)
            .fadeIn(50)
            .waitUntilFinished(-100)
        .effect()
            .fadeIn(50)
            .atLocation(endLocation)
            .file(floatingFlameAnimation)
            .scale(1)
            .persist()
            .loopOptions({ loopDelay: 0, loops: 3600, endOnLastLoop: false })
            .name(`floating-flame-${template.id}`)
        .thenDo(async () => {
            if (floatingFlameLight.object) {
                floatingFlameLight.object.x = endLocation.x;
                floatingFlameLight.object.y = endLocation.y;
            }
        })
        .play();
}

async function moveTemplateAndCaptureTokens(template: MeasuredTemplateDocumentPF2e, newLocation: Point) {
    await template.update({ x: newLocation.x - canvas.grid.size / 2, y: newLocation.y - canvas.grid.size / 2 });
    const tokensInArea = await getTemplateTokens(template);
    return tokensInArea;
}

export async function removeFloatingFlame(template: MeasuredTemplateDocumentPF2e) {
    // Animate flame disappearing
    await new Sequence()
    .effect()
        .atLocation({ x: template.x + canvas.grid.size / 2, y: template.y + canvas.grid.size / 2 })
        .file("jb2a.impact.fire.01.orange.0")
        .scale(0.7)
        .waitUntilFinished(-2100)
    .thenDo(async function() {
        deleteLightFromTemplate(template);

        const floatingFlameEffect = Sequencer.EffectManager.getEffects({ name: `floating-flame-${template.id}` })[0];

        if (floatingFlameEffect) {
            Sequencer.EffectManager.endEffects({ name: `floating-flame-${template.id}` });
        }
    })
    .play()

}

function isDiagonalMove(start: Point, end: Point) {
    return (start.x !== end.x && start.y !== end.y);
}

function getValidMoveLocations(currentLocation: Point, allowDiagonal: boolean) {
    const validLocations = new Set<string>();
    const gridSize = canvas.grid.size;

    // Always add the current location
    validLocations.add(`${currentLocation.x},${currentLocation.y}`);

    const directions = [
        { x: 0, y: -gridSize }, // Up
        { x: 0, y: gridSize },  // Down
        { x: -gridSize, y: 0 }, // Left
        { x: gridSize, y: 0 },  // Right
    ];

    if (allowDiagonal) {
        // If a diagonal move is allowed, all 8 directions are valid
        directions.push(
            { x: -gridSize, y: -gridSize }, // Up-Left
            { x: gridSize, y: -gridSize },  // Up-Right
            { x: -gridSize, y: gridSize },  // Down-Left
            { x: gridSize, y: gridSize }   // Down-Right
        );
    }

    for (const dir of directions) {
        validLocations.add(`${currentLocation.x + dir.x},${currentLocation.y + dir.y}`);
    }

    return validLocations;
}