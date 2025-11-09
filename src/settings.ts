const SETTINGS_NAMESPACE = "samioli-module";

export const SETTINGS = {
    TEMPLATE_TARGET: "template_target_enable",
    TEMPLATE_COLOUR_OVERRIDE: "template_colour_enable",
    AUTO_PANACHE: "automatic_panache_enable",
    AUTO_HUNT_PREY: "automatic_hunt_prey_enable",
    AUTO_UNSTABLE_CHECK: "automatic_unstable_check_enable",
    UNSTABLE_CHECK_HOMEBREW: "unstable_check_homebrew_enable",
    AUTO_BOOST_EIDOLON: "automatic_boost_eidolon_enable",
    AUTO_SUSTAIN_CHECK: "automatic_sustain_check_enable",
    AUTO_START_OF_TURN_SPELL_CHECK: "automatic_start_of_turn_spell_check_enable",
    AUTO_FRIGHTENED_AND_ANTAGONIZE_CHECK: "automatic_frightened_check_enable",
    DAMAGE_HELPER_BUTTON: "damage_helper_button_enable",
    DEBUG_LOGGING: "debug_logging"
} as const;

export type SettingsKey = typeof SETTINGS[keyof typeof SETTINGS];

export function registerSettings() {
    game.settings.register(SETTINGS_NAMESPACE, SETTINGS.TEMPLATE_TARGET, {
        name: "Template targetting",
        hint: "Automatically target all tokens under a placed template",
        scope: "world",
        config: true,
        default: false,
        type: Boolean
    });

    game.settings.register(SETTINGS_NAMESPACE, SETTINGS.TEMPLATE_COLOUR_OVERRIDE, {
        name: "Template Colour Override",
        hint: "Automatically set placed templates to black to look better with animations. Some templates can override this setting.",
        scope: "world",
        config: true,
        default: false,
        type: Boolean
    });

    game.settings.register(SETTINGS_NAMESPACE, SETTINGS.AUTO_PANACHE, {
        name: "Automatic Panache",
        hint: "Automatically add and remove Panache",
        scope: "world",
        config: true,
        default: false,
        type: Boolean
    });

    game.settings.register(SETTINGS_NAMESPACE, SETTINGS.AUTO_HUNT_PREY, {
        name: "Hunt Prey Automation",
        hint: "Players can apply a Hunt Prey effect to tokens they do not own",
        scope: "world",
        config: true,
        default: false,
        type: Boolean
    });

    game.settings.register(SETTINGS_NAMESPACE, SETTINGS.AUTO_UNSTABLE_CHECK, {
        name: "Unstable Check Automation",
        hint: "Automatically add Unstable Effect",
        scope: "world",
        config: true,
        default: false,
        type: Boolean
    });

    game.settings.register(SETTINGS_NAMESPACE, SETTINGS.UNSTABLE_CHECK_HOMEBREW, {
        name: "Unstable Check Homebrew",
        hint: "Overrides Unstable Check Flat Check with Homebrew version",
        scope: "world",
        config: true,
        default: false,
        type: Boolean
    });
      
    game.settings.register(SETTINGS_NAMESPACE, SETTINGS.AUTO_BOOST_EIDOLON, {
        name: "Boost Eidolon Automation",
        hint: "Automatically add Boost Eidolon Effect and ask player if they want to extend boost. NOTE: this requires the pf2e-toolbelt module to be installed and the eidolon to be linked to the summoner via the Shared Data feature.",
        scope: "world",
        config: true,
        default: false,
        type: Boolean
    });

    game.settings.register(SETTINGS_NAMESPACE, SETTINGS.AUTO_SUSTAIN_CHECK, {
        name: "Sustain Spell Automation",
        hint: "Automatically add Sustain Spell Effects and Messages to Chat",
        scope: "world",
        config: true,
        default: false,
        type: Boolean
    });

    game.settings.register(SETTINGS_NAMESPACE, SETTINGS.AUTO_START_OF_TURN_SPELL_CHECK, {
        name: "Start of Turn Spell Automation",
        hint: "Automatically add reminders for spells that trigger on start of turn",
        scope: "world",
        config: true,
        default: false,
        type: Boolean
    });

    game.settings.register(SETTINGS_NAMESPACE, SETTINGS.AUTO_FRIGHTENED_AND_ANTAGONIZE_CHECK, {
        name: "Frightened & Antagonize Automation",
        hint: "Automatically reduce Frightened at the end of actors turn. Automatically applies Antagonize effect when relevant.",
        scope: "world",
        config: true,
        default: false,
        type: Boolean
    });

    game.settings.register(SETTINGS_NAMESPACE, SETTINGS.DAMAGE_HELPER_BUTTON, {
        name: "Damage Helper Button",
        hint: "Add a button to the chat UI that allows you to create damage rolls easily. (Requires a refresh after changing this setting)",
        scope: "world",
        config: true,
        default: false,
        requiresReload: true,
        type: Boolean
    });

    game.settings.register(SETTINGS_NAMESPACE, SETTINGS.DEBUG_LOGGING, {
        name: "Debug logging",
        hint: "Log debug info to console",
        scope: "world",
        config: true,
        default: false,
        type: Boolean
    });
}

export function getSetting(setting: SettingsKey) {
    return game.settings.get(SETTINGS_NAMESPACE, setting);
}