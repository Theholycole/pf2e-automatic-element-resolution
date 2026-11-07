// Where an element arrives from:
//   a damage roll with a named target (a Strike): the roll's message says who, and how much;
//   an effect's area: PF2e's region carries the effect's traits, so it changes the ground it covers;
//   damage applied: the core's damage listener says who it really hit, which is the only way to know for a saving-throw spell. The
//   amount comes from the roll's message, since Apply may already have halved it.
// A card comes once for each roll and reaction. Damage marked as conducted sets off nothing.

import { CONDUCTED, cardOf, dropTarget, postPlan } from "./cards.js";
import { MODULE_ID, creatureOf, creaturesOf, damageOf, dcFrom, hazardFormula, isActiveGM, ruleSettings, sceneDC, squareAt, surfacesOf, tickSettings, writeAges } from "./foundry.js";
import { groundWeather, isSoakingRain, skySquares, syncRain } from "./environment.js";
import { burstObject, objectOfActor, objectsIn } from "./objects.js";
import { advanceFields } from "./fields.js";
import { stormRound, stormFireLasts } from "./storms.js";
import { onOilPainted } from "./terrain.js";
import { paintSquares } from "./foundry.js";
import { burstSquares, squareKey } from "../src/surfaces.js";
import { goesOff, setOff } from "../src/objects.js";
import { creaturePlans, elementsFrom, leavePlan, surfacePlans } from "../src/reactions.js";
import { rainPuddles, roundPlan, tickSurfaces } from "../src/ticks.js";

const recentCards = () => game.messages.contents.slice(-30).filter((message) => cardOf(message));
const cardFor = (once) => recentCards().find((message) => cardOf(message).once === once);

// (Direct hits a roll has made so far, by its message.)
const hitBy = new Map();
const directOf = (key, tokenId) => {
    if (!hitBy.has(key)) hitBy.set(key, new Set());
    if (tokenId) hitBy.get(key).add(tokenId);
    return [...hitBy.get(key)];
};

async function postOnce(plans, scene, key) {
    for (const plan of plans) {
        // (Two targets of one attack can each change their own square. Lightning through one body is one card, wherever it came in.)
        const once = `${key}:${plan.key}:${plan.material ?? plan.targets?.[0] ?? ""}:${plan.conducted ? "" : (plan.squares ?? []).join("|")}`;
        if (!cardFor(once)) await postPlan(plan, scene, { from: key, once });
    }
}

// Where an element's source stands, on the grid, for what it pushes away.
const sourceOf = (actor) => {
    const token = actor?.getActiveTokens?.(false, true)?.[0];
    if (!token) return null;
    const size = token.parent.grid.size;
    const stored = token._source ?? token;
    return { x: Math.floor(stored.x / size), y: Math.floor(stored.y / size) };
};

// A creature hit: what it touches reacts, and so does the creature.
async function react({ scene, token, elements, actor, item, key, creatureOnly = false }) {
    const direct = directOf(key, token.id);
    const creature = creatureOf(token);
    const dc = dcFrom(actor, item) ?? sceneDC(scene);
    if (!creatureOnly) await postOnce(surfacePlans({ source: sourceOf(actor), elements, contact: (creature.elevation ?? 0) > 0 ? [] : creature.squares, surfaces: surfacesOf(scene), creatures: creaturesOf(scene), direct, dc, hazardFormula: hazardFormula(scene), settings: ruleSettings() }), scene, key);
    await postOnce(creaturePlans({ elements, creature, dc }), scene, `${key}:${token.id}`);
    // (It may already be on a card from an earlier target of the same roll.)
    for (const message of recentCards()) if (cardOf(message).from === key && cardOf(message).conducted) await dropTarget(message, token.id);
}

// A damage roll's message, on the active GM's client. Only a named target tells us anything yet.
export async function onDamageMessage(message) {
    if (!message.isDamageRoll || !game.users.activeGM?.isSelf) return;
    const targetUuid = message.flags?.pf2e?.context?.target?.token;
    if (!targetUuid) return;
    const token = await fromUuid(targetUuid).catch(() => null);
    if (!token?.parent) return;
    const elements = elementsFrom({ damage: message.rolls.flatMap(damageOf), traits: message.flags.pf2e.context.traits });
    if (elements.length) await react({ scene: token.parent, token, elements, actor: message.actor, item: message.item, key: message.id });
}

