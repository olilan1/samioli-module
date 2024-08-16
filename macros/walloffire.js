/* {"name":"Wall of Fire","img":"systems/pf2e/icons/spells/wall-of-fire.webp","_id":"t0dtf3WjzeEI1Lhz"} */

//TODO: investigate removing tokens that are too central for the circle template

let casterXwithOffset;
let casterYwithOffset;
let offset;
let adjustedOffsetX;
let adjustedOffsetY;

let castSound = "sound/BG2-Sounds/sim_pulsfire.wav"
let boltSound = "sound/NWN2-Sounds/sim_explflame.WAV"
let fireSpreadSound ="sound/NWN2-Sounds/sff_firewhoosh02.WAV"
let remainingSound = "sound/NWN2-Sounds/al_cv_firesmldr1.WAV"

export async function startWallOfFire(tokenId) {

    const token = canvas.tokens.placeables.find(t => t.id === tokenId);

    if (token) {
      offset = game.canvas.scene.grid.size/2;

      casterXwithOffset = token.document.x + offset;
      casterYwithOffset = token.document.y + offset;
  
      await chooseWallOfFireShape(token);

    } else {
      console.error("Token not found with ID:", tokenId);
      return
    }
}

async function chooseWallOfFireShape(token) {
    let shapeChoice;
  
    new Dialog({
      title: "Wall of Fire Shape",
      buttons: {
        line: {
          label: "Line up to 60 ft long",
          callback: () => shapeChoice = "line"
        },
        ring: {
          label: "5ft thick, 10ft radius ring",
          callback: () => shapeChoice = "ring"
        }
      },
      close: (html) => {
        if (shapeChoice === "line") {
          wallOfFireLine(token);
        } else if (shapeChoice === "ring") {
          wallOfFireRing(token);
        }
      }
    }).render(true);
}

async function wallOfFireLine(caster) {
    let firstLocation = await selectStartingPoint();
    let secondLocation = await selectEndPoint(firstLocation);
    let myTemplateDocument = await createRayTemplateDocument(firstLocation, secondLocation);
    let myTemplate = await createTemplate(myTemplateDocument);
    await delay(500);
    await animateSpellCasting(caster);
    await animateCastingLine(caster, firstLocation, secondLocation);
    await animateLine(myTemplate);
}

async function wallOfFireRing(caster) {
    let firstLocation = await selectCentrePoint();
    let myTemplateDocument = await createRingTemplateDocument(firstLocation);
    let myTemplate = await createTemplate(myTemplateDocument);
    await delay(500);
    await animateSpellCasting(caster);
    await animateRing(caster, myTemplate);
    //remove tokens that are too central
}

async function selectCentrePoint() {
    const portal = new Portal()
      .color("#f59042")
      .size(22)
      .origin({ x: casterXwithOffset, y: casterYwithOffset })
      .range(120);
    let centrePoint = await portal.pick();
    return centrePoint;
  }

async function selectStartingPoint() {
  const portal = new Portal()
    .color("#f59042")
    .size(5)
    .texture("systems/pf2e/icons/spells/wall-of-fire.webp")
    .origin({ x: casterXwithOffset, y: casterYwithOffset })
    .range(120);
  let startingPoint = await portal.pick();
  return startingPoint;
}

async function selectEndPoint(startingPoint) {
  const portal = new Portal()
    .color("#f59042")
    .size(5)
    .texture("systems/pf2e/icons/spells/wall-of-fire.webp")
    .origin(startingPoint)
    .range(60);
  let endPoint = await portal.pick();
  return endPoint;
}

