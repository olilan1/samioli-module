import { ChatMessagePF2e, CreaturePF2e, TokenPF2e } from "foundry-pf2e";

const TELEPORT_SOUND = "sound/NWN2-Sounds/sfx_Teleportation.wav";

export async function startTranslocate(token: TokenPF2e, message: ChatMessagePF2e) {
    const rankString = message.flags.pf2e?.origin?.rollOptions
        ?.find(opt => opt.startsWith("origin:item:rank:"))
        ?.replace("origin:item:rank:", "");
    const rank = rankString ? parseInt(rankString, 10) : 0;
    const maxRange = rank < 5 ? 120 : 10000;
    await teleport(token, maxRange, "icons/magic/symbols/ring-circle-smoke-blue.webp");
}

export async function startWarpStep(token: TokenPF2e, _message: ChatMessagePF2e) {
    const maxRange = (((token.actor) as CreaturePF2e).movement.speeds.land.value + 10) * 2;
    await teleport(token, maxRange, "systems/pf2e/icons/spells/warp-step.webp");
}

async function teleport(token: TokenPF2e, maxRange: number, icon: string) {
    const destination = await selectDestination(token, maxRange, icon);
    if (!destination) return;

    await Sequencer.Preloader.preloadForClients([
        "jb2a.cast_generic.01.blue.0",
        "jb2a.portals.vertical.vortex.blue",
    ]);
    const angle = destination.direction + 90;
    const portalScale = (token.w / canvas.grid.size) * 0.6

    // TODO: Make this look right for large creatures

    new Sequence()
        .sound()
            .file(TELEPORT_SOUND)
            .volume(0.5)
        .effect()
            .file("jb2a.cast_generic.01.blue.0")
            .atLocation(token)
            .scale(portalScale * 0.7)
            .opacity(0.7)
            .waitUntilFinished(-200)
        .effect()
            .file("jb2a.portals.vertical.vortex.blue")
            .atLocation(token, { cacheLocation: true })
            .name("Portal In")
            .center()
            .spriteOffset({ x: 0, y: -0.5 }, { gridUnits: true })
            //@ts-expect-error rotationOffset is valid
            .rotateTowards(destination, { rotationOffset: 90 })
            .scale(portalScale)
            .duration(1200)
            .fadeIn(200)
            .fadeOut(500)
            .belowTokens()
        .effect()
            .copySprite(token)
            .atLocation(token)
            .shape("circle", {
                radius: 0.8,
                gridUnits: true,
                fillColor: "#ffffff",
                isMask: true,
            })
            .rotate(-angle)
            .spriteRotation(-angle)
            .duration(1000)
            .animateProperty("sprite", "position.y", {
                from: 0,
                to: -1,
                duration: 750,
                gridUnits: true,
                fromEnd: true,
            })
            .scale(token.document.texture.scaleX)
            .waitUntilFinished(-750)
        .animation()
            .on(token)
            .opacity(0)
        .effect()
            .file("jb2a.portals.vertical.vortex.blue")
            .atLocation(destination)
            .name("Portal Out")
            .center()
            .spriteOffset({ x: 0, y: -0.5 }, { gridUnits: true })
            //@ts-expect-error rotationOffset is valid
            .rotateTowards(token, { rotationOffset: 90 })
            .scale(portalScale)
            .duration(1200)
            .fadeIn(200)
            .fadeOut(500)
            .belowTokens()
        .effect() //location.rotationFromOrigin
            .copySprite(token)
            .scale(token.document.texture.scaleX)
            .atLocation(destination)
            .shape("circle", {
                radius: 0.8,
                gridUnits: true,
                fillColor: "#ffffff",
                isMask: true,
            })
            .rotate(-angle)
            .spriteRotation(-angle)
            .animateProperty("sprite", "position.y", {
                from: 1,
                to: 0,
                duration: 750,
                gridUnits: true,
            })
            .duration(1000)
            .waitUntilFinished(-250)
        .animation()
            .on(token)
            .teleportTo(destination) // Teleport to location
            .snapToGrid()
            .opacity(1)
        .play()
}

async function selectDestination(token: TokenPF2e, maxRange: number, icon: string) {
    return await Sequencer.Crosshair.show({
        location: {
            obj: token,
            limitMaxRange: maxRange
        },
        icon: {
            texture: icon
        }
    });
}