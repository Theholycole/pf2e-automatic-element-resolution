// Elemental weather (src/storms.js), on the active GM's client: each new round, marked squares from last round get hit, and new ones are marked. The
// GM chooses it in the Elements window; the environment module's thunderstorm brings lightning by itself.

import { MODULE_ID, creatureOf, creaturesOf, hazardFormula, isActiveGM, isCreatureActor, paintSquares, partyLevel, strikeFormula, surfaceDC, surfacesOf, ruleSettings } from "./foundry.js";
import { postPlan } from "./cards.js";
import { groundWeather, skySquares } from "./environment.js";
import { sceneFieldOf, setSceneField } from "./fields.js";
import { STARTING_GROUND, STORMS, madnessPlan, pickWarnings, scatterPlan, strikeFeet, strikePlan, swarmPlan, windPlan } from "../src/storms.js";
import { levelDC } from "../src/reactions.js";
import { burstSquares, movedSquares, squareKey, squareOf } from "../src/surfaces.js";
import { surfacePlans } from "../src/reactions.js";

const WARNING = "warning";
export const stormOf = (scene) => scene?.flags?.[MODULE_ID]?.storm ?? null;
// (A holy day is a scene-wide field, while it lasts.)
export async function setStorm(scene, storm) {
    if (storm) await scene.update({ [`flags.${MODULE_ID}.storm`]: storm });
    else await scene.unsetFlag(MODULE_ID, "storm");
    if (STORMS[storm?.key]?.kind === "holy") await setSceneField(scene, { element: "holy" });
    else if (sceneFieldOf(scene)?.element === "holy") await setSceneField(scene, null);
}
export const stormFireLasts = (scene) => Boolean(STORMS[stormOf(scene)?.key]?.fireLasts);

const warningsOf = (scene) => [...scene.regions].filter((region) => region.flags?.[MODULE_ID]?.[WARNING]);

async function strike(scene, region) {
    const { key, centre } = region.flags[MODULE_ID][WARNING];
    const storm = STORMS[key];
    await region.delete();
    if (!storm) return;
    const creatures = creaturesOf(scene);
    const dc = surfaceDC({ level: partyLevel(scene) });
    const formula = strikeFormula(scene);
    const amount = (await new Roll(formula).evaluate()).total;
    const hit = strikePlan(storm, centre, creatures, { dc, amount });
    await postPlan(hit, scene);
    // (It reaches the ground too: lightning through a puddle, fire on oil.)
    for (const plan of surfacePlans({ elements: [{ element: storm.element, amount }], contact: burstSquares([centre], strikeFeet(storm)), surfaces: surfacesOf(scene), creatures, direct: hit.targets, dc, hazardFormula: hazardFormula(scene), settings: ruleSettings() })) await postPlan(plan, scene);
}

async function mark(scene, key, centre, round) {
    const size = scene.grid.size;
    const shapes = burstSquares([centre], strikeFeet(STORMS[key])).map((square) => {
        const [column, row] = squareOf(square);
        return { type: "rectangle", x: column * size, y: row * size, width: size, height: size };
    });
    await scene.createEmbeddedDocuments("Region", [{ name: `Warning: ${STORMS[key].label}`, color: "#ff3b30", shapes, visibility: CONST.REGION_VISIBILITY.ALWAYS, flags: { [MODULE_ID]: { [WARNING]: { key, centre, round } } } }]);
}

export async function stormRound(scene, round) {
    if (!isActiveGM()) return;
    for (const region of warningsOf(scene)) if (region.flags[MODULE_ID][WARNING].round < round) await strike(scene, region);
    const chosen = stormOf(scene);
    const key = chosen?.key ?? (groundWeather(scene).thunderstorm ? "lightning" : null);
    if (!key || !STORMS[key]) return;
    const storm = STORMS[key];
    const pick = (n) => Math.floor(CONFIG.Dice.randomUniform() * n);
    if (storm.kind) return kindRound(scene, storm, pick);
    // (Reckoning: one more each round from when it began.)
    let count = chosen?.count ?? 1;
    if (storm.escalates) {
        const began = chosen.began ?? round;
        if (chosen.began === undefined) await scene.update({ [`flags.${MODULE_ID}.storm.began`]: began });
        count += round - began;
    }
    const open = [...skySquares(scene)];
    for (const centre of pickWarnings(open, count, pick)) await mark(scene, key, centre, round);
}

// Those under the sky, as the rules see them, without what's only an object.
const creaturesUnderSky = (scene) => {
    const sky = skySquares(scene);
    return creaturesOf(scene).filter((creature) => creature.squares.some((square) => sky.has(square)));
};

async function kindRound(scene, storm, pick) {
    const dc = levelDC(partyLevel(scene));
    const creatures = creaturesUnderSky(scene);
    if (storm.kind === "wind") {
        if (creatures.length) await postPlan(windPlan(storm, creatures, { dc, pick }), scene);
    } else if (storm.kind === "madness") {
        const struck = creatures.filter(() => pick(100) < 25);
        if (struck.length) await postPlan(madnessPlan(struck, dc), scene);
    } else if (storm.kind === "twisters") {
        await twistersRound(scene, pick);
    }
}

// New twisters, under the sky, and the old ones wander: the GM's card, as the ground's changes are.
async function twistersRound(scene, pick) {
    const held = surfacesOf(scene).find((surface) => surface.material === "twister")?.squares ?? [];
    const sky = skySquares(scene);
    const open = [...sky].filter((square) => !held.includes(square));
    const changes = [];
    if (held.length) {
        const [dx, dy] = [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [-2, -2], [2, -2], [-2, 2]][pick(8)];
        changes.push({ material: "twister", to: null, keys: held, words: "The twisters wander." }, { material: "twister", to: "twister", keys: movedSquares(held, dx, dy).filter((square) => sky.has(square)), words: "" });
    }
    if (open.length) changes.push({ material: null, to: "twister", keys: [open[pick(open.length)]], words: "A new twister touches down." });
    if (changes.length) await postPlan({ key: "twisters", title: "Wandering twisters", targets: [], damage: [], changes, notes: changes.map((change) => change.words).filter(Boolean) }, scene);
}

// A creature's turn ending: the swarm may bite.
export async function stormTurn(combat, change, options) {
    if (!isActiveGM() || options?.direction !== 1 || !("turn" in change || "round" in change)) return;
    const scene = combat.scene ?? game.scenes.viewed;
    if (STORMS[stormOf(scene)?.key]?.kind !== "swarm") return;
    const token = combat.combatants.get(combat.previous?.combatantId)?.token;
    if (!token?.parent || !isCreatureActor(token.actor) || CONFIG.Dice.randomUniform() >= 0.5) return;
    const creature = creatureOf(token);
    const sky = skySquares(scene);
    if (creature.squares.some((square) => sky.has(square))) await postPlan(swarmPlan(creature, token.actor.level), scene);
}

// Starting ground: scatter it now, on the bare squares.
export async function scatterGround(scene, key) {
    const { x, y, width, height } = scene.dimensions.sceneRect;
    const size = scene.grid.size;
    const taken = new Set(surfacesOf(scene).flatMap((surface) => surface.squares));
    const bare = [];
    for (let column = Math.floor(x / size); column * size < x + width; column++) for (let row = Math.floor(y / size); row * size < y + height; row++) {
        const square = squareKey(column, row);
        if (!taken.has(square)) bare.push(square);
    }
    const parts = scatterPlan(key, bare, (n) => Math.floor(CONFIG.Dice.randomUniform() * n));
    for (const { material, keys } of parts) await paintSquares(scene, keys, material);
    return STARTING_GROUND[key]?.label;
}
