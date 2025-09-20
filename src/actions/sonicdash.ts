import { TokenPF2e } from "foundry-pf2e";
import { CrosshairUpdatable } from "../types.ts";

export async function startSonicDash(token: TokenPF2e) {

    ui.notifications.info("Select a location to dash to. It must be a straight line.");
    const locationToDashTo = await selectLocationToDashTo(token)
    if (!locationToDashTo) {
        return;
    }
    await animateSonicDash(token, locationToDashTo);
}

async function selectLocationToDashTo(token: TokenPF2e): Promise<Point> {

    // @ts-expect-error speed does exist on actor attributes
    const landSpeed = token?.actor?.system.attributes.speed.total;

    const moveLocation = await Sequencer.Crosshair.show({
        location: {
            obj: token,
            limitMaxRange: landSpeed * 2,
            limitMinRange: 0,
            wallBehavior: Sequencer.Crosshair.PLACEMENT_RESTRICTIONS.NO_COLLIDABLES,
            showRange: true,
            lockToEdge: false,
            lockToEdgeDirection: false,
            displayRangePoly: false,
            rangePolyFillAlpha: null,
            rangePolyFillColor: null,
            rangePolyLineAlpha: null,
            rangePolyLineColor: null,
            offset: {
                x: 0,
                y: 0
            }, 
        },
        icon: {
            texture: "icons/svg/wingfoot.svg" as ImageFilePath,
            borderVisible: false,
        },
        snap: {
            position: CONST.GRID_SNAPPING_MODES.CENTER,
            direction: 0,
            size: CONST.GRID_SNAPPING_MODES.CENTER
        },
        t: CONST.MEASURED_TEMPLATE_TYPES.CIRCLE
    }, {
        [Sequencer.Crosshair.CALLBACKS.COLLIDE]: (crosshair: CrosshairUpdatable) => {
            crosshair.updateCrosshair({
                "icon.texture": "icons/svg/cancel.svg"
            });
        },
        [Sequencer.Crosshair.CALLBACKS.STOP_COLLIDING]: (crosshair: CrosshairUpdatable) => {
            crosshair.updateCrosshair({
                "icon.texture": "icons/svg/wingfoot.svg"
            });
        },
        [Sequencer.Crosshair.CALLBACKS.CANCEL]: () => {
            ui.notifications.info("Sonic Dash Cancelled");
            return false;
        },
        // @ts-expect-error show can accepted undefined
        show: undefined,
        // @ts-expect-error move can accepted undefined
        move: undefined,
        // @ts-expect-error invalidPlacement can accepted undefined
        invalidPlacement: undefined
    });

    return moveLocation;
}

async function animateSonicDash(token: TokenPF2e, newLocation: Point) {

    const initialDelay = 1000;
    const dashAnimationTime = 250;
    const endDelay = 2000
    const combinedAnimationTime = initialDelay + dashAnimationTime;

    const tokenScaleX = token.document.texture.scaleX;
    const tokenScaleY = token.document.texture.scaleY;
    const halfGrid = canvas.grid.size / 2;
    const animateToX = newLocation.x - token.x - halfGrid;
    const animateToY = newLocation.y - token.y - halfGrid;

    const gustOfWind = "jb2a.gust_of_wind.veryfast";
    const puffRingAnimation = "jb2a.smoke.puff.ring.01.white.0";
    
    const sequence = new Sequence()
        .animation()
            .on(token)
            .opacity(0)
            .fadeIn(200)
            .duration(combinedAnimationTime)
        .effect()
            .copySprite(token)
            .animateProperty("sprite", "scale.x", { from : tokenScaleX, to: tokenScaleX, duration: initialDelay }) 
            .animateProperty("sprite", "scale.y", { from : tokenScaleY, to: tokenScaleY, duration: initialDelay })
            .animateProperty("sprite", "position.x", { from : 0, to: animateToX, duration: dashAnimationTime, ease: "easeInCubic", delay: initialDelay, gridUnits: false })
            .animateProperty("sprite", "position.y", { from : 0, to: animateToY, duration: dashAnimationTime, ease: "easeInCubic", delay: initialDelay, gridUnits: false })
            .animateProperty("sprite", "scale.x", { from : tokenScaleX, to: tokenScaleX, duration: endDelay, delay: combinedAnimationTime }) 
            .animateProperty("sprite", "scale.y", { from : tokenScaleY, to: tokenScaleY, duration: endDelay, delay: combinedAnimationTime })
        .effect()
            .delay(initialDelay)
            .file(gustOfWind)
            .atLocation(token)
            .stretchTo({ x: newLocation.x, y: newLocation.y, onlyX: true })
            .opacity(0.3)
        .effect()
            .file(puffRingAnimation)
            .atLocation({x: newLocation.x, y: newLocation.y})
            .delay(initialDelay + dashAnimationTime)
            .scaleToObject(2.2)
            .belowTokens(true)
            .zIndex(1)
            .fadeIn(100)
            .opacity(0.2)
            .fadeOut(200)
        .animation()
            .on(token)
            .teleportTo(newLocation, { delay: 0, relativeToCenter: true })
            .opacity(1)
            .fadeIn(endDelay)
            .delay(combinedAnimationTime)
        sequence.play();
}