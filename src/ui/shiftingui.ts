import { CharacterPF2e, WeaponPF2e } from "foundry-pf2e";
import { ApplicationRenderOptions } from "foundry-pf2e/foundry/client/applications/_module.mjs";
import { getWeaponProficiencyRank } from "../utils.ts";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class ShiftingWeaponApp extends HandlebarsApplicationMixin(ApplicationV2) {

    private isTwoHanded: boolean;
    private originalBaseWeapon: string | null;
    private actor: CharacterPF2e;
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

    constructor(isTwoHanded: boolean, originalBaseWeapon: string | null, actor: CharacterPF2e, options: Partial<foundry.applications.ApplicationConfiguration> = {}) {
        super(options);
        this.isTwoHanded = isTwoHanded;
        this.originalBaseWeapon = originalBaseWeapon;
        this.actor = actor;

        if (this.options.form) {
            this.options.form.handler = this.formHandler.bind(this);
        }
    }

    static async selectWeapon(isTwoHanded: boolean, originalBaseWeapon: string | null, actor: CharacterPF2e): Promise<WeaponPF2e | null> {

        return new Promise((resolve) => {
            const app = new ShiftingWeaponApp(isTwoHanded, originalBaseWeapon, actor);
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

        // Search and filter functionality
        const searchInput = html.querySelector(".shifting-search-input") as HTMLInputElement;
        const hideUntrainedCheckbox = html.querySelector(".shifting-hide-untrained") as HTMLInputElement;

        const filterRows = () => {
            const query = searchInput?.value.toLowerCase() || "";
            const hideUntrained = hideUntrainedCheckbox?.checked ?? false;

            rows.forEach(row => {
                const matchesSearch = this.weaponMatchesSearch(row, query);

                let matchesProficiency = true;
                if (hideUntrained) {
                    matchesProficiency = row.getAttribute("data-is-proficient") === "true";
                }

                if (matchesSearch && matchesProficiency) {
                    (row as HTMLElement).style.display = "";
                } else {
                    (row as HTMLElement).style.display = "none";
                }
            });
        };

        if (searchInput) {
            searchInput.addEventListener("input", filterRows);
        }
        if (hideUntrainedCheckbox) {
            hideUntrainedCheckbox.addEventListener("change", filterRows);
        }

        // Run initial filter
        filterRows();
    }

    private updateSelectedRow(allRows: NodeListOf<Element>, selectedRow: Element) {
        allRows.forEach(r => r.classList.remove("selected"));
        selectedRow.classList.add("selected");
    }

    private weaponMatchesSearch(row: Element, query: string): boolean {
        const nameCell = row.querySelector(".weapon-name strong");
        const traits = Array.from(row.querySelectorAll(".tags .tag")).map(t => t.textContent?.toLowerCase() || "");

        const nameMatch = nameCell?.textContent?.toLowerCase().includes(query) ?? false;
        const traitMatch = traits.some(t => t.includes(query));
        return nameMatch || traitMatch || query === "";
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

        // Filter the index
        const filteredIndex = index.filter((item) => {
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
            });

        const progress = ui.notifications.info("Loading weapons...", { progress: true});

        // Fetch full Document objects for the filtered items concurrently
        const weaponDocuments: WeaponPF2e[] = [];
        let count = 0;
        const total = filteredIndex.length;

        const promises = filteredIndex.map(async (idx) => {
            const weapon = (await pack.getDocument(idx._id)) as WeaponPF2e;
            count++;
            progress.update({ 
                pct: (count / total), 
                message: `Loading weapons... (${count} of ${total})` 
            });
            return weapon;
        });

        const weaponsRaw = await Promise.all(promises);
        
        for (const weapon of weaponsRaw) {
            if (weapon) weaponDocuments.push(weapon);
        }

        // Map Data
        const weapons = weaponDocuments.map((weapon) => {

                const traits = weapon.system.traits?.value || [];
                const categoryLabel = game.i18n.localize(CONFIG.PF2E.weaponCategories[weapon.system.category as keyof typeof CONFIG.PF2E.weaponCategories]) || weapon.system.category;
                const groupLabel = game.i18n.localize(CONFIG.PF2E.weaponGroups[weapon.system.group as keyof typeof CONFIG.PF2E.weaponGroups]) || weapon.system.group;
                let isOriginalForm = false;
                if (this.originalBaseWeapon && this.originalBaseWeapon === weapon.system.slug) {
                    isOriginalForm = true;
                }

                return {
                    id: weapon._id,
                    name: weapon.name,
                    slug: weapon.system.slug,
                    rawCategory: weapon.system.category,
                    category: categoryLabel,
                    group: groupLabel,
                    traits: traits.map((trait: string) => ({
                        label: game.i18n.localize(CONFIG.PF2E.weaponTraits[trait as keyof typeof CONFIG.PF2E.weaponTraits]),
                        tooltip: game.i18n.localize(CONFIG.PF2E.traitsDescriptions[trait as keyof typeof CONFIG.PF2E.traitsDescriptions])
                    })),
                    dice: weapon.system.damage.die,
                    type: weapon.system.damage.damageType,
                    hands: this.formatNumberOfHands(weapon.system.usage?.value),
                    bulk: weapon.system.bulk?.value,
                    isOriginalForm: isOriginalForm,
                    isProficient: getWeaponProficiencyRank(this.actor, weapon) > 0
                };
            });

        // Sort alphabetically
        weapons.sort((a, b) => a.name.localeCompare(b.name));

        ui.notifications.remove(progress);

        return { ...context, weapons };
    }

    private formatNumberOfHands(usage: string) {
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