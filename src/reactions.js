// What happens when an element touches a surface or a creature: the reaction table, and the plan for a card. All of it is homebrew; the
// comments name the official text a row leans on. Pure: the Foundry side reads the world into plain data and carries out the plan.

import { SURFACES, bodyFrom, movedSquares, touches } from "./surfaces.js";
import { breaksSurface } from "./matchups.js";

export const DEFAULTS = { conductFraction: 0.5, conductReach: 30 };

// A damage roll or an effect's traits, as elements: [{ element, amount }]. Persistent damage doesn't count toward the amount.
const ELEMENT_WORDS = { electricity: "electricity", fire: "fire", cold: "cold", water: "water", air: "air", earth: "earth", wood: "wood", plant: "wood", metal: "metal", poison: "poison", acid: "acid", sonic: "sonic", light: "light", darkness: "darkness", shadow: "darkness", void: "void", death: "void", vitality: "vitality", healing: "vitality" };
export function elementsFrom({ damage = [], traits = [] } = {}) {
    const amounts = new Map();
    for (const part of damage) {
        const element = ELEMENT_WORDS[part.type];
        if (!element) continue;
        amounts.set(element, (amounts.get(element) ?? 0) + (part.persistent ? 0 : Number(part.total) || 0));
    }
    for (const trait of traits) {
        const element = ELEMENT_WORDS[trait];
        if (element && !amounts.has(element)) amounts.set(element, 0);
    }
    return [...amounts].map(([element, amount]) => ({ element, amount }));
}

