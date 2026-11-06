// Objects that burst when an element reaches them or when they're destroyed. Each element has a barrel for built places and something natural
// for the wilds. Homebrew; the barrel and the fungus are the same object in two coats. Pure.

import { SURFACES, burstSquares, touches } from "./surfaces.js";

const BARREL = "icons/svg/barrel.svg";
const STONE = "icons/commodities/stone/boulder-grey-blue.webp";
const MUSHROOM = "icons/consumables/potions/conical-mushroom-poison-red.webp";
const POD = "icons/commodities/flowers/dandelion-pod-white.webp";
const CRYSTAL = "icons/commodities/tech/battery-arcane-crystal-green.webp";
const LEAF = "icons/consumables/plants/leaf-veins-glowing-green.webp";

// label, element it holds, what sets it off (and being destroyed always does), the damage type, the surface it leaves, and how far.
const pair = (element, type, surface, triggers, barrel, natural, feet = 10) => [
    { key: `${element}-barrel`, ...barrel, element, type, surface, triggers, feet, natural: false, img: BARREL, hardness: 5, hp: 20 },
    { key: `${element}-natural`, ...natural, element, type, surface, triggers, feet, natural: true, hardness: natural.hardness ?? 5, hp: natural.hp ?? 20 }
];

export const OBJECTS = Object.fromEntries([
    ...pair("fire", "fire", "burning", ["fire", "electricity"], { label: "Oil barrel", tint: "#c9642b" }, { label: "Pitch pine", img: LEAF, tint: "#e29a4a" }, 15),
    ...pair("water", "bludgeoning", "water", ["electricity", "earth"], { label: "Water barrel", tint: "#3f7fd6" }, { label: "Spring stone", img: STONE, tint: "#7fb6e8", hardness: 10, hp: 40 }),
    ...pair("cold", "cold", "ice", ["fire", "sonic", "metal"], { label: "Frost barrel", tint: "#9fd8ee" }, { label: "Icicle cluster", img: CRYSTAL, tint: "#c9eefc" }),
    ...pair("electricity", "electricity", null, ["water", "metal", "electricity"], { label: "Storm barrel", tint: "#e8d24a" }, { label: "Lodestone", img: STONE, tint: "#efe07a", hardness: 10, hp: 40 }),
    ...pair("air", "bludgeoning", "gale", ["fire", "sonic"], { label: "Zephyr barrel", tint: "#bcd6e6" }, { label: "Wind gourd", img: POD, tint: "#dcecf5" }, 15),
    ...pair("earth", "bludgeoning", "rubble", ["sonic", "water"], { label: "Rubble barrel", tint: "#857a6c" }, { label: "Loose boulder", img: STONE, tint: "#a89a84", hardness: 10, hp: 40 }),
    ...pair("wood", "piercing", "plants", ["water", "vitality"], { label: "Seed barrel", tint: "#4f8a3a" }, { label: "Bursting seedpod", img: POD, tint: "#8bc466" }, 15),
    ...pair("metal", "slashing", "glass", ["sonic", "earth"], { label: "Scrap barrel", tint: "#8a8f98" }, { label: "Ore vein", img: STONE, tint: "#b0b6c0", hardness: 10, hp: 40 }),
    ...pair("poison", "poison", "toxic", ["fire", "air"], { label: "Poison barrel", tint: "#7c9a3a" }, { label: "Choke fungus", img: MUSHROOM, tint: "#a4c45a" }, 15),
    ...pair("acid", "acid", "acid", ["water", "metal"], { label: "Acid barrel", tint: "#9bbf2f" }, { label: "Bog blister", img: MUSHROOM, tint: "#c2dc5a" }),
    ...pair("sonic", "sonic", null, ["sonic", "electricity"], { label: "Thunder barrel", tint: "#a78ad6" }, { label: "Shriek fungus", img: MUSHROOM, tint: "#c6aef0" }, 15),
    ...pair("light", "fire", "light", ["darkness", "fire"], { label: "Sun barrel", tint: "#f3e7a1" }, { label: "Glowcap", img: MUSHROOM, tint: "#fbf0b0" }, 15),
    ...pair("darkness", "cold", "darkness", ["light", "void"], { label: "Shadow barrel", tint: "#3a3550" }, { label: "Gloom lichen", img: LEAF, tint: "#5a5478" }, 15),
    ...pair("void", "void", "miasma", ["vitality", "light"], { label: "Grave barrel", tint: "#5d5266" }, { label: "Grave moss", img: LEAF, tint: "#7d7088" }, 15),
    ...pair("vitality", "vitality", "life", ["void", "poison"], { label: "Holy water barrel", tint: "#b7e38f" }, { label: "Heartflower", img: POD, tint: "#d8f0a8" })
].map((entry) => [entry.key, entry]));

// Its burst's d6s by its level, 1st to 20th. Cole's call (2026-11-06), on the Combat Simulator's spell power scale: a basic Reflex save at GM Core's DC for
// the level, against 2 foes, rates about as a typical spell (within a tenth of a level, more at 1st), so a wider burst that catches 3 rates above it.
const BURST_DICE = [1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 15, 15, 16, 19, 19, 21, 23];
export const burstFormula = (level) => `${BURST_DICE[Math.max(0, Math.min(BURST_DICE.length - 1, Math.round(Number(level) || 1) - 1))]}d6`;

// What the Elements window says about it.
export function objectInfo(object, level) {
    const leaves = object.surface ? ` It leaves ${SURFACES[object.surface].label.toLowerCase()}.` : "";
    return { title: object.label, lines: [`At level ${level}: ${burstFormula(level)} ${object.type} in ${object.feet} feet, basic Reflex.${leaves}`, `Hardness ${object.hardness}, ${object.hp} Hit Points. ${object.triggers.map((word, index) => (index ? word : `${word[0].toUpperCase()}${word.slice(1)}`)).join(" or ")} sets it off, however little it deals.`] };
}

// What an object does when it goes: a save for those within reach, the ground, and a chain to whatever else this sets off.
export function burstPlan(object, tokenId, centres, creatures, { dc = null, formula = null, name = object.label } = {}) {
    const squares = burstSquares(centres, object.feet);
    return {
        key: "burst", element: object.element, title: `The ${name.toLowerCase()} bursts`, targets: creatures.filter((creature) => creature.id !== tokenId && touches(creature, squares)).map((creature) => creature.id),
        damage: formula ? [{ formula, type: object.type }] : [], check: { statistic: "reflex", basic: true, dc }, degrees: {}, squares: object.surface ? squares : [], material: null,
        ...(object.surface ? { to: object.surface } : {}), burst: { tokenId, element: object.element, squares },
        notes: object.surface ? [`It leaves ${SURFACES[object.surface].label.toLowerCase()}.`] : []
    };
}

export const setOff = (object, elements) => elements.some(({ element }) => object.triggers.includes(element));

// Does a hit make it burst? The right element always does, however little it deals, whatever its Hardness took off. Anything else has to destroy it.
export const goesOff = (object, elements, hitPoints) => setOff(object, elements) || hitPoints <= 0;
export const objectsOf = (natural) => Object.values(OBJECTS).filter((object) => object.natural === natural);
