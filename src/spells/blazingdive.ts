import { TokenPF2e } from "foundry-pf2e";
import { CrosshairUpdatable, CustomTemplateData } from "../types.ts";
import { createTemplate, delay, getTokenIdsFromTokens } from "../utils.ts";
import { getTemplateTokens, replaceTargets } from "../templatetarget.ts";
import { Point } from "foundry-pf2e/foundry/common/_types.mjs";

export async function startBlazingDive(token: TokenPF2e) {

    const locationOfTemplate = await getLocationForSpell(token);
    if (!locationOfTemplate) return;

    const templateData = createCustomTemplateData(locationOfTemplate);
    const template = await createTemplate(templateData);

    // Store tokens from template
    const targetTokens = await getTemplateTokens(template);
    // Remove targets from caster
    await replaceTargets([]);

    // delete template
    await template.delete();

    // run animation sequence
    await animateBlazingDive(token, locationOfTemplate);
    // add stored tokens as targets to caster
    replaceTargets(getTokenIdsFromTokens(targetTokens));
}

function createCustomTemplateData(location: Point): CustomTemplateData {

    const templateData: CustomTemplateData = {
        t: "circle",
        x: location.x,
        y: location.y,
        width: 0,
        distance: 10,
        direction: 0,
        fillColor: "#f59042",
        borderColor: "#f59042",
        flags: {
            pf2e: {
                origin: {
                    name: "Blazing Dive",
                    slug: "blazing-dive"
                }
            }
        }
    };
    return templateData;
}

