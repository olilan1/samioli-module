import { ChatMessagePF2e, TokenPF2e, WeaponPF2e } from "foundry-pf2e";
import { ApplicationRenderOptions } from "foundry-pf2e/foundry/client/applications/_module.mjs";
import { sendBasicChatMessage } from "../utils.ts";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export async function displayShiftingWeaponDialog(token: TokenPF2e, message: ChatMessagePF2e) {

    // Check for slug: "origin:item:activation-shift-weapon"
    const rollOptions = message.flags.pf2e.origin?.rollOptions;

    if (!rollOptions?.includes("origin:item:activation-shift-weapon")) return;

    // Get the item from the message content
    const currentWeapon = extractWeaponFromContent(message.content);
    if (!currentWeapon) {
        ui.notifications.warn("This action acts on a weapon, but no weapon was found.");
        return;
    }

    // Check that the item has the shifting rune
    if (!hasShiftingRune(currentWeapon)) {
        ui.notifications.warn(`The weapon ${currentWeapon.name} does not have a Shifting rune.`);
        return;
    }

    // Check how many hands the item is (this determines what it can shift into)
    const isTwoHanded = currentWeapon.system.usage.value === "held-in-two-hands";

    // Open the weapon selection window and wait for a selection
    const selectedWeapon = await ShiftingWeaponApp.selectWeapon(isTwoHanded);

    // Check if the user selected something or closed the window
    if (!selectedWeapon) {
        ui.notifications.warn("Shifting cancelled.");
        return;
    }

    // TODO shorten name
    const content = `${token.name} shifts their ${removeShiftingSuffix(currentWeapon.name)} into a ${selectedWeapon.name}.`;

    // Update the existing weapon to match stats of the selected weapon form
    await updateWeaponStats(currentWeapon, selectedWeapon);

    sendBasicChatMessage(content, token.actor!);
}

function getOriginalBaseWeapon(currentWeapon: WeaponPF2e): string {
    const originalBaseWeapon = currentWeapon.getFlag("samioli-module", "originalBaseWeapon");
    if (!originalBaseWeapon) {
        currentWeapon.setFlag("samioli-module", "originalBaseWeapon", currentWeapon.system.baseItem);
    }
    return originalBaseWeapon as string;
}

/**
 * Updates the current weapon with specific traits from the selected weapon.
 */
async function updateWeaponStats(currentWeapon: WeaponPF2e, selectedWeapon: WeaponPF2e) {

    const originalBaseWeapon = getOriginalBaseWeapon(currentWeapon);

    const currentName = removeShiftingSuffix(currentWeapon.name);

    let newName = ``;
    if (originalBaseWeapon === selectedWeapon.system.baseItem) {
        newName = `${currentName}`;
    } else {
        newName = `${currentName} (in ${selectedWeapon.name} form)`;
    }

    await currentWeapon.update({
        "system.damage": selectedWeapon.system.damage,
        "system.baseItem": selectedWeapon.system.baseItem,
        "system.category": selectedWeapon.system.category,
        "system.traits": selectedWeapon.system.traits,
        "system.bulk": selectedWeapon.system.bulk,
        "system.usage.value": selectedWeapon.system.usage.value,
        "name": newName
    });
}

/**
 * Removes the shifting suffix from a weapon name if present.
 * Looks for " (in ... form)" at the end of the string.
 */
function removeShiftingSuffix(name: string): string {
    const regex = / \(in .* form\)$/;
    return name.replace(regex, "");
}

/**
 * Checks if a weapon has the Shifting property rune.
 */
function hasShiftingRune(item: WeaponPF2e): boolean {
    return item.system.runes.property.includes("shifting");
}

/**
 * Extracts the weapon from the pf2e-activations message content.
 */
function extractWeaponFromContent(content: string): WeaponPF2e | undefined {
    const uuidMatch = content.match(/data-uuid="([^"]+)"/);
    if (!uuidMatch) return undefined;

    const uuid = uuidMatch[1];

    const item = fromUuidSync(uuid);

    if ((item as any)?.isOfType?.("weapon")) {
        return item as WeaponPF2e;
    }

    return undefined;
}

export class ShiftingWeaponApp extends HandlebarsApplicationMixin(ApplicationV2) {

    private requiresTwoHands: boolean;
    private resolve?: (value: WeaponPF2e | null) => void;

    static override DEFAULT_OPTIONS = {
        tag: "form",
        id: "shifting-rune-selector",
        classes: ["shifting-window"],
        window: {
            title: "Shifting Rune: Select Weapon",
            resizable: true,
            contentClasses: ["standard-form"],
            icon: "fa-solid fa-sword"
        },
        position: {
            width: 900,
            height: 650
        },
        form: {
            closeOnSubmit: true
        }
    };

    static override PARTS = {
        form: {
            template: "modules/samioli-module/templates/shifting-weapon.hbs"
        }
    };

    constructor(isTwoHanded: boolean, options: Partial<foundry.applications.ApplicationConfiguration> = {}) {
        super(options);
        this.requiresTwoHands = isTwoHanded;

        if (this.options.form) {
            this.options.form.handler = this.formHandler.bind(this);
        }
    }

