import { logd } from "./utils.ts";

const { DialogV2 } = foundry.applications.api;

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

    controlButtons.insertAdjacentHTML("afterbegin",(myButtonHTML));
    const myButtonHTMLElement = controlButtons.querySelector<HTMLButtonElement>("#damage-helper-button");
    
    myButtonHTMLElement?.addEventListener("click", async (event) => {
        event.preventDefault();
        showDamageHelperDialog();
    });
}

function showDamageHelperDialog() {
    
    const damageTypes: Record<string, string> = CONFIG.PF2E.damageTypes;

    type LocalizedDamageTypes = Record<string, string>;

    const localizedDamageLabels = Object.entries(damageTypes).reduce(
        (acc: LocalizedDamageTypes, [key, labelKey]) => {
            acc[key] = game.i18n.localize(labelKey);
            return acc;
        },
        {} as LocalizedDamageTypes
    );

    const damageTypesOptions = Object.entries(damageTypes).map(([key, _labelKey]) => {
        const localizedDamageLabel = localizedDamageLabels[key];
        return `<option value="${key}">${localizedDamageLabel}</option>`;
    }).join('');

    const preciousMaterials: Record<string, string> = CONFIG.PF2E.preciousMaterials;

    type LocalizedPreciousMaterials = Record<string, string>;

    const localizedPreciousMaterialLabels = Object.entries(preciousMaterials).reduce(
        (acc: LocalizedPreciousMaterials, [key, labelKey]) => {
            acc[key] = game.i18n.localize(labelKey);
            return acc;
        },
        {} as LocalizedPreciousMaterials
    );

    const materialOptions = Object.entries(preciousMaterials).map(([key, _labelKey]) => {
        const localizedPreciousMaterialLabel = localizedPreciousMaterialLabels[key];
        return `<option value="${key}">${localizedPreciousMaterialLabel}</option>`;
    }).join('');
    
    const damageTags: Record<string, string> = {
        precision: "Precision",
        splash: "Splash",
        area: "Area of Effect",
        persistent: "Persistent",
        magical: "Magical",
        ghostTouch: "Ghost Touch",
    };

    const checkboxHTML = Object.entries(damageTags).map(([key, label]) => `
        <div class="form-group checkbox">
            <label for="${key}">${label}</label>
            <input type="checkbox" name="${key}">
        </div>
    `).join('');

    const dialogContent = `
        <form class="damage-helper-form">
            <div class="dialog-content">
                <div class="form-group">
                    <label>Damage Amount:</label>
                    <input type="number" name="damageAmount" min="1" step="1" required>
                </div>
                
                <div class="form-group">
                    <label>Damage Type:</label>
                    <select name="damageType">
                        ${damageTypesOptions}
                    </select>
                </div>
                
                <div class="form-group">
                    <label>Precious Material:</label>
                    <select name="preciousMaterial">
                        <option value="">(None)</option>
                        ${materialOptions}
                    </select>
                </div>
                
                <hr/>
                
                <h3 class="form-header">Damage Modifiers</h3>
                ${checkboxHTML}

            </div>
        </form>
    `;

    const dialog = new DialogV2({
        window: {
            title: "Create Damage Roll"
        },

        content: dialogContent,
        buttons: [
            {
                action: "roll",
                label: "Submit",
                icon: '<i class="fas fa-dice-d20"></i>',
                callback: (_event: PointerEvent | SubmitEvent, _button: HTMLButtonElement, dialog: InstanceType<typeof DialogV2>) => {  

                    const dialogElement = dialog.element as HTMLDialogElement;

                    const amountInput = dialogElement.querySelector('input[name="damageAmount"]') as HTMLInputElement;
                    const damageTypeSelect = dialogElement.querySelector('select[name="damageType"]') as HTMLSelectElement;
                    const materialSelect = dialogElement.querySelector('select[name="preciousMaterial"]') as HTMLSelectElement;

                    const amount = amountInput?.value;
                    const damageType = damageTypeSelect?.value;
                    const material = materialSelect?.value;
                    
                    const isPrecisionCheck = dialogElement.querySelector('input[name="precision"]') as HTMLInputElement;
                    const isSplashCheck = dialogElement.querySelector('input[name="splash"]') as HTMLInputElement;
                    const isAreaCheck = dialogElement.querySelector('input[name="area"]') as HTMLInputElement;
                    const isPersistentCheck = dialogElement.querySelector('input[name="persistent"]') as HTMLInputElement;
                    const isMagicalCheck = dialogElement.querySelector('input[name="magical"]') as HTMLInputElement;
                    const isGhostTouchCheck = dialogElement.querySelector('input[name="ghostTouch"]') as HTMLInputElement;
                    
                    const isPrecision = isPrecisionCheck.checked;
                    const isSplash = isSplashCheck.checked;
                    const isArea = isAreaCheck.checked;
                    const isPersistent = isPersistentCheck.checked;
                    const isMagical = isMagicalCheck.checked;
                    const isGhostTouch = isGhostTouchCheck.checked;

                    // Define trait constants
                    const areaDamageTrait = 'area-damage';
                    const magicalTrait = 'item:magical';
                    const ghostTouchTrait = 'item:rune:property:ghost-touch';

                    const damageTraits = [];
                    const damageTraitsText = [];
                    const damageModifiers = [];
                    const damageModifiersText = [];
                    const damageAndMaterialTypes = [];

                    if (amount && parseInt(amount) > 0) {
                        const value = `${amount}`;

                        damageAndMaterialTypes.push(damageType);
                        if (material) {
                            damageAndMaterialTypes.push(material); 
                        }
                        if (isPersistent) {
                            damageAndMaterialTypes.push('persistent');
                            damageModifiersText.push(damageTags.persistent);
                        }
                        if (isPrecision) {
                            damageModifiers.push('precision');
                            damageModifiersText.push(damageTags.precision);
                        }
                        if (isSplash) {
                            damageModifiers.push('splash');
                            damageModifiersText.push(damageTags.splash);
                        }
                        if (isArea) {
                            damageTraits.push(areaDamageTrait);
                            damageTraitsText.push(damageTags.area);
                        }
                        if (isMagical) {
                            damageTraits.push(magicalTrait);
                            damageTraitsText.push(damageTags.magical);
                        }
                        if (isGhostTouch) {
                            damageTraits.push(ghostTouchTrait);
                            damageTraitsText.push(damageTags.ghostTouch);
                        }

                        const DamageRoll = CONFIG.Dice.rolls.find((r) => r.name === "DamageRoll");
                        if (!DamageRoll) return;

                        let formula = ``;
                        if (damageModifiers.length > 0) {
                            formula = `{(${value}[${damageModifiers}])[${damageAndMaterialTypes}]}`;
                        } else {
                            formula = `{${value}[${damageAndMaterialTypes}]}`;
                        }

                        const myRoll = new DamageRoll(formula);

                        const damageTypeFlavor = `<b>Type: </b>${localizedDamageLabels[damageType]}`;
                        const materialFlavor = material ? `; <b>Material: </b>${localizedPreciousMaterialLabels[material]}` : ``;
                        const modifiersFlavor = damageModifiersText.length > 0 ? `; <b>Modifiers: </b>${damageModifiersText.join(", ")}` : ``;
                        const traitsFlavor = damageTraitsText.length > 0 ? `; <b>Traits: </b>${damageTraitsText.join(", ")}` : ``;
                        const fullFlavor = `${damageTypeFlavor}${materialFlavor}${modifiersFlavor}${traitsFlavor}`;

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
                    } else {
                        ui.notifications.error("Please enter a positive integer for damage.");
                    }
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