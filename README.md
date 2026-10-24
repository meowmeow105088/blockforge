# Blockforge

A 3D voxel survival sandbox in a single HTML file. Mine, build, fight, level up, and battle 30 bosses across a 224×224 procedurally generated world.

## Play

Just open `index.html` in any modern browser (Chrome, Firefox, Edge, Safari). No build step, no dependencies — the entire game runs client-side with Three.js loaded from a CDN.

## Features

- **Procedural world** — 224×224 terrain with hills, caves, water, trees, ores (stone, iron, gold), and a glowing boss arena to the north.
- **Two combat classes** — switch between Sword (Q) and Bow (hold LMB to charge, release to fire) with a full tier progression.
- **19 weapon tiers** — Wood → Stone → Iron → Diamond → Moonstone → Astralite → Crystalline → Aquamarine → Prismite → Voidglass → Dragonbone → Stormforged → Nebulite → Seraphium → Abyssal → Solarium → Celestium → Astralforge → Omnium. Higher tiers pierce infinitely.
- **30 bosses** — from the Gutter Colossus (level 3) all the way to the **Godslayer** (level 500). Each has a unique AI pattern, visual design, and escalating HP/damage/XP.
- **Armor crafting** — forge Stone → Iron → Enchanted armor from materials dropped by monsters. Bosses drop shards for the Enchanted set.
- **Drag-and-drop inventory** — open with `C`, rearrange your 36-slot grid, and craft with the recipes panel.
- **Save / load** — auto-saves to localStorage; continue where you left off from the start screen.
- **Day / night cycle** — the world darkens at night and monsters swarm.
- **Touch controls** — mobile-friendly joystick and on-screen buttons.

## Controls

| Key | Action |
|-----|--------|
| `W A S D` | Move |
| `Mouse` | Look |
| `LMB (hold)` | Mine block |
| `RMB` | Place block |
| `LMB` | Attack · hold & release to fire bow |
| `Space` | Jump |
| `Shift` | Sprint |
| `Q` | Switch class: Sword ⇄ Bow |
| `E` | Cycle weapon tier |
| `1 – 9` | Select block to place |
| `C` | Inventory & crafting |
| `F` | Eat food |
| `M` | Toggle help |

## How to play

1. **Mine** blocks (hold LMB) to gather materials.
2. **Kill monsters** for XP, meat, and drops. Leveling up your weapon increases its damage, speed, and crit.
3. **Craft armor** to soak incoming damage.
4. **Reach boss levels** (3, 6, 10, 14, 18, 24, 12, 17, 22, 30, 40, 55, 75, 100, 130, 170, 220, 280, 360, 500) to awaken bosses in the arena to the north.
5. **Push past level 30** for the second wave of bosses — the fight for the Godslayer is the hardest in the game.

## Tech

- Single-file HTML/CSS/JS (~180 KB)
- [Three.js](https://threejs.org/) r128 via CDN for 3D rendering
- Web Audio API for procedurally generated sound effects
- localStorage for save / load 
## How to Commit

- cd blockforge
- git add .
- git commit -m "your message"
- git push