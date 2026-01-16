import { ChatMessagePF2e, ItemPF2e, TokenPF2e, WeaponPF2e } from "foundry-pf2e";
import { sendBasicChatMessage } from "../utils.ts";
import { ShiftingWeaponApp } from "../ui/shiftingui.ts";

export async function displayShiftingWeaponDialog(token: TokenPF2e, message: ChatMessagePF2e) {

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
    const baseWeaponHands = currentWeapon.getFlag("samioli-module", "originalBaseWeaponHands");
    const isTwoHanded = (baseWeaponHands ?? currentWeapon.system.usage.hands) === 2;

    // Open the weapon selection window and wait for a selection
    const selectedWeapon = await ShiftingWeaponApp.selectWeapon(isTwoHanded);

    // Check if the user selected something or closed the window
    if (!selectedWeapon) {
        ui.notifications.warn("Shifting cancelled.");
        return;
    }

    const content = `${token.name} shifts their ${removeShiftingSuffix(currentWeapon.name)} into a ${selectedWeapon.name}.`;

    // Update the existing weapon to match stats of the selected weapon form
    await updateWeaponStats(currentWeapon, selectedWeapon);

    sendBasicChatMessage(content, token.actor!);
}

function getOriginalBaseWeapon(currentWeapon: WeaponPF2e): string {
    const originalBaseWeapon = currentWeapon.getFlag("samioli-module", "originalBaseWeapon");
    if (!originalBaseWeapon) {
        currentWeapon.setFlag("samioli-module", "originalBaseWeapon", currentWeapon.system.baseItem);
        currentWeapon.setFlag("samioli-module", "originalBaseWeaponHands", currentWeapon.system.usage.hands);
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
        "system.group": selectedWeapon.system.group,
        "system.traits": selectedWeapon.system.traits,
        "system.bulk": selectedWeapon.system.bulk,
        "system.usage": selectedWeapon.system.usage,
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