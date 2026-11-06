// Elemental fields (src/fields.js): a scene-wide one held in a scene flag, or marked areas as regions, one to an element, that the GM paints. Fields can
// cycle through elements every so many rounds, which makes the map worth moving around.

import { MODULE_ID, creatureOf, isActiveGM, isCreatureActor } from "./foundry.js";
import { applyFieldRegion, syncInside, fieldOf } from "./terrain.js";
import { fieldEffect, fieldLabel, nextField } from "../src/fields.js";
import { squareKey, squareOf } from "../src/surfaces.js";

const SCENE_FIELD = "sceneField";
const COLOR = "#7a5ec8";
export const sceneFieldOf = (scene) => scene?.flags?.[MODULE_ID]?.field ?? null;
const fieldRegions = (scene) => [...scene.regions].filter((region) => fieldOf(region));
const squaresOfField = (region) => region.shapes.map((shape) => squareKey(Math.floor(shape.x / region.parent.grid.size), Math.floor(shape.y / region.parent.grid.size)));

// A neutral field: PF2e has no rule that takes weaknesses and resistances away, so they're cleared from a creature's data once it's prepared.
const inNeutralField = (actor) => (actor.itemTypes?.effect ?? []).some((effect) => effect.slug === "elements-field-neutral" || effect.slug === "elements-surface-field-neutral");
export function installNeutralFields() {
    // (Each creature class's own: their prepareData go on working after the base class's, and rules add to these lists there.)
    for (const kind of ["character", "npc", "familiar"]) {
        const wrapper = function (original, ...args) {
            const result = original(...args);
            if (inNeutralField(this)) {
                this.system.attributes.weaknesses = [];
                this.system.attributes.resistances = [];
            }
            return result;
        };
        // (libWrapper only takes a module's own calls, so not through the core's helper.)
        if (game.modules.get("lib-wrapper")?.active && globalThis.libWrapper) {
            globalThis.libWrapper.register(MODULE_ID, `CONFIG.PF2E.Actor.documentClasses.${kind}.prototype.prepareData`, wrapper, "WRAPPER");
        } else {
            const prototype = CONFIG.PF2E.Actor.documentClasses[kind].prototype;
            const original = prototype.prepareData;
            prototype.prepareData = function (...args) {
                return wrapper.call(this, original.bind(this), ...args);
            };
        }
    }
}

// Lay a field on these squares, or take them out of it if they're already in.
export async function paintField(scene, keys, element) {
    const size = scene.grid.size;
    const shape = (key) => {
        const [column, row] = squareOf(key);
        return { type: "rectangle", x: column * size, y: row * size, width: size, height: size };
    };
    const region = fieldRegions(scene).find((each) => fieldOf(each) === element);
    if (!region) {
        const [created] = await scene.createEmbeddedDocuments("Region", [{ name: fieldLabel(element), color: COLOR, shapes: keys.map(shape), visibility: CONST.REGION_VISIBILITY.ALWAYS, flags: { [MODULE_ID]: { field: element } } }]);
        return applyFieldRegion(created);
    }
    const had = squaresOfField(region);
    const clearing = keys.every((key) => had.includes(key));
    const next = clearing ? had.filter((key) => !keys.includes(key)) : [...new Set([...had, ...keys])];
    if (!next.length) return region.delete();
    await region.update({ shapes: next.map(shape) });
    return syncInside(region);
}

const heldField = (actor) => (actor?.itemTypes?.effect ?? []).filter((effect) => effect.flags?.[MODULE_ID]?.[SCENE_FIELD]);

// The scene-wide field's Effect on every creature, or none.
export async function syncSceneField(scene) {
    if (!isActiveGM() || !scene) return;
    const element = sceneFieldOf(scene)?.element ?? null;
    for (const token of scene.tokens) {
        const actor = token.actor;
        if (!isCreatureActor(actor)) continue;
        const held = heldField(actor);
        if (held.some((effect) => effect.flags[MODULE_ID][SCENE_FIELD] === element)) continue;
        if (held.length) await actor.deleteEmbeddedDocuments("Item", held.map((effect) => effect.id));
        if (!element) continue;
        const { name, rules, description } = fieldEffect(element);
        await actor.createEmbeddedDocuments("Item", [{ name, type: "effect", img: "icons/svg/aura.svg", system: { slug: `elements-field-${element}`, duration: { value: -1, unit: "unlimited", expiry: null, sustained: false }, rules, description: { value: `<p>${description}</p>` } }, flags: { [MODULE_ID]: { [SCENE_FIELD]: element } } }]);
    }
}

export async function setSceneField(scene, field) {
    if (field?.element) await scene.update({ [`flags.${MODULE_ID}.field`]: field });
    else await scene.unsetFlag(MODULE_ID, "field");
    return syncSceneField(scene);
}

export const cycleOf = (scene) => scene?.flags?.[MODULE_ID]?.fieldCycle ?? null;
export const setCycle = (scene, cycle) => (cycle?.elements?.length ? scene.update({ [`flags.${MODULE_ID}.fieldCycle`]: cycle }) : scene.unsetFlag(MODULE_ID, "fieldCycle"));

// Every so many rounds, each field moves to the next element in the cycle.
export async function advanceFields(scene, round) {
    if (!isActiveGM()) return;
    const cycle = cycleOf(scene);
    if (!cycle?.elements?.length || (round - 1) % Math.max(1, cycle.every ?? 1)) return;
    const notes = [];
    const field = sceneFieldOf(scene);
    if (field?.element) {
        const element = nextField(cycle.elements, field.element);
        await setSceneField(scene, { ...field, element });
        notes.push(fieldLabel(element));
    }
    for (const region of fieldRegions(scene)) {
        const element = nextField(cycle.elements, fieldOf(region));
        if (fieldRegions(scene).some((other) => other !== region && fieldOf(other) === element)) continue;
        const had = squaresOfField(region);
        await region.delete();
        await paintField(scene, had, element);
        notes.push(fieldLabel(element));
    }
    if (notes.length) await ChatMessage.create({ speaker: { alias: "Elements" }, content: `<p>The field shifts: ${notes.join(", ")}.</p>` });
}

export const isInField = (token, region) => squaresOfField(region).some((key) => creatureOf(token).squares.includes(key));
