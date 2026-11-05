// The ground's materials, and the geometry of a surface: squares on the grid as "column,row" keys. Touching squares of one material
// are one body, which is what lightning runs along and what a flame lights. Pure.

export const SURFACES = {
    water: { label: "Water", color: "#3f7fd6", conducts: true },
    metal: { label: "Metal", color: "#8a8f98", conducts: true },
    oil: { label: "Oil", color: "#4a3b22", flammable: true },
    plants: { label: "Plants", color: "#4f8a3a", flammable: true },
    thicket: { label: "Thicket", color: "#2f6b2a", flammable: true },
    mud: { label: "Mud", color: "#6b4f2e" },
    rubble: { label: "Rubble", color: "#857a6c" },
    ice: { label: "Ice", color: "#9fd8ee" },
    burning: { label: "Burning", color: "#e0602a" },
    steam: { label: "Steam", color: "#d7dde2", cloud: true },
    darkness: { label: "Darkness", color: "#1d1a2e", cloud: true },
    light: { label: "Light", color: "#f3e7a1", cloud: true },
    death: { label: "Deathly ground", color: "#54495c" },
    life: { label: "Living ground", color: "#b7e38f" }
};

// The traits a surface shares with a creature's weakness, among PF2e's weakness types. Burning and deathly ground aren't here: their damage
// is already fire and void, and PF2e applies those weaknesses itself.
export const SURFACE_TRAITS = {
    water: ["water"], steam: ["water"], ice: ["cold", "water"], mud: ["water", "earth"], rubble: ["earth"], plants: ["plant", "wood"], thicket: ["plant", "wood"],
    metal: ["metal"], light: ["light"], life: ["vitality"]
};

// The environment module's terrain, by its feature's key. Fixed: deep or flowing water, which conducts but doesn't boil or freeze away.
const ENVIRONMENT_FEATURES = {
    ice: { material: "ice" },
    "undergrowth-light": { material: "plants" },
    "undergrowth-heavy": { material: "thicket" },
    "undergrowth-thorns": { material: "plants" },
    hedge: { material: "thicket" },
    "bog-shallow": { material: "mud" },
    rubble: { material: "rubble" },
    flames: { material: "burning" },
    water: { material: "water", fixed: true },
    "current-water": { material: "water", fixed: true }
};
export const environmentMaterial = (key) => ENVIRONMENT_FEATURES[key] ?? null;

export const squareKey = (column, row) => `${column},${row}`;
export const squareOf = (key) => key.split(",").map(Number);

const NEIGHBOURS = [[1, 0, 5], [-1, 0, 5], [0, 1, 5], [0, -1, 5], [1, 1, 7.5], [1, -1, 7.5], [-1, 1, 7.5], [-1, -1, 7.5]];

// The squares joined to these ones, through squares in the set, and how far each is. reach (feet): no farther (diagonals count 7.5,
// PF2e's alternating 5 and 10 on average).
export function bodyFrom(starts, squares, reach = Infinity) {
    const inside = new Set(squares);
    const distance = new Map();
    const open = [...starts].filter((key) => inside.has(key)).map((key) => [key, 0]);
    while (open.length) {
        open.sort((a, b) => a[1] - b[1]);
        const [key, feet] = open.shift();
        if (distance.has(key)) continue;
        distance.set(key, feet);
        const [column, row] = squareOf(key);
        for (const [dx, dy, cost] of NEIGHBOURS) {
            const next = squareKey(column + dx, row + dy);
            if (inside.has(next) && !distance.has(next) && feet + cost <= reach) open.push([next, feet + cost]);
        }
    }
    return distance;
}

// The squares open to the sky: reachable from the map's edge without crossing a wall. blocked(a, b): a wall between two side-by-side squares.
export function openSquares(squares, blocked, isEdge) {
    const inside = new Set(squares);
    const open = new Set();
    const queue = squares.filter(isEdge);
    while (queue.length) {
        const key = queue.pop();
        if (open.has(key)) continue;
        open.add(key);
        const [column, row] = squareOf(key);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const next = squareKey(column + dx, row + dy);
            if (inside.has(next) && !open.has(next) && !blocked(key, next)) queue.push(next);
        }
    }
    return open;
}

// Does a creature touch these squares? { squares, elevation }: one of its squares on them and on the ground (a flier is above a
// puddle; a cloud is at every height).
export function touches(creature, squares, { cloud = false } = {}) {
    if (!cloud && (creature.elevation ?? 0) > 0) return false;
    const inside = squares instanceof Set ? squares : new Set(squares);
    return (creature.squares ?? []).some((key) => inside.has(key));
}
