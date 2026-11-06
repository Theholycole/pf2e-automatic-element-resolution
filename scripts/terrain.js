// A surface's rules in play (src/terrain.js): its region's behaviors, the Effect a creature holds inside it, and its events. The script
// behavior reaches this module through CONFIG, on the active GM's client.

import { MODULE_ID, creatureOf, isActiveGM, ruleSquaresOf, surfaceMaterial, surfaceDC, hazardFormula } from "./foundry.js";
import { postPlan, stackState } from "./cards.js";
import { fieldEffect } from "../src/fields.js";
import { balancePlan, effectRulesFor, greasePlan, hazardPlan, steady, terrainRules } from "../src/terrain.js";
import { SURFACES, touches } from "../src/surfaces.js";

const SCRIPT = `if (game.users.activeGM?.id !== game.user.id) return;\nawait CONFIG.pf2eElementResolution?.regionEvent?.(region, behavior, event);`;
const EVENTS = ["tokenEnter", "tokenExit", "tokenMoveIn", "tokenMoveWithin", "tokenTurnStart"];
const handledMoves = new Set();
const adding = new Set();

const rulesOf = (region, actor = null) => (fieldOf(region) ? fieldRules(fieldOf(region)) : terrainRules(surfaceMaterial(region), { dc: surfaceDC(actor), hazardFormula: hazardFormula() }));
const fieldOf = (region) => region?.flags?.[MODULE_ID]?.field ?? null;
const fieldRules = (element) => {
    const { name, rules, description } = fieldEffect(element);
    return { material: `field-${element}`, label: name, feature: null, costs: {}, environment: [], effect: { name, rules }, balance: null, hazard: null, summary: [description] };
};
const ignoredOf = (actor) => {
    const terrain = actor?.system?.movement?.terrain;
    return { difficult: [...(terrain?.difficult?.ignored ?? [])], greater: [...(terrain?.greater?.ignored ?? [])] };
};
const insideEffects = (actor, region) => (actor?.itemTypes?.effect ?? []).filter((effect) => effect.flags?.[MODULE_ID]?.region === region.uuid);
const isCreature = (actor) => Boolean(actor?.isOfType?.("creature"));
// (PF2e's isAffectedBy answers for void and vitality on the undead, and doesn't look at immunities.)
const immuneTo = (actor, type) => actor?.isAffectedBy?.(type) === false || (actor?.attributes?.immunities ?? []).some((immunity) => immunity.type === type);
const isCloud = (region) => Boolean(SURFACES[surfaceMaterial(region)]?.cloud);
export { fieldOf };

// A marked field's script for its events.
export async function applyFieldRegion(region) {
    await region.createEmbeddedDocuments("RegionBehavior", [{ type: "executeScript", name: `${region.name}: events`, system: { source: SCRIPT, events: EVENTS }, flags: { [MODULE_ID]: { terrain: true } } }]);
    await syncInside(region);
}

// A new surface's behaviors: costs, environment types, and the script for its events.
export async function applyTerrain(region) {
    const rules = rulesOf(region);
    const flags = { [MODULE_ID]: { terrain: true } };
    const behaviors = [
        ...(Object.keys(rules.costs).length ? [{ type: "modifyMovementCost", name: `${rules.label}: movement`, system: { difficulties: rules.costs }, flags }] : []),
        ...(rules.environment.length ? [{ type: "environment", name: `${rules.label}: environment`, system: { environmentTypes: rules.environment, mode: "add" }, flags }] : []),
        ...(rules.effect || rules.balance || rules.hazard ? [{ type: "executeScript", name: `${rules.label}: events`, system: { source: SCRIPT, events: EVENTS }, flags }] : [])
    ];
    if (behaviors.length) await region.createEmbeddedDocuments("RegionBehavior", behaviors);
    await syncInside(region);
}

