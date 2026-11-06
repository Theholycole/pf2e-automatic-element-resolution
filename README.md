# PF2e Automatic Element Resolution

This Foundry VTT module for PF2e makes the battlefield react to elements. Everything it does is homebrew.

## Surfaces

Open **Elements** from the token tools, pick a surface, and click or drag on the scene. Touching squares of one material count as one body.

## Reactions

When an element touches a surface or a creature, a card proposes what happens. Each creature rolls its own save from the card, and the GM's Apply does the rest.

| Element | Touches | What happens |
| --- | --- | --- |
| Electricity | Water or metal | Half the damage to everyone else on it within 30 feet, basic Reflex; −1 in metal armor |
| Fire | Oil | It burns: environmental damage, basic Reflex, 1d6 persistent fire on a failure |
| Fire | Plants | It burns |
| Fire | Water | It boils into steam |
| Fire | Ice | It melts to water |
| Water | Burning ground | The fire goes out and leaves water |
| Cold | Burning ground | The fire goes out |
| Cold | Water | It freezes; Reflex or immobilized for those standing in it |
| Air | Steam | It blows away |
| Water | A creature | Wet: fire resistance 2, −1 to saves against electricity, for 1 minute |
| Fire | A wet creature | It dries off |
| Cold | A wet creature | Reflex, or −10 feet of Speed for a round (immobilized on a critical failure) |

Fliers don't touch the ground's surfaces. Reach, lightning's share, burst damage and the DC on surfaces are world settings.

Air also blows out fire and dries mud. From the element chart: earth turns water to mud, smothers fire and crushes ice to rubble; plants drink up water and mud; water grows plants into a thicket; cold and poison kill plants back; metal and sonic shatter ice; acid eats metal; light and darkness cancel each other; light and vitality clear deathly ground; void and darkness wither living ground. Air and poison destroy brambles, air and wood remove broken glass, and void stills an acid pool. A world setting lets the chart decide pairs with no reaction of their own.

## What surfaces do

| Surface | While it's there |
| --- | --- |
| Ice | GM Core's ice: difficult terrain, off-guard, Balance to move on it |
| Plants | GM Core's light undergrowth: difficult terrain, and a creature can Take Cover |
| Oil | Grease: Balance to move onto it, with Reflex or Acrobatics, unless it Steps or Crawls |
| Steam | Mist: concealed inside it |
| Burning ground | 1 fire damage for each square entered and at each turn's start, and 1d6 persistent fire (a card each time) |
| Thicket | GM Core's heavy undergrowth: greater difficult terrain and cover |
| Mud | GM Core's shallow bog: difficult terrain |
| Rubble | GM Core's rubble: difficult terrain |
| Darkness | Concealed inside it |
| Deathly ground | 1d2 void damage for each square entered and at each turn's start (a card each time; the undead aren't affected) |
| Living ground | Fast healing 1 inside it |
| Light | Limned inside it: it can't be concealed |
| Sand, snow | GM Core: difficult terrain |
| Brambles | 3d6 piercing damage for each square entered, and difficult terrain |
| Broken glass | 1d2 piercing damage for each square entered |
| Tall grass, dust cloud | Concealed inside it |
| Flowers | Fast healing 1 inside it |
| Lava | 3d6 fire damage for each square entered and at each turn's start, 2d6 persistent fire, and difficult terrain |
| Acid pool, ember, poison, death and frost clouds | 1d2 damage of that type for each square entered and at each turn's start; frost fog conceals too |
| Gale | Difficult terrain for fliers, −1 to ranged attacks from inside |
| Water, metal | Nothing until an element touches them |

Damaging ground is set by Combat Simulator ratings: plain hazards, burning ground, brambles and lava rate as a typical spell at levels 5, 9, 13 and 17, for two foes making one 25-foot Stride. Their damage doesn't change with level.

Painting oil where a creature stands gives it a card: Reflex or Acrobatics, or fall prone, as Grease.

## Each round

When a combat's round ends, the GM gets one card for what the ground does:

- Fire burns out after 3 rounds, puddles dry after 10, and steam fades after 2.
- Each burning square has a DC 11 flat check to catch each square of oil or plants next to it.

Tick **Stays until something changes it** when painting something permanent, like a stream, and it won't run out. The numbers are world settings. Time only passes in combat.

Water effects' cards offer **Leave a puddle**.

## Creatures change the ground

A creature carries an element if it has that trait, or persistent damage of that type. Each square it moves through or starts its turn on reacts: a fire creature or a burning one lights plants and oil, boils water and melts ice, while bare ground doesn't change. Fliers leave the ground alone. It happens on its own unless someone else has to roll, and a world setting makes it ask first.

## With the environment module

It's optional. When it's on:

- Its heavy rain soaks unsheltered creatures, which stay Wet while it lasts, and any wet precipitation puts out fires at the end of the round and stops them spreading (GM Core: wet precipitation douses flames).
- Heavy rain or worse also leaves puddles on bare squares each round (3 by default, a world setting), on the round's card.
- Rain only falls under the sky: squares open to the map's edge past the walls, and not in Foundry's Suppress Weather regions. Inside, creatures stay dry and fires keep burning. A map walled right round counts as indoors.
- Its terrain counts as surfaces: ice, undergrowth and hedges, and flames can change, with a hole cut in its region where they do. Its deep and flowing water conducts lightning but doesn't change.

