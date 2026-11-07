// Creatures that carry an element (src/carry.js), on the active GM's client: each move, and each turn start for where it stands. Ctrl-Z on a
// move puts back the squares it changed and takes back its cards that haven't been applied. What the GM already applied stays. The record of
// moves lives only until the page reloads.

import { MODULE_ID, creatureOf, creaturesOf, dcFrom, hazardFormula, isActiveGM, isCreatureActor, paintSquares, sceneDC, surfaceDC, surfacesOf } from "./foundry.js";
import { cardOf, postPlan, stackState } from "./cards.js";
import { squareKey } from "../src/surfaces.js";
import { bestStatistic, ignoredOf, immuneTo } from "./terrain.js";
import { balancePlan, groundHealing, hazardPlan, steady, terrainRules } from "../src/terrain.js";
import { SURFACES } from "../src/surfaces.js";
import { carriedElements, enteredSquares, needsCard, pathSquares, trailPlans, weaknessPlan } from "../src/carry.js";

const elementsOf = (actor) => carriedElements({
    // (An effect's traits count as the creature's: Wet is water, and so is a spell's effect with the water trait. Wet from the rain doesn't: the rain itself
    // does that to the ground.)
    traits: [...(actor?.traits ?? actor?.system?.traits?.value ?? []), ...(actor?.itemTypes?.effect ?? []).filter((effect) => !effect.flags?.[MODULE_ID]?.rain).flatMap((effect) => effect.system?.traits?.value ?? [])],
    persistent: (actor?.itemTypes?.condition ?? []).filter((condition) => condition.slug === "persistent-damage").map((condition) => condition.system?.persistent?.damageType)
});

// What each token's recent moves did: { time, before: [{ material, keys }] }, newest last.
// (Foundry splits a move at each region's edge. Where the whole move began and which squares it's paid for, by its subpath.)
const subpaths = new Map();
const moves = new Map();
const MOVES_KEPT = 20;

function recordMove(token) {
    const entry = { time: Date.now(), before: [] };
    const list = moves.get(token.id) ?? [];
    list.push(entry);
    moves.set(token.id, list.slice(-MOVES_KEPT));
    return entry;
}

// A slide the module started itself: not a forced move to double again.
const sliding = new Set();
export const noteSlide = (token) => sliding.add(token.id);

async function undoMove(token) {
    const entry = moves.get(token.id)?.pop();
    if (!entry) return;
    const scene = token.parent;
    if (entry.oil) await stackState(token.actor, "oil", -entry.oil).catch(() => null);
    for (const { material, keys } of entry.before.slice().reverse()) await paintSquares(scene, keys, material);
    // (A little before: the region's events for a move can arrive ahead of the move's own hook.)
    const unapplied = game.messages.contents.slice(-30).filter((message) => {
        const state = cardOf(message);
        return state?.fromMove === token.id && !state.done && message.timestamp >= entry.time - 3000;
    }).map((message) => message.id);
    if (unapplied.length) await ChatMessage.deleteDocuments(unapplied);
}

async function touchGround(token, contact, entry = null, options = {}) {
    const scene = token.parent;
    if (!contact.length) return;
    const surfaces = surfacesOf(scene);
    if (!surfaces.length) return;
    const entering = options.entering ?? contact;
    // (Oil clings: a stack for each move through it, or turn begun in it.)
    if (surfaces.some((surface) => surface.material === "oil" && surface.squares.some((key) => entering.includes(key)))) {
        await stackState(token.actor, "oil", 1);
        if (entry) entry.oil = 1;
    }
    const weakness = weaknessPlan({ creature: creatureOf(token), weaknesses: token.actor.attributes?.weaknesses ?? [], contact: entering, surfaces, perSquare: Boolean(entry) });
    if (weakness) await postPlan(weakness, scene, entry ? { fromMove: token.id } : {});
    const elements = elementsOf(token.actor);
    if (!elements.length) return;
    const plans = trailPlans({ creature: creatureOf(token), elements, contact, surfaces, creatures: creaturesOf(scene), dc: dcFrom(token.actor, null) ?? sceneDC(scene), hazardFormula: hazardFormula(scene) });
    const ask = game.settings.get(MODULE_ID, "askTrails");
    for (const plan of plans) {
        if (needsCard(plan, ask)) await postPlan(plan, scene, entry ? { fromMove: token.id } : {});
        else {
            entry?.before.push({ material: plan.material, keys: plan.squares });
            await paintSquares(scene, plan.squares, plan.to);
        }
    }
}

