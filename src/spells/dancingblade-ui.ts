import type { ChatMessagePF2e, EffectPF2e, TokenPF2e, WeaponPF2e } from "foundry-pf2e";
import { getCollidableCallbacks, getTokensAtLocation, MODULE_ID } from "../utils.ts";
import type { Point } from "foundry-pf2e/foundry/common/_types.mjs";
import { getTokenFromUuid, rollDancingBladeDamage } from "./dancingblade.ts";

const { DialogV2 } = foundry.applications.api;

const STRIKE_ANIM = "jb2a.impact.003.blue";
const PUSH_ANIM = "jb2a.impact.010.orange";
const CAST_SOUND =
    "modules/samioli-module/sounds/GDM/Gamemaster Audio - Pro Sound Collection/spell_harness_magic_01.m4a";
const TRANSIT_SOUND =
    "modules/samioli-module/sounds/GDM/Medieval Fantasy SFX Pack/Spell - Air 2.m4a";
const STRIKE_SOUND = "modules/samioli-module/sounds/GDM/Medieval Fantasy SFX Pack/Axe 3.m4a";
const PUSH_SOUND = "modules/samioli-module/sounds/GDM/Medieval Fantasy SFX Pack/Hammer 2.m4a";
const GUARD_SOUND =
    "modules/samioli-module/sounds/GDM/Gamemaster Audio - Pro Sound Collection/unsheathe_sword_with_ringout.m4a";

// --- Animation Helpers ---

const ANIMATION_SPECIFIC_WEAPONS: Record<string, string> = {
    scythe: "jb2a.spiritual_weapon.scythe.spectral.blue",
    maul: "jb2a.spiritual_weapon.maul.spectral.blue",
    mace: "jb2a.spiritual_weapon.mace.spectral.blue",
    katana: "jb2a.spiritual_weapon.katana.01.astral.01.blue",
    rapier: "jb2a.spiritual_weapon.rapier.01.astral.01.blue",
    scimitar: "jb2a.spiritual_weapon.scimitar.01.astral.01.blue",
    trident: "jb2a.spiritual_weapon.trident.01.astral.01.blue",
    glaive: "jb2a.spiritual_weapon.glaive.01.astral.01.blue",
    falchion: "jb2a.spiritual_weapon.falchion.01.astral.01.blue",
    staff: "jb2a.spiritual_weapon.quarterstaff.01.astral.01.blue",
    javelin: "jb2a.spiritual_weapon.javelin.01.astral.01.blue",
};

const ANIMATION_GROUPS: Record<string, string | ((isTwoHanded: boolean) => string)> = {
    pick: "jb2a.spiritual_weapon.scythe.spectral.blue",
    axe: (isTwoHanded) =>
        isTwoHanded
            ? "jb2a.spiritual_weapon.greataxe.01.astral.01.blue"
            : "jb2a.spiritual_weapon.handaxe.01.astral.01.blue",
    club: (isTwoHanded) =>
        isTwoHanded
            ? "jb2a.spiritual_weapon.greatclub.01.astral.01.blue"
            : "jb2a.spiritual_weapon.club.01.astral.01.blue",
    hammer: (isTwoHanded) =>
        isTwoHanded
            ? "jb2a.spiritual_weapon.hammer.01.astral.01.blue"
            : "jb2a.spiritual_weapon.warhammer.01.astral.01.blue",
    sword: (isTwoHanded) =>
        isTwoHanded
            ? "jb2a.spiritual_weapon.greatsword.01.astral.01.blue"
            : "jb2a.spiritual_weapon.sword.spectral.blue",
    knife: "jb2a.spiritual_weapon.dagger.02.astral.01.blue",
    polearm: "jb2a.spiritual_weapon.halberd.01.astral.01.blue",
    spear: "jb2a.spiritual_weapon.spear.01.astral.01.blue",
    flail: "jb2a.spiritual_weapon.mace.spectral.blue",
};

/**
 * Returns the most appropriate spiritual weapon animation for the given weapon.
 * Supports 1H/2H variants and specific weapons like Javelins or Picks.
 */
