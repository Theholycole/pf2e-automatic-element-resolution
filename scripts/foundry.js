// Foundry and PF2e glue: the module's id and settings, the scene's surfaces as the rules see them, a creature as the rules see it, and
// where a DC comes from. A surface is a region flagged with its material, one region per material; its shapes are grid squares.

import { SURFACES, squareKey, squareOf } from "../src/surfaces.js";
import { levelDC } from "../src/reactions.js";
import { applyTerrain, syncInside } from "./terrain.js";
import { cutEnvironment, environmentSurfaces } from "./environment.js";
import { categoryDice } from "../../pf2e-resolution-core/src/environment/catalog.js";

export const MODULE_ID = "pf2e-automatic-element-resolution";
const SURFACE = "surface";
export const WET_SLUG = "elements-wet";
export const OIL_SLUG = "elements-oil";
export const FROZEN_SLUG = "elements-frozen";
export const SHOCKED_SLUG = "elements-shocked";
export const LIMNED_SLUG = "elements-limned";

export const escapeHTML = (text) => String(text ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
export const isActiveGM = () => game.users.activeGM?.isSelf ?? game.user.isGM;

export function registerSettings() {
    game.settings.register(MODULE_ID, "conductReach", { name: "Lightning's reach (feet)", hint: "How far lightning runs along water or metal from where it touched.", scope: "world", config: true, type: Number, default: 30 });
    game.settings.register(MODULE_ID, "conductFraction", { name: "Lightning's share of the damage", hint: "Those it reaches take this fraction of the roll, with a basic Reflex save.", scope: "world", config: true, type: Number, default: 0.5 });
    game.settings.register(MODULE_ID, "hazardCategory", { name: "Burning ground's damage", hint: "GM Core's environmental damage category for oil catching fire and for standing in flames.", scope: "world", config: true, type: String, default: "minor", choices: { minor: "Minor", moderate: "Moderate", major: "Major", massive: "Massive" } });
    game.settings.register(MODULE_ID, "waterRounds", { name: "Rounds until a puddle dries", hint: "0: never.", scope: "world", config: true, type: Number, default: 10 });
    game.settings.register(MODULE_ID, "steamRounds", { name: "Rounds until steam fades", hint: "0: never.", scope: "world", config: true, type: Number, default: 2 });
    game.settings.register(MODULE_ID, "burningRounds", { name: "Rounds until a fire burns out", hint: "0: never.", scope: "world", config: true, type: Number, default: 3 });
    game.settings.register(MODULE_ID, "spreadDC", { name: "Flat check for fire to spread", hint: "Each round, for each burning square next to oil or plants.", scope: "world", config: true, type: Number, default: 11 });
    game.settings.register(MODULE_ID, "askTrails", { name: "Ask before a creature changes the ground", hint: "Off: grass catches under a fire creature on its own, with a card only when someone else has to roll. On: a card each time.", scope: "world", config: true, type: Boolean, default: false });
    game.settings.register(MODULE_ID, "matchups", { name: "Let the element chart decide unlisted pairs", hint: "When no reaction covers an element on a surface and the surface's element is weak to it, the touched squares give way.", scope: "world", config: true, type: Boolean, default: false });
    game.settings.register(MODULE_ID, "rainPuddles", { name: "Puddles from soaking rain", hint: "New puddles each round in heavy rain or worse, on bare squares. 0: none.", scope: "world", config: true, type: Number, default: 3 });
    game.settings.register(MODULE_ID, "cloudRounds", { name: "Rounds until a cloud fades", hint: "Ember, poison, death, frost and dust clouds, and gales. 0: never.", scope: "world", config: true, type: Number, default: 3 });
    game.settings.register(MODULE_ID, "offerSurfaces", { name: "Offer to leave a surface", hint: "An area effect's card can leave its element's surface behind.", scope: "world", config: true, type: Boolean, default: true });
    game.settings.register(MODULE_ID, "surfaceDC", { name: "DC for checks on surfaces", hint: "For Balance on ice and oil. 0: GM Core's DC for the creature's level.", scope: "world", config: true, type: Number, default: 0 });
}
export const ruleSettings = () => ({ conductReach: game.settings.get(MODULE_ID, "conductReach"), conductFraction: game.settings.get(MODULE_ID, "conductFraction"), matchups: game.settings.get(MODULE_ID, "matchups") });
const CLOUDS = ["embers", "toxic", "miasma", "frostfog", "dust", "gale"];
export const tickSettings = () => ({ lives: { water: game.settings.get(MODULE_ID, "waterRounds"), steam: game.settings.get(MODULE_ID, "steamRounds"), burning: game.settings.get(MODULE_ID, "burningRounds"), ...Object.fromEntries(CLOUDS.map((cloud) => [cloud, game.settings.get(MODULE_ID, "cloudRounds")])) }, spreadDC: game.settings.get(MODULE_ID, "spreadDC") });

const squareOfPoint = (scene, x, y) => {
    const size = scene.grid.size;
    return squareKey(Math.floor(x / size), Math.floor(y / size));
};
export const squareAt = squareOfPoint;

// The flagged region of a material, in the scene.
export const surfaceRegions = (scene) => [...(scene?.regions ?? [])].filter((region) => SURFACES[region.flags?.[MODULE_ID]?.[SURFACE]]);
const regionOf = (scene, material) => surfaceRegions(scene).find((region) => region.flags[MODULE_ID][SURFACE] === material);

export const hazardFormula = () => categoryDice(game.settings.get(MODULE_ID, "hazardCategory"));
export const surfaceDC = (actor) => game.settings.get(MODULE_ID, "surfaceDC") || levelDC(actor?.level ?? 0);
export const surfaceMaterial = (region) => SURFACES[region?.flags?.[MODULE_ID]?.[SURFACE]] ? region.flags[MODULE_ID][SURFACE] : null;

const squaresOfRegion = (region) => {
    const size = region.parent.grid.size;
    return region.shapes.filter((shape) => shape.type === "rectangle").map((shape) => squareKey(Math.floor(shape.x / size), Math.floor(shape.y / size)));
};

export const ruleSquaresOf = (region) => squaresOfRegion(region);

// The scene's surfaces: [{ id, material, squares, ages: { key: rounds }, lasting: [keys] }]. (Ages are stored as pairs: an object's keys would merge
// on update and never leave.)
const ownSurfaces = (scene) => surfaceRegions(scene).map((region) => ({ id: region.id, material: region.flags[MODULE_ID][SURFACE], squares: squaresOfRegion(region), ages: Object.fromEntries(region.flags[MODULE_ID].ages ?? []), lasting: region.flags[MODULE_ID].lasting ?? [] }));
// (With the environment module's terrain, under what's painted on it.)
export const surfacesOf = (scene) => {
    const own = ownSurfaces(scene);
    return [...own, ...environmentSurfaces(scene, new Set(own.flatMap((surface) => surface.squares)))];
};

const shapeOf = (scene, key) => {
    const [column, row] = squareOf(key);
    const size = scene.grid.size;
    return { type: "rectangle", x: column * size, y: row * size, width: size, height: size };
};

// Set a material's squares (none: its region goes). Each square keeps its age and whether it lasts, while it's there.
async function writeSquares(scene, material, squares, { ages = {}, lasting = [] } = {}) {
    const region = regionOf(scene, material);
    const kept = [...new Set(squares)];
    const shapes = kept.map((key) => shapeOf(scene, key));
    if (!shapes.length) return region?.delete();
    const timing = { ages: kept.filter((key) => ages[key]).map((key) => [key, ages[key]]), lasting: lasting.filter((key) => kept.includes(key)) };
    if (region) {
        await region.update({ shapes, [`flags.${MODULE_ID}.ages`]: timing.ages, [`flags.${MODULE_ID}.lasting`]: timing.lasting });
        return syncInside(region);
    }
    const [created] = await scene.createEmbeddedDocuments("Region", [{ name: `Surface: ${SURFACES[material].label}`, color: SURFACES[material].color, shapes, visibility: CONST.REGION_VISIBILITY.ALWAYS, flags: { [MODULE_ID]: { [SURFACE]: material, ...timing } } }]);
    await applyTerrain(created);
    return created;
}

// These squares become this material (null: bare ground), whatever they were, and start their time afresh. lasting: they never run out.
export async function paintSquares(scene, keys, material, { lasting = false } = {}) {
    const painted = new Set(keys);
    await cutEnvironment(scene, painted);
    for (const surface of ownSurfaces(scene)) {
        if (surface.material === material) continue;
        const left = surface.squares.filter((key) => !painted.has(key));
        if (left.length !== surface.squares.length) await writeSquares(scene, surface.material, left, surface);
    }
    if (!material) return;
    const here = ownSurfaces(scene).find((surface) => surface.material === material);
    const ages = Object.fromEntries(Object.entries(here?.ages ?? {}).filter(([key]) => !painted.has(key)));
    const stays = (here?.lasting ?? []).filter((key) => !painted.has(key));
    await writeSquares(scene, material, [...(here?.squares ?? []), ...keys], { ages, lasting: lasting ? [...stays, ...keys] : stays });
}

// Those a move or a paint has just covered in oil pick up a stack.
export const coreForcedMove = () => game.modules.get("pf2e-resolution-core")?.api?.forcedMovement?.forcedMove ?? null;

// A round's new ages, on each material: { material: { key: rounds } }.
export async function writeAges(scene, ages) {
    for (const region of surfaceRegions(scene)) {
        const grown = ages[region.flags[MODULE_ID][SURFACE]];
        if (grown) await region.update({ [`flags.${MODULE_ID}.ages`]: Object.entries(grown) });
    }
}

const METAL_GROUPS = new Set(["chain", "composite", "plate"]);

export const isLimnedItem = (item) => [LIMNED_SLUG, "elements-surface-light"].includes(item?.slug);
export const limnedOf = (actor) => (actor?.itemTypes?.effect ?? []).some(isLimnedItem);

const stateOf = (actor, slug) => actor?.itemTypes?.effect?.find((effect) => effect.slug === slug) ?? null;

// A token as the rules see it: { id, name, squares, elevation, metalArmor, wet }.
export function creatureOf(token) {
    const document = token.document ?? token;
    const size = document.parent.grid.size;
    const width = Math.max(1, Math.round(document.width)), height = Math.max(1, Math.round(document.height));
    const squares = [];
    // (Its stored place: Foundry 14's prepared x, y and elevation can lag behind while the token animates.)
    const stored = document._source ?? document;
    const left = Math.floor(stored.x / size + 0.001), upper = Math.floor(stored.y / size + 0.001);
    for (let dx = 0; dx < width; dx++) for (let dy = 0; dy < height; dy++) squares.push(squareKey(left + dx, upper + dy));
    const actor = document.actor;
    return {
        id: document.id,
        name: document.name,
        squares,
        elevation: stored.elevation ?? 0,
        metalArmor: METAL_GROUPS.has(actor?.wornArmor?.group),
        wet: Boolean(stateOf(actor, WET_SLUG)),
        limned: limnedOf(actor),
        oil: stateOf(actor, OIL_SLUG)?.system?.badge?.value ?? 0,
        frozen: stateOf(actor, FROZEN_SLUG)?.system?.badge?.value ?? 0
    };
}
// With no source to take a DC from: GM Core's DC for the highest level on the scene.
export const sceneDC = (scene) => surfaceDC({ level: Math.max(0, ...[...scene.tokens].filter((token) => isCreatureActor(token.actor) && !token.actor.flags?.[MODULE_ID]?.object).map((token) => token.actor.level ?? 0)) });

export const isCreatureActor = (actor) => Boolean(actor?.isOfType?.("creature"));
export const creaturesOf = (scene) => [...scene.tokens].filter((token) => token.actor?.isOfType?.("creature")).map(creatureOf);

// The source's DC: its spell's, then its class's, then GM Core's for its level.
export function dcFrom(actor, item) {
    if (!actor) return null;
    return item?.spellcasting?.statistic?.dc?.value ?? actor?.classDC?.dc?.value ?? actor?.spellDC?.value ?? levelDC(actor?.level ?? 0);
}

// The damage a roll holds: [{ type, total, persistent }].
export const damageOf = (roll) => (roll?.instances ?? []).map((instance) => ({ type: instance.type, total: instance.total, persistent: Boolean(instance.persistent) }));

const effect = (name, slug, img, duration, rules, description, badge = null) => ({ name, type: "effect", img, flags: { [MODULE_ID]: { state: slug } }, system: { slug, duration, rules, ...(badge ? { badge } : {}), description: { value: `<p>${description}</p>` } } });
const UNLIMITED = { value: -1, unit: "unlimited", expiry: null, sustained: false };

// (Personal Rain Cloud gives fire resistance 2 at rank 1. Oil's stacks, frozen's value, shocked and limned are homebrew, the last three after Battlezoo Eldamon's conditions.)
export const STATE_EFFECTS = {
    wet: effect("Wet", WET_SLUG, "icons/magic/water/water-drop-swirl-blue.webp", { value: 1, unit: "minutes", expiry: "turn-start", sustained: false }, [
        { key: "Resistance", type: "fire", value: 2 },
        { key: "FlatModifier", selector: "saving-throw", type: "circumstance", value: -1, label: "Wet", predicate: ["item:trait:electricity"] }
    ], "Soaked through: fire resistance 2, and &minus;1 circumstance to saves against electricity. Lightning through water hits it for double. Cold can freeze it. Homebrew."),
    oil: effect("Oil", OIL_SLUG, "icons/consumables/potions/potion-tube-corked-orange.webp", UNLIMITED, [
        { key: "FlatModifier", selector: "all-speeds", type: "status", value: -5, label: "Oil" }
    ], "Covered in oil: &minus;5-foot status penalty to Speeds, however much of it there is. The next fire damage turns each stack into 1d6 persistent fire damage. Water washes it off. Homebrew.", { type: "counter", value: 1, min: 1, max: 20 }),
    frozen: effect("Frozen", FROZEN_SLUG, "icons/magic/water/snowflake-ice-blue.webp", UNLIMITED, [
        { key: "FlatModifier", selector: "all-speeds", type: "status", value: "-5*@item.badge.value", label: "Frozen" }
    ], "Slowly freezing over: &minus;5-foot status penalty to Speeds for each point. It or an adjacent ally can spend an Interact action to lower this by 4. Fire thaws it at once. Homebrew.", { type: "counter", value: 1, min: 1, max: 10 }),
    shocked: effect("Shocked", SHOCKED_SLUG, "icons/magic/lightning/bolt-strike-blue.webp", { value: 2, unit: "rounds", expiry: "turn-end", sustained: false }, [
        { key: "FlatModifier", selector: "ac", type: "circumstance", value: -2, label: "Shocked", predicate: ["origin:item:trait:electricity"] },
        { key: "FlatModifier", selector: "saving-throw", type: "circumstance", value: -2, label: "Shocked", predicate: ["item:trait:electricity"] }
    ], "Charged with electricity: &minus;2 circumstance to AC and saves against electricity. Homebrew."),
    limned: effect("Limned", LIMNED_SLUG, "icons/magic/light/explosion-star-glow-yellow.webp", { value: 2, unit: "rounds", expiry: "turn-end", sustained: false }, [
        { key: "Note", selector: "ac", title: "Limned", text: "Outlined in light: it can't be concealed." }
    ], "Outlined in light: it can't be concealed. Homebrew.")
};
