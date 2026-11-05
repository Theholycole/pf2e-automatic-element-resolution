// The GM's paint tool: pick a material, then click or drag across the scene to lay it down. Painting a square with what it already is
// clears it. Erase clears whatever is there.

import { MODULE_ID, paintSquares, squareAt, surfacesOf } from "./foundry.js";
import { onOilPainted } from "./terrain.js";
import { SURFACES } from "../src/surfaces.js";

let picked = undefined;
let stroke = null;
let lasting = false;
let dialog = null;

const pointOf = (event) => event.getLocalPosition?.(canvas.stage) ?? canvas.mousePosition;

function onDown(event) {
    if (picked === undefined || !canvas.ready) return;
    event.stopPropagation?.();
    stroke = { keys: new Set(), clearing: false };
    const { x, y } = pointOf(event);
    const key = squareAt(canvas.scene, x, y);
    stroke.clearing = Boolean(picked) && surfacesOf(canvas.scene).some((surface) => surface.material === picked && surface.squares.includes(key));
    stroke.keys.add(key);
    stroke.last = { x, y };
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

export function pick(material) {
    picked = material;
    listen(material !== undefined);
}

export function openPaint() {
    if (dialog) return dialog.close();
    const buttons = Object.entries(SURFACES).map(([key, surface]) => `<button type="button" data-material="${key}"><span class="pf2e-elements-swatch" style="background:${surface.color}"></span>${surface.label}</button>`).join("");
    dialog = new foundry.applications.api.DialogV2({
        window: { title: "Paint surfaces", icon: "fa-solid fa-droplet" },
        position: { width: 260 },
        content: `<div class="pf2e-elements-paint">${buttons}<button type="button" data-material="">Erase</button><label><input type="checkbox" data-lasting> Stays until something changes it</label><p>Click or drag on the scene. Painting a square with the same material clears it.</p></div>`,
        buttons: [{ action: "done", label: "Done", default: true }]
    });
    dialog.addEventListener("close", () => {
        dialog = null;
        lasting = false;
        pick(undefined);
    });
    dialog.render({ force: true }).then(() => {
        const root = dialog.element.querySelector(".pf2e-elements-paint");
        root.querySelector("[data-lasting]").addEventListener("change", (event) => {
            lasting = event.target.checked;
        });
        root.querySelectorAll("[data-material]").forEach((button) => button.addEventListener("click", () => {
            root.querySelectorAll("[data-material]").forEach((other) => other.classList.toggle("active", other === button));
            pick(button.dataset.material || null);
        }));
    });
    return MODULE_ID;
}
