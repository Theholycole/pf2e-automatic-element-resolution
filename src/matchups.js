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

// Each surface's own element.
const SURFACE_ELEMENTS = { water: "water", steam: "water", ice: "cold", burning: "fire", plants: "wood", thicket: "wood", mud: "earth", rubble: "earth", metal: "metal", darkness: "darkness", light: "light", death: "void", life: "life" };

export const breaksSurface = (element, material) => (STRONG_AGAINST[element] ?? []).includes(SURFACE_ELEMENTS[material]);
