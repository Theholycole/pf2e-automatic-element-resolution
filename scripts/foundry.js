// Foundry and PF2e glue: the module's id and settings, the scene's surfaces as the rules see them, a creature as the rules see it, and
// where a DC comes from. A surface is a region flagged with its material, one region per material; its shapes are grid squares.

import { SURFACES, layerOf, squareKey, squareOf } from "../src/surfaces.js";
import { levelDC } from "../src/reactions.js";
import { applyTerrain, syncInside } from "./terrain.js";
import { syncLights } from "./lighting.js";
import { cutEnvironment, environmentSurfaces } from "./environment.js";
import { categoryDice } from "../../pf2e-resolution-core/src/environment/catalog.js";
import { burstFormula } from "../src/objects.js";

export const MODULE_ID = "pf2e-automatic-element-resolution";
const SURFACE = "surface";
export const WET_SLUG = "elements-wet";
export const OIL_SLUG = "elements-oil";
export const FROZEN_SLUG = "elements-frozen";
export const SHOCKED_SLUG = "elements-shocked";
export const LIMNED_SLUG = "elements-limned";
export const ICEBOUND_SLUG = "elements-icebound";
export const MADDENED_SLUG = "elements-maddened";

export const escapeHTML = (text) => String(text ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
export const isActiveGM = () => game.users.activeGM?.isSelf ?? game.user.isGM;

export function registerSettings() {
    game.settings.register(MODULE_ID, "conductReach", { name: "Lightning's reach (feet)", hint: "How far lightning runs along water or metal from where it touched.", scope: "world", config: true, type: Number, default: 30 });
    game.settings.register(MODULE_ID, "conductFraction", { name: "Lightning's share of the damage", hint: "Those it reaches take this fraction of the roll, with a basic Reflex save.", scope: "world", config: true, type: Number, default: 0.5 });
    game.settings.register(MODULE_ID, "hazardCategory", { name: "Burst damage", hint: "For oil catching fire, Harvest, exploding clouds and weather strikes. By the party's level, or a fixed GM Core environmental damage category. Damaging ground and objects have their own numbers.", scope: "world", config: true, type: String, default: "level", choices: { level: "By the party's level", minor: "Minor", moderate: "Moderate", major: "Major", massive: "Massive" } });
    game.settings.register(MODULE_ID, "waterRounds", { name: "Rounds until a puddle dries", hint: "0: never.", scope: "world", config: true, type: Number, default: 10 });
    game.settings.register(MODULE_ID, "steamRounds", { name: "Rounds until steam fades", hint: "0: never.", scope: "world", config: true, type: Number, default: 2 });
    game.settings.register(MODULE_ID, "burningRounds", { name: "Rounds until a fire burns out", hint: "0: never.", scope: "world", config: true, type: Number, default: 3 });
    game.settings.register(MODULE_ID, "spreadDC", { name: "Flat check for fire to spread", hint: "Each round, for each burning square next to oil or plants.", scope: "world", config: true, type: Number, default: 11 });
    game.settings.register(MODULE_ID, "askTrails", { name: "Ask before a creature changes the ground", hint: "Off: grass catches under a fire creature on its own, with a card only when someone else has to roll. On: a card each time.", scope: "world", config: true, type: Boolean, default: false });
    game.settings.register(MODULE_ID, "showManMade", { name: "Show man-made surfaces to players", hint: "Floors, furniture, sewage and forge coals. They're hidden by default, since the map's art shows them. They work the same either way.", scope: "world", config: true, type: Boolean, default: false, onChange: () => Hooks.callAll("pf2eElementsVisibility") });
    game.settings.register(MODULE_ID, "hoverInfo", { name: "Hover info", hint: "Hovering over a square says what surface or field is on it.", scope: "client", config: true, type: Boolean, default: true });
    game.settings.register(MODULE_ID, "matchups", { name: "Let the element chart decide unlisted pairs", hint: "When no reaction covers an element on a surface and the surface's element is weak to it, the touched squares give way.", scope: "world", config: true, type: Boolean, default: false });
    game.settings.register(MODULE_ID, "rainPuddles", { name: "Puddles from soaking rain", hint: "New puddles each round in heavy rain or worse, on bare squares. 0: none.", scope: "world", config: true, type: Number, default: 3 });
    game.settings.register(MODULE_ID, "cloudRounds", { name: "Rounds until a cloud fades", hint: "Ember, poison, death, frost and dust clouds, and gales. 0: never.", scope: "world", config: true, type: Number, default: 3 });
    game.settings.register(MODULE_ID, "offerSurfaces", { name: "Offer to leave a surface", hint: "An area effect's card can leave its element's surface behind.", scope: "world", config: true, type: Boolean, default: true });
    game.settings.register(MODULE_ID, "surfaceDC", { name: "DC for checks on surfaces", hint: "For Balance on ice and oil. 0: GM Core's DC for the creature's level.", scope: "world", config: true, type: Number, default: 0 });
}
export const ruleSettings = () => ({ conductReach: game.settings.get(MODULE_ID, "conductReach"), conductFraction: game.settings.get(MODULE_ID, "conductFraction"), matchups: game.settings.get(MODULE_ID, "matchups") });
const CLOUDS = ["embers", "toxic", "miasma", "frostfog", "dust", "gale", "twister"];
export const tickSettings = () => ({ lives: { water: game.settings.get(MODULE_ID, "waterRounds"), steam: game.settings.get(MODULE_ID, "steamRounds"), burning: game.settings.get(MODULE_ID, "burningRounds"), ...Object.fromEntries(CLOUDS.map((cloud) => [cloud, game.settings.get(MODULE_ID, "cloudRounds")])) }, spreadDC: game.settings.get(MODULE_ID, "spreadDC") });

const squareOfPoint = (scene, x, y) => {
    const size = scene.grid.size;
    return squareKey(Math.floor(x / size), Math.floor(y / size));
};
export const squareAt = squareOfPoint;

// The flagged region of a material, in the scene.
export const surfaceRegions = (scene) => [...(scene?.regions ?? [])].filter((region) => SURFACES[region.flags?.[MODULE_ID]?.[SURFACE]]);

// Levels (Foundry 14): a scene can have floors, each with its own surfaces. A region in no level belongs to all of them (one painted before this, or
// on a scene of one floor). The level something is on: a token's own, else the one being viewed, else the scene's first.
export const hasLevels = (scene) => (scene?.levels?.size ?? 0) > 1;
export const levelOf = (scene, token = null) => {
    if (!hasLevels(scene)) return null;
    const own = (token?.document ?? token)?.level;
    if (own && scene.levels.has(own)) return own;
    if (globalThis.canvas?.scene === scene && canvas.level?.id) return canvas.level.id;
    return scene.initialLevel?.id ?? scene.levels.contents[0]?.id ?? null;
};
export const inLevel = (region, level) => !level || !region.levels?.size || region.levels.has(level);
// (Where a level's floor is: its creatures' elevation counts from there.)
export const floorOf = (scene, level) => (level ? Number(scene.levels.get(level)?.elevation?.bottom) || 0 : 0);
const levelData = (scene, level) => {
    const floor = level ? scene.levels.get(level) : null;
    return floor ? { levels: [level], elevation: { bottom: floor.elevation.bottom, top: floor.elevation.top } } : {};
};
export const regionLevelData = levelData;
// The top level: the one under the sky, where the weather falls.
export const topLevelOf = (scene) => (hasLevels(scene) ? scene.levels.contents.reduce((top, level) => ((Number(level.elevation.bottom) || 0) > (Number(top.elevation.bottom) || 0) ? level : top)).id : null);
// A material's own region on this level (an old one in no level only where the scene has one floor).
const regionOf = (scene, material, level) => surfaceRegions(scene).find((region) => region.flags[MODULE_ID][SURFACE] === material && (level ? region.levels?.has(level) : true));

// The party's level, as far as the scene's player characters say, then the world's.
export function partyLevel(scene) {
    const levelsOf = (actors) => actors.filter((actor) => actor?.type === "character" && actor.hasPlayerOwner).map((actor) => actor.level);
    const here = levelsOf([...(scene?.tokens ?? [])].map((token) => token.actor));
    return Math.max(1, ...(here.length ? here : levelsOf([...game.actors])));
}

// What a sudden burst of an element deals: lit oil, Harvest, a cloud going up. By the party's level, as an object's burst, unless the GM picked a category.
export function hazardFormula(scene) {
    const category = game.settings.get(MODULE_ID, "hazardCategory");
    return category === "level" ? burstFormula(partyLevel(scene)) : categoryDice(category);
}

// A weather strike: the same by level. A category's is doubled, as it hits so few.
export function strikeFormula(scene) {
    const formula = hazardFormula(scene);
    return game.settings.get(MODULE_ID, "hazardCategory") === "level" ? formula : formula.replace(/^(\d+)d/, (_, count) => `${Number(count) * 2}d`);
}
export const surfaceDC = (actor) => game.settings.get(MODULE_ID, "surfaceDC") || levelDC(actor?.level ?? 0);
export const surfaceMaterial = (region) => SURFACES[region?.flags?.[MODULE_ID]?.[SURFACE]] ? region.flags[MODULE_ID][SURFACE] : null;

const squaresOfRegion = (region) => {
    const size = region.parent.grid.size;
    return region.shapes.filter((shape) => shape.type === "rectangle").map((shape) => squareKey(Math.floor(shape.x / size), Math.floor(shape.y / size)));
};

export const ruleSquaresOf = (region) => squaresOfRegion(region);

// The scene's surfaces: [{ id, material, squares, ages: { key: rounds }, lasting: [keys] }]. (Ages are stored as pairs: an object's keys would merge
// on update and never leave.)
const ownSurfaces = (scene, level) => surfaceRegions(scene).filter((region) => inLevel(region, level)).map((region) => ({ id: region.id, material: region.flags[MODULE_ID][SURFACE], squares: squaresOfRegion(region), ages: Object.fromEntries(region.flags[MODULE_ID].ages ?? []), lasting: region.flags[MODULE_ID].lasting ?? [], level: region.levels?.first?.() ?? [...(region.levels ?? [])][0] ?? null }));
// (With the environment module's terrain, under what's painted on it.) level: whose surfaces; by default, as levelOf says.
export const surfacesOf = (scene, level = levelOf(scene)) => {
    const own = ownSurfaces(scene, level);
    return [...own, ...environmentSurfaces(scene, new Set(own.flatMap((surface) => surface.squares)), level)];
};

const shapeOf = (scene, key) => {
    const [column, row] = squareOf(key);
    const size = scene.grid.size;
    return { type: "rectangle", x: column * size, y: row * size, width: size, height: size };
};

// Who sees a surface. Man-made ones show on the map's art, so they're the GM's unless the world says otherwise.
export const surfaceVisibility = (material) => (SURFACES[material]?.manMade && !game.settings.get(MODULE_ID, "showManMade") ? CONST.REGION_VISIBILITY.GAMEMASTER : CONST.REGION_VISIBILITY.ALWAYS);

// Set a material's squares (none: its region goes). Each square keeps its age and whether it lasts, while it's there. region: the one to write
// (by default, the material's own on this level).
async function writeSquares(scene, material, squares, { ages = {}, lasting = [] } = {}, level = null, region = regionOf(scene, material, level)) {
    const kept = [...new Set(squares)];
    const shapes = kept.map((key) => shapeOf(scene, key));
    if (!shapes.length) return region?.delete();
    const timing = { ages: kept.filter((key) => ages[key]).map((key) => [key, ages[key]]), lasting: lasting.filter((key) => kept.includes(key)) };
    if (region) {
        await region.update({ shapes, [`flags.${MODULE_ID}.ages`]: timing.ages, [`flags.${MODULE_ID}.lasting`]: timing.lasting });
        await syncLights(region);
        return syncInside(region);
    }
    const [created] = await scene.createEmbeddedDocuments("Region", [{ name: `Surface: ${SURFACES[material].label}`, color: SURFACES[material].color, shapes, visibility: surfaceVisibility(material), ...levelData(scene, level), flags: { [MODULE_ID]: { [SURFACE]: material, ...timing } } }]);
    await applyTerrain(created);
    return created;
}

// These squares become this material (null: bare ground), and start their time afresh. lasting: they never run out. level: the floor they're on
// (by default, as levelOf says). A floor (wood, stone, metal) is a layer of its own: painting replaces only what's on the same layer, so water
// can lie on a wood floor. from: what a reaction changed, which goes too (fire on a wood floor: the floor burns away). No material: erase from,
// or with no from, everything there.
export async function paintSquares(scene, keys, material, { lasting = false, level = levelOf(scene), from = null } = {}) {
    const painted = new Set(keys);
    const layer = material ? layerOf(material) : null;
    const goes = (other) => other === from || (material ? layerOf(other) === layer : !from);
    // (The environment module's terrain is on the top layer.)
    if (material ? layer === "top" : !from || layerOf(from) === "top") await cutEnvironment(scene, painted, level);
    for (const surface of ownSurfaces(scene, level)) {
        if (surface.material === material && (!level || surface.level === level)) continue;
        if (!goes(surface.material)) continue;
        const left = surface.squares.filter((key) => !painted.has(key));
        if (left.length !== surface.squares.length) await writeSquares(scene, surface.material, left, surface, level, scene.regions.get(surface.id));
    }
    if (!material) return;
    const here = ownSurfaces(scene, level).find((surface) => surface.material === material && (!level || surface.level === level));
    const ages = Object.fromEntries(Object.entries(here?.ages ?? {}).filter(([key]) => !painted.has(key)));
    const stays = (here?.lasting ?? []).filter((key) => !painted.has(key));
    await writeSquares(scene, material, [...(here?.squares ?? []), ...keys], { ages, lasting: lasting ? [...stays, ...keys] : stays }, level);
}

// Those a move or a paint has just covered in oil pick up a stack.
export const coreForcedMove = () => game.modules.get("pf2e-resolution-core")?.api?.forcedMovement?.forcedMove ?? null;

// A round's new ages, on each surface's region: { region id: { key: rounds } }.
export async function writeAges(scene, ages) {
    for (const region of surfaceRegions(scene)) {
        const grown = ages[region.id];
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
    // (On a level, its height above that floor.)
    const floor = floorOf(document.parent, levelOf(document.parent, document));
    const left = Math.floor(stored.x / size + 0.001), upper = Math.floor(stored.y / size + 0.001);
    for (let dx = 0; dx < width; dx++) for (let dy = 0; dy < height; dy++) squares.push(squareKey(left + dx, upper + dy));
    const actor = document.actor;
    return {
        id: document.id,
        name: document.name,
        squares,
        elevation: (stored.elevation ?? 0) - floor,
        metalArmor: METAL_GROUPS.has(actor?.wornArmor?.group),
        wet: Boolean(stateOf(actor, WET_SLUG)),
        limned: limnedOf(actor),
        burning: (actor?.itemTypes?.condition ?? []).some((condition) => condition.slug === "persistent-damage" && condition.system?.persistent?.damageType === "fire"),
        oil: stateOf(actor, OIL_SLUG)?.system?.badge?.value ?? 0,
        frozen: stateOf(actor, FROZEN_SLUG)?.system?.badge?.value ?? 0
    };
}
// With no source to take a DC from: GM Core's DC for the highest level on the scene.
export const sceneDC = (scene) => surfaceDC({ level: Math.max(0, ...[...scene.tokens].filter((token) => isCreatureActor(token.actor) && !token.actor.flags?.[MODULE_ID]?.object).map((token) => token.actor.level ?? 0)) });

export const isCreatureActor = (actor) => Boolean(actor?.isOfType?.("creature"));
// level: only those on it (on a scene with levels).
export const creaturesOf = (scene, level = null) => [...scene.tokens].filter((token) => token.actor?.isOfType?.("creature") && (!level || levelOf(scene, token) === level)).map(creatureOf);

// The source's DC: its spell's, then its class's, then GM Core's for its level.
export function dcFrom(actor, item) {
    if (!actor) return null;
    return item?.spellcasting?.statistic?.dc?.value ?? actor?.classDC?.dc?.value ?? actor?.spellDC?.value ?? levelDC(actor?.level ?? 0);
}

// The damage a roll holds: [{ type, total, persistent }].
export const damageOf = (roll) => (roll?.instances ?? []).map((instance) => ({ type: instance.type, total: instance.total, persistent: Boolean(instance.persistent) }));

const effect = (name, slug, img, duration, rules, description, badge = null, traits = []) => ({ name, type: "effect", img, flags: { [MODULE_ID]: { state: slug } }, system: { slug, duration, rules, traits: { value: traits }, ...(badge ? { badge } : {}), description: { value: `<p>${description}</p>` } } });
const UNLIMITED = { value: -1, unit: "unlimited", expiry: null, sustained: false };

// (Personal Rain Cloud gives fire resistance 2 at rank 1. Oil's stacks, frozen's value, shocked and limned are homebrew, the last three after Battlezoo Eldamon's conditions.)
export const STATE_EFFECTS = {
    wet: effect("Wet", WET_SLUG, "icons/magic/water/water-drop-swirl-blue.webp", { value: 1, unit: "minutes", expiry: "turn-start", sustained: false }, [
        { key: "Resistance", type: "fire", value: 2 },
        { key: "FlatModifier", selector: "saving-throw", type: "circumstance", value: -1, label: "Wet", predicate: ["item:trait:electricity"] }
    ], "Soaked through: fire resistance 2, and &minus;1 circumstance to saves against electricity. Lightning through water hits it for double. Cold can freeze it. Homebrew.", null, ["water"]),
    oil: effect("Oil", OIL_SLUG, "icons/consumables/potions/potion-tube-corked-orange.webp", UNLIMITED, [
        { key: "FlatModifier", selector: "all-speeds", type: "status", value: -5, label: "Oil" }
    ], "Covered in oil: &minus;5-foot status penalty to Speeds, however much of it there is. The next fire damage turns each stack into 1d6 persistent fire damage. Water washes it off. Homebrew.", { type: "counter", value: 1, min: 1, max: 20 }),
    frozen: effect("Frozen", FROZEN_SLUG, "icons/magic/water/snowflake-ice-blue.webp", UNLIMITED, [
        { key: "FlatModifier", selector: "all-speeds", type: "status", value: "-5*@item.badge.value", label: "Frozen" }
    ], "Slowly freezing over: &minus;5-foot status penalty to Speeds for each point. It or an adjacent ally can spend an Interact action to lower this by 4. Fire thaws it at once. Homebrew.", { type: "counter", value: 1, min: 1, max: 10 }, ["cold"]),
    icebound: effect("Stuck in the ice", ICEBOUND_SLUG, "icons/magic/water/ice-crystal-white.webp", UNLIMITED, [
        { key: "GrantItem", uuid: "Compendium.pf2e.conditionitems.Item.eIcWbB5o3pP6OIMe", allowDuplicate: true, onDeleteActions: { granter: "cascade", grantee: "cascade" } }
    ], "Frozen in place: immobilized until it Escapes, or the ice under it breaks or melts. Homebrew."),
    maddened: effect("Maddened", MADDENED_SLUG, "icons/magic/control/hypnosis-mesmerism-swirl.webp", { value: 1, unit: "rounds", expiry: "turn-end", sustained: false }, [
        { key: "GrantItem", uuid: "Compendium.pf2e.conditionitems.Item.yblD8fOR1J8rDwEQ", allowDuplicate: true, onDeleteActions: { granter: "cascade", grantee: "cascade" } }
    ], "Madness has it: confused until the end of its next turn. Homebrew."),
    shocked: effect("Shocked", SHOCKED_SLUG, "icons/magic/lightning/bolt-strike-blue.webp", { value: 2, unit: "rounds", expiry: "turn-end", sustained: false }, [
        { key: "FlatModifier", selector: "ac", type: "circumstance", value: -2, label: "Shocked", predicate: ["origin:item:trait:electricity"] },
        { key: "FlatModifier", selector: "saving-throw", type: "circumstance", value: -2, label: "Shocked", predicate: ["item:trait:electricity"] }
    ], "Charged with electricity: &minus;2 circumstance to AC and saves against electricity. Homebrew.", null, ["electricity"]),
    limned: effect("Limned", LIMNED_SLUG, "icons/magic/light/explosion-star-glow-yellow.webp", { value: 2, unit: "rounds", expiry: "turn-end", sustained: false }, [
        { key: "Note", selector: "ac", title: "Limned", text: "Outlined in light: it can't be concealed." }
    ], "Outlined in light: it can't be concealed. Homebrew.", null, ["light"])
};
