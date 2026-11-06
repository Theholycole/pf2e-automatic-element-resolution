// PF2e Automatic Element Resolution: a battlefield that reacts to elements. See docs/design.md.

import { MODULE_ID, isActiveGM, paintSquares, registerSettings, surfacesOf } from "./foundry.js";
import { applyCard, bindCard, onRollMessage, postPlan } from "./cards.js";
import { onApplyDamage, onCombatUpdate, onDamageMessage, onItemUsed, onRegionCreated } from "./triggers.js";
import { openPaint } from "./paint.js";
import { syncSceneField } from "./fields.js";
import { onSurfaceDeleted, regionEvent } from "./terrain.js";
import { onTokenMoved, onTurnChange } from "./carry.js";
import { ENVIRONMENT_ID, syncRain } from "./environment.js";

const safely = (handler) => (...args) => Promise.resolve().then(() => handler(...args)).catch((error) => console.error(`${MODULE_ID} |`, error));

Hooks.once("init", () => {
    registerSettings();
    CONFIG.pf2eElementResolution = { regionEvent };
});

Hooks.once("ready", () => {
    const module = game.modules.get(MODULE_ID);
    if (module) module.api = Object.freeze({ paintSquares, surfacesOf, postPlan, applyCard, openPaint });
    game.modules.get("pf2e-resolution-core")?.api?.patches?.damage?.onApply?.({ module: MODULE_ID, before: onApplyDamage });
});

Hooks.on("createChatMessage", safely(async (message) => {
    await onRollMessage(message);
    await onDamageMessage(message);
    await onItemUsed(message);
}));
Hooks.on("createRegion", safely(onRegionCreated));
Hooks.on("deleteRegion", safely(onSurfaceDeleted));
Hooks.on("updateCombat", safely(onCombatUpdate));
Hooks.on("updateCombat", safely(onTurnChange));
Hooks.on("moveToken", safely(onTokenMoved));
Hooks.on("updateScene", safely(async (scene, change) => {
    if (isActiveGM() && foundry.utils.hasProperty(change, `flags.${ENVIRONMENT_ID}`)) await syncRain(scene);
}));
Hooks.on("createToken", safely(async (token) => {
    if (isActiveGM()) {
        await syncRain(token.parent);
        await syncSceneField(token.parent);
    }
}));
Hooks.on("renderChatMessageHTML", (message, html) => bindCard(message, html));

Hooks.on("getSceneControlButtons", (controls) => {
    if (!game.user.isGM) return;
    const regions = controls.tokens ?? controls.token ?? (Array.isArray(controls) ? controls.find((control) => control.name === "token") : null);
    if (!regions) return;
    const tool = { name: "elements", title: "Elements", icon: "fa-solid fa-droplet", button: true, visible: true, order: 100, onChange: () => openPaint() };
    if (Array.isArray(regions.tools)) regions.tools.push(tool);
    else regions.tools.elements = tool;
});
