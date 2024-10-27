import { findSoundSet, getAllNames, NO_SOUND_SET, playRandomMatchingSound } from "./creaturesounds.js";
import { logd } from "./utils.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class ActorSoundSelectApp extends HandlebarsApplicationMixin(ApplicationV2) {
    constructor(actor, options) {
        super(options);
        this.actor = actor;
    }

    static PARTS = {
        form: {
            template: "modules/samioli-module/templates/actor-sound-select.html"
        }
    }

    static DEFAULT_OPTIONS = {
        id: "creature-sounds-app",
        tag: "form",
        window: {
            title: "Creature Sounds"
        },
        actions: {
            play_attack_sound: ActorSoundSelectApp.playAttackSound,
            play_hurt_sound: ActorSoundSelectApp.playHurtSound,
            play_death_sound: ActorSoundSelectApp.playDeathSound,
            default_sound: ActorSoundSelectApp.setToDefault
        }
    }

    async _prepareContext() {
        const context = {};
        context.currentSoundSet = findSoundSet(this.actor)?.name ?? NO_SOUND_SET;
        context.dropDownNames = getAllNames();
        context.dropDownNames.unshift(NO_SOUND_SET);
        return context;
    }

    async _onChangeForm(formConfig, event) {
        logd("selected soundset = " + event.target.value);
        await this.actor.setFlag("samioli-module", "soundset", event.target.value);
        this.render();
    }

    static async setToDefault() {
        await this.actor.unsetFlag("samioli-module", "soundset");
        this.render();
    }

    static playAttackSound() {
        playRandomMatchingSound(this.actor, "attack");
    }

    static playHurtSound() {
        playRandomMatchingSound(this.actor, "hurt");
    }

    static playDeathSound() {
        playRandomMatchingSound(this.actor, "death");
    }
}