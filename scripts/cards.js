// The module's cards: a reaction's plan (src/reactions.js), for the GM to confirm. Each creature rolls its own save from the card (its
// owner or the GM; the result comes back through PF2e's roll message, matched by its identifier), and the GM's Apply does the rest.
// State in the message's flags.

import { MODULE_ID, STATE_EFFECTS, escapeHTML, isActiveGM, paintSquares, surfacesOf } from "./foundry.js";
import { BASIC_SAVE } from "../src/reactions.js";
import { SURFACES } from "../src/surfaces.js";

const CARD = "card";
export const CONDUCTED = "elements:conducted";
const DEGREES = { criticalSuccess: "Critical success", success: "Success", failure: "Failure", criticalFailure: "Critical failure", automatic: "Also" };
const STATISTICS = { reflex: "Reflex", acrobatics: "Acrobatics" };
const CONDITION_WORDS = { immobilized: "immobilized", chilled: "−10 feet of Speed for a round", prone: "prone" };

export const cardOf = (message) => message?.flags?.[MODULE_ID]?.[CARD] ?? null;
const identifierOf = (messageId, targetId) => `${MODULE_ID}:${messageId}:${targetId}`;

// Post a plan's card. source: the damage roll's message id it came from, and the key that stops a second card for the same thing.
export async function postPlan(plan, scene, { from = null, once = null, fromMove = null } = {}) {
    const damage = [];
    for (const part of plan.damage ?? []) {
        if (part.formula) damage.push({ type: part.type, amount: (await new Roll(part.formula).evaluate()).total, formula: part.formula });
        else damage.push({ type: part.type, amount: part.amount });
    }
    const targets = (plan.targets ?? []).map((id) => scene.tokens.get(id)).filter((token) => token?.actor).map((token) => ({ id: token.id, tokenUuid: token.uuid, actorUuid: token.actor.uuid, name: token.name, degree: null, total: null, applied: false }));
    const state = { key: plan.key, title: plan.title, sceneId: scene.id, from, once, fromMove, element: plan.element, damage, check: plan.check, penalties: plan.penalties ?? {}, degrees: plan.degrees ?? {}, conducted: Boolean(plan.conducted), targets, squares: plan.squares ?? [], material: plan.material ?? null, to: plan.to, add: plan.add ?? [], remove: plan.remove ?? [], notes: plan.notes ?? [], changes: plan.changes ?? [], leave: plan.leave ?? [], done: false };
    return ChatMessage.create({ content: cardHTML(state), speaker: { alias: "Elements" }, flags: { [MODULE_ID]: { [CARD]: state } } });
}

const groundLine = (state) => {
    if (state.to === undefined || !state.squares?.length) return "";
    const from = SURFACES[state.material]?.label ?? state.material;
    return `<p class="pf2e-elements-ground">${from} (${state.squares.length} ${state.squares.length === 1 ? "square" : "squares"}) becomes ${state.to ? SURFACES[state.to]?.label.toLowerCase() : "bare ground"}.</p>`;
};

const degreeWords = (state) => Object.entries(state.degrees ?? {}).flatMap(([degree, row]) => {
    const words = [row.condition && (CONDITION_WORDS[row.condition] ?? row.condition), row.persistent && `${row.persistent} persistent ${state.element}`].filter(Boolean).join(", ");
    return words ? [`${DEGREES[degree]}: ${words}.`] : [];
});

