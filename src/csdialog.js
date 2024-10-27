import { getSetting, SETTINGS } from "./settings.js";
import { getHashCode, logd } from "./utils.js";
import { findSoundSet, getAllNames, playRandomMatchingSound } from "./creaturesounds.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api

class MyApplication extends HandlebarsApplicationMixin(ApplicationV2) {
    constructor(actor, options) {
        super(options);
        this.actor = actor;
    }

    static PARTS = {
        foo: {
            template: "modules/samioli-module/templates/cs-ui-char.html"
        }
    }

    static DEFAULT_OPTIONS = {
        id: "creature-sounds-app",
        tag: "form",
        position: {
            width: 400,
            height: 500
        },
        window: {
            title: "Creature Sounds"
        },
        actions: {
            play_attack_sound: MyApplication.playAttackSound,
            play_hurt_sound: MyApplication.playHurtSound,
            play_death_sound: MyApplication.playDeathSound,
            default_sound: MyApplication.setToDefault
        }
    }

    async _prepareContext() {
        const context = {};
        context.soundSet = findSoundSet(this.actor).name;
        context.dropDownNames = generateDropDownNames(this.actor);
        return context;
    }

    async _onChangeForm(formConfig, event) {
        await this.actor.setFlag("samioli-module", "soundset", event.target.value);
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

    static async setToDefault() {
        await this.actor.unsetFlag("samioli-module", "soundset");
        this.render();
    }
}

export function renderCreatureSoundsUI(actorSheet) {
    const actor = actorSheet.object;
    new MyApplication(actor, {}).render(true);
}

function generateDropDownNames(actor) {
    const currentSoundSet = findSoundSet(actor).name
    const namesArray = getAllNames();
    namesArray.sort();
    let optionsHtml = "";
    for (const name of namesArray) {
        const selectedText = (name === currentSoundSet) ? " selected" : "";
        optionsHtml += `<option value="${name}"${selectedText}>${name}</option>`;
    }
    return optionsHtml;
}