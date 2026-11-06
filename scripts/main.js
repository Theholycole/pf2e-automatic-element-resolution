// PF2e Automatic Element Resolution: a battlefield that reacts to elements. See docs/design.md.

import { MODULE_ID, isActiveGM, isLimnedItem, limnedOf, paintSquares, registerSettings, surfacesOf } from "./foundry.js";
import { applyCard, bindCard, bindEscape, bindThaw, onRollMessage, postPlan, releaseFromIce } from "./cards.js";
import { onApplyDamage, onCombatUpdate, onDamageMessage, onItemUsed, onRegionCreated } from "./triggers.js";
import { openPaint } from "./paint.js";
import { installNeutralFields, syncSceneField } from "./fields.js";
import { migrateSurfaces, onSurfaceDeleted, regionEvent } from "./terrain.js";
import { onTokenMoved, onTurnChange } from "./carry.js";
import { ENVIRONMENT_ID, syncRain } from "./environment.js";
import { installHover } from "./hover.js";
import { bindAim } from "./aim.js";

const safely = (handler) => (...args) => Promise.resolve().then(() => handler(...args)).catch((error) => console.error(`${MODULE_ID} |`, error));

Hooks.once("init", () => {
    registerSettings();
    CONFIG.pf2eElementResolution = { regionEvent };
    installHover();
});

Hooks.once("setup", () => installNeutralFields());

Hooks.once("ready", () => {
    const module = game.modules.get(MODULE_ID);
    if (module) module.api = Object.freeze({ paintSquares, surfacesOf, postPlan, applyCard, openPaint });
    game.modules.get("pf2e-resolution-core")?.api?.patches?.damage?.onApply?.({ module: MODULE_ID, before: onApplyDamage });
    migrateSurfaces().catch((error) => console.error(`${MODULE_ID} |`, error));
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
Hooks.on("moveToken", safely((token) => releaseFromIce(token.parent)));
Hooks.on("updateRegion", safely((region) => releaseFromIce(region.parent)));
Hooks.on("deleteRegion", safely((region) => releaseFromIce(region.parent)));
Hooks.on("updateScene", safely(async (scene, change) => {
    if (isActiveGM() && foundry.utils.hasProperty(change, `flags.${ENVIRONMENT_ID}`)) await syncRain(scene);
}));
Hooks.on("createToken", safely(async (token) => {
    if (isActiveGM()) {
        await syncRain(token.parent);
        await syncSceneField(token.parent);
    }
}));
Hooks.on("renderChatMessageHTML", (message, html) => {
    bindCard(message, html);
    bindThaw(message, html);
    bindEscape(message, html);
    bindAim(message, html);
});
// Limned means it can't be concealed: the condition goes as it arrives, or as Limned does.
Hooks.on("createItem", safely(async (item) => {
    if (!isActiveGM() || !item.parent) return;
    const limned = limnedOf(item.parent);
    if (limned && item.slug === "concealed") await item.delete();
    if (isLimnedItem(item)) await item.parent.itemTypes?.condition?.find((condition) => condition.slug === "concealed")?.delete();
}));

Hooks.on("getSceneControlButtons", (controls) => {
    if (!game.user.isGM) return;
    const regions = controls.tokens ?? controls.token ?? (Array.isArray(controls) ? controls.find((control) => control.name === "token") : null);
    if (!regions) return;
    const tool = { name: "elements", title: "Elements", icon: "fa-solid fa-droplet", button: true, visible: true, order: 100, onChange: () => openPaint() };
    if (Array.isArray(regions.tools)) regions.tools.push(tool);
    else regions.tools.elements = tool;
});