export function cardHTML(state) {
    const check = state.check ? `<p class="pf2e-elements-check">${state.check.basic ? "Basic " : ""}${STATISTICS[state.check.statistic] ?? state.check.statistic}${state.check.statistic === "reflex" ? " save" : ""}, DC ${state.check.dc}</p>` : "";
    const damage = (state.damage ?? []).length ? `<p class="pf2e-elements-damage">Damage: ${state.damage.map((part) => `<strong>${part.amount}</strong> ${escapeHTML(part.type)}${part.formula ? ` (${escapeHTML(part.formula)})` : ""}`).join(", ")}</p>` : "";
    const rows = state.targets.map((target) => {
        const degree = !state.check ? "—" : target.degree ? `${DEGREES[target.degree]}${Number.isFinite(target.total) ? ` (${target.total})` : ""}` : `<button type="button" data-elements-action="roll" data-target="${target.id}"><i class="fa-solid fa-dice-d20"></i> Roll</button>`;
        return `<tr class="${target.applied ? "applied" : ""}"><td>${escapeHTML(target.name)}</td><td>${degree}</td><td>${target.applied ? '<i class="fa-solid fa-check"></i>' : ""}</td></tr>`;
    }).join("");
    const notes = [...degreeWords(state), ...(state.notes ?? [])].map((note) => `<p class="pf2e-elements-note">${escapeHTML(note)}</p>`).join("");
    const hasWork = state.targets.length || state.squares?.length || state.changes?.length || state.add?.length || state.remove?.length;
    const apply = state.done || !hasWork ? "" : '<button type="button" data-elements-action="apply" class="pf2e-elements-apply"><i class="fa-solid fa-check-double"></i> Apply (GM)</button>';
    const leave = state.leave?.length ? '<button type="button" data-elements-action="leave" class="pf2e-elements-leave"><i class="fa-solid fa-droplet"></i> Leave a puddle (GM)</button>' : "";
    return `<div class="pf2e-elements-card">
        <header><strong>${escapeHTML(state.title)}</strong></header>
        ${check}${damage}${groundLine(state)}
        ${rows ? `<table class="pf2e-elements-targets"><tbody>${rows}</tbody></table>` : ""}
        ${apply}${leave}${notes}
    </div>`;
}

export function bindCard(message, html) {
    const state = cardOf(message);
    if (!state) return;
    if (!game.user.isGM) {
        html.querySelectorAll('[data-elements-action="apply"], [data-elements-action="leave"]').forEach((button) => button.remove());
        for (const button of html.querySelectorAll('[data-elements-action="roll"]')) {
            const target = state.targets.find((entry) => entry.id === button.dataset.target);
            const actor = target ? fromUuidSync(target.actorUuid) : null;
            if (!actor?.isOwner) button.replaceWith(document.createTextNode("…"));
        }
    }
    html.querySelectorAll("[data-elements-action]").forEach((button) => button.addEventListener("click", async (event) => {
        event.preventDefault();
        button.disabled = true;
        try {
            if (button.dataset.elementsAction === "roll") await rollTarget(message, button.dataset.target);
            else if (button.dataset.elementsAction === "leave") await leavePuddle(message);
            else await applyCard(message);
        } catch (error) {
            ui.notifications.error(error.message);
            console.error(`${MODULE_ID} |`, error);
        } finally {
            button.disabled = false;
        }
    }));
}

async function rollTarget(message, targetId) {
    const state = cardOf(message);
    const target = state.targets.find((entry) => entry.id === targetId);
    const actor = target ? await fromUuid(target.actorUuid) : null;
    if (!actor) throw new Error("That creature isn't there any more.");
    if (!actor.isOwner) throw new Error(`Only ${target.name}'s owner or the GM rolls for it.`);
    const penalty = state.penalties?.[targetId];
    const modifiers = penalty ? [new game.pf2e.Modifier({ label: penalty.label, modifier: penalty.value, type: "circumstance" })] : [];
    await actor.getStatistic(state.check.statistic).roll({ dc: { value: state.check.dc, label: `${state.title} DC` }, identifier: identifierOf(message.id, targetId), skipDialog: true, extraRollOptions: ["elements", ...(state.element ? [`item:trait:${state.element}`, state.element] : [])], ...(modifiers.length ? { modifiers } : {}) });
}

// A roll's message from a card's button (any client posts it; the active GM records it on the card).
export async function onRollMessage(message) {
    if (!isActiveGM()) return;
    const identifier = message.flags?.pf2e?.context?.identifier;
    if (typeof identifier !== "string" || !identifier.startsWith(`${MODULE_ID}:`)) return;
    const [, messageId, targetId] = identifier.split(":");
    const card = game.messages.get(messageId);
    const state = cardOf(card);
    if (!state) return;
    const outcome = message.flags.pf2e.context.outcome;
    const total = message.rolls?.[0]?.total ?? null;
    await writeState(card, { ...state, targets: state.targets.map((target) => (target.id === targetId ? { ...target, degree: outcome ?? target.degree, total } : target)) });
}