async function addInside(token, region) {
    const actor = token.actor;
    const rules = rulesOf(region, actor);
    // (Painting and the region's own enter event can arrive together: one Effect.)
    const key = `${actor.uuid}:${region.uuid}`;
    if (!rules.effect || insideEffects(actor, region).length || adding.has(key)) return;
    const effectRules = effectRulesFor(rules, ignoredOf(actor));
    if (!effectRules.length) return;
    adding.add(key);
    try {
        await actor.createEmbeddedDocuments("Item", [{
            name: rules.effect.name, type: "effect", img: "icons/environment/wilderness/terrain-rocky-ground.webp",
            system: { slug: `elements-surface-${rules.material}`, duration: { value: -1, unit: "unlimited", expiry: null, sustained: false }, rules: effectRules, description: { value: `<ul>${rules.summary.map((line) => `<li>${line}</li>`).join("")}</ul>` } },
            flags: { [MODULE_ID]: { region: region.uuid } }
        }]);
    } finally {
        adding.delete(key);
    }
}

async function removeInside(actor, region) {
    const held = insideEffects(actor, region);
    if (held.length) await actor.deleteEmbeddedDocuments("Item", held.map((item) => item.id));
}

// The Effect on exactly those inside it now: after painting, and when a reaction changes the ground.
export async function syncInside(region) {
    if (!rulesOf(region).effect) return;
    const squares = ruleSquaresOf(region);
    for (const token of region.parent.tokens) {
        if (!isCreature(token.actor)) continue;
        if (touches(creatureOf(token), squares, { cloud: isCloud(region) || Boolean(fieldOf(region)) })) await addInside(token, region);
        else await removeInside(token.actor, region);
    }
}

// A surface gone: nobody keeps its Effect.
export async function onSurfaceDeleted(region) {
    if (!isActiveGM() || !(surfaceMaterial(region) || fieldOf(region))) return;
    for (const token of region.parent.tokens) if (token.actor) await removeInside(token.actor, region);
}

const bestStatistic = (actor, statistics) => statistics.reduce((best, slug) => ((actor.getStatistic?.(slug)?.mod ?? -Infinity) > (actor.getStatistic?.(best)?.mod ?? -Infinity) ? slug : best), statistics[0]);

// Oil just painted: those standing there pick up a stack and save, as Grease.
export async function onOilPainted(scene, keys) {
    for (const token of scene.tokens) {
        if (!isCreature(token.actor) || !touches(creatureOf(token), keys)) continue;
        await stackState(token.actor, "oil", 1);
        const rules = terrainRules("oil", { dc: surfaceDC(token.actor) });
        await postPlan(greasePlan(rules, token, bestStatistic(token.actor, rules.balance.statistics)), scene);
    }
}

// A surface's event (its script behavior).
export async function regionEvent(region, behavior, event) {
    if (!isActiveGM() || !(surfaceMaterial(region) || fieldOf(region))) return;
    const token = event?.data?.token;
    if (!isCreature(token?.actor)) return;
    const rules = rulesOf(region, token.actor);
    const aloft = !isCloud(region) && !fieldOf(region) && ((token._source ?? token).elevation ?? 0) > 0;
    switch (event.name) {
        case "tokenEnter":
            if (!aloft) await addInside(token, region);
            return;
        case "tokenExit":
            await removeInside(token.actor, region);
            return;
        case "tokenMoveIn":
        case "tokenMoveWithin": {
            const movement = event.data.movement;
            // (Ctrl-Z taking the move back isn't a move: scripts/carry.js undoes what the move did.)
            if (aloft || movement?.method === "undo") return;
            // (Foundry splits a move at the region's edge, in and then within: one move, one card.)
            const key = `${region.id}:${token.id}:${movement?.subpathId ?? movement?.chain?.[0] ?? movement?.id ?? Date.now()}`;
            if (handledMoves.has(key)) return;
            handledMoves.add(key);
            setTimeout(() => handledMoves.delete(key), 60000);
            const forced = (movement?.passed?.waypoints ?? []).every((point) => point.action === "displace");
            if (rules.balance && !forced && !steady(rules, ignoredOf(token.actor))) await postPlan(balancePlan(rules, token, bestStatistic(token.actor, rules.balance.statistics), movement?.origin ?? null), region.parent, { fromMove: token.id });
            if (rules.hazard && !immuneTo(token.actor, rules.hazard.type)) await postPlan(hazardPlan(rules, token), region.parent, { fromMove: token.id });
            return;
        }
        case "tokenTurnStart":
            if (rules.hazard && rules.hazard.when !== "enter" && !aloft && !immuneTo(token.actor, rules.hazard.type)) await postPlan(hazardPlan(rules, token), region.parent);
            return;
    }
}
