import { WeaponPF2e } from "foundry-pf2e";
import { ApplicationRenderOptions } from "foundry-pf2e/foundry/client/applications/_module.mjs";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class ShiftingWeaponApp extends HandlebarsApplicationMixin(ApplicationV2) {

    private isTwoHanded: boolean;
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
        this.isTwoHanded = isTwoHanded;

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

    override async _prepareContext(options: ApplicationRenderOptions) {
        const context = await super._prepareContext(options);
        // Get the PF2e Equipment Compendium
        const pack = game.packs.get("pf2e.equipment-srd");
        if (!pack) return { ...context, weapons: [] };

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

        // Filter and Map Data
        const weapons = index
            .filter((item) => {
                // Check if it's in the list of base weapons
                if (!(item.system.slug in baseWeapons)) return false;
                // Remove things like ammo by confirming it's a weapon
                if (item.type !== "weapon") return false;

                // Filter to exclude two-handed weapons if original weapon is one handed
                if (!this.isTwoHanded) {
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

        return { ...context, weapons };
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