// What a hovered square tells the viewer: its surface's rules, its traits, and what elements do to it. Pure.

import { SURFACES, SURFACE_TRAITS } from "./surfaces.js";
import { SURFACE_REACTIONS } from "./reactions.js";
import { terrainRules } from "./terrain.js";

const capital = (word) => `${word[0].toUpperCase()}${word.slice(1)}`;

const damageLine = (hazard) => {
    if (!hazard) return null;
    const when = hazard.when === "enter" ? "for each square entered" : "for each square entered and at each turn's start";
    return `${hazard.formula} ${hazard.type} ${when}${hazard.persistent ? `, and ${hazard.persistent} persistent ${hazard.type}` : ""}.`;
};

// What an element does to it, in a word or two.
const outcome = (row) => (row.conduct ? "conducts" : row.drift ? "moves it" : row.to ? SURFACES[row.to]?.label.toLowerCase() ?? row.to : "clears it");

// { fixed: it doesn't change, as the environment module's water }.
export function surfaceInfo(material, { fixed = false } = {}) {
    const rules = terrainRules(material);
    const lines = rules.hazard ? [damageLine(rules.hazard), ...rules.summary.filter((line) => !/damage/i.test(line))] : rules.summary;
    const reactions = SURFACE_REACTIONS.filter((row) => row.surfaces.includes(material) && (!fixed || row.conduct)).map((row) => `${capital(row.element)}: ${outcome(row)}`);
    return { title: SURFACES[material]?.label ?? material, lines: lines.length ? lines : ["Nothing until an element touches it."], traits: SURFACE_TRAITS[material] ?? [], reactions };
}
