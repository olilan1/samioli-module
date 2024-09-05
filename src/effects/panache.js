export function checkForBravado(chatMessage) {
    if (chatMessage.flags?.pf2e?.context?.options.includes("item:trait:bravado")) {
      checkIfProvidesPanache(chatMessage);
    }
  }
  
async function checkIfProvidesPanache(chatMessage) {
  const outcome = chatMessage.flags.pf2e.context.outcome;
  if (outcome === "criticalSuccess" || outcome === "success" || outcome === "failure") {
    await applyPanache(game.actors.get(chatMessage.speaker.actor), outcome);
  }
}

async function applyPanache(actor, outcome) {
  const existingPanacheStatus = await hasPanache(actor);

  if (existingPanacheStatus === "success") {
    return;
  } else if (existingPanacheStatus === "failure") {
    if (outcome === "success" || outcome === "criticalSuccess") {
      editPanacheEffect(actor, outcome);
    }
  } else {
    const panacheItemId = "uBJsxCzNhje8m8jj";
    const compendiumPack = game.packs.get("pf2e.feat-effects");
    const panacheEffect = await compendiumPack.getDocument(panacheItemId);
    await actor.createEmbeddedDocuments("Item", [panacheEffect.toObject()]);

    if (outcome === "failure") {
      await editPanacheEffect(actor, outcome);
    }
  }
}

async function hasPanache(actor) {
  const items = await actor.items.contents;
  const panacheEffect = items.find(item =>
    item.type === "effect" && item.system.slug === "effect-panache"
  );

  return panacheEffect 
    ? (panacheEffect.name === "Effect: Panache" ? "success" : "failure")
    : false;
}

async function editPanacheEffect(actor, outcome) {
  try {
    const panacheEffect = actor.items.find(item =>
      item.type === "effect" && item.system.slug === "effect-panache"
    );

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
    ui.notifications.error(`Error updating Panache effect: ${error.message}`);
    console.error(error);
  }
}

export async function checkForFinisher(chatMessage) {
  const { flags } = chatMessage;
  const hasFinisher = flags?.pf2e?.context?.options.includes("finisher");
  const isDamageRoll = flags?.pf2e?.context?.type === "damage-roll";
  const isAttackRoll = flags?.pf2e?.context?.type === "attack-roll";
  const isFailure = flags?.pf2e?.context?.outcome === "failure" || flags?.pf2e?.context?.outcome === "criticalFailure";

  if ((hasFinisher && isDamageRoll) || (hasFinisher && isFailure && isAttackRoll)) {
    const panacheItems = await returnPanacheItems(game.actors.get(chatMessage.speaker.actor));
    if (panacheItems.length > 0) {
      for (const panacheItem of panacheItems) {
        await panacheItem.delete();
      }
    }
  }
}

async function returnPanacheItems(actor) {
  const items = await actor.items.contents;
  return items.filter(item => item.type === "effect" && item.system.slug === "effect-panache");
}

export async function checkForExtravagantParryOrElegantBuckler(chatMessage) {
  const { flags } = chatMessage;

  if (!flags?.pf2e?.context || flags.pf2e.context.type !== "attack-roll" || !flags.pf2e.context.target?.actor) {
    return;
  }

  const targetActorId = flags.pf2e.context.target.actor.split('.').pop();
  const target = game.actors.get(targetActorId);

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

async function hasElegantBucklerFeat(actor) {
  const items = await actor.items.contents;
  return items.some(item => 
    item.type === "feat" && 
    item.system.category === "class" && 
    item.system.slug === "elegant-buckler"
  );
}
