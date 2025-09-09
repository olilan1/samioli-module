import { ActorPF2e, ChatMessagePF2e } from "foundry-pf2e";
import { logd } from "../utils.ts";

export function checkForBravado(chatMessage: ChatMessagePF2e) {
  
//don't run if tumble through or enjoy the show - those hooks will call this function after the animation
if (chatMessage.flags?.pf2e?.context?.options?.includes("item:trait:bravado")
  && !chatMessage.flags?.pf2e?.context?.options?.includes("action:tumble-through")
  && !chatMessage.flags?.pf2e?.context?.options?.includes("item:slug:enjoy-the-show")) {
    checkIfProvidesPanache(chatMessage);
  }
}
  
export async function checkIfProvidesPanache(chatMessage: ChatMessagePF2e) {
  const outcome = chatMessage.flags?.pf2e?.context?.outcome;
  if (chatMessage.flags?.pf2e?.context?.options?.includes("item:trait:bravado") 
    && (outcome === "criticalSuccess" || outcome === "success" || outcome === "failure")) {
    const actorId = chatMessage.speaker.actor;
    if (!actorId) {
      logd("Actor ID not found in chat message.");
      return;
    }
    const actor = game.actors.get(actorId);
    if (!actor) {
      logd("Cannot find actor with ID: " + actorId + ".");
      return;
    }
  await applyPanache(actor, outcome);
  }
}

async function applyPanache(actor: ActorPF2e, outcome: "success" | "failure" | "criticalSuccess") {
  const existingPanacheStatus = await hasPanache(actor);

  if (existingPanacheStatus === "success") {
    return;
  } else if (existingPanacheStatus === "failure") {
    if (outcome === "success" || outcome === "criticalSuccess") {
      editPanacheEffect(actor, outcome);
    }
  } else {
    const panacheItemId = "uBJsxCzNhje8m8jj";
    const compendiumPack = game?.packs?.get("pf2e.feat-effects");
    if (!compendiumPack) {
      logd("Compendium not found in Game.");
      return;
    }
    const panacheEffect = await compendiumPack.getDocument(panacheItemId);
    if (!panacheEffect){
      logd("Panache effect not found in Compendium pack.");
      return;
    }
    await actor.createEmbeddedDocuments("Item", [panacheEffect.toObject()]);

    if (outcome === "failure") {
      await editPanacheEffect(actor, outcome);
    }
  }
}

async function hasPanache(actor: ActorPF2e) {
  const items = await actor.items.contents;
  const panacheEffect = items.find(item =>
    item.type === "effect" && item.system.slug === "effect-panache"
  );

  return panacheEffect 
    ? (panacheEffect.name === "Effect: Panache" ? "success" : "failure")
    : false;
}

async function editPanacheEffect(actor: ActorPF2e, outcome: "success" | "failure" | "criticalSuccess") {
  try {
    const panacheEffect = actor.items.find(item =>
      item.type === "effect" && item.system.slug === "effect-panache"
    );

    if (!panacheEffect) {
      throw new Error("Panache effect not found.");
    }

    const updatedSuccessEffectData = {
      name: "Effect: Panache",
      "system.duration.unit": "unlimited"
    };

    const updatedFailureEffectData = {
      name: "Effect: Panache (1 round)",
      "system.duration.value": 1,
      "system.duration.unit": "rounds",
      "system.duration.expiry": "turnEnd"
    };

    if (outcome === "success" || outcome === "criticalSuccess") {
      await actor.updateEmbeddedDocuments("Item", [{ _id: panacheEffect.id, ...updatedSuccessEffectData }]);
    } else {
      await actor.updateEmbeddedDocuments("Item", [{ _id: panacheEffect.id, ...updatedFailureEffectData }]);
    }

  } catch (error) {
    ui.notifications.error(`Error updating Panache effect: ${(error as Error).message}`);
    console.error(error);
  }
}

export async function checkForFinisherAttack(chatMessage: ChatMessagePF2e) {
  const context = chatMessage.flags?.pf2e?.context;
  if (context === undefined || !context.options?.includes("finisher")) {
    return;
  }
  if (context?.outcome === "failure" || context?.outcome === "criticalFailure") {
    //add logic for button to remove panache
    clearPanache(chatMessage);
  } else {
    removeDemoralizeImmunity(chatMessage);
  }
}

export async function checkForFinisherDamage(chatMessage: ChatMessagePF2e) {
  if (!chatMessage.flags?.pf2e?.context?.options?.includes("finisher")) {
    return;
  }
  clearPanache(chatMessage);
}

function clearPanache(chatMessage: ChatMessagePF2e) {
  const actorId = chatMessage.speaker.actor;
  if (!actorId) {
    return;
  }
  const actor = game.actors.get(actorId);
  if (!actor) {
    return;
  }
  const panacheItems = returnPanacheItems(actor);
  if (panacheItems.length > 0) {
    for (const panacheItem of panacheItems) {
      panacheItem.delete();
    }
  }
}

function returnPanacheItems(actor: ActorPF2e) {
  const items = actor.items.contents;
  return items.filter(item => item.type === "effect" && item.system.slug === "effect-panache");
}

export async function checkForExtravagantParryOrElegantBuckler(chatMessage: ChatMessagePF2e) {
  const { flags } = chatMessage;

  if (!flags?.pf2e?.context || flags.pf2e.context.type !== "attack-roll" || !flags.pf2e.context.target?.actor) {
    return;
  }

  const targetActorId = flags.pf2e.context.target.actor.split('.').pop();
  if (!targetActorId) {
    return;
  }
  const target = game.actors.get(targetActorId);

  if (!target) {
    return;
  }

  const hasDuelingParry = flags.pf2e.context.options.includes("target:effect:dueling-parry");
  const hasShieldRaised = flags.pf2e.context.options.includes("target:effect:raise-a-shield");
  const isFailure = flags.pf2e.context.outcome === "failure";
  const isCriticalFailure = flags.pf2e.context.outcome === "criticalFailure";

  const hasElegantBuckler = await hasElegantBucklerFeat(target); 

  if (
    (hasDuelingParry && (isFailure || isCriticalFailure)) ||
    (hasElegantBuckler && hasShieldRaised && isCriticalFailure)
  ) {
    applyPanache(target, "failure");
  }
}

async function hasElegantBucklerFeat(actor: ActorPF2e) {
  const items = await actor.items.contents;
  return items.some(item => 
    item.type === "feat" &&
    // @ts-expect-error - category does exist on item type "feat" 
    item.system.category === "class" && 
    item.system.slug === "elegant-buckler"
  );
}

async function removeDemoralizeImmunity(chatMessage: ChatMessagePF2e) {
  const { context } = chatMessage.flags.pf2e ?? {};
    const attackerActorId = chatMessage.speaker.actor;
    const attacker = game.actors.get(attackerActorId as string);
    const target = chatMessage.target?.actor;
    const contextOptions = new Set(context?.options ?? []);

    if (
        !attacker ||
        !target ||
        !contextOptions.has("feature:braggart") ||
        !contextOptions.has("feature:exemplary-finisher") ||
        !contextOptions.has("target:effect:demoralize-immunity")
    ) {
        return;
    }

    const immunityEffect = target.itemTypes.effect.find(
        (effect) =>
            effect.slug === "demoralize-immunity" &&
            effect.flags?.demoralize?.source === attacker.id
    );

    await immunityEffect?.delete();
}