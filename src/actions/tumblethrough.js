export async function startTumbleThrough(ChatMessagePF2e) {

    //first check if the message is eligible
    if (!checkIfASkillCheck(ChatMessagePF2e)){
    } else {

        //check if the skill check was for a tumblethrough
        if (!ChatMessagePF2e.flags.pf2e.context.options.includes("action:tumble-through") 
            && ChatMessagePF2e.flags.pf2e.context.type !== "skill-check") {
            return
    
        } else {
    
            //set up for the animations
            const TOKENID = ChatMessagePF2e.speaker.token;
            const TOKEN = canvas.tokens.placeables.find(t => t.id === TOKENID);
    
            const TARGETTOKENS = Array.from(game.user.targets)
            if (TARGETTOKENS.length === 0) return;
    
            const ORIGINALTOKENPOSITIONX = TOKEN.document.x;
            const ORIGINALTOKEPOSITIONY = TOKEN.document.y;
            const TARGETPOSITIONX = TARGETTOKENS[0].document.x;
            const TARGETPOSITIONY = TARGETTOKENS[0].document.y;
            const TARGETHEIGHT = TARGETTOKENS[0].document.height;
            const TARGETLOCATIONBUFFER = game.canvas.scene.grid.size/2;
    
            let x = TARGETPOSITIONX - ORIGINALTOKENPOSITIONX
            let y = TARGETPOSITIONY - ORIGINALTOKEPOSITIONY
    
            for (let i = 1; i < TARGETHEIGHT; i++) {
                x = x + TARGETLOCATIONBUFFER;
                y = y + TARGETLOCATIONBUFFER;
            }

            let rotationValue =  720
            
            if (x < 0) {
                rotationValue = rotationValue * -1
            }
    
            const WOOSHSOUND1 = "sound/NWN2-Sounds/cb_sw_unarmed04.WAV";
            const WOOSHSOUND2 = "sound/NWN2-Sounds/cb_sw_unarmed01.WAV";
            const WOOSHSOUND3 = "sound/NWN2-Sounds/cb_sw_unarmed03.WAV";
            const WOOSHSOUND4 = "sound/NWN2-Sounds/cb_sw_unarmed1.WAV";
            const WOOSHSOUND5 = "sound/NWN2-Sounds/cb_sw_unarmed2.WAV";
            const WOOSHSOUND6 = "sound/NWN2-Sounds/cb_sw_unarmed02.WAV";
            const DEFLECTSOUND = "sound/NWN2-Sounds/bf_med_flesh.WAV";
            const LANDSOUND = "sound/NWN2-Sounds/it_genericmedium.WAV";

            //check if the skillroll was successful
            if (ChatMessagePF2e.flags.pf2e.context.outcome === "criticalSuccess"
                || ChatMessagePF2e.flags.pf2e.context.outcome === "success") {

                const ANIMATIONTIME = 4000

                let sequence = new Sequence({moduleName: "PF2e Animations", softFail: true})
                
                .animation()
                    .on(TOKEN)
                    .opacity(0)
                    .fadeIn(200)
                    .duration(ANIMATIONTIME)
                .sound()
                    .file(WOOSHSOUND1, true, true)
                    .delay(500)
                    .fadeOutAudio(200)
                    .playIf(() => {
                        return fileExistsAtPath(WOOSHSOUND1);
                    })
                .sound()
                    .file(WOOSHSOUND2, true, true)
                    .delay(900)
                    .fadeOutAudio(200)
                    .playIf(() => {
                        return fileExistsAtPath(WOOSHSOUND2);
                    })
                .sound()
                    .file(WOOSHSOUND3, true, true)
                    .delay(1300)
                    .fadeOutAudio(200)
                    .playIf(() => {
                        return fileExistsAtPath(WOOSHSOUND3);
                    })
                .sound()
                    .file(WOOSHSOUND4, true, true)
                    .delay(2700)
                    .fadeOutAudio(200)
                    .playIf(() => {
                        return fileExistsAtPath(WOOSHSOUND4);
                    })
                .sound()
                    .file(WOOSHSOUND5, true, true)
                    .delay(3100)
                    .fadeOutAudio(200)
                    .playIf(() => {
                        return fileExistsAtPath(WOOSHSOUND5);
                    })
                .sound()
                    .file(WOOSHSOUND6, true, true)
                    .delay(3500)
                    .fadeOutAudio(200)
                    .playIf(() => {
                        return fileExistsAtPath(WOOSHSOUND6);
                    })
                .effect()
                    .file("jb2a.smoke.puff.side.02.white.0", true)
                    .atLocation(TOKEN)
                    .rotateTowards(TARGETTOKENS[0], {rotationOffset: 180})
                    .scale(0.7)
                    .delay(600)
                    .fadeIn(100)
                    .opacity(0.3)
                    .fadeOut(200)
                .effect()
                    .file("jb2a.smoke.puff.ring.01.white.0", true)
                    .atLocation(TARGETTOKENS[0])
                    .scaleToObject(2.2)
                    .zIndex(1000)
                    .delay(1000)
                    .fadeIn(100)
                    .opacity(0.3)
                    .fadeOut(200)
                .effect()
                    .file("jb2a.smoke.puff.ring.01.white.1", true)
                    .atLocation(TOKEN)
                    .belowTokens()
                    .scale(0.7)
                    .delay(3800)
                    .fadeIn(100)
                    .opacity(0.2)
                    .fadeOut(200)
                .effect()
                    .from(TOKEN)
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
                    .on(TOKEN)
                    .opacity(1)
                    .fadeIn(200)
                    .duration(250)
            sequence.play()

            } else if (ChatMessagePF2e.flags.pf2e.context.outcome === "criticalFailure" 
            || ChatMessagePF2e.flags.pf2e.context.outcome === "failure") {

                const FALLDOWNX = (x/2)  
                const FALLDOWNY = (y/2)  

                const ROLLOUTANIMTIME = 2000
                const KNOCKEDBACKANIMTIME = 1000
                const FLATONFLOORTIME = 2000

                let fallFlatAngle = -90

                if (x < 0) {
                    fallFlatAngle = fallFlatAngle * -1
                }

                let sequence = new Sequence({moduleName: "PF2e Animations", softFail: true})
                
                .animation()
                    .on(TOKEN)
                    .opacity(0)
                    .fadeIn(200)
                    .duration(ROLLOUTANIMTIME + KNOCKEDBACKANIMTIME)
                .effect()
                    .file("jb2a.smoke.puff.side.02.white.0", true)
                    .atLocation(TOKEN)
                    .rotateTowards(TARGETTOKENS[0], {rotationOffset: 180})
                    .scale(0.7)
                    .delay(ROLLOUTANIMTIME / 2.2)
                    .fadeIn(100)
                    .opacity(0.3)
                    .fadeOut(200)
                .sound()
                    .file(WOOSHSOUND1, true, true)
                    .delay(ROLLOUTANIMTIME / 2.2)
                    .fadeOutAudio(200)
                    .playIf(() => {
                        return fileExistsAtPath(WOOSHSOUND1);
                    })
                .sound()
                    .file(WOOSHSOUND2, true, true)
                    .delay(ROLLOUTANIMTIME / 1.5)
                    .fadeOutAudio(200)
                    .playIf(() => {
                        return fileExistsAtPath(WOOSHSOUND2);
                    })
                .sound()
                    .file(WOOSHSOUND3, true, true)
                    .delay(ROLLOUTANIMTIME / 1.1)
                    .fadeOutAudio(200)
                    .playIf(() => {
                        return fileExistsAtPath(WOOSHSOUND3);
                    })
                .effect()
                    .from(TOKEN)
                    .animateProperty("sprite", "position.x", {from: 0, to: x, duration: ROLLOUTANIMTIME, ease: "easeInBack"})
                    .animateProperty("sprite", "position.y", {from: 0, to: y, duration: ROLLOUTANIMTIME, ease: "easeInBack"})
                    .animateProperty("sprite", "rotation", {from: 0, to: rotationValue, duration: ROLLOUTANIMTIME, ease: "easeInBack"})
                    .duration(ROLLOUTANIMTIME)
                    .zIndex(2)
                    .waitUntilFinished(0)
                .effect()
                    .file("jb2a.smoke.puff.ring.01.white.0", true)
                    .atLocation(TARGETTOKENS[0])
                    .scaleToObject(2.2)
                    .zIndex(1000)
                    .fadeIn(100)
                    .opacity(0.3)
                    .fadeOut(200)
                .effect()
                    .from(TARGETTOKENS[0])
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
                    .atLocation(TARGETTOKENS[0])
                    .scaleToObject(3)
                    .zIndex(1000)
                .sound()
                    .file(DEFLECTSOUND, true, true)
                    .fadeOutAudio(200)
                    .playIf(() => {
                        return fileExistsAtPath(DEFLECTSOUND);
                    })                   
                .effect()
                    .from(TOKEN)
                    .animateProperty("sprite", "position.x", {from: x, to: FALLDOWNX, duration: KNOCKEDBACKANIMTIME, ease: "easeOutQuint"})
                    .animateProperty("sprite", "position.y", {from: y, to: FALLDOWNY, duration: KNOCKEDBACKANIMTIME, ease: "easeOutQuint"})
                    .animateProperty("sprite", "rotation", {from: 0, to: fallFlatAngle, duration: KNOCKEDBACKANIMTIME, ease: "easeOutQuint"})
                    .duration(KNOCKEDBACKANIMTIME + FLATONFLOORTIME)
                    .zIndex(2)
                    .fadeOut(500)
                .effect()
                    .file("jb2a.smoke.puff.ring.01.white.1", true)
                    .atLocation({x: ORIGINALTOKENPOSITIONX + (game.canvas.grid.size/2) + FALLDOWNX, y: ORIGINALTOKEPOSITIONY + (game.canvas.grid.size/2) + FALLDOWNY})
                    .scale(0.8)
                    .fadeIn(100)
                    .opacity(0.5)
                    .fadeOut(200)
                    .zIndex(1)
                    .delay(KNOCKEDBACKANIMTIME - 500)
                .sound()
                    .file(LANDSOUND, true, true)
                    .playIf(() => {
                        return fileExistsAtPath(LANDSOUND);
                    })
                    .delay(KNOCKEDBACKANIMTIME - 500)
                .animation()
                    .on(TOKEN)
                    .delay(KNOCKEDBACKANIMTIME + FLATONFLOORTIME)
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
