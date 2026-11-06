// The element chart: which elements each one is strong against, adapted from Battlezoo Eldamon (Pathfinder) under the ORC License, for the
// elements a surface can hold. Reactions are written by hand in reactions.js; this only answers for pairs with none, when the GM asks. Pure.

const STRONG_AGAINST = {
    air: ["earth", "wood"],
    darkness: ["light", "life"],
    void: ["poison", "life"],
    earth: ["electricity", "fire", "cold"],
    electricity: ["air", "metal", "water"],
    fire: ["cold", "metal", "wood"],
    cold: ["air", "wood"],
    light: ["darkness", "void"],
    metal: ["air", "cold"],
    poison: ["wood"],
    water: ["fire", "earth"],
    wood: ["earth", "water"]
};

// What beats an element, for fields. The chart's "life" is PF2e's vitality.
export const beatenBy = (element) => {
    const name = element === "vitality" ? "life" : element;
    return Object.keys(STRONG_AGAINST).filter((other) => STRONG_AGAINST[other].includes(name));
};

// Each surface's own element.
const SURFACE_ELEMENTS = { water: "water", steam: "water", ice: "cold", snow: "cold", frostfog: "cold", burning: "fire", lava: "fire", embers: "fire", plants: "wood", thicket: "wood", grass: "wood", bramble: "wood", flowers: "life", mud: "earth", rubble: "earth", sand: "earth", dust: "earth", gale: "air", metal: "metal", darkness: "darkness", light: "light", death: "void", miasma: "void", toxic: "poison", life: "life", acid: "poison", glass: "earth", woodfloor: "wood", straw: "wood", stone: "earth", sewage: "poison", coals: "fire", woodfurniture: "wood", stonefurniture: "earth", metalfurniture: "metal" };

export const breaksSurface = (element, material) => (STRONG_AGAINST[element] ?? []).includes(SURFACE_ELEMENTS[material]);
