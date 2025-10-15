import { ItemPF2e, MeasuredTemplateDocumentPF2e, TokenPF2e } from "foundry-pf2e";
import { CrosshairUpdatable } from "../types.ts";
import { delay, deleteTemplateById, getTokenIdsFromTokens } from "../utils.ts";
import { Point } from "foundry-pf2e/foundry/common/_types.mjs";
import { MeasuredTemplateType } from "foundry-pf2e/foundry/common/constants.mjs";
import { getTemplateTokens, replaceTargets } from "../templatetarget.ts";

type WallOfFireLineTemplateOrientations = 'horizontal' | 'vertical';

type CustomTemplateData = {
    t: MeasuredTemplateType;
    x: number;
    y: number;
    width: number;
    distance: number;
    direction: number;
    fillColor: `#${string}`;
    borderColor: `#${string}`;
    flags?: { [x: string]: { [x: string]: JSONValue } };
    [key: string]: JSONValue | undefined; 
};

const { DialogV2 } = foundry.applications.api;

const CASTSOUND = "sound/BG2-Sounds/sim_pulsfire.wav"
const BOLTSOUNDS = "sound/NWN2-Sounds/sim_explflame.WAV"
const FIRESPREADSOUND = "sound/NWN2-Sounds/sff_firewhoosh02.WAV"
const REMAININGSOUNDS = "sound/NWN2-Sounds/al_cv_firesmldr1.WAV"

export async function startWallOfFire(token: TokenPF2e) {
    await chooseWallOfFireShape(token);
}

async function chooseWallOfFireShape(token: TokenPF2e) {

    const dialog = new DialogV2({
        window: {
            title: "Select Wall of Fire Shape",
        },
        position: {
            width: 400,
            height: "auto"
        },
        buttons: [
            {
                action: "ring",
                label: "5ft thick 10ft radius ring",
                callback: () => {
                    animateWallOfFireRing(token)
                }
            },
            {
                action: "line",
                label: "Line up to 60 ft long",
                callback: () => {
                    animateWallOfFireLine(token)
                }
            }
        ]
    })
    dialog.render(true);
}

async function animateWallOfFireLine(token: TokenPF2e) {
    const firstLocation = await selectStartingPoint(token);
    if (!firstLocation) return;

    const markerName = await animatePlacementMarker(firstLocation);

    const secondLocation = await selectEndPoint(firstLocation);
    if (!secondLocation) {
        Sequencer.EffectManager.endEffects({ name: markerName });
        return;
    }

    const adjustedLocations = getAdjustedLocationsBasedOnDirection(firstLocation, secondLocation);

    const firstLocationAdjusted = adjustedLocations.adjustedStartPoint;
    const secondLocationAdjusted = adjustedLocations.adjustedEndPoint;

    const myTemplateDocument = createWallOfFireLineTemplateData(firstLocationAdjusted, secondLocationAdjusted, token);

    if (!myTemplateDocument) return;

    const myTemplate = await createTemplate(myTemplateDocument);
    Sequencer.EffectManager.endEffects({ name: markerName });
    await delay(500);
    await animateSpellCasting(token);
    await animateCastingLine(token, firstLocationAdjusted, secondLocationAdjusted);
    await animatePersistentLine(myTemplate, firstLocationAdjusted, secondLocationAdjusted);
}

function getAdjustedLocationsBasedOnDirection(centerStartPoint: Point, centerEndPoint: Point): 
    { adjustedStartPoint: Point, adjustedEndPoint: Point } {
    
    const offset = canvas.scene!.grid.size / 2;

    // If a single square, adjust both points directly left and right
    if (centerStartPoint.x === centerEndPoint.x && centerStartPoint.y === centerEndPoint.y) {
        const adjustedStartPoint = { x: centerStartPoint.x - offset, y: centerStartPoint.y };
        const adjustedEndPoint = { x: centerEndPoint.x + offset, y: centerEndPoint.y };
        return { adjustedStartPoint, adjustedEndPoint };
    }

    const dx = centerEndPoint.x - centerStartPoint.x;
    const dy = centerEndPoint.y - centerStartPoint.y;

    const adjustedOffsetX = dx !== 0 ? -Math.sign(dx) * offset : 0;
    const adjustedOffsetY = dy !== 0 ? -Math.sign(dy) * offset : 0;

    const adjustedStartPoint = { 
        x: centerStartPoint.x + adjustedOffsetX, 
        y: centerStartPoint.y + adjustedOffsetY 
    };
    const adjustedEndPoint = { 
        x: centerEndPoint.x - adjustedOffsetX, 
        y: centerEndPoint.y - adjustedOffsetY 
    };

    return { adjustedStartPoint, adjustedEndPoint };
}

