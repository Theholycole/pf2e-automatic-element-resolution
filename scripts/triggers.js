// Where an element arrives from:
//   a damage roll with a named target (a Strike): the roll's message says who, and how much;
//   an effect's area: PF2e's region carries the effect's traits, so it changes the ground it covers;
//   damage applied: the core's damage listener says who it really hit, which is the only way to know for a saving-throw spell. The
//   amount comes from the roll's message, since Apply may already have halved it.
// A card comes once for each roll and reaction. Damage marked as conducted sets off nothing.

import { CONDUCTED, cardOf, dropTarget, postPlan } from "./cards.js";
import { MODULE_ID, creatureOf, creaturesOf, damageOf, dcFrom, hazardFormula, isActiveGM, ruleSettings, squareAt, surfacesOf, tickSettings, writeAges } from "./foundry.js";
import { isRaining, isSoakingRain, skySquares, syncRain } from "./environment.js";
import { creaturePlans, elementsFrom, puddlePlan, surfacePlans } from "../src/reactions.js";
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
        const once = `${key}:${plan.key}:${plan.material ?? plan.targets?.[0] ?? ""}`;
        if (!cardFor(once)) await postPlan(plan, scene, { from: key, once });
    }
}

// A creature hit: what it touches reacts, and so does the creature.
async function react({ scene, token, elements, actor, item, key }) {
    const direct = directOf(key, token.id);
    const creature = creatureOf(token);
    const dc = dcFrom(actor, item);
    await postOnce(surfacePlans({ elements, contact: (creature.elevation ?? 0) > 0 ? [] : creature.squares, surfaces: surfacesOf(scene), creatures: creaturesOf(scene), direct, dc, hazardFormula: hazardFormula(), settings: ruleSettings() }), scene, key);
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

// An effect's area placed: the ground under it changes. Its damage isn't known here, so nothing conducts from this alone.
export async function onRegionCreated(region) {
    if (!game.users.activeGM?.isSelf || !region.flags?.pf2e?.areaShape) return;
    const origin = region.flags.pf2e.origin ?? {};
    const elements = elementsFrom({ traits: origin.traits ?? [] }).filter(({ element }) => element !== "electricity");
    if (!elements.length) return;
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
    const item = origin.uuid ? await fromUuid(origin.uuid).catch(() => null) : null;
    const plans = surfacePlans({ elements, contact, surfaces: surfacesOf(scene), creatures: creaturesOf(scene), dc: dcFrom(item?.actor, item), hazardFormula: hazardFormula(), settings: ruleSettings() });
    await postOnce(plans, scene, region.id);
    if (elements.some(({ element }) => element === "water")) {
        const puddle = puddlePlan(origin.name ?? "The water", contact, surfacesOf(scene));
        if (puddle) await postOnce([puddle], scene, region.id);
    }
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
    const surfaces = surfacesOf(scene);
    const sky = isRaining(scene) ? skySquares(scene) : null;
    const puddles = isSoakingRain(scene) ? rainPuddles(bareSquares(scene, surfaces).filter((key) => sky.has(key)), game.settings.get(MODULE_ID, "rainPuddles"), (n) => Math.floor(CONFIG.Dice.randomUniform() * n)) : null;
    if (!surfaces.length && !puddles) return;
    const d20 = () => Math.ceil(CONFIG.Dice.randomUniform() * 20);
    const { ages, changes } = tickSurfaces(surfaces, { ...tickSettings(), d20, rain: sky ?? false });
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
    if (conducted || !game.user.isGM) return;
    const token = params.token?.document ?? params.token ?? actor.getActiveTokens?.(true, true)?.[0];
    const scene = token?.parent;
    if (!scene) return;
    // (A persistent tick isn't an element arriving: a burning creature doesn't boil the puddle it steps in.)
    const applied = damageOf(params.damage);
    if (applied.length && applied.every((part) => part.persistent)) return;
    const item = params.item ?? null;
    const message = rollMessageOf(item);
    const elements = elementsFrom({ damage: damageOf(message?.rolls?.[0] ?? params.damage), traits: message?.flags?.pf2e?.context?.traits ?? item?.system?.traits?.value ?? [] });
    if (!elements.length) return;
    return () => {
        react({ scene, token, elements, actor: item?.actor ?? message?.actor ?? null, item, key: message?.id ?? `apply:${token.id}:${Date.now()}` }).catch((error) => console.error(`${MODULE_ID} |`, error));
    };
}
