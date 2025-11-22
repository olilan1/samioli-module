import { TokenDocumentPF2e, TokenPF2e } from "foundry-pf2e";

export async function summonGhostlyCarrier(token: TokenPF2e) {
    console.log("Summoning a ghostly carrier reload");

    await spawnGhostlyCarrier(token);
}

async function spawnGhostlyCarrier(casterToken: TokenPF2e): Promise<TokenDocument | undefined> {

    const casterActor = casterToken.actor!;

    if (!canvas.scene) {
        ui.notifications.warn("No active scene to summon the Carrier.");
        return;
    }

    const actorName = "Ghostly Carrier";
    // Note: "world.actors" implies a Compendium created manually in this specific World
    const packName = "world.actors"; 

    const pack = game.packs.get(packName);
    if (!pack) {
        ui.notifications.error(`Compendium '${packName}' not found.`);
        return;
    }

    await pack.getIndex();
    const entry = pack.index.find((i) => i.name === actorName);

    if (!entry) {
        ui.notifications.error(`Actor '${actorName}' not found in compendium '${packName}'.`);
        return;
    }

    // TODO - if controls are not expanded...
    const currentTab = ui.sidebar.tabGroups.primary;

    // This imports the actor from the compendium into the world
    const ghostlySummonActor = await game.actors.importFromCompendium(pack, entry._id);

    if (!ghostlySummonActor) {
        ui.notifications.error("Failed to import Actor from compendium.");
        return;
    }

    ui.sidebar.changeTab(currentTab, "primary")

    const updateData = {
        // Update Attributes and Saves based on the Source Actor's current derived values
        "system.attributes.ac.value": casterActor.attributes?.ac?.value ?? 10,
        "system.saves.fortitude.value": casterActor.saves?.fortitude?.mod ?? 0,
        "system.saves.reflex.value": casterActor.saves?.reflex?.mod ?? 0,
        "system.saves.will.value": casterActor.saves?.will?.mod ?? 0,

        // Copy the ownership structure from the source actor.
        // This ensures whoever owns the summoner also owns the summon.
        ownership: casterActor.ownership
    };

    await ghostlySummonActor.update(updateData);

    const x = casterToken.x;
    const y = casterToken.y;
    const sort = casterToken.document.sort

    const tokenDocument = await ghostlySummonActor.getTokenDocument({ x, y }) as TokenDocumentPF2e;

    const tokenData = tokenDocument.toObject();
    tokenData.sort = sort + 1;

    const [createdToken] = await canvas.scene.createEmbeddedDocuments("Token", [tokenData]);

    return createdToken;
}