import { ChatMessagePF2e, ItemPF2e, TokenPF2e, WeaponPF2e } from "foundry-pf2e";
import { isCharacter, MODULE_ID, sendBasicChatMessage } from "../utils.ts";
import { ShiftingWeaponApp } from "../ui/shiftingui.ts";

const { DialogV2 } = foundry.applications.api;

const UUID_REGEX = /data-uuid="([^"]+)"/;
const SHIFTED_NAME_REGEX = / \(shifted (.*)\)$/;

const SHIFTING_FLAGS = {
    BASE_WEAPON: "originalBaseWeapon",
    BASE_HANDS: "originalBaseWeaponHands",
    ORIGINAL_NAME: "originalWeaponName",
    ORIGINAL_IMG: "originalWeaponImg"
} as const;

export async function displayShiftingWeaponDialogFromActivationsModule(
    token: TokenPF2e, 
    message: ChatMessagePF2e
): Promise<void> {

    // Get the item from the message content
    const weapon = extractWeaponFromContent(message.content);
    if (!weapon) {
        ui.notifications.warn("This action acts on a weapon, but no weapon was found.");
        return;
    }

    await displayShiftingWeaponDialogForWeapon(token, weapon);
}

export async function displayShiftingWeaponDialogViaMacro(token: TokenPF2e): Promise<void> {
    const weapon = await getHeldShiftingWeaponFromToken(token);
    if (!weapon) return;
    await displayShiftingWeaponDialogForWeapon(token, weapon);
}

export async function getHeldShiftingWeaponFromToken(token: TokenPF2e): Promise<WeaponPF2e | null> {
    if (!token.actor) return null;

    // Filter for equipped weapons that have a shifting rune
    const shiftingWeapons = token.actor.itemTypes.weapon.filter(w => 
        w.isEquipped && hasShiftingRune(w)
    );

    if (shiftingWeapons.length === 0) {
        ui.notifications.warn("No equipped weapon with a shifting rune was found.");
        return null;
    }

    if (shiftingWeapons.length === 1) {
        return shiftingWeapons[0];
    }

    const optionsHtml = shiftingWeapons
        .map(w => new Option(w.name, w.id).outerHTML)
        .join("");

    // Handle multiple shifting weapons scenario
    const weaponId = await DialogV2.wait({
        // @ts-expect-error Window doesn't need to provide all parameters
        window: { title: "Select Weapon to Shift" },
        content: `
            <form>
                <div class="form-group">
                    <label>Select Weapon:</label>
                    <select name="shiftingWeaponSelect">
                        ${optionsHtml}
                    </select>
                </div>
            </form>
        `,
        buttons: [{
            action: "shift",
            label: "Shift",
            default: true,
            callback: async (_event, _button, dialog) => {
                const selectElement = dialog.querySelector<HTMLSelectElement>(
                    '[name="shiftingWeaponSelect"]'
                );
                return selectElement?.value;
            }
        }],
        rejectClose: false
    }) as string | undefined;

    if (!weaponId) {
        ui.notifications.warn("Shifting cancelled.");
        return null;
    }

    return shiftingWeapons.find(w => w.id === weaponId) ?? null;
}

async function displayShiftingWeaponDialogForWeapon(
    token: TokenPF2e, 
    weapon: WeaponPF2e
): Promise<void> {
    if (!token.actor) return;

    if (!isCharacter(token.actor)) {
        ui.notifications.warn(
            "Shifting weapons is currently only supported for Player Characters."
        );
        return;
    }

     // Check that the item has the shifting rune
    if (!hasShiftingRune(weapon)) {
        ui.notifications.warn(`The weapon ${weapon.name} does not have a Shifting rune.`);
        return;
    }

    const storedBaseWeapon = getOriginalBaseWeapon(weapon);
    const originalBaseWeapon = storedBaseWeapon ?? getWeaponBaseId(weapon);

    // Check how many hands the item is (this determines what it can shift into)
    const baseWeaponHands = (weapon.getFlag(MODULE_ID, SHIFTING_FLAGS.BASE_HANDS) as number) 
        ?? getWeaponHands(weapon);
    const isTwoHanded = baseWeaponHands === 2;

    // Open the weapon selection window and wait for a selection
    const selectedWeapon = await ShiftingWeaponApp.selectWeapon(
        isTwoHanded, originalBaseWeapon, getWeaponBaseId(weapon), token.actor
    );

    // Check if the user selected something or closed the window
    if (!selectedWeapon) {
        ui.notifications.warn("Shifting cancelled.");
        return;
    }

    // Prevent unnecessary database writes if selecting the exact same form
    if (getWeaponBaseId(weapon) === getWeaponBaseId(selectedWeapon)) {
        ui.notifications.info(`${token.name}'s weapon is already in that form.`);
        return;
    }

    // Extract the original name before the update potentially mutates the weapon in memory
    const baseName = extractOriginalNameFromShiftedSuffix(weapon.name);

    // Update the existing weapon to match stats of the selected weapon form
    const isOriginalForm = await updateWeaponStats(weapon, selectedWeapon, originalBaseWeapon);

    const content = isOriginalForm
        ? `${token.name} shifts their ${baseName} into its original form.`
        : `${token.name} shifts their ${baseName} into a ${selectedWeapon.name}.`;

    await sendBasicChatMessage(content, token.actor);
}