async function animateWallOfFireRing(token: TokenPF2e) {

    const location = await selectCentrePoint(token);
    if (!location) return;

    //based on firstLocation, determine locations of 4 other points to create a square

    const gridSize = canvas.scene!.grid.size;
    const gridDistance = canvas.scene!.grid.distance;

    const abovePoint = { x: location.x - gridSize * (7.5 / gridDistance), y: location.y - gridSize * (10 / gridDistance) };
    const belowPoint = { x: location.x - gridSize * (7.5 / gridDistance), y: location.y + gridSize * (10 / gridDistance) };
    const leftPoint = { x: location.x - gridSize * (10 / gridDistance), y: location.y - gridSize * (7.5 / gridDistance) };
    const rightPoint = { x: location.x + gridSize * (10 / gridDistance), y: location.y - gridSize * (7.5 / gridDistance) };

    //create ray templates starting from these points

    const aboveTemplateData = createWallOfFireRingSideTemplateData(abovePoint, token, 'horizontal');
    const belowTemplateData = createWallOfFireRingSideTemplateData(belowPoint, token, 'horizontal');
    const leftTemplateData = createWallOfFireRingSideTemplateData(leftPoint, token, 'vertical');
    const rightTemplateData = createWallOfFireRingSideTemplateData(rightPoint, token, 'vertical');

    if (!aboveTemplateData || !belowTemplateData || !leftTemplateData || !rightTemplateData) return;

    const aboveTemplate = await createTemplate(aboveTemplateData);
    const belowTemplate = await createTemplate(belowTemplateData);
    const leftTemplate = await createTemplate(leftTemplateData);
    const rightTemplate = await createTemplate(rightTemplateData);

    //tell each template about each other so they can be deleted together later

    aboveTemplate.setFlag("samioli-module", "wallOfFireAssociatedTemplateId", belowTemplate.id);
    belowTemplate.setFlag("samioli-module", "wallOfFireAssociatedTemplateId", leftTemplate.id);
    leftTemplate.setFlag("samioli-module", "wallOfFireAssociatedTemplateId", rightTemplate.id);
    rightTemplate.setFlag("samioli-module", "wallOfFireAssociatedTemplateId", aboveTemplate.id);

    await delay(500);
    await animateSpellCasting(token);
    await animateRing(location, aboveTemplate, belowTemplate, leftTemplate, rightTemplate);

    //capture tokens under all four templates and add to player's targeting

    const tokensInAboveTemplate = await getTemplateTokens(aboveTemplate);
    const tokensInBelowTemplate = await getTemplateTokens(belowTemplate);
    const tokensInLeftTemplate = await getTemplateTokens(leftTemplate);
    const tokensInRightTemplate = await getTemplateTokens(rightTemplate);

    const allTokens = [...tokensInAboveTemplate, ...tokensInBelowTemplate,
    ...tokensInLeftTemplate, ...tokensInRightTemplate];

    await replaceTargets(getTokenIdsFromTokens(allTokens));

}

export function removeWallOfFire(template: MeasuredTemplateDocumentPF2e) {
    const associatedTemplateId = template.getFlag("samioli-module", "wallOfFireAssociatedTemplateId");
    if (associatedTemplateId) {
        deleteTemplateById(associatedTemplateId.toString());
    }
}

async function selectCentrePoint(token: TokenPF2e): Promise<Point | false> {
    const centrePoint = await Sequencer.Crosshair.show({
        location: {
            obj: token,
            limitMaxRange: 120,
            wallBehavior: Sequencer.Crosshair.PLACEMENT_RESTRICTIONS.NO_COLLIDABLES,
        },
        icon: {
            texture: "icons/svg/fire.svg"
        }
    }, {
        [Sequencer.Crosshair.CALLBACKS.COLLIDE]: (crosshair: CrosshairUpdatable) => {
            crosshair.updateCrosshair({
                "icon.texture": "icons/svg/cancel.svg"
            })
        },
        [Sequencer.Crosshair.CALLBACKS.STOP_COLLIDING]: (crosshair: CrosshairUpdatable) => {
            crosshair.updateCrosshair({
                "icon.texture": "icons/svg/fire.svg"
            })
        },
        [Sequencer.Crosshair.CALLBACKS.CANCEL]: () => {
            ui.notifications.warn("Wall of fire cancelled.");
            return false;
        },
        show: undefined,
        move: undefined,
        mouseMove: undefined,
        invalidPlacement: undefined,
        placed: undefined
    });
    return centrePoint;
}

