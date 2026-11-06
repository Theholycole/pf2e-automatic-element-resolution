// The ground's materials, and the geometry of a surface: squares on the grid as "column,row" keys. Touching squares of one material
// are one body, which is what lightning runs along and what a flame lights. Pure.

export const SURFACES = {
    water: { label: "Water", color: "#3f7fd6", conducts: true },
    metal: { label: "Metal floor", color: "#8a8f98", conducts: true, manMade: true },
    oil: { label: "Oil", color: "#4a3b22", flammable: true },
    plants: { label: "Plants", color: "#4f8a3a", flammable: true },
    thicket: { label: "Thicket", color: "#2f6b2a", flammable: true },
    mud: { label: "Mud", color: "#6b4f2e" },
    rubble: { label: "Rubble", color: "#857a6c" },
    ice: { label: "Ice", color: "#9fd8ee" },
    burning: { label: "Burning", color: "#e0602a" },
    steam: { label: "Steam", color: "#d7dde2", cloud: true, drifts: true },
    darkness: { label: "Darkness", color: "#1d1a2e", cloud: true },
    light: { label: "Light", color: "#f3e7a1", cloud: true },
    death: { label: "Deathly ground", color: "#54495c" },
    life: { label: "Living ground", color: "#b7e38f" },
    sand: { label: "Sand", color: "#d8c48a" },
    snow: { label: "Snow", color: "#eef3f7" },
    glass: { label: "Broken glass", color: "#a8d6d3" },
    bramble: { label: "Brambles", color: "#54662c", flammable: true },
    grass: { label: "Tall grass", color: "#7fa84a", flammable: true },
    flowers: { label: "Flowers", color: "#d98cc2", flammable: true },
    lava: { label: "Lava", color: "#c4391d" },
    acid: { label: "Acid pool", color: "#9bbf2f" },
    gale: { label: "Gale", color: "#bcd6e6", cloud: true },
    embers: { label: "Ember cloud", color: "#d9772b", cloud: true, drifts: true },
    toxic: { label: "Poison cloud", color: "#7c9a3a", cloud: true, drifts: true },
    miasma: { label: "Death cloud", color: "#5d5266", cloud: true, drifts: true },
    frostfog: { label: "Frost fog", color: "#c5e3f0", cloud: true, drifts: true },
    dust: { label: "Dust cloud", color: "#b5a58a", cloud: true, drifts: true },
    // Man-made: the map's art shows what it is, so players don't see these unless the GM wants them to. catches: its own flat check for fire to spread to it.
    woodfloor: { label: "Wood floor", color: "#a0713f", flammable: true, manMade: true },
    straw: { label: "Straw", color: "#d9c15a", flammable: true, catches: 6, manMade: true },
    stone: { label: "Stone or brick floor", color: "#9a948a", manMade: true },
    sewage: { label: "Sewage", color: "#5f6b35", conducts: true, manMade: true },
    coals: { label: "Forge coals", color: "#b8491f", manMade: true },
    woodfurniture: { label: "Wood furniture", color: "#7d5430", flammable: true, manMade: true },
    stonefurniture: { label: "Stone furniture", color: "#77726a", manMade: true },
    metalfurniture: { label: "Metal furniture", color: "#6d727a", conducts: true, manMade: true }
};

// The traits a surface shares with a creature's weakness or resistance, among PF2e's types. Burning and deathly ground aren't here: their damage
// is already fire and void.
export const SURFACE_TRAITS = {
    water: ["water"], steam: ["water"], ice: ["cold", "water"], mud: ["water", "earth"], rubble: ["earth"], plants: ["plant", "wood"], thicket: ["plant", "wood"],
    metal: ["metal"], light: ["light"], life: ["vitality"], sand: ["earth"], snow: ["cold", "water"], bramble: ["plant", "wood"], grass: ["plant", "wood"], flowers: ["plant", "wood"],
    gale: ["air"], frostfog: ["cold", "water"], dust: ["earth", "air"], acid: ["poison"], glass: ["earth"],
    woodfloor: ["wood"], straw: ["plant", "wood"], stone: ["earth"], sewage: ["water", "poison"], woodfurniture: ["wood"], stonefurniture: ["earth"], metalfurniture: ["metal"]
};

// Ground that deals its own damage: its card counts weakness and resistance to its traits, for each square entered.
export const HAZARD_GROUND = new Set(["burning", "death", "bramble", "glass", "lava", "acid", "embers", "toxic", "miasma", "frostfog", "sewage", "coals"]);

// The environment module's terrain, by its feature's key. Fixed: deep or flowing water, which conducts but doesn't boil or freeze away.
const ENVIRONMENT_FEATURES = {
    ice: { material: "ice" },
    "undergrowth-light": { material: "plants" },
    "undergrowth-heavy": { material: "thicket" },
    "undergrowth-thorns": { material: "bramble" },
    snow: { material: "snow" },
    "snow-deep": { material: "snow" },
    "sand-shallow": { material: "sand" },
    "sand-deep": { material: "sand" },
    lava: { material: "lava", fixed: true },
    hedge: { material: "thicket" },
    "bog-shallow": { material: "mud" },
    rubble: { material: "rubble" },
    flames: { material: "burning" },
    water: { material: "water", fixed: true },
    "current-water": { material: "water", fixed: true }
};
export const environmentMaterial = (key) => ENVIRONMENT_FEATURES[key] ?? null;

// The squares within a burst of so many feet of these ones, by distance on the grid.
export function burstSquares(centres, feet) {
    const reach = Math.max(0, Math.floor(feet / 5));
    const keys = new Set();
    for (const key of centres) {
        const [column, row] = squareOf(key);
        for (let dx = -reach; dx <= reach; dx++) for (let dy = -reach; dy <= reach; dy++) if (Math.hypot(dx, dy) <= reach + 0.5) keys.add(squareKey(column + dx, row + dy));
    }
    return [...keys];
}

// These squares moved along the grid.
export const movedSquares = (keys, dx, dy) => keys.map((key) => {
    const [column, row] = squareOf(key);
    return squareKey(column + dx, row + dy);
});

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
