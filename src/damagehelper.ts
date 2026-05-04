import { logd } from "./utils.ts";

const { DialogV2 } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;
const { FormDataExtended } = foundry.applications.ux;

/**
 * Configuration for damage roll metadata and UI tags.
 */
export const DAMAGE_TAG_CONFIG = {
    persistent: { label: "Persistent", group: 'type', value: 'persistent', hasTag: false },
    precision: { label: "Precision", group: 'modifier', value: 'precision', hasTag: false },
    splash: { label: "Splash", group: 'modifier', value: 'splash', hasTag: false },
    area: { label: "Area", group: 'trait', value: 'area-damage', hasTag: false },
    magical: { label: "Magical", group: 'trait', value: 'item:magical', hasTag: true },
    ghostTouch: { 
        label: "Ghost Touch", 
        group: 'trait', 
        value: 'item:rune:property:ghost-touch', 
        hasTag: false 
    },
    holy: { label: "Holy", group: 'trait', value: 'item:trait:holy', hasTag: true },
    unholy: { label: "Unholy", group: 'trait', value: 'item:trait:unholy', hasTag: true }
};

export type DamageTrait = { 
    key: string; 
    label: string; 
    group: string; 
    value: string; 
    hasTag: boolean; 
};

/**
 * Data required to construct and display a DamageRoll message.
 */
export interface DamageMessageData {
    roll: Roll;
    title: string;
    subtitle?: string;
    damageType: string;
    targetUuid?: string;
    traits?: string[];
    material?: string;
    isPersistent?: boolean;
    speaker?: ChatMessage["speaker"];
    rollOptions?: string[];
}

// --- Chat UI Integration ---

/**
 * Injects the Damage Helper button into the Foundry v13 chat controls.
 * @param cssMappings Mapping of CSS selectors to HTML elements.
 */
export function addDamageHelperButtonToChatUIv13(cssMappings: Record<string, HTMLElement>) {
    const html = cssMappings["#chat-controls"];
    if (!html) {
        logd("cannot find chat controls html");
        return;
    }

    if (html.querySelector("#damage-helper-button")) return;

    const controlButtons = html.querySelector(".control-buttons");
    const myButtonHTML = `
        <button type="button" class="ui-control icon fa-solid fa-burst" 
                data-tooltip="Create Custom Damage Rolls" aria-label="Create Custom Damage Rolls" 
                id="damage-helper-button"></button>`;

    if (!controlButtons) {
        logd("cannot find control buttons html");
        return;
    }

    controlButtons.insertAdjacentHTML("afterbegin", myButtonHTML);
    const myButtonHTMLElement = controlButtons.querySelector<HTMLButtonElement>(
        "#damage-helper-button"
    );

    myButtonHTMLElement?.addEventListener("click", async () => {
        showDamageHelperDialog();
    });
}

/**
 * Injects the Damage Helper button into the Foundry v12 chat controls.
 */
export function addDamageHelperButtonToChatUIv12(_html: HTMLElement) {
    // TODO: build support for v12 injection
    logd("Foundry v12 is not yet supported for the damage helper button.");
}

// --- Dialog Management ---

/**
 * Displays the main Damage Helper dialog.
 */
async function showDamageHelperDialog() {
    const damageTypes: Record<string, string> = CONFIG.PF2E.damageTypes;
    const preciousMaterials: Record<string, string> = CONFIG.PF2E.preciousMaterials;

    const checkboxData = createLocalizedCheckboxData(DAMAGE_TAG_CONFIG);

    const context = {
        damageTypes: createLocalizedContext(damageTypes),
        preciousMaterials: createLocalizedContext(preciousMaterials),
        damageModifiers: checkboxData,
        defaultDamageValue: "untyped"
    };

    const templatePath = "modules/samioli-module/templates/damage-helper-form.hbs";
    const html = await renderTemplate(templatePath, context);

    const dialog = new DialogV2({
        window: { title: "Create Damage Roll" },
        position: { width: 300, height: "auto" },
        form: { closeOnSubmit: false },
        content: html,
        buttons: [
            {
                label: "Send to Chat",
                icon: "fa-solid fa-paper-plane",
                callback: async (_event, _button, dialog) => {
                    await submitDamageForm(dialog as InstanceType<typeof DialogV2>);
                }
            },
            { action: "cancel", label: "Cancel", icon: "fa-solid fa-times" }
        ]
    });

    dialog.render(true);
}

/**
 * Processes the submitted damage form and triggers roll creation.
 */
async function submitDamageForm(dialog: InstanceType<typeof DialogV2>): Promise<boolean | void> {
    const dialogElement = dialog.element as HTMLDialogElement;
    const form = dialogElement.querySelector("form");
    if (!form) return;

    const formData = new FormDataExtended(form).object;
    const value = formData.damageAmount as string;

    if (!isIntegerOrRoll(value)) {
        ui.notifications?.error("Please enter a valid damage amount (e.g., '2d6' or '10').");
        return;
    }

    createDamageRoll(formData);
    dialog.close();
}

// --- Localization Helpers ---

function createLocalizedContext(options: Record<string, string>): 
    { value: string, label: string }[] {
    return Object.entries(options).map(([key, labelKey]) => ({
        value: key,
        label: game.i18n.localize(labelKey)
    }));
}

function createLocalizedCheckboxData(options: Record<string,
    { label: string, group: string, value: string }>): 
    { name: string, label: string }[] {
    return Object.entries(options).map(([key, entry]) => ({
        name: key,
        label: game.i18n.localize(entry.label)
    }));
}

// --- Roll Construction ---

/**
 * Constructs and executes a damage roll based on form data.
 */
