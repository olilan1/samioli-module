import { CharacterPF2e, MartialProficiency, WeaponPF2e } from "foundry-pf2e";
import { ApplicationRenderOptions } from "foundry-pf2e/foundry/client/applications/_module.mjs";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const EQUIPMENT_PACK = "pf2e.equipment-srd";

const USAGE_MAP: Record<string, string> = {
    "held-in-one-hand": "1H",
    "held-in-two-hands": "2H",
    "held-in-one-plus-hands": "1+H"
};

const INDEX_FIELDS = [
    "system.category",
    "system.group",
    "system.traits",
    "system.damage",
    "system.usage",
    "system.bulk",
    "system.range",
    "system.slug",
    "system.baseItem",
    "system.level"
];

interface WeaponIndexData {
    _id: string;
    name: string;
    type: string;
    system: {
        category: string;
        group: string;
        traits?: { value: string[] };
        damage?: { die: string; damageType: string };
        usage?: { value: string };
        bulk?: { value: string };
        range?: number | null;
        slug: string;
        baseItem?: string;
        level?: { value: number };
    };
}

export class ShiftingWeaponApp extends HandlebarsApplicationMixin(ApplicationV2) {
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
            closeOnSubmit: false
        }
    };

    static override PARTS = {
        form: {
            template: "modules/samioli-module/templates/shifting-weapon.hbs"
        }
    };

    constructor(
        private isTwoHanded: boolean, 
        private originalBaseWeapon: string | null, 
        private currentWeaponBaseId: string,
        private actor: CharacterPF2e, 
        options: Partial<foundry.applications.ApplicationConfiguration> = {}
    ) {
        super(options);

        if (this.options.form) {
            this.options.form.handler = this.formHandler.bind(this);
        }
    }

    // Wraps the application in a Promise so the caller can await the user's weapon selection.
    static async selectWeapon(
        isTwoHanded: boolean, 
        originalBaseWeapon: string | null, 
        currentWeaponBaseId: string,
        actor: CharacterPF2e
    ): Promise<WeaponPF2e | null> {

        return new Promise((resolve) => {
            const app = new ShiftingWeaponApp(
                isTwoHanded, originalBaseWeapon, currentWeaponBaseId, actor
            );
            app.resolve = resolve;
            app.render(true);
        });
    }

    override async _onRender(
        context: Record<string, unknown>, 
        options: ApplicationRenderOptions
    ): Promise<void> {
        await super._onRender(context, options);

        const html = this.element;
        const tbody = html.querySelector("tbody");
        const rows = html.querySelectorAll<HTMLTableRowElement>("tbody tr");

        if (tbody) {
            // Event delegation for row clicks
            tbody.addEventListener("click", (event) => {
                const target = event.target as HTMLElement;
                // Avoid double-triggering if the user clicked the radio directly
                if (target instanceof HTMLInputElement && target.type === "radio") return;

                const row = target.closest<HTMLTableRowElement>("tr");
                if (row) {
                    const radio = row.querySelector<HTMLInputElement>('input[type="radio"]');
                    if (radio) {
                        radio.checked = true;
                        this.updateSelectedRow(row);
                    }
                }
            });

            // Event delegation for radio button changes
            tbody.addEventListener("change", (event) => {
                const target = event.target as HTMLElement;
                if (
                    target instanceof HTMLInputElement && 
                    target.type === "radio" && target.checked
                ) {
                    const row = target.closest<HTMLTableRowElement>("tr");
                    if (row) this.updateSelectedRow(row);
                }
            });
        }

        // Search and filter functionality
        const searchInput = html.querySelector<HTMLInputElement>(".shifting-search-input");
        const hideUntrainedCheckbox = 
            html.querySelector<HTMLInputElement>(".shifting-hide-untrained");

        // Re-evaluates row visibility whenever the search query or "Hide Untrained" toggle changes.
        const filterRows = () => {
            const query = searchInput?.value.toLowerCase() || "";
            const hideUntrained = hideUntrainedCheckbox?.checked ?? false;

            rows.forEach(row => {
                // Reading textContent is highly optimized compared to running DOM selectors. It
                // also means the search can include everything in the row (including e.g. dice)
                const matchesSearch = !query || 
                    (row.textContent ?? "").toLowerCase().includes(query);
                
                const matchesProficiency = !hideUntrained || row.dataset.isProficient === "true";

                row.style.display = matchesSearch && matchesProficiency ? "" : "none";
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

    private updateSelectedRow(selectedRow: HTMLTableRowElement): void {
        const currentlySelected = this.element.querySelector<HTMLTableRowElement>("tr.selected");
        if (currentlySelected && currentlySelected !== selectedRow) {
            currentlySelected.classList.remove("selected");
        }
        selectedRow.classList.add("selected");
    }

    override async _prepareContext(options: ApplicationRenderOptions) {
        const context = await super._prepareContext(options);
        
        const pack = game.packs.get(EQUIPMENT_PACK);
        if (!pack) return { ...context, weapons: [] };

        // Fetching the index is significantly faster than loading all full weapon documents.
        const index = (await pack.getIndex({ 
            fields: INDEX_FIELDS 
        })) as unknown as WeaponIndexData[];

        const { 
            weaponCategories, weaponGroups, weaponTraits, traitsDescriptions, baseWeaponTypes 
        } = CONFIG.PF2E;

        // Restrict the list to valid melee base weapons (accounting for 1H/2H constraints).
        const filteredIndex = index.filter(item =>
            item.type === "weapon" &&
            item.system.slug in baseWeaponTypes &&
            (this.isTwoHanded || item.system.usage?.value !== "held-in-two-hands") &&
            !item.system.traits?.value?.includes("attached") &&
            (item.system.range ?? 0) === 0
        );

        // Map Data
        const weapons = filteredIndex.map((idx: WeaponIndexData) => {
            const traits = idx.system.traits?.value ?? [];
            
            const catKey = weaponCategories[idx.system.category as keyof typeof weaponCategories];
            const categoryLabel = catKey ? game.i18n.localize(catKey) : idx.system.category;
            
            const grpKey = weaponGroups[idx.system.group as keyof typeof weaponGroups];
            const groupLabel = grpKey ? game.i18n.localize(grpKey) : idx.system.group;
            
            const isOriginalForm = this.originalBaseWeapon === idx.system.slug;
            const isProficient = this.checkWeaponProficiency(idx, traits);

            return {
                id: idx._id,
                level: idx.system.level?.value ?? 0,
                name: idx.name,
                slug: idx.system.slug,
                rawCategory: idx.system.category,
                category: categoryLabel,
                group: groupLabel,
                traits: traits.map((trait: string) => {
                    const labelKey = weaponTraits[
                        trait as keyof typeof weaponTraits
                    ];
                    const descKey = traitsDescriptions[
                        trait as keyof typeof traitsDescriptions
                    ];
                    
                    return {
                        label: labelKey ? game.i18n.localize(labelKey) : trait,
                        tooltip: descKey ? game.i18n.localize(descKey) : ""
                    };
                }),
                dice: idx.system.damage?.die,
                type: idx.system.damage?.damageType,
                hands: this.formatNumberOfHands(idx.system.usage?.value),
                bulk: idx.system.bulk?.value,
                isOriginalForm,
                isProficient
            };
        });

        // Sort alphabetically, but hoist the original form to the top if we aren't 
        // currently wielding it
        const isCurrentlyOriginal = this.originalBaseWeapon === this.currentWeaponBaseId;

        weapons.sort((a, b) => {
            if (!isCurrentlyOriginal) {
                if (a.isOriginalForm && !b.isOriginalForm) return -1;
                if (b.isOriginalForm && !a.isOriginalForm) return 1;
            }
            return a.name.localeCompare(b.name);
        });

        return { ...context, weapons };
    }

    private checkWeaponProficiency(idx: WeaponIndexData, traits: string[]): boolean {
        // Manually evaluate proficiency against raw index data.
        const proficiencies = this.actor.system.proficiencies;
        const categoryRank = proficiencies.attacks[idx.system.category]?.rank ?? 0;
        const groupRank = proficiencies.attacks[`weapon-group-${idx.system.group}`]?.rank ?? 0;
        
        const equivalentWeapons: Record<string, string | undefined> = 
            CONFIG.PF2E.equivalentWeapons;
        const baseWeapon = equivalentWeapons[idx.system.baseItem ?? ""] ?? idx.system.baseItem;
        const baseWeaponRank = baseWeapon 
            ? (proficiencies.attacks[`weapon-base-${baseWeapon}`]?.rank ?? 0) 
            : 0;

        // Early return if natively proficient via class features (skips expensive synthetic checks)
        if (Math.max(categoryRank, groupRank, baseWeaponRank) > 0) {
            return true;
        }

        // Reconstruct the roll options to correctly evaluate rule elements e.g. weapon
        // familiarity feats.
        const rollOptions = new Set([
            "item:type:weapon",
            `item:id:${idx._id}`,
            `item:slug:${idx.system.slug}`,
            `item:category:${idx.system.category}`,
            `item:group:${idx.system.group}`,
            ...traits.map((t: string) => `item:trait:${t}`)
        ]);

        if (idx.system.baseItem) {
            rollOptions.add(`item:base:${idx.system.baseItem}`);
        }
        if (baseWeapon && baseWeapon !== idx.system.baseItem) {
            rollOptions.add(`item:base:${baseWeapon}`);
        }

        const rollOptionRanks = Object.values(proficiencies.attacks)
            .filter((p): p is MartialProficiency => 
                !!p?.definition?.test(rollOptions))
            .map((p) => p.rank);

        return rollOptionRanks.some(rank => rank > 0);
    }

    private formatNumberOfHands(usage: string | undefined): string {
        if (!usage) return "-";
        return USAGE_MAP[usage] ?? usage;
    }

    async formHandler(
        _event: Event, 
        _form: HTMLFormElement, 
        formData: { object: Record<string, unknown> }
    ): Promise<void> {
        const weaponId = formData.object.weaponId as string | undefined;

        if (!weaponId) {
            ui.notifications.warn("No weapon form selected.");
            return; // Returns without closing the UI so the user can try again!
        }

        // We only fetch the full Document from the compendium once the user has 
        // definitively made a selection.
        const pack = game.packs.get(EQUIPMENT_PACK);
        if (!pack) throw new Error(`Compendium ${EQUIPMENT_PACK} not found`);
        
        const weaponItem = await pack.getDocument(weaponId) as WeaponPF2e | undefined;
        if (!weaponItem) {
            ui.notifications.error("Could not find the selected weapon in the compendium.");
            return;
        }

        this.resolve?.(weaponItem);
        this.resolve = undefined; // Prevents _onClose from double-resolving with null
        await this.close();
    }

    // Handle closing without submission
    override _onClose(_options: Record<string, unknown>) {
        this.resolve?.(null);
        super._onClose(_options);
    }
}