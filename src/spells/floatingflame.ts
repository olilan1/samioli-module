import { getTokensInRegion } from "../areatargeting.ts";
import { RegionDocumentPF2e, TokenPF2e } from "foundry-pf2e";
import { replaceTargets } from "../targeting.ts";
import { CrosshairUpdatable } from "../types.ts";
import { createCrosshairIconSwitcher, deleteLightFromRegion, getActorFromRegion, getRegionOrigin, getTokenFromActor, MODULE_ID } from "../utils.ts";
import { Point } from "foundry-pf2e/foundry/common/_types.mjs";

const floatingFlameAnimation = "jb2a.flaming_sphere.200px.orange.02";
const floatingFlameCastAnimation = "jb2a.cast_generic.fire.01.orange.0";
const castSound = "sound/BG2-Sounds/sim_pulsfire.wav";
const fireLoopSound = "sound/NWN2-Sounds/al_cv_firesmldr1.WAV"
const VALID_ICON = "icons/svg/fire.svg";

/**
 * Returns the centre of the single grid square a Floating Flame region occupies.
 *
 * PF2e places the spell's 5-foot square area as a `rectangle` shape, whose origin is its top-left
 * corner.
 */
function getFlameCentre(region: RegionDocumentPF2e): Point | null {
    const origin = getRegionOrigin(region);
    if (!origin) return null;
    const half = canvas.grid.size / 2;
    return { x: origin.x + half, y: origin.y + half };
}

