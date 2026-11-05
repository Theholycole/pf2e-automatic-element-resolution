import test from "node:test";
import assert from "node:assert/strict";

import { bodyFrom, openSquares, squareKey, touches } from "../src/surfaces.js";
import { creaturePlans, elementsFrom, levelDC, puddlePlan, shareOf, surfacePlans } from "../src/reactions.js";
import { carriedElements, needsCard, pathSquares, trailPlans, weaknessPlan } from "../src/carry.js";
import { environmentMaterial } from "../src/surfaces.js";
import { rainPuddles, roundPlan, tickSurfaces } from "../src/ticks.js";
import { balancePlan, effectRulesFor, greasePlan, hazardPlan, steady, terrainRules } from "../src/terrain.js";

const row = (y, from, to) => Array.from({ length: to - from + 1 }, (_, i) => squareKey(from + i, y));
const puddle = { id: "water", material: "water", squares: row(0, 0, 3) };
const goblin = (id, column, extra = {}) => ({ id, squares: [squareKey(column, 0)], elevation: 0, ...extra });

test("elements: from damage types and traits; persistent damage isn't part of the amount", () => {
    assert.deepEqual(elementsFrom({ damage: [{ type: "electricity", total: 10 }, { type: "piercing", total: 4 }] }), [{ element: "electricity", amount: 10 }]);
    assert.deepEqual(elementsFrom({ damage: [{ type: "fire", total: 3, persistent: true }] }), [{ element: "fire", amount: 0 }]);
    assert.deepEqual(elementsFrom({ traits: ["water", "manipulate"] }), [{ element: "water", amount: 0 }]);
});

test("a body: squares joined through the set, within reach", () => {
    const squares = [...row(0, 0, 8), squareKey(20, 0)];
    assert.equal(bodyFrom([squareKey(0, 0)], squares).size, 9, "the far square isn't joined");
    assert.equal(bodyFrom([squareKey(0, 0)], squares, 30).size, 7, "30 feet: six squares on");
    assert.equal(bodyFrom([squareKey(1, 1)], [squareKey(2, 2), squareKey(1, 1)], 5).size, 1, "a diagonal is more than 5 feet");
    assert.equal(bodyFrom([squareKey(50, 50)], squares).size, 0, "not on it at all");
});

test("a flier doesn't touch a puddle, and does touch a cloud", () => {
    assert.equal(touches(goblin("a", 1), puddle.squares), true);
    assert.equal(touches(goblin("a", 1, { elevation: 10 }), puddle.squares), false);
    assert.equal(touches(goblin("a", 1, { elevation: 10 }), puddle.squares, { cloud: true }), true);
    assert.equal(touches(goblin("a", 9), puddle.squares), false);
});

test("lightning through a puddle: half to the others in it, basic Reflex, not to who it already hit", () => {
    const [plan, ...others] = surfacePlans({
        elements: [{ element: "electricity", amount: 11 }],
        contact: [squareKey(0, 0)],
        surfaces: [puddle],
        creatures: [goblin("hit", 0), goblin("near", 2), goblin("fighter", 3, { metalArmor: true }), goblin("flier", 1, { elevation: 10 }), goblin("dry", 9)],
        direct: ["hit"],
        dc: 21
    });
    assert.equal(others.length, 0);
    assert.equal(plan.key, "conduct");
    assert.equal(plan.conducted, true);
    assert.deepEqual(plan.targets, ["near", "fighter"]);
    assert.deepEqual(plan.damage, [{ amount: 5, type: "electricity" }]);
    assert.deepEqual(plan.check, { statistic: "reflex", basic: true, dc: 21 });
    assert.deepEqual(plan.penalties, { fighter: { value: -1, label: "Metal armor" } });
});

test("conduction stops at its reach, and doesn't fire with no one to hit or no damage", () => {
    const long = { id: "water", material: "water", squares: row(0, 0, 20) };
    const event = { contact: [squareKey(0, 0)], surfaces: [long], dc: 20 };
    const near = goblin("near", 6), far = goblin("far", 7);
    assert.deepEqual(surfacePlans({ ...event, elements: [{ element: "electricity", amount: 10 }], creatures: [near, far] })[0].targets, ["near"]);
    assert.deepEqual(surfacePlans({ ...event, elements: [{ element: "electricity", amount: 10 }], creatures: [far] }), []);
    assert.deepEqual(surfacePlans({ ...event, elements: [{ element: "electricity", amount: 0 }], creatures: [near] }), []);
    assert.deepEqual(surfacePlans({ ...event, elements: [{ element: "electricity", amount: 10 }], creatures: [near], settings: { conductReach: 10 } }), [], "the GM's reach");
});

