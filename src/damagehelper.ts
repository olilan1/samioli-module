import { logd } from "./utils.ts";

const { DialogV2 } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;
const { FormDataExtended } = foundry.applications.ux;

const DAMAGE_TAG_CONFIG = {
    persistent: { label: "Persistent", group: 'type', value: 'persistent', hasTag: false },
    precision: { label: "Precision", group: 'modifier', value: 'precision', hasTag: false },
    splash: { label: "Splash", group: 'modifier', value: 'splash', hasTag: false },
    area: { label: "Area", group: 'trait', value: 'area-damage', hasTag: false },
    magical: { label: "Magical", group: 'trait', value: 'item:magical', hasTag: true },
    ghostTouch: { label: "Ghost Touch", group: 'trait', value: 'item:rune:property:ghost-touch', hasTag: false },
    holy: { label: "Holy", group: 'trait', value: 'item:trait:holy', hasTag: true },
    unholy: { label: "Unholy", group: 'trait', value: 'item:trait:unholy', hasTag: true }
};

type DamageTrait = { key: string; label: string; group: string; value: string; hasTag: boolean; };

export function addDamageHelperButtonToChatUIv13(cssMappings: Record<string, HTMLElement>) {

    const html = cssMappings["#chat-controls"];
    if (!html) {
        logd(`cannot find chat controls html`);
        return;
    }

    if (html.querySelector("#damage-helper-button")) {
        return;
    }

    const controlButtons = html.querySelector(".control-buttons");

    const myButtonHTML = `<button type="button" class="ui-control icon fa-solid fa-burst" data-tooltip="" aria-label="Create Custom Damage Rolls" id="damage-helper-button"></button>`;

    if (!controlButtons) {
        logd(`cannot find control buttons html`);
        return;
    }

    controlButtons.insertAdjacentHTML("afterbegin", (myButtonHTML));
    const myButtonHTMLElement = controlButtons.querySelector<HTMLButtonElement>("#damage-helper-button");

    myButtonHTMLElement?.addEventListener("click", async () => {
        showDamageHelperDialog();
    });
}

export function addDamageHelperButtonToChatUIv12(_html: HTMLElement) {
    
    //TODO: build support for v12 injection
    logd("Foundry v12 is not yet supported for the damage helper button.");
}

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
        window: {
            title: "Create Damage Roll"
        },
        position: {
            width: 300,
            height: "auto"
        },
        form: {
            closeOnSubmit: false
        },
        content: html,
        buttons: [
            {
                label: "Send to Chat",
                callback: async (_event: PointerEvent | SubmitEvent, _button: HTMLButtonElement, 
                    dialog: InstanceType<typeof DialogV2>) => {
                    await submitDamageForm(dialog);
                }
            },
            {
                action: "cancel",
                label: "Cancel"
            }
        ]
    });

    dialog.render(true);
}

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

function createLocalizedContext(options: Record<string, string>): 
    { value: string, label: string }[] {

    const localizedContext = Object.entries(options).map(([key, labelKey]) => {
        const localizedLabel = game.i18n.localize(labelKey);
        return {
            value: key,
            label: localizedLabel
        };
    });

    return localizedContext;
}

function createLocalizedCheckboxData(options: Record<string,
    { label: string, group: string, value: string }>): 
    { name: string, label: string }[] {

    const localizedCheckboxes = Object.entries(options)
        .map(([key, entry]) => {
            const labelKey = entry.label;
            const localizedLabel = game.i18n.localize(labelKey);
            return {
                name: key,
                label: localizedLabel
            };
        });

    return localizedCheckboxes;
}

