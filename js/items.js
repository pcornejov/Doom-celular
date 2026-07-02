// Ítems recogibles: botiquín (+25 salud), caja de balas (+12) y escopeta.
// Sprites 16x16 procedurales apoyados en el suelo, dibujados por el mismo
// pase de sprites del raycaster (cada ítem lleva su textura y tamaño).
// Recoger = pasar a menos de 0.5 celdas; si no aporta nada (salud a 100,
// balas al máximo) el ítem se queda en el suelo.

import { bake } from './raycaster.js';
import { player } from './player.js';
import { weapon, MAX_AMMO, giveShotgun } from './weapon.js';
import { ITEM_HEALTH, ITEM_AMMO, ITEM_SHOTGUN } from './maps.js';

const ITEM_TEX = 16;
const PICKUP_DIST2 = 0.5 * 0.5;

// Botiquín: cruz blanca sobre caja roja.
function drawHealth(g) {
  g.fillStyle = '#5a0c0c';
  g.fillRect(1, 5, 14, 10);
  g.fillStyle = '#a41818';
  g.fillRect(2, 6, 12, 8);
  g.fillStyle = '#d43028';
  g.fillRect(2, 6, 12, 2);
  g.fillStyle = '#ffffff';
  g.fillRect(6, 7, 4, 6);
  g.fillRect(4, 9, 8, 2);
}

// Caja de munición ámbar con puntas de bala asomando.
function drawAmmo(g) {
  g.fillStyle = '#4a3410';
  g.fillRect(2, 7, 12, 8);
  g.fillStyle = '#b08028';
  g.fillRect(3, 8, 10, 6);
  g.fillStyle = '#d8a83c';
  g.fillRect(3, 8, 10, 2);
  g.fillStyle = '#c8a050';
  g.fillRect(4, 5, 2, 3);
  g.fillRect(7, 5, 2, 3);
  g.fillRect(10, 5, 2, 3);
  g.fillStyle = '#181008';
  g.fillRect(5, 11, 6, 2);
}

// Escopeta gris tumbada: doble cañón, recámara y culata de madera.
function drawShotgun(g) {
  g.fillStyle = '#6e7683';
  g.fillRect(0, 8, 10, 2);
  g.fillStyle = '#9aa2ae';
  g.fillRect(0, 8, 10, 1);
  g.fillStyle = '#3a2410';
  g.fillRect(9, 7, 3, 4);
  g.fillStyle = '#7a4a20';
  g.fillRect(11, 8, 5, 3);
  g.fillStyle = '#935c2a';
  g.fillRect(11, 8, 5, 1);
}

const TEXTURES = [];
TEXTURES[ITEM_HEALTH] = bake(ITEM_TEX, ITEM_TEX, drawHealth);
TEXTURES[ITEM_AMMO] = bake(ITEM_TEX, ITEM_TEX, drawAmmo);
TEXTURES[ITEM_SHOTGUN] = bake(ITEM_TEX, ITEM_TEX, drawShotgun);

// Alto del sprite como fracción del alto de celda.
const SIZE_FACTORS = [];
SIZE_FACTORS[ITEM_HEALTH] = 0.3;
SIZE_FACTORS[ITEM_AMMO] = 0.26;
SIZE_FACTORS[ITEM_SHOTGUN] = 0.32;

export const items = [];

// (Re)puebla el array in-place desde el mapa al cargar cada nivel.
export function loadItems(map) {
  items.length = 0;
  for (let i = 0; i < map.items.length; i++) {
    const src = map.items[i];
    items.push({
      x: src.x,
      y: src.y,
      kind: src.kind,
      tex: TEXTURES[src.kind],
      texW: ITEM_TEX,
      texH: ITEM_TEX,
      sizeFactor: SIZE_FACTORS[src.kind],
    });
  }
}

export function update() {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    const dx = it.x - player.x;
    const dy = it.y - player.y;
    if (dx * dx + dy * dy > PICKUP_DIST2) continue;

    if (it.kind === ITEM_HEALTH) {
      if (player.hp >= 100) continue;
      player.hp = Math.min(100, player.hp + 25);
    } else if (it.kind === ITEM_AMMO) {
      if (weapon.ammo >= MAX_AMMO) continue;
      weapon.ammo = Math.min(MAX_AMMO, weapon.ammo + 12);
    } else {
      // Escopeta: si ya la tienes, al menos vale por sus balas.
      if (weapon.hasShotgun && weapon.ammo >= MAX_AMMO) continue;
      giveShotgun();
    }
    window.__audio?.playPickup?.();
    // Eliminación por intercambio con el último: sin huecos ni allocations.
    items[i] = items[items.length - 1];
    items.pop();
  }
}
