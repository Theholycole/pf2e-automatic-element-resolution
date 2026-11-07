// Elemental weather: each round some squares under the sky are marked, and at the end of the next round the sky hits them. Everyone can see it
// coming, which is the point: get out, or lure someone in. Homebrew. Pure.

import { SURFACES, burstSquares, touches } from "./surfaces.js";

export const STORMS = {
    lightning: { label: "Lightning storm", strike: "Lightning", element: "electricity", type: "electricity", surface: null },
    meteors: { label: "Meteor shower", strike: "A meteor", element: "fire", type: "fire", surface: "burning" },
    hail: { label: "Hailstorm", strike: "Hail", element: "cold", type: "bludgeoning", surface: "ice" },
    acid: { label: "Acid rain", strike: "Acid rain", element: "acid", type: "acid", surface: "acid" },
    gales: { label: "Whirlwinds", strike: "A whirlwind", element: "air", type: "bludgeoning", surface: "gale" },
    quake: { label: "Tremors", strike: "A tremor", element: "earth", type: "bludgeoning", surface: "rubble" },
    thorns: { label: "Thorn growth", strike: "Thorns", element: "wood", type: "piercing", surface: "bramble" },
    blight: { label: "Poison fog", strike: "Poison", element: "poison", type: "poison", surface: "toxic" },
    gloom: { label: "Death shroud", strike: "Death", element: "void", type: "void", surface: "miasma" },
    sunbeams: { label: "Sunbeams", strike: "A sunbeam", element: "light", type: "fire", surface: "light" },
    firestorm: { label: "Firestorm", strike: "Falling fire", element: "fire", type: "fire", surface: "burning", fireLasts: true },
    // Scaled: its damage goes by the party's level, as an object's burst does. Escalates: one more mark each round.
    reckoning: { label: "Reckoning", strike: "Holy light", element: "light", type: "spirit", surface: null, scaled: true, escalates: true },
    solarflare: { label: "Solar flare", strike: "A solar flare", element: "fire", type: "fire", surface: null, scaled: true, feet: 15, degrees: { failure: { condition: "dazzled" }, criticalFailure: { condition: "dazzled" } } },
    // No marks: these act on what's under the sky each round, or each turn.
    gusts: { label: "Gusts", kind: "wind", feet: 5 },
    hurricane: { label: "Hurricane", kind: "wind", feet: 30, save: true },
    swarm: { label: "Biting swarm", kind: "swarm" },
    madness: { label: "Madness", kind: "madness" },
    holyday: { label: "Holy day", kind: "holy" },
    twisters: { label: "Wandering twisters", kind: "twisters" }
};

export const STRIKE_FEET = 5;

// What the Elements window says about one. formula: a strike's damage.
const KIND_WORDS = {
    gusts: "Each round the wind pushes everything under the sky 5 feet, all the same way.",
    hurricane: "Each round the wind pushes everything under the sky the same way: Fortitude, or 30 feet (prone on a critical failure), 5 feet on a success, none on a critical success.",
    swarm: "At the end of each creature's turn under the sky, a 50% chance of a bite: piercing damage by level and 1d4 bleed.",
    madness: "Each round each creature under the sky has a 25% chance of a Will save, or it's confused until the end of its next turn.",
    holyday: "The whole scene is a holy field: a light field, with fast healing of half a creature's level (at least 1).",
    twisters: "Each round a new twister appears under the sky, and those there wander 10 feet. A twister deals bludgeoning damage on entering and at each turn's start, and fades after a few rounds."
};
export function stormInfo(storm, formula) {
    const key = Object.keys(STORMS).find((each) => STORMS[each] === storm);
    if (storm.kind) return { title: storm.label, lines: [KIND_WORDS[key]] };
    return { title: storm.label, lines: [`Each new round marks squares under the sky, and the sky hits them the next round: ${formula} ${storm.type} in ${strikeFeet(storm)} feet, basic Reflex.${storm.degrees ? " Dazzled on a failure." : ""}${storm.escalates ? " One more is marked each round." : ""}${storm.surface ? ` It leaves ${SURFACES[storm.surface].label.toLowerCase()}.` : ""}${storm.fireLasts ? " Its fires don't burn out." : ""}`] };
}

// The wind's way this round, and its card for these creatures. pick(n) gives an index below n.
const WINDS = [[0, -1, "north"], [1, -1, "northeast"], [1, 0, "east"], [1, 1, "southeast"], [0, 1, "south"], [-1, 1, "southwest"], [-1, 0, "west"], [-1, -1, "northwest"]];
export function windPlan(storm, creatures, { dc = null, pick = () => 0 } = {}) {
    const [dx, dy, word] = WINDS[pick(WINDS.length)];
    const push = (feet) => ({ feet, dx, dy, reason: storm.label });
    return {
        key: "wind", title: `${storm.label}: the wind blows ${word}`, targets: creatures.map((creature) => creature.id), damage: [],
        check: storm.save ? { statistic: "fortitude", basic: false, dc } : null,
        degrees: storm.save ? { success: { push: push(5) }, failure: { push: push(storm.feet) }, criticalFailure: { push: push(storm.feet), condition: "prone" } } : { automatic: { push: push(storm.feet) } }, notes: []
    };
}

// A bite from the swarm. chance: the d100 came up.
export const swarmPlan = (creature, level) => ({
    key: "swarm", element: "bleed", title: `The swarm bites ${creature.name}`, targets: [creature.id], check: null,
    damage: [{ formula: `${Math.max(1, Math.ceil(level / 4))}d4`, type: "piercing" }], degrees: { automatic: { persistent: "1d4" } }, notes: []
});

export const madnessPlan = (creatures, dc) => ({
    key: "madness", title: "Madness takes hold", targets: creatures.map((creature) => creature.id), damage: [],
    check: { statistic: "will", basic: false, dc }, degrees: { failure: { condition: "maddened" }, criticalFailure: { condition: "maddened" } }, notes: []
});

// Ground to start a fight on: patches of surfaces scattered over the bare squares. share: of the squares; feet: each patch's reach.
export const STARTING_GROUND = {
    overgrowth: { label: "Overgrowth", parts: [{ material: "bramble", share: 0.03, feet: 5 }, { material: "grass", share: 0.05, feet: 5 }] },
    wildfire: { label: "Wildfire", parts: [{ material: "burning", share: 0.03, feet: 0 }] },
    flood: { label: "Flash flood", parts: [{ material: "water", share: 0.2, feet: 5 }] },
    tar: { label: "Oil spill", parts: [{ material: "oil", patches: 1, feet: 15 }] },
    earthquake: { label: "Earthquake", parts: [{ material: "rubble", share: 0.06, feet: 5 }] },
    eruption: { label: "Eruption", parts: [{ material: "lava", patches: 1, feet: 10 }] }
};

// [{ material, keys }] of the bare squares; pick(n) gives an index below n.
export function scatterPlan(key, bare, pick = () => 0) {
    const free = new Set(bare);
    const out = [];
    for (const { material, share, patches, feet } of STARTING_GROUND[key]?.parts ?? []) {
        const size = burstSquares(["0,0"], feet).length;
        let count = patches ?? Math.max(1, Math.round((bare.length * share) / size));
        const keys = [];
        while (count-- > 0 && free.size) {
            const open = [...free];
            for (const square of burstSquares([open[pick(open.length)]], feet)) {
                if (free.delete(square)) keys.push(square);
            }
        }
        if (keys.length) out.push({ material, keys });
    }
    return out;
}

export function pickWarnings(squares, count, pick = () => 0) {
    const open = [...squares];
    const keys = [];
    while (keys.length < count && open.length) keys.push(open.splice(pick(open.length), 1)[0]);
    return keys;
}

export const strikeFeet = (storm) => storm.feet ?? STRIKE_FEET;

export function strikePlan(storm, centre, creatures, { dc = null, amount = null, formula = null } = {}) {
    const squares = burstSquares([centre], strikeFeet(storm));
    return {
        key: "strike", element: storm.element, title: `${storm.strike} hits`, targets: creatures.filter((creature) => touches(creature, squares)).map((creature) => creature.id),
        damage: amount ? [{ amount, type: storm.type }] : formula ? [{ formula, type: storm.type }] : [], check: { statistic: "reflex", basic: true, dc }, degrees: storm.degrees ?? {},
        squares: storm.surface ? squares : [], material: null, ...(storm.surface ? { to: storm.surface } : {}), notes: storm.surface ? [`It leaves ${SURFACES[storm.surface].label.toLowerCase()}.`] : []
    };
}
