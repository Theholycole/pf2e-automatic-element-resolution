// Objects on the map (src/objects.js): a PF2e hazard actor for each kind, in a world folder, with Hardness and Hit Points. Damage to one, or an area
// of the right element, makes its card; the GM's Apply does the damage, leaves the ground, removes it, and sets off what else that reaches.

import { MODULE_ID, creatureOf, creaturesOf, partyLevel } from "./foundry.js";
export { partyLevel };
import { postPlan } from "./cards.js";
import { OBJECTS, burstFormula, burstPlan, setOff } from "../src/objects.js";
import { levelDC } from "../src/reactions.js";
import { squareKey, touches } from "../src/surfaces.js";

const FOLDER = "Elements: objects";
export const objectOfActor = (actor) => OBJECTS[actor?.flags?.[MODULE_ID]?.object] ?? null;

async function objectActor(key) {
    const existing = game.actors.find((actor) => actor.flags?.[MODULE_ID]?.object === key);
    if (existing) return existing;
    const object = OBJECTS[key];
    let folder = game.folders.find((each) => each.type === "Actor" && each.flags?.[MODULE_ID]?.objects);
    folder ??= await Folder.create({ name: FOLDER, type: "Actor", color: "#a8703a", flags: { [MODULE_ID]: { objects: true } } });
    return Actor.create({
        name: object.label, type: "hazard", img: object.img, folder: folder.id,
        system: {
            attributes: { ac: { value: 10 }, hardness: object.hardness, hp: { value: object.hp, max: object.hp }, immunities: [{ type: "object-immunities" }], emitsSound: false },
            details: { level: { value: 0 }, description: `<p>Hardness ${object.hardness}. Any ${object.triggers.join(" or ")} damage bursts it, however little; anything else has to destroy it. Homebrew.</p>` },
            traits: { value: [], rarity: "common", size: { value: "med" } }
        },
        prototypeToken: { name: object.label, actorLink: false, width: 1, height: 1, texture: { src: object.img, tint: object.tint }, disposition: CONST.TOKEN_DISPOSITIONS.NEUTRAL },
        flags: { [MODULE_ID]: { object: key } }
    });
}

// Put one on the scene, at these canvas coordinates and this level (on its token: the same barrel can be any level).
export async function placeObject(scene, key, x, y, level = partyLevel(scene)) {
    const actor = await objectActor(key);
    const size = scene.grid.size;
    const data = (await actor.getTokenDocument({ x: Math.floor(x / size) * size, y: Math.floor(y / size) * size, delta: { system: { details: { level: { value: level } } } } })).toObject();
    return scene.createEmbeddedDocuments("Token", [data]);
}

// The objects on these squares: [{ token, object }].
export function objectsIn(scene, squares) {
    return [...scene.tokens].map((token) => ({ token, object: objectOfActor(token.actor) })).filter(({ token, object }) => object && touches(creatureOf(token), squares));
}

// Its card. Only one for each object, however many things reach it.
const bursting = new Set();
export async function burstObject(token, object) {
    if (bursting.has(token.uuid)) return;
    bursting.add(token.uuid);
    setTimeout(() => bursting.delete(token.uuid), 10000);
    const scene = token.parent;
    const creatures = creaturesOf(scene).filter((creature) => !objectOfActor(scene.tokens.get(creature.id)?.actor));
    // (Placed before objects had levels: level 0, so the party's.)
    const level = token.actor?.level || partyLevel(scene);
    return postPlan(burstPlan(object, token.id, creatureOf(token).squares, creatures, { dc: levelDC(level), formula: burstFormula(level) }), scene);
}

// The GM applied it: it's gone, and what this reached that it sets off goes too.
export async function finishBurst(scene, state) {
    const { tokenId, element, squares } = state.burst;
    const token = scene.tokens.get(tokenId);
    if (token) await token.delete();
    for (const { token: other, object } of objectsIn(scene, squares)) if (other.id !== tokenId && setOff(object, [{ element }])) await burstObject(other, object);
}

export const squareOfCanvas = (scene, x, y) => squareKey(Math.floor(x / scene.grid.size), Math.floor(y / scene.grid.size));