test("fire lights all of a slick, whoever's there saves, and it stays Burning", () => {
    const slick = { id: "oil", material: "oil", squares: row(0, 0, 12) };
    const [plan] = surfacePlans({ elements: [{ element: "fire", amount: 4 }], contact: [squareKey(0, 0)], surfaces: [slick], creatures: [goblin("far", 12)], dc: 20, hazardFormula: "2d6" });
    assert.equal(plan.key, "ignite-oil");
    assert.equal(plan.to, "burning");
    assert.equal(plan.squares.length, 13);
    assert.deepEqual(plan.targets, ["far"]);
    assert.deepEqual(plan.damage, [{ formula: "2d6", type: "fire" }]);
    assert.equal(plan.degrees.failure.persistent, "1d6");
});

test("the ground's changes: boil, melt, douse, freeze, smother, disperse", () => {
    const on = (element, material) => surfacePlans({ elements: [{ element, amount: 0 }], contact: [squareKey(0, 0)], surfaces: [{ id: "s", material, squares: row(0, 0, 1) }], creatures: [goblin("in", 1)], dc: 18 })[0];
    assert.equal(on("fire", "water").to, "steam");
    assert.equal(on("fire", "ice").to, "water");
    assert.equal(on("fire", "plants").to, "burning");
    assert.equal(on("water", "burning").to, "water");
    assert.equal(on("cold", "burning").to, null);
    assert.equal(on("air", "steam").to, null);
    const freeze = on("cold", "water");
    assert.equal(freeze.to, "ice");
    assert.deepEqual(freeze.targets, ["in"]);
    assert.equal(freeze.degrees.failure.condition, "immobilized");
    assert.equal(on("electricity", "ice"), undefined, "ice doesn't conduct");
});

test("a creature: water soaks it, fire dries it, cold bites if it's wet", () => {
    const creature = (wet) => ({ id: "c", name: "Goblin", wet });
    assert.deepEqual(creaturePlans({ elements: [{ element: "water" }], creature: creature(false) })[0].add, ["wet"]);
    assert.deepEqual(creaturePlans({ elements: [{ element: "water" }], creature: creature(true) }), []);
    assert.deepEqual(creaturePlans({ elements: [{ element: "fire" }], creature: creature(true) })[0].remove, ["wet"]);
    assert.deepEqual(creaturePlans({ elements: [{ element: "fire" }], creature: creature(false) }), []);
    assert.equal(creaturePlans({ elements: [{ element: "cold" }], creature: creature(true), dc: 20 })[0].degrees.criticalFailure.condition, "immobilized");
    assert.deepEqual(creaturePlans({ elements: [{ element: "cold" }], creature: creature(false) }), []);
});

test("numbers: a basic save's share, and the DC by level", () => {
    assert.deepEqual(["criticalSuccess", "success", "failure", "criticalFailure"].map((degree) => shareOf(5, degree)), [0, 2, 5, 10]);
    assert.equal(levelDC(5), 20);
    assert.equal(levelDC(99), 50);
    assert.equal(levelDC(-1), 14);
});

test("a surface's rules: ice and plants from GM Core, oil as Grease, steam as Mist, water and metal nothing", () => {
    const ice = terrainRules("ice", { dc: 20 });
    assert.deepEqual(ice.costs, { walk: 2, climb: 2 });
    assert.deepEqual(ice.balance, { statistics: ["acrobatics"], dc: 20 });
    assert.ok(ice.effect.rules.some((rule) => rule.flag === "terrainOffGuard"));
    const plants = terrainRules("plants", { dc: 15 });
    assert.deepEqual(plants.costs, { walk: 2, climb: 2 });
    assert.equal(plants.balance, null);
    const oil = terrainRules("oil", { dc: 18 });
    assert.deepEqual(oil.costs, {});
    assert.deepEqual(oil.balance.statistics, ["reflex", "acrobatics"]);
    assert.match(oil.balance.note, /Steps or Crawls/);
    assert.match(terrainRules("steam").effect.rules[0].uuid, /DmAIPqOBomZ7H95W/);
    for (const material of ["water", "metal"]) {
        const rules = terrainRules(material);
        assert.deepEqual([rules.costs, rules.effect, rules.balance, rules.hazard], [{}, null, null, null]);
    }
});

