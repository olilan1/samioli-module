import { CharacterPF2e, ChatMessagePF2e, EffectSource, FamiliarPF2e, TokenPF2e } from "foundry-pf2e";
import { getSetting, SETTINGS } from "../settings.ts";
import { sendBasicChatMessage } from "../utils.ts";

const { DialogV2 } = foundry.applications.api;

const MOODS = ["Happy", "Angry", "Inscrutable"] as const;
type Mood = typeof MOODS[number];

const MOOD_SKILLS: Record<Mood, "diplomacy" | "intimidation" | "deception"> = {
    "Happy": "diplomacy",
    "Angry": "intimidation",
    "Inscrutable": "deception"
};

const MOOD_SETTINGS = {
    "Happy": SETTINGS.MOOD_CLOUD_HAPPY_IMAGE,
    "Angry": SETTINGS.MOOD_CLOUD_ANGRY_IMAGE,
    "Inscrutable": SETTINGS.MOOD_CLOUD_INSCRUTABLE_IMAGE
} as const;

export async function startEmote(token: TokenPF2e, _message?: ChatMessagePF2e) {
    const actor = token.actor;

    if (!actor || actor.type !== "familiar") {
        ui.notifications.warn(`Emote must be performed by a familiar.`);
        return;
    }

    if (!actor.isOwner) {
        ui.notifications.warn(`You do not have permission to perform an emote with ${token.name}.`);
        return;
    }

    const familiarActor = actor as FamiliarPF2e;
    const masterActor = familiarActor.master;
    const familiarName = token.name;

    const buttons = MOODS.map(mood => ({
        action: mood.toLowerCase(),
        label: mood,
        callback: async () => {
            const imagePath = getSetting(MOOD_SETTINGS[mood]) as string;

            if (!imagePath) {
                ui.notifications.warn(`No image set for ${mood} mood cloud.`);
                return;
            }

            // --- 1. Update Familiar (Only if mood is actually changing) ---
            await applyFamiliarMoodEffect(familiarActor, mood, familiarName, imagePath);

            // --- 2. Update Master (Always attempt to apply/refresh) ---
            if (masterActor) {
                await applyMasterMoodEffect(masterActor, mood, familiarName, imagePath);
            } else {
                ui.notifications.warn(`No Master assigned to ${familiarName}.`);
            }

            // --- 3. Visuals & Chat Announcement ---
            playSmokeAnimation(token);
            await postShiftToChat(familiarActor, masterActor, mood, familiarName);
        }
    }));

    new DialogV2({
        window: { title: `${familiarName} Mood Shift` },
        position: { width: 360 },
        content: `<p>Choose expression:</p>`,
        buttons: buttons
    }).render(true);
}

async function applyFamiliarMoodEffect(
    familiarActor: FamiliarPF2e,
    mood: Mood,
    familiarName: string,
    imagePath: string
) {
    const famEffectName = `${familiarName}: ${mood}`;
    const allFamMoodNames = MOODS.map(m => `${familiarName}: ${m}`);

    const hasFamEffect = familiarActor.items.some(i => i.name === famEffectName);
    
    if (!hasFamEffect) {
        const oldFamEffects = familiarActor.items.filter(i => allFamMoodNames.includes(i.name));
        
        if (oldFamEffects.length > 0) {
            await familiarActor.deleteEmbeddedDocuments("Item", oldFamEffects.map(i => i.id));
        }
        
        const famEffectData = {
            name: famEffectName,
            type: "effect",
            img: imagePath,
            system: {
                rules: [
                    {
                        key: "TokenImage",
                        value: imagePath
                    }
                ],
                tokenIcon: { show: false }
            }
        } as unknown as EffectSource;
        
        await familiarActor.createEmbeddedDocuments("Item", [famEffectData]);
    }
}

async function applyMasterMoodEffect(
    masterActor: CharacterPF2e,
    mood: Mood,
    familiarName: string,
    imagePath: string
) {
    const masterEffectName = `Aided by ${familiarName} (${mood})`;
    const allMasterMoodNames = MOODS.map(m => `Aided by ${familiarName} (${m})`);

    const oldMasterEffects = masterActor.items.filter(i => allMasterMoodNames.includes(i.name));
    
    if (oldMasterEffects.length > 0) {
        await masterActor.deleteEmbeddedDocuments("Item", oldMasterEffects.map(i => i.id));
    }
    
    const skillSlug = MOOD_SKILLS[mood];
    const skillRank = masterActor.system?.skills?.[skillSlug]?.rank ?? 0;
    // Bonus is +2 if master's skill is Master or above
    const bonusValue = skillRank >= 3 ? 2 : 1;

    const masterEffectData = {
        name: masterEffectName,
        type: "effect",
        img: imagePath,
        system: {
            duration: {
                value: 1,
                unit: "rounds",
                expiry: "turn-start"
            },
            rules: [
                {
                    key: "FlatModifier",
                    selector: skillSlug,
                    value: bonusValue,
                    type: "circumstance",
                    label: `Aided by ${familiarName}`,
                    // Currently this removes after any roll
                    // TODO: See if there's a way to have this only removed after a relevant roll
                    removeAfterRoll: true
                }
            ]
        }
    } as unknown as EffectSource;
    
    await masterActor.createEmbeddedDocuments("Item", [masterEffectData]);
}

function playSmokeAnimation(token: TokenPF2e) {
    new Sequence()
        .effect()
            .file("jb2a.smoke.puff.centered.grey.0")
            .atLocation(token)
            .scale(0.25)
        .play();
}

async function postShiftToChat(
    familiarActor: FamiliarPF2e,
    masterActor: CharacterPF2e | null,
    mood: Mood,
    familiarName: string
) {
    const article = mood === "Happy" ? "a" : "an";
    let content = `<strong>${familiarName}</strong> shifts to ${article} ${mood.toLowerCase()} mood`;

    if (masterActor) {
        const skill = MOOD_SKILLS[mood];
        const capitalizedSkill = skill.charAt(0).toUpperCase() + skill.slice(1);
        content += ` and prepares to aid <strong>${masterActor.name}</strong> ` +
            `at ${capitalizedSkill}!`;
    } else {
        content += `!`;
    }

    await sendBasicChatMessage(content, familiarActor);
}