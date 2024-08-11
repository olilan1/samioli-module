import {onDamageTaken} from "./soundbynameortrait.js"

Hooks.on("updateActor", (arg0, arg1, arg2, arg3) => {
    if ("damageTaken" in arg2 && arg2.damageTaken > 0) {
        onDamageTaken(arg0);
    }
});
