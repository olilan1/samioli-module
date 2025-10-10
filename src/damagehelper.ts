import { logd } from "./utils.ts";

const { DialogV2 } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;
const { FormDataExtended } = foundry.applications.ux;

const damageTagConfig = {
    persistent: { label: "Persistent", group: 'type', value: 'persistent' },
    precision: { label: "Precision", group: 'modifier', value: 'precision' },
    splash: { label: "Splash", group: 'modifier', value: 'splash' },
    area: { label: "Area", group: 'trait', value: 'area-damage' },
    magical: { label: "Magical", group: 'trait', value: 'item:magical' },
    ghostTouch: { label: "Ghost Touch", group: 'trait', value: 'item:rune:property:ghost-touch' },
    holy: { label: "Holy", group: 'trait', value: 'item:trait:holy' },
    unholy: { label: "Unholy", group: 'trait', value: 'item:trait:unholy' }
};

export function addDamageHelperButtonToChatUI(cssMappings: Record<string, HTMLElement>) {

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

    myButtonHTMLElement?.addEventListener("click", async (event) => {
        event.preventDefault();
        showDamageHelperDialog();
    });
}

async function showDamageHelperDialog() {

    const damageTypes: Record<string, string> = CONFIG.PF2E.damageTypes;
    const preciousMaterials: Record<string, string> = CONFIG.PF2E.preciousMaterials;

    const checkboxData = createLocalizedCheckboxData(damageTagConfig);

    const context = {
        damageTypes: createLocalizedContexts(damageTypes),
        preciousMaterials: createLocalizedContexts(preciousMaterials),
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

    const damageType = formData.damageType as string;
    const material = formData.preciousMaterial as string;
    const isPersistent = formData.persistent === true;
    const damageTraits = [];
    const damageModifiers = [];

    for (const key of Object.keys(damageTagConfig) as Array<keyof typeof damageTagConfig>) {
        if (formData[key] === true) {
            const { group, value: tagValue } = damageTagConfig[key];
            switch (group) {
                case 'modifier':
                    damageModifiers.push(tagValue);
                    break;
                case 'trait':
                    damageTraits.push(tagValue);
                    break;
            }
        }
    }

    createDamageRoll(value, damageType, material, isPersistent, damageModifiers, damageTraits);
    dialog.close();
}

function createLocalizedContexts(options: Record<string, string>): 
    { value: string, label: string }[] {

    const localizedContext = Object.entries(options).map(([key, labelKey]) => {
        const value = key;
        const localizedLabel = game.i18n.localize(labelKey);
        return {
            value: value,
            label: localizedLabel
        };
    });

    return localizedContext;
}

function createLocalizedCheckboxData(options: Record<string,
    { label: string, group: string, value: string }>): 
    { name: string, label: string, isChecked: boolean }[] {

    const localizedCheckboxes = Object.entries(options)
        .map(([key, entry]) => {
            const labelKey = entry.label;
            const localizedLabel = game.i18n.localize(labelKey);
            return {
                name: key,
                label: localizedLabel,
                isChecked: false
            };
        });

    return localizedCheckboxes;
}

function createDamageRoll(value: string, damageType: string, material: string, isPersistent: boolean,
    damageModifiers: string[], damageTraits: string[]) {

    const damageAndMaterialTypes = [];

    damageAndMaterialTypes.push(damageType);
    if (material) damageAndMaterialTypes.push(material);
    if (isPersistent) damageAndMaterialTypes.push(damageTagConfig.persistent.value);

    const DamageRoll = CONFIG.Dice.rolls.find((r) => r.name === "DamageRoll");
    if (!DamageRoll) return;

    let formula = ``;
    if (damageModifiers.length > 0) {
        formula = `{(${value}[${damageModifiers}])[${damageAndMaterialTypes}]}`;
    } else {
        formula = `{${value}[${damageAndMaterialTypes}]}`;
    }

    const damageTypes: Record<string, string> = CONFIG.PF2E.damageTypes;
    const preciousMaterials: Record<string, string> = CONFIG.PF2E.preciousMaterials;

    const damageTypeFlavor = `<b>Type: </b>${game.i18n.localize(damageTypes[damageType])}`;
    const materialFlavor = material ? `; <b>Material: </b>${game.i18n.localize(preciousMaterials[material])}` : ``;
    const damageModifiersText = damageModifiers.map(mod => {
        const configEntry = Object.values(damageTagConfig).find(entry => entry.value === mod);
        return configEntry ? game.i18n.localize(configEntry.label) : mod;
    });
    const damageTraitsText = damageTraits.map(trait => {
        const configEntry = Object.values(damageTagConfig).find(entry => entry.value === trait);
        return configEntry ? game.i18n.localize(configEntry.label) : trait;
    });

    const modifiersFlavor = damageModifiers.length > 0 ? `; <b>Modifiers: </b>${damageModifiersText.join(", ")}` : ``;
    const traitsFlavor = damageTraits.length > 0 ? `; <b>Traits: </b>${damageTraitsText.join(", ")}` : ``;
    const fullFlavor = `${damageTypeFlavor}${materialFlavor}${modifiersFlavor}${traitsFlavor}`;

    const myRoll = new DamageRoll(formula);

    myRoll.toMessage({
        flavor: `${fullFlavor}`,
        speaker: ChatMessage.getSpeaker(),
        flags: {
            pf2e: {
                context: {
                    options: damageTraits
                }
            }
        }
    });
}

function isIntegerOrRoll(input: string): boolean {
    const trimmedInput = input.trim();
    const simpleRollRegex = /^\d+d\d+$|^\d+$/i;
    
    return simpleRollRegex.test(trimmedInput);
}