/* {"name":"Storm Spiral","img":"systems\pf2e\icons\spells\lightning-storm.webp","_id":"7O8MdU1apBDZnjRJ"} */

const [tokenD, tokenScale] = await pf2eAnimations.macroHelpers(args)
const template = args[1]?.templateData ?? canvas.templates.placeables[canvas.templates.placeables.length - 1];
const locationOfTemplateX = template.x;
const locationOfTemplateY = template.y;

let targetTokens = Array.from(game.user.targets)

function shuffleArray(array) {
    let currentIndex = array.length, randomIndex;

    while (currentIndex !== 0) {

        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;

        [array[currentIndex], array[randomIndex]] = [
            array[randomIndex], array[currentIndex]];
    }

    return array;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getTokenIds(tokens) {
    return tokens.map(token => token.id);
}

if (targetTokens.length != 0) {

    targetTokens = shuffleArray(targetTokens)

    template.delete();
    
    const lightning_strike = ["jb2a.lightning_strike.blue.0", "jb2a.lightning_strike.blue.1", 
        "jb2a.lightning_strike.blue.2", "jb2a.lightning_strike.blue.3", 
        "jb2a.lightning_strike.blue.4", "jb2a.lightning_strike.blue.5"];
    
    let sequence = new Sequence({moduleName: "PF2e Animations", softFail: true})
    .effect()
        .file("jb2a.call_lightning.high_res.blue", true)
        .atLocation({ x: locationOfTemplateX, y: locationOfTemplateY })
        .fadeIn(1500)
        .fadeOut(1000)
        .duration(10000)
        .opacity(0.5)
        .scale(0.5)
    for (let i = 0; i < targetTokens.length; i++) {
        sequence
            .effect()
                .delay(3000, 8000)
                .file([Sequencer.Helpers.random_array_element(lightning_strike, false)], true)
                .atLocation(targetTokens[i])
                .randomizeMirrorY()
                .opacity(1)
    }
    sequence.play()

    await delay(11000);
    canvas.tokens.setTargets(getTokenIds(targetTokens), {mode: "replace"});
}