function getOriginalBaseWeapon(currentWeapon: WeaponPF2e): string | null {
    return (currentWeapon.getFlag(MODULE_ID, SHIFTING_FLAGS.BASE_WEAPON) as string) ?? null;
}

function getOriginalWeaponName(currentWeapon: WeaponPF2e): string | null {
    return (currentWeapon.getFlag(MODULE_ID, SHIFTING_FLAGS.ORIGINAL_NAME) as string) ?? null;
}

function getOriginalWeaponImg(currentWeapon: WeaponPF2e): string | null {
    return (currentWeapon.getFlag(MODULE_ID, SHIFTING_FLAGS.ORIGINAL_IMG) as string) ?? null;
}

/**
 * Updates the current weapon with specific traits from the selected weapon.
 */
async function updateWeaponStats(
    preShiftedWeapon: WeaponPF2e, 
    postShiftedWeapon: WeaponPF2e, 
    originalBaseWeapon: string
): Promise<boolean> {
    const targetBaseWeapon = getWeaponBaseId(postShiftedWeapon);
    const isChangingToOriginalForm = originalBaseWeapon === targetBaseWeapon;

    // Retrieve the original name (fallback to current name if somehow missing)
    const originalName = getOriginalWeaponName(preShiftedWeapon) 
        ?? extractOriginalNameFromShiftedSuffix(preShiftedWeapon.name);

    const originalImg = getOriginalWeaponImg(preShiftedWeapon);

    const newName = isChangingToOriginalForm 
        ? originalName
        : `${postShiftedWeapon.name} (shifted ${originalName})`;

    const newImg = isChangingToOriginalForm 
        ? (originalImg ?? postShiftedWeapon.img)
        : postShiftedWeapon.img;

    const { damage, baseItem, category, group, traits, bulk, usage } = postShiftedWeapon.system;

    const updateData: Record<string, unknown> = {
        "system.damage": damage,
        "system.baseItem": baseItem,
        "system.category": category,
        "system.group": group,
        "system.traits.value": traits?.value ?? [],
        "system.bulk": bulk,
        "system.usage": usage,
        "name": newName,
        "img": newImg
    };

    // Independently apply setup flags if they are missing
    if (!preShiftedWeapon.getFlag(MODULE_ID, SHIFTING_FLAGS.BASE_WEAPON)) {
        updateData[`flags.${MODULE_ID}.${SHIFTING_FLAGS.BASE_WEAPON}`] = originalBaseWeapon;
    }
    if (!preShiftedWeapon.getFlag(MODULE_ID, SHIFTING_FLAGS.BASE_HANDS)) {
        updateData[`flags.${MODULE_ID}.${SHIFTING_FLAGS.BASE_HANDS}`] = 
            getWeaponHands(preShiftedWeapon);
    }

    // If we're shifting FROM the original form, save its current name and image in the 
    // same update payload
    if (originalBaseWeapon === getWeaponBaseId(preShiftedWeapon)) {
        updateData[`flags.${MODULE_ID}.${SHIFTING_FLAGS.ORIGINAL_NAME}`] = preShiftedWeapon.name;
        updateData[`flags.${MODULE_ID}.${SHIFTING_FLAGS.ORIGINAL_IMG}`] = preShiftedWeapon.img;
    }

    await preShiftedWeapon.update(updateData);

    return isChangingToOriginalForm;
}

/**
 * Extracts a reliable base identifier for a weapon, falling back to slug or id.
 */
function getWeaponBaseId(weapon: WeaponPF2e): string {
    return weapon.system.baseItem ?? weapon.slug ?? weapon.id;
}

/**
 * Safely determines the number of hands required for a weapon.
 */
function getWeaponHands(weapon: WeaponPF2e): number {
    return weapon.system.usage?.value === "held-in-two-hands" ? 2 : 1;
}

/**
 * Returns the original name of a shifted weapon.
 * Extracts from " (shifted ...)" at the end of the string.
 */
function extractOriginalNameFromShiftedSuffix(name: string): string {
    return name.match(SHIFTED_NAME_REGEX)?.[1] ?? name;
}

/**
 * Checks if a weapon has the Shifting property rune.
 */
function hasShiftingRune(item: WeaponPF2e): boolean {
    return item.system.runes?.property?.includes("shifting") ?? false;
}

/**
 * Extracts the weapon from the pf2e-activations message content.
 */
function extractWeaponFromContent(content: string): WeaponPF2e | null {
    const match = content.match(UUID_REGEX);
    if (!match) return null;

    const document = fromUuidSync(match[1]);
    if (!(document instanceof Item)) return null;

    const item = document as ItemPF2e;
    return item.isOfType("weapon") ? item : null;
}