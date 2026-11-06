// What a round does to the ground: squares age; fire burns out, puddles dry and steam fades when their time is up; fire catches on fuel next
// to it. All homebrew, and all the numbers are the world's settings. Pure: the d20 comes from the caller.

import { SURFACE_REACTIONS } from "./reactions.js";
import { SURFACES, movedSquares, squareKey, squareOf } from "./surfaces.js";

export const DEFAULT_LIVES = { water: 10, steam: 2, burning: 3, embers: 3, toxic: 3, miasma: 3, frostfog: 3, dust: 3, gale: 3 };
export const SPREAD_DC = 11;

const AROUND = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const neighbours = (key) => {
    const [column, row] = squareOf(key);
    return AROUND.map(([dx, dy]) => squareKey(column + dx, row + dy));
};

const ENDINGS = { water: "Water dries up", steam: "Steam fades", burning: "Fire burns out" };

// surfaces: [{ material, squares, ages: { key: rounds }, lasting: [keys] }]. A life of 0 never runs out, and neither does a lasting square.
// → { ages: { material: { key: rounds } }, changes: [{ material, to, keys, words }] }
// rain: wet precipitation douses flames (GM Core), true or the set of squares it falls on: those that can go out do, and none spread there.
// It also counts as water there, and freezing as cold.
// wind: { dx, dy }, clouds drift a square that way. freezing: a set of squares where standing water freezes. fireLasts: fires don't burn out.
export function tickSurfaces(surfaces, { lives = DEFAULT_LIVES, spreadDC = SPREAD_DC, d20 = () => 10, rain = false, wind = null, freezing = null, fireLasts = false } = {}) {
    const ages = {};
    const changes = [];
    for (const { material, squares, ages: before = {}, lasting = [] } of surfaces) {
        const life = fireLasts && material === "burning" ? 0 : lives[material] ?? 0;
        const stays = new Set(lasting);
        const grown = Object.fromEntries(squares.map((key) => [key, (before[key] ?? 0) + 1]));
        ages[material] = grown;
        const ended = life > 0 ? squares.filter((key) => !stays.has(key) && grown[key] >= life) : [];
        if (ended.length) changes.push({ material, to: null, keys: ended, words: `${ENDINGS[material] ?? `${SURFACES[material]?.label ?? material} fades`} (${countOf(ended)}).` });
    }
    if (freezing) {
        const keys = surfaces.filter((surface) => surface.material === "water" && !surface.fixed).flatMap((surface) => surface.squares.filter((key) => freezing.has(key)));
        if (keys.length) changes.push({ material: "water", to: "ice", keys, words: `The cold freezes the water (${countOf(keys)}).` });
    }
    if (wind) {
        for (const { material, squares, lasting = [] } of surfaces.filter((surface) => SURFACES[surface.material]?.drifts)) {
            const moving = squares.filter((key) => !lasting.includes(key));
            if (moving.length) changes.push({ material, to: null, keys: moving, words: `The wind carries the ${SURFACES[material].label.toLowerCase()}.` }, { material, to: material, keys: movedSquares(moving, wind.dx, wind.dy), words: "" });
        }
    }
    const wet = rain === true ? () => true : rain ? (key) => rain.has(key) : () => false;
    const out = surfaces.filter((surface) => surface.material === "burning").flatMap((surface) => surface.squares.filter((key) => wet(key) && !(surface.lasting ?? []).includes(key)));
    if (out.length) {
        const listed = changes.find((change) => change.material === "burning");
        if (listed) {
            listed.keys = listed.keys.filter((key) => !out.includes(key));
            if (listed.keys.length) listed.words = `Fire burns out (${countOf(listed.keys)}).`;
            else changes.splice(changes.indexOf(listed), 1);
        }
        changes.push({ material: "burning", to: null, keys: out, words: `The rain puts out the fire (${countOf(out)}).` });
    }
    // (One flat check per burning square beside it, until one catches.)
    const burning = surfaces.filter((surface) => surface.material === "burning").flatMap((surface) => surface.squares).filter((key) => !wet(key));
    for (const { material, squares } of surfaces.filter((surface) => SURFACES[surface.material]?.flammable)) {
        const caught = squares.filter((key) => !wet(key)).filter((key) => {
            const beside = neighbours(key).filter((other) => burning.includes(other));
            return beside.some(() => d20() >= (SURFACES[material].catches ?? spreadDC));
        });
        if (caught.length) changes.push({ material, to: "burning", keys: caught, words: `Fire spreads to ${SURFACES[material].label.toLowerCase()} (${countOf(caught)}).` });
    }
    if (rain) changes.push(...weatherChanges(surfaces, "water", wet));
    if (freezing) changes.push(...weatherChanges(surfaces, "cold", (key) => freezing.has(key)));
    return { ages, changes };
}

// Weather counts as its element on what's under it, once a round: what an element simply turns into something else. (Standing water freezing and
// flames going out are their own rules above; what needs a save or a target comes from an attack, not the sky.)
function weatherChanges(surfaces, element, under) {
    const changes = [];
    for (const row of SURFACE_REACTIONS.filter((each) => each.element === element && !each.conduct && !each.hazard && !each.drift && !each.save && !each.notTrail)) {
        for (const material of row.surfaces.filter((each) => each !== "burning")) {
            const keys = surfaces.filter((surface) => surface.material === material && !surface.fixed).flatMap((surface) => surface.squares.filter(under));
            if (keys.length) changes.push({ material, to: row.to, keys, words: `${row.title.replace("{surface}", (SURFACES[material]?.label ?? material).toLowerCase())} (${countOf(keys)}).` });
        }
    }
    return changes;
}

// Soaking rain leaves puddles: this many of the bare squares, picked by pick(n) → an index below n.
export function rainPuddles(bare, count, pick = () => 0) {
    const open = [...bare];
    const keys = [];
    while (keys.length < count && open.length) keys.push(open.splice(pick(open.length), 1)[0]);
    return keys.length ? { material: null, to: "water", keys, words: `The rain leaves puddles (${countOf(keys)}).` } : null;
}

const countOf = (keys) => `${keys.length} ${keys.length === 1 ? "square" : "squares"}`;

// The card for a round's changes (none: no card).
export const roundPlan = (changes, round) => (changes.length ? { key: "round", title: `End of round ${round}: the ground changes`, targets: [], damage: [], changes, notes: changes.map((change) => change.words).filter(Boolean) } : null);