// Element on a surface. to: the body becomes this material (null: gone). conduct: halved damage to the others on it. hazard: its own
// damage, from GM Core's environmental table. check: on a save, what each degree adds.
export const SURFACE_REACTIONS = [
    // (Nothing official for water. Shocking Grasp and Thunderstrike are hard on metal armor.)
    { key: "conduct", element: "electricity", surfaces: ["water", "metal"], title: "Lightning through the {surface}", conduct: true },
    // (Oil, 1 pint: 1d6 fire on a splash. The Oil Explosion hazard: basic Reflex for everyone there.)
    { key: "ignite-oil", element: "fire", surfaces: ["oil"], title: "The oil catches fire", to: "burning", hazard: true, persistentOnFailure: "1d6" },
    { key: "ignite-plants", element: "fire", surfaces: ["plants", "thicket", "grass", "bramble", "flowers"], title: "Fire catches in the {surface}", to: "burning" },
    // (Mist, for the cloud's concealment.)
    { key: "boil", element: "fire", surfaces: ["water"], title: "The water boils into steam", to: "steam" },
    { key: "melt", element: "fire", surfaces: ["ice"], title: "The ice melts", to: "water" },
    // (Quench and Sea Surge put out non-magical fires.)
    { key: "douse", element: "water", surfaces: ["burning"], title: "The water puts out the fire", to: "water" },
    { key: "smother", element: "cold", surfaces: ["burning"], title: "The cold puts out the fire", to: null },
    { key: "freeze", element: "cold", surfaces: ["water"], title: "The water freezes", to: "ice", save: { failure: "immobilized" } },
    // (Gust of Wind, as written: disperses fog and mist, puts out small non-magical fires. Air moves a cloud away from its source; with no source, it scatters.)
    { key: "drift", element: "air", surfaces: ["steam", "embers", "toxic", "miasma", "frostfog", "dust"], title: "The wind moves the {surface}", drift: true, to: null },
    { key: "gust", element: "air", surfaces: ["burning"], title: "The wind blows the fire out", to: null },
    // From the element chart (see matchups.js): what's weak to what, as things that make sense on a battlefield.
    { key: "mud", element: "earth", surfaces: ["water"], title: "The water turns to mud", to: "mud" },
    { key: "bury", element: "earth", surfaces: ["burning"], title: "The earth smothers the fire", to: null },
    { key: "crush", element: "earth", surfaces: ["ice"], title: "The ice is crushed to rubble", to: "rubble" },
    { key: "dry-mud", element: "air", surfaces: ["mud"], title: "The wind dries the mud", to: null },
    { key: "drink", element: "wood", surfaces: ["water", "mud"], title: "Plants drink up the {surface}", to: "plants" },
    { key: "grow", element: "water", surfaces: ["plants"], title: "The plants grow into a thicket", to: "thicket" },
    { key: "frost-thicket", element: "cold", surfaces: ["thicket"], title: "Frost kills back the thicket", to: "plants" },
    { key: "frost", element: "cold", surfaces: ["plants"], title: "Frost kills the plants", to: null },
    { key: "blight-thicket", element: "poison", surfaces: ["thicket"], title: "Poison kills back the thicket", to: "plants" },
    { key: "blight", element: "poison", surfaces: ["plants"], title: "Poison kills the plants", to: null },
    { key: "shatter", element: "metal", surfaces: ["ice"], title: "The ice shatters", to: null },
    { key: "shatter-sound", element: "sonic", surfaces: ["ice"], title: "The ice shatters", to: null },
    { key: "corrode", element: "acid", surfaces: ["metal"], title: "The acid eats the metal away", to: null },
    { key: "dispel-darkness", element: "light", surfaces: ["darkness"], title: "The light drives out the darkness", to: null },
    { key: "dispel-light", element: "darkness", surfaces: ["light"], title: "The darkness swallows the light", to: null },
    { key: "cleanse", element: "light", surfaces: ["death"], title: "The light cleanses the deathly ground", to: null },
    { key: "restore", element: "vitality", surfaces: ["death"], title: "Life returns to the deathly ground", to: null },
    { key: "wither", element: "void", surfaces: ["life"], title: "The living ground withers", to: null },
    { key: "shade", element: "darkness", surfaces: ["life"], title: "The darkness smothers the living ground", to: null },
    // New ground.
    { key: "fulgurite", element: "electricity", surfaces: ["sand"], title: "The sand fuses into glass", to: "glass" },
    { key: "fuse", element: "fire", surfaces: ["sand"], title: "The sand fuses into glass", to: "glass" },
    { key: "thaw", element: "fire", surfaces: ["snow"], title: "The snow melts", to: "water" },
    { key: "wet-sand", element: "water", surfaces: ["sand"], title: "The sand turns to mud", to: "mud" },
    { key: "scour", element: "air", surfaces: ["sand"], title: "The wind lifts the sand", to: "dust" },
    { key: "smash", element: "earth", surfaces: ["glass"], title: "The glass is ground to sand", to: "sand" },
    { key: "shriek", element: "sonic", surfaces: ["glass"], title: "The glass shatters to nothing", to: null },
    { key: "quench", element: "water", surfaces: ["lava"], title: "The lava cools to rock", to: "rubble" },
    { key: "quench-cold", element: "cold", surfaces: ["lava"], title: "The lava cools to rock", to: "rubble" },
    { key: "dilute", element: "water", surfaces: ["acid"], title: "The water dilutes the acid", to: "water" },
    { key: "tangle", element: "wood", surfaces: ["grass"], title: "The grass knots into brambles", to: "bramble" },
    { key: "bloom", element: "vitality", surfaces: ["plants", "grass"], title: "The plants burst into flower", to: "flowers" },
    { key: "wilt", element: "poison", surfaces: ["flowers", "grass"], title: "Poison kills the plants", to: null },
    { key: "frost-grass", element: "cold", surfaces: ["grass", "flowers", "bramble"], title: "Frost kills the plants", to: null },
    { key: "water-grass", element: "water", surfaces: ["grass"], title: "The grass thickens", to: "thicket" },
    // Clouds and air.
    { key: "fan", element: "fire", surfaces: ["gale"], title: "The gale fans into an ember cloud", to: "embers" },
    { key: "freeze-gale", element: "cold", surfaces: ["gale"], title: "The gale freezes into fog", to: "frostfog" },
    { key: "douse-embers", element: "water", surfaces: ["embers"], title: "The water turns the embers to steam", to: "steam" },
    { key: "chill-embers", element: "cold", surfaces: ["embers"], title: "The cold puts out the embers", to: null },
    { key: "chill-steam", element: "cold", surfaces: ["steam"], title: "The steam freezes into fog", to: "frostfog" },
    { key: "melt-fog", element: "fire", surfaces: ["frostfog"], title: "The fog turns to steam", to: "steam" },
    { key: "wash-dust", element: "water", surfaces: ["dust"], title: "The water settles the dust", to: "mud" },
    { key: "explode", element: "fire", surfaces: ["toxic"], title: "The poison cloud explodes", to: "embers", hazard: true },
    { key: "foul-steam", element: "poison", surfaces: ["steam"], title: "The steam turns poisonous", to: "toxic" },
    { key: "clear-death", element: "vitality", surfaces: ["miasma"], title: "Life drives out the death cloud", to: null },
    { key: "burn-death", element: "light", surfaces: ["miasma"], title: "The light burns away the death cloud", to: null },
    { key: "clear-poison", element: "vitality", surfaces: ["toxic"], title: "Life clears the poison cloud", to: null },
    // Sow and harvest: a wood effect makes standing plants burst around those in them. It's never a creature walking past.
    { key: "harvest", element: "wood", surfaces: ["plants", "thicket", "bramble", "flowers"], title: "Harvest: thorns burst from the {surface}", to: null, hazard: true, damageType: "piercing", persistentOnFailure: null, onlyTouched: true, notTrail: true }
];

