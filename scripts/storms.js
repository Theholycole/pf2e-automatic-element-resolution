// Elemental weather (src/storms.js), on the active GM's client: each new round, marked squares from last round get hit, and new ones are marked. The
// GM chooses it in the Elements window; the environment module's thunderstorm brings lightning by itself.

import { MODULE_ID, creaturesOf, hazardFormula, isActiveGM, sceneDC, surfacesOf, ruleSettings } from "./foundry.js";
import { postPlan } from "./cards.js";
import { groundWeather, skySquares } from "./environment.js";
import { STORMS, STRIKE_FEET, pickWarnings, strikePlan } from "../src/storms.js";
import { burstSquares, squareOf } from "../src/surfaces.js";
import { surfacePlans } from "../src/reactions.js";

const WARNING = "warning";
export const stormOf = (scene) => scene?.flags?.[MODULE_ID]?.storm ?? null;
export const setStorm = (scene, storm) => (storm ? scene.update({ [`flags.${MODULE_ID}.storm`]: storm }) : scene.unsetFlag(MODULE_ID, "storm"));
export const stormFireLasts = (scene) => Boolean(STORMS[stormOf(scene)?.key]?.fireLasts);

const warningsOf = (scene) => [...scene.regions].filter((region) => region.flags?.[MODULE_ID]?.[WARNING]);

async function strike(scene, region) {
    const { key, centre } = region.flags[MODULE_ID][WARNING];
    const storm = STORMS[key];
    await region.delete();
    if (!storm) return;
    const creatures = creaturesOf(scene);
    const dc = sceneDC(scene);
    const formula = hazardFormula().replace(/^(\d+)d/, (_, count) => `${Number(count) * 2}d`);
    const amount = (await new Roll(formula).evaluate()).total;
    const hit = strikePlan(storm, centre, creatures, { dc, amount });
    await postPlan(hit, scene);
    // (It reaches the ground too: lightning through a puddle, fire on oil.)
    for (const plan of surfacePlans({ elements: [{ element: storm.element, amount }], contact: burstSquares([centre], STRIKE_FEET), surfaces: surfacesOf(scene), creatures, direct: hit.targets, dc, hazardFormula: hazardFormula(), settings: ruleSettings() })) await postPlan(plan, scene);
}

async function mark(scene, key, centre, round) {
    const size = scene.grid.size;
    const shapes = burstSquares([centre], STRIKE_FEET).map((square) => {
        const [column, row] = squareOf(square);
        return { type: "rectangle", x: column * size, y: row * size, width: size, height: size };
    });
    await scene.createEmbeddedDocuments("Region", [{ name: `Warning: ${STORMS[key].label}`, color: "#ff3b30", shapes, visibility: CONST.REGION_VISIBILITY.ALWAYS, flags: { [MODULE_ID]: { [WARNING]: { key, centre, round } } } }]);
}

export async function stormRound(scene, round) {
    if (!isActiveGM()) return;
    for (const region of warningsOf(scene)) if (region.flags[MODULE_ID][WARNING].round < round) await strike(scene, region);
    const chosen = stormOf(scene);
    const key = chosen?.key ?? (groundWeather(scene).thunderstorm ? "lightning" : null);
    if (!key || !STORMS[key]) return;
    const open = [...skySquares(scene)];
    for (const centre of pickWarnings(open, chosen?.count ?? 1, (n) => Math.floor(CONFIG.Dice.randomUniform() * n))) await mark(scene, key, centre, round);
}
