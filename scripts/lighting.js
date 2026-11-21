// Light and dark on the map (Foundry's own lighting): the Light surface sheds bright light on its squares, and Darkness and Low light set the
// darkness level inside their regions. Foundry's vision then decides who sees what, by each token's own senses.

import { MODULE_ID, surfaceMaterial } from "./foundry.js";
import { SURFACES } from "../src/surfaces.js";

const LIGHT = "light";
const lightsOf = (scene, region) => [...scene.lights].filter((light) => light.flags?.[MODULE_ID]?.[LIGHT] === region.id);

// A Light surface's lights: one on each square, bright to its corners, on the region's level.
export async function syncLights(region) {
    const scene = region.parent;
    if (!scene || !game.user.isGM) return;
    const wanted = surfaceMaterial(region) === "light" && region.shapes.length ? region.shapes.filter((shape) => shape.type === "rectangle" && !shape.hole) : [];
    const size = scene.grid.size;
    const keyOf = (x, y) => `${Math.floor(x / size)},${Math.floor(y / size)}`;
    const held = lightsOf(scene, region);
    const keep = new Set(wanted.map((shape) => keyOf(shape.x, shape.y)));
    const stale = held.filter((light) => !keep.has(light.flags[MODULE_ID].square));
    if (stale.length) await scene.deleteEmbeddedDocuments("AmbientLight", stale.map((light) => light.id));
    const have = new Set(held.map((light) => light.flags[MODULE_ID].square));
    const reach = (scene.grid.distance || 5) * 0.75;
    const floor = Number.isFinite(region.elevation?.bottom) ? region.elevation.bottom : 0;
    const add = wanted.filter((shape) => !have.has(keyOf(shape.x, shape.y))).map((shape) => ({
        x: shape.x + size / 2, y: shape.y + size / 2, elevation: floor, levels: [...(region.levels ?? [])], walls: true,
        config: { bright: reach, dim: 0, color: SURFACES.light.color, alpha: 0.3, luminosity: 0.5 },
        flags: { [MODULE_ID]: { [LIGHT]: region.id, square: keyOf(shape.x, shape.y) } }
    }));
    if (add.length) await scene.createEmbeddedDocuments("AmbientLight", add);
}

export async function removeLights(region) {
    const scene = region.parent;
    if (!scene || !game.user.isGM) return;
    const held = lightsOf(scene, region);
    if (held.length) await scene.deleteEmbeddedDocuments("AmbientLight", held.map((light) => light.id));
}

// The darkness level a surface sets inside its region (none: it leaves the scene's own).
export const DARKNESS_LEVELS = { darkness: 1, lowlight: 0.6 };
export const darknessBehavior = (material, flags) => (material in DARKNESS_LEVELS ? [{ type: "adjustDarknessLevel", name: `${SURFACES[material].label}: darkness`, system: { mode: CONFIG.RegionBehavior?.dataModels?.adjustDarknessLevel?.MODES?.OVERRIDE ?? 0, modifier: DARKNESS_LEVELS[material] }, flags }] : []);
