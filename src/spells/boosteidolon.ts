import { ActorPF2e, CharacterPF2e, ChatMessagePF2e, EffectPF2e } from "foundry-pf2e";
import { getLevelBasedDC, isCharacter, logd } from "../utils.ts";
import { createChatMessageWithButton } from "../chatbuttonhelper.ts";

type Tradition = "arcane" | "divine" | "occult" | "primal";
type MagicSkill = "arcana" | "religion" | "occultism" | "nature";

export async function runBoostEidolonAutomation(chatMessage: ChatMessagePF2e) {

    // Check if the spell is Boost Eidolon
    if (!chatMessage.flags?.pf2e?.origin?.rollOptions?.includes("origin:item:slug:boost-eidolon")) return;

    const summonerActor = chatMessage.actor;
    if (!summonerActor || !isCharacter(summonerActor)) return;
    
    // Don't add button if summoner has no focus points remaining
    const hasFocusPoints = summonerActor.system.resources.focus.value > 0;
    if (!hasFocusPoints) return;

    // Find eidolon actor associated with the summoner
    const eidolonActor = getEidolonActor(summonerActor);
    if (!eidolonActor) return;

    // Apply Boost Eidolon effect to the eidolon
    await createBoostEidolonEffectOnActor(eidolonActor);

    // Calculate standard DC based on summoner level
    const standardDCByLevel = getLevelBasedDC(summonerActor.level);
    const tradition = getSpellTraditionByEidolonType(eidolonActor);
    if (!tradition) return;
    const skillCheckRequired = getSkillCheckByTradition(tradition);

    // Localise skill name for chat message
    type SkillSlug = keyof typeof CONFIG.PF2E.skills;
    const skillKey = CONFIG.PF2E.skills[skillCheckRequired as SkillSlug].label;
    const localizedSkillName = game.i18n.localize(skillKey);

    await createChatMessageWithButton({
        slug: `extend-boost-eidolon`,
        actor: summonerActor,
        content: `Do you want to attempt to extend Boost Eidolon?`,
        button_label: `<i class="fa-solid fa-dice-d20"></i> Roll ${localizedSkillName} DC: ${standardDCByLevel}`,
        flags: {
            "extend-boost-eidolon-dc": standardDCByLevel,
            "extend-boost-eidolon-skill": skillCheckRequired
        }
    });
}

function getEidolonActor(summonerActor: ActorPF2e): ActorPF2e | null {

    // @ts-expect-error modules exists when pf2e-toolbelt is installed and eidolon is linked with summoner
    const sharedActors: Set<string> | undefined = (summonerActor.modules)?.["pf2e-toolbelt"]?.shareData?.slaves;

    if (!sharedActors || sharedActors.size === 0) {
        logd(`${summonerActor.name} does not have any shared actors.`);
        return null;
    }

    if (sharedActors.size === 1) {
        const uuid = sharedActors.values().next().value;
        if (!uuid) return null;

        const eidolonId = uuid.split(".")[1];
        const eidolonActor = game.actors.get(eidolonId);

        if (!eidolonActor) {
            logd(`Could not find an Actor with ID: ${eidolonId}`);
            return null;
        }
        return eidolonActor;
    }

    logd(`${summonerActor.name} has multiple shared actors (${sharedActors.size}). Unable to determine which is the Eidolon.`);
    return null;
}

async function createBoostEidolonEffectOnActor(eidolonActor: ActorPF2e) {

    const existingEffect = eidolonActor.items.find(item =>  
        item.type === "effect" && item.slug === "spell-effect-boost-eidolon"  
    ) as EffectPF2e | undefined;  

    if (existingEffect) {  
        if (existingEffect.system.expired === true) {  
            // Effect exists but is expired, delete it and proceed to create a new one.  
            await existingEffect.delete();  
        } else {  
            // Effect exists and is not expired, we don't need to do anything.  
            return;  
        }  
    }  
    
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

    await eidolonActor.createEmbeddedDocuments("Item", [boostEidolonEffect.toObject()]);
}

export async function extendBoostEidolon(chatMessage: ChatMessagePF2e) {

    const summonerActor = chatMessage.actor;
    if (!summonerActor || !isCharacter(summonerActor)) return;

    const eidolonActor = getEidolonActor(summonerActor);
    if (!eidolonActor) return;

    // Check if Summoner has focus points (technically should not be possible to reach here without focus points)
    const hasFocusPoints = summonerActor.system.resources.focus.value > 0;
    if (!hasFocusPoints) {
        ui.notifications?.warn("Not enough Focus Points to extend Boost Eidolon.");
        return;
    }

    const standardDCByLevel = chatMessage.flags?.samioli?.["extend-boost-eidolon-dc"] as number;
    const skillCheckRequired = chatMessage.flags?.samioli?.["extend-boost-eidolon-skill"] as MagicSkill;
    if (!standardDCByLevel || !skillCheckRequired) return;

    const skill = summonerActor.skills[skillCheckRequired];
    if (!skill) return;

    await skill.roll({
        dc: { 
            value: standardDCByLevel,
            label: `Extend Boost DC`
        },
        callback: async (roll) => {
            if (roll.options.degreeOfSuccess === 2 ) {
                // TODO: look to move this to a hook that triggers after the dice so nice roll is completed
                await extendBoostEidolonEffectDuration(summonerActor, eidolonActor, "success");
            } else if (roll.options.degreeOfSuccess === 3) {
                // TODO: look to move this to a hook that triggers after the dice so nice roll is completed
                await extendBoostEidolonEffectDuration(summonerActor, eidolonActor, "criticalSuccess");
            } else {
                return;
            }
        }
    });
}

async function extendBoostEidolonEffectDuration(summonerCharacterActor: CharacterPF2e, 
    eidolonActor: ActorPF2e, degreeOfSuccess: "success" | "criticalSuccess") {

    const boostEidolonEffect = eidolonActor.items.find(item => item.type === "effect" 
        && item.slug === "spell-effect-boost-eidolon") as EffectPF2e;
    if (!boostEidolonEffect)  {
        ui.notifications.error(`Boost Eidolon effect not found on ${eidolonActor.name}.`);    
        return;
    }

    if (degreeOfSuccess === "success") {
        await boostEidolonEffect.update({"system.duration.value": 3})
        await reduceFocusPoints(summonerCharacterActor);
        ui.notifications.success(`Boost Eidolon duration extended to 3 rounds. Focus Point used.`);
    } else if (degreeOfSuccess === "criticalSuccess") {
        await boostEidolonEffect.update({"system.duration.value": 4})
        await reduceFocusPoints(summonerCharacterActor);
        ui.notifications.success(`Boost Eidolon duration extended to 4 rounds. Focus Point used.`);
    }
}

async function reduceFocusPoints(summonerActor: CharacterPF2e) {
    const currentFocusPoints = summonerActor.system.resources.focus.value;
    if (currentFocusPoints > 0) {
        await summonerActor.update({"system.resources.focus.value": currentFocusPoints - 1});
    }
}

function getSpellTraditionByEidolonType(eidolonActor: ActorPF2e): Tradition | null {

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

function getSkillCheckByTradition(tradition: Tradition): MagicSkill {
    switch (tradition) {
        case "arcane":
            return "arcana";
        case "divine":
            return "religion";
        case "occult":
            return "occultism";
        case "primal":
            return "nature";
    }
}