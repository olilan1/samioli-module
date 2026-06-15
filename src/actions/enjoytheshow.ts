import { ChatMessagePF2e, DegreeOfSuccessString } from "foundry-pf2e";
import { delay } from "../utils.ts";
import { applyPanacheForOutcome } from "../effects/panache.ts";

export function editEnjoyTheShowSkillRoll(
    chatMessagePF2e: ChatMessagePF2e,
    html: JQuery<HTMLElement>
) {
    html.find('.inline-check.with-repost').attr('data-against', 'will');
    
    const actor = chatMessagePF2e.actor;
    const hasFeat = actor?.items.some(
        entry => entry.system.slug === "acrobatic-performer" && entry.type === "feat"
    );
    if (hasFeat) {
        const elementToClone = html.find('.inline-check.with-repost');
        const clonedElement = elementToClone.clone();
        clonedElement.attr('data-pf2-check', 'acrobatics');
        clonedElement.find('.label').text('Perform with Acrobatics');
        elementToClone.after(clonedElement);
        elementToClone.after(' or ');
    }
}

export async function startEnjoyTheShow(message: ChatMessagePF2e) {
    animateEnjoyTheShow(message);
}

function randomRetort(outcome: DegreeOfSuccessString): string {

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

function checkIfSuccess(outcome: DegreeOfSuccessString): boolean {
    if (outcome === "criticalSuccess"
        || outcome === "success") {
            return true
        } else {
            return false
        }
}

async function animateEnjoyTheShow(message: ChatMessagePF2e) {
    const actor = message.actor;
    if (!actor) return;

    const tokenId = message.speaker.token;
    const token = canvas.tokens.placeables.find(t => t.id === tokenId);
    const outcome = message.flags.pf2e.context?.outcome;
    if (!outcome) return;
 
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

    const animationTime = 4000;

    const sequence = new Sequence()

    .effect()
        .atLocation(token, {offset: {x:0, y:-100}})
        .fadeIn(500)
        .text(randomRetort(outcome), style)
        .duration(animationTime)
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
        .waitUntilFinished(-400)
    .effect()
        .atLocation(targetTokens[0])
        .fadeIn(200)
        .file("jb2a.dizzy_stars.400px.yellow")
        .fadeOut(200)
        .scale(0.4)
        .opacity(0.5)
        .playIf(checkIfSuccess(outcome))
    sequence.play();
    await delay(animationTime);
    if (outcome === "success" || outcome === "failure" || outcome === "criticalSuccess") {
        await applyPanacheForOutcome(actor, outcome);
    }
}