function createDamageRoll(formData: Record<string, unknown>) {
    const value = formData.damageAmount as string;
    const damageType = formData.damageType as string;
    const material = formData.preciousMaterial as string;
    const isPersistent = formData.persistent as boolean;
    const damageTraits: DamageTrait[] = [];
    const damageModifiers: string[] = [];
    const damageAndMaterialTypes: string[] = [];

    // Categorize selected tags
    for (const [key, config] of Object.entries(DAMAGE_TAG_CONFIG)) {
        if (formData[key]) {  
            switch (config.group) {  
                case 'modifier':  
                    damageModifiers.push(config.value);  
                    break;  
                case 'trait':  
                    damageTraits.push({ key, ...config });  
                    break;
                case 'type':  
                    damageAndMaterialTypes.push(config.value);  
                    break;  
            }  
        }  
    }  

    damageAndMaterialTypes.push(damageType);
    if (material) damageAndMaterialTypes.push(material);

    const DamageRoll = CONFIG.Dice.rolls.find((r) => r.name === "DamageRoll") as typeof Roll;
    if (!DamageRoll) return;

    // Build formula: { (2d6[precision])[fire,silver] }
    const modStr = damageModifiers.length > 0 ? `(${value}[${damageModifiers}])` : value;
    const formula = `{${modStr}[${damageAndMaterialTypes}]}`;
    const myRoll = new DamageRoll(formula);

    const hasTagTraits = damageTraits.filter(trait => trait.hasTag).map(t => t.key);
    const noTagTraitLabels = damageTraits.filter(trait => !trait.hasTag).map(t => t.label);

    const localizedType = game.i18n.localize(CONFIG.PF2E.damageTypes[damageType]).capitalize();
    let title = "Damage: ";
    if (isPersistent && damageType !== "bleed") title += "Persistent ";
    title += localizedType;

    // Synthesize subtitle from properties that don't have visual tags
    let subtitle = "";
    if (noTagTraitLabels.length === 1) {
        subtitle = `with ${noTagTraitLabels[0]}`;
    } else if (noTagTraitLabels.length > 1) {
        const start = noTagTraitLabels.slice(0, -1).join(', ');
        const end = noTagTraitLabels.slice(-1)[0];
        subtitle = `with ${start} and ${end}`; 
    }

    sendDamageRollToChat({
        roll: myRoll,
        title,
        subtitle,
        damageType,
        material,
        isPersistent,
        traits: hasTagTraits,
        rollOptions: damageTraits.map(trait => trait.value)
    });
}

/**
 * Shared utility to send a DamageRoll message with consistent styling.
 * Correctly handles tag ordering (traits then materials) and target context.
 */
export async function sendDamageRollToChat(data: DamageMessageData) {
    const { 
        roll, title, subtitle, targetUuid, 
        traits = [], material, speaker, rollOptions = [] 
    } = data;

    let headerHtml = `<h4 class="action"><strong>${title}`;
    if (subtitle) headerHtml += ` ${subtitle}`;
    headerHtml += "</strong></h4>";

    // Build tag container
    let tagsHtml = '<div class="tags" data-tooltip-class="pf2e">';
    for (const trait of traits) {
        tagsHtml += getTraitTagHtml(trait);
    }
    if (material) {
        tagsHtml += getMaterialTagHtml(material);
    }
    tagsHtml += '</div>';

    const flavor = `${headerHtml}${tagsHtml}`;
    const targetDoc = targetUuid ? fromUuidSync(targetUuid) : null;
    
    // Explicitly handle token vs actor targets for the chat card context
    let targetData = null;
    if (targetDoc instanceof foundry.documents.BaseToken) {
        targetData = { actor: targetDoc.actor?.uuid, token: targetUuid };
    } else if (targetDoc instanceof foundry.documents.BaseActor) {
        targetData = { actor: targetUuid, token: null };
    }

    await roll.toMessage({
        speaker: speaker || ChatMessage.getSpeaker(),
        flavor,
        flags: {
            pf2e: {
                context: {
                    type: "damage-roll",
                    sourceType: "spell",
                    target: targetData,
                    options: rollOptions
                }
            },
            "pf2e-toolbelt": { targetHelper: { targets: targetUuid ? [targetUuid] : [] } }
        }
    });
}

/**
 * Returns the HTML for a standard PF2e trait tag.
 */
function getTraitTagHtml(trait: string): string {
    const damageTraits: Record<string, string> = CONFIG.PF2E.damageTraits;
    const localizedTrait = game.i18n.localize(damageTraits[trait] || trait);
    const traitsDescriptions: Record<string, string> = CONFIG.PF2E.traitsDescriptions;
    const traitDescriptionTag = traitsDescriptions[trait] || "";

    return `<span class="tag tag_alt" data-trait="${trait}" 
                  data-tooltip="${traitDescriptionTag}">${localizedTrait}</span>`;
}

/**
 * Returns the HTML for a PF2e material tag.
 */
function getMaterialTagHtml(material: string): string {
    const preciousMaterials: Record<string, string> = CONFIG.PF2E.preciousMaterials;
    const localizedMaterial = game.i18n.localize(preciousMaterials[material] || material);
    const materialDescriptions: Record<string, string> = CONFIG.PF2E.traitsDescriptions;
    const materialDescriptionTag = materialDescriptions[material] || "";

    return `<span class="tag tag_material" data-material="${material}" 
                  data-tooltip="${materialDescriptionTag}">${localizedMaterial}</span>`;
}

/**
 * Validates whether a string is a simple integer or a dice formula.
 */
function isIntegerOrRoll(input: string): boolean {
    const trimmedInput = input.trim();
    const simpleRollRegex = /^\d+d\d+$|^\d+$/i;
    
    return simpleRollRegex.test(trimmedInput);
}