// An effect's area placed: the ground under it changes, what's set off goes up, and its card can leave a surface. Its damage isn't known here,
// so nothing conducts from this alone. Grease is oil, so it pays to light it.
export async function onRegionCreated(region) {
    if (!game.users.activeGM?.isSelf || !region.flags?.pf2e?.areaShape) return;
    const origin = region.flags.pf2e.origin ?? {};
    const scene = region.parent;
    const size = scene.grid.size;
    const bounds = region.bounds ?? region.object?.bounds;
    const contact = [];
    if (bounds) {
        for (let x = Math.floor(bounds.x / size); x * size < bounds.right; x++) {
            for (let y = Math.floor(bounds.y / size); y * size < bounds.bottom; y++) {
                if (region.testPoint({ x: (x + 0.5) * size, y: (y + 0.5) * size, elevation: 0 })) contact.push(squareAt(scene, (x + 0.5) * size, (y + 0.5) * size));
            }
        }
    }
    if (origin.slug === "grease") {
        await paintSquares(scene, contact, "oil");
        await onOilPainted(scene, contact);
    }
    const all = elementsFrom({ traits: origin.traits ?? [] });
    if (!all.length) return;
    const item = origin.uuid ? await fromUuid(origin.uuid).catch(() => null) : null;
    const dc = dcFrom(item?.actor, item) ?? sceneDC(scene);
    await postOnce(surfacePlans({ source: sourceOf(item?.actor), elements: all, contact, surfaces: surfacesOf(scene), creatures: creaturesOf(scene), dc, hazardFormula: hazardFormula(scene), settings: ruleSettings() }), scene, region.id);
    for (const { token, object } of objectsIn(scene, contact)) if (setOff(object, all)) await burstObject(token, object);
    if (game.settings.get(MODULE_ID, "offerSurfaces")) {
        for (const { element } of all) {
            const plan = leavePlan(origin.name ?? "The effect", element, contact, surfacesOf(scene));
            if (plan) await postOnce([plan], scene, region.id);
        }
    }
}

// The elements a message's roll or ability carries, for aiming it at the ground. A damage roll's, or an ability's with no damage of its own to roll.
export function messageElements(message) {
    if (message.flags?.[MODULE_ID]) return [];
    if (message.isDamageRoll) return elementsFrom({ damage: message.rolls.flatMap(damageOf), traits: message.flags?.pf2e?.context?.traits ?? [] });
    if (message.rolls.length) return [];
    const item = message.flags?.pf2e?.origin?.uuid ? fromUuidSync(message.flags.pf2e.origin.uuid) : null;
    if (!item || Object.keys(item.system?.damage ?? {}).length) return [];
    return elementsFrom({ traits: item.system?.traits?.value ?? [] });
}

export const canvasSquare = (clientX, clientY) => {
    const point = canvas.canvasCoordinatesFromClient({ x: clientX, y: clientY });
    return squareAt(canvas.scene, point.x, point.y);
};

// A message's element, aimed at a square: what's there reacts. Whether anything did.
export async function reactAtSquare(message, scene, key) {
    const plans = surfacePlans({ source: sourceOf(message.actor), elements: messageElements(message), contact: [key], surfaces: surfacesOf(scene), creatures: creaturesOf(scene), dc: dcFrom(message.actor, message.item) ?? sceneDC(scene), hazardFormula: hazardFormula(scene), settings: ruleSettings() });
    await postOnce(plans, scene, `${message.id}:aim:${key}`);
    return plans.length > 0;
}

// An item's use: Sow where it stands, or Harvest what's near. Items carry what they do in their flags (scripts/items.js).
export async function onItemUsed(message) {
    const uuid = message.flags?.pf2e?.origin?.uuid;
    if (!uuid) return;
    const item = await fromUuid(uuid).catch(() => null);
    // (Oil, thrown: it splashes on whoever the thrower has targeted, lit or not. Only their own client knows that.)
    if (item?.slug === "oil-1-pint" && message.isAuthor) {
        const target = [...game.user.targets][0]?.document;
        if (target?.parent) await postOnce([{ key: "oil-splash", title: "The oil splashes", targets: [], damage: [], leave: creatureOf(target).squares, leaveMaterial: "oil" }], target.parent, message.id);
        return;
    }
    // (Grease has no area in PF2e's data, since it can also target an object: its 4 squares start at whoever the caster targeted, or the GM paints them.)
    if (item?.slug === "grease" && message.isAuthor) {
        const target = [...game.user.targets][0]?.document;
        const scene = target?.parent ?? item.actor?.getActiveTokens?.(false, true)?.[0]?.parent;
        if (!scene) return;
        const [column, row] = target ? creatureOf(target).squares[0].split(",").map(Number) : [];
        const leave = target ? [squareKey(column, row), squareKey(column + 1, row), squareKey(column, row + 1), squareKey(column + 1, row + 1)] : [];
        await postOnce([{ key: "grease-cast", title: "Grease makes oil", targets: [], damage: [], leave, leaveMaterial: "oil", notes: [target ? "Or paint its 4 squares from the Elements window." : "Paint its 4 squares from the Elements window, or target a creature first to place them here."] }], scene, message.id);
        return;
    }
    if (!game.users.activeGM?.isSelf) return;
    const use = item?.flags?.[MODULE_ID]?.use;
    const token = item?.actor?.getActiveTokens?.(false, true)?.[0];
    if (!use || !token?.parent) return;
    const scene = token.parent;
    const creature = creatureOf(token);
    const contact = burstSquares(creature.squares, use.feet ?? 10);
    if (use.harvest) {
        await postOnce(surfacePlans({ elements: [{ element: "wood", amount: 0 }], contact, surfaces: surfacesOf(scene), creatures: creaturesOf(scene), direct: [token.id], dc: dcFrom(item.actor, item) ?? sceneDC(scene), hazardFormula: hazardFormula(scene), settings: ruleSettings() }).filter((plan) => plan.key === "harvest"), scene, message.id);
        return;
    }
    const plan = leavePlan(item.name, use.element, contact, surfacesOf(scene));
    if (plan) await postOnce([plan], scene, message.id);
}