export function getPersistentAnimation(weapon: WeaponPF2e): string {
    const slug = weapon.slug ?? weapon.name.slugify();
    const group = weapon.group;
    const isTwoHanded = weapon.system.usage.value === "held-in-two-hands";

    const specificWeaponKey = Object.keys(ANIMATION_SPECIFIC_WEAPONS).find((k) => slug.includes(k));
    if (specificWeaponKey) return ANIMATION_SPECIFIC_WEAPONS[specificWeaponKey]!;

    if (group && group in ANIMATION_GROUPS) {
        const groupAnim = ANIMATION_GROUPS[group]!;
        return typeof groupAnim === "function" ? groupAnim(isTwoHanded) : groupAnim;
    }

    return "jb2a.spiritual_weapon.sword.spectral.blue";
}

/**
 * Shared logic for playing the Dancing Blade animation sequence.
 */
export function playBladeAnimationSequence(config: {
    animFile: string;
    effectName: string;
    target: TokenPF2e;
    previousLocationToken?: TokenPF2e;
    tieToEffect?: EffectPF2e;
}) {
    const { animFile, effectName, target, previousLocationToken, tieToEffect } = config;
    const seq = new Sequence();
    const gridOffset = { x: 0.6, y: -0.6 };
    const attachOffset = { offset: { x: 0.6, y: -0.6 }, gridUnits: true };

    // Cleanup existing effects with the same name
    Sequencer.EffectManager.endEffects({ name: effectName });

    // Handle transit if there's a different previous location
    const isTransiting = previousLocationToken && previousLocationToken.id !== target.id;
    if (isTransiting) {
        // prettier-ignore
        seq.sound()
            .file(TRANSIT_SOUND)
            .effect()
            .file(animFile)
            .atLocation({
                x: previousLocationToken.center.x + gridOffset.x * canvas.grid.size,
                y: previousLocationToken.center.y + gridOffset.y * canvas.grid.size,
            })
            .moveTowards(
                {
                    x: target.center.x + gridOffset.x * canvas.grid.size,
                    y: target.center.y + gridOffset.y * canvas.grid.size,
                },
                // @ts-expect-error Sequencer typings incorrectly require a target here
                { ease: "easeInOutQuint" },
            )
            .moveSpeed(600)
            .scale(0.5)
            .fadeOut(100)
            .waitUntilFinished(-100);
    }

    // Persistent floating blade
    // prettier-ignore
    const persistEffect = seq
        .effect()
        .file(animFile)
        .attachTo(target, attachOffset)
        .name(effectName)
        .persist()
        .scale(0.5)
        .fadeOut(500);

    if (tieToEffect) {
        persistEffect.tieToDocuments(tieToEffect);
    }

    if (isTransiting) {
        persistEffect.fadeIn(100);
    } else {
        // Initial cast
        persistEffect.fadeIn(500);
        seq.sound().file(CAST_SOUND);
    }

    seq.play();
}

/**
 * Starts the persistent floating weapon animation tied to the target's tracking effect.
 * Delegates to {@link playBladeAnimationSequence} with transit from the previous location.
 */
export function startDancingBladePersistentAnimation(
    target: TokenPF2e,
    effect: EffectPF2e,
    weapon: WeaponPF2e,
    previousLocationToken: TokenPF2e,
    weaponId: string,
) {
    const effectName = `dancing-blade-${weaponId}`;
    const animFile = getPersistentAnimation(weapon);

    playBladeAnimationSequence({
        animFile,
        effectName,
        target,
        previousLocationToken,
        tieToEffect: effect,
    });
}

/**
 * Plays a quick impact animation on the target for a strike or push action.
 */
export function playDancingBladeAttackAnimation(target: TokenPF2e, type: "strike" | "push") {
    // prettier-ignore
    new Sequence()
        .effect()
        .file(type === "strike" ? STRIKE_ANIM : PUSH_ANIM)
        .atLocation(target)
        .spriteOffset({ x: 0.3, y: -0.3 }, { gridUnits: true })
        .scale(0.5)
        .playbackRate(0.6)
        .sound()
        .file(type === "strike" ? STRIKE_SOUND : PUSH_SOUND)
        .play();
}

