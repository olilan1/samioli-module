/* {"name":"Dive and Breach","img":"systems/pf2e/icons/spells/dive-and-breach.webp","_id":"9z7488y7mXDuKBXU"} */

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
const emptyTargetArray = [];

const controlledTokens = game.user.getActiveTokens();
if (controlledTokens.length === 1) {
  const caster = controlledTokens[0];

  offset = game.canvas.scene.grid.size/2;

  casterXwithOffset = caster.x + offset;
  casterYwithOffset = caster.y + offset;

  await clearUserTargets();
  await selectFirstTemplateLocation();
  await selectSecondTemplateLocation();
  await selectThirdTemplateLocation();
  await clearTemplates();
  await doAnimation(caster);
  await addTargetsToUser(caster);

} else if (controlledTokens.length > 1) {
  ui.notifications.warn("Please select only a single token");
} else {
  ui.notifications.warn("No tokens selected.");
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

  myTemplate = await MeasuredTemplateDocument.create(templateData, { parent: canvas.scene });
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

async function addTargetsToUser(user) {
  console.log("users current targets:")
  console.log(game.user.targets)
  let targetIds = Array.from(targets).map(token => token.document._id);
  //add some logic to check that the player isn't included
  targetIds = targetIds.filter(targetIds => targetIds !== user.actorId);
  await game.user.updateTokenTargets(targetIds);
  console.log("users updated targets:")
  console.log(game.user.targets)  
}

async function clearUserTargets() {
  await game.user.clearTargets();
  console.log("Targets have been cleared")
  await delay(200);
  console.log(game.user.targets);
}

async function doAnimation(token) {

  //clear targets for the animation
  await clearUserTargets();
  console.log("game.user.targets after clearUserTargets():");  
  console.log(game.user.targets);
  let rotation

  if (token.x > firstLocationSequencer.x) {
      rotation = 220
  } else if (token.x == firstLocationSequencer.x) {
      rotation = 180
  } else {
      rotation = 140
  }

  await new Sequence()
    //cast spell sound
    .sound()
      .volume(0.7)
      .file("sound/BG2-Sounds/sim_pulswater.wav", true, true)  
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
      .file("sound/NWN2-Sounds/pl_splash_idle01.WAV", true, true)
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
      .file("sound/NWN2-Sounds/pl_splash_idle02.WAV", true, true)
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