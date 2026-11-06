// Creatures that carry an element (src/carry.js), on the active GM's client: each move, and each turn start for where it stands. Ctrl-Z on a
// move puts back the squares it changed and takes back its cards that haven't been applied. What the GM already applied stays. The record of
// moves lives only until the page reloads.

import { MODULE_ID, creatureOf, creaturesOf, dcFrom, hazardFormula, isActiveGM, isCreatureActor, paintSquares, sceneDC, surfacesOf } from "./foundry.js";
import { cardOf, postPlan, stackState } from "./cards.js";
import { squareKey } from "../src/surfaces.js";
import { carriedElements, needsCard, pathSquares, trailPlans, weaknessPlan } from "../src/carry.js";

const elementsOf = (actor) => carriedElements({
    traits: [...(actor?.traits ?? actor?.system?.traits?.value ?? [])],
    persistent: (actor?.itemTypes?.condition ?? []).filter((condition) => condition.slug === "persistent-damage").map((condition) => condition.system?.persistent?.damageType)
});

// What each token's recent moves did: { time, before: [{ material, keys }] }, newest last.
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

async function touchGround(token, contact, entry = null) {
    const scene = token.parent;
    if (!contact.length) return;
    const surfaces = surfacesOf(scene);
    if (!surfaces.length) return;
    // (Oil clings: a stack for each move through it, or turn begun in it.)
    if (surfaces.some((surface) => surface.material === "oil" && surface.squares.some((key) => contact.includes(key)))) {
        await stackState(token.actor, "oil", 1);
        if (entry) entry.oil = 1;
    }
    const weakness = weaknessPlan({ creature: creatureOf(token), weaknesses: token.actor.attributes?.weaknesses ?? [], contact, surfaces });
    if (weakness) await postPlan(weakness, scene, entry ? { fromMove: token.id } : {});
    const elements = elementsOf(token.actor);
    if (!elements.length) return;
    const plans = trailPlans({ creature: creatureOf(token), elements, contact, surfaces, creatures: creaturesOf(scene), dc: dcFrom(token.actor, null) ?? sceneDC(scene), hazardFormula: hazardFormula() });
    const ask = game.settings.get(MODULE_ID, "askTrails");
    for (const plan of plans) {
        if (needsCard(plan, ask)) await postPlan(plan, scene, entry ? { fromMove: token.id } : {});
        else {
            entry?.before.push({ material: plan.material, keys: plan.squares });
            await paintSquares(scene, plan.squares, plan.to);
        }
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
    const points = [movement?.origin, ...(movement?.passed?.waypoints ?? [])].filter(Boolean);
    if (points.length) await touchGround(token, pathSquares(points.map((point) => ({ width: token.width, height: token.height, ...point })), token.parent.grid.size), entry);
}

// A turn starting: the squares it's standing on.
export async function onTurnChange(combat, change, options) {
    if (!isActiveGM() || options?.direction !== 1 || !("turn" in change || "round" in change)) return;
    const token = combat.combatant?.token;
    if (!token?.parent || !isCreatureActor(token.actor)) return;
    const creature = creatureOf(token);
    if ((creature.elevation ?? 0) <= 0) await touchGround(token, creature.squares);
}