/**
 * Plays a shield flash and sound effect on the target when the Guard action is chosen.
 */
export function playDancingBladeGuardAnimation(target: TokenPF2e) {
    // prettier-ignore
    new Sequence()
        .effect()
        .file("jb2a.icon.shield.blue")
        .atLocation(target)
        .scale(0.5)
        .scaleIn(0, 500, { ease: "easeOutBack" })
        .scaleOut(0, 500, { ease: "easeInBack" })
        .fadeIn(250)
        .fadeOut(250)
        .duration(1500)
        .sound()
        .file(GUARD_SOUND)
        .play();
}

// --- UI Helpers ---

/**
 * Presents a dialog for the user to select which weapon to animate.
 * @returns The selected weapon's item ID, or undefined if cancelled.
 */
export async function promptForWeapon(weapons: WeaponPF2e[]): Promise<string | undefined> {
    return (await DialogV2.wait({
        window: { title: "Select Dancing Weapon" },
        position: { width: 350 },
        content: `
            <form>
                <div class="form-group">
                    <label style="flex-grow: 0">Weapon:</label>
                    <select name="weaponSelect">
                        ${weapons.map((w) => `<option value="${w.id}">${w.name}</option>`).join("")}
                    </select>
                </div>
            </form>
        `,
        buttons: [
            {
                action: "select",
                label: "Dance!",
                icon: "fa-solid fa-sparkles",
                default: true,
                callback: (_e, _b, dialog) =>
                    (
                        dialog as InstanceType<typeof DialogV2>
                    ).element.querySelector<HTMLSelectElement>("select")?.value,
            },
        ],
        rejectClose: false,
    })) as string | undefined;
}

/**
 * Opens a crosshair overlay for the user to click a target token.
 * Re-prompts if the click lands on empty space or multiple tokens.
 * @returns The selected target token, or undefined if the user cancels.
 */
export async function promptForTarget(
    token: TokenPF2e,
    range: number,
): Promise<TokenPF2e | undefined> {
    let target: TokenPF2e | undefined;
    while (!target) {
        const selectedLocation = (await startCrosshairsTargetSelection(token, range)) as Point;
        if (!selectedLocation) return undefined;

        const targetTokens = getTokensAtLocation(selectedLocation);
        if (targetTokens.length === 1) {
            target = targetTokens[0];
        } else if (targetTokens.length > 1) {
            ui.notifications.warn("Multiple tokens found. Please click a specific target.");
        } else {
            ui.notifications.warn("No target found here. Please click an enemy.");
        }
    }
    return target;
}

/**
 * Presents the action menu dialog (Strike, Guard, Push, Change Partner)
 * with MAP penalty and damage type selectors.
 * @returns The user's choices, or undefined if the dialog is closed.
 */
