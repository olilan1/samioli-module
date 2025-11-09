import { ActorPF2e, ChatMessagePF2e, EffectSource } from "foundry-pf2e";
import { ImageFilePath } from "foundry-pf2e/foundry/common/constants.mjs";
import { addOrUpdateEffectOnActor, performFlatCheck } from "./utils.ts";
import { replaceTargets } from "./templatetarget.ts";

export function replaceUnstableCheckWithStrainCheck(chatMessage: ChatMessagePF2e, html: JQuery<HTMLElement>) {

    const rollOptions = chatMessage.flags.pf2e?.context?.options 
        ?? chatMessage.flags.pf2e?.origin?.rollOptions;
    if (!rollOptions) return;

    if (rollOptions.includes("origin:item:trait:unstable") 
        || rollOptions.includes("self:action:trait:unstable")) {

        const flatCheckLink = html.find('a.inline-check[data-pf2-dc="15"][data-pf2-check="flat"]');

        if (!flatCheckLink.length) return;
        const strainDC = getStrainDC(chatMessage.actor!);

        const button = $(`<a class="inline-check unstable-action-button"><i class="fa-solid fa-screwdriver-wrench"></i> Strain Check DC ${strainDC}</a>`);

        button.on("click", async () => {
            rollAgainstStrainDC(chatMessage.actor!);
        });

        flatCheckLink.replaceWith(button);
    }
}

function getStrainDC(actor: ActorPF2e) : number {
    let dc = 7;
    const strainEffect = actor.items.find(item => 
        item.type === "effect" && item.system.slug === "samioli-strain");  
    dc += (strainEffect?.system.level?.value ?? 0) * 5;
    return dc;  
}

async function rollAgainstStrainDC(actor: ActorPF2e) {
    const strainDC = getStrainDC(actor);
    await performFlatCheck(actor, strainDC, "Strain Check", ["samioli-unstable-check", "unstable-check"]);
}

export function handleHomebrewUnstableCheckResult(chatMessage: ChatMessagePF2e) {

    const rollOptions = chatMessage.flags.pf2e?.context?.options;
    if (!rollOptions || !rollOptions.includes("samioli-unstable-check")) return;
    
    const actor = chatMessage.actor!;
    const outcome = chatMessage.flags.pf2e?.context?.outcome;

    if (outcome === "failure" || outcome === "criticalFailure" ) {
        // Note that unstable effect is applied by checkForUnstableCheck function in unstablecheck.ts
        const strainEffect = actor.items.find(item => item.type === "effect" 
            && item.system.slug === "samioli-strain");  
        if (strainEffect) {  
            strainEffect.delete();  
        }  
        if (outcome === "criticalFailure") {  
            createFireDamageChatMessage(actor);  
        }
    } else {
        const strainEffect = actor.items.find(item => item.type === "effect" 
            && item.system.slug === "samioli-strain");
        if (strainEffect) {
            const currentLevel = strainEffect.system.level?.value ?? 1;
            const newLevel = currentLevel + 1;
            strainEffect.update({"system.level.value": newLevel });
            strainEffect.update({"name": `Strain ${newLevel}`});
        } else {
            const strainEffectData = buildStrainEffect();
            addOrUpdateEffectOnActor(actor, strainEffectData);
        }
    } 
}

async function createFireDamageChatMessage(actor: ActorPF2e) {
    const actorLevel = actor.system.details.level.value;
    const damage = Math.floor(actorLevel / 2);

    const DamageRoll = CONFIG.Dice.rolls.find((r) => r.name === "DamageRoll");
    if (!DamageRoll) return;

    const fireDamageRoll = new DamageRoll(`{${damage}[fire]}`);

    const currentTargets = [...game.user.targets];

    await fireDamageRoll.toMessage({
        flavor: `On a critical failure for an unstable check, you take fire damage equal to half your level.`,
        speaker: ChatMessage.getSpeaker({ actor: actor }),
        flags: {
            pf2e: {
                context: {
                    type: "damage-roll"
                }
            },
            "samioli-module": {
                unstableCheckCriticalFailure: true
            }
        }
    });

    const hookFunction = async (chatMessage: ChatMessagePF2e) => {
        if (chatMessage.flags["samioli-module"]?.unstableCheckCriticalFailure){
            await replaceTargets([...currentTargets.map(t => t.id)]);
            Hooks.off("renderChatMessage", hookFunction);
        }
    };

    Hooks.on("renderChatMessage", hookFunction);
}


function buildStrainEffect() {

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