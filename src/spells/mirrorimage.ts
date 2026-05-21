import { ChatMessagePF2e, EffectPF2e, TokenPF2e } from "foundry-pf2e";
import { createChatMessageWithButton } from "../chatbuttonhelper.ts";

interface MirrorImageChanges {
    system?: {
        badge?: {
            value?: number;
        };
    };
}

interface MirrorImageRollFlags {
    type: "mirror-image-roll";
    targetTokenId: string;
    outcome: string;
    imagesCount: number;
}

/** Decrements the mirror image badge count, or deletes the effect if it reaches 0. */
async function decrementOrDeleteEffect(effect: EffectPF2e): Promise<void> {
    const badgeVal = Number(effect.system.badge?.value ?? 0);
    if (badgeVal > 1) {
        await effect.update({ "system.badge.value": badgeVal - 1 });
    } else {
        await effect.delete();
    }
}

export async function checkForMirrorImage(chatMessage: ChatMessagePF2e): Promise<void> {
    const context = chatMessage.flags.pf2e.context;
    if (!context || context.type !== "attack-roll") return;

    const targetToken = chatMessage.target?.token?.object;
    const targetActor = targetToken?.actor;
    if (!targetActor || !targetToken) return;

    const effect = targetActor.itemTypes.effect.find(
        (e) => e.slug === "spell-effect-mirror-image"
    );
    if (!effect) return;

    const imagesCount = effect.system.badge?.value;
    if (typeof imagesCount !== "number" || imagesCount <= 0) return;

    const outcome = context.outcome;
    if (outcome === "criticalFailure") return;

    if (outcome === "failure") {
        await decrementOrDeleteEffect(effect);

        const updatedImageCount = imagesCount - 1;
        let msgContent = `The attack missed but destroys a <strong>Mirror Image</strong>.`;
        msgContent += ` ${updatedImageCount} images remain.`;

        await ChatMessage.create({
            content: msgContent,
            speaker: ChatMessage.getSpeaker({ token: targetToken.document })
        });
    } else if (outcome === "success" || outcome === "criticalSuccess") {
        const content = `Roll to see if the attack hits an image instead!` +
            `(Remaining Images: ${imagesCount})`;
        await createChatMessageWithButton({
            slug: "roll-mirror-image",
            actor: targetActor,
            content,
            button_label: "Roll Mirror Image Check",
            params: [targetToken.id, outcome, String(imagesCount)]
        });
    }
}

export async function handleMirrorImageRoll(
    _message: ChatMessagePF2e,
    targetTokenId: string,
    outcome: string,
    imagesCountStr: string
): Promise<void> {
    const targetToken = canvas.scene?.tokens.get(targetTokenId)?.object;
    if (!targetToken?.actor) return;

    const imagesCount = parseInt(imagesCountStr, 10);
    const formula = imagesCount === 3 ? "1d4" : "1d6";

    const roll = await new Roll(formula).evaluate();
    await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ token: targetToken.document }),
        flavor: `Mirror Image Check (Remaining Images: ${imagesCount})`,
        flags: {
            "samioli-module": {
                type: "mirror-image-roll",
                targetTokenId,
                outcome,
                imagesCount
            }
        }
    });
}

export async function resolveMirrorImageRoll(message: ChatMessagePF2e): Promise<void> {
    const flags = (message.flags?.["samioli-module"] as unknown) as
        MirrorImageRollFlags | undefined;
    if (flags?.type !== "mirror-image-roll") return;

    const { targetTokenId, outcome, imagesCount } = flags;
    const targetToken = canvas.scene?.tokens.get(targetTokenId)?.object;
    if (!targetToken?.actor) return;

    const rollResult = message.rolls[0]?.total;
    if (rollResult === undefined) return;

    const hitTarget = rollResult <= (4 - imagesCount);

    if (hitTarget) {
        await ChatMessage.create({
            content: `The attack bypassed the mirror images!`,
            speaker: ChatMessage.getSpeaker({ token: targetToken.document })
        });
    } else {
        const effect = targetToken.actor.itemTypes.effect.find(
            (e) => e.slug === "spell-effect-mirror-image"
        );
        if (effect) {
            await decrementOrDeleteEffect(effect);
        }

        let msgContent = `A Mirror Image was destroyed!`;
        if (outcome === "criticalSuccess") {
            msgContent = `A Mirror Image was destroyed,` +
                ` and the <strong>Critical Success</strong>` +
                ` becomes a <strong>Success</strong>!`;
        }
        const updatedImageCount = imagesCount - 1;
        msgContent += ` ${updatedImageCount} images remain.`;

        await ChatMessage.create({
            content: msgContent,
            speaker: ChatMessage.getSpeaker({ token: targetToken.document })
        });
    }
}

