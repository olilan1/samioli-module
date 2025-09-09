import { ChatMessagePF2e, TokenPF2e } from "foundry-pf2e";
import { checkIfProvidesPanache } from "../effects/panache.ts";
import { delay, logd } from "../utils.ts";

const wooshSound1 = "sound/NWN2-Sounds/cb_sw_unarmed04.WAV";
const wooshSound2 = "sound/NWN2-Sounds/cb_sw_unarmed01.WAV";
const wooshSound3 = "sound/NWN2-Sounds/cb_sw_unarmed03.WAV";
const wooshSound4 = "sound/NWN2-Sounds/cb_sw_unarmed1.WAV";
const wooshSound5 = "sound/NWN2-Sounds/cb_sw_unarmed2.WAV";
const wooshSound6 = "sound/NWN2-Sounds/cb_sw_unarmed02.WAV";
const deflectSound = "sound/NWN2-Sounds/bf_med_flesh.WAV";
const landSound = "sound/NWN2-Sounds/it_genericmedium.WAV";
const puffSideAnimation = "jb2a.smoke.puff.side.02.white.0";
const puffRingAnimation1 = "jb2a.smoke.puff.ring.01.white.0";
const puffRingAnimation2 = "jb2a.smoke.puff.ring.01.white.1";
const impactAnimation = "jb2a.impact.008.orange";

export async function startTumbleThrough(chatMessage: ChatMessagePF2e) {

    //check if the skill check was for a tumblethrough
    const messageOptions = chatMessage.flags.pf2e.context?.options;
    if (!messageOptions?.includes("action:tumble-through")) {
        return;
    }

    //set up for the animations
    const token = chatMessage.token?.object;

    const targetTokens = Array.from(game.user.targets)
    if (targetTokens.length === 0 || !token) return;
    const target = targetTokens[0];

    const originalTokenPositionX = token.x;
    const originalTokenPositionY = token.y;
    const targetPositionX = target.document.x;
    const targetPositionY = target.document.y;
    const targetHeight = target.document.height;
    if (!canvas.scene){
        return;
    }
    const targetLocationBuffer = canvas.scene.grid.size/2;

    let x = targetPositionX - originalTokenPositionX
    let y = targetPositionY - originalTokenPositionY

    for (let i = 1; i < targetHeight; i++) {
        x = x + targetLocationBuffer;
        y = y + targetLocationBuffer;
    }

    const rotationValue = (x < 0) ? -720 : 720
    const context = chatMessage.flags.pf2e.context;

    //check if the skillroll was successful
    if (context?.outcome === "criticalSuccess"|| context?.outcome === "success") {

        await animateSuccessfulTumble(token, target, rotationValue, x, y);

        checkIfProvidesPanache(chatMessage);

    } else if (chatMessage.flags.pf2e.context?.outcome === "criticalFailure" 
    || chatMessage.flags.pf2e.context?.outcome === "failure") {

        await animateFailureTumble(x, y, token, target, rotationValue, originalTokenPositionX, originalTokenPositionY);

        checkIfProvidesPanache(chatMessage);

    } else {
        logd(`did you target anyone? ${chatMessage.flags.pf2e.context?.outcome}`)
    }
}

