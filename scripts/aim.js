// Aiming at the ground: a single-target attack or ability has no area to touch a surface with, so its message offers a button, then a click on the map.
// The roll says what element it is and how much; whether it reaches is the GM's call, as with anything aimed at a square.

import { canvasSquare, messageElements, reactAtSquare } from "./triggers.js";

// Wait for a click on the map, which then does nothing else. Escape or a right-click cancels it: null.
const pickSquare = () => new Promise((resolve) => {
    const view = canvas.app.view;
    const finish = (key) => {
        view.removeEventListener("pointerdown", onDown, true);
        document.removeEventListener("keydown", onKey, true);
        view.style.cursor = "";
        resolve(key);
    };
    const onDown = (event) => {
        event.stopImmediatePropagation();
        event.preventDefault();
        finish(event.button === 0 ? canvasSquare(event.clientX, event.clientY) : null);
    };
    const onKey = (event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        finish(null);
    };
    view.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    view.style.cursor = "crosshair";
});

export function bindAim(message, html) {
    if (!(message.isAuthor || game.user.isGM) || !messageElements(message).length) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pf2e-elements-aim";
    button.innerHTML = '<i class="fa-solid fa-crosshairs"></i> Aim at the ground';
    button.addEventListener("click", async (event) => {
        event.preventDefault();
        if (!canvas.scene) return;
        ui.notifications.info("Click the square it hits. Escape cancels.");
        const key = await pickSquare();
        if (!key) return;
        const posted = await reactAtSquare(message, canvas.scene, key);
        if (!posted) ui.notifications.info("Nothing there reacts to it.");
    });
    (html.querySelector(".message-content") ?? html).append(button);
}
