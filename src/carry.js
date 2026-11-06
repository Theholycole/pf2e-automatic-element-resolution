// A creature that carries an element changes the ground under it: a fire elemental or a creature on fire lights grass as it goes, and bare
// ground stays as it is. Homebrew. Pure.

import { elementsFrom, surfacePlans } from "./reactions.js";
import { SURFACES, SURFACE_TRAITS, squareKey } from "./surfaces.js";

// What a creature carries: its traits, and its persistent damage's types. [{ element, amount: 0 }]
export const carriedElements = ({ traits = [], persistent = [] } = {}) => elementsFrom({ traits: [...traits, ...persistent] });

// The squares a move's points cover: { x, y, width, height, elevation } in pixels and grid spaces, walked at half a square. Off the ground touches nothing.
// aloft: count those too, for what fills the air.
export function pathSquares(points, size, { aloft = false } = {}) {
    const keys = new Set();
    const cover = ({ x, y, width = 1, height = 1 }) => {
        const left = Math.floor(x / size + 0.001), upper = Math.floor(y / size + 0.001);
        for (let dx = 0; dx < Math.max(1, Math.round(width)); dx++) for (let dy = 0; dy < Math.max(1, Math.round(height)); dy++) keys.add(squareKey(left + dx, upper + dy));
    };
    points.forEach((point, index) => {
        if (aloft || (point.elevation ?? 0) <= 0) cover(point);
        const next = points[index + 1];
        if (!next) return;
        const steps = Math.ceil(Math.hypot(next.x - point.x, next.y - point.y) / (size / 2));
        for (let step = 1; step < steps; step++) {
            const part = step / steps;
            const between = { ...point, x: point.x + (next.x - point.x) * part, y: point.y + (next.y - point.y) * part, elevation: (point.elevation ?? 0) + ((next.elevation ?? 0) - (point.elevation ?? 0)) * part };
            if (aloft || between.elevation <= 0) cover(between);
        }
    });
    return [...keys];
}

// The squares a move entered: its path without where it began.
export const enteredSquares = (path, start) => path.filter((key) => !start.includes(key));

// What it does to these squares. Only the squares it touched change (lit oil still goes up whole); it doesn't roll against itself.
export const trailPlans = ({ creature, elements, contact, surfaces, creatures, dc, hazardFormula }) => surfacePlans({ elements, contact, surfaces, creatures, direct: [creature.id], dc, hazardFormula, local: true });

// Does a plan need the GM? Only when someone has to roll or take something, unless the GM asked to see them all.
export const needsCard = (plan, ask = false) => ask || plan.targets.length > 0;

// Moving through or standing on a surface whose traits it's weak to (Personal Rain Cloud: "damage equal to their weakness"). Homebrew for
// surfaces in general. Its highest such weakness, once per move or turn. weaknesses: [{ type, value }].
// perSquare: on a move, once for each square it entered.
export function weaknessPlan({ creature, weaknesses = [], contact = [], surfaces = [], perSquare = false }) {
    let worst = null;
    let squares = 0;
    for (const surface of surfaces) {
        const touched = surface.squares.filter((key) => contact.includes(key)).length;
        if (!touched) continue;
        for (const weakness of weaknesses) {
            if (!(SURFACE_TRAITS[surface.material] ?? []).includes(weakness.type) || !(weakness.value > 0)) continue;
            const hits = perSquare ? touched : 1;
            if (weakness.value * hits > (worst?.value ?? 0) * squares) {
                worst = { value: weakness.value, type: weakness.type, material: surface.material };
                squares = hits;
            }
        }
    }
    if (!worst) return null;
    return {
        key: "weakness", title: `${creature.name} is hurt by the ${(SURFACES[worst.material]?.label ?? worst.material).toLowerCase()}`, targets: [creature.id], check: null,
        damage: [{ amount: worst.value * squares, type: "untyped" }], degrees: {}, notes: [`Weakness to ${worst.type} ${worst.value}${squares > 1 ? `, ${squares} squares` : ""}.`]
    };
}
