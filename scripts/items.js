// Homebrew items that use the module's terms: a flask for each surface an element leaves, Sow and Harvest charms. The GM makes them in the world from the
// Elements window. Using one posts its card (scripts/triggers.js onItemUsed).

import { MODULE_ID } from "./foundry.js";
import { LEAVES } from "../src/reactions.js";
import { SURFACES } from "../src/surfaces.js";

const FOLDER = "Elements: items";

const consumable = (name, element, use, description, img = "icons/consumables/potions/potion-tube-corked-blue.webp") => ({
    name, type: "consumable", img,
    system: { category: "other", level: { value: 1 }, price: { value: { gp: 3 } }, bulk: { value: 0.1 }, uses: { value: 1, max: 1, autoDestroy: true }, traits: { value: element ? [element] : [], rarity: "common" }, description: { value: `<p>${description} Homebrew.</p>` } },
    flags: { [MODULE_ID]: { use } }
});

export const ITEMS = [
    consumable("Sowing Seeds", "plant", { element: "wood", feet: 10 }, "Scatter these around you to Sow: a 10-foot burst around you can become plants on the GM's card.", "icons/commodities/flowers/dandelion-pod-white.webp"),
    consumable("Harvest Charm", "plant", { harvest: true, feet: 30 }, "Crush this to Harvest: plants within 30 feet of you burst, piercing whoever stands in them.", "icons/consumables/plants/leaf-veins-glowing-green.webp"),
    ...Object.entries(LEAVES).filter(([element]) => element !== "wood").map(([element, material]) => consumable(`Flask of ${SURFACES[material].label}`, element === "void" ? "void" : element, { element, feet: 10 }, `Shatter this at your feet: a 10-foot burst around you can become ${SURFACES[material].label.toLowerCase()} on the GM's card.`))
];

export async function createItems() {
    let folder = game.folders.find((each) => each.type === "Item" && each.flags?.[MODULE_ID]?.items);
    folder ??= await Folder.create({ name: FOLDER, type: "Item", color: "#a8703a", flags: { [MODULE_ID]: { items: true } } });
    const have = new Set(game.items.filter((item) => item.flags?.[MODULE_ID]?.use).map((item) => item.name));
    const missing = ITEMS.filter((item) => !have.has(item.name)).map((item) => ({ ...item, folder: folder.id }));
    if (missing.length) await Item.createDocuments(missing);
    return missing.length;
}
