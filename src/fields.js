// Elemental fields: a scene or a marked area saturated with an element. Inside, that element hits harder and hurts less, which makes the ground
// worth fighting over. Adapted from the arenas' elemental fields in Battlezoo Eldamon (Pathfinder); the numbers are homebrew. Pure.

export const FIELD_ELEMENTS = ["fire", "cold", "electricity", "water", "air", "earth", "wood", "metal", "poison", "acid", "sonic", "light", "darkness", "void", "vitality"];
const HAS_RESISTANCE = new Set(["fire", "cold", "electricity", "poison", "acid", "sonic", "void", "vitality"]);
const SCALED = "max(1,floor(@actor.level/2))";

export const fieldLabel = (element) => `${element[0].toUpperCase()}${element.slice(1)} field`;

export const fieldEffect = (element) => ({
    name: fieldLabel(element),
    rules: [
        { key: "FlatModifier", selector: "damage", type: "status", value: SCALED, label: fieldLabel(element), predicate: [`item:trait:${element}`] },
        ...(HAS_RESISTANCE.has(element) ? [{ key: "Resistance", type: element, value: SCALED }] : [])
    ],
    description: `Inside a ${element} field: half its level (at least 1) as a status bonus to damage from ${element} effects${HAS_RESISTANCE.has(element) ? `, and that much ${element} resistance` : ""}. Homebrew.`
});

// The next element in a cycle.
export const nextField = (cycle, current) => {
    if (!cycle?.length) return current;
    const index = cycle.indexOf(current);
    return cycle[(index + 1) % cycle.length];
};
