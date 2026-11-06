// The GM's Elements window: paint surfaces, place objects, choose the weather, lay fields, and make the items. Picking a surface, object or field
// and then clicking or dragging on the scene puts it down. Painting a square with what it already is clears it.

import { MODULE_ID, paintSquares, squareAt, surfacesOf } from "./foundry.js";
import { onOilPainted } from "./terrain.js";
import { placeObject } from "./objects.js";
import { paintField, sceneFieldOf, setCycle, setSceneField, cycleOf } from "./fields.js";
import { setStorm, stormOf } from "./storms.js";
import { createItems } from "./items.js";
import { SURFACES } from "../src/surfaces.js";
import { OBJECTS } from "../src/objects.js";
import { STORMS } from "../src/storms.js";
import { FIELD_ELEMENTS, fieldLabel } from "../src/fields.js";

let picked = undefined;
let stroke = null;
let lasting = false;
let dialog = null;

const pointOf = (event) => event.getLocalPosition?.(canvas.stage) ?? canvas.mousePosition;

function onDown(event) {
    if (picked === undefined || !canvas.ready) return;
    event.stopPropagation?.();
    const { x, y } = pointOf(event);
    const key = squareAt(canvas.scene, x, y);
    if (picked?.object) return placeObject(canvas.scene, picked.object, x, y);
    stroke = { keys: new Set([key]), clearing: Boolean(picked) && !picked.field && surfacesOf(canvas.scene).some((surface) => surface.material === picked && surface.squares.includes(key)), last: { x, y } };
}
function onMove(event) {
    if (!stroke) return;
    const { x, y } = pointOf(event);
    // (A fast drag's events skip squares: fill in the line from the last one.)
    const from = stroke.last ?? { x, y };
    const steps = Math.ceil(Math.hypot(x - from.x, y - from.y) / (canvas.scene.grid.size / 2)) || 1;
    for (let step = 1; step <= steps; step++) stroke.keys.add(squareAt(canvas.scene, from.x + ((x - from.x) * step) / steps, from.y + ((y - from.y) * step) / steps));
    stroke.last = { x, y };
}
async function onUp() {
    if (!stroke) return;
    const { keys, clearing } = stroke;
    stroke = null;
    if (picked && typeof picked === "object" && "field" in picked) return paintField(canvas.scene, [...keys], picked.field);
    await paintSquares(canvas.scene, [...keys], clearing ? null : picked, { lasting });
    if (picked === "oil" && !clearing) await onOilPainted(canvas.scene, [...keys]);
}

function listen(on) {
    const stage = canvas.stage;
    if (!stage) return;
    for (const [name, handler] of [["pointerdown", onDown], ["pointermove", onMove], ["pointerup", onUp], ["pointerupoutside", onUp]]) {
        stage.off(name, handler);
        if (on) stage.on(name, handler);
    }
}

export function pick(choice) {
    picked = choice;
    listen(choice !== undefined);
}

const swatch = (color) => `<span class="pf2e-elements-swatch" style="background:${color}"></span>`;

