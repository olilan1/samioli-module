import { ItemPF2e, MeasuredTemplateDocumentPF2e, TokenPF2e } from "foundry-pf2e";
import { CrosshairUpdatable } from "../types.ts";
import { delay, deleteTemplateById, getTokenIdsFromTokens } from "../utils.ts";
import { Point } from "foundry-pf2e/foundry/common/_types.mjs";
import { MeasuredTemplateType } from "foundry-pf2e/foundry/common/constants.mjs";
import { getTemplateTokens, replaceTargets } from "../templatetarget.ts";

type WallOfFireLineTemplates = 'horizontal' | 'vertical';

let adjustedOffsetX: number;
let adjustedOffsetY: number;

const { DialogV2 } = foundry.applications.api;
export interface CustomTemplateData {
  t: MeasuredTemplateType;
  x: number;
  y: number;
  width: number;
  distance: number;
  direction: number;
  fillColor: `#${string}`;
  borderColor: `#${string}`;
  flags?: { [x: string]: { [x: string]: JSONValue } | undefined };
  [key: string]: JSONValue | undefined;
}

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
          wallOfFireRing(token)
        }
      },
      {
        action: "line",
        label: "Line up to 60 ft long",
        callback: () => {
          wallOfFireLine(token)
        }
      }
    ]
  })
  dialog.render(true);
}

async function wallOfFireLine(token: TokenPF2e) {
  const firstLocation = await selectStartingPoint(token);

  if (firstLocation === false) {
    ui.notifications.info("Wall of fire cancelled.");
    return;
  }

  const secondLocation = await selectEndPoint(firstLocation);

  if (secondLocation === false) {
    ui.notifications.info("Wall of fire cancelled.");
    return;
  }

  const myTemplateDocument = await getWallOfFireLineTemplateData(firstLocation, secondLocation, token);
  if (!myTemplateDocument) {
    return;
  }
  const myTemplate = await createTemplate(myTemplateDocument);
  await delay(500);
  await animateSpellCasting(token);
  await animateCastingLine(token, firstLocation, secondLocation);
  await animateLine(myTemplate);
}

async function wallOfFireRing(token: TokenPF2e) {
  
  const location = await selectCentrePoint(token);
  if (location === false) {
    ui.notifications.info("Wall of fire cancelled.");
    return;
  }

  //based on firstLocation, determine locations of 4 other points to create a square

  const gridSize = canvas.scene!.grid.size;

  const abovePoint = { x: location.x - gridSize * 1.5, y: location.y - gridSize * 2 };
  const belowPoint = { x: location.x - gridSize * 1.5, y: location.y + gridSize * 2 };
  const leftPoint = { x: location.x - gridSize * 2, y: location.y - gridSize * 1.5 };
  const rightPoint = { x: location.x + gridSize * 2, y: location.y - gridSize * 1.5 };

  //create ray templates starting from these points

  const aboveTemplateData = await getWallOfFireRingSideTemplateData(abovePoint, token, 'horizontal');
  const belowTemplateData = await getWallOfFireRingSideTemplateData(belowPoint, token, 'horizontal');
  const leftTemplateData = await getWallOfFireRingSideTemplateData(leftPoint, token, 'vertical');
  const rightTemplateData = await getWallOfFireRingSideTemplateData(rightPoint, token, 'vertical');

  if (!aboveTemplateData || !belowTemplateData || !leftTemplateData || !rightTemplateData) {
    return;
  }

  const aboveTemplate = await createTemplate(aboveTemplateData) as MeasuredTemplateDocumentPF2e;
  const belowTemplate = await createTemplate(belowTemplateData) as MeasuredTemplateDocumentPF2e;
  const leftTemplate = await createTemplate(leftTemplateData) as MeasuredTemplateDocumentPF2e;
  const rightTemplate = await createTemplate(rightTemplateData) as MeasuredTemplateDocumentPF2e;

  //tell each template about each other so they can be deleted together later

  aboveTemplate.setFlag("samioli-module", "wallOfFireAssociatedTemplateId", belowTemplate.id);
  belowTemplate.setFlag("samioli-module", "wallOfFireAssociatedTemplateId", leftTemplate.id);
  leftTemplate.setFlag("samioli-module", "wallOfFireAssociatedTemplateId", rightTemplate.id);
  rightTemplate.setFlag("samioli-module", "wallOfFireAssociatedTemplateId", aboveTemplate.id);

  await delay(500);
  await animateSpellCasting(token);
  await animateRingNew(location, aboveTemplate, belowTemplate, leftTemplate, rightTemplate);

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
    show: undefined,
    move: undefined,
    mouseMove: undefined,
    invalidPlacement: undefined,
    placed: undefined,
    cancel: undefined
  });
  return centrePoint;
}

