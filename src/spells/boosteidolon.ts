import { ActorPF2e, CharacterPF2e, ChatMessagePF2e, EffectPF2e, TokenPF2e } from "foundry-pf2e";
import { getLevelBasedDC, logd } from "../utils.ts";
import { createChatMessageWithButton } from "../chatbuttonhelper.ts";

export async function runBoostEidolonAutomation(chatMessage: ChatMessagePF2e) {

    logd("Running Boost Eidolon Automation...");

    logd("Chat Message Roll Options: ");
    logd(chatMessage.flags?.pf2e?.origin?.rollOptions);

    // Check if the spell is Boost Eidolon
    if (!chatMessage.flags?.pf2e?.origin?.rollOptions?.includes("origin:item:slug:boost-eidolon")) return;

    logd("Boost Eidolon spell detected in chat message.");

    // Find eidolon actor associated with the caster
    const casterActor = chatMessage.actor;
    if (!casterActor) return;
    const eidolonActor = getEidolonActor(casterActor);
    if (!eidolonActor) return;

    logd(`Found eidolon actor: ${eidolonActor.name}`);

    // Apply Boost Eidolon effect to the eidolon
    await createBoostEidolonEffectOnActor(eidolonActor);

    logd("Boost Eidolon Automation complete.");

    logd("Adding Button to extend boost into chat");

    const standardDCByLevel = getLevelBasedDC(casterActor.level);
    if (!eidolonActor) return;
    const tradition = getSpellTraditionByEidolonType(eidolonActor);
    if (!tradition) return;
    const skillCheckRequired = getSkillCheckByTradition(tradition);
    if (!skillCheckRequired) return;

    await createChatMessageWithButton({
        slug: `extend-boost-eidolon`,
        actor: casterActor,
        content: `Do you want to attempt to extend Boost Eidolon?`,
        button_label: `Roll skill ${skillCheckRequired} DC ${standardDCByLevel}`,
    });
}

function getEidolonActor(casterActor: ActorPF2e): ActorPF2e | null {

    // @ts-expect-error modules exists when pf2e-toolbelt is installed and eidolon is linked with summoner
    const sharedActors: Set<string> | undefined = (casterActor.modules)?.["pf2e-toolbelt"]?.shareData?.slaves;

    if (!sharedActors || sharedActors.size === 0) {
        ui.notifications.warn(`${casterActor.name} does not have any shared actors.`);
        return null;
    }

    if (sharedActors.size === 1) {
        const uuid = sharedActors.values().next().value;
        if (!uuid) {
            logd(`${casterActor.name} has a shared actors Set, but no valid UUID found.`);
            return null;
        }
        logd(`${casterActor.name} has one shared actor: ${uuid}`);
        const eidolonId = uuid.split(".")[1];
        const eidolonActor = game.actors.get(eidolonId);

        if (!eidolonActor) {
            ui.notifications.error(`Could not find an Actor with ID: ${eidolonId}`);
            return null;
        }
        return eidolonActor;
    }

    ui.notifications.error(`${casterActor.name} has multiple shared actors (${sharedActors.size}). Unable to determine which is the Eidolon.`);
    return null;
}

async function createBoostEidolonEffectOnActor(eidolonActor: ActorPF2e) {

    logd("Creating Boost Eidolon effect on actor...");

    if (eidolonActor.items.some(item => item.type === "effect" && item.slug === "spell-effect-boost-eidolon")) {

        logd("Boost Eidolon effect already exists on actor.");
        return;
    }

    logd("No Existing Boost Eidolon effect found on actor. Creating new effect...");
    
    const boostEidolonSpellEffectId = "h0CKGrgjGNSg21BW";
    const compendiumPack = game?.packs?.get("pf2e.spell-effects");
    if (!compendiumPack) {
        logd("Compendium not found in Game.");
        return;
    }

    const boostEidolonEffect = await compendiumPack.getDocument(boostEidolonSpellEffectId);
    if (!boostEidolonEffect){
        logd("Boost Eidolon effect not found in Compendium pack.");
        return;
    }

    logd(`Adding Boost Eidolon effect to actor: ${eidolonActor.name}`);

    await eidolonActor.createEmbeddedDocuments("Item", [boostEidolonEffect.toObject()]);
}

