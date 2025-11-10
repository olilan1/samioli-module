import { ChatMessagePF2e, RollOptionRuleElement, ActorPF2e, TokenPF2e, ItemPF2e } from "foundry-pf2e";
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
    const psychicActor = message.actor as ActorPF2e;
    const options = message.flags.pf2e.context?.options;
    if (!options) return;

    if (!isOscillatingWavePsychic(psychicActor, options) || !isRelevantAction(options)) {
        return;
    }

    const oscillatingWaveFeat = psychicActor.items.find(
        (item) => item.type === "feat" && item.slug === "the-oscillating-wave"
    );

    if (!oscillatingWaveFeat) {
        logd(`Conservation of Energy RollOption not found on Feat.`);
        return;
    }

    const currentSelection = getEnergySelection(oscillatingWaveFeat);
    if (!currentSelection) return;

    const newSelection = currentSelection === "fire" ? "cold" : "fire";

    await updateEnergySelection(oscillatingWaveFeat, newSelection);

    if (message.token?.object) {
        await animateConservationOfEnerySwitch(message.token.object, newSelection);
        const energyString = newSelection === "fire" ? "add energy 🔥" : "remove energy ❄️";
        const content = `${message.token.name} changes to ${energyString}.`;
        await sendBasicChatMessage(content, psychicActor);
    }
}

function isOscillatingWavePsychic(actor: ActorPF2e, options: string[]): boolean {
    return actor && options.includes("class:psychic") && options.includes("feature:the-oscillating-wave");
}

function isRelevantAction(options: string[]): boolean {
    const isRelevantSpell = options.some(o => o.startsWith("item:") && SPELL_SLUGS.includes(o.substring("item:".length)));
    const isMindShiftWithAddRemoveEnergy = options.includes("item:trait:mindshift") && options.includes("mindshift:add-remove-energy");
    return isRelevantSpell || isMindShiftWithAddRemoveEnergy;
}

function getEnergySelection(item: ItemPF2e): "fire" | "cold" | null {
    const rule = item.rules.find(
        (rule): rule is RollOptionRuleElement => rule.key === "RollOption" && rule.label === "Conservation of Energy"
    );
    return (rule?.selection as "fire" | "cold") ?? null;
}

async function updateEnergySelection(item: ItemPF2e, newSelection: "fire" | "cold"): Promise<void> {
    const ruleIndex = item.rules.findIndex(
        rule => rule.key === "RollOption" && rule.label === "Conservation of Energy"
    );

    if (ruleIndex === -1) return;

    const clonedRules = foundry.utils.deepClone(item.system.rules);
    const ruleToUpdate = clonedRules[ruleIndex];

    if (ruleToUpdate && 'selection' in ruleToUpdate) {
        ruleToUpdate.selection = newSelection;
        await item.update({ "system.rules": clonedRules });
    }
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