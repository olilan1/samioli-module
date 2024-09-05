export function editSkillRoll(html, actor) {
    html.find('.inline-check.with-repost').attr('data-against', 'will');
    
    if (actor.items.find(entry => (entry.system.slug === "acrobatic-performer" && entry.type === "feat"))){
        let elementToClone = html.find('.inline-check.with-repost');
        let clonedElement = elementToClone.clone();
        clonedElement.attr('data-pf2-check', 'acrobatics');
        clonedElement.find('.label').text('Perform with Acrobatics');
        elementToClone.after(clonedElement)
        elementToClone.after(' or ') 
    }
}

export function startEnjoyTheShow(ChatMessagePF2e) {
    if (ChatMessagePF2e.flags.pf2e.context.options.includes("item:slug:enjoy-the-show")) {
        animateEnjoyTheShow(ChatMessagePF2e);
    }
}

function randomRetort(outcome) {

    const successfulRetorts = [
        "Get used to disappointment...",
        "Are you still here?",
        "I am not left handed!",
        "Sigh... I was itching for a REAL fight",
        "I'm starting to think you enjoy being ignored",
        "Does anyone else feel bad for them?",
        "Are you not entertained?!"
    ]

    const failedRetorts = [
        "I am rubber you are glue"
    ]

    let retorts;

    if (outcome === "criticalSuccess"
        || outcome === "success") {
            retorts = successfulRetorts
        } else {
            retorts = failedRetorts
        }

    const randomIndex = Math.floor(Math.random() * retorts.length);
    return retorts[randomIndex];

}

function checkIfSuccess(outcome) {
    if (outcome === "criticalSuccess"
        || outcome === "success") {
            return true
        } else {
            return false
        }
}

async function animateEnjoyTheShow(ChatMessagePF2e) {
    const tokenId = ChatMessagePF2e.speaker.token;
    const token = canvas.tokens.placeables.find(t => t.id === tokenId);

    const targetTokens = Array.from(game.user.targets)
    if (targetTokens.length === 0) return;

    const style = new PIXI.TextStyle({
        align: "center",
        dropShadowDistance: 19,
        fill: [
            "#ad0000",
            "#800000"
        ],
        fontFamily: "Helvetica",
        fontSize: 40,
        fontStyle: "italic",
        fontVariant: "small-caps",
        fontWeight: "bold",
        lineJoin: "bevel",
        strokeThickness: 3,
        wordWrap: true,
        wordWrapWidth: 200
    });

    let sequence = new Sequence({moduleName: "PF2e Animations", softFail: true})

    .effect()
        .atLocation(token, {offset: {x:0, y:-100}})
        .fadeIn(500)
        .text(randomRetort(ChatMessagePF2e.flags.pf2e.context.outcome), style)
        .duration(4000)
        .fadeOut(500)
        .animateProperty("sprite", "scale.x", {
            from: 0, 
            to: 1.5, 
            duration: 300, 
        })
        .animateProperty("sprite", "scale.y", {
            from: 0, 
            to: 1.5, 
            duration: 300, 
        })
        .animateProperty("sprite", "position.y", {
            from: 0, 
            to: -100, 
            duration: 300, 
        })
        .waitUntilFinished(-3600)
    .effect()
        .atLocation(targetTokens[0])
        .fadeIn(200)
        .file("jb2a.dizzy_stars.400px.yellow")
        .fadeOut(200)
        .scale(0.4)
        .opacity(0.5)
        .playIf(checkIfSuccess(ChatMessagePF2e.flags.pf2e.context.outcome))
    sequence.play()
}