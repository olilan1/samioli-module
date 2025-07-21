const SETTINGS_NAMESPACE = "samioli-module";

export const SETTINGS = {
    TEMPLATE_TARGET: "template_target_enable",
    TEMPLATE_COLOUR_OVERRIDE: "template_colour_enable",
    AUTO_PANACHE: "automatic_panache_enable",
    AUTO_HUNT_PREY: "automatic_hunt_prey_enable",
    AUTO_UNSTABLE_CHECK: "automatic_unstable_check_enable",
    AUTO_SUSTAIN_CHECK: "automatic_sustain_check_enable",
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
        hint: "Automatically set placed templates to black to look better with animations",
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

    game.settings.register(SETTINGS_NAMESPACE, SETTINGS.AUTO_SUSTAIN_CHECK, {
        name: "Sustain Spell Automation",
        hint: "Automatically add Sustain Spell Effects and Messages to Chat",
        scope: "world",
        config: true,
        default: false,
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