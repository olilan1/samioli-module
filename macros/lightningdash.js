/* {"name":"Lightning Dash","img":"icons/magic/lightning/bolt-blue.webp","_id":"UetbJZLBcLzzZp8h"} */

let opts = {};
const [tokenD, tokenScale] = await pf2eAnimations.macroHelpers(args)
const template = args[1]?.templateData ?? canvas.templates.placeables[canvas.templates.placeables.length - 1];

if (template !== undefined) {
    let targetTokens = Array.from(game.user.targets)
    
    tokenD.actor.sheet.minimize();
    const tokenCenter = tokenD.center;
    
    let targetLocation = await new Portal().texture(tokenD.document.texture.src).origin(tokenD).range(35).pick();
    
    console.log(tokenD);
    
    await Sequencer.Preloader.preloadForClients([
                "jb2a.static_electricity.02.blue",
                "jb2a.chain_lightning.primary.blue",
                "jb2a.static_electricity.03.blue"
            ])

    let seq = new Sequence({moduleName: "PF2e Animations", softFail: true})
            
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

