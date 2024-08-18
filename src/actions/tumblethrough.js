const WOOSH_SOUND_1 = "sound/NWN2-Sounds/cb_sw_unarmed04.WAV";
const WOOSH_SOUND_2 = "sound/NWN2-Sounds/cb_sw_unarmed01.WAV";
const WOOSH_SOUND_3 = "sound/NWN2-Sounds/cb_sw_unarmed03.WAV";
const WOOSH_SOUND_4 = "sound/NWN2-Sounds/cb_sw_unarmed1.WAV";
const WOOSH_SOUND_5 = "sound/NWN2-Sounds/cb_sw_unarmed2.WAV";
const WOOSH_SOUND_6 = "sound/NWN2-Sounds/cb_sw_unarmed02.WAV";
const DEFLECT_SOUND = "sound/NWN2-Sounds/bf_med_flesh.WAV";
const LAND_SOUND = "sound/NWN2-Sounds/it_genericmedium.WAV";

export async function startTumbleThrough(ChatMessagePF2e) {
    
    //first check if the message is eligible
    if (!checkIfASkillCheck(ChatMessagePF2e)){
    } else {
        //check if the skill check was for a tumblethrough
        if (!ChatMessagePF2e.flags.pf2e.context.options.includes("action:tumble-through")) {
            return
    
        } else {
    
            //set up for the animations
            const tokenId = ChatMessagePF2e.speaker.token;
            const token = canvas.tokens.placeables.find(t => t.id === tokenId);
    
            const targetTokens = Array.from(game.user.targets)
            if (targetTokens.length === 0) return;
    
            const originalTokenPositionX = token.document.x;
            const OriginalTokenPositionY = token.document.y;
            const targetPositionX = targetTokens[0].document.x;
            const targetPositionY = targetTokens[0].document.y;
            const targetHeight = targetTokens[0].document.height;
            const TargetLocationBuffer = game.canvas.scene.grid.size/2;
    
            let x = targetPositionX - originalTokenPositionX
            let y = targetPositionY - OriginalTokenPositionY
    
            for (let i = 1; i < targetHeight; i++) {
                x = x + TargetLocationBuffer;
                y = y + TargetLocationBuffer;
            }

            let rotationValue =  720
            
            if (x < 0) {
                rotationValue = rotationValue * -1
            }

            //check if the skillroll was successful
            if (ChatMessagePF2e.flags.pf2e.context.outcome === "criticalSuccess"
                || ChatMessagePF2e.flags.pf2e.context.outcome === "success") {

                const ANIMATIONTIME = 4000

                let sequence = new Sequence({moduleName: "PF2e Animations", softFail: true})
                
                .animation()
                    .on(token)
                    .opacity(0)
                    .fadeIn(200)
                    .duration(ANIMATIONTIME)
                .sound()
                    .file(WOOSH_SOUND_1, true, true)
                    .delay(500)
                    .fadeOutAudio(200)
                    .playIf(() => {
                        return fileExistsAtPath(WOOSH_SOUND_1);
                    })
                .sound()
                    .file(WOOSH_SOUND_2, true, true)
                    .delay(900)
                    .fadeOutAudio(200)
                    .playIf(() => {
                        return fileExistsAtPath(WOOSH_SOUND_2);
                    })
                .sound()
                    .file(WOOSH_SOUND_3, true, true)
                    .delay(1300)
                    .fadeOutAudio(200)
                    .playIf(() => {
                        return fileExistsAtPath(WOOSH_SOUND_3);
                    })
                .sound()
                    .file(WOOSH_SOUND_4, true, true)
                    .delay(2700)
                    .fadeOutAudio(200)
                    .playIf(() => {
                        return fileExistsAtPath(WOOSH_SOUND_4);
                    })
                .sound()
                    .file(WOOSH_SOUND_5, true, true)
                    .delay(3100)
                    .fadeOutAudio(200)
                    .playIf(() => {
                        return fileExistsAtPath(WOOSH_SOUND_5);
                    })
                .sound()
                    .file(WOOSH_SOUND_6, true, true)
                    .delay(3500)
                    .fadeOutAudio(200)
                    .playIf(() => {
                        return fileExistsAtPath(WOOSH_SOUND_6);
                    })
                .effect()
                    .file("jb2a.smoke.puff.side.02.white.0", true)
                    .atLocation(token)
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
                    .atLocation(token)
                    .belowTokens()
                    .scale(0.7)
                    .delay(3800)
                    .fadeIn(100)
                    .opacity(0.2)
                    .fadeOut(200)
                .effect()
                    .from(token)
                    .loopProperty("sprite", "rotation", {
                        values: [0, rotationValue],
                        duration: ANIMATIONTIME/2,
                        pingPong: true,
                        ease: "easeInOutCirc"
                    })
                    .loopProperty("sprite", "position.x", {
                        values: [0, x, 0],
                        duration: ANIMATIONTIME/2, 
                        pingPong: true,
                        gridUnits: false,
                        ease: "easeInOutBack"
                    })
                    .loopProperty("sprite", "position.y", {
                        values: [0, y, 0],
                        duration: ANIMATIONTIME/2, 
                        pingPong: true,
                        gridUnits: false,
                        ease: "easeInOutBack"
                    })
                    .duration(ANIMATIONTIME)
                    .waitUntilFinished(-195)
                .animation()
                    .on(token)
                    .opacity(1)
                    .fadeIn(200)
                    .duration(250)
            sequence.play()

            } else if (ChatMessagePF2e.flags.pf2e.context.outcome === "criticalFailure" 
            || ChatMessagePF2e.flags.pf2e.context.outcome === "failure") {

                const fallDownX = (x/2)  
                const fallDownY = (y/2)  

                const rollOutAnimTime = 2000
                const knockedBackAnimTime = 1000
                const FlatOnFloorTime = 2000

                let fallFlatAngle = -90

                if (x < 0) {
                    fallFlatAngle = fallFlatAngle * -1
                }

                let sequence = new Sequence({moduleName: "PF2e Animations", softFail: true})
                
                .animation()
                    .on(token)
                    .opacity(0)
                    .fadeIn(200)
                    .duration(rollOutAnimTime + knockedBackAnimTime)
                .effect()
                    .file("jb2a.smoke.puff.side.02.white.0", true)
                    .atLocation(token)
                    .rotateTowards(targetTokens[0], {rotationOffset: 180})
                    .scale(0.7)
                    .delay(rollOutAnimTime / 2.2)
                    .fadeIn(100)
                    .opacity(0.3)
                    .fadeOut(200)
                .sound()
                    .file(WOOSH_SOUND_1, true, true)
                    .delay(rollOutAnimTime / 2.2)
                    .fadeOutAudio(200)
                    .playIf(() => {
                        return fileExistsAtPath(WOOSH_SOUND_1);
                    })
                .sound()
                    .file(WOOSH_SOUND_2, true, true)
                    .delay(rollOutAnimTime / 1.5)
                    .fadeOutAudio(200)
                    .playIf(() => {
                        return fileExistsAtPath(WOOSH_SOUND_2);
                    })
                .sound()
                    .file(WOOSH_SOUND_3, true, true)
                    .delay(rollOutAnimTime / 1.1)
                    .fadeOutAudio(200)
                    .playIf(() => {
                        return fileExistsAtPath(WOOSH_SOUND_3);
                    })
                .effect()
                    .from(token)
                    .animateProperty("sprite", "position.x", {from: 0, to: x, duration: rollOutAnimTime, ease: "easeInBack"})
                    .animateProperty("sprite", "position.y", {from: 0, to: y, duration: rollOutAnimTime, ease: "easeInBack"})
                    .animateProperty("sprite", "rotation", {from: 0, to: rotationValue, duration: rollOutAnimTime, ease: "easeInBack"})
                    .duration(rollOutAnimTime)
                    .zIndex(2)
                    .waitUntilFinished(0)
                .effect()
                    .file("jb2a.smoke.puff.ring.01.white.0", true)
                    .atLocation(targetTokens[0])
                    .scaleToObject(2.2)
                    .zIndex(1000)
                    .fadeIn(100)
                    .opacity(0.3)
                    .fadeOut(200)
                .effect()
                    .from(targetTokens[0])
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
                    .file("jb2a.impact.008.orange", true)
                    .atLocation(targetTokens[0])
                    .scaleToObject(3)
                    .zIndex(1000)
                .sound()
                    .file(DEFLECT_SOUND, true, true)
                    .fadeOutAudio(200)
                    .playIf(() => {
                        return fileExistsAtPath(DEFLECT_SOUND);
                    })                   
                .effect()
                    .from(token)
                    .animateProperty("sprite", "position.x", {from: x, to: fallDownX, duration: knockedBackAnimTime, ease: "easeOutQuint"})
                    .animateProperty("sprite", "position.y", {from: y, to: fallDownY, duration: knockedBackAnimTime, ease: "easeOutQuint"})
                    .animateProperty("sprite", "rotation", {from: 0, to: fallFlatAngle, duration: knockedBackAnimTime, ease: "easeOutQuint"})
                    .duration(knockedBackAnimTime + FlatOnFloorTime)
                    .zIndex(2)
                    .fadeOut(500)
                .effect()
                    .file("jb2a.smoke.puff.ring.01.white.1", true)
                    .atLocation({x: originalTokenPositionX + (game.canvas.grid.size/2) + fallDownX, y: OriginalTokenPositionY + (game.canvas.grid.size/2) + fallDownY})
                    .scale(0.8)
                    .fadeIn(100)
                    .opacity(0.5)
                    .fadeOut(200)
                    .zIndex(1)
                    .delay(knockedBackAnimTime - 500)
                .sound()
                    .file(LAND_SOUND, true, true)
                    .playIf(() => {
                        return fileExistsAtPath(LAND_SOUND);
                    })
                    .delay(knockedBackAnimTime - 500)
                .animation()
                    .on(token)
                    .delay(knockedBackAnimTime + FlatOnFloorTime)
                    .opacity(1)
                    .fadeIn(500)
            sequence.play()
            } else {
                console.log(`did you target anyone? ${ChatMessagePF2e.flags.pf2e.context.outcome}`)
            }

        }
    }
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

function checkIfASkillCheck(ChatMessagePF2e) {
    
    try {
        const TYPE = ChatMessagePF2e.flags.pf2e.context.type;
        return true;
    } catch (error) {
        return false; 
    }
}