async function animateFailureTumble(x: number, y: number, token: TokenPF2e, target: TokenPF2e, 
    rotationValue: number, originalTokenPositionX: number, originalTokenPositionY: number) {
    
    const fallDownX = (x / 2);
    const fallDownY = (y / 2);

    const rollOutAnimTime = 2000;
    const knockedBackAnimTime = 1000;
    const flatOnFloorTime = 2000;
    
    const fallFlatAngle = (x < 0) ? 90 : -90;
    
    const sequence = new Sequence()
        .animation()
            .on(token)
            .opacity(0)
            .fadeIn(200)
            .duration(rollOutAnimTime + knockedBackAnimTime)
        .effect()
            .file(puffSideAnimation)
            .atLocation(token)
            .rotateTowards(target, { rotationOffset: 180 })
            .scale(0.7)
            .delay(rollOutAnimTime / 2.2)
            .fadeIn(100)
            .opacity(0.3)
            .fadeOut(200)
        .sound()
            .file(wooshSound1)
            .delay(rollOutAnimTime / 2.2)
            .fadeOutAudio(200)
        .sound()
            .file(wooshSound2)
            .delay(rollOutAnimTime / 1.5)
            .fadeOutAudio(200)
            .sound()
            .file(wooshSound3)
            .delay(rollOutAnimTime / 1.1)
            .fadeOutAudio(200)
        .effect()
            .copySprite(token)
            .animateProperty("sprite", "position.x", { from: 0, to: x, duration: rollOutAnimTime, ease: "easeInBack" })
            .animateProperty("sprite", "position.y", { from: 0, to: y, duration: rollOutAnimTime, ease: "easeInBack" })
            .animateProperty("sprite", "rotation", { from: 0, to: rotationValue, duration: rollOutAnimTime, ease: "easeInBack" })
            .duration(rollOutAnimTime)
            .zIndex(2)
            .waitUntilFinished(0)
        .effect()
            .file(puffRingAnimation1)
            .atLocation(target)
            .scaleToObject(2.2)
            .zIndex(1000)
            .fadeIn(100)
            .opacity(0.3)
            .fadeOut(200)
        .effect()
        .copySprite(target)
        .loopProperty("sprite", "scale.x", {
            values: [1, 1.3],
            duration: 100,
            pingPong: true,
            ease: "easeInExpo"
        })
        .loopProperty("sprite", "scale.y", {
            values: [1, 1.3],
            duration: 100,
            pingPong: true,
            gridUnits: false,
            ease: "easeInExpo"
        })
        .duration(100)
        .effect()
            .file(impactAnimation)
            .atLocation(target)
            .scaleToObject(3)
            .zIndex(1000)
            .sound()
            .file(deflectSound)
            .fadeOutAudio(200)
        .effect()
            .copySprite(token)
            .animateProperty("sprite", "position.x", { from: x, to: fallDownX, duration: knockedBackAnimTime, ease: "easeOutQuint" })
            .animateProperty("sprite", "position.y", { from: y, to: fallDownY, duration: knockedBackAnimTime, ease: "easeOutQuint" })
            .animateProperty("sprite", "rotation", { from: 0, to: fallFlatAngle, duration: knockedBackAnimTime, ease: "easeOutQuint" })
            .duration(knockedBackAnimTime + flatOnFloorTime)
            .zIndex(2)
            .fadeOut(500)
        .effect()
            .file(puffRingAnimation2)
            .atLocation({ x: originalTokenPositionX + (canvas.grid.size / 2) + fallDownX, y: originalTokenPositionY + (canvas.grid.size / 2) + fallDownY })
            .scale(0.8)
            .fadeIn(100)
            .opacity(0.5)
            .fadeOut(200)
            .zIndex(1)
            .delay(knockedBackAnimTime - 500)
        .sound()
            .file(landSound)
            .delay(knockedBackAnimTime - 500)
        .animation()
            .on(token)
            .delay(knockedBackAnimTime + flatOnFloorTime)
            .opacity(1)
            .fadeIn(500);
    sequence.play();
    await delay(rollOutAnimTime + flatOnFloorTime + knockedBackAnimTime);
}

async function animateSuccessfulTumble(token: TokenPF2e, target: TokenPF2e, rotationValue: number, x: number, y: number) {
    const animationTime = 4000;

    const sequence = new Sequence()

        .effect()
            .copySprite(token)
            .duration(500)
            .waitUntilFinished(-450)
        .animation()
            .on(token)
            .opacity(0)
            .fadeIn(200)
            .duration(animationTime)
        .sound()
            .file(wooshSound1)
            .delay(500)
            .fadeOutAudio(200)
        .sound()
            .file(wooshSound2)
            .delay(900)
            .fadeOutAudio(200)
        .sound()
            .file(wooshSound3)
            .delay(1300)
            .fadeOutAudio(200)
        .sound()
            .file(wooshSound4)
            .delay(2700)
            .fadeOutAudio(200)
        .sound()
            .file(wooshSound5)
            .delay(3100)
            .fadeOutAudio(200)
        .sound()
            .file(wooshSound6)
            .delay(3500)
            .fadeOutAudio(200)
        .effect()
            .file(puffSideAnimation)
            .atLocation(token)
            .rotateTowards(target, { rotationOffset: 180 })
            .scale(0.7)
            .delay(600)
            .fadeIn(100)
            .opacity(0.3)
            .fadeOut(200)
        .effect()
            .file(puffRingAnimation1)
            .atLocation(target)
            .scaleToObject(2.2)
            .zIndex(1000)
            .delay(1000)
            .fadeIn(100)
            .opacity(0.3)
            .fadeOut(200)
        .effect()
            .file(puffRingAnimation2)
            .atLocation(token)
            .belowTokens()
            .scale(0.7)
            .delay(3800)
            .fadeIn(100)
            .opacity(0.2)
            .fadeOut(200)
        .effect()
            .copySprite(token)
            .loopProperty("sprite", "rotation", {
                values: [0, rotationValue],
                duration: animationTime / 2,
                pingPong: true,
                ease: "easeInOutCirc"
            })
            .loopProperty("sprite", "position.x", {
                values: [0, x, 0],
                duration: animationTime / 2,
                pingPong: true,
                gridUnits: false,
                ease: "easeInOutBack"
            })
            .loopProperty("sprite", "position.y", {
                values: [0, y, 0],
                duration: animationTime / 2,
                pingPong: true,
                gridUnits: false,
                ease: "easeInOutBack"
            })
            .duration(animationTime)
            .waitUntilFinished(-250)
        .animation()
            .on(token)
            .opacity(1)
            .fadeIn(200)
            .duration(250);
    sequence.play();
    await delay(animationTime);
}