test("Balance: a failure goes back to where the move began; a critical failure falls prone too", () => {
    const rules = terrainRules("ice", { dc: 20 });
    const plan = balancePlan(rules, { id: "t" }, "acrobatics", { x: 100, y: 200, elevation: 0 });
    assert.deepEqual(plan.targets, ["t"]);
    assert.deepEqual(plan.check, { statistic: "acrobatics", basic: false, dc: 20 });
    assert.deepEqual(plan.degrees.failure.returnTo, { x: 100, y: 200, elevation: 0 });
    assert.equal(plan.degrees.criticalFailure.condition, "prone");
    assert.equal(balancePlan(rules, { id: "t" }, "acrobatics").degrees.failure.returnTo, undefined, "no origin: nowhere to send it");
});

test("burning ground: the world's damage, and persistent fire", () => {
    const plan = hazardPlan(terrainRules("burning", { hazardFormula: "2d6" }), { id: "t", name: "Goblin" });
    assert.deepEqual(plan.damage, [{ formula: "2d6", type: "fire" }]);
    assert.equal(plan.check, null);
    assert.equal(plan.degrees.automatic.persistent, "1d6");
});

test("sure-footed on ice: no off-guard, and steady for no Balance", () => {
    const rules = terrainRules("ice", { dc: 20 });
    const ignored = { difficult: [{ environment: "arctic", feature: "ice" }], greater: [] };
    assert.equal(steady(rules, ignored), true);
    assert.equal(effectRulesFor(rules, ignored).length, 0);
    assert.equal(steady(rules, { difficult: [], greater: [] }), false);
    assert.equal(steady(terrainRules("oil"), ignored), false, "Grease has no feature to ignore");
});

test("a round: squares age, and fire, puddles and steam run out at their lives", () => {
    const lives = { water: 3, steam: 2, burning: 3 };
    const { ages, changes } = tickSurfaces([
        { material: "water", squares: ["0,0", "1,0"], ages: { "0,0": 2 } },
        { material: "steam", squares: ["5,5"], ages: { "5,5": 1 } },
        { material: "ice", squares: ["9,9"] }
    ], { lives });
    assert.deepEqual(ages.water, { "0,0": 3, "1,0": 1 });
    assert.deepEqual(changes.find((change) => change.material === "water"), { material: "water", to: null, keys: ["0,0"], words: "Water dries up (1 square)." });
    assert.deepEqual(changes.find((change) => change.material === "steam").keys, ["5,5"]);
    assert.equal(changes.some((change) => change.material === "ice"), false, "no life: it stays");
});

test("a round: a lasting square stays, and a life of 0 never runs out", () => {
    const { changes } = tickSurfaces([{ material: "water", squares: ["0,0", "1,0"], ages: { "0,0": 9, "1,0": 9 }, lasting: ["0,0"] }], { lives: { water: 3 } });
    assert.deepEqual(changes[0].keys, ["1,0"]);
    assert.deepEqual(tickSurfaces([{ material: "water", squares: ["0,0"], ages: { "0,0": 99 } }], { lives: { water: 0 } }).changes, []);
});

test("a round: fire catches on fuel beside it by the flat check, not on what's far or not fuel", () => {
    const surfaces = [
        { material: "burning", squares: ["0,0"], ages: {} },
        { material: "plants", squares: ["1,1", "5,5"] },
        { material: "water", squares: ["0,1"] }
    ];
    const lives = { burning: 9, water: 9 };
    const caught = tickSurfaces(surfaces, { lives, spreadDC: 11, d20: () => 11 }).changes;
    assert.deepEqual(caught, [{ material: "plants", to: "burning", keys: ["1,1"], words: "Fire spreads to plants (1 square)." }]);
    assert.deepEqual(tickSurfaces(surfaces, { lives, spreadDC: 11, d20: () => 10 }).changes, [], "the check failed");
});