// Moving onto ground that hurts or trips: each square entered hurts, never the one left; one Balance a move. inAir counts for clouds; onGround for the rest.
async function enterGround(token, movement, inAir, onGround) {
    const scene = token.parent;
    const subpath = movement.subpathId ?? movement.chain?.[0] ?? movement.id;
    if (!subpaths.has(subpath)) subpaths.set(subpath, { origin: movement.origin, balanced: new Set(), paid: new Set() });
    if (subpaths.size > 100) subpaths.delete(subpaths.keys().next().value);
    const seen = subpaths.get(subpath);
    const forced = (movement.passed?.waypoints ?? []).every((point) => point.action === "displace");
    for (const surface of surfacesOf(scene).filter((each) => !each.environment)) {
        const entered = (SURFACES[surface.material]?.cloud ? inAir : onGround).filter((key) => surface.squares.includes(key) && !seen.paid.has(`${surface.material}:${key}`));
        if (!entered.length) continue;
        entered.forEach((key) => seen.paid.add(`${surface.material}:${key}`));
        const rules = terrainRules(surface.material, { dc: surfaceDC(token.actor) });
        if (rules.balance && !forced && !seen.balanced.has(surface.material) && !steady(rules, ignoredOf(token.actor))) {
            seen.balanced.add(surface.material);
            await postPlan(balancePlan(rules, token, bestStatistic(token.actor, rules.balance.statistics), seen.origin), scene, { fromMove: token.id });
        }
        if (rules.hazard && !immuneTo(token.actor, rules.hazard.type)) await postPlan(hazardPlan(rules, token, entered.length), scene, { fromMove: token.id });
    }
}

// Double forced movement on ice: a forced move that began on ice goes on as far again. Core's forced moves and displacements are certain; a GM's
// drag of a creature out of its turn might be one, so the card only offers it.
async function slideOnIce(token, movement, entry) {
    const scene = token.parent;
    if (sliding.delete(token.id) || !movement?.origin) return;
    const forced = movement.updateOptions?.["pf2e-resolution-core"]?.forcedMovement || (movement.passed?.waypoints ?? []).every((point) => point.action === "displace");
    const outOfTurn = movement.method === "dragging" && game.combat?.started && game.combat.combatant?.token?.id !== token.id;
    if (!forced && !outOfTurn) return;
    const size = scene.grid.size;
    const start = squareKey(Math.floor(movement.origin.x / size + 0.001), Math.floor(movement.origin.y / size + 0.001));
    if (!surfacesOf(scene).some((surface) => surface.material === "ice" && surface.squares.includes(start))) return;
    const destination = movement.destination ?? movement.origin;
    const feet = Math.round(Math.hypot(destination.x - movement.origin.x, destination.y - movement.origin.y) / size) * (scene.grid.distance || 5);
    if (feet <= 0) return;
    const half = (token.width * size) / 2;
    await postPlan({ key: "slide", title: `${token.name} slides on the ice`, targets: [token.id], damage: [], check: null, degrees: {}, push: { feet, from: { x: movement.origin.x + half, y: movement.origin.y + half } }, notes: [`Forced movement on ice is doubled: ${feet} more feet.${forced ? "" : " If this wasn't forced movement, ignore this card."}`] }, scene, entry ? { fromMove: token.id } : {});
}

// A token's move: the squares along it.
export async function onTokenMoved(token, movement) {
    if (!isActiveGM() || !isCreatureActor(token?.actor)) return;
    if (movement?.method === "undo") return undoMove(token);
    const entry = recordMove(token);
    await slideOnIce(token, movement, entry);
    const points = [movement?.origin, ...(movement?.passed?.waypoints ?? [])].filter(Boolean).map((point) => ({ width: token.width, height: token.height, ...point }));
    if (!points.length) return;
    const size = token.parent.grid.size;
    const path = pathSquares(points, size);
    const start = pathSquares(points.slice(0, 1), size, { aloft: true });
    const entering = enteredSquares(path, start);
    await enterGround(token, movement, enteredSquares(pathSquares(points, size, { aloft: true }), start), entering);
    await touchGround(token, path, entry, { entering });
}

// A turn ending on ground or in a field that heals: it does, unless the creature is undead (vitality).
export async function healingGroundTurn(combat, change, options) {
    if (!isActiveGM() || options?.direction !== 1 || !("turn" in change || "round" in change)) return;
    const token = combat.combatants.get(combat.previous?.combatantId)?.token;
    const actor = token?.actor;
    if (!token?.parent || !isCreatureActor(actor) || actor.traits?.has?.("undead") || (actor.hitPoints?.value ?? 0) >= (actor.hitPoints?.max ?? 0)) return;
    const creature = creatureOf(token);
    const under = (creature.elevation ?? 0) > 0 ? [] : surfacesOf(token.parent).filter((surface) => surface.squares.some((key) => creature.squares.includes(key)));
    // (A holy field reaches those in the air too, and counts like flowers. The most of them, not all.)
    const holy = actor.itemTypes.effect.some((effect) => /^elements-(surface-)?field-holy$/.test(effect.slug ?? ""));
    const amount = Math.max(0, ...under.map((surface) => groundHealing(surface.material, actor.level)), holy ? groundHealing("flowers", actor.level) : 0);
    if (amount) await actor.applyDamage({ damage: -amount, token });
}

// A turn starting: the squares it's standing on.
export async function onTurnChange(combat, change, options) {
    if (!isActiveGM() || options?.direction !== 1 || !("turn" in change || "round" in change)) return;
    const token = combat.combatant?.token;
    if (!token?.parent || !isCreatureActor(token.actor)) return;
    const creature = creatureOf(token);
    if ((creature.elevation ?? 0) <= 0) await touchGround(token, creature.squares);
}