// Element on a creature that was hit.
export const CREATURE_REACTIONS = [
    // (Personal Rain Cloud: wet, fire resistance 2.)
    { key: "soak", element: "water", title: "{name} is soaked", add: "wet", unless: "wet" },
    { key: "dry", element: "fire", when: "wet", title: "The fire dries {name} off", remove: "wet", note: "If this hit added persistent fire, remove it: the water took the flame." },
    { key: "shock-wet", element: "electricity", when: "wet", title: "{name} is shocked through the water", add: "shocked" },
    // (Frozen builds in value, so soaking a foe and then chilling it pays off.)
    { key: "chill", element: "cold", when: "wet", title: "The cold freezes {name} solid", degrees: { success: { stack: { key: "frozen", by: 1 } }, failure: { stack: { key: "frozen", by: 2 } }, criticalFailure: { stack: { key: "frozen", by: 4 } } } },
    { key: "thaw-creature", element: "fire", when: "frozen", title: "The fire thaws {name}", remove: "frozen" },
    { key: "ignite", element: "fire", when: "oil", title: "The oil on {name} goes up", removes: "oil", persistentFromOil: true },
    { key: "wash", element: "water", when: "oil", title: "The water washes the oil off {name}", remove: "oil" },
    { key: "limn", element: "light", title: "{name} is limned in light", add: "limned", unless: "limned" }
];

// What each element leaves if the GM wants it. Wood's is the Sow of the book's powers.
export const LEAVES = { water: "water", cold: "ice", earth: "rubble", wood: "plants", fire: "burning", poison: "toxic", acid: "acid", darkness: "darkness", light: "light", void: "miasma", vitality: "life", air: "gale", metal: "metal" };

// The whole way round the cloud from the source, in two squares (10 feet).
const awayFrom = (keys, source) => {
    const coords = keys.map((key) => key.split(",").map(Number));
    const dx = coords.reduce((sum, [x]) => sum + x, 0) / coords.length - source.x;
    const dy = coords.reduce((sum, [, y]) => sum + y, 0) / coords.length - source.y;
    return Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx) || 1, 0] : [0, Math.sign(dy) || 1];
};

const titled = (template, words) => template.replace(/\{(\w+)\}/g, (_, key) => words[key] ?? "");

// What each surface reaction does to a body, for the element on these squares: plans for the card.
// event: { elements, contact: [square keys], surfaces: [{ id, material, squares }], creatures: [{ id, squares, elevation, metalArmor }],
// direct: [creature ids already hit by the effect], dc, hazardFormula, settings }
export function surfacePlans(event) {
    const { elements = [], contact = [], surfaces = [], creatures = [], direct = [], dc = null, hazardFormula = null, settings = {}, local = false, source = null } = event;
    const { conductFraction, conductReach } = { ...DEFAULTS, ...settings };
    const plans = [];
    for (const { element, amount } of elements) {
        for (const reaction of SURFACE_REACTIONS.filter((row) => row.element === element)) {
            if (local && reaction.notTrail) continue;
            for (const material of reaction.surfaces) {
                // (Fixed ground, like a lake from the environment module, conducts but doesn't change.)
                const squares = surfaces.filter((surface) => surface.material === material && (reaction.conduct || !surface.fixed)).flatMap((surface) => surface.squares);
                const reach = reaction.conduct ? conductReach : Infinity;
                const body = bodyFrom(contact, squares, reach);
                if (!body.size) continue;
                // (The whole of it for what changes it: a flame lights all of a slick. Conduction only reaches so far. Local: only the squares
                // touched, for a creature walking by, though lit oil still goes up all at once.)
                const reached = [...body.keys()];
                const onlyTouched = reaction.onlyTouched || (local && !reaction.hazard && !reaction.conduct);
                const keys = onlyTouched ? reached.filter((key) => contact.includes(key)) : reached;
                if (!keys.length) continue;
                const whole = keys;
                const inBody = creatures.filter((creature) => !direct.includes(creature.id) && touches(creature, whole, { cloud: SURFACES[material]?.cloud }));
                const plan = { key: reaction.key, element, material, title: titled(reaction.title, { surface: SURFACES[material]?.label.toLowerCase() ?? material }), squares: keys, to: reaction.to, targets: [], damage: [], check: null, degrees: {}, notes: [] };
                if (reaction.conduct) {
                    if (!(amount > 0)) continue;
                    const share = Math.floor(amount * conductFraction);
                    if (share < 1 || !inBody.length) continue;
                    plan.targets = inBody.map((creature) => creature.id);
                    plan.damage = [{ amount: share, type: element }];
                    plan.check = { statistic: "reflex", basic: true, dc };
                    plan.penalties = Object.fromEntries(inBody.filter((creature) => creature.metalArmor).map((creature) => [creature.id, { value: -1, label: "Metal armor" }]));
                    plan.conducted = true;
                    // (Soaked through: all of it, and shocked if it fails. Setting things up should pay.)
                    plan.doubled = inBody.filter((creature) => creature.wet).map((creature) => creature.id);
                    plan.degrees = { failure: { condition: "shocked" }, criticalFailure: { condition: "shocked" } };
                    if (plan.doubled.length) plan.notes.push("Wet creatures take double this.");
                } else if (reaction.hazard) {
                    plan.targets = inBody.map((creature) => creature.id);
                    if (hazardFormula) plan.damage = [{ formula: hazardFormula, type: reaction.damageType ?? element }];
                    plan.check = { statistic: "reflex", basic: true, dc };
                    if (reaction.persistentOnFailure) plan.degrees = { failure: { persistent: reaction.persistentOnFailure }, criticalFailure: { persistent: reaction.persistentOnFailure } };
                } else if (reaction.drift && source) {
                    const [dx, dy] = awayFrom(keys, source);
                    plan.to = undefined;
                    plan.squares = [];
                    plan.changes = [{ material, to: null, keys, words: "" }, { material, to: material, keys: movedSquares(keys, dx * 2, dy * 2), words: "" }];
                } else if (reaction.save) {
                    plan.targets = inBody.map((creature) => creature.id);
                    plan.check = { statistic: "reflex", basic: false, dc };
                    plan.degrees = Object.fromEntries(Object.entries(reaction.save).map(([degree, condition]) => [degree, { condition }]));
                }
                plans.push(plan);
            }
        }
        // (The chart's answer for what no row covers, if the GM wants it: only the squares touched give way.)
        if (!settings.matchups) continue;
        for (const material of new Set(surfaces.map((surface) => surface.material))) {
            if (SURFACE_REACTIONS.some((row) => row.element === element && row.surfaces.includes(material)) || !breaksSurface(element, material)) continue;
            const touched = new Set(surfaces.filter((surface) => surface.material === material && !surface.fixed).flatMap((surface) => surface.squares));
            const keys = contact.filter((key) => touched.has(key));
            if (keys.length) plans.push({ key: `chart-${material}`, element, material, title: `The ${(SURFACES[material]?.label ?? material).toLowerCase()} gives way to ${element}`, squares: keys, to: null, targets: [], damage: [], check: null, degrees: {}, notes: [] });
        }
    }
    return plans;
}

