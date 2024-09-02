import {delay} from "../utils.js";

export function checkForBravado(chatMessage) {
    if (chatMessage.flags?.pf2e?.context?.options.includes("item:trait:bravado")) {
        checkIfProvidesPanache(chatMessage);
    } 
}

function checkIfProvidesPanache(chatMessage) {
    const outcome = chatMessage.flags.pf2e.context.outcome;
    if (outcome === "criticalSuccess" || outcome === "success" || outcome === "failure") {
        applyPanache(game.actors.get(chatMessage.speaker.actor));
        if (outcome === "failure") {
            console.log("failure means panache but only until the end of your next turn");
            //TODO create a new panache item effect that lasts only one turn
        }
    } 
}

async function applyPanache(actor) {
    const panacheItemId = "uBJsxCzNhje8m8jj";
    const compendiumPack = game.packs.get("pf2e.feat-effects");
    const panacheEffect = await compendiumPack.getDocument(panacheItemId);
    await delay(4000);
    await actor.createEmbeddedDocuments("Item", [panacheEffect.toObject()]);
}



export async function checkForFinisher(chatMessage) {
    const { flags } = chatMessage;
    const hasFinisher = flags?.pf2e?.context?.options.includes("finisher");
    const isDamageRoll = flags?.pf2e?.context?.type === "damage-roll";
    const isFailure = flags?.pf2e?.context?.outcome === "failure" 
    || flags?.pf2e?.context?.outcome === "criticalFailure";

    if ((hasFinisher && isDamageRoll) || (hasFinisher && isFailure)) {
        const panacheItems = await returnPanacheItems(game.actors.get(chatMessage.speaker.actor));
        if (panacheItems.length > 0) {
            await delay(4000);
            for (const panacheItem of panacheItems) {
                await panacheItem.delete(); 
            }
        } 
    } 
}

async function returnPanacheItems(actor) {
    const items = await actor.items.contents;
    return items.filter(item => item.type === "effect" 
        && item.system.slug === "effect-panache"); 
}