async function selectStartingPoint(token: TokenPF2e): Promise<Point | false> {
    
    ui.notifications.info("Select a starting location for the wall of fire. (Max 120ft from token)");

    const startingPointTemplate = await Sequencer.Crosshair.show({
        location: {
            obj: token,
            limitMaxRange: 120,
            wallBehavior: Sequencer.Crosshair.PLACEMENT_RESTRICTIONS.NO_COLLIDABLES
        },
        icon: {
            texture: "icons/svg/fire.svg"
        }
    }, {
        [Sequencer.Crosshair.CALLBACKS.COLLIDE]: (crosshair: CrosshairUpdatable) => {
            crosshair.updateCrosshair({
                "icon.texture": "icons/svg/cancel.svg"
            })
        },
        [Sequencer.Crosshair.CALLBACKS.STOP_COLLIDING]: (crosshair: CrosshairUpdatable) => {
            crosshair.updateCrosshair({
                "icon.texture": "icons/svg/fire.svg"
            })
        },
        [Sequencer.Crosshair.CALLBACKS.CANCEL]: () => {
            ui.notifications.warn("Wall of fire cancelled.");
            return false;
        },
        [Sequencer.Crosshair.CALLBACKS.INVALID_PLACEMENT]: () => {
            ui.notifications.warn("Starting location cannot be placed there.");
        },
        show: undefined,
        move: undefined,
        mouseMove: undefined,
        placed: undefined
    });

    if (!startingPointTemplate) return false;

    const selectedPoint = { x: startingPointTemplate.x, y: startingPointTemplate.y } as Point;

    return selectedPoint;
}

async function selectEndPoint(startingPoint: Point): Promise<Point | false> {
    ui.notifications.info("Select an end location for the wall of fire. (Max 60ft from starting point)");
    const endPointTemplate = await Sequencer.Crosshair.show({
        location: {
            obj: startingPoint,
            limitMaxRange: 55, //we limit to 55 so that the total length of the wall is 60ft as it includes half a square at each end
            wallBehavior: Sequencer.Crosshair.PLACEMENT_RESTRICTIONS.NO_COLLIDABLES
        },
        icon: {
            texture: "icons/svg/fire.svg"
        }
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
        [Sequencer.Crosshair.CALLBACKS.CANCEL]: () => {
            ui.notifications.warn("Wall of fire cancelled.");
            return false;
        },
        [Sequencer.Crosshair.CALLBACKS.INVALID_PLACEMENT]: () => {
            ui.notifications.warn("Starting location cannot be placed there.");
        },
        show: undefined,
        move: undefined,
        mouseMove: undefined,
        placed: undefined
    });

    if (!endPointTemplate) return false;

    const selectedPoint = { x: endPointTemplate.x, y: endPointTemplate.y } as Point;

    return selectedPoint;
}

function createWallOfFireRingSideTemplateData(location: Point, token: TokenPF2e,
    side: WallOfFireLineTemplateOrientations): CustomTemplateData {

    const templateDirection = (side === 'vertical') ? 90 : 0;
    const templateData = createCustomTemplateData(token, location, 15, templateDirection);

    return templateData;
}

function createWallOfFireLineTemplateData(location1: Point, location2: Point, token: TokenPF2e)
    : CustomTemplateData {

    const pf2eDistance = calculatePF2eDistance(location1, location2);
    const templateDirection = calculateAngle(location1, location2);

    const templateData = createCustomTemplateData(token, location1, pf2eDistance, templateDirection);

    return templateData;
}

