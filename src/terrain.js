// What a surface does while it's there: movement costs, the Effect a creature holds inside it, the check for moving onto it, and damage
// for being in it. Official rules where they exist. Pure.
//   ice: GM Core's ice (the core's featureRules).
//   plants: GM Core's light undergrowth (the core's featureRules).
//   oil: Grease's Balance, against Reflex or Acrobatics. A creature that Steps or Crawls doesn't check.
//   steam: Mist's concealment for those inside it.
//   thicket: GM Core's heavy undergrowth. mud: GM Core's shallow bog. rubble: GM Core's rubble.
//   darkness: concealed inside, as steam.
//   burning: homebrew. GM Core's wildfire flames deal moderate damage on entry; this uses the world's category, on entry and at the start
//   of each turn, with the 1d6 persistent fire of lit oil.
//   death: homebrew. The world's damage category, in void, on entry and at the start of each turn (the undead aren't affected).
//   life: homebrew. Fast healing 1 inside.
//   light: nothing until an element touches it.
//   water and metal: nothing until an element touches them.

import { featureRules, sureFooted } from "../../pf2e-resolution-core/src/environment/terrain.js";
import { SURFACES } from "./surfaces.js";

// "2d6" to "4d6".
const doubled = (formula) => formula.replace(/^(\d+)d/, (_, count) => `${Number(count) * 2}d`);

const CONCEALED = "Compendium.pf2e.conditionitems.Item.DmAIPqOBomZ7H95W";

const BALANCE_NOTE = "Critical success: it moves on normally. Success: it moves on, treating this as difficult terrain. Failure: it stays where it was (the action wasted). Critical failure: it stays where it was and falls prone.";

const fromFeature = (material, key, dc) => {
    const rules = featureRules(key, { dc });
    return {
        material, label: SURFACES[material].label, feature: key, costs: Object.fromEntries(Object.entries(rules.costs).filter(([, cost]) => cost > 1)), environment: rules.environment,
        effect: rules.effect ? { name: `Surface: ${SURFACES[material].label}`, rules: rules.effect.rules } : null,
        balance: rules.events.balance ? { statistics: ["acrobatics"], dc: rules.dc } : null,
        hazard: null, summary: rules.summary
    };
};