export async function handleMirrorImageCreated(item: EffectPF2e): Promise<void> {
    if (item.slug !== "spell-effect-mirror-image") return;
    const token = item.actor?.getActiveTokens()[0];
    if (!token) return;

    const imagesCount = Number(item.system.badge?.value ?? 3);

    const seq = new Sequence()
        .effect()
        .file("jb2a.impact.004.blue")
        .atLocation(token)
        .fadeIn(500)
        .tieToDocuments([item])
        .randomRotation()
        .fadeOut(1500)
        .effect()
        .file("jb2a.extras.tmfx.runes.circle.simple.illusion")
        .atLocation(token)
        .duration(2000)
        .fadeIn(500)
        .fadeOut(1500)
        .tieToDocuments([item])
        .scale(0.5)
        .filter("Glow", { color: 0x0096ff })
        .scaleIn(0, 500, { ease: "easeOutCubic" })
        .waitUntilFinished(-1000);

    for (let i = 0; i < imagesCount; i++) {
        seq.addSequence(getMirrorImageSequence(i, item, token));
    }

    await seq.play();
}

export async function handleMirrorImageUpdated(
    item: EffectPF2e,
    changes: MirrorImageChanges
): Promise<void> {
    if (item.slug !== "spell-effect-mirror-image") return;
    const rawBadgeValue = changes?.system?.badge?.value;
    if (rawBadgeValue === undefined) return;

    const badgeValue = Number(rawBadgeValue);
    if (isNaN(badgeValue)) return;

    const token = item.actor?.getActiveTokens()[0];
    if (!token) return;

    const activeEffects = Sequencer.EffectManager.getEffects({ origin: item.uuid });
    const currentOnScreen = activeEffects.length;

    if (badgeValue < currentOnScreen) {
        const effectToEnd = activeEffects[activeEffects.length - 1];
        if (effectToEnd) {
            await Sequencer.EffectManager.endEffects({ effects: effectToEnd });
        }
    } else if (badgeValue > currentOnScreen) {
        for (let i = currentOnScreen; i < badgeValue; i++) {
            await new Sequence()
                .addSequence(getMirrorImageSequence(i, item, token))
                .play();
        }
    }
}

export async function handleMirrorImageDeleted(item: EffectPF2e): Promise<void> {
    if (item.slug !== "spell-effect-mirror-image") return;
    await Sequencer.EffectManager.endEffects({ origin: item.uuid });
}

function getMirrorImageSequence(number: number, item: EffectPF2e, token: TokenPF2e) {
    const scaleX = token.document.texture.scaleX;
    const followRotation = !token.document.lockRotation;

    return new Sequence()
        .effect()
        .name(`Mirror Image Nr.${1 + number}`)
        .copySprite(token)
        .origin(item.uuid)
        .fadeIn(1000)
        .tieToDocuments([item])
        .fadeOut(1000)
        .attachTo(token, { followRotation })
        .persist(true, { persistTokenPrototype: true })
        .loopProperty("spriteContainer", "rotation", {
            from: 0,
            to: 360,
            duration: 4000,
        })
        .loopProperty("sprite", "position.x", {
            values: [0, -1],
            duration: Math.floor(Math.random() * (4000 - 500 + 1)) + 500,
            gridUnits: true,
            pingPong: true,
        })
        .spriteOffset({ x: 0.5, y: 0 }, { gridUnits: true })
        .rotate(120 * (1 + number))
        .spriteRotation(120 * (1 + number))
        .zeroSpriteRotation()
        .scaleToObject(scaleX)
        .opacity(0.5);
}