function createCustomTemplateData(token: TokenPF2e, startingLocation: Point, distance: number,
    direction: number): CustomTemplateData {

    if (distance > 60) distance = 60;

    const originData = getWallOfFireItemFromToken(token)?.getOriginData();

    const templateData: CustomTemplateData = {
        t: "ray" as MeasuredTemplateType,
        x: startingLocation.x,
        y: startingLocation.y,
        width: 5,
        distance: distance,
        direction: direction,
        fillColor: "#f59042" as `#${string}`,
        borderColor: "#f59042" as `#${string}`,
        flags: {
            pf2e: {
                origin: {
                    name: "Wall of Fire",
                    slug: "wall-of-fire",
                    ...originData
                }
            }
        }
    };

    return templateData;
}

async function createTemplate(templateData: CustomTemplateData): Promise<MeasuredTemplateDocumentPF2e> {

    const myCustomTemplate = await MeasuredTemplateDocument.create(templateData, { parent: canvas.scene });
    if (!myCustomTemplate) {
        throw new Error("Failed to create template");
    }
    return myCustomTemplate as MeasuredTemplateDocumentPF2e;
}

function translatePixelsDistanceIntoFeet(distance: number): number | undefined {
    if (!canvas.scene) {
        return;
    } else {
        // Convert the distance from pixels to feet
        const distanceInFeet = distance * (canvas.scene.grid.distance / canvas.scene.grid.size)
        const roundedDistance = Math.ceil(distanceInFeet / canvas.scene.grid.distance) * canvas.scene.grid.distance;
        return roundedDistance;
    }
}

function calculatePixelsDistance(location1: Point, location2: Point): number {
    
    const dx = location2.x - location1.x;
    const dy = location2.y - location1.y;

    const distance = Math.hypot(dx, dy);

    return distance;
}

function calculateAngle(location1: Point, location2: Point): number {

    const dx = location2.x - location1.x;
    const dy = location2.y - location1.y;

    const angleRadians = Math.atan2(dy, dx);
    const angleDegrees = (angleRadians * 180) / Math.PI;

    const normalizedAngleDegrees = (angleDegrees + 360) % 360;

    return normalizedAngleDegrees;
}

function calculatePF2eDistance(originPoint: Point, destinationPoint: Point): number {

    const path = [originPoint, destinationPoint];
    // @ts-expect-error "euclidean" is valid
    const totalDistance = Math.round(canvas.grid.measurePath(path).euclidean);
    return totalDistance;
}

function getWallOfFireItemFromToken(token: TokenPF2e): ItemPF2e | null {
    if (!token.actor) return null;
    const wallOfFireItem = token.actor.items.find(i => i.slug === "wall-of-fire");
    if (!wallOfFireItem) return null;
    return wallOfFireItem;
}

async function fileExistsAtPath(path: string | URL | Request) {

    try {
        const response = await fetch(path, { method: 'HEAD' });
        return response.ok; // Returns true if status code is 200-299, false otherwise
    } catch (error) {
        console.log("File not found at: " + path)
        return false;
    }
}

async function animateSpellCasting(token: TokenPF2e) {

    const soundExists = await fileExistsAtPath(CASTSOUND);

    await new Sequence()
        .sound()
            .volume(0.5)
            .file(CASTSOUND)
            .playIf(soundExists)
        .effect()
            .atLocation(token)
            .file("jb2a.cast_generic.fire.01.orange.0")
            .waitUntilFinished(-1300)
        .play()
}

