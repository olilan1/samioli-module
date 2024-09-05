/* {"name":"Tumble Through","img":"systems/pf2e/icons/actions/OneAction.webp","_id":"bi7E2x7B4J7UQAuT"} */

const [tokenD] = await pf2eAnimations.macroHelpers(args)
let targetTokens = Array.from(game.user.targets)
if (targetTokens.length === 0) return;

let originalTokenPositionX = tokenD.document.x;
let originalTokenPositionY = tokenD.document.y;
let targetPositionX = targetTokens[0].document.x;
let targetPositionY = targetTokens[0].document.y;
let targetHeight = targetTokens[0].document.height;
let targetLocationBuffer = 50;

let x = targetPositionX - originalTokenPositionX
let y = targetPositionY - originalTokenPositionY
let rotationValue =  720
let animationTime = 4000

console.log(targetTokens[0]);

if (x < 0) {
    rotationValue = rotationValue * -1
}

console.log("height: " + targetHeight);

for (let i = 1; i < targetHeight; i++) {
    x = x + targetLocationBuffer;
    y = y + targetLocationBuffer;
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

let wooshSound1 = "sound/NWN2-Sounds/cb_sw_unarmed04.WAV";
let wooshSound2 = "sound/NWN2-Sounds/cb_sw_unarmed01.WAV";
let wooshSound3 = "sound/NWN2-Sounds/cb_sw_unarmed03.WAV";
let wooshSound4 = "sound/NWN2-Sounds/cb_sw_unarmed1.WAV";
let wooshSound5 = "sound/NWN2-Sounds/cb_sw_unarmed2.WAV";
let wooshSound6 = "sound/NWN2-Sounds/cb_sw_unarmed02.WAV";

let sequence = new Sequence({moduleName: "PF2e Animations", softFail: true})
    
    .animation()
        .on(tokenD)
        .opacity(0)
        .fadeIn(200)
        .duration(animationTime)
    .sound()
        .file(wooshSound1, true, true)
        .delay(500)
        .fadeOutAudio(200)
        .playIf(() => {
            return fileExistsAtPath(wooshSound1);
        })
    .sound()
        .file(wooshSound2, true, true)
        .delay(900)
        .fadeOutAudio(200)
        .playIf(() => {
            return fileExistsAtPath(wooshSound2);
        })
    .sound()
        .file(wooshSound3, true, true)
        .delay(1300)
        .fadeOutAudio(200)
        .playIf(() => {
            return fileExistsAtPath(wooshSound3);
        })
    .sound()
        .file(wooshSound4, true, true)
        .delay(2700)
        .fadeOutAudio(200)
        .playIf(() => {
            return fileExistsAtPath(wooshSound4);
        })
    .sound()
        .file(wooshSound5, true, true)
        .delay(3100)
        .fadeOutAudio(200)
        .playIf(() => {
            return fileExistsAtPath(wooshSound5);
        })
    .sound()
        .file(wooshSound6, true, true)
        .delay(3500)
        .fadeOutAudio(200)
        .playIf(() => {
            return fileExistsAtPath(wooshSound6);
        })
    .effect()
        .file("jb2a.smoke.puff.side.02.white.0", true)
        .atLocation(tokenD)
        .rotateTowards(targetTokens[0], {rotationOffset: 180})
        .scale(0.7)
        .delay(600)
        .fadeIn(100)
        .opacity(0.3)
        .fadeOut(200)
    .effect()
        .file("jb2a.smoke.puff.ring.01.white.0", true)
        .atLocation(targetTokens[0])
        .scaleToObject(2.2)
        .zIndex(1000)
        .delay(1000)
        .fadeIn(100)
        .opacity(0.3)
        .fadeOut(200)
    .effect()
        .file("jb2a.smoke.puff.ring.01.white.1", true)
        .atLocation(tokenD)
        .belowTokens()
        .scale(0.7)
        .delay(3800)
        .fadeIn(100)
        .opacity(0.2)
        .fadeOut(200)
    .effect()
        .from(tokenD)
        .loopProperty("sprite", "rotation", {
            values: [0, rotationValue],
            duration: animationTime/2,
            pingPong: true,
            ease: "easeInOutCirc"
        })
        .loopProperty("sprite", "position.x", {
            values: [0, x, 0],
            duration: animationTime/2, 
            pingPong: true,
            gridUnits: false,
            ease: "easeInOutBack"
        })
        .loopProperty("sprite", "position.y", {
            values: [0, y, 0],
            duration: animationTime/2, 
            pingPong: true,
            gridUnits: false,
            ease: "easeInOutBack"
        })
        .duration(animationTime)
        .waitUntilFinished(-195)
    .animation()
        .on(tokenD)
        .opacity(1)
        .fadeIn(200)
        .duration(250)
sequence.play()