import { removeAndApplyHuntPreyAsGM } from "./actions/huntprey.ts";
import { startDazzlingDisplayAsGM } from "./actions/dazzlingdisplay.ts";
import { demanifestEidolonAsGM, manifestEidolonAsGM } from "./actions/manifesteidolon.ts";
import { deleteGhostlyCarrierTokenAsGM, summonGhostlyCarrierAsGM } from "./spells/ghostlycarrier.ts";
import { createSnareAsGM, removeSnareAsGM } from "./actions/snare.ts";
import { applyTargetEffectAsGM, applyGuardEffectAsGM, cleanupDancingBladeAsGM } from "./spells/dancingblade.ts";
import { MODULE_ID } from "./utils.ts";
import { replaceTargets } from "./templatetarget.ts";
import { deleteSummonAsGM } from "./sustain.ts";
import { applyCourageousAnthemEffectAsGM } from "./spells/courageousanthem.ts";

let socket: SocketlibSocket | undefined;

export const REPLACE_TARGETS = "replaceTargets";
export const MANIFEST_EIDOLON = "manifestEidolon";
export const DEMANIFEST_EIDOLON = "demanifestEidolon";
export const REMOVE_AND_APPLY_HUNT_PREY = "removeAndApplyHuntPrey";
export const DAZZLING_DISPLAY = "dazzlingDisplay";
export const GHOSTLY_CARRIER_SUMMON = "summonGhostlyCarrier";
export const GHOSTLY_CARRIER_DELETE = "deleteGhostlyCarrier";
export const CREATE_SNARE = "createSnare";
export const REMOVE_SNARE = "removeSnare";
export const DANCING_BLADE_APPLY_TARGET = "applyTargetEffect";
export const DANCING_BLADE_APPLY_GUARD = "applyGuardEffect";
export const DANCING_BLADE_CLEANUP = "cleanupDancingBlade";
export const DELETE_SUMMON = "deleteSummon";
export const COURAGEOUS_ANTHEM_APPLY = "applyCourageousAnthem";

export const getSocket = () => {
    if (!socket) throw new Error("Socket not registered");
    return socket;
}

export function registerSocket() {
    socket = socketlib.registerModule(MODULE_ID)!;
    // Register the name of the function that you want to run as the GM
    // Requires a full restart of Foundry before this will work
    socket.register(REPLACE_TARGETS, replaceTargets);
    socket.register(MANIFEST_EIDOLON, manifestEidolonAsGM);
    socket.register(DEMANIFEST_EIDOLON, demanifestEidolonAsGM);
    socket.register(REMOVE_AND_APPLY_HUNT_PREY, removeAndApplyHuntPreyAsGM);
    socket.register(DAZZLING_DISPLAY, startDazzlingDisplayAsGM);
    socket.register(GHOSTLY_CARRIER_SUMMON, summonGhostlyCarrierAsGM);
    socket.register(GHOSTLY_CARRIER_DELETE, deleteGhostlyCarrierTokenAsGM);
    socket.register(CREATE_SNARE, createSnareAsGM);
    socket.register(REMOVE_SNARE, removeSnareAsGM);
    socket.register(DANCING_BLADE_APPLY_TARGET, applyTargetEffectAsGM);
    socket.register(DANCING_BLADE_APPLY_GUARD, applyGuardEffectAsGM);
    socket.register(DANCING_BLADE_CLEANUP, cleanupDancingBladeAsGM);
    socket.register(DELETE_SUMMON, deleteSummonAsGM);
    socket.register(COURAGEOUS_ANTHEM_APPLY, applyCourageousAnthemEffectAsGM);
}