async function selectStartingPoint(token: TokenPF2e): Promise<Point | false> {
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
    show: undefined,
    move: undefined,
    mouseMove: undefined,
    invalidPlacement: undefined,
    placed: undefined,
    cancel: undefined
  });

  return startingPointTemplate;
}

async function selectEndPoint(startingPoint: Point): Promise<Point | false> {
  const endPointTemplate = await Sequencer.Crosshair.show({
    location: {
      obj: startingPoint,
      limitMaxRange: 60,
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
    show: undefined,
    move: undefined,
    mouseMove: undefined,
    invalidPlacement: undefined,
    placed: undefined,
    cancel: undefined
  });

  return endPointTemplate;
}

async function getWallOfFireRingSideTemplateData(location: Point, token: TokenPF2e, 
  side: WallOfFireLineTemplates): Promise<CustomTemplateData | null> {

    const originData = getWallOfFireItemFromToken(token)?.getOriginData();

    let templateDirection = 0;

    if (side === 'vertical') {
      templateDirection = 90;
    }

    const templateData : CustomTemplateData = {
    t: "ray" as MeasuredTemplateType,
    x: location.x,
    y: location.y,
    width: 5,
    distance: 15,
    direction: templateDirection,
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

async function getWallOfFireLineTemplateData(location1: Point, location2: Point, token: TokenPF2e)
  : Promise<CustomTemplateData | null> {

  const distanceAndAngle = calculateDistanceAndAngle(location1, location2);
  let foundryDistance = translateDistanceIntoFoundry(distanceAndAngle.distance);

  if (!foundryDistance) {
    return null;
  }

  const offset = canvas.scene!.grid.size / 2;

  adjustedOffsetX = offset;
  adjustedOffsetY = offset;

  //if it's only a single square
  if (location1.x === location2.x && location1.y === location2.y) {
    foundryDistance = 0; //we will actually increase this later
    adjustedOffsetX *= -1;
    adjustedOffsetY *= 0;
  }
  //if going left to right horizontally only
  else if (location1.x < location2.x && location1.y === location2.y) {
    adjustedOffsetX *= -1;
    adjustedOffsetY *= 0;
  }
  //if going right to left horizontally only
  else if (location1.x > location2.x && location1.y === location2.y) {
    adjustedOffsetX *= 1;
    adjustedOffsetY *= 0;
  }
  //if going up to down vertically only
  else if (location1.x === location2.x && location1.y < location2.y) {
    adjustedOffsetX *= 0;
    adjustedOffsetY *= -1;
  }
  //if going down to up vertically only
  else if (location1.x === location2.x && location1.y > location2.y) {
    adjustedOffsetX *= 0;
    adjustedOffsetY *= 1;
  }
  //if diagonal going from top left to bottom right
  else if (location1.x < location2.x && location1.y < location2.y) {
    adjustedOffsetX *= -1;
    adjustedOffsetY *= -1;
  }
  //if diagonal going from top right to bottom left
  else if (location1.x > location2.x && location1.y < location2.y) {
    adjustedOffsetX *= 1;
    adjustedOffsetY *= -1;
  }
  //if diagonal going from bottom left to top right
  else if (location1.x < location2.x && location1.y > location2.y) {
    adjustedOffsetX *= -1;
    adjustedOffsetY *= 1;
  }
  //if diagonal going from bottom right to top left
  else if (location1.x > location2.x && location1.y > location2.y) {
    adjustedOffsetX *= 1;
    adjustedOffsetY *= 1;
  }

  const originData = getWallOfFireItemFromToken(token)?.getOriginData();

  const templateData : CustomTemplateData = {
    t: "ray" as MeasuredTemplateType,
    x: location1.x + adjustedOffsetX,
    y: location1.y + adjustedOffsetY,
    width: 5,
    distance: foundryDistance + 5,
    direction: distanceAndAngle.normalizedAngleDegrees,
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

async function createTemplate(templateData: CustomTemplateData): Promise<MeasuredTemplateDocument> {

  const myCustomTemplate = await MeasuredTemplateDocument.create(templateData, { parent: canvas.scene });
  if (!myCustomTemplate) {
    throw new Error("Failed to create template");
  }
  return myCustomTemplate;
}

function translateDistanceIntoFoundry(distance: number): number | undefined {
  if (!canvas.scene) {
    return;
  } else {
    const distanceInFeet = distance * (canvas.scene.grid.distance / canvas.scene.grid.size)
    const foundryDistance = Math.ceil(distanceInFeet / 5) * 5;
    return foundryDistance;
  }
}

function calculateDistanceAndAngle(location1: Point, location2: Point): { distance: number, normalizedAngleDegrees: number } {
  // Calculate differences in x and y coordinates
  const dx = location2.x - location1.x;
  const dy = location2.y - location1.y;

  // Calculate distance using the Pythagorean theorem
  const distance = Math.hypot(dx, dy);

  const angleRadians = Math.atan2(dy, dx);

  const angleDegrees = (angleRadians * 180) / Math.PI;

  const normalizedAngleDegrees = (angleDegrees + 360) % 360;

  return { distance, normalizedAngleDegrees };
}

function calculateNewCoordinates(x: number, y: number, angleDegrees: number, hypotenuseLength: number): Point {
  // Convert angle from degrees to radians
  const angleRadians = angleDegrees * (Math.PI / 180);

  // Calculate changes in x and y
  const deltaX = hypotenuseLength * Math.cos(angleRadians);
  const deltaY = hypotenuseLength * Math.sin(angleRadians);

  // Calculate new coordinates
  const newX = x + deltaX;
  const newY = y + deltaY;

  const newPoint : Point = { x: newX, y: newY };

  return newPoint;
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

  const distanceMeasuredBolt = translateDistanceIntoFoundry(calculateDistanceAndAngle(token, location1).distance);

  let boltOfFireAnim;
  if (distanceMeasuredBolt === undefined){
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

  const distanceMeasuredJet = translateDistanceIntoFoundry(calculateDistanceAndAngle(location1, location2).distance);

  const normalizedAngleDegrees = calculateDistanceAndAngle(location1, location2).normalizedAngleDegrees

  const newLocation2 = calculateNewCoordinates(location1.x, location1.y, normalizedAngleDegrees, calculateDistanceAndAngle(location1, location2).distance + 200)

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
      .stretchTo({ x: location1.x + adjustedOffsetX, y: location1.y + adjustedOffsetY })
      .waitUntilFinished(-1100)
    .sound()
      .volume(0.5)
      .file(FIRESPREADSOUND)
      .playIf(fireSpreadSoundExists)
    .effect()
      .file(fireJetAnim)
      .atLocation({ x: location1.x + adjustedOffsetX, y: location1.y + adjustedOffsetY })
      .stretchTo(newLocation2)
      .scale({ x: 1.0, y: 3 })
      .fadeIn(100)
      .startTime(400)
      .fadeOut(200)
      .endTime(2200)
      .waitUntilFinished(-400)
    .play()
}

async function animateLine(templateToAttachTo: MeasuredTemplateDocument) {

  let wallOfFireAnim;

  if (templateToAttachTo.distance !== null && templateToAttachTo.distance <= 20) {
    wallOfFireAnim = "jb2a.wall_of_fire.100x100.yellow";
  } else if (templateToAttachTo.distance !== null && templateToAttachTo.distance <= 40) {
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
      .attachTo(templateToAttachTo, { align: "center", edge: "inner", offset: { x: adjustedOffsetX, y: 0 } })
      .stretchTo(templateToAttachTo, { offset: { x: adjustedOffsetX * -1, y: 0 } })
      .persist()
      .loopOptions({loopDelay: 0, loops: 3600, endOnLastLoop: false})
    .play()
}

async function animateRingNew(location: Point, aboveTemplate: MeasuredTemplateDocument, 
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
      .loopOptions({loopDelay: 0, loops: 3600, endOnLastLoop: false})
    .sound()
      .volume(0.5)
      .file(REMAININGSOUNDS)
      .fadeOutAudio(500)
      .playIf(remainingSoundsExists)
    .play()
}