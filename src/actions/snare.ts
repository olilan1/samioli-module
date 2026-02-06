import { ChatMessagePF2e, ConsumablePF2e, TokenDocumentPF2e, TokenPF2e } from "foundry-pf2e";
import { CrosshairUpdatable } from "../types.ts";
import { Point } from "foundry-pf2e/foundry/common/_types.mjs";
import { getSocket, CREATE_SNARE, REMOVE_SNARE } from "../sockets.ts";
import { ButtonSwapSpec, swapButtons } from "../chatautobuttons.ts";
import { createChatMessageWithButton } from "../chatbuttonhelper.ts";
import { replaceTargets } from "../templatetarget.ts";

const USE_BUTTON_CONSUMABLE = 'button[data-action="consume"]';
const SNARE_PREFIX = 'origin:item:category:';
const AUTO_SWAP_BUTTONS_CONSUMABLES: Record<string, ButtonSwapSpec> = {
    "snare": {
        label: "Deploy Snare!",
        function: deploySnare,
        buttonToReplace: USE_BUTTON_CONSUMABLE
    },
    "remove-snare": {
        label: "Remove Snare?",
        function: removeSnare,
        buttonToReplace: USE_BUTTON_CONSUMABLE
    }
};

export async function deploySnare(deployerToken: TokenPF2e, message: ChatMessagePF2e) {
   
    const itemUuid = message.flags.pf2e.origin?.uuid;
    if (!itemUuid) return;
    const item = await fromUuid(itemUuid) as ConsumablePF2e;

    if (item.quantity === 0) {
        ui.notifications.error("Zero snares remaining.");
        return;
    }

    // Select a square next to the deployer to deploy the snare
    const selectedLocation = await selectSquare(deployerToken);
    if (!selectedLocation) {
        ui.notifications.error("Snare placement cancelled.");
        return;
    }

    if (getSnareAtLocation(selectedLocation)) {
        ui.notifications.warn("Cannot place snare: There is already a snare at this location.");
        return;
    }

    if (getTokenAtLocation(selectedLocation)) {
        ui.notifications.warn("Cannot place snare: There is a token in that space.");
        return;
    }

    getSocket().executeAsGM(CREATE_SNARE, selectedLocation, deployerToken.document.uuid, message.id, itemUuid);

    // Decrement snare count
    // We don't delete it entirely as we need to reference it when it's triggered
    const quantity = item.quantity - 1;
    await item.update({ "system.quantity": quantity });

}

export async function createSnareAsGM(location: Point, deployerUuid: string, snareId: string, 
    itemUuid: string) {
    const size = canvas.grid.size;
    const script = generateSnareScript(deployerUuid, snareId, itemUuid);
    
    const regionData = {
        name: "Snare",
        color: "#320101",
        visibility: 2,
        shapes: [{
             type: "rectangle", 
             width: size, 
             height: size, 
             x: location.x, 
             y: location.y, 
             rotation: 0 
        }],
        x: location.x,
        y: location.y,
        behaviors: [{
            type: "executeScript", 
            system: {
                events: ["tokenEnter"], 
                source: script 
            }
        }],
        flags: {
            "samioli-module": {
                "snareId": snareId,
                "itemUuid": itemUuid,
                "deployerUuid": deployerUuid
            }
        }
    };
    await canvas.scene?.createEmbeddedDocuments("Region", [regionData]);
}

function generateSnareScript(deployerUuid: string, snareId: string, itemUuid: string) {

    const script = `
if (!game.user.isGM) return;
const snareId = "${snareId}";
const itemUuid = "${itemUuid}";
const deployerUuid = "${deployerUuid}";
const token = event.data.token;
const myApi = game.modules.get("samioli-module").api;
myApi.handleSnareRegionEnter(snareId, itemUuid, deployerUuid, token);
`;
    return script;
}

export async function triggerSnare(snareId: string, itemUuid: string, deployerUuid: string, token: TokenDocumentPF2e) {

    animateSnareTrigger(token);
    const deployer = fromUuidSync(deployerUuid) as TokenDocumentPF2e;

    createSnareTriggeredChatMessage(deployer, token, itemUuid, snareId);
}

async function removeSnare(_token: TokenPF2e, message: ChatMessagePF2e) {
    const snareId = message.flags['samioli-module']?.snareId;
    if (!snareId) return;
    getSocket().executeAsGM(REMOVE_SNARE, snareId);
}

export async function removeSnareAsGM(snareId: string) {
    const snare = canvas.scene?.regions.find((region) => region.getFlag("samioli-module", "snareId") === snareId);
    if (!snare) return;
    await snare.delete();
}

