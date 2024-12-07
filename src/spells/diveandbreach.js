
let offset;
let casterXwithOffset;
let casterYwithOffset;
let firstLocation;
let secondLocation;
let thirdLocation;
let firstLocationSequencer;
let secondLocationSequencer;
let thirdLocationSequencer;
let targets = new Set();
let myTemplates = new Set();

export async function startDiveAndBreach(tokenId) {
  const TOKEN = canvas.tokens.placeables.find(t => t.id === tokenId);

  offset = game.canvas.scene.grid.size/2;

  casterXwithOffset = TOKEN.x + offset;
  casterYwithOffset = TOKEN.y + offset;

  await clearUserTargets();
  ui.notifications.info("Select a dive location within 10 feet!"); 
  await selectFirstTemplateLocation();
  ui.notifications.info("Select a breach location within 40 feet."); 
  await selectSecondTemplateLocation();
  ui.notifications.info("Select a landing location within 10 feet."); 
  await selectThirdTemplateLocation();
  await clearTemplates();
  await doAnimation(TOKEN);
  await addTargetsToUser(TOKEN);

}

async function clearTemplates() {
    await delay(200);

    myTemplates.forEach(template => {
        template.delete();
    })
    await delay(200);
}

async function portalLocationToSequencer(portalLocation) {
  let updatedPortalLocation = Object.assign({}, portalLocation);

  updatedPortalLocation.x = portalLocation.x - offset;
  updatedPortalLocation.y = portalLocation.y - offset;

  return updatedPortalLocation;
}

async function selectFirstTemplateLocation() {
  const portal = new Portal()
    .color("#80b3ce")
    .size(15)
    .origin({ x: casterXwithOffset, y: casterYwithOffset })
    .range(12);
  firstLocation = await portal.pick();
  firstLocationSequencer = await portalLocationToSequencer(firstLocation);
  createTemplate(firstLocation);
}

async function selectSecondTemplateLocation() {
  const portal = new Portal()
    .color("#80b3ce")
    .size(15)
    .origin(firstLocation)
    .range(42);
  secondLocation = await portal.pick();
  secondLocationSequencer = await portalLocationToSequencer(secondLocation);
  await createTemplate(secondLocation);
}

async function selectThirdTemplateLocation() {
  const portal = new Portal()
    .color("#80b3ce")
    .size(5)
    .origin(secondLocation)
    .range(12);
  thirdLocation = await portal.pick();
  thirdLocationSequencer = await portalLocationToSequencer(thirdLocation);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function createTemplate(atLocation) {
  let templateData = {
    t: "circle",
    x: atLocation.x,
    y: atLocation.y,
    sort: 99,
    distance: 5,
    direction: 0,
    fillColor: "#000000",
    borderColor: "#000000",
  };

  let myTemplate = await MeasuredTemplateDocument.create(templateData, { parent: canvas.scene });
  await delay(100);

  myTemplates.add(myTemplate);

  await captureTargets();
}

async function captureTargets() {
  if (game.user.targets.size > 0) {
    game.user.targets.forEach(token => {
      targets.add(token);
    });
  }
}

async function addTargetsToUser(player) {
  let targetIds = Array.from(targets).map(token => token.document._id);
  targetIds = targetIds.filter(targetIds => targetIds !== player._id);
  await game.user.updateTokenTargets(targetIds);
}

async function clearUserTargets() {
  await game.user.clearTargets();
  await delay(200);
}

async function doAnimation(token) {

  //clear targets for the animation
  await clearUserTargets();
  let rotation

  if (token.x > firstLocationSequencer.x) {
      rotation = 220
  } else if (token.x == firstLocationSequencer.x) {
      rotation = 180
  } else {
      rotation = 140
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
  
  const spellSound = "sound/BG2-Sounds/sim_pulswater.wav"
  const entrySplashSound = "sound/NWN2-Sounds/pl_splash_idle01.WAV"
  const exitSplashSound ="sound/NWN2-Sounds/pl_splash_idle02.WAV"

  await new Sequence()
    //cast spell sound
    .sound()
      .volume(0.7)
      .file(spellSound, true, true)
      .playIf(() => {
        return fileExistsAtPath(spellSound);
    })
    //cast spell animation
    .effect()
      .atLocation(token)
      .file("jb2a.cast_generic.water.02.blue")
      .belowTokens()
      .scale(1.1)
      .endTime(1200)
      .fadeIn(250)
      .fadeOut(250)
      .waitUntilFinished()
    //initial leap
    .animation()
      .on(token)
      .rotateIn(rotation, 500, { delay: 250 })
      .moveTowards(firstLocationSequencer, { ease: "easeInBack" })
      .duration(1000)
      .waitUntilFinished(0)
    //hide token on landing
    .animation()
      .on(token)
      .opacity(0)
    //entry splash sound
    .sound()
      .volume(0.5)
      .file(entrySplashSound, true, true)
      .playIf(() => {
        return fileExistsAtPath(entrySplashSound);
    })
    //entry splash effect
    .effect()
      .atLocation(firstLocation)
      .file("jb2a.liquid.splash.blue")
      .randomRotation()
      .scale(1.5)
      .waitUntilFinished(0)
    //exit splash sound
    .sound()
      .volume(0.5)
      .file(exitSplashSound, true, true)
      .playIf(() => {
        return fileExistsAtPath(exitSplashSound);
    })
    //exit splash
    .effect()
      .atLocation(secondLocation)
      .file("jb2a.liquid.splash.blue")
      .randomRotation()
      .scale(1.5)
      .waitUntilFinished(-3400)
    //teleport to next location and make visible
    .animation()
      .on(token)
      .rotate(0)
      .teleportTo(secondLocationSequencer)
      .opacity(1)
    //final leap to last location
    .animation()
      .on(token)
      .duration(500)
      .moveTowards(thirdLocationSequencer, { ease: "easeOutExpo" })
    .play();
}
