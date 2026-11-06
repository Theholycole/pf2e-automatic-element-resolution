# Design

Cole's decisions (2026-11-05):

- **Where:** this repo, requiring the core, with the environment module optional. The rules start here and move to the core when the Combat Simulator needs them.
- **Reactions:** a card the GM confirms.
- **Lightning through water:** half damage, basic Reflex, 30-foot reach.
- **Surfaces:** the GM paints them; cards will offer to leave one behind.
- **Eldamon:** only its element interactions, as a foundation for expanding the reactions. No creatures, powers, or dependency on its module.

## Layout

- `src/`: the pure rules, tested in node.
  - `surfaces.js`: the materials, connected bodies, what touches what.
  - `reactions.js`: the reaction tables and the plan for a card.
  - `terrain.js`: what each surface does while it's there, on top of the core's `featureRules`.
  - `ticks.js`: what a round does to the ground.
  - `matchups.js`: the element chart, for pairs with no reaction of their own.
  - `carry.js`: the elements a creature carries, and the squares a move touches.
- `scripts/`: Foundry.
  - `foundry.js`: surfaces as regions, creatures as the rules see them, DCs, the Wet and Chilled effects.
  - `triggers.js`: where an element arrives from.
  - `cards.js`: the cards and Apply.
  - `paint.js`: the GM's paint tool.
  - `carry.js`: creatures changing the ground they stand on and move through.
  - `environment.js`: the environment module's terrain as surfaces, and its rain.
  - `terrain.js`: a surface's region behaviors, its Effect and its events.

## How an element is found (checked on Foundry 14.367, PF2e 8.6.1, 2026-11-05)

- **Areas are regions.** Foundry 14 has no measured templates. PF2e's `placeRegionFromItem` makes a region with `flags.pf2e.origin` (name, slug, traits, uuid), `flags.pf2e.areaShape` and `flags.pf2e.messageId`.
- **Damage messages** carry `flags.pf2e.context.traits`, `flags.pf2e.origin` and each roll's `instances` (type, total, persistent).
- **A Strike's** message names its target (`context.target.token`). **A saving-throw spell's** doesn't, so who it hit is learned from the core's `applyDamage` listener.
- `applyDamage` receives a roll already altered by Apply's multiplier and no message id, so the full amount is found from the latest damage message with the same item's uuid.

## The loop guard

A card's damage is applied with the roll option `elements:conducted`, and the listener ignores anything carrying it.

## Not built yet

Time passing outside combat, and surfaces the element chart names but no rules cover (the book's seven other elements).