function createDamageRoll(formData: Record<string, unknown>) {

    const value = formData.damageAmount as string;
    const damageType = formData.damageType as string;
    const material = formData.preciousMaterial as string;
    const isPersistent = formData.persistent as boolean;
    const damageTraits: DamageTrait[] = [];
    const damageModifiers: string[] = [];
    const damageAndMaterialTypes = [];

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

    const DamageRoll = CONFIG.Dice.rolls.find((r) => r.name === "DamageRoll");
    if (!DamageRoll) return;

    let formula = ``;
    if (damageModifiers.length > 0) {
        formula = `{(${value}[${damageModifiers}])[${damageAndMaterialTypes}]}`;
    } else {
        formula = `{${value}[${damageAndMaterialTypes}]}`;
    }

    const newFlavor = getFlavorHtml(damageType, damageTraits, material, isPersistent);

    const myRoll = new DamageRoll(formula);

    myRoll.toMessage({
        flavor: newFlavor,
        speaker: ChatMessage.getSpeaker(),
        flags: {
            pf2e: {
                context: {
                    options: damageTraits.map(trait => trait.value)
                }
            }
        }
    });
}

function getFlavorHtml(damageType: string, damageTraits: { key: string; label: string; 
    group: string; value: string; hasTag: boolean; }[] , material: string, isPersistent: boolean):
    string {

    const hasTagTraits = damageTraits.filter(trait => trait.hasTag);
    const noTagTraits = damageTraits.filter(trait => !trait.hasTag);
    const headerStart = `
        <h4 class="action">
        <strong>Damage: 
    `;
    const traitLabels = noTagTraits.map(trait => trait.label);
    let headerNoTagTraitsString: string;

    if (traitLabels.length === 0) {
        headerNoTagTraitsString = ``;
    } else if (traitLabels.length === 1) {
        headerNoTagTraitsString = `with ${traitLabels[0]}`;
    } else {
        const start = traitLabels.slice(0, -1).join(', ');
        const end = traitLabels.slice(-1)[0];
        headerNoTagTraitsString = `with ${start} and ${end}`; 
    }

    let headerDamagePersistent = ``;
    if (isPersistent && damageType !== "bleed") {
        headerDamagePersistent = `Persistent `;
    }

    const headerDamageType = `${game.i18n.localize(damageType).capitalize()} `;
    const headerEnd = `</strong></h4>`;
    const outerTagsDiv = `<div class="tags" data-tooltip-class="pf2e">`;
    const closingTagsDiv = `</div>`;

    const materialHtml = material ? getMaterialTagHtml(material) : ``;

    const fullFlavorHtml = `
        ${headerStart}
        ${headerDamagePersistent}
        ${headerDamageType}
        ${headerNoTagTraitsString}
        ${headerEnd}
        ${outerTagsDiv}
        ${materialHtml}
        ${hasTagTraits.map(trait => getTraitTagHtml(trait.key)).join(" ")}
        ${closingTagsDiv}
    `;

    return fullFlavorHtml;

}

function getTraitTagHtml(trait: string): string {

    const damageTraits: Record<string, string> = CONFIG.PF2E.damageTraits;
    const localizedTrait = game.i18n.localize(damageTraits[trait]);
    const traitsDescriptions: Record<string, string> = CONFIG.PF2E.traitsDescriptions;
    const traitDescriptionTag = traitsDescriptions[trait];

    return `<span class="tag tag_alt" data-trait="${trait}" data-tooltip="${traitDescriptionTag}">${localizedTrait}</span>`;
}

function getMaterialTagHtml(material: string): string {

    const preciousMaterials: Record<string, string> = CONFIG.PF2E.preciousMaterials;
    const localizedMaterial = game.i18n.localize(preciousMaterials[material]);
    const materialDescriptions: Record<string, string> = CONFIG.PF2E.traitsDescriptions;
    const materialDescriptionTag = materialDescriptions[material];

    return `<span class="tag tag_material" data-material="${material}" data-tooltip="${materialDescriptionTag}">${localizedMaterial}</span>`;
}

function isIntegerOrRoll(input: string): boolean {
    const trimmedInput = input.trim();
    const simpleRollRegex = /^\d+d\d+$|^\d+$/i;
    
    return simpleRollRegex.test(trimmedInput);
}