See `docs/design.md` for how it works.

## States that reward setting things up

- **Oil:** moving through oil, starting a turn in it, or having it painted under you adds a stack. A stack of any size is a −5-foot status penalty to Speeds. The next fire damage turns every stack into 1d6 persistent fire each, so 3 stacks is 3d6. Water washes it off. Casting Grease or throwing Oil (1 pint) offers to make it: Grease has no area in PF2e's data, so its card lays 4 squares at your target, or you paint them.
- **Wet + lightning:** a Wet creature takes double conducted damage, and anyone who fails is Shocked (−2 to AC and saves against electricity for 2 rounds).
- **Wet + cold:** Reflex, or Frozen 1, 2 or 4 by degree. Frozen is a −5-foot status penalty to Speeds per point; an Interact lowers it by 4 (the Frozen card has a button for it), and fire thaws it at once.
- **Light:** Limned, so it can't be concealed: the condition is taken off if it's added, or already there.

## Forced movement on ice

A forced move that begins on ice goes as far again, on a card. A GM's drag of a creature out of its turn gets the card too, in case it was forced.

## Clouds and air

Ember, poison, death, frost and dust clouds and steam sit at every height and fade after 3 rounds (a world setting). Air moves a cloud 10 feet away from its source, or scatters it if there isn't one, and the environment module's wind carries them each round. Water turns embers to steam, fire explodes a poison cloud, and life or healing clears a death cloud. A gale is difficult terrain for fliers and −1 to ranged attacks from inside it.

## Leaving surfaces, Sow and Harvest

An area effect's card offers to leave its element's surface: Sow for wood and plants, rubble for earth, ice for cold, and so on. This works for any spell with the trait. A wood or plant effect on standing plants offers Harvest: thorns burst from them for piercing damage, basic Reflex, and the plants are gone. **Items** makes Sowing Seeds, a Harvest Charm and a flask for each surface.

## Objects

**Objects** has a barrel and something natural for each of 15 elements, like an oil barrel and a pitch pine, or a poison barrel and a choke fungus. Each is a PF2e hazard with real Hardness and Hit Points (Hardness 5 and 20 HP, or Hardness 10 and 40 HP for stone), so ordinary hits rarely break one. The right element bursts it every time, even for 1 damage: basic Reflex for those nearby, and it leaves its surface. A burst can set off the next object.

## Elemental weather

**Weather** picks lightning, meteors, hail, acid rain, whirlwinds, tremors, thorns, poison, death, sunbeams or a firestorm. Each new round, marked squares under the sky are hit and new ones are marked, so everyone has a round to get clear or lure someone in. The environment module's thunderstorm brings lightning by itself. Snow and severe cold freeze standing water, severe heat dries it twice as fast, and a firestorm's fires don't burn out.

## Elemental fields

**Fields** covers the whole scene or a marked area you paint. A square holds one field, and a marked one takes over from the scene's inside it. Inside, an element's effects deal half your level (at least 1) more as a status bonus, and you get that much resistance to it and that much weakness to whatever beats it on the element chart: a fire field means water and earth hurt more. A **neutral field** removes all weaknesses and resistances inside it. Fields can cycle through elements every few rounds, so holding the right ground is worth fighting for.

## Weakness to the ground

A creature weak to a surface's trait takes damage equal to that weakness when it moves through the surface or starts its turn there, on a card (its highest such weakness, for each square moved through, or once for a turn). Ground that deals damage has this on its own card instead: its highest weakness and resistance to the damage type or the ground's traits count for each square entered. So wood resistance helps in brambles, and poison or acid resistance helps in an acid pool. That covers fields too. Personal Rain Cloud does the same for water; extending it to every surface is homebrew.

| Surface | Traits |
| --- | --- |
| Water, steam | Water |
| Ice | Cold, water |
| Mud | Water, earth |
| Rubble | Earth |
| Plants, thicket | Plant, wood |
| Metal | Metal |
| Light | Light |
| Living ground | Vitality |
| Sand | Earth |
| Snow, frost fog | Cold, water |
| Brambles, tall grass, flowers | Plant, wood |
| Gale | Air |
| Dust cloud | Earth, air |
| Acid pool | Poison |
| Broken glass | Earth |

Burning, ember, poison and deathly ground have those damage types, so the same counting applies to them.

## Undoing a move

Ctrl-Z on a move puts back the squares a creature's trail changed and removes that move's unapplied cards. Damage and conditions already applied stay, and the record of moves lasts until the page reloads.

## Credits

Elemental interactions adapted from Battlezoo Eldamon (Pathfinder) © 2024, Skyscraper Studios, Inc.; Author: Mark Seifter. Used under the ORC License. This module contains none of its text or art.

## Install

It needs [PF2e Automation Core](https://github.com/Theholycole/PF2e-Automation-Core) 0.7.8 or later.