// What a hit does to the creature itself. creature: { id, name, wet }.
// (Those on the ground can leave a puddle under them, if the GM wants one.)
export function creaturePlans({ elements = [], creature, dc = null }) {
    const plans = [];
    for (const { element } of elements) {
        for (const row of CREATURE_REACTIONS.filter((entry) => entry.element === element)) {
            if (row.when && !creature[row.when]) continue;
            if (row.unless && creature[row.unless]) continue;
            const degrees = row.degrees ?? (row.save ? Object.fromEntries(Object.entries(row.save).map(([degree, condition]) => [degree, { condition }])) : {});
            plans.push({
                key: row.key, element, title: titled(row.title, { name: creature.name }), targets: [creature.id], damage: [], squares: [],
                leave: row.add === "wet" && !(creature.elevation > 0) ? creature.squares ?? [] : [],
                add: row.add ? [row.add] : [], remove: row.remove ? [row.remove] : [], notes: row.note ? [row.note] : [],
                check: row.save || row.degrees ? { statistic: "reflex", basic: false, dc } : null,
                degrees: row.persistentFromOil ? { automatic: { persistent: `${creature.oil}d6` } } : degrees,
                ...(row.removes ? { remove: [row.removes] } : {})
            });
        }
    }
    return plans;
}

// An effect's area: the card that offers to leave its element's surface on the bare squares (none: no card).
export function leavePlan(name, element, contact, surfaces) {
    const material = LEAVES[element];
    const taken = new Set(surfaces.flatMap((surface) => surface.squares));
    const leave = contact.filter((key) => !taken.has(key));
    if (!material || !leave.length) return null;
    return { key: `leave-${element}`, element, title: element === "wood" ? `${name}: Sow` : `${name}: it could leave ${SURFACES[material].label.toLowerCase()}`, targets: [], damage: [], leave, leaveMaterial: material };
}

// A basic save's share of the damage.
export const BASIC_SAVE = { criticalSuccess: 0, success: 0.5, failure: 1, criticalFailure: 2 };
export const shareOf = (amount, degree) => Math.floor(amount * (BASIC_SAVE[degree] ?? 1));

// GM Core's DC by level (Table 10-5), for what comes from no one's spell or class DC.
const LEVEL_DCS = [14, 15, 16, 18, 19, 20, 22, 23, 24, 26, 27, 28, 30, 31, 32, 34, 35, 36, 38, 39, 40, 42, 44, 46, 48, 50];
export const levelDC = (level) => LEVEL_DCS[Math.max(0, Math.min(25, Math.round(Number(level) || 0)))];