async function createRingTemplateDocument(location){
    let templateData = {
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

async function createRayTemplateDocument(location1, location2) {

  let distanceAndAngle = calculateDistanceAndAngle(location1, location2);
  let foundryDistance = translateDistanceIntoFoundry(distanceAndAngle.distance);

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

  let templateData = {
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

async function createTemplate(templateData) {

  let myCustomTemplate = await MeasuredTemplateDocument.create(templateData, { parent: canvas.scene });

  return myCustomTemplate;
}

function translateDistanceIntoFoundry(distance) {
    let distanceInFeet = distance * (game.canvas.scene.grid.distance / game.canvas.scene.grid.size)
    let foundryDistance = Math.ceil(distanceInFeet / 5) * 5;
    return foundryDistance;
}

function calculateDistanceAndAngle(location1, location2) {
    // Calculate differences in x and y coordinates
    const dx = location2.x - location1.x;
    const dy = location2.y - location1.y;

    // Calculate distance using the Pythagorean theorem
    const distance = Math.hypot(dx, dy);

    // Calculate angle in radians using atan2
    let angleRadians = Math.atan2(dy, dx);

    // Convert to degrees if needed
    const angleDegrees = (angleRadians * 180) / Math.PI; 

    // Normalize angle to 0-360 degrees (optional)
    const normalizedAngleDegrees = (angleDegrees + 360) % 360;

    return { distance, normalizedAngleDegrees };
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fileExistsAtPath(path) {
    
  try {
    const response = await fetch(path, { method: 'HEAD' });
    return response.ok; // Returns true if status code is 200-299, false otherwise
  } catch (error) {
    console.log("File not found at: " + path)
    return false; 
  }
}

async function animateSpellCasting(token) {
    await new Sequence({ moduleName: "PF2e Animations", softFail: true })
    .sound()
        .volume(0.5)
        .file(castSound, true, true)
        .playIf(() => {
            return fileExistsAtPath(castSound);})
    .effect()
        .atLocation(token)
        .file("jb2a.cast_generic.fire.01.orange.0")
        .waitUntilFinished(-1300)
    .play()
}

async function animateCastingLine(token, location1, location2) {

    let distanceMeasuredBolt = translateDistanceIntoFoundry(calculateDistanceAndAngle(token, location1).distance);

    let boltOfFireAnim;

    if (distanceMeasuredBolt < 10) {
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
    
    let distanceMeasuredJet = translateDistanceIntoFoundry(calculateDistanceAndAngle(location1, location2).distance);

    let fireJetAnim;

    if (distanceMeasuredJet < 25) {
        fireJetAnim = "jb2a.fire_jet.orange.15ft";
    } else {
        fireJetAnim = "jb2a.fire_jet.orange.30ft";
    }

    await new Sequence({ moduleName: "PF2e Animations", softFail: true })
    .sound()
        .volume(0.5)
        .file(boltSound, true, true)
        .playIf(() => {
            return fileExistsAtPath(fireSpreadSound);   
        })
    .effect()
        .atLocation(token)
        .file(boltOfFireAnim)
        .stretchTo({ x: location1.x + adjustedOffsetX, y: location1.y + adjustedOffsetY})
        .waitUntilFinished(-1100)
    .sound()
        .volume(0.5)
        .file(fireSpreadSound, true, true)
        .playIf(() => {
          return fileExistsAtPath(fireSpreadSound);
        })
    .effect()
        .file(fireJetAnim)
        .atLocation({ x: location1.x + adjustedOffsetX, y: location1.y + adjustedOffsetY})
        .stretchTo({ x: location2.x + ((adjustedOffsetX * -1) * 2), y: location2.y + ((adjustedOffsetY * -1) * 2)})
        .scale({ x: 1.0, y: 3 })
        .fadeIn(100)
        .startTime(400)
        .fadeOut(200)
        .endTime(2200)
        .waitUntilFinished(-400)
    .play()
}

async function animateLine(templateToAttachTo) {
    
    let wallOfFireAnim;

    if (templateToAttachTo.distance <= 20) {
        wallOfFireAnim = "jb2a.wall_of_fire.100x100.yellow";
    } else if (templateToAttachTo.distance <= 40) {
        wallOfFireAnim = "jb2a.wall_of_fire.200x100.yellow";
    } else {
        wallOfFireAnim = "jb2a.wall_of_fire.300x100.yellow";
    }

    await new Sequence({ moduleName: "PF2e Animations", softFail: true })
    .sound()
    .volume(0.5)
    .file(remainingSound, true, true)
    .fadeOutAudio(1000)
    .playIf(() => {
      return fileExistsAtPath(remainingSound);
    })
    .effect()
        .file(wallOfFireAnim)
        .fadeIn(300)
        .attachTo(templateToAttachTo, {align: "center", edge: "on", offset: { x : adjustedOffsetX, y : 0 }})
        .stretchTo(templateToAttachTo, {offset: { x : adjustedOffsetX * -1 , y : 0 }})
        .persist()
        .loopOptions({ loops: 3600 })

    .play()
}

async function animateRing(token, templateToAttachTo) {

    await new Sequence({ moduleName: "PF2e Animations", softFail: true })
    .effect()
        .atLocation(templateToAttachTo)
        .scale(1.3)
        .file("jb2a.impact.fire.01.orange.0")
    .sound()
        .volume(0.5)
        .file(fireSpreadSound, true, true)
        .fadeOutAudio(500)
        .playIf(() => {
          return fileExistsAtPath(fireSpreadSound);
      }) 
    .effect()
        .file("jb2a.wall_of_fire.ring.yellow")
        .attachTo(templateToAttachTo)
        .fadeIn(500)
        .rotateIn(520, 2300, {ease: "easeOutQuint"})
        .scale(1.15)
        .scaleIn(0, 1000, {ease: "easeOutBack"})
        .persist()
        .loopOptions({ loops: 3600 })
    .sound()
        .volume(0.5)
        .file(remainingSound, true, true)
        .fadeOutAudio(500)
        .playIf(() => {
           return fileExistsAtPath(remainingSound);
      })  
    .play()
}