async function animateCastingLine(token: TokenPF2e, location1: Point, location2: Point) {

    const distanceMeasuredBolt = translatePixelsDistanceIntoFeet(calculatePixelsDistance(token, location1));

    let boltOfFireAnim;
    if (distanceMeasuredBolt === undefined) {
        return;
    } else if (distanceMeasuredBolt < 10) {
        boltOfFireAnim = "jb2a.fire_bolt.orange.05ft";
    } else if (distanceMeasuredBolt < 30) {
        boltOfFireAnim = "jb2a.fire_bolt.orange.15ft";
    } else if (distanceMeasuredBolt < 60) {
        boltOfFireAnim = "jb2a.fire_bolt.orange.30ft";
    } else if (distanceMeasuredBolt < 90) {
        boltOfFireAnim = "jb2a.fire_bolt.orange.60ft";
    } else {
        boltOfFireAnim = "jb2a.fire_bolt.orange.90ft";
    }

    const distanceMeasuredJet = translatePixelsDistanceIntoFeet(calculatePixelsDistance(location1, location2));

    let fireJetAnim;

    if (distanceMeasuredJet === undefined) {
        return;
    } else if (distanceMeasuredJet < 25) {
        fireJetAnim = "jb2a.fire_jet.orange.15ft";
    } else {
        fireJetAnim = "jb2a.fire_jet.orange.30ft";
    }

    const castSoundExists = await fileExistsAtPath(CASTSOUND);
    const fireSpreadSoundExists = await fileExistsAtPath(FIRESPREADSOUND);

    await new Sequence()
        .sound()
            .volume(0.5)
            .file(BOLTSOUNDS)
            .playIf(castSoundExists)
        .effect()
            .atLocation(token)
            .file(boltOfFireAnim)
            .stretchTo(location1)
            .waitUntilFinished(-1100)
        .sound()
            .volume(0.5)
            .file(FIRESPREADSOUND)
            .playIf(fireSpreadSoundExists)
        .effect()
            .file(fireJetAnim)
            .atLocation(location1)
            .stretchTo(location2)
            .scale({ x: 1.0, y: 3 })
            .fadeIn(100)
            .startTime(400)
            .fadeOut(200)
            .endTime(2200)
            .waitUntilFinished(-400)
        .play()
}

async function animatePersistentLine(templateToTieTo: MeasuredTemplateDocument, location1: Point, location2: Point) {

    let wallOfFireAnim;

    if (templateToTieTo.distance !== null && templateToTieTo.distance <= 20) {
        wallOfFireAnim = "jb2a.wall_of_fire.100x100.yellow";
    } else if (templateToTieTo.distance !== null && templateToTieTo.distance <= 40) {
        wallOfFireAnim = "jb2a.wall_of_fire.200x100.yellow";
    } else {
        wallOfFireAnim = "jb2a.wall_of_fire.300x100.yellow";
    }

    const remainingSoundsExists = await fileExistsAtPath(REMAININGSOUNDS);

    await new Sequence()
        .sound()
            .volume(0.5)
            .file(REMAININGSOUNDS)
            .fadeOutAudio(1000)
            .playIf(remainingSoundsExists)
        .effect()
            .file(wallOfFireAnim)
            .fadeIn(300)
            .atLocation(location1)
            .stretchTo(location2)
            .tieToDocuments(templateToTieTo)
            .persist()
            .loopOptions({ loopDelay: 0, loops: 3600, endOnLastLoop: false })
        .play()
}

async function animateRing(location: Point, aboveTemplate: MeasuredTemplateDocument,
    belowTemplate: MeasuredTemplateDocument, leftTemplate: MeasuredTemplateDocument,
    rightTemplate: MeasuredTemplateDocument) {

    const fireSpreadSoundExists = await fileExistsAtPath(FIRESPREADSOUND);
    const remainingSoundsExists = await fileExistsAtPath(REMAININGSOUNDS);

    await new Sequence()
        .effect()
            .atLocation(location)
            .scale(1.3)
            .file("jb2a.impact.fire.01.orange.0")
            .sound()
            .volume(0.5)
            .file(FIRESPREADSOUND)
            .fadeOutAudio(500)
            .playIf(fireSpreadSoundExists)
        .effect()
            .file("jb2a.wall_of_fire.ring.yellow")
            .atLocation(location)
            .fadeIn(500)
            .rotateIn(520, 2300, { ease: "easeOutQuint" })
            .scale(1.15)
            .scaleIn(0, 1000, { ease: "easeOutBack" })
            .persist()
            .tieToDocuments([aboveTemplate, belowTemplate, leftTemplate, rightTemplate])
            .loopOptions({ loopDelay: 0, loops: 3600, endOnLastLoop: false })
        .sound()
            .volume(0.5)
            .file(REMAININGSOUNDS)
            .fadeOutAudio(500)
            .playIf(remainingSoundsExists)
        .play()
}

async function animatePlacementMarker(location: Point) : Promise<string> {
    
    const markerName = `wall-of-fire-placement-marker-${Date.now()}`;
    
    const placementAnim = new Sequence()
        .effect()
            .atLocation(location)
            .file("icons/svg/fire.svg")
            .size(0.6, { gridUnits: true })
            .fadeIn(300)
            .opacity(0.8)
            .persist()
            .tint("#FF0000")
            .name(`${markerName}`)
    placementAnim.play();
    return markerName;
}