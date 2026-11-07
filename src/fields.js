// Elemental fields: a scene or a marked area saturated with an element. Inside, that element hits harder and hurts less, and whatever beats it on
// the element chart hurts more, which makes the ground worth fighting over. A neutral field strips weaknesses and resistances instead, as the arenas'
// fields can. Adapted from Battlezoo Eldamon (Pathfinder); the numbers are homebrew. Pure.

import { beatenBy } from "./matchups.js";

export const NEUTRAL = "neutral";
export const FIELD_ELEMENTS = ["fire", "cold", "electricity", "water", "air", "earth", "wood", "metal", "poison", "acid", "sonic", "light", "darkness", "void", "vitality", "holy", NEUTRAL];
// (PF2e has a weakness and resistance type for all of these but darkness.)
const HAS_TYPE = new Set(FIELD_ELEMENTS.filter((element) => !["darkness", "holy", NEUTRAL].includes(element)));
const SCALED = "max(1,floor(@actor.level/2))";

export const fieldLabel = (element) => `${element[0].toUpperCase()}${element.slice(1)} field`;

export function fieldEffect(element) {
    const name = fieldLabel(element);
    // (A holy day's: a light field, and everyone heals.)
    if (element === "holy") {
        const light = fieldEffect("light");
        return { name, rules: light.rules, description: `${light.description.replace("Inside a light field", "Inside a holy field").replace(" Homebrew.", "")}, and it heals half its level (at least 1) at the end of its turn. Homebrew.` };
    }
    if (element === NEUTRAL) return { name, rules: [{ key: "Note", selector: "ac", title: name, text: "Weaknesses and resistances don't count here." }], description: "Inside a neutral field: no weaknesses or resistances. Immunities still count. Homebrew." };
    const weakTo = beatenBy(element).filter((other) => HAS_TYPE.has(other));
    return {
        name,
        rules: [
            { key: "FlatModifier", selector: "damage", type: "status", value: SCALED, label: name, predicate: [`item:trait:${element}`] },
            ...(HAS_TYPE.has(element) ? [{ key: "Resistance", type: element, value: SCALED }] : []),
            ...weakTo.map((other) => ({ key: "Weakness", type: other, value: SCALED }))
        ],
        description: `Inside ${/^[aeiou]/.test(element) ? "an" : "a"} ${element} field: half its level (at least 1) as a status bonus to damage from ${element} effects${HAS_TYPE.has(element) ? `, that much ${element} resistance` : ""}${weakTo.length ? `, and that much weakness to ${weakTo.join(" and ")}` : ""}. Homebrew.`
    };
}

// The next element in a cycle.
export const nextField = (cycle, current) => {
    if (!cycle?.length) return current;
    const index = cycle.indexOf(current);
    return cycle[(index + 1) % cycle.length];
};
