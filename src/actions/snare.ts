import { ChatMessagePF2e, TokenPF2e } from "foundry-pf2e";
import { CrosshairUpdatable } from "../types.ts";

export async function deploySnare(token: TokenPF2e, message: ChatMessagePF2e) {
   
    console.log("Deploying snare");
    const rollOptions = message.flags.pf2e.origin?.rollOptions;
    const itemUuid = message.flags.pf2e.origin?.uuid;
    if (!itemUuid) return;
    console.log("itemUuid", itemUuid);
    const item = await fromUuid(itemUuid);
    console.log("item", item);

    // Select a square next to the token to deploy the snare
    const selectedLocation = await selectSquare(token);
    console.log("selectedLocation", selectedLocation);
    if (!selectedLocation) return;

}

export function triggerSnare() {
    console.log("Triggering snare");
}

async function selectSquare(token: TokenPF2e) {
    const crosshairWidth = 0;
    const labelText = "Select a square to deploy the snare";
    const snapPosition = CONST.GRID_SNAPPING_MODES.CENTER;
    const iconTexture = "icons/svg/trap.svg";
    const color = "#000000ff";
    const selectedLocation = await Sequencer.Crosshair.show({
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
            wallBehavior: Sequencer.Crosshair.PLACEMENT_RESTRICTIONS.NO_COLLIDABLES,
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
    return selectedLocation;    
}
