// Hovering over a square says what's on it, for when the color isn't enough. Each viewer sees only what their client shows them, and a client setting
// turns it off.

import { MODULE_ID, escapeHTML, ruleSquaresOf, squareAt, surfacesOf } from "./foundry.js";
import { fieldOf } from "./terrain.js";
import { sceneFieldOf } from "./fields.js";
import { fieldEffect } from "../src/fields.js";
import { surfaceInfo } from "../src/hover.js";

const DELAY = 250;
const GAP = 16;

let element = null;
let squares = null;
let current = null;
let timer = null;

const hide = () => {
    clearTimeout(timer);
    current = null;
    if (element) element.hidden = true;
};

// What's on each square of the scene: a map from square to the viewer's entries. Worked out once, until a region or the scene changes.
function buildSquares(scene) {
    const map = new Map();
    const add = (key, entry) => map.set(key, [...(map.get(key) ?? []), entry]);
    for (const surface of surfacesOf(scene)) {
        const region = scene.regions.get(surface.id);
        if (!game.user.isGM && region?.visibility !== CONST.REGION_VISIBILITY.ALWAYS) continue;
        const info = surfaceInfo(surface.material, { fixed: surface.fixed });
        for (const key of surface.squares) add(key, info);
    }
    for (const region of scene.regions) {
        if (!fieldOf(region)) continue;
        const { name, description } = fieldEffect(fieldOf(region));
        for (const key of ruleSquaresOf(region)) add(key, { title: name, lines: [description], traits: [], reactions: [], field: true });
    }
    return map;
}

const entryHTML = ({ title, lines, traits, reactions }) => `<h4>${escapeHTML(title)}</h4>${lines.map((line) => `<p>${escapeHTML(line)}</p>`).join("")}${traits.length ? `<p class="pf2e-elements-hover-note">Traits: ${escapeHTML(traits.join(", "))}</p>` : ""}${reactions.length ? `<p class="pf2e-elements-hover-note">${escapeHTML(reactions.join(" · "))}</p>` : ""}`;

// What's on this square. (A scene-wide field is everywhere a marked one isn't.)
function entriesAt(scene, key) {
    squares ??= buildSquares(scene);
    const here = squares.get(key) ?? [];
    const field = sceneFieldOf(scene);
    if (!field || here.some((entry) => entry.field)) return here;
    const { name, description } = fieldEffect(field);
    return [...here, { title: name, lines: [description], traits: [], reactions: [] }];
}

function show(entries, x, y) {
    if (!element) {
        element = document.createElement("aside");
        element.className = "pf2e-elements-hover";
        document.body.append(element);
    }
    element.innerHTML = entries.map(entryHTML).join("");
    element.hidden = false;
    place(x, y);
}

function place(x, y) {
    const { width, height } = element.getBoundingClientRect();
    element.style.left = `${Math.max(0, x + GAP + width > window.innerWidth ? x - GAP - width : x + GAP)}px`;
    element.style.top = `${Math.max(0, y + GAP + height > window.innerHeight ? y - GAP - height : y + GAP)}px`;
}

function onMove(event) {
    const scene = canvas.scene;
    if (!scene || event.buttons || !game.settings.get(MODULE_ID, "hoverInfo")) return hide();
    const point = canvas.canvasCoordinatesFromClient({ x: event.clientX, y: event.clientY });
    const key = squareAt(scene, point.x, point.y);
    if (key === current) {
        if (element && !element.hidden) place(event.clientX, event.clientY);
        return;
    }
    hide();
    current = key;
    const { clientX, clientY } = event;
    timer = setTimeout(() => {
        const entries = entriesAt(scene, key);
        if (entries.length) show(entries, clientX, clientY);
    }, DELAY);
}

const forget = () => {
    squares = null;
    hide();
};

export function installHover() {
    for (const hook of ["createRegion", "updateRegion", "deleteRegion", "updateScene", "canvasTearDown"]) Hooks.on(hook, forget);
    Hooks.on("canvasReady", () => {
        forget();
        const view = canvas.app.view;
        view.addEventListener("pointermove", onMove);
        view.addEventListener("pointerleave", hide);
        view.addEventListener("pointerdown", hide);
    });
}