async function createSnareTriggeredChatMessage(deployer: TokenDocumentPF2e, triggerer: TokenDocumentPF2e, 
    itemUuid: string, snareId: string) {

    const content = `
        <p>${triggerer.name} stepped on my snare!</p>
    `;

    await createChatMessageWithButton({
        slug: "trigger-snare",
        actor: deployer.actor!,
        content: content,
        button_label: "Trigger Snare!",
        params: [itemUuid, snareId, triggerer.uuid]
    });
}

export async function addSnareToChatAndTarget(itemUuid: string, snareId: string, triggererUuid: string) {
    const item = fromUuidSync(itemUuid) as ConsumablePF2e;
    const triggerer = fromUuidSync(triggererUuid) as TokenDocumentPF2e;
    const tokenUuid = triggerer.uuid;

    const chatMessage = await item.toMessage(undefined, { create: true });
    
    if (chatMessage) {
        await chatMessage.update({
            "flags.samioli-module.snareId": snareId,
            "flags.samioli-module.tokenUuid": tokenUuid
        });
    }

    // Target the snare triggerer
    const targetTokenId = triggerer.object?.id;
    replaceTargets([targetTokenId!]);

}

export async function replaceButtonsForSnareMessages(message: ChatMessagePF2e, html: JQuery<HTMLElement>) {
 
    const origin = message.flags.pf2e.origin;
    const rollOptions = origin?.rollOptions;
    if (!rollOptions) return;

    const token = message.token?.object;
    if (!token) return;
    
    if (message.flags['samioli-module']?.snareId) {
        swapButtons("remove-snare", AUTO_SWAP_BUTTONS_CONSUMABLES, '.card-buttons', token, message, html);
        return;
    }
    const slug = rollOptions.find(item => item.startsWith(SNARE_PREFIX))?.slice(SNARE_PREFIX.length);
    if (!slug) return;
    swapButtons(slug, AUTO_SWAP_BUTTONS_CONSUMABLES, '.card-buttons', token, message, html);
    return; 

}

async function selectSquare(token: TokenPF2e) {
    const crosshairWidth = 0;
    const labelText = "Select a square to deploy the snare";
    const snapPosition = CONST.GRID_SNAPPING_MODES.CENTER;
    const iconTexture = "icons/svg/trap.svg";
    const color = "#000000ff";
    const selectedLocation = await Sequencer.Crosshair.show({
        t: CONST.MEASURED_TEMPLATE_TYPES.RECTANGLE,
        distance: crosshairWidth,
        fillColor: color,
        label: {
            text: labelText,
            dy: -150
        },
        location: {
            obj: token,
            limitMaxRange: 5,
            limitMinRange: 5,
            wallBehavior: Sequencer.Crosshair.PLACEMENT_RESTRICTIONS.NO_COLLIDABLES
        },
        icon: {
            texture: iconTexture
        }, 
        snap: {
            position: snapPosition
        }
    }, {
        [Sequencer.Crosshair.CALLBACKS.COLLIDE]: (crosshair: CrosshairUpdatable) => {
            crosshair.updateCrosshair({
                "icon.texture": "icons/svg/cancel.svg"
            })
        },
        [Sequencer.Crosshair.CALLBACKS.STOP_COLLIDING]: (crosshair: CrosshairUpdatable) => {
            crosshair.updateCrosshair({
                "icon.texture": iconTexture
            })
        },
        [Sequencer.Crosshair.CALLBACKS.CANCEL]: () => {
            return false;
        },
        show: undefined,
        move: undefined,
        mouseMove: undefined,
        invalidPlacement: undefined,
        placed: undefined
    });

    selectedLocation.x -= canvas.grid.size / 2;
    selectedLocation.y -= canvas.grid.size / 2;

    const point = {x: selectedLocation.x, y: selectedLocation.y};

    return point;    
}

function getSnareAtLocation(location: Point) {
    return canvas.scene?.regions.find((region) => {
        const snareId = region.getFlag("samioli-module", "snareId");
        return !!snareId && region.x === location.x && region.y === location.y;
    });
}

function getTokenAtLocation(location: Point) {
    return canvas.tokens?.placeables.find((token) => token.x === location.x && token.y === location.y);
}

async function animateSnareTrigger(token: TokenDocumentPF2e) {
 
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

    new Sequence()
    .effect()
        // @ts-expect-error offset is valid
        .atLocation(token, {offset: {x:0, y:-100}})
        .fadeIn(500)
        .text("Click!", style)
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
        .waitUntilFinished(-400)
    .play();    
}