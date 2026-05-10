/* {"name":"Emote","img":"icons/magic/air/weather-clouds.webp"} */

if (canvas.tokens.controlled.length !== 1) {
    ui.notifications.warn("Please select a token");
    return;
}

const selectedToken = canvas.tokens.controlled[0];

if (selectedToken.actor?.type !== "familiar") {
    ui.notifications.warn("Please select a familiar token");
    return;
}

if (!selectedToken.actor?.isOwner) {
    ui.notifications.warn(`You do not have permission to perform an emote with ${selectedToken.name}.`);
    return;
}

const myApi = game.modules.get("samioli-module").api;
myApi.handleEmote(selectedToken);
