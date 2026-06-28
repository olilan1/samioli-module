import { ChatMessagePF2e, ActorPF2e, TokenPF2e } from "foundry-pf2e";
import { logd, sendBasicChatMessage } from "./utils.ts";

const SPELL_SLUGS = new Set([
    `breathe-fire`,
    `blazing-bolt`,
    `fireball`,
    `ice-storm`,
    `howling-blizzard`,
    `frozen-fog`,
    `volcanic-eruption`,
    `arctic-rift`,
    `falling-stars`,
    `ignition`,
    `frostbite`
]);

export function isOscillateSpellCast(message: ChatMessagePF2e): boolean {
    const options = message.flags?.pf2e?.context?.options ?? [];
    const isRelevantSpell = options.some(o =>
        o.startsWith("item:") && SPELL_SLUGS.has(o.substring("item:".length))
    );
    const isMindShiftWithAddRemoveEnergy = options.includes("mindshift:add-remove-energy")
        && options.includes("item:tag:mindshifted");
    return isRelevantSpell || isMindShiftWithAddRemoveEnergy;
}

export async function oscillateEnergy(message: ChatMessagePF2e) {
    const psychicActor = message.actor as ActorPF2e;
    if (!psychicActor) return;

    // Get the Oscillating Wave Feat
    const oscillatingWaveFeat = psychicActor.itemTypes.feat.find(
        f => f.slug === "the-oscillating-wave"
    );
    if (!oscillatingWaveFeat) return;

    // Find the index of the relevant RollOption rule
    const ruleIndex = oscillatingWaveFeat.rules.findIndex(
        rule => rule.key === "RollOption" && rule.label === "Conservation of Energy"
    );

    if (ruleIndex === -1) {
        logd(`Conservation of Energy RollOption rule not found on feat.`);
        return;
    }

    // Determine current selection from the instantiated rule
    const currentRuleData = oscillatingWaveFeat.rules[ruleIndex] as { selection?: string };
    const currentSelection = currentRuleData.selection;
    
    // If selection is undefined it defaults to fire, so check for "cold" to safely toggle
    const newSelection = currentSelection === "cold" ? "fire" : "cold";

    // Extract the raw source data so we can safely mutate it
    const clonedRulesArray = oscillatingWaveFeat.toObject().system.rules;
    (clonedRulesArray[ruleIndex] as { selection?: string }).selection = newSelection;

    // Update the item with the modified rules
    await oscillatingWaveFeat.update({ "system.rules": clonedRulesArray });

    // Animate energy switch for visual display of change
    const token = message.token?.object;
    if (token) {
        await animateConservationOfEnergySwitch(token, newSelection);
    }
    
    const energyString = newSelection === "fire" ? "add energy 🔥" : "remove energy ❄️";
    const name = message.token?.name ?? psychicActor.name;
    const content = `${name} changes to ${energyString}.`;
    
    await sendBasicChatMessage(content, psychicActor);
}

async function animateConservationOfEnergySwitch(token: TokenPF2e, energy: "fire" | "cold") {

    const animation = energy === "fire" 
        ? "jb2a.token_border.circle.static.orange.012" 
        : "jb2a.token_border.circle.static.blue.004";
    const sound = energy === "fire" 
        ? "sound/NWN2-Sounds/sff_firewhoosh02.WAV" 
        : "sound/NWN2-Sounds/sfx_conj_Cold.WAV";
    
    await new Sequence()
        .effect()
            .atLocation(token)
            .file(animation)
            .fadeIn(200)
            .fadeOut(1000)
            .duration(3000)
            .scaleToObject(2, { considerTokenScale: true })
        .sound()
            .file(sound)
        .play()
}