function bareSquares(scene, surfaces) {
    const taken = new Set(surfaces.flatMap((surface) => surface.squares));
    const { sceneRect: { x, y, width, height } } = scene.dimensions;
    const size = scene.grid.size;
    const keys = [];
    for (let px = x; px < x + width; px += size) for (let py = y; py < y + height; py += size) {
        const key = squareAt(scene, px + size / 2, py + size / 2);
        if (!taken.has(key)) keys.push(key);
    }
    return keys;
}

// A new round: the squares age, and the GM gets one card for what the ground does. A card left unapplied gives way to the new one; what it
// held comes up again, since the squares are still old enough.
export async function onCombatUpdate(combat, change, options) {
    if (!isActiveGM() || options?.direction !== 1 || !("round" in change) || !(combat.previous?.round < change.round)) return;
    const scene = combat.scene ?? game.scenes.viewed;
    if (!scene) return;
    await syncRain(scene);
    await advanceFields(scene, change.round);
    await stormRound(scene, change.round);
    const surfaces = surfacesOf(scene);
    const weather = groundWeather(scene);
    const puddles = isSoakingRain(scene) ? rainPuddles(bareSquares(scene, surfaces).filter((key) => skySquares(scene).has(key)), game.settings.get(MODULE_ID, "rainPuddles"), (n) => Math.floor(CONFIG.Dice.randomUniform() * n)) : null;
    if (!surfaces.length && !puddles) return;
    const d20 = () => Math.ceil(CONFIG.Dice.randomUniform() * 20);
    const settings = tickSettings();
    if (weather.hot) settings.lives.water = Math.ceil(settings.lives.water / 2);
    const { ages, changes } = tickSurfaces(surfaces, { ...settings, d20, rain: weather.rain, wind: weather.wind, freezing: weather.freezing, fireLasts: stormFireLasts(scene) });
    await writeAges(scene, ages);
    const stale = recentCards().filter((message) => cardOf(message).key === "round" && cardOf(message).sceneId === scene.id && !cardOf(message).done).map((message) => message.id);
    if (stale.length) await ChatMessage.deleteDocuments(stale);
    const plan = roundPlan(puddles ? [...changes, puddles] : changes, change.round - 1);
    if (plan) await postPlan(plan, scene);
}

// The roll an application came from: the latest damage message from this item, or the application itself.
const rollMessageOf = (item) => (item ? game.messages.contents.slice(-30).reverse().find((message) => message.isDamageRoll && (message.flags?.pf2e?.origin?.uuid === item.uuid)) : null);

// Core's damage listener: before the damage lands. It can't wait on cards, so they follow it.
export function onApplyDamage(actor, params) {
    const options = params.rollOptions;
    const conducted = options instanceof Set ? options.has(CONDUCTED) : Array.isArray(options) && options.includes(CONDUCTED);
    // (Whoever applied it, the GM or a player on their own creature, posts the card; only the GM can Apply it.)
    const token = params.token?.document ?? params.token ?? actor.getActiveTokens?.(false, true)?.[0];
    const scene = token?.parent;
    if (!scene) return;
    // (A persistent tick isn't an element arriving: a burning creature doesn't boil the puddle it steps in.)
    const applied = damageOf(params.damage);
    if (applied.length && applied.every((part) => part.persistent)) return;
    const item = params.item ?? null;
    const message = rollMessageOf(item);
    const elements = elementsFrom({ damage: damageOf(message?.rolls?.[0] ?? params.damage), traits: message?.flags?.pf2e?.context?.traits ?? item?.system?.traits?.value ?? [] });
    // (An object: being destroyed, or the right element, sets it off.)
    const object = objectOfActor(actor);
    if (object) {
        return () => {
            if (goesOff(object, elements, actor.hitPoints?.value ?? 1)) burstObject(token, object).catch((error) => console.error(`${MODULE_ID} |`, error));
        };
    }
    if (!elements.length) return;
    return () => {
        // (Damage from a card sets off nothing on the ground, but it can still light the oil on a creature.)
        react({ scene, token, elements, actor: item?.actor ?? message?.actor ?? null, item, key: message?.id ?? `apply:${token.id}:${Date.now()}`, creatureOnly: conducted }).catch((error) => console.error(`${MODULE_ID} |`, error));
    };
}
