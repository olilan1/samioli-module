import { getSetting, SETTINGS } from "./settings.js";
import { getHashCode, logd } from "./utils.js";
import { playRandomMatchingSound } from "./creaturesounds.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api

class MyApplication extends HandlebarsApplicationMixin(ApplicationV2) {
    constructor(actor, options) {
        super(options);
        this.myActor = actor;
    }

    static PARTS = {
        foo: {
            template: "modules/samioli-module/templates/cs-ui-char.html"
        }
    }

    static DEFAULT_OPTIONS = {
        id: "creature-sounds-app",
        position: {
            width: 400,
            height: 200
        },
        window: {
            title: "Creature Sounds"
        },
        actions: {
            play_attack_sound: MyApplication.playAttackSound,
            play_hurt_sound: MyApplication.playHurtSound,
            play_death_sound: MyApplication.playDeathSound
        }
    }

    static playAttackSound() {
        playRandomMatchingSound(this.myActor, "attack");
    }

    static playHurtSound() {
        playRandomMatchingSound(this.myActor, "hurt");
    }

    static playDeathSound() {
        playRandomMatchingSound(this.myActor, "death");
    }
}

export function renderCreatureSoundsUI(characterSheetPF2e) {
  const actor = game.actors.get(characterSheetPF2e.options.token.actorId);
  new MyApplication(actor, {}).render(true);
}