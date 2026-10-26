import { TokenPF2e } from "foundry-pf2e";

export async function startDemoralize(token: TokenPF2e): Promise<void> {
    if (!token.actor?.isOwner) {
        ui.notifications.warn(
            `You do not have permission to demoralize with ${token.name}.`
        );
        return;
    }

    token.control({ releaseOthers: true });
    await executeDemoralizeMacro();
}

export async function executeDemoralizeMacro(): Promise<boolean> {
    const demoralizeMacro = await getDemoralizeMacro();
    if (!demoralizeMacro) {
        ui.notifications.warn("Workbench Demoralize macro not found.");
        return false;
    }

    if (!demoralizeMacro.canExecute) {
        const clonedMacro = new Macro(
            foundry.utils.mergeObject(
                demoralizeMacro.toObject(),
                {
                    "-=_id": null,
                    "ownership.default": CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
                },
                { inplace: true }
            )
        );
        clonedMacro.execute();
    } else {
        demoralizeMacro.execute();
    }
    return true;
}

async function getDemoralizeMacro(): Promise<Macro | null> {
    const compendiumName =
        "xdy-pf2e-workbench.asymonous-benefactor-macros-internal";
    const macroName = "XDY DO_NOT_IMPORT Demoralize";
    const pack = game.packs.get(compendiumName);
    if (!pack) return null;
    const macros = (await pack.getDocuments({ name: macroName })) as Macro[];
    if (macros.length === 0) return null;
    return macros[0];
}
