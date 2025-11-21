import { startDazzlingDisplayAsGM } from "./actions/dazzlingdisplay.ts";
import { demanifestEidolonAsGM, manifestEidolonAsGM } from "./actions/manifesteidolon.ts";
import { MODULE_ID } from "./utils.ts";

let socket: SocketlibSocket | undefined;

export const MANIFEST_EIDOLON = "manifestEidolon";
export const DEMANIFEST_EIDOLON = "demanifestEidolon";
export const DAZZLING_DISPLAY = "dazzlingDisplay";

export const getSocket = () => {
    if (!socket) throw new Error("Socket not registered");
    return socket;
}

export function registerSocket() {
    socket = socketlib.registerModule(MODULE_ID)!;
    // Register the name of the function that you want to run as the GM
    socket.register(MANIFEST_EIDOLON, manifestEidolonAsGM);
    socket.register(DEMANIFEST_EIDOLON, demanifestEidolonAsGM);
    socket.register(DAZZLING_DISPLAY, startDazzlingDisplayAsGM);
}