import test from "node:test";
import assert from "node:assert/strict";

import { bodyFrom, openSquares, squareKey, touches, nextTo } from "../src/surfaces.js";
import { OBJECTS, burstFormula, burstPlan, goesOff, objectInfo, objectsOf, setOff } from "../src/objects.js";
import { STARTING_GROUND, STORMS, madnessPlan, pickWarnings, scatterPlan, stormInfo, strikePlan, swarmPlan, windPlan } from "../src/storms.js";
import { fieldEffect, nextField } from "../src/fields.js";
import { creaturePlans, elementsFrom, leavePlan, levelDC, shareOf, surfacePlans } from "../src/reactions.js";
import { carriedElements, enteredSquares, needsCard, pathSquares, trailPlans, weaknessPlan } from "../src/carry.js";
import { environmentMaterial } from "../src/surfaces.js";
import { rainPuddles, roundPlan, tickSurfaces } from "../src/ticks.js";
import { surfaceInfo } from "../src/hover.js";
import { balancePlan, effectRulesFor, greasePlan, groundHealing, hazardAmount, hazardPlan, steady, terrainRules } from "../src/terrain.js";

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
    const on = (element, material) => surfacePlans({ elements: [{ element, amount: 0 }], contact: [squareKey(0, 0)], surfaces: [{ id: "s", material, squares: row(0, 0, 1) }], creatures: [goblin("in", 0), goblin("next", 1)], dc: 18 })[0];
    assert.equal(on("fire", "water").to, "steam");
    assert.equal(on("fire", "ice").to, "water");
    assert.equal(on("fire", "plants").to, "burning");
    assert.equal(on("water", "burning").to, "water");
    assert.equal(on("cold", "burning").to, null);
    assert.equal(on("air", "steam").to, null);
    const freeze = on("cold", "water");
    assert.equal(freeze.to, "ice");
    assert.deepEqual(freeze.targets, ["in"]);
    assert.equal(freeze.degrees.failure.condition, "icebound");
    assert.equal(freeze.degrees.criticalFailure.condition, "icebound");
    assert.equal(on("electricity", "ice"), undefined, "ice doesn't conduct");
});