test("a round's card: its changes, or none", () => {
    assert.equal(roundPlan([], 2), null);
    const plan = roundPlan([{ material: "water", to: null, keys: ["0,0"], words: "Water dries up (1 square)." }], 2);
    assert.equal(plan.title, "End of round 2: the ground changes");
    assert.deepEqual(plan.notes, ["Water dries up (1 square)."]);
});

test("Leave a puddle: on a soaked creature's squares unless it's aloft; on an area's bare squares", () => {
    const soak = (elevation) => creaturePlans({ elements: [{ element: "water" }], creature: { id: "c", name: "Goblin", wet: false, squares: ["3,3"], elevation } })[0];
    assert.deepEqual(soak(0).leave, ["3,3"]);
    assert.deepEqual(soak(10).leave, []);
    assert.deepEqual(puddlePlan("Spell", ["0,0", "1,0"], [{ squares: ["1,0"] }]).leave, ["0,0"]);
    assert.equal(puddlePlan("Spell", ["1,0"], [{ squares: ["1,0"] }]), null, "nothing bare");
});

test("a creature carries its traits and its persistent damage's types, and only elements", () => {
    assert.deepEqual(carriedElements({ traits: ["fire", "elemental"] }), [{ element: "fire", amount: 0 }]);
    assert.deepEqual(carriedElements({ traits: ["humanoid"], persistent: ["fire", "bleed"] }), [{ element: "fire", amount: 0 }]);
    assert.deepEqual(carriedElements({ traits: ["goblin"] }), []);
});

test("a move's squares: everything along it, wide tokens too, and nothing while aloft", () => {
    assert.deepEqual(pathSquares([{ x: 0, y: 0 }, { x: 300, y: 0 }], 100), ["0,0", "1,0", "2,0", "3,0"]);
    assert.deepEqual(pathSquares([{ x: 0, y: 0, width: 2, height: 1 }], 100), ["0,0", "1,0"]);
    assert.deepEqual(pathSquares([{ x: 0, y: 0, elevation: 10 }, { x: 300, y: 0, elevation: 10 }], 100), []);
});

test("a fire creature on grass: the squares it touches burn, the rest wait for the fire to spread, and bare ground is nothing", () => {
    const creature = { id: "fire", squares: ["0,0"], elevation: 0 };
    const grass = { id: "g", material: "plants", squares: ["0,0", "1,0", "2,0", "3,0"] };
    const event = { creature, elements: [{ element: "fire", amount: 0 }], surfaces: [grass], creatures: [creature], dc: 20, hazardFormula: "2d6" };
    const [plan, ...others] = trailPlans({ ...event, contact: ["0,0", "1,0"] });
    assert.equal(others.length, 0);
    assert.deepEqual(plan.squares, ["0,0", "1,0"]);
    assert.equal(plan.to, "burning");
    assert.equal(needsCard(plan), false, "no one rolls: it just happens");
    assert.equal(needsCard(plan, true), true, "unless the GM asked");
    assert.deepEqual(trailPlans({ ...event, contact: ["9,9"] }), [], "bare ground");
});

test("a fire creature on oil: all of it goes up, others save, and it doesn't save against itself", () => {
    const creature = { id: "fire", squares: ["0,0"], elevation: 0 };
    const other = { id: "other", squares: ["3,0"], elevation: 0 };
    const [plan] = trailPlans({ creature, elements: [{ element: "fire", amount: 0 }], contact: ["0,0"], surfaces: [{ id: "o", material: "oil", squares: ["0,0", "1,0", "2,0", "3,0"] }], creatures: [creature, other], dc: 20, hazardFormula: "2d6" });
    assert.equal(plan.squares.length, 4);
    assert.deepEqual(plan.targets, ["other"]);
    assert.equal(needsCard(plan), true);
});

