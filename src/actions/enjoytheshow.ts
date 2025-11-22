import { ActorPF2e, ChatMessagePF2e, DegreeOfSuccessString } from "foundry-pf2e";
import { checkIfProvidesPanache } from "../effects/panache.ts";
import { delay } from "../utils.ts";

export function editEnjoyTheShowSkillRollIfNeeded(
    chatMessagePF2e: ChatMessagePF2e, html: JQuery<HTMLElement>) {
    const rollOptions = chatMessagePF2e.flags.pf2e.origin?.rollOptions;
    if (!rollOptions?.includes("origin:item:slug:enjoy-the-show")) return;
    editSkillRoll(html, chatMessagePF2e.actor!);
}

function editSkillRoll(html: JQuery<HTMLElement>, actor: ActorPF2e) {
    html.find('.inline-check.with-repost').attr('data-against', 'will');
    
    if (actor.items.find(entry => (entry.system.slug === "acrobatic-performer" && entry.type === "feat"))){
        const elementToClone = html.find('.inline-check.with-repost');
        const clonedElement = elementToClone.clone();
        clonedElement.attr('data-pf2-check', 'acrobatics');
        clonedElement.find('.label').text('Perform with Acrobatics');
        elementToClone.after(clonedElement)
        elementToClone.after(' or ') 
    }
}

export async function startEnjoyTheShow(message: ChatMessagePF2e) {
    if (message.flags.pf2e.context?.options?.includes("item:slug:enjoy-the-show")) {
        animateEnjoyTheShow(message);
    }
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
        // @ts-expect-error offset is valid
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
    sequence.play()
    await delay(animationTime);
    checkIfProvidesPanache(message);
}