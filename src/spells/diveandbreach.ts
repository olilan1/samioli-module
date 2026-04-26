import { MeasuredTemplateDocumentPF2e, TokenPF2e } from "foundry-pf2e";
import { Point } from "foundry-pf2e/foundry/common/_types.mjs";
import { MeasuredTemplateType } from "foundry-pf2e/foundry/common/constants.mjs";
import { delay, getCollidableCallbacks } from "../utils.ts";
import { getTemplateTokens, replaceTargets } from "../templatetarget.ts";

export async function startDiveAndBreach(token: TokenPF2e) {
    // clear user targets
    replaceTargets([]);

    ui.notifications.info("Select a dive location within 10 feet!"); 
    const firstLocation = await selectLocation(token, 10);
    if (!firstLocation) return;
    
    const firstTemplate = await createTemplate(firstLocation);
    const firstTargets = await getTemplateTokens(firstTemplate);

    ui.notifications.info("Select a breach location within 40 feet."); 
    const secondLocation = await selectLocation(firstLocation, 40);
    if (!secondLocation) {
        await firstTemplate.delete();
        return;
    }

    const secondTemplate = await createTemplate(secondLocation);
    const secondTargets = await getTemplateTokens(secondTemplate);

    ui.notifications.info("Select a landing location within 10 feet."); 
    const thirdLocation = await selectLocation(secondLocation, 10);
    if (!thirdLocation) {
        await firstTemplate.delete();
        await secondTemplate.delete();
        return;
    }

    // clear templates
    await delay(200);
    await firstTemplate.delete();
    await secondTemplate.delete();
    await delay(200);

    const firstLocationSequencer = getSequencerLocation(firstLocation);
    const secondLocationSequencer = getSequencerLocation(secondLocation);
    const thirdLocationSequencer = getSequencerLocation(thirdLocation);

    // Combine unique targets
    const targets = new Set([...firstTargets, ...secondTargets]);

    await doAnimation(token, firstLocation, secondLocation, firstLocationSequencer, secondLocationSequencer, thirdLocationSequencer);

    // add targets to user, excluding the caster
    const targetIds = Array.from(targets).map(t => t.id).filter(id => id !== token.id);
    replaceTargets(targetIds);
}

async function selectLocation(origin: Point | TokenPF2e, range: number): Promise<Point | false> {
    const icon = "icons/svg/target.svg";
    const selectedLocation = await Sequencer.Crosshair.show({
            fillColor: "#80b3ce",
            location: {
                obj: origin,
                limitMaxRange: range,
                wallBehavior: Sequencer.Crosshair.PLACEMENT_RESTRICTIONS.NO_COLLIDABLES
            },
            icon: {
                texture: icon
            }
        },
        getCollidableCallbacks("Dive and Breach", icon));

    if (!selectedLocation) return false;
    return { x: selectedLocation.x, y: selectedLocation.y };
}

function getSequencerLocation(location: Point): Point {
    const offset = canvas.scene!.grid.size / 2;
    return {
        x: location.x - offset,
        y: location.y - offset
    };
}

async function createTemplate(atLocation: Point): Promise<MeasuredTemplateDocumentPF2e> {
    const templateData = {
        t: "circle" as MeasuredTemplateType,
        x: atLocation.x,
        y: atLocation.y,
        distance: 5,
        direction: 0,
        fillColor: "#000000" as `#${string}`,
        borderColor: "#000000" as `#${string}`,
    };

    const myTemplate = await MeasuredTemplateDocument.create(templateData, { parent: canvas.scene });
    if (!myTemplate) {
        throw new Error("Failed to create template");
    }
    await delay(100);
    return myTemplate as MeasuredTemplateDocumentPF2e;
}

async function fileExistsAtPath(path: string | URL | Request) {
    try {
        const response = await fetch(path, { method: 'HEAD' });
        return response.ok; // Returns true if status code is 200-299, false otherwise
    } catch (error) {
        console.log("File not found at: " + path)
        return false; 
    }
}

async function doAnimation(token: TokenPF2e, firstLocation: Point, secondLocation: Point, firstLocationSequencer: Point, secondLocationSequencer: Point, thirdLocationSequencer: Point) {

    let rotation;

    if (token.x > firstLocationSequencer.x) {
        rotation = 220;
    } else if (token.x === firstLocationSequencer.x) {
        rotation = 180;
    } else {
        rotation = 140;
    }

    const spellSound = "sound/BG2-Sounds/sim_pulswater.wav";
    const entrySplashSound = "sound/NWN2-Sounds/pl_splash_idle01.WAV";
    const exitSplashSound ="sound/NWN2-Sounds/pl_splash_idle02.WAV";

    const spellSoundExists = await fileExistsAtPath(spellSound);
    const entrySplashSoundExists = await fileExistsAtPath(entrySplashSound);
    const exitSplashSoundExists = await fileExistsAtPath(exitSplashSound);

    await new Sequence()
        //cast spell sound
        .sound()
            .volume(0.7)
            .file(spellSound)
            .playIf(spellSoundExists)
        //cast spell animation
        .effect()
            .atLocation(token)
            .file("jb2a.cast_generic.water.02.blue")
            .belowTokens()
            .scale(1.1)
            .endTime(1200)
            .fadeIn(250)
            .fadeOut(250)
            .waitUntilFinished()
        //initial leap
        .animation()
            .on(token)
            .rotateIn(rotation, 500, { delay: 250 })
            .moveTowards(firstLocationSequencer, { ease: "easeInBack" })
            .duration(1000)
            .waitUntilFinished(0)
        //hide token on landing
        .animation()
            .on(token)
            .opacity(0)
        //entry splash sound
        .sound()
            .volume(0.5)
            .file(entrySplashSound)
            .playIf(entrySplashSoundExists)
        //entry splash effect
        .effect()
            .atLocation(firstLocation)
            .file("jb2a.liquid.splash.blue")
            .randomRotation()
            .scale(1.5)
            .waitUntilFinished(0)
        //exit splash sound
        .sound()
            .volume(0.5)
            .file(exitSplashSound)
            .playIf(exitSplashSoundExists)
        //exit splash
        .effect()
            .atLocation(secondLocation)
            .file("jb2a.liquid.splash.blue")
            .randomRotation()
            .scale(1.5)
            .waitUntilFinished(-3400)
        //teleport to next location and make visible
        .animation()
            .on(token)
            .rotate(0)
            .teleportTo(secondLocationSequencer)
            .opacity(1)
        //final leap to last location
        .animation()
            .on(token)
            .duration(500)
            .moveTowards(thirdLocationSequencer, { ease: "easeOutExpo" })
        .play();
}
