import { ActorPF2e, ChatMessagePF2e, EffectSource } from "foundry-pf2e";
import { ImageFilePath } from "foundry-pf2e/foundry/common/constants.mjs";
import { addOrUpdateEffectOnActor, performFlatCheck } from "./utils.ts";
import { createChatMessageWithButton } from "./chatbuttonhelper.ts";

export function checkIfUnstableActionAndHandle(chatMessage: ChatMessagePF2e, html: JQuery<HTMLElement>) {
    
    const rollOptions = chatMessage.flags.pf2e?.origin?.rollOptions;
    if (!rollOptions) return;
    if (rollOptions.includes("origin:item:trait:unstable") || 
    rollOptions.includes("self:action:trait:unstable")) {

        const flatCheckLink = html.find('a.inline-check[data-pf2-dc="15"][data-pf2-check="flat"]');

        if (!flatCheckLink.length) return;

        const button = $(`<a class="inline-check unstable-action-button"><i class="fa-solid fa-screwdriver-wrench"></i> Strain Check</a>`);

        button.on("click", async () => {
            if (!chatMessage.actor) return;
            calculateStrainValueAndRoll(chatMessage.actor);
        });

        flatCheckLink.replaceWith(button);

    }
}

async function calculateStrainValueAndRoll(actor: ActorPF2e) {

    if (actor.items.some(item => item.type === "effect" 
    && item.system.slug === "effect-unstable-check-failure")) {
        ui.notifications.info("You have already failed an Unstable Check. You cannot take Unstable Actions until you spend 10 minutes retuning your innovation.");
        return;
    }

    let dc = 7;
    const hasStrainEffect = actor.items.some(item => 
        item.type === "effect" && item.system.slug === "samioli-strain"
    );

    if (hasStrainEffect) {
        const strainEffect = actor.items.find(item => item.type === "effect" 
        && item.system.slug === "samioli-strain");
        
        if (strainEffect) {
            const strainValue = strainEffect.system.level?.value;
            if (strainValue) {
                dc += (strainValue * 5);
            }
        }
    }

    await performFlatCheck(actor, dc, "Strain Check", ["samioli-unstable-check", "unstable-check"]);

}

export function extractActorAndRollUnstableCheckHomebrew(chatMessage: ChatMessagePF2e) {
    if (!chatMessage.actor) return;
    calculateStrainValueAndRoll(chatMessage.actor);
}

export function checkIfUnstableCheckHomebrewAndHandle(chatMessage: ChatMessagePF2e) {

    const rollOptions = chatMessage.flags.pf2e?.context?.options;
    if (!rollOptions || !rollOptions.includes("samioli-unstable-check")) return;

    const actor = chatMessage.actor;
    if (!actor) return;

    if (chatMessage.flags?.pf2e?.context?.outcome === "failure" 
    || chatMessage.flags?.pf2e?.context?.outcome === "criticalFailure" ) {
        // Unstable effect logic is handled by unstable check automation in unstablecheck.ts
        const strainEffect = actor.items.find(item => item.type === "effect" 
        && item.system.slug === "samioli-strain");
        if (chatMessage.flags?.pf2e?.context?.outcome === "criticalFailure") {
            createFireDamageChatMessage(actor);
        }
        if (!strainEffect) return;
        strainEffect.delete();
    } else {
        const strainEffect = actor.items.find(item => item.type === "effect" 
        && item.system.slug === "samioli-strain");
        if (strainEffect) {
            const currentLevel = strainEffect.system.level?.value || 1;
            const newLevel = currentLevel + 1;
            strainEffect.update({"system.level.value": newLevel });
            strainEffect.update({"name": `Strain ${newLevel}`});
        } else {
            const strainEffectData = getStrainEffect();
            addOrUpdateEffectOnActor(actor, strainEffectData);
        }
    } 
}

export async function checkIfUnstableAttackAndHandle(chatMessage: ChatMessagePF2e) {

    const context = chatMessage.flags.pf2e?.context;

    if (context && "traits" in context && Array.isArray(context.traits)) {
        if (context.traits.includes("unstable")) {
            const actor = chatMessage.actor;
            if (!actor) return;

            await createChatMessageWithButton({
                slug: "unstable-check-homebrew",
                actor: actor,
                content: `When you take an Unstable action, attempt an Unstable Check immediately after applying its effects.`,
                button_label: "Roll Unstable Check"
            });
        }
    }
}

function createFireDamageChatMessage(actor: ActorPF2e) {
    const actorLevel = actor.system.details.level.value;
    const damage = Math.floor(actorLevel / 2);

    const DamageRoll = CONFIG.Dice.rolls.find((r) => r.name === "DamageRoll");
    if (!DamageRoll) return;

    const fireDamageRoll = new DamageRoll(`{${damage}[fire]}`);

    fireDamageRoll.toMessage({
        flavor: `On a critical failure for an unstable check, you take fire damage equal to half your level.`,
        speaker: ChatMessage.getSpeaker({ actor: actor }),
        flags: {
            pf2e: {
                context: {
                    type: "damage-roll",
                    target: {
                        actor: actor,
                        token: actor.token
                    }
                }
            }
        }
    });
}

function getStrainEffect() {

    const image = "icons/commodities/tech/metal-pipes.webp";

    const strainEffectData = {
        name: `Strain 1`,
        type: "effect",
        img: image as ImageFilePath,
        system: {
            slug: "samioli-strain",
            description: {
                value: `<p>The strain on your invention is building up. Taking more unstable actions could cause it to fail. The DC for Unstable Checks starts at 7 and increases by 5 for each level of strain.</p>`
            },
            level: {
                value: 1
            },
            tokenIcon: {
                show: true
            }
        }
    };

    return strainEffectData as DeepPartial<EffectSource> as EffectSource;
}