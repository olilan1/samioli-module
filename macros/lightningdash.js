/* {"name":"Lightning Dash","img":"icons/magic/lightning/bolt-blue.webp","_id":"UetbJZLBcLzzZp8h"} */

let seq = new Sequence({moduleName: "PF2e Animations", softFail: true})
const [tokenD, tokenScale] = await pf2eAnimations.macroHelpers(args)
const template = args[1]?.templateData ?? canvas.templates.placeables[canvas.templates.placeables.length - 1];

if (template !== undefined) {

    let targetTokens = Array.from(game.user.targets)
    
    tokenD.actor.sheet.minimize();
    
    const feetToCoords = canvas.grid.size / canvas.grid.distance;
    const radianAngle = template.direction * (Math.PI / 180);
    const halfSquare = 2.5 * feetToCoords;
    const minX = canvas.scene.width * canvas.scene.padding + halfSquare;
    const minY = canvas.scene.height * canvas.scene.padding + halfSquare;
    const maxX = canvas.scene.width + minX - 2 * halfSquare;
    const maxY = canvas.scene.height + minY - 2 * halfSquare;
    
    const cos = Math.cos(radianAngle);
    const sin = Math.sin(radianAngle);
    let x;
    let y;
    for (let dist = 27.5; dist >= 0; dist -= 5) {
        x = template.x + dist * feetToCoords * cos;
        y = template.y + dist * feetToCoords * sin;
        if (x > minX && x < maxX && y > minY && y < maxY) {
            break;
        }
    }
    
    const targetLocation = {
        x: x,
        y: y
    }
    
    await Sequencer.Preloader.preloadForClients([
                "jb2a.static_electricity.02.blue",
                "jb2a.chain_lightning.primary.blue",
                "jb2a.static_electricity.03.blue"
            ])
            seq
            .sound()
                .volume(0.3)
                .file("sound/NWN2-Sounds/sfx_conj_Electricity.WAV", true, true)
            .effect()
                .file("jb2a.static_electricity.02.blue", true)
                .atLocation(tokenD)
                .attachTo(tokenD)
                .fadeIn(500)
                .scaleToObject(1.2)
                .repeats(3)
                .wait(1100)
            .animation()
                .on(tokenD)
                .fadeOut(400, {ease: "easeInCubic"})
                .opacity(0)
            .effect()
                .file("jb2a.chain_lightning.primary.blue", true)
                .atLocation(tokenD)
                .stretchTo(targetLocation)
                .wait(300)
                
    for (let i = 0; i < targetTokens.length; i++) {
         seq
             .effect()
                .attachTo(targetTokens[i])
                .file("jb2a.static_electricity.03.blue", true)
                .scaleToObject(1.2)
                .randomRotation()
                .repeats(1, 2500)
                .delay(400, 900)
    }            
        seq
            .sound()
                .volume(0.3)
                .file("sound/NWN2-Sounds/sfx_hit_Electricity.WAV", true, true)
                .delay(200)
                .wait(1)
            .effect()
                .file("jb2a.static_electricity.02.blue", true)
                .attachTo(tokenD)
                .scaleToObject(1.2)
                .repeats(3)
                .wait(300)
            .animation()
                .on(tokenD)
                .teleportTo(targetLocation)
                .snapToGrid()
                .waitUntilFinished()
            .animation()
                .on(tokenD)
                .fadeIn(400, {ease: "easeInCubic"})
                .opacity(1.0)
    
    await seq.play()
}