// A material's rules. dc: the DC for a check on it; hazardFormula: the world's environmental damage.
export function terrainRules(material, { dc = null, hazardFormula = null } = {}) {
    const bare = { material, label: SURFACES[material]?.label ?? material, feature: null, costs: {}, environment: [], effect: null, balance: null, hazard: null, summary: [] };
    switch (material) {
        case "ice": return fromFeature(material, "ice", dc);
        case "plants": return fromFeature(material, "undergrowth-light", dc);
        case "thicket": return fromFeature(material, "undergrowth-heavy", dc);
        case "mud": return fromFeature(material, "bog-shallow", dc);
        case "rubble": return fromFeature(material, "rubble", dc);
        case "oil": return { ...bare, balance: { statistics: ["reflex", "acrobatics"], dc, note: "A creature that Steps or Crawls doesn't check: skip this card." }, summary: ["Moving onto it: Reflex or Acrobatics to Balance, as Grease."] };
        case "steam":
        case "darkness": return { ...bare, effect: { name: `Surface: ${bare.label}`, rules: [{ key: "GrantItem", uuid: CONCEALED, allowDuplicate: true, onDeleteActions: { granter: "cascade", grantee: "cascade" } }] }, summary: ["Concealed inside it."] };
        case "burning": return { ...bare, hazard: { formula: hazardFormula, type: "fire", persistent: "1d6", words: "burns in the flames" }, summary: ["Fire damage on entering and at the start of each turn in it, and 1d6 persistent fire."] };
        case "death": return { ...bare, hazard: { formula: hazardFormula, type: "void", words: "withers on the deathly ground" }, summary: ["Void damage on entering and at the start of each turn in it."] };
        case "life": return { ...bare, effect: { name: "Surface: Living ground", rules: [{ key: "FastHealing", value: 1 }] }, summary: ["Fast healing 1 inside it."] };
        case "flowers": return { ...bare, effect: { name: "Surface: Flowers", rules: [{ key: "FastHealing", value: 1 }] }, summary: ["Fast healing 1 inside it."] };
        case "sand": return fromFeature(material, "sand-shallow", dc);
        case "snow": return fromFeature(material, "snow", dc);
        case "bramble": return { ...fromFeature(material, "undergrowth-light", dc), hazard: { formula: hazardFormula, type: "piercing", when: "enter", words: "is cut up by the brambles" }, summary: ["Difficult terrain, and piercing damage for each move into it."] };
        case "glass": return { ...bare, hazard: { formula: hazardFormula, type: "piercing", when: "enter", words: "is cut by the broken glass" }, summary: ["Piercing damage for each move into it."] };
        case "grass": return { ...bare, effect: { name: "Surface: Tall grass", rules: [{ key: "GrantItem", uuid: CONCEALED, allowDuplicate: true, onDeleteActions: { granter: "cascade", grantee: "cascade" } }] }, summary: ["Concealed inside it."] };
        case "lava": return { ...bare, costs: { walk: 2 }, hazard: { formula: hazardFormula && doubled(hazardFormula), type: "fire", persistent: "2d6", words: "burns in the lava" }, summary: ["Difficult terrain, double fire damage on entering and at each turn's start, and 2d6 persistent fire."] };
        case "acid": return { ...bare, hazard: { formula: hazardFormula, type: "acid", words: "burns in the acid" }, summary: ["Acid damage on entering and at each turn's start."] };
        case "gale": return { ...bare, costs: { fly: 2 }, effect: { name: "Surface: Gale", rules: [{ key: "FlatModifier", selector: "attack", type: "circumstance", value: -1, label: "Gale", predicate: ["item:ranged"] }] }, summary: ["Difficult terrain for fliers, and \u22121 to ranged attacks from inside it."] };
        case "embers": return { ...bare, hazard: { formula: hazardFormula, type: "fire", words: "burns in the ember cloud" }, summary: ["Fire damage on entering and at each turn's start."] };
        case "toxic": return { ...bare, hazard: { formula: hazardFormula, type: "poison", words: "chokes on the poison cloud" }, summary: ["Poison damage on entering and at each turn's start. Fire explodes it."] };
        case "miasma": return { ...bare, hazard: { formula: hazardFormula, type: "void", words: "withers in the death cloud" }, summary: ["Void damage on entering and at each turn's start. Life and healing clear it."] };
        case "frostfog": return { ...bare, hazard: { formula: hazardFormula, type: "cold", words: "freezes in the fog" }, effect: { name: "Surface: Frost fog", rules: [{ key: "GrantItem", uuid: CONCEALED, allowDuplicate: true, onDeleteActions: { granter: "cascade", grantee: "cascade" } }] }, summary: ["Concealed inside it, and cold damage on entering and at each turn's start."] };
        case "dust": return { ...bare, effect: { name: "Surface: Dust cloud", rules: [{ key: "GrantItem", uuid: CONCEALED, allowDuplicate: true, onDeleteActions: { granter: "cascade", grantee: "cascade" } }] }, summary: ["Concealed inside it."] };
        case "light": return { ...bare, effect: { name: "Surface: Light", rules: [{ key: "Note", selector: "ac", title: "Limned", text: "Limned in light: it can't be concealed here." }] }, summary: ["Limned inside it: it can't be concealed."] };
        default: return bare;
    }
}

// The card for a move onto it: a failure keeps the creature where it started (origin), and a critical failure also knocks it prone.
export function balancePlan(rules, token, statistic, origin = null) {
    const back = origin ? { returnTo: { x: origin.x, y: origin.y, elevation: origin.elevation ?? 0 } } : {};
    return {
        key: `balance-${rules.material}`, title: `${rules.label}: Balance`, targets: [token.id], damage: [], check: { statistic, basic: false, dc: rules.balance.dc },
        degrees: { failure: back, criticalFailure: { ...back, condition: "prone" } }, notes: [BALANCE_NOTE, ...(rules.balance.note ? [rules.balance.note] : [])]
    };
}

// Grease, on those standing there when it appears: Reflex or Acrobatics, or fall prone.
export const greasePlan = (rules, token, statistic) => ({
    key: "grease", title: `${token.name} is caught on the oil`, targets: [token.id], damage: [], check: { statistic, basic: false, dc: rules.balance.dc },
    degrees: { failure: { condition: "prone" }, criticalFailure: { condition: "prone" } }, notes: []
});

// The card for being in it.
export const hazardPlan = (rules, token) => ({
    key: `hazard-${rules.material}`, element: rules.hazard.type, title: `${token.name} ${rules.hazard.words}`, targets: [token.id], check: null,
    damage: rules.hazard.formula ? [{ formula: rules.hazard.formula, type: rules.hazard.type }] : [],
    degrees: rules.hazard.persistent ? { automatic: { persistent: rules.hazard.persistent } } : {}, notes: []
});

// Whether a creature's own ignoring of this ground keeps it on its feet (no Balance, not off-guard). ignored: { difficult, greater }.
export const steady = (rules, ignored) => Boolean(rules.feature) && sureFooted(rules.feature, ignored);

// The Effect's rules for this creature.
export const effectRulesFor = (rules, ignored) => (rules.effect?.rules ?? []).filter((rule) => !(rule.flag === "terrainOffGuard" && steady(rules, ignored)));