const writeState = (message, state) => message.update({ content: cardHTML(state), [`flags.${MODULE_ID}.${CARD}`]: state });

// A creature the effect went on to hit directly: off an open card, so it isn't hit twice.
export async function dropTarget(message, tokenId) {
    const state = cardOf(message);
    if (!state?.targets.some((target) => target.id === tokenId && !target.applied)) return;
    await writeState(message, { ...state, targets: state.targets.filter((target) => target.id !== tokenId) });
}

const damageRollClass = () => (CONFIG.Dice?.rolls ?? []).find((roll) => roll?.name === "DamageRoll");

async function setState(actor, key, on) {
    const held = actor.itemTypes?.effect?.filter((item) => item.flags?.[MODULE_ID]?.state === STATE_EFFECTS[key].system.slug) ?? [];
    if (on && !held.length) await actor.createEmbeddedDocuments("Item", [foundry.utils.deepClone(STATE_EFFECTS[key])]);
    if (!on && held.length) await actor.deleteEmbeddedDocuments("Item", held.map((item) => item.id));
}

async function addCondition(actor, condition) {
    if (STATE_EFFECTS[condition]) await setState(actor, condition, true);
    else await actor.increaseCondition(condition);
}

// The GM's Leave a puddle: water on those squares that are still bare.
export async function leavePuddle(message) {
    if (!game.user.isGM) throw new Error("Only the GM leaves a puddle.");
    const state = cardOf(message);
    const scene = game.scenes.get(state.sceneId);
    if (!scene) return;
    const taken = new Set(surfacesOf(scene).flatMap((surface) => surface.squares));
    const bare = state.leave.filter((key) => !taken.has(key));
    if (bare.length) await paintSquares(scene, bare, "water");
    await writeState(message, { ...state, leave: [] });
}

// The GM's Apply: damage by each degree, conditions, states, then the ground. Creatures yet to roll stay for another press.
export async function applyCard(message) {
    if (!game.user.isGM) throw new Error("Only the GM applies a card.");
    const state = cardOf(message);
    const DamageRoll = damageRollClass();
    const targets = [];
    for (const target of state.targets) {
        if (target.applied || (state.check && !target.degree)) {
            targets.push(target);
            continue;
        }
        const token = await fromUuid(target.tokenUuid).catch(() => null);
        const actor = token?.actor;
        if (actor) {
            const share = !state.check ? 1 : state.check.basic ? BASIC_SAVE[target.degree] ?? 1 : 1;
            const formulas = (state.damage ?? []).map((part) => [Math.floor(part.amount * share), part.type]).filter(([amount]) => amount > 0).map(([amount, type]) => `${amount}[${type}]`);
            // (The conducted mark: this damage can't set off another conduction.)
            if (formulas.length && DamageRoll) await actor.applyDamage({ damage: await new DamageRoll(formulas.length === 1 ? formulas[0] : `{${formulas.join(",")}}`).evaluate(), token, rollOptions: new Set([CONDUCTED]) });
            const row = state.degrees?.[target.degree ?? "automatic"] ?? {};
            if (row.persistent && DamageRoll) await actor.applyDamage({ damage: await new DamageRoll(`(${row.persistent})[persistent,${state.element}]`).evaluate(), token, rollOptions: new Set([CONDUCTED]) });
            if (row.condition) await addCondition(actor, row.condition);
            // (Back where the move began: its stored place, and no second card for moving.)
            if (row.returnTo) await token.update(row.returnTo, { teleport: true, animate: false, [MODULE_ID]: { forced: true } });
            for (const key of state.add ?? []) await setState(actor, key, true);
            for (const key of state.remove ?? []) await setState(actor, key, false);
        }
        targets.push({ ...target, applied: true });
    }
    const scene = game.scenes.get(state.sceneId);
    if (scene && state.to !== undefined && !state.done && state.squares?.length) await paintSquares(scene, state.squares, state.to);
    if (scene && !state.done) for (const change of state.changes ?? []) await paintSquares(scene, change.keys, change.to);
    await writeState(message, { ...state, targets, done: targets.every((target) => target.applied) });
}
