import { CrosshairUpdatable, CustomTemplateData } from "../types.ts";
import { delay } from "../utils.ts";

//TODO: investigate removing tokens that are too central for the circle template
let adjustedOffsetX: number;
let adjustedOffsetY: number;

const CASTSOUND = "sound/BG2-Sounds/sim_pulsfire.wav"
const BOLTSOUNDS = "sound/NWN2-Sounds/sim_explflame.WAV"
const FIRESPREADSOUND = "sound/NWN2-Sounds/sff_firewhoosh02.WAV"
const REMAININGSOUNDS = "sound/NWN2-Sounds/al_cv_firesmldr1.WAV"

export async function startWallOfFire(token: Token) {
  await chooseWallOfFireShape(token);
}

async function chooseWallOfFireShape(token: Token) {

  const dialog = new Dialog({
    title: "Wall of Fire Shape",
    buttons: {
      line: {
        label: "Line up to 60 ft long",
        callback: () => wallOfFireLine(token)
      },
      ring: {
        label: "5ft thick, 10ft radius ring",
        callback: () => wallOfFireRing(token)
      }
    }
  })
  dialog.render(true);
}

async function wallOfFireLine(token: Token) {
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

  const myTemplateDocument = await createRayTemplateDocument(firstLocation, secondLocation);
  if (!myTemplateDocument) {
    return;
  }
  const myTemplate = await createTemplate(myTemplateDocument);
  await delay(500);
  await animateSpellCasting(token);
  await animateCastingLine(token, firstLocation, secondLocation);
  await animateLine(myTemplate);
}

async function wallOfFireRing(token: Token) {
  const firstLocation = await selectCentrePoint(token);
  if (firstLocation === false) {
    ui.notifications.info("Wall of fire cancelled.");
    return;
  }
  const myTemplateDocument = await createRingTemplateDocument(firstLocation);
  const myTemplate = await createTemplate(myTemplateDocument);
  await delay(500);
  await animateSpellCasting(token);
  await animateRing(myTemplate);
  //remove tokens that are too central
}

async function selectCentrePoint(token: Token): Promise<Point | false> {
  const centrePoint = await Sequencer.Crosshair.show({
    //@ts-expect-error: parameters are not all required
    location: {
      obj: token,
      limitMaxRange: 120,
      wallBehavior: Sequencer.Crosshair.PLACEMENT_RESTRICTIONS.NO_COLLIDABLES,
    },
    //@ts-expect-error: parameters are not all required
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
    }
  });
  return centrePoint;
}

async function selectStartingPoint(token: Token): Promise<Point | false> {
  const startingPointTemplate = await Sequencer.Crosshair.show({
    //@ts-expect-error: parameters are not all required
    location: {
      obj: token,
      limitMaxRange: 120,
      wallBehavior: Sequencer.Crosshair.PLACEMENT_RESTRICTIONS.NO_COLLIDABLES
    },
    //@ts-expect-error: parameters are not all required
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
    }
  });

  return startingPointTemplate;
}

async function selectEndPoint(startingPoint: Point): Promise<Point | false> {
  const endPointTemplate = await Sequencer.Crosshair.show({
    //@ts-expect-error: parameters are not all required
    location: {
      obj: startingPoint,
      limitMaxRange: 60,
      wallBehavior: Sequencer.Crosshair.PLACEMENT_RESTRICTIONS.NO_COLLIDABLES
    },
    //@ts-expect-error: parameters are not all required
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
    }
  });

  return endPointTemplate;
}

async function createRingTemplateDocument(location: Point) {
  const templateData : CustomTemplateData = {
    t: "circle",
    x: location.x,
    y: location.y,
    width: 0,
    distance: 10,
    direction: 0,
    fillColor: "#f59042",
    borderColor: "#f59042",
  };

  return templateData;
}

async function createRayTemplateDocument(location1: Point, location2: Point): Promise<CustomTemplateData | null> {

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

  const templateData : CustomTemplateData = {
    t: "ray",
    x: location1.x + adjustedOffsetX,
    y: location1.y + adjustedOffsetY,
    width: 5,
    distance: foundryDistance + 5,
    direction: distanceAndAngle.normalizedAngleDegrees,
    fillColor: "#f59042",
    borderColor: "#f59042",
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

async function fileExistsAtPath(path: string | URL | Request) {

  try {
    const response = await fetch(path, { method: 'HEAD' });
    return response.ok; // Returns true if status code is 200-299, false otherwise
  } catch (error) {
    console.log("File not found at: " + path)
    return false;
  }
}

async function animateSpellCasting(token: Token) {
  
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

async function animateCastingLine(token: Token, location1: Point, location2: Point) {

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

async function animateRing(templateToAttachTo: MeasuredTemplateDocument) {

const fireSpreadSoundExists = await fileExistsAtPath(FIRESPREADSOUND);
const remainingSoundsExists = await fileExistsAtPath(REMAININGSOUNDS);

  await new Sequence()
    .effect()
      .atLocation(templateToAttachTo)
      .scale(1.3)
      .file("jb2a.impact.fire.01.orange.0")
    .sound()
      .volume(0.5)
      .file(FIRESPREADSOUND)
      .fadeOutAudio(500)
      .playIf(fireSpreadSoundExists)
    .effect()
      .file("jb2a.wall_of_fire.ring.yellow")
      .attachTo(templateToAttachTo)
      .fadeIn(500)
      .rotateIn(520, 2300, { ease: "easeOutQuint" })
      .scale(1.15)
      .scaleIn(0, 1000, { ease: "easeOutBack" })
      .persist()
      .loopOptions({loopDelay: 0, loops: 3600, endOnLastLoop: false})
    .sound()
      .volume(0.5)
      .file(REMAININGSOUNDS)
      .fadeOutAudio(500)
      .playIf(remainingSoundsExists)
    .play()
}