test("fixed water conducts but doesn't boil; the environment module's terrain maps to materials", () => {
    const lake = { id: "l", material: "water", squares: ["0,0", "1,0"], fixed: true };
    const swimmer = { id: "s", squares: ["1,0"], elevation: 0 };
    assert.deepEqual(surfacePlans({ elements: [{ element: "fire", amount: 5 }], contact: ["0,0"], surfaces: [lake], creatures: [swimmer], dc: 20 }), []);
    assert.deepEqual(surfacePlans({ elements: [{ element: "electricity", amount: 10 }], contact: ["0,0"], surfaces: [lake], creatures: [swimmer], dc: 20 })[0].targets, ["s"]);
    assert.deepEqual(environmentMaterial("water"), { material: "water", fixed: true });
    assert.deepEqual(environmentMaterial("undergrowth-heavy"), { material: "thicket" });
    assert.equal(environmentMaterial("cliff"), null);
});

test("rain: fires go out unless they're lasting, and none spread", () => {
    const surfaces = [{ material: "burning", squares: ["0,0", "5,5"], ages: {}, lasting: ["5,5"] }, { material: "plants", squares: ["1,0"] }];
    const { changes } = tickSurfaces(surfaces, { lives: { burning: 9 }, d20: () => 20, rain: true });
    assert.deepEqual(changes, [{ material: "burning", to: null, keys: ["0,0"], words: "The rain puts out the fire (1 square)." }]);
});

test("new elements: words and aliases", () => {
    assert.deepEqual(elementsFrom({ traits: ["plant", "shadow", "death", "goblin"] }).map(({ element }) => element), ["wood", "darkness", "void"]);
    assert.deepEqual(elementsFrom({ damage: [{ type: "acid", total: 6 }] }), [{ element: "acid", amount: 6 }]);
});

test("the chart's reactions change the ground as written", () => {
    const on = (element, material) => surfacePlans({ elements: [{ element, amount: 0 }], contact: [squareKey(0, 0)], surfaces: [{ id: "s", material, squares: [squareKey(0, 0)] }], creatures: [], dc: 18 })[0]?.to;
    const table = [["earth", "water", "mud"], ["earth", "burning", null], ["earth", "ice", "rubble"], ["air", "burning", null], ["air", "mud", null], ["wood", "water", "plants"], ["wood", "mud", "plants"], ["water", "plants", "thicket"], ["cold", "thicket", "plants"], ["cold", "plants", null], ["poison", "thicket", "plants"], ["poison", "plants", null], ["metal", "ice", null], ["sonic", "ice", null], ["acid", "metal", null], ["light", "darkness", null], ["darkness", "light", null], ["light", "death", null], ["vitality", "death", null], ["void", "life", null], ["darkness", "life", null], ["fire", "thicket", "burning"]];
    for (const [element, material, to] of table) assert.equal(on(element, material), to, `${element} on ${material}`);
    assert.equal(on("sonic", "water"), undefined, "no row, chart off");
});

test("the chart fallback: off unless asked, written rows win, only what's weak gives way", () => {
    const event = (element, material, extra = {}) => ({ elements: [{ element, amount: 0 }], contact: [squareKey(0, 0)], surfaces: [{ id: "s", material, squares: [squareKey(0, 0), squareKey(1, 0)] }], creatures: [], dc: 18, ...extra });
    const on = { settings: { matchups: true } };
    assert.deepEqual(surfacePlans(event("fire", "metal")), [], "off by default");
    const [plan] = surfacePlans(event("fire", "metal", on));
    assert.equal(plan.to, null);
    assert.deepEqual(plan.squares, [squareKey(0, 0)]);
    assert.equal(surfacePlans(event("electricity", "metal", on)).length, 0, "a written row, with nothing to conduct to, isn't replaced");
    assert.equal(surfacePlans(event("water", "metal", on)).length, 0, "metal isn't weak to water");
    assert.equal(surfacePlans(event("fire", "metal", { ...on, surfaces: [{ id: "s", material: "metal", squares: [squareKey(0, 0)], fixed: true }] })).length, 0, "fixed ground stays");
});

test("new surfaces' rules", () => {
    assert.deepEqual(terrainRules("mud").costs, { walk: 2, climb: 2 });
    assert.deepEqual(terrainRules("rubble").costs, { walk: 2, climb: 2 });
    assert.deepEqual(terrainRules("thicket").costs, { walk: 3, climb: 3 });
    assert.match(terrainRules("darkness").effect.rules[0].uuid, /DmAIPqOBomZ7H95W/);
    assert.deepEqual(terrainRules("life").effect.rules, [{ key: "FastHealing", value: 1 }]);
    const death = hazardPlan(terrainRules("death", { hazardFormula: "2d6" }), { id: "t", name: "Goblin" });
    assert.equal(death.title, "Goblin withers on the deathly ground");
    assert.deepEqual(death.damage, [{ formula: "2d6", type: "void" }]);
    assert.deepEqual(death.degrees, {});
    assert.equal(terrainRules("light").effect, null);
});