export async function extendBoostEidolon(chatMessage: ChatMessagePF2e) {

    logd("Extend boost button clicked.");

    const summonerActor = chatMessage.actor;
    if (!summonerActor) return;

    if (summonerActor.type !== "character") return;
    const summonerCharacterActor = summonerActor as CharacterPF2e;

    logd(`Number of focus points: ${summonerCharacterActor.system.resources.focus.value}`);
    logd(`summonerCharacterActor.name: ${summonerCharacterActor.name}`);
    // Check if Summoner has focus points
    const hasFocusPoints = summonerCharacterActor.system.resources.focus.value > 0;
    if (!hasFocusPoints) {
        ui.notifications?.warn("Not enough Focus Points to extend Boost Eidolon.");
        return;
    }

    const standardDCByLevel = getLevelBasedDC(summonerCharacterActor.level);
    logd(`Standard DC by level: ${standardDCByLevel}`);
    const eidolonActor = getEidolonActor(summonerActor);
    if (!eidolonActor) return;
    const tradition = getSpellTraditionByEidolonType(eidolonActor);
    if (!tradition) return;
    logd(`Tradition: ${tradition}`);
    const skillCheckRequired = getSkillCheckByTradition(tradition);
    if (!skillCheckRequired) return;
    logd(`Skill Check Required: ${skillCheckRequired}`);
    
    const skill = summonerCharacterActor.skills[skillCheckRequired];
    if (!skill) return;

    await skill.roll({
        dc: { 
            value: standardDCByLevel,
            label: `Extend Boost DC`
        },
        callback: async (roll) => {
            if (!roll.options.degreeOfSuccess) return;
            if (roll.options.degreeOfSuccess === 2 ) {
                await extendBoostEidolonEffectDuration(eidolonActor, "success");
                await reduceFocusPoints(summonerCharacterActor);
            } else if (roll.options.degreeOfSuccess === 3) {
                await extendBoostEidolonEffectDuration(eidolonActor, "criticalSuccess");
                await reduceFocusPoints(summonerCharacterActor);
            } else {
                return;
            }
        }
    });
}

async function extendBoostEidolonEffectDuration(eidolonActor: ActorPF2e, degreeOfSuccess: "success" | "criticalSuccess") {
    
    logd(`Extending Boost Eidolon effect duration for ${eidolonActor.name} on ${degreeOfSuccess}`);

    const boostEidolonEffect = eidolonActor.items.find(item => item.type === "effect" 
        && item.slug === "spell-effect-boost-eidolon") as EffectPF2e;
    if (!boostEidolonEffect) return;

    if (degreeOfSuccess === "success") {
        await boostEidolonEffect.update({"system.duration.value": 3})
    } else if (degreeOfSuccess === "criticalSuccess") {
        await boostEidolonEffect.update({"system.duration.value": 4})
    }
}
async function reduceFocusPoints(summonerActor: CharacterPF2e) {
    const currentFocusPoints = summonerActor.system.resources.focus.value;
    if (currentFocusPoints > 0) {
        await summonerActor.update({"system.resources.focus.value": currentFocusPoints - 1});
    }
}

function getSpellTraditionByEidolonType(eidolonActor: ActorPF2e): string | null {

    const rollOptionsObject = eidolonActor.flags.pf2e.rollOptions.all;
    const rollOptionKeys = Object.keys(rollOptionsObject);
    
    const eidolonTypeOption = rollOptionKeys.find(option => option.startsWith("self:ancestry"));
    if (!eidolonTypeOption) return null;
    const eidolonType = eidolonTypeOption.split(":")[2];

    switch (eidolonType) {
        case "angel-eidolon":
            return "divine";
        case "anger-phantom-eidolon":
            return "occult";
        case "beast-eidolon":
            return "primal";
        case "construct-eidolon":
            return "arcane";
        case "demon-eidolon":
            return "divine";
        case "devotion-phantom-eidolon":
            return "occult";
        case "dragon-eidolon":
            return "arcane";
        case "elemental-eidolon":
            return "primal";
        case "fey-eidolon":
            return "primal";
        case "plant-eidolon":
            return "primal";
        case "psychopomp-eidolon":
            return "divine";
        case "swarm-eidolon":
            return "primal";
        case "undead-eidolon":
            return "divine";
        default:
            return null;
    }
}

function getSkillCheckByTradition(tradition: string): string | null {
    switch (tradition) {
        case "arcane":
            return "arcana";
        case "divine":
            return "religion";
        case "occult":
            return "occultism";
        case "primal":
            return "nature";
        default:
            return null;
    }
}