test("a creature: water soaks it, fire dries it, cold bites if it's wet", () => {
    const creature = (wet) => ({ id: "c", name: "Goblin", wet });
    assert.deepEqual(creaturePlans({ elements: [{ element: "water" }], creature: creature(false) })[0].add, ["wet"]);
    assert.deepEqual(creaturePlans({ elements: [{ element: "water" }], creature: creature(true) }), []);
    assert.deepEqual(creaturePlans({ elements: [{ element: "fire" }], creature: creature(true) })[0].remove, ["wet"]);
    assert.deepEqual(creaturePlans({ elements: [{ element: "fire" }], creature: creature(false) }), []);
    assert.deepEqual(creaturePlans({ elements: [{ element: "cold" }], creature: creature(true), dc: 20 })[0].degrees.criticalFailure.stack, { key: "frozen", by: 4 });
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

test("burning ground: its damage, and persistent fire", () => {
    const plan = hazardPlan(terrainRules("burning"), { id: "t", name: "Goblin" });
    assert.deepEqual(plan.damage, [{ formula: "1", type: "fire" }]);
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
    assert.deepEqual(leavePlan("Spell", "water", ["0,0", "1,0"], [{ squares: ["1,0"] }]).leave, ["0,0"]);
    assert.equal(leavePlan("Spell", "water", ["1,0"], [{ squares: ["1,0"] }]), null, "nothing bare");
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
    assert.deepEqual(changes.find((change) => change.material === "burning"), { material: "burning", to: null, keys: ["0,0"], words: "The rain puts out the fire (1 square)." });
    assert.equal(changes.some((change) => change.to === "burning"), false, "none spread");
});

test("new elements: words and aliases", () => {
    assert.deepEqual(elementsFrom({ traits: ["plant", "shadow", "death", "goblin"] }).map(({ element }) => element), ["wood", "darkness", "void"]);
    assert.deepEqual(elementsFrom({ damage: [{ type: "acid", total: 6 }] }), [{ element: "acid", amount: 6 }]);
});

test("the chart's reactions change the ground as written", () => {
    const on = (element, material) => surfacePlans({ elements: [{ element, amount: 0 }], contact: [squareKey(0, 0)], surfaces: [{ id: "s", material, squares: [squareKey(0, 0)] }], creatures: [], dc: 18 })[0]?.to;
    const table = [["earth", "water", "mud"], ["earth", "burning", null], ["earth", "ice", "rubble"], ["air", "mud", null], ["wood", "water", "plants"], ["water", "plants", "thicket"], ["cold", "thicket", "plants"], ["cold", "plants", null], ["poison", "thicket", "plants"], ["poison", "plants", null], ["metal", "ice", null], ["sonic", "ice", null], ["acid", "metal", null], ["light", "darkness", null], ["darkness", "light", null], ["light", "death", null], ["vitality", "death", null], ["void", "life", null], ["darkness", "life", null], ["fire", "thicket", "burning"]];
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
    assert.equal(terrainRules("life").effect, null);
    assert.equal(groundHealing("life", 9), 1);
    const death = hazardPlan(terrainRules("death"), { id: "t", name: "Goblin" });
    assert.equal(death.title, "Goblin withers on the deathly ground");
    assert.deepEqual(death.damage, [{ formula: "1d2", type: "void" }]);
    assert.deepEqual(death.degrees, {});
    assert.equal(terrainRules("light").effect.rules[0].key, "Note");
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

test("oil: fire turns every stack into persistent fire; water washes it off", () => {
    const creature = { id: "c", name: "Goblin", oil: 3 };
    const [ignite] = creaturePlans({ elements: [{ element: "fire" }], creature });
    assert.equal(ignite.key, "ignite");
    assert.equal(ignite.degrees.automatic.persistent, "3d6");
    assert.deepEqual(ignite.remove, ["oil"]);
    assert.deepEqual(creaturePlans({ elements: [{ element: "water" }], creature }).find((plan) => plan.key === "wash").remove, ["oil"]);
    assert.deepEqual(creaturePlans({ elements: [{ element: "fire" }], creature: { id: "c", name: "Goblin" } }), []);
});

test("stronger combos: lightning doubles on the wet and shocks those who fail; fire thaws; light limns", () => {
    const wet = { id: "w", squares: ["1,0"], elevation: 0, wet: true };
    const dry = { id: "d", squares: ["2,0"], elevation: 0 };
    const [plan] = surfacePlans({ elements: [{ element: "electricity", amount: 10 }], contact: ["0,0"], surfaces: [{ material: "water", squares: ["0,0", "1,0", "2,0"] }], creatures: [wet, dry], dc: 20 });
    assert.deepEqual(plan.doubled, ["w"]);
    assert.equal(plan.degrees.failure.condition, "shocked");
    assert.deepEqual(creaturePlans({ elements: [{ element: "fire" }], creature: { id: "c", name: "G", frozen: 3 } })[0].remove, ["frozen"]);
    assert.deepEqual(creaturePlans({ elements: [{ element: "light" }], creature: { id: "c", name: "G" } })[0].add, ["limned"]);
    assert.deepEqual(creaturePlans({ elements: [{ element: "electricity" }], creature: { id: "c", name: "G", wet: true } })[0].add, ["shocked"]);
});

test("new ground and clouds react as written", () => {
    const on = (element, material) => surfacePlans({ elements: [{ element, amount: 0 }], contact: ["0,0"], surfaces: [{ material, squares: ["0,0"] }], creatures: [], dc: 18 })[0]?.to;
    const table = [["electricity", "sand", "glass"], ["fire", "sand", "glass"], ["fire", "snow", "water"], ["water", "lava", "rubble"], ["water", "acid", "water"], ["vitality", "plants", "flowers"], ["fire", "grass", "burning"], ["fire", "bramble", "burning"], ["fire", "gale", "embers"], ["water", "embers", "steam"], ["vitality", "miasma", null], ["light", "miasma", null], ["fire", "toxic", "embers"], ["cold", "gale", "frostfog"], ["air", "sand", "dust"]];
    for (const [element, material, to] of table) assert.equal(on(element, material), to, `${element} on ${material}`);
});

test("a cloud: air moves it away from the source; with no source it scatters", () => {
    const cloud = { material: "embers", squares: ["5,0", "6,0"] };
    const [moved] = surfacePlans({ elements: [{ element: "air", amount: 0 }], contact: ["5,0"], surfaces: [cloud], creatures: [], source: { x: 0, y: 0 } });
    assert.deepEqual(moved.changes[0], { material: "embers", to: null, keys: ["5,0", "6,0"], words: "" });
    assert.deepEqual(moved.changes[1].keys, ["7,0", "8,0"]);
    assert.equal(surfacePlans({ elements: [{ element: "air", amount: 0 }], contact: ["5,0"], surfaces: [cloud], creatures: [] })[0].to, null);
});

test("wind drifts clouds, cold freezes water under the sky, a firestorm's fires last", () => {
    const { changes } = tickSurfaces([{ material: "toxic", squares: ["1,1"], ages: {} }, { material: "water", squares: ["2,2", "3,3"], ages: {} }], { lives: {}, wind: { dx: 1, dy: 0 }, freezing: new Set(["2,2"]) });
    assert.deepEqual(changes.find((change) => change.to === "toxic").keys, ["2,1"]);
    assert.deepEqual(changes.find((change) => change.to === "ice").keys, ["2,2"]);
    assert.deepEqual(tickSurfaces([{ material: "burning", squares: ["0,0"], ages: { "0,0": 9 } }], { lives: { burning: 3 }, fireLasts: true }).changes, []);
});

test("harvest: wood on plants bursts only what it touched, and a creature walking by doesn't", () => {
    const plants = { material: "plants", squares: ["0,0", "1,0"] };
    const other = { id: "o", squares: ["0,0"], elevation: 0 };
    const [plan] = surfacePlans({ elements: [{ element: "wood", amount: 0 }], contact: ["0,0"], surfaces: [plants], creatures: [other], dc: 20, hazardFormula: "2d6" });
    assert.equal(plan.key, "harvest");
    assert.deepEqual(plan.squares, ["0,0"]);
    assert.deepEqual(plan.damage, [{ formula: "2d6", type: "piercing" }]);
    assert.deepEqual(plan.targets, ["o"]);
    assert.deepEqual(trailPlans({ creature: { id: "t", squares: ["0,0"] }, elements: [{ element: "wood", amount: 0 }], contact: ["0,0"], surfaces: [plants], creatures: [] }), []);
});

test("leaving a surface: every element's own, Sow for wood", () => {
    assert.equal(leavePlan("Spell", "wood", ["0,0"], []).title, "Spell: Sow");
    assert.equal(leavePlan("Spell", "wood", ["0,0"], []).leaveMaterial, "plants");
    assert.equal(leavePlan("Spell", "void", ["0,0"], []).leaveMaterial, "miasma");
    assert.equal(leavePlan("Spell", "electricity", ["0,0"], []), null);
});

test("objects: a barrel and a natural one for each element, set off by what they should be", () => {
    const elements = new Set(Object.values(OBJECTS).map((object) => object.element));
    assert.equal(elements.size, 15);
    assert.equal(objectsOf(true).length, 15);
    assert.equal(objectsOf(false).length, 15);
    const barrel = OBJECTS["fire-barrel"];
    assert.equal(setOff(barrel, [{ element: "fire" }]), true);
    assert.equal(setOff(barrel, [{ element: "water" }]), false);
    const plan = burstPlan(barrel, "b", ["5,5"], [{ id: "near", squares: ["6,5"], elevation: 0 }, { id: "far", squares: ["20,5"], elevation: 0 }, { id: "b", squares: ["5,5"], elevation: 0 }], { dc: 20, formula: "2d6" });
    assert.deepEqual(plan.targets, ["near"]);
    assert.equal(plan.to, "burning");
    assert.equal(plan.burst.tokenId, "b");
});

test("objects: tough against the wrong element, and the right one always sets them off", () => {
    const barrel = OBJECTS["fire-barrel"];
    assert.equal(barrel.hardness, 5);
    assert.equal(OBJECTS["earth-natural"].hardness, 10);
    assert.equal(goesOff(barrel, [{ element: "fire", amount: 1 }], 20), true, "1 fire damage, Hardness took it all");
    assert.equal(goesOff(barrel, [], 15), false, "a sword that hasn't broken it");
    assert.equal(goesOff(barrel, [], 0), true, "a sword that has");
});

test("storms: warnings come from the sky's squares, and a strike hits around its mark", () => {
    assert.deepEqual(pickWarnings(["a", "b", "c"], 2), ["a", "b"]);
    const plan = strikePlan(STORMS.meteors, "5,5", [{ id: "in", squares: ["6,5"], elevation: 0 }, { id: "out", squares: ["9,5"], elevation: 0 }], { dc: 20, amount: 9 });
    assert.deepEqual(plan.targets, ["in"]);
    assert.deepEqual(plan.damage, [{ amount: 9, type: "fire" }]);
    assert.equal(plan.to, "burning");
    assert.equal(strikePlan(STORMS.lightning, "5,5", [], { dc: 20, amount: 9 }).to, undefined);
});

test("fields: a boost and resistance by level, and a cycle", () => {
    const fire = fieldEffect("fire");
    assert.deepEqual(fire.rules[0].predicate, ["item:trait:fire"]);
    assert.equal(fire.rules[1].key, "Resistance");
    assert.deepEqual(fire.rules.filter((rule) => rule.key === "Weakness").map((rule) => rule.type).sort(), ["earth", "water"], "the chart's answers to fire");
    assert.ok(fieldEffect("water").rules.some((rule) => rule.key === "Resistance" && rule.type === "water"));
    assert.equal(fieldEffect("darkness").rules.some((rule) => rule.key === "Resistance"), false, "PF2e has no darkness type");
    assert.deepEqual(fieldEffect("vitality").rules.filter((rule) => rule.key === "Weakness").map((rule) => rule.type).sort(), ["void"], "darkness has no type, so only void");
    assert.deepEqual(fieldEffect("neutral").rules.map((rule) => rule.key), ["Note"]);
    assert.equal(nextField(["fire", "cold"], "fire"), "cold");
    assert.equal(nextField(["fire", "cold"], "cold"), "fire");
});

test("a move: only the squares entered count, each one a hit", () => {
    const path = pathSquares([{ x: 0, y: 0 }, { x: 300, y: 0 }], 100);
    assert.deepEqual(enteredSquares(path, ["0,0"]), ["1,0", "2,0", "3,0"]);
    const plan = hazardPlan(terrainRules("burning"), { id: "t", name: "Goblin" }, 3);
    assert.deepEqual(plan.damage, [{ formula: "3", type: "fire" }]);
    assert.deepEqual(hazardPlan(terrainRules("glass"), { id: "t", name: "Goblin" }, 5).damage, [{ formula: "5d2", type: "piercing" }]);
    assert.deepEqual(hazardPlan(terrainRules("bramble"), { id: "t", name: "Goblin" }, 2).damage, [{ formula: "6d6", type: "piercing" }]);
    assert.deepEqual(hazardPlan(terrainRules("lava"), { id: "t", name: "Goblin" }, 2).damage, [{ formula: "6d6", type: "fire" }]);
    assert.match(plan.title, /3 squares/);
    assert.equal(plan.degrees.automatic.persistent, "1d6", "persistent fire doesn't multiply");
    const weak = weaknessPlan({ creature: { id: "c", name: "G" }, weaknesses: [{ type: "water", value: 5 }], contact: ["0,0", "1,0"], surfaces: [{ material: "water", squares: ["0,0", "1,0"] }], perSquare: true });
    assert.deepEqual(weak.damage, [{ amount: 10, type: "untyped" }]);
    assert.deepEqual(pathSquares([{ x: 0, y: 0, elevation: 10 }, { x: 100, y: 0, elevation: 10 }], 100, { aloft: true }), ["0,0", "1,0"]);
});

test("every script loads", async () => {
    globalThis.foundry = { applications: { api: {} } };
    globalThis.Hooks = { once() {}, on() {} };
    globalThis.game = {};
    globalThis.CONST = {};
    await import("../scripts/main.js");
});

test("a hazard's card: weakness and resistance count for each square, by damage type or trait", () => {
    const hazard = (material, squares) => hazardPlan(terrainRules(material), { id: "t", name: "Goblin" }, squares).hazard;
    assert.deepEqual(hazard("bramble", 2), { hits: 2, type: "piercing", traits: ["plant", "wood"] });
    assert.deepEqual(hazard("acid", 5).traits, ["poison"]);
    assert.deepEqual(hazard("glass", 5).traits, ["earth"]);
    // (PF2e adds the damage type's weakness once and takes off its resistance once, after this.)
    assert.equal(hazardAmount(5, hazard("burning", 5), { weaknesses: [{ type: "fire", value: 3 }] }), 17, "5 + 3 five times, less PF2e's 3");
    assert.equal(hazardAmount(21, hazard("bramble", 2), { weaknesses: [{ type: "wood", value: 4 }] }), 29, "by its trait, which PF2e doesn't see");
    assert.equal(hazardAmount(21, hazard("bramble", 2), { resistances: [{ type: "wood", value: 3 }] }), 15);
    assert.equal(hazardAmount(21, hazard("bramble", 2), { resistances: [{ type: "piercing", value: 3 }] }), 18, "21 less 3 twice, plus PF2e's 3 to take off");
    assert.equal(hazardAmount(7, hazard("acid", 5), { resistances: [{ type: "poison", value: 2 }] }), 0, "no hit gets through");
    assert.equal(hazardAmount(21, hazard("bramble", 2), { weaknesses: [{ type: "wood", value: 4 }, { type: "piercing", value: 2 }] }), 27, "the highest, and PF2e adds its 2");
    assert.equal(hazardAmount(21, hazard("bramble", 2)), 21);
});

test("ground that deals damage doesn't get a second card for its traits", () => {
    const creature = { id: "c", name: "Goblin" };
    const surfaces = [{ material: "bramble", squares: ["0,0"] }, { material: "frostfog", squares: ["1,0"] }];
    assert.equal(weaknessPlan({ creature, weaknesses: [{ type: "wood", value: 5 }, { type: "water", value: 5 }], contact: ["0,0", "1,0"], surfaces }), null);
});

test("what beats the new traits clears the ground", () => {
    const first = (element, material) => surfacePlans({ elements: [{ element, amount: 5 }], contact: ["0,0"], surfaces: [{ id: "s", material, squares: ["0,0"] }], creatures: [], dc: 20 })[0];
    for (const [element, material] of [["void", "acid"], ["air", "bramble"], ["poison", "bramble"], ["air", "glass"], ["wood", "glass"]]) assert.equal(first(element, material).to, null, `${element} on ${material}`);
});

test("hover info: a surface's rules, its traits and what elements do to it", () => {
    const brambles = surfaceInfo("bramble");
    assert.equal(brambles.title, "Brambles");
    assert.equal(brambles.lines[0], "3d6 piercing for each square entered.");
    assert.deepEqual(brambles.traits, ["plant", "wood"]);
    assert.ok(brambles.reactions.includes("Fire: burning"));
    assert.ok(brambles.reactions.includes("Air: clears it"));
    assert.equal(surfaceInfo("lava").lines[0], "3d6 fire for each square entered and at each turn's start, and 2d6 persistent fire.");
    assert.deepEqual(surfaceInfo("metal").lines, ["Nothing until an element touches it."]);
    assert.deepEqual(surfaceInfo("water", { fixed: true }).reactions, ["Electricity: conducts"]);
    assert.ok(surfaceInfo("water").reactions.includes("Cold: ice"));
});

test("an element changes only the squares it touches; lightning and lit oil still spread", () => {
    const line = (material) => [{ id: "s", material, squares: ["0,0", "1,0", "2,0"] }];
    const aimed = (element, material, creatures = []) => surfacePlans({ elements: [{ element, amount: 10 }], contact: ["1,0"], surfaces: line(material), creatures, dc: 20, hazardFormula: "2d6" });
    assert.deepEqual(aimed("fire", "plants")[0].squares, ["1,0"]);
    assert.deepEqual(aimed("cold", "water")[0].squares, ["1,0"]);
    assert.equal(aimed("fire", "oil")[0].squares.length, 3, "lit oil goes up all at once");
    const other = { id: "o", squares: ["2,0"], elevation: 0 };
    assert.deepEqual(aimed("electricity", "water", [other])[0].targets, ["o"], "lightning runs through it");
    assert.equal(surfacePlans({ elements: [{ element: "fire", amount: 10 }], contact: ["0,0", "1,0"], surfaces: line("plants"), dc: 20 })[0].squares.length, 2, "an area only takes what it covers");
});

test("an object's burst scales with its level", () => {
    assert.equal(burstFormula(1), "1d6");
    assert.equal(burstFormula(5), "4d6");
    assert.equal(burstFormula(20), "23d6");
    assert.equal(burstFormula(0), "1d6");
    assert.equal(burstFormula(25), "23d6");
    assert.match(objectInfo(OBJECTS["fire-barrel"], 5).lines[0], /At level 5: 4d6 fire in 15 feet, basic Reflex\. It leaves burning\./);
    assert.match(stormInfo(STORMS.lightning, "4d6").lines[0], /4d6 electricity in 5 feet/);
});

test("weather counts as its element on what's under it, except what's fixed", () => {
    const material = (name, keys, extra = {}) => ({ material: name, squares: keys, ages: {}, ...extra });
    const change = (changes, name) => changes.find((each) => each.material === name);
    const rained = tickSurfaces([material("plants", ["0,0", "1,0"]), material("sand", ["2,0"]), material("lava", ["3,0"], { fixed: true })], { lives: {}, rain: new Set(["0,0", "2,0", "3,0"]) }).changes;
    assert.deepEqual([change(rained, "plants").to, change(rained, "plants").keys], ["thicket", ["0,0"]]);
    assert.equal(change(rained, "plants").words, "The plants grow into a thicket (1 square).");
    assert.equal(change(rained, "sand").to, "mud");
    assert.equal(change(rained, "lava"), undefined);
    const cold = tickSurfaces([material("plants", ["0,0"]), material("water", ["1,0"])], { lives: {}, freezing: new Set(["0,0", "1,0"]) }).changes;
    assert.equal(change(cold, "plants").to, null);
    assert.deepEqual(cold.filter((each) => each.material === "water").map((each) => each.to), ["ice"], "water freezes once");
    assert.deepEqual(tickSurfaces([material("plants", ["0,0"])], { lives: {} }).changes, [], "no weather");
});

test("man-made ground: what each does and what elements do to it", () => {
    const on = (element, material) => surfacePlans({ elements: [{ element, amount: 5 }], contact: ["0,0"], surfaces: [{ id: "s", material, squares: ["0,0"] }], creatures: [], dc: 20 })[0];
    assert.equal(on("fire", "woodfloor").to, "burning");
    assert.equal(on("fire", "straw").to, "burning");
    assert.equal(on("air", "straw").to, null);
    assert.equal(on("fire", "stone"), undefined, "stone doesn't burn");
    assert.equal(on("sonic", "stone").to, "rubble");
    assert.equal(on("fire", "sewage").to, "toxic");
    assert.equal(on("water", "coals").to, "rubble");
    assert.equal(on("air", "coals").to, "burning");
    assert.deepEqual(hazardPlan(terrainRules("sewage"), { id: "t", name: "Goblin" }, 2).damage, [{ formula: "2d2", type: "poison" }]);
    assert.equal(terrainRules("sewage").feature, "bog-shallow");
    assert.deepEqual(terrainRules("woodfloor").hazard, null);
    assert.deepEqual(surfaceInfo("stone").traits, ["earth"]);
    const fire = { material: "burning", squares: ["0,0"], ages: {} };
    const spread = (material, roll) => tickSurfaces([fire, { material, squares: ["1,0"], ages: {} }], { lives: {}, spreadDC: 11, d20: () => roll }).changes.some((change) => change.to === "burning");
    assert.equal(spread("straw", 6), true, "straw catches easily");
    assert.equal(spread("woodfloor", 6), false);
    assert.equal(spread("woodfloor", 11), true);
});

test("furniture: difficult terrain of its material", () => {
    const on = (element, material) => surfacePlans({ elements: [{ element, amount: 5 }], contact: ["0,0"], surfaces: [{ id: "s", material, squares: ["0,0"] }], creatures: [{ id: "o", squares: ["0,0"], elevation: 0 }], dc: 20 })[0];
    for (const material of ["woodfurniture", "stonefurniture", "metalfurniture"]) assert.deepEqual(terrainRules(material).costs, { walk: 2 });
    assert.equal(on("fire", "woodfurniture").to, "burning");
    assert.equal(on("fire", "stonefurniture"), undefined);
    assert.equal(on("sonic", "stonefurniture").title, "The stone furniture breaks up into rubble");
    assert.equal(on("electricity", "metalfurniture").conducted, true);
    assert.equal(on("acid", "metalfurniture").to, null);
    assert.deepEqual(surfaceInfo("woodfurniture").traits, ["wood"]);
});

test("the new weather", () => {
    const creatures = [{ id: "a", name: "A", squares: ["5,5"], elevation: 0 }, { id: "b", name: "B", squares: ["9,9"], elevation: 0 }];
    const flare = strikePlan(STORMS.solarflare, "5,5", creatures, { dc: 20, amount: 9 });
    assert.deepEqual(flare.targets, ["a"]);
    assert.equal(flare.degrees.failure.condition, "dazzled");
    assert.equal(strikePlan(STORMS.reckoning, "5,5", creatures, { dc: 20, amount: 9 }).damage[0].type, "spirit");
    assert.equal(strikePlan(STORMS.solarflare, "7,7", creatures, { dc: 20, amount: 9 }).targets.length, 2, "15 feet");
    const gust = windPlan(STORMS.gusts, creatures, { pick: () => 2 });
    assert.equal(gust.title, "Gusts: the wind blows east");
    assert.deepEqual(gust.degrees.automatic.push, { feet: 5, dx: 1, dy: 0, reason: "Gusts" });
    const hurricane = windPlan(STORMS.hurricane, creatures, { dc: 20, pick: () => 0 });
    assert.equal(hurricane.check.statistic, "fortitude");
    assert.equal(hurricane.degrees.failure.push.feet, 30);
    assert.equal(hurricane.degrees.criticalFailure.condition, "prone");
    assert.equal(hurricane.degrees.criticalSuccess, undefined);
    assert.deepEqual(swarmPlan(creatures[0], 9).damage, [{ formula: "3d4", type: "piercing" }]);
    assert.equal(swarmPlan(creatures[0], 9).degrees.automatic.persistent, "1d4");
    assert.equal(madnessPlan(creatures, 20).degrees.failure.condition, "maddened");
    const holy = fieldEffect("holy");
    assert.equal(holy.rules.some((rule) => rule.key === "FastHealing"), false);
    assert.match(holy.description, /end of its turn/);
    assert.ok(holy.rules.some((rule) => rule.key === "Resistance" && rule.type === "light"));
    assert.match(holy.description, /^Inside a holy field/);
    assert.deepEqual(hazardPlan(terrainRules("twister"), { id: "t", name: "G" }, 1).damage, [{ formula: "1d2", type: "bludgeoning" }]);
    for (const storm of Object.values(STORMS)) assert.ok(stormInfo(storm, "2d6").lines[0].length > 10, storm.label);
});

test("starting ground: only on bare squares", () => {
    const bare = [];
    for (let x = 0; x < 20; x++) for (let y = 0; y < 15; y++) bare.push(`${x},${y}`);
    const pick = (n) => Math.floor(n / 2);
    for (const key of Object.keys(STARTING_GROUND)) {
        const parts = scatterPlan(key, bare, pick);
        assert.ok(parts.length, key);
        for (const { keys } of parts) assert.ok(keys.every((each) => bare.includes(each)), key);
    }
    assert.equal(scatterPlan("wildfire", bare, pick)[0].keys.length, 9);
    assert.equal(scatterPlan("wildfire", bare, pick)[0].material, "burning");
    assert.equal(scatterPlan("tar", bare, pick).length, 1);
    assert.equal(scatterPlan("tar", ["0,0"], pick)[0].keys.length, 1, "only what's bare");
    assert.deepEqual(scatterPlan("nothing", bare, pick), []);
});

test("what makes sense: new reactions", () => {
    const on = (element, material, extra = {}) => surfacePlans({ elements: [{ element, amount: 5 }], contact: ["0,0"], surfaces: [{ id: "s", material, squares: ["0,0"] }, ...(extra.surfaces ?? [])], creatures: extra.creatures ?? [], dc: 20, hazardFormula: "2d6" }).filter((plan) => plan.material === material)[0];
    const table = [["electricity", "oil", "burning"], ["electricity", "toxic", "embers"], ["fire", "dust", "burning"], ["water", "oil", null], ["void", "plants", null], ["void", "bramble", null], ["acid", "woodfloor", null], ["acid", "flowers", null], ["earth", "oil", null], ["earth", "acid", null], ["earth", "coals", null], ["fire", "mud", null], ["cold", "mud", "rubble"], ["cold", "oil", "ice"], ["cold", "acid", "ice"], ["poison", "water", "sewage"], ["wood", "rubble", "grass"], ["wood", "sand", "grass"], ["wood", "mud", "grass"], ["vitality", "thicket", "flowers"], ["vitality", "mud", "flowers"], ["air", "snow", null]];
    for (const [element, material, to] of table) assert.equal(on(element, material).to, to, `${element} on ${material}`);
    assert.equal(on("electricity", "mud", { creatures: [{ id: "o", squares: ["0,0"], elevation: 0 }] }).conducted, true);
    assert.equal(on("wood", "bramble").key, "harvest", "harvest stays");
    // (The wind feeds a fire: only what can burn beside what it touched.)
    const fan = surfacePlans({ elements: [{ element: "air", amount: 0 }], contact: ["0,0"], surfaces: [{ id: "f", material: "burning", squares: ["0,0", "9,9"] }, { id: "g", material: "grass", squares: ["1,0", "5,5"] }, { id: "r", material: "rubble", squares: ["0,1"] }], creatures: [], dc: 20 }).find((plan) => plan.key === "gust");
    assert.deepEqual(fan.changes, [{ material: null, to: "burning", keys: ["1,0"], words: "" }]);
    assert.equal(surfacePlans({ elements: [{ element: "air", amount: 0 }], contact: ["0,0"], surfaces: [{ id: "f", material: "burning", squares: ["0,0"] }], creatures: [], dc: 20 }).length, 0, "nothing to spread to");
    const creature = (extra) => ({ id: "c", name: "Goblin", squares: ["0,0"], elevation: 0, ...extra });
    assert.equal(creaturePlans({ elements: [{ element: "water" }], creature: creature({ burning: true }) }).find((plan) => plan.key === "douse-creature").putOut, true);
    assert.equal(creaturePlans({ elements: [{ element: "water" }], creature: creature({}) }).some((plan) => plan.key === "douse-creature"), false);
    assert.deepEqual(creaturePlans({ elements: [{ element: "darkness" }], creature: creature({ limned: true }) })[0].remove, ["limned"]);
    assert.equal(terrainRules("flowers").effect, null);
    assert.equal(groundHealing("flowers", 1), 1);
    assert.equal(groundHealing("flowers", 8), 4);
    assert.equal(groundHealing("water", 8), 0);
});

test("next to: touching squares, diagonals included", () => {
    assert.equal(nextTo(["5,5"], ["6,6"]), true);
    assert.equal(nextTo(["5,5"], ["5,7"]), false);
    assert.equal(nextTo(["5,5", "6,5"], ["7,5"]), true);
});