function windowHTML() {
    const scene = canvas.scene;
    const surfaces = Object.entries(SURFACES).map(([key, surface]) => `<button type="button" data-pick="surface" data-value="${key}">${swatch(surface.color)}${surface.label}</button>`).join("");
    const objects = Object.values(OBJECTS).map((object) => `<button type="button" data-pick="object" data-value="${object.key}">${swatch(object.tint)}${object.label}</button>`).join("");
    const fields = FIELD_ELEMENTS.map((element) => `<button type="button" data-pick="field" data-value="${element}">${fieldLabel(element)}</button>`).join("");
    const storms = Object.entries(STORMS).map(([key, storm]) => `<option value="${key}" ${stormOf(scene)?.key === key ? "selected" : ""}>${storm.label}</option>`).join("");
    const whole = FIELD_ELEMENTS.map((element) => `<option value="${element}" ${sceneFieldOf(scene)?.element === element ? "selected" : ""}>${fieldLabel(element)}</option>`).join("");
    const cycle = cycleOf(scene);
    return `<div class="pf2e-elements-paint">
        <nav class="pf2e-elements-tabs"><button type="button" data-tab="surfaces" class="active">Surfaces</button><button type="button" data-tab="objects">Objects</button><button type="button" data-tab="weather">Weather</button><button type="button" data-tab="fields">Fields</button><button type="button" data-tab="items">Items</button></nav>
        <section data-section="surfaces"><div class="pf2e-elements-grid">${surfaces}<button type="button" data-pick="surface" data-value="">Erase</button></div><label><input type="checkbox" data-lasting ${lasting ? "checked" : ""}> Stays until something changes it</label><p>Click or drag on the scene. Painting a square with the same material clears it.</p></section>
        <section data-section="objects" hidden><div class="pf2e-elements-grid">${objects}</div><p>Click on the scene to place one. Each bursts when destroyed or when the right element reaches it.</p></section>
        <section data-section="weather" hidden><label>Elemental weather <select data-storm><option value="">None</option>${storms}</select></label><label>Strikes each round <input type="number" min="1" max="20" data-count value="${stormOf(scene)?.count ?? 2}"></label><p>Each new round, marked squares under the sky are hit, and new ones are marked for the next.</p></section>
        <section data-section="fields" hidden><label>Whole scene <select data-scene-field><option value="">None</option>${whole}</select></label><div class="pf2e-elements-grid">${fields}<button type="button" data-pick="field" data-value="">Erase field</button></div><p>Or pick one and paint a marked area, which takes over from the whole-scene field inside it. A square holds one field. Inside, that element hits harder and hurts less, and what beats it hurts more.</p><label>Cycle through (elements, commas) <input type="text" data-cycle value="${cycle?.elements?.join(", ") ?? ""}"></label><label>Every (rounds) <input type="number" min="1" data-every value="${cycle?.every ?? 2}"></label></section>
        <section data-section="items" hidden><p>Makes flasks for each surface, Sowing Seeds and a Harvest Charm in a world folder, to hand out or put on your own characters.</p><button type="button" data-items>Make the items</button></section>
    </div>`;
}

export function openPaint() {
    if (dialog) return dialog.close();
    dialog = new foundry.applications.api.DialogV2({
        window: { title: "Elements", icon: "fa-solid fa-droplet" },
        position: { width: 420 },
        content: windowHTML(),
        buttons: [{ action: "done", label: "Done", default: true }]
    });
    dialog.addEventListener("close", () => {
        dialog = null;
        lasting = false;
        pick(undefined);
    });
    dialog.render({ force: true }).then(() => {
        const root = dialog.element.querySelector(".pf2e-elements-paint");
        const scene = canvas.scene;
        root.querySelectorAll("[data-tab]").forEach((tab) => tab.addEventListener("click", () => {
            root.querySelectorAll("[data-tab]").forEach((other) => other.classList.toggle("active", other === tab));
            root.querySelectorAll("[data-section]").forEach((section) => { section.hidden = section.dataset.section !== tab.dataset.tab; });
            pick(undefined);
        }));
        root.querySelector("[data-lasting]").addEventListener("change", (event) => { lasting = event.target.checked; });
        root.querySelectorAll("[data-pick]").forEach((button) => button.addEventListener("click", () => {
            root.querySelectorAll("[data-pick]").forEach((other) => other.classList.toggle("active", other === button));
            const { pick: kind, value } = button.dataset;
            pick(kind === "object" ? { object: value } : kind === "field" ? { field: value || null } : value || null);
        }));
        const stormChange = () => {
            const key = root.querySelector("[data-storm]").value;
            setStorm(scene, key ? { key, count: Number(root.querySelector("[data-count]").value) || 1 } : null);
        };
        root.querySelector("[data-storm]").addEventListener("change", stormChange);
        root.querySelector("[data-count]").addEventListener("change", stormChange);
        root.querySelector("[data-scene-field]").addEventListener("change", (event) => setSceneField(scene, event.target.value ? { element: event.target.value } : null));
        const cycleChange = () => {
            const elements = root.querySelector("[data-cycle]").value.split(",").map((word) => word.trim().toLowerCase()).filter((word) => FIELD_ELEMENTS.includes(word));
            setCycle(scene, { elements, every: Number(root.querySelector("[data-every]").value) || 1 });
        };
        root.querySelector("[data-cycle]").addEventListener("change", cycleChange);
        root.querySelector("[data-every]").addEventListener("change", cycleChange);
        root.querySelector("[data-items]").addEventListener("click", async () => ui.notifications.info(`Made ${await createItems()} items.`));
    });
    return MODULE_ID;
}
