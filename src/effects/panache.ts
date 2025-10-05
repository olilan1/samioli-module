import { ActorPF2e, ChatMessagePF2e } from "foundry-pf2e";
import { createChatMessageWithButton } from "../chatbuttonhelper.ts";

export function checkForBravado(chatMessage: ChatMessagePF2e) {
  // don't run if tumble through or enjoy the show
  // those hooks will call this function after the animation
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
    const actor = chatMessage.actor;
    if (!actor) {
      return;
    }
  await applyPanache(actor, outcome);
  }
}

let isApplyingPanache = false;

async function applyPanache(actor: ActorPF2e, outcome: "success" | "failure" | "criticalSuccess") {
  
  if (isApplyingPanache) {
    return;
  }

  isApplyingPanache = true;
  try {
    const existingPanacheStatus = hasPanache(actor);

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
  } finally {
    isApplyingPanache = false;
  }
}

function hasPanache(actor: ActorPF2e) {
  const items = actor.items.contents;
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
      "system.duration.expiry": "turn-end"
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
  if (!context?.options?.includes("finisher")) {
    return;
  }
  const actor = chatMessage.actor;
  if (!actor) {
    return;
  }
  
  if (context?.outcome === "failure" || context?.outcome === "criticalFailure") {
    await createRemovePanacheChatMessage(actor);
  } else {
    removeDemoralizeImmunity(chatMessage);
  }
}

export async function checkForFinisherDamage(chatMessage: ChatMessagePF2e) {
  if (!chatMessage.flags?.pf2e?.context?.options?.includes("finisher")) {
    return;
  }

  const actor = chatMessage.actor;
  if (!actor) {
    return;
  }

  clearPanache(actor);
}

async function createRemovePanacheChatMessage(actor: ActorPF2e) {
    const content = `
        <p>Do you want to remove <strong>Panache</strong>?</p>
    `;

    await createChatMessageWithButton({
        slug: "remove-panache",
        actor: actor,
        content: content,
        button_label: "Remove Panache"
    });
}

export function onClearPanacheButtonClick(chatMessagePF2e: ChatMessagePF2e) {
  const actor = chatMessagePF2e.actor;
  if (!actor) return;
  clearPanache(actor);
}

function clearPanache(actor: ActorPF2e) {
  const panacheItems = getPanacheItems(actor);
  if (panacheItems.length > 0) {
    for (const panacheItem of panacheItems) {
      panacheItem.delete();
    }
  }
}

function getPanacheItems(actor: ActorPF2e) {
  const items = actor.items.contents;
  return items.filter(item => item.type === "effect" && item.system.slug === "effect-panache");
}

export async function checkForExtravagantParryOrElegantBuckler(chatMessage: ChatMessagePF2e) {
  const context = chatMessage.flags.pf2e.context;

  if (!context || context.type !== "attack-roll" || !context.target?.actor) {
    return;
  }

  const targetActorId = context.target.actor.split('.').pop();
  if (!targetActorId) {
    return;
  }
  const target = chatMessage.target?.actor;

  if (!target) {
    return;
  }

  const hasDuelingParry = context.options.includes("target:effect:dueling-parry");
  const hasShieldRaised = context.options.includes("target:effect:raise-a-shield");
  const isFailure = context.outcome === "failure";
  const isCriticalFailure = context.outcome === "criticalFailure";

  const hasElegantBuckler = hasElegantBucklerFeat(target); 

  if (
    (hasDuelingParry && (isFailure || isCriticalFailure)) ||
    (hasElegantBuckler && hasShieldRaised && isCriticalFailure)
  ) {
    applyPanache(target, "failure");
  }
}

function hasElegantBucklerFeat(actor: ActorPF2e) {
  const items = actor.items.contents;
  return items.some(item => 
    item.type === "feat" &&
    // @ts-expect-error - category does exist on item type "feat" 
    item.system.category === "class" && 
    item.system.slug === "elegant-buckler"
  );
}

async function removeDemoralizeImmunity(chatMessage: ChatMessagePF2e) {

  const context = chatMessage.flags.pf2e.context;
  const attacker = chatMessage.actor;
  const target = chatMessage.target?.actor;

  if (
      !attacker ||
      !target ||
      !context?.options?.includes("feature:braggart") ||
      !context?.options?.includes("feature:exemplary-finisher") ||
      !context?.options?.includes("target:effect:demoralize-immunity")
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