export async function promptForBladeAction(
    weaponName: string,
    isAmped: boolean,
    isInitialCast: boolean,
    damageTypes: string[],
): Promise<{ choice: string; attackNumber: number; damageType?: string } | undefined> {
    const buttons: {
        action: string;
        label: string;
        icon: string;
        callback?: (
            event: Event,
            button: HTMLButtonElement,
            dialog: InstanceType<typeof DialogV2>,
        ) => { choice: string; attackNumber: number; damageType?: string };
    }[] = [{ action: "strike", label: "Strike", icon: "fa-solid fa-swords" }];

    if (isAmped) {
        buttons.push(
            { action: "guard", label: "Guard", icon: "fa-solid fa-shield-halved" },
            { action: "push", label: "Push", icon: "fa-solid fa-hand-sparkles" },
        );
    }

    if (!isInitialCast) {
        buttons.push({
            action: "partner",
            label: "Change Partner",
            icon: "fa-solid fa-people-arrows",
        });
    }

    // Add callback to each button to extract MAP penalty and damage type
    buttons.forEach((b) => {
        b.callback = (_e: Event, _b: HTMLButtonElement, dialog: InstanceType<typeof DialogV2>) => {
            const mapValue = dialog.element.querySelector<HTMLInputElement>(
                'input[name="attackNumber"]:checked',
            )?.value;
            const dtValue = dialog.element.querySelector<HTMLSelectElement>(
                'select[name="damageTypeSelect"]',
            )?.value;
            return {
                choice: b.action,
                attackNumber: parseInt(mapValue ?? "1", 10) || 1,
                damageType: dtValue,
            };
        };
    });

    const title = isInitialCast ? "Dancing Blade Action" : "Sustain Dancing Blade";

    let damageTypeHtml = "";
    if (damageTypes.length > 1) {
        const optionsHtml = damageTypes
            .map((t) => {
                const pf2eConfig = CONFIG.PF2E;
                const label = game.i18n.localize(
                    pf2eConfig.damageTypes[t as keyof typeof pf2eConfig.damageTypes] ?? t,
                );
                return `<option value="${t}">${label}</option>`;
            })
            .join("");

        damageTypeHtml = `
            <div class="form-group" style="width: 75%; margin: 0 auto;">
                <label style="flex-grow: 0;">Damage&nbsp;Type:</label>
                <select name="damageTypeSelect" style="width: 100%;">
                    ${optionsHtml}
                </select>
            </div>
        `;
    }

    const content = `
        <p>What do you want to do with your dancing <b>${weaponName}</b>?</p>
        ${damageTypeHtml}
        <div class="map-radio-group" style="display: flex; gap: 10px; justify-content: center;">
            <input type="radio" id="map-1" name="attackNumber" value="1" checked>
            <label for="map-1">No MAP</label>
            
            <input type="radio" id="map-2" name="attackNumber" value="2">
            <label for="map-2">MAP -5</label>
            
            <input type="radio" id="map-3" name="attackNumber" value="3">
            <label for="map-3">MAP -10</label>
        </div>
    `;

    return (await DialogV2.wait({
        window: { title },
        content,
        buttons,
        rejectClose: false,
    })) as { choice: string; attackNumber: number; damageType?: string } | undefined;
}

/** Low-level wrapper around Sequencer's Crosshair API for Dancing Blade target selection. */
async function startCrosshairsTargetSelection(token: TokenPF2e, range: number) {
    const labelText = `Select a target for Dancing Blade (${range} ft range)`;
    const iconTexture = "icons/svg/target.svg";
    const placementRestrictions = Sequencer.Crosshair.PLACEMENT_RESTRICTIONS;

    return await Sequencer.Crosshair.show(
        {
            distance: 0,
            fillColor: "#000000ff",
            label: { text: labelText, dy: -100 },
            location: {
                obj: token,
                limitMaxRange: range,
                wallBehavior: placementRestrictions.NO_COLLIDABLES,
            },
            icon: { texture: iconTexture },
            snap: { position: CONST.GRID_SNAPPING_MODES.CENTER },
        },
        getCollidableCallbacks("Dancing Blade", iconTexture),
    );
}

/**
 * Injects Damage and Critical buttons into the attack roll card footer.
 */
export function addDancingBladeDamageButtons(message: ChatMessagePF2e, html: JQuery<HTMLElement>) {
    const context = message.flags.pf2e.context;
    if (context?.type !== "attack-roll") return;

    const isDancingBlade = context.options?.includes(`${MODULE_ID}:dancing-blade-attack`);
    if (!isDancingBlade) return;

    const damageButton = $('<button type="button" data-action="damage">Damage</button>');
    const criticalButton = $('<button type="button" data-action="critical">Critical</button>');

    damageButton.on("click", (e) => {
        e.stopPropagation();
        rollDancingBladeDamage(message, false);
    });
    criticalButton.on("click", (e) => {
        e.stopPropagation();
        rollDancingBladeDamage(message, true);
    });

    const buttonContainer = $(`
        <div class="card-buttons flexrow" style="gap: 5px; margin-top: 4px;" />
    `);
    buttonContainer.append(damageButton, criticalButton);

    const footer = html.find("footer");
    if (footer.length > 0) {
        footer.before(buttonContainer);
    } else {
        html.append(buttonContainer);
    }
}
