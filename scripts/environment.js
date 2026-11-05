// The environment module, when it's there: its terrain regions count as surfaces, and its rain soaks creatures and puts out fires. This only
// reads what it stores. Where a reaction changes its ground, a hole is cut in its region, so its own rules stop there too.

import { MODULE_ID, STATE_EFFECTS, WET_SLUG, creatureOf, isCreatureActor, squareAt } from "./foundry.js";
import { environmentMaterial, openSquares, squareKey, squareOf } from "../src/surfaces.js";
import { WEATHER } from "../../pf2e-resolution-core/src/environment/catalog.js";
import { normalizeState, soaked } from "../../pf2e-resolution-core/src/environment/weather.js";

export const ENVIRONMENT_ID = "pf2e-automatic-environment-resolution";

const terrainOf = (region) => region?.flags?.[ENVIRONMENT_ID]?.terrain?.key ?? null;
const environmentData = (scene) => scene?.flags?.[ENVIRONMENT_ID]?.environment ?? {};

function squaresOfRegion(region) {
    const scene = region.parent;
    const size = scene.grid.size;
    const { width, height } = scene.dimensions;
    const keys = [];
    for (let x = 0; x * size < width; x++) {
        for (let y = 0; y * size < height; y++) {
            const point = { x: (x + 0.5) * size, y: (y + 0.5) * size, elevation: 0 };
            if (region.testPoint(point)) keys.push(squareAt(scene, point.x, point.y));
        }
    }
    return keys;
}

// Its terrain as surfaces, without the squares painted over. They don't age; those that can change are lasting until something does it.
export function environmentSurfaces(scene, painted = new Set()) {
    const surfaces = [];
    for (const region of scene?.regions ?? []) {
        const entry = environmentMaterial(terrainOf(region));
        if (!entry) continue;
        const squares = squaresOfRegion(region).filter((key) => !painted.has(key));
        if (squares.length) surfaces.push({ id: region.id, material: entry.material, fixed: Boolean(entry.fixed), squares, ages: {}, lasting: squares, environment: true });
    }
    return surfaces;
}

// Squares that became something else: a hole in each of its regions there (fixed ground stays under what's painted on it).
export async function cutEnvironment(scene, keys) {
    if (!keys.size) return;
    const size = scene.grid.size;
    for (const region of scene.regions) {
        const entry = environmentMaterial(terrainOf(region));
        if (!entry || entry.fixed) continue;
        const inside = squaresOfRegion(region).filter((key) => keys.has(key));
        if (!inside.length) continue;
        const holes = inside.map((key) => {
            const [column, row] = key.split(",").map(Number);
            return { type: "rectangle", x: column * size, y: row * size, width: size, height: size, hole: true };
        });
        await region.update({ shapes: [...region.shapes.map((shape) => shape.toObject?.() ?? shape), ...holes] });
    }
}

// The squares under the sky: open to the map's edge past the walls (only readable on the scene being viewed), without Foundry's no-weather regions.
// A map walled right round has nowhere open; a no-weather region is the way to mark a room with no walls drawn.
export function skySquares(scene) {
    const size = scene.grid.size;
    const { x, y, width, height } = scene.dimensions.sceneRect;
    const first = Math.floor(x / size), upper = Math.floor(y / size), last = Math.floor((x + width - 1) / size), lower = Math.floor((y + height - 1) / size);
    const squares = [];
    for (let column = first; column <= last; column++) for (let row = upper; row <= lower; row++) squares.push(squareKey(column, row));
    const middle = (key) => {
        const [column, row] = squareOf(key);
        return { x: (column + 0.5) * size, y: (row + 0.5) * size, elevation: 0 };
    };
    const walled = canvas?.scene === scene && scene.walls.size > 0;
    const blocked = (a, b) => CONFIG.Canvas.polygonBackends.move.testCollision(middle(a), middle(b), { type: "move", mode: "any" });
    const isEdge = (key) => {
        const [column, row] = squareOf(key);
        return column === first || column === last || row === upper || row === lower;
    };
    const open = walled ? openSquares(squares, blocked, isEdge) : new Set(squares);
    const roofs = [...scene.regions].filter((region) => [...region.behaviors].some((behavior) => behavior.type === "suppressWeather" && !behavior.disabled));
    for (const region of roofs) for (const key of [...open]) if (region.testPoint(middle(key))) open.delete(key);
    return open;
}

// Wet precipitation falling on the scene (GM Core: it douses flames).
export function isRaining(scene) {
    const precipitation = normalizeState(environmentData(scene).state ?? {}).precipitation;
    return Boolean(precipitation && WEATHER.precipitation.kinds[precipitation.kind]?.wet);
}

// Soaking rain, for anyone not sheltered.
export const isSoakingRain = (scene) => soaked(normalizeState(environmentData(scene).state ?? {}), {});

const fromRain = (actor) => (actor?.itemTypes?.effect ?? []).filter((effect) => effect.flags?.[MODULE_ID]?.rain);
const adding = new Set();

// Soaked (the core's rule: heavy wet precipitation, unless sheltered) means Wet for as long as it lasts. Wet from anything else is left alone.
export async function syncRain(scene) {
    if (!scene) return;
    const data = environmentData(scene);
    const state = normalizeState(data.state ?? {});
    const sheltered = new Set(data.sheltered ?? []);
    // (Inside a walled room is sheltered, as well as whoever the GM marked.)
    const sky = soaked(state, {}) ? skySquares(scene) : null;
    for (const token of scene.tokens) {
        const actor = token.actor;
        if (!isCreatureActor(actor)) continue;
        const held = fromRain(actor);
        if (sky && !sheltered.has(token.id) && creatureOf(token).squares.some((key) => sky.has(key))) {
            if (held.length || adding.has(actor.uuid) || actor.itemTypes.effect.some((effect) => effect.slug === WET_SLUG)) continue;
            adding.add(actor.uuid);
            const effect = foundry.utils.deepClone(STATE_EFFECTS.wet);
            effect.system.duration = { value: -1, unit: "unlimited", expiry: null, sustained: false };
            effect.flags[MODULE_ID].rain = true;
            try {
                await actor.createEmbeddedDocuments("Item", [effect]);
            } finally {
                adding.delete(actor.uuid);
            }
        } else if (held.length) await actor.deleteEmbeddedDocuments("Item", held.map((item) => item.id));
    }
}
