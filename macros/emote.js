/* {"name":"Emote","img":"icons/magic/air/weather-clouds.webp","_id":"LdagGQcMGgWGYNg0"} */

const ownedFamiliars = canvas.tokens.placeables.filter(
    t => t.actor?.type === "familiar" && t.actor?.isOwner
);

if (ownedFamiliars.length === 0) {
    ui.notifications.warn("No owned familiar tokens found.");
    return;
}

if (ownedFamiliars.length > 1) {
    ui.notifications.warn(
        "Multiple owned familiar tokens found. Please ensure only one is on the canvas."
    );
    return;
}

const tokenToUse = ownedFamiliars[0];
const myApi = game.modules.get("samioli-module").api;
myApi.handleEmote(tokenToUse);