async function getLocationForSpell(token: TokenPF2e): Promise<Point | false> {
    const selectedLocation = await Sequencer.Crosshair.show({
            distance: 13, // Needed to have the highlight select the correct grids
            fillColor: "#f59042",
            location: {
                obj: token,
                limitMaxRange: 60,
                limitMinRange: 0,
                wallBehavior: Sequencer.Crosshair.PLACEMENT_RESTRICTIONS.NO_COLLIDABLES,
            },
            snap: {
                position: CONST.GRID_SNAPPING_MODES.CENTER
            }, 
            gridHighlight: true
        }, {
            [Sequencer.Crosshair.CALLBACKS.COLLIDE]: (crosshair: CrosshairUpdatable) => {
                crosshair.updateCrosshair({
                    "icon.texture": "icons/svg/cancel.svg"
                })
            },
            [Sequencer.Crosshair.CALLBACKS.STOP_COLLIDING]: (crosshair: CrosshairUpdatable) => {
                crosshair.updateCrosshair({
                    "icon.texture": ""
                })
            },
            [Sequencer.Crosshair.CALLBACKS.CANCEL]: () => {
                ui.notifications.warn("Blazing Dive cancelled.");
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

async function animateBlazingDive(caster: TokenPF2e, 
    locationOfTemplate: Point) {
    const halfGrid = canvas.grid.size / 2;
    const initialDelay = 1000;
    const setupJumpAnimationTime = 1000;
    const launchAnimationTime = 1500;
    const flyAnimationTime = 300;
    const combinedAnimationTime = initialDelay + setupJumpAnimationTime + launchAnimationTime + flyAnimationTime;
    const endDelay = 2000
    const blastAnimation = "jb2a.cast_generic.fire.side01.orange.0";
    const explosionAnimation = "jb2a.explosion.orange.3";
    const groundCracksAnimation = "jb2a.ground_cracks.03.orange";
    const jumpPuffAnimation = "jb2a.smoke.puff.ring.01.white.0"
    const tokenScaleX = caster.document.texture.scaleX;
    const tokenScaleY = caster.document.texture.scaleY;
    const animateToX = locationOfTemplate.x - caster.x;
    const animateToY = locationOfTemplate.y - caster.y;

    const jumpYBuffer = -80;
    let jumpXBuffer = -30; 

    if (animateToX < 0) {
        jumpXBuffer = 30;
    }

    const sequence = new Sequence()
        // hide caster token
        .animation()
            .on(caster)
            .opacity(0)
            .fadeIn(200)
            .duration(combinedAnimationTime)
        // create effect on caster
        .effect()
            .copySprite(caster)
            // pause for a moment
            .animateProperty("sprite", "scale.x", { from : tokenScaleX, to: tokenScaleX, duration: initialDelay }) 
            .animateProperty("sprite", "scale.y", { from : tokenScaleY, to: tokenScaleY, duration: initialDelay })
            // small shrink before the jump
            .animateProperty("sprite", "scale.x", { from : 1, to: 0.8, duration: setupJumpAnimationTime, ease: "easeOutQuart", delay: initialDelay }) 
            .animateProperty("sprite", "scale.y", { from : 1, to: 0.8, duration: setupJumpAnimationTime, ease: "easeOutQuart", delay: initialDelay })
            // animate caster moving up
            .animateProperty("sprite", "scale.x", { from : 1, to: 4, duration: launchAnimationTime, ease: "easeOutQuart", delay: initialDelay + setupJumpAnimationTime, }) 
            .animateProperty("sprite", "scale.y", { from : 1, to: 4, duration: launchAnimationTime, ease: "easeOutQuart", delay: initialDelay + setupJumpAnimationTime, })
            // slight adjustment in x/y to simulate upward movement
            .animateProperty("sprite", "position.x", { from : 0, to: jumpXBuffer, duration: launchAnimationTime, ease: "easeOutQuart", delay: initialDelay + setupJumpAnimationTime, gridUnits: false })
            .animateProperty("sprite", "position.y", { from : 0, to: jumpYBuffer, duration: launchAnimationTime, ease: "easeOutQuart", delay: initialDelay + setupJumpAnimationTime, gridUnits: false })
            // animate caster moving to template location
            .animateProperty("sprite", "position.x", { from : 0, to: animateToX - jumpXBuffer - halfGrid, duration: flyAnimationTime, ease: "easeInCubic", delay: initialDelay + setupJumpAnimationTime + launchAnimationTime, gridUnits: false})
            .animateProperty("sprite", "position.y", { from : 0, to: animateToY - jumpYBuffer - halfGrid, duration: flyAnimationTime, ease: "easeInCubic", delay: initialDelay + setupJumpAnimationTime + launchAnimationTime, gridUnits: false })
            // animate caster landing explosively
            .animateProperty("sprite", "scale.x", { from : 1, to: 0.3, duration: flyAnimationTime, ease: "easeInCubic", delay: initialDelay + setupJumpAnimationTime + launchAnimationTime })
            .animateProperty("sprite", "scale.y", { from : 1, to: 0.3, duration: flyAnimationTime, ease: "easeInCubic", delay: initialDelay + setupJumpAnimationTime + launchAnimationTime })
            // keep the effect in action for a little longer
            .animateProperty("sprite", "scale.x", { from : 1, to: 1, duration: endDelay, delay: combinedAnimationTime })
            .animateProperty("sprite", "scale.y", { from : 1, to: 1, duration: endDelay, delay: combinedAnimationTime })
            // fade out effect
            .animateProperty("sprite", "opacity", { from : 1, to: 0, duration: endDelay, delay: combinedAnimationTime + endDelay })
        // create smoke puff at caster location
        .effect()
            .file(jumpPuffAnimation)
            .atLocation(caster)
            .scale(1)
            .belowTokens()
            .opacity(0.5)
            .delay(initialDelay + setupJumpAnimationTime)
        // create blast effect on way to template
        .effect()
            .file(blastAnimation)
            .atLocation({x: caster.center.x + jumpXBuffer, y: caster.center.y + jumpYBuffer})
            .delay(initialDelay + setupJumpAnimationTime + launchAnimationTime - 800)
            .rotateTowards(locationOfTemplate)
            .rotate(180)
            .scale(0.5)
        // create explosion template
        .effect()
            .file(explosionAnimation)
            .atLocation(locationOfTemplate)
            .scale(1.5)
            .delay(combinedAnimationTime)
        // add ground cracks
        .effect()
            .file(groundCracksAnimation)
            .atLocation(locationOfTemplate)
            .delay(combinedAnimationTime + 200)
            .fadeIn(500)
            .scale(1.5)
            .opacity(0.5)
            .belowTokens()
            .duration(5000)
            .fadeOut(1500)
        // shake screen
        .canvasPan()
            .shake()
            .delay(combinedAnimationTime)
        .animation()
            .on(caster)
            // teleport actor to new location
            .teleportTo(locationOfTemplate, { delay: 0, relativeToCenter: true })
            // make caster visible
            .opacity(1)
            .fadeIn(endDelay)
            .delay(combinedAnimationTime)
    sequence.play();
    
    await delay(combinedAnimationTime + endDelay + 500);
    
}