test("weakness to the ground: a puddle hurts what's weak to water, the highest once, and only where it touched", () => {
    const creature = { id: "c", name: "Goblin" };
    const surfaces = [{ material: "water", squares: ["0,0"] }, { material: "mud", squares: ["1,0"] }, { material: "burning", squares: ["2,0"] }];
    const plan = weaknessPlan({ creature, weaknesses: [{ type: "water", value: 5 }, { type: "earth", value: 8 }], contact: ["0,0", "1,0"], surfaces });
    assert.deepEqual(plan.damage, [{ amount: 8, type: "untyped" }]);
    assert.equal(plan.title, "Goblin is hurt by the mud");
    assert.deepEqual(plan.targets, ["c"]);
    assert.equal(plan.check, null);
    assert.equal(weaknessPlan({ creature, weaknesses: [{ type: "water", value: 5 }], contact: ["9,9"], surfaces }), null, "not on it");
    assert.equal(weaknessPlan({ creature, weaknesses: [{ type: "fire", value: 5 }], contact: ["2,0"], surfaces }), null, "fire damage does that itself");
    assert.equal(weaknessPlan({ creature, weaknesses: [{ type: "cold", value: 3 }], contact: ["0,0"], surfaces }), null, "water isn't cold");
});

test("rain's puddles: on bare squares, up to the count", () => {
    assert.deepEqual(rainPuddles(["a", "b", "c"], 2, () => 0), { material: null, to: "water", keys: ["a", "b"], words: "The rain leaves puddles (2 squares)." });
    assert.deepEqual(rainPuddles(["a"], 3).keys, ["a"]);
    assert.equal(rainPuddles(["a"], 0), null);
    assert.equal(rainPuddles([], 3), null);
});

test("the sky: a walled square isn't reachable from the edge, and a gap lets it in", () => {
    const squares = [];
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) squares.push(squareKey(x, y));
    const isEdge = (key) => /^(0|4),|,(0|4)$/.test(key);
    const room = (a, b) => [a, b].includes("2,2");
    assert.equal(openSquares(squares, room, isEdge).has("2,2"), false);
    assert.equal(openSquares(squares, room, isEdge).size, 24);
    const gap = (a, b) => room(a, b) && !(a === "2,1" || b === "2,1");
    assert.equal(openSquares(squares, gap, isEdge).has("2,2"), true);
    assert.equal(openSquares(squares, () => false, isEdge).size, 25);
});

test("rain by square: fires under the sky go out, indoor ones burn on and can still spread", () => {
    const surfaces = [{ material: "burning", squares: ["0,0", "5,5"], ages: { "0,0": 9, "5,5": 9 } }, { material: "plants", squares: ["1,0", "6,5"] }];
    const { changes } = tickSurfaces(surfaces, { lives: { burning: 3 }, d20: () => 20, rain: new Set(["0,0", "1,0"]) });
    assert.deepEqual(changes.find((change) => change.words.startsWith("The rain")).keys, ["0,0"]);
    assert.deepEqual(changes.find((change) => change.words.startsWith("Fire burns")).keys, ["5,5"]);
    assert.deepEqual(changes.find((change) => change.to === "burning").keys, ["6,5"]);
});

test("Grease on those standing there: the better save, or prone", () => {
    const plan = greasePlan(terrainRules("oil", { dc: 19 }), { id: "t", name: "Goblin" }, "acrobatics");
    assert.deepEqual(plan.check, { statistic: "acrobatics", basic: false, dc: 19 });
    assert.equal(plan.degrees.failure.condition, "prone");
    assert.equal(plan.degrees.criticalFailure.condition, "prone");
    assert.deepEqual(plan.targets, ["t"]);
});

test("every script loads", async () => {
    globalThis.foundry = { applications: { api: {} } };
    globalThis.Hooks = { once() {}, on() {} };
    globalThis.game = {};
    globalThis.CONST = {};
    await import("../scripts/main.js");
});
