/* {"name":"Shifting Weapon","img":"systems/pf2e/icons/features/classes/master-tricks.webp","_id":"1kixoIIRKp3oOvXE"} */

if (canvas.tokens.controlled.length !== 1) {
    ui.notifications.warn("Please select a token");
    return;
}

const selectedToken = canvas.tokens.controlled[0];

const myApi = game.modules.get("samioli-module").api;
myApi.handleShiftingWeapon(selectedToken);