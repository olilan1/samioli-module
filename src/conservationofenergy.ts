import { ChatMessagePF2e, FeatPF2e, RollOptionRuleElement, ActorPF2e, TokenPF2e } from "foundry-pf2e";
import { logd, sendBasicChatMessage } from "./utils.ts";

const SPELL_SLUGS = [
    `breathe-fire`,
    `heat-metal`,
    `fireball`,
    `fire-shield`,
    `cone-of-cold`,
    `flame-vortex`,
    `fiery-body`,
    `polar-ray`,
    `falling-stars`,
    `ignition`,
    `frostbite`
]

export async function oscillateEnergy(message: ChatMessagePF2e) {
    const options = message.flags.pf2e.context?.options;
    const psychicActor = message.actor as ActorPF2e;

    if (!psychicActor || !options?.includes("class:psychic") 
        || !options?.includes("feature:the-oscillating-wave")) {
        return;
    }

    // Check if a relevant spell
    const prefix = "item:";
    const isRelevantSpell = options.some(o => o.startsWith(prefix) 
        && SPELL_SLUGS.includes(o.substring(prefix.length))
    );

    // Check if mind shift action with add remove energy enabled
    const isMindShiftWithAddRemoveEnergy = options.includes("item:trait:mindshift") 
        && options.includes("mindshift:add-remove-energy");

    if (!isRelevantSpell && !isMindShiftWithAddRemoveEnergy) return;

    // Get Oscillating Wave Feat
    const oscillatingWaveFeat = psychicActor.items.find(
        (item): item is FeatPF2e<ActorPF2e> =>
            item.type === "feat" && item.slug === "the-oscillating-wave"
    );
    if (!oscillatingWaveFeat) return

    // Find relevant rollOption Index, needed to update array later
    const ruleIndex = oscillatingWaveFeat.rules.findIndex(
        rule => rule.key === "RollOption" && rule.label === "Conservation of Energy"
    );

    if (ruleIndex === -1) {
        logd(`Conservation of Energy RollOption not found on Feat.`);
        return;
    }

    // Determine current selection and new selection
    const currentRuleData = oscillatingWaveFeat.rules[ruleIndex] as RollOptionRuleElement;
    const currentSelection = currentRuleData.selection;
    const newSelection = currentSelection === "fire" ? "cold" : "fire";

    // Clone the rules array as rules are immutable and we need to update the whole item instead
    const clonedRulesArray = foundry.utils.deepClone(oscillatingWaveFeat.system.rules);

    // Update the cloned rules array with the new selection
    if (clonedRulesArray[ruleIndex] && 'selection' in clonedRulesArray[ruleIndex]) {
        (clonedRulesArray[ruleIndex]).selection = newSelection;
    } else {
        return;
    }

    // Create the payload to update the item
    const payload = {
        _id: oscillatingWaveFeat.id,
        "system.rules": clonedRulesArray,
    };

    // Update the item on the actor
    await psychicActor.updateEmbeddedDocuments("Item", [payload]);

    // Animate energy switch for visual display of change
    if (!message.token || !message.token.object) return;
    await animateConservationOfEnerySwitch(message.token.object, newSelection);
    
    const energyString = newSelection === "fire" ? "add energy 🔥" : "remove energy ❄️";
    const content = `${message.token.name} changes to ${energyString}.`
    
    await sendBasicChatMessage(content, psychicActor)

}

async function animateConservationOfEnerySwitch(token: TokenPF2e, energy: "fire" | "cold") {
    
    const animation = energy === "fire" ? "jb2a.token_border.circle.static.orange.012" : "jb2a.token_border.circle.static.blue.004";
    const sound = energy === "fire" ? "sound/NWN2-Sounds/sff_firewhoosh02.WAV" : "sound/NWN2-Sounds/sfx_conj_Cold.WAV";
    
    new Sequence()
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