    static async selectWeapon(isTwoHanded: boolean): Promise<WeaponPF2e | null> {

        return new Promise((resolve) => {
            const app = new ShiftingWeaponApp(isTwoHanded);
            app.resolve = resolve;
            app.render(true);
        });
    }

    override async _onRender(context: ApplicationRenderOptions, options: any) {
        await super._onRender(context, options);

        // Setup row click listeners
        const html = this.element;
        const rows = html.querySelectorAll("tbody tr");

        rows.forEach(row => {
            row.addEventListener("click", (_event) => {
                // Find the radio inside
                const radio = row.querySelector('input[type="radio"]') as HTMLInputElement;
                if (radio) {
                    radio.checked = true;
                    // Trigger update of selected class
                    this.updateSelectedRow(rows, row);
                }
            });
        });

        // Also listen for direct radio clicks
        const radios = html.querySelectorAll('input[type="radio"]');
        radios.forEach(radio => {
            radio.addEventListener("change", (event) => {
                const targetRadio = event.target as HTMLInputElement;
                if (targetRadio.checked) {
                    const row = targetRadio.closest("tr");
                    if (row) this.updateSelectedRow(rows, row);
                }
            });
        });
    }

    updateSelectedRow(allRows: NodeListOf<Element>, selectedRow: Element) {
        allRows.forEach(r => r.classList.remove("selected"));
        selectedRow.classList.add("selected");
    }

    override async _prepareContext(_options: ApplicationRenderOptions) {
        // Get the PF2e Equipment Compendium
        const pack = game.packs.get("pf2e.equipment-srd");
        if (!pack) return { weapons: [] };

        // Get fields we need to display
        const indexFields = [
            "system.category",
            "system.group",
            "system.traits",
            "system.damage",
            "system.usage",
            "system.bulk",
            "system.range",
            "system.slug"
        ];

        // Load the index
        const index = await pack.getIndex({ fields: indexFields });

        const baseWeapons = CONFIG.PF2E.baseWeaponTypes;
        // Get if the original weapon is two handed
        const isTwoHanded = this.requiresTwoHands;

        // Filter and Map Data
        const weapons = index
            .filter((item) => {
                // Check if it's in the list of base weapons
                if (!(item.system.slug in baseWeapons)) return false;
                // Remove things like ammo by confirming it's a weapon
                if (item.type !== "weapon") return false;

                // Filter to exclude two-handed weapons if original weapon is one handed
                if (!isTwoHanded) {
                    if (item.system.usage?.value === "held-in-two-hands") return false;
                }

                // Remove anything with the "attached" trait
                if (item.system.traits?.value?.includes("attached")) return false;

                // Filter to only include melee weapons
                const isRanged = item.system.range > 0;
                if (isRanged) return false;

                return true;
            })
            .map((weapon) => {

                const traits = weapon.system.traits?.value || [];
                const categoryLabel = game.i18n.localize(CONFIG.PF2E.weaponCategories[weapon.system.category as keyof typeof CONFIG.PF2E.weaponCategories]) || weapon.system.category;
                const groupLabel = game.i18n.localize(CONFIG.PF2E.weaponGroups[weapon.system.group as keyof typeof CONFIG.PF2E.weaponGroups]) || weapon.system.group;

                return {
                    id: weapon._id,
                    name: weapon.name,
                    category: categoryLabel,
                    group: groupLabel,
                    traits: traits.map((trait: string) => ({
                        label: game.i18n.localize(CONFIG.PF2E.weaponTraits[trait as keyof typeof CONFIG.PF2E.weaponTraits]),
                        tooltip: game.i18n.localize(CONFIG.PF2E.traitsDescriptions[trait as keyof typeof CONFIG.PF2E.traitsDescriptions])
                    })),
                    damage: `${weapon.system.damage.die} ${weapon.system.damage.damageType}`,
                    hands: this.formatNumberOfHands(weapon.system.usage?.value),
                    bulk: weapon.system.bulk?.value
                };
            });

        // Sort alphabetically
        weapons.sort((a, b) => a.name.localeCompare(b.name));

        return { weapons };
    }

    formatNumberOfHands(usage: string) {
        if (!usage) return "-";
        if (usage === "held-in-one-hand") return "1H";
        if (usage === "held-in-two-hands") return "2H";
        return "n/a";
    }

    async formHandler(_event: any, _form: any, formData: any) {

        const weaponId = formData.object.weaponId;

        if (!weaponId) {
            ui.notifications.warn("No weapon form selected.");
        }

        // Fetch the full item document from compendium
        const pack = game.packs.get("pf2e.equipment-srd");
        if (!pack) throw new Error("Compendium pf2e.equipment-srd not found");
        const weaponItem = await pack.getDocument(weaponId) as WeaponPF2e;

        this.resolve?.(weaponItem);
    }

    // Handle closing without submission
    override _onClose(_options: any) {
        if (this.resolve) this.resolve(null);
        super._onClose(_options);
    }
}