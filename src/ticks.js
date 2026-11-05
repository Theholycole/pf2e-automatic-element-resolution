// What a round does to the ground: squares age; fire burns out, puddles dry and steam fades when their time is up; fire catches on fuel next
// to it. All homebrew, and all the numbers are the world's settings. Pure: the d20 comes from the caller.

import { SURFACES, squareKey, squareOf } from "./surfaces.js";

export const DEFAULT_LIVES = { water: 10, steam: 2, burning: 3 };
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
export function tickSurfaces(surfaces, { lives = DEFAULT_LIVES, spreadDC = SPREAD_DC, d20 = () => 10, rain = false } = {}) {
    const ages = {};
    const changes = [];
    for (const { material, squares, ages: before = {}, lasting = [] } of surfaces) {
        const life = lives[material] ?? 0;
        const stays = new Set(lasting);
        const grown = Object.fromEntries(squares.map((key) => [key, (before[key] ?? 0) + 1]));
        ages[material] = grown;
        const ended = life > 0 ? squares.filter((key) => !stays.has(key) && grown[key] >= life) : [];
        if (ended.length) changes.push({ material, to: null, keys: ended, words: `${ENDINGS[material] ?? `${SURFACES[material]?.label ?? material} fades`} (${countOf(ended)}).` });
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
            return beside.some(() => d20() >= spreadDC);
        });
        if (caught.length) changes.push({ material, to: "burning", keys: caught, words: `Fire spreads to ${SURFACES[material].label.toLowerCase()} (${countOf(caught)}).` });
    }
    return { ages, changes };
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
export const roundPlan = (changes, round) => (changes.length ? { key: "round", title: `End of round ${round}: the ground changes`, targets: [], damage: [], changes, notes: changes.map((change) => change.words) } : null);
