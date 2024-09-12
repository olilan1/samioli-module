export async function checkForHuntPreyGM(chatMessage, userId) {
    if (!chatMessage.flags?.pf2e?.origin?.rollOptions.includes("origin:item:hunt-prey")) return;

    const ranger = game.actors.get(chatMessage.speaker.actor);
    const rangerTargets = game.users.get(userId).targets;

    if (rangerTargets.size === 0) {
        return;
    }

    const allowedNumberOfTargets = await calculateNumberOfTargetsRangerCanHunt(ranger);
    if (rangerTargets.size > allowedNumberOfTargets) {
        return;
    }

    await removeHuntPreyFromOtherTokens(ranger);
    await applyHuntPrey(ranger, rangerTargets);
}

export async function checkForHuntPreyPlayer(chatMessage, userId) {
    if (!chatMessage.flags?.pf2e?.origin?.rollOptions.includes("origin:item:hunt-prey")) return;

    if (game.users.get(userId).targets.size === 0) {
        ui.notifications.error("Please target a creature to hunt");
        return;
    }

    const allowedNumberOfTargets = await calculateNumberOfTargetsRangerCanHunt(ranger);
    if (game.users.get(userId).targets.size > allowedNumberOfTargets) {
        ui.notifications.error(`Please select a maximum of ${allowedNumberOfTargets} creature(s) to hunt`);
        return;
    }
}

async function applyHuntPrey(actor, targets) {
    try {
        const huntPreyEffectData = {
            name: `Hunted by ${actor.prototypeToken.name}`,
            type: "effect",
            img: actor.prototypeToken.texture.src,
            system: {
                description: {
                    value: `<p>This creature has been hunted by ${actor.prototypeToken.name}</p>`
                },
                slug: `hunt-prey-${actor.id}`,
                duration: { value: 1, unit: "days" },
                level: { value: 0 },
                tokenIcon: { show: true }
            },
            flags: { core: { statusId: "hunted" } }
        };

        for (const target of targets) {
            const targetToken = game.canvas.scene.tokens.get(target.id);
            await targetToken.actor.createEmbeddedDocuments("Item", [huntPreyEffectData]);
        }

    } catch (error) {
        ui.notifications.error(`Error applying effect: ${error.message}`);
        console.error(error);
    }
}

async function calculateNumberOfTargetsRangerCanHunt(actor) {
    const items = await actor.items.contents;

    if (items.some(item => item.type === "feat" && item.system.category === "class" && item.system.slug === "triple-threat")) {
        return 3;
    } else if (items.some(item => item.type === "feat" && item.system.category === "class" && item.system.slug === "double-prey")) {
        return 2;
    } else {
        return 1;
    }
}

async function removeHuntPreyFromOtherTokens(actor) {

    const allTokens = canvas.tokens.placeables;

    for (const token of allTokens) {

        if (token.actor === actor) continue;

        const targetActor = token.actor;
        if (!targetActor) continue; 

        const items = await targetActor.items.contents;
        const huntPreyEffect = items.find(item => 
            item.type === "effect" && 
            item.system.slug === `hunt-prey-${actor.id}` 
        );

        if (huntPreyEffect) {
            await targetActor.deleteEmbeddedDocuments("Item", [huntPreyEffect.id]);
        }
    }
}