export async function initiateFloatingFlame(region: RegionDocumentPF2e) {
    const caster = getTokenFromActor(getActorFromRegion(region));
    const flameCentre = getFlameCentre(region);
    if (!caster || !flameCentre) return;

    await new Sequence()
        .sound()
            .volume(0.5)
            .file(castSound)
        .effect()
            .atLocation(caster)
            .file(floatingFlameCastAnimation)
            .waitUntilFinished(-1300)
        .play()

    // Create a new source of light on the region's square
    const floatingFlameLight = await AmbientLightDocument.create({
        x: flameCentre.x,
        y: flameCentre.y,

        flags: {
            [MODULE_ID]: {
                regionId: region.id
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

    // add light id to region flags for later reference
    if (floatingFlameLight){
        await region.setFlag(MODULE_ID, "lightId", floatingFlameLight.id);
    }

    const seq = new Sequence()
        .sound()
            .volume(0.5)
            .file(fireLoopSound)
            .duration(2500)
            .fadeOutAudio(200)
        .effect()
            .atLocation(flameCentre)
            .file(floatingFlameAnimation)
            .scale(1)
            .scaleIn(0, 1000, { ease: "easeOutCubic" })
            .persist()
            .loopOptions({ loopDelay: 0, loops: 3600, endOnLastLoop: false })
            .name(`floating-flame-${region.id}`);
    await seq.play()
}

export async function sustainFloatingFlame(region: RegionDocumentPF2e) {
    const startingOrigin = getRegionOrigin(region);
    const startingCentre = getFlameCentre(region);
    if (!startingOrigin || !startingCentre) return;
    const tokensToCaptureAndTarget: TokenPF2e[] = [];

    // clear user's targets
    replaceTargets([]);
    //capture tokens under the initial region location and store them
    tokensToCaptureAndTarget.push(...getTokensInRegion(region));

    // create crosshairs for user to select first location within 5 feet
    ui.notifications.info("Select your first space within 5 feet to move Floating Flame.");
    const firstLocationCenter = await selectLocation(startingCentre, true);
    // Check for cancellation
    if (!firstLocationCenter) {
        ui.notifications.warn("Floating Flame movement cancelled.");
        return;
    }

    // move region and capture target tokens in the area and store them
    tokensToCaptureAndTarget.push(...await moveRegionAndCaptureTokens(region, firstLocationCenter));

    // check if first movement was diagonal
    const diagonalMove = isDiagonalMove(startingCentre, firstLocationCenter);

    // create crosshairs for user to select second location within 5 feet of first location
    // (if first movement is diagonal, second must not be diagonal)
    ui.notifications.info("Select an additional space within 5 feet to move Floating Flame.");
    const secondLocationCenter = await selectLocation(firstLocationCenter, !diagonalMove);
    // Check for cancellation
    if (!secondLocationCenter) {
        // reset region to original location
        await moveRegionShapeTo(region, startingOrigin);
        ui.notifications.warn("Floating Flame movement cancelled.");
        return;
    }

    // move region and capture target tokens in the area and store them
    tokensToCaptureAndTarget.push(...await moveRegionAndCaptureTokens(region, secondLocationCenter));

    // animate flame moving between the two locations
    await animateFloatingFlameMove(startingCentre, firstLocationCenter, secondLocationCenter, region);
    // Add targets to user
    replaceTargets(tokensToCaptureAndTarget.map(token => token.id));
}

async function selectLocation(startLocation: Point, allowDiagonal: boolean): Promise<Point | false> {

    const validLocations = getValidMoveLocations(startLocation, allowDiagonal);

    // Two independent reasons a square can be invalid: it is not a legal move, or line of sight to
    // it is blocked. They are tracked separately because their callbacks fire on different
    // schedules — MOUSE_MOVE on every pointer move, COLLIDE only when the collision state changes.
    let isLegalMove = true;
    let isBlocked = false;

    const switchIcon = await createCrosshairIconSwitcher(VALID_ICON);
    const refreshIcon = (crosshair: CrosshairUpdatable) => {
        switchIcon(crosshair, isLegalMove && !isBlocked);
    };

    const moveLocation = await Sequencer.Crosshair.show({
        location: {
            obj: startLocation,
            limitMaxRange: 5,
            wallBehavior: Sequencer.Crosshair.PLACEMENT_RESTRICTIONS.NO_COLLIDABLES,
        },
        icon: {
            texture: VALID_ICON
        },
        snap: {
            position: CONST.GRID_SNAPPING_MODES.CENTER,
        },
        t: "circle"
    }, {
        [Sequencer.Crosshair.CALLBACKS.COLLIDE]: (crosshair: CrosshairUpdatable) => {
            isBlocked = true;
            refreshIcon(crosshair);
        },
        [Sequencer.Crosshair.CALLBACKS.STOP_COLLIDING]: (crosshair: CrosshairUpdatable) => {
            isBlocked = false;
            refreshIcon(crosshair);
        },
        [Sequencer.Crosshair.CALLBACKS.MOUSE_MOVE]: (crosshair: CrosshairUpdatable) => {
            isLegalMove = validLocations.has(`${crosshair.x},${crosshair.y}`);
            refreshIcon(crosshair);
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

/**
 * Copies a light's document position onto its placeable.
 *
 * v14's AmbientLight positions only its controls and tooltip, leaving x/y on the placeable itself
 * at 0. Sequencer reads the placeable to decide where an animation starts, so a light animates from
 * the top-left of the scene unless its position is copied across first.
 */
function syncLightPlaceablePosition(light: AmbientLightDocument<Scene | null> | undefined) {
    if (!light?.object) return;
    light.object.x = light.x;
    light.object.y = light.y;
}

async function animateFloatingFlameMove(startLocation: Point, midLocation: Point, endLocation: Point, region: RegionDocumentPF2e) {
    // Animation logic for moving Floating Flame
    const floatingFlameEffect = Sequencer.EffectManager.getEffects({ name: `floating-flame-${region.id}` })[0];

    if (floatingFlameEffect) {
        Sequencer.EffectManager.endEffects({ name: `floating-flame-${region.id}` });
    }

    const floatingFlameLight = canvas.scene?.lights.find(light => {
        return light.getFlag(MODULE_ID, "regionId") === region.id;
    }) as AmbientLightDocument<Scene | null> | undefined;

    syncLightPlaceablePosition(floatingFlameLight);

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
            syncLightPlaceablePosition(floatingFlameLight);
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
            .name(`floating-flame-${region.id}`)
        .play();
}

/**
 * Repositions a region's single shape to a new top-left origin.
 *
 * A region has no position of its own; its coordinates live on the shape, so moving it means
 * rewriting the shape rather than updating x/y on the document.
 */
async function moveRegionShapeTo(region: RegionDocumentPF2e, origin: Point) {
    const shape = region.shapes.at(0)?.toObject();
    if (!shape) return;
    await region.update({ shapes: [{ ...shape, x: origin.x, y: origin.y }] });
}

async function moveRegionAndCaptureTokens(region: RegionDocumentPF2e, newCentre: Point) {
    const half = canvas.grid.size / 2;
    await moveRegionShapeTo(region, { x: newCentre.x - half, y: newCentre.y - half });
    return getTokensInRegion(region);
}

export async function removeFloatingFlame(region: RegionDocumentPF2e) {
    const flameCentre = getFlameCentre(region);
    if (!flameCentre) return;

    // Animate flame disappearing
    await new Sequence()
    .effect()
        .atLocation(flameCentre)
        .file("jb2a.impact.fire.01.orange.0")
        .scale(0.7)
        .waitUntilFinished(-1300)
    .thenDo(async function() {
        await deleteLightFromRegion(region);
        const floatingFlameEffect = Sequencer.EffectManager.getEffects({ name: `floating-flame-${region.id}` })[0];
        if (floatingFlameEffect) {
            Sequencer.EffectManager.endEffects({ name: `floating-flame-${region.id}` });
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