import { CharacterPF2e, ChatMessagePF2e, ItemPF2e, TokenPF2e, WeaponPF2e } from "foundry-pf2e";
import { sendBasicChatMessage } from "../utils.ts";
import { ShiftingWeaponApp } from "../ui/shiftingui.ts";

const { DialogV2 } = foundry.applications.api;

export async function displayShiftingWeaponDialogFromActivationsModule(token: TokenPF2e, message: ChatMessagePF2e) {

    // Get the item from the message content
    const weapon = extractWeaponFromContent(message.content);
    if (!weapon) {
        ui.notifications.warn("This action acts on a weapon, but no weapon was found.");
        return;
    }

    await displayShiftingWeaponDialogForWeapon(token, weapon);
}

export async function displayShiftingWeaponDialogViaMacro(token: TokenPF2e) {
    const weapon = await getHeldShiftingWeaponFromToken(token);
    if (!weapon) return;
    await displayShiftingWeaponDialogForWeapon(token, weapon);
}

export async function getHeldShiftingWeaponFromToken(token: TokenPF2e): Promise<WeaponPF2e | null> {
    if (!token.actor) return null;

    // Filter for all held weapons
    const heldWeapons = token.actor.itemTypes.weapon.filter(w => w.isEquipped);

    // Determine if it has a shifting rune
    const shiftingWeapons = heldWeapons.filter(w => hasShiftingRune(w));

    if (shiftingWeapons.length === 0) {
        ui.notifications.warn("No equipped weapon with a shifting rune was found.");
        return null;
    }

    if (shiftingWeapons.length === 1) {
        return shiftingWeapons[0];
    }

    // Handle multiple shifting weapons scenario
    try {
        const weaponId = await DialogV2.wait({
            window: { title: "Select Weapon to Shift" },
            content: `
                <form>
                    <div class="form-group">
                        <label>Select Weapon:</label>
                        <select name="shiftingWeaponSelect">
                            ${shiftingWeapons.map(w => `<option value="${w.id}">${w.name}</option>`).join("")}
                        </select>
                    </div>
                </form>
            `,
            buttons: [{
                action: "shift",
                label: "Shift",
                default: true,
                callback: (_event: Event, _button: HTMLButtonElement, dialog: any) => {
                    const selectElement = dialog.element.querySelector('[name="shiftingWeaponSelect"]');
                    return selectElement?.value;
                }
            }],
            rejectClose: true
        });

        if (weaponId) {
            return shiftingWeapons.find(w => w.id === weaponId as string) || null;
        }
    } catch {
        ui.notifications.warn("Shifting cancelled.");
    }
    
    return null;
}

async function displayShiftingWeaponDialogForWeapon(token: TokenPF2e, weapon: WeaponPF2e) {
     // Check that the item has the shifting rune
    if (!hasShiftingRune(weapon)) {
        ui.notifications.warn(`The weapon ${weapon.name} does not have a Shifting rune.`);
        return;
    }

    let originalBaseWeapon = getOriginalBaseWeapon(weapon);

    // Set the original weapon flags if this is the first time shifting this weapon
    if (!originalBaseWeapon) {
        await setOriginalWeaponFlagsOnWeapon(weapon);
        await setOriginalWeaponNameFlag(weapon);
    }

    // Check how many hands the item is (this determines what it can shift into)
    const baseWeaponHands = weapon.getFlag("samioli-module", "originalBaseWeaponHands") as number;
    const isTwoHanded = baseWeaponHands === 2;

    // Open the weapon selection window and wait for a selection
    const selectedWeapon = await ShiftingWeaponApp.selectWeapon(isTwoHanded, originalBaseWeapon, token.actor as CharacterPF2e);

    // Check if the user selected something or closed the window
    if (!selectedWeapon) {
        ui.notifications.warn("Shifting cancelled.");
        return;
    }

    // Update the existing weapon to match stats of the selected weapon form
    const isOriginalForm = await updateWeaponStats(weapon, selectedWeapon);

    let content = "";
    if (isOriginalForm){
        content = `${token.name} shifts their ${extractOriginalNameFromShiftedSuffix(weapon.name)} into its original form.`;
    } else {
        content = `${token.name} shifts their ${extractOriginalNameFromShiftedSuffix(weapon.name)} into a ${selectedWeapon.name}.`;
    }

    sendBasicChatMessage(content, token.actor!);
}

function getOriginalBaseWeapon(currentWeapon: WeaponPF2e): string | null {
    return currentWeapon.getFlag("samioli-module", "originalBaseWeapon") as string;
}

async function setOriginalWeaponFlagsOnWeapon(weapon: WeaponPF2e) {
    await weapon.setFlag("samioli-module", "originalBaseWeapon", weapon.system.baseItem);
    await weapon.setFlag("samioli-module", "originalBaseWeaponHands", weapon.system.usage.hands);
}

function getOriginalWeaponName(currentWeapon: WeaponPF2e): string | null {
    return currentWeapon.getFlag("samioli-module", "originalWeaponName") as string;
}

async function setOriginalWeaponNameFlag(weapon: WeaponPF2e) {
    await weapon.setFlag("samioli-module", "originalWeaponName", weapon.name);
}

/**
 * Updates the current weapon with specific traits from the selected weapon.
 */
async function updateWeaponStats(preShiftedWeapon: WeaponPF2e, postShiftedWeapon: WeaponPF2e): Promise<boolean> {
    const originalBaseWeapon = getOriginalBaseWeapon(preShiftedWeapon);
    const isChangingToOriginalForm = originalBaseWeapon === postShiftedWeapon.system.baseItem;

    // If we're shifting FROM the original form, save its current name first
    if (originalBaseWeapon === preShiftedWeapon.system.baseItem) {
        await setOriginalWeaponNameFlag(preShiftedWeapon);
    }

    // Retrieve the original name (fallback to current name if somehow missing)
    const originalName = getOriginalWeaponName(preShiftedWeapon) || preShiftedWeapon.name;

    const newName = isChangingToOriginalForm 
        ? originalName
        : `${postShiftedWeapon.name} (shifted ${originalName})`;

    await preShiftedWeapon.update({
        "system.damage": postShiftedWeapon.system.damage,
        "system.baseItem": postShiftedWeapon.system.baseItem,
        "system.category": postShiftedWeapon.system.category,
        "system.group": postShiftedWeapon.system.group,
        "system.traits": postShiftedWeapon.system.traits,
        "system.bulk": postShiftedWeapon.system.bulk,
        "system.usage": postShiftedWeapon.system.usage,
        "name": newName
    });

    return isChangingToOriginalForm;
}

/**
 * Returns the original name of a shifted weapon.
 * Extracts from " (shifted ...)" at the end of the string.
 */
function extractOriginalNameFromShiftedSuffix(name: string): string {
    const match = name.match(/ \(shifted (.*)\)$/);
    if (match) {
        return match[1];
    }
    return name;
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
function extractWeaponFromContent(content: string): WeaponPF2e | null {
    const uuidMatch = content.match(/data-uuid="([^"]+)"/);
    if (!uuidMatch) return null;

    const uuid = uuidMatch[1];

    const item = fromUuidSync(uuid) as ItemPF2e | null;

    if (item?.isOfType("weapon")) {
        return item as WeaponPF2e;
    }

    return null;
}