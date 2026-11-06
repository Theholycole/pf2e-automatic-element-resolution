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
    firestorm: { label: "Firestorm", strike: "Falling fire", element: "fire", type: "fire", surface: "burning", fireLasts: true }
};

export const STRIKE_FEET = 5;

export function pickWarnings(squares, count, pick = () => 0) {
    const open = [...squares];
    const keys = [];
    while (keys.length < count && open.length) keys.push(open.splice(pick(open.length), 1)[0]);
    return keys;
}

export function strikePlan(storm, centre, creatures, { dc = null, amount = null, formula = null } = {}) {
    const squares = burstSquares([centre], STRIKE_FEET);
    return {
        key: "strike", element: storm.element, title: `${storm.strike} hits`, targets: creatures.filter((creature) => touches(creature, squares)).map((creature) => creature.id),
        damage: amount ? [{ amount, type: storm.type }] : formula ? [{ formula, type: storm.type }] : [], check: { statistic: "reflex", basic: true, dc }, degrees: {},
        squares: storm.surface ? squares : [], material: null, ...(storm.surface ? { to: storm.surface } : {}), notes: storm.surface ? [`It leaves ${SURFACES[storm.surface].label.toLowerCase()}.`] : []
    };
}
