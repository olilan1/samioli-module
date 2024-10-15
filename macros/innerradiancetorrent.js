/* {"name":"Inner Radiance Torrent","img":"icons/magic/fire/beam-jet-stream-embers.webp","_id":"9uSja2wWVN7EeqBp"} */

const [tokenD, tokenScale] = await pf2eAnimations.macroHelpers(args)
const template = args[1]?.templateData ?? canvas.templates.placeables[canvas.templates.placeables.length - 1];

const colouredBolts = new Array("jb2a.energy_strands.range.standard.purple", "jb2a.energy_strands.range.standard.blue", "jb2a.magic_missile.purple", "jb2a.magic_missile.blue");
let targetTokens = Array.from(game.user.targets)
if (targetTokens.length != 0) { 
    let sequence = new Sequence({moduleName: "PF2e Animations", softFail: true})
        .sound()
            .volume(0.7)
            .file("sound/NWN2-Sounds/sdr_mindhit.WAV", true, true)
            .fadeInAudio(50)
            .fadeOutAudio(750)
            .endTime(1500)
        .effect()
            .file("jb2a.sphere_of_annihilation.200px.purple", true)
            .atLocation(tokenD)
            .scale(1) 
            .scaleIn(1, 500, {ease: "easeInOutBack"})
            .fadeIn(300)
            .fadeOut(300)
            .duration(5000)
            .belowTokens(true)
        .effect()
            .file("jb2a.energy_strands.in.purple.01.0", true)
            .atLocation(tokenD)
            .scale(0.5) 
            .scaleIn(1, 500, {ease: "easeInOutBack"})
            .randomRotation()
            .fadeIn(300)
            .fadeOut(300)
            .duration(5000)
        .effect()
            .file("jb2a.energy_strands.in.purple.01.1", true)
            .atLocation(tokenD)
            .scale(0.5) 
            .scaleIn(1, 500, {ease: "easeInOutBack"})
            .randomRotation()
            .fadeIn(300)
            .fadeOut(300)
            .duration(5000)
        .effect()
            .file("jb2a.energy_strands.in.purple.01.2", true)
            .atLocation(tokenD)
            .scale(0.5) 
            .scaleIn(1, 500, {ease: "easeInOutBack"})
            .randomRotation()
            .fadeIn(300)
            .fadeOut(300)
            .duration(5000)
            .waitUntilFinished(1500)
        .effect()
            .file("jb2a.template_circle.out_pulse.02.loop.purplepink", true)
            .atLocation(tokenD)
            .scale(1)
            .fadeOut(300) 
        .effect()
            .file("jb2a.energy_strands.overlay.purple.01", true)
            .atLocation(tokenD)
            .scale(0.5) 
            .scaleIn(1, 500, {ease: "easeInOutBack"})
            .fadeIn(300)
            .fadeOut(300)
            .duration(6000)
        .effect()
            .file("jb2a.eldritch_blast.purple", true)
            .atLocation(tokenD)
            .stretchTo(template)
            .startTimePerc(0.1)
            .playbackRate(0.5)
            .fadeOut(300)
            .scale(2.3)
        .effect()
            .file("jb2a.energy_beam.normal.bluepink.02", true)
            .atLocation(tokenD) 
            .stretchTo(template)
            .fadeIn(300)
            .fadeOut(800)
            .duration(7000)
        .sound()
            .volume(0.7)
            .file("sound/NWN2-Sounds/sfx_MagicalImplosion1.WAV", true, true)
        .sound()
            .volume(0.7)
            .file("sound/NWN2-Sounds/sim_rayodd.WAV", true, true)
            .fadeOutAudio(500)
    for (let i = 0; i < 8; i++) {
        sequence
            .effect()
                .file([Sequencer.Helpers.random_array_element(colouredBolts, false)], true)
                .atLocation(tokenD) 
                .stretchTo(targetTokens[Sequencer.Helpers.random_int_between(0, targetTokens.length)])
                .scale(1, 1.8)
                .randomizeMirrorY()            
            .sound()
                .volume(0.3)
                .file("sound/NWN2-Sounds/sfx_MagicalImplosion2.WAV", true, true)
                .fadeInAudio(50)
                .fadeOutAudio(50)
                .wait(Sequencer.Helpers.random_int_between(300, 1000))
    }
    sequence.play()
}