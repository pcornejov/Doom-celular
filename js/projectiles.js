// Bolas de fuego de los imps (Iteración 8a).
// Pool preasignado de 32 proyectiles: cero allocations por frame. Cada slot
// del pool ES su propio descriptor de sprite ({x,y,tex,texW,texH,sizeFactor,
// vCenter}) y se añade a la lista de render con pushSprites.
// El proyectil viaja hacia la posición del jugador EN EL MOMENTO del disparo
// (sin predicción: se esquiva moviéndose lateralmente) y muere al tocar
// pared/puerta cerrada, al jugador (dist < 0.4), a un barril o a los 4 s.

import { cellAt } from './maps.js';
import { player, damagePlayer } from './player.js';
import { bake } from './raycaster.js';
import { barrels, damageBarrel } from './barrels.js';
import { difficulty } from './difficulty.js';

const MAX_FIREBALLS = 32;
const SPEED = 4.5;        // celdas por segundo (× difficulty.projSpeedMul)
const LIFETIME = 4;       // segundos
const HIT_DIST2 = 0.4 * 0.4;      // radio de impacto contra el jugador
const BARREL_DIST2 = 0.45 * 0.45; // radio de impacto contra barriles
const SUBSTEP = 0.2;      // celdas máximas por paso de colisión

const FB_TEX = 12;

// Bola de fuego 12×12: núcleo amarillo, halo naranja/rojo. Dos frames
// alternando a ~10 Hz para que titile (el segundo con lengüetas de llama).
function drawFireball(g, alt) {
  g.fillStyle = '#a01800';
  g.fillRect(2, 2, 8, 8);
  g.clearRect(2, 2, 1, 1);
  g.clearRect(9, 2, 1, 1);
  g.clearRect(2, 9, 1, 1);
  g.clearRect(9, 9, 1, 1);
  g.fillStyle = '#ff5a00';
  g.fillRect(3, 3, 6, 6);
  g.fillStyle = '#ffb400';
  g.fillRect(4, 4, 4, 4);
  g.fillStyle = '#fff090';
  g.fillRect(5, 5, 2, 2);
  if (alt) {
    // Lengüetas de llama asomando por los bordes
    g.fillStyle = '#ff5a00';
    g.fillRect(1, 5, 1, 2);
    g.fillRect(10, 4, 1, 2);
    g.fillRect(5, 1, 2, 1);
    g.fillRect(4, 10, 2, 1);
    g.fillStyle = '#ffb400';
    g.fillRect(3, 4, 2, 2);
  }
}

const FB_FRAMES = [
  bake(FB_TEX, FB_TEX, (g) => drawFireball(g, false)),
  bake(FB_TEX, FB_TEX, (g) => drawFireball(g, true)),
];

// Pool preasignado: cada slot es también el descriptor de sprite.
export const fireballs = [];
for (let i = 0; i < MAX_FIREBALLS; i++) {
  fireballs.push({
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    age: 0,
    tex: FB_FRAMES[0],
    texW: FB_TEX,
    texH: FB_TEX,
    sizeFactor: 0.28,
    vCenter: true, // flota a media altura, no pegado al suelo
  });
}

export function reset() {
  for (let i = 0; i < MAX_FIREBALLS; i++) fireballs[i].active = false;
}

// Lanza una bola desde (x,y) hacia (tx,ty). Si el pool está lleno, se pierde.
export function spawnFireball(x, y, tx, ty) {
  let dx = tx - x;
  let dy = ty - y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 1e-6) return;
  dx /= d;
  dy /= d;
  for (let i = 0; i < MAX_FIREBALLS; i++) {
    if (fireballs[i].active) continue;
    const p = fireballs[i];
    p.active = true;
    // Nace un poco por delante del imp, en dirección al jugador.
    p.x = x + dx * 0.3;
    p.y = y + dy * 0.3;
    const s = SPEED * difficulty.projSpeedMul;
    p.vx = dx * s;
    p.vy = dy * s;
    p.age = 0;
    return;
  }
}

export function update(map, dt) {
  for (let i = 0; i < MAX_FIREBALLS; i++) {
    const p = fireballs[i];
    if (!p.active) continue;

    p.age += dt;
    if (p.age >= LIFETIME) {
      p.active = false;
      continue;
    }

    // Avance en subpasos para no atravesar nada con dt grandes.
    const stepDist = Math.sqrt(p.vx * p.vx + p.vy * p.vy) * dt;
    const n = 1 + ((stepDist / SUBSTEP) | 0);
    const sdt = dt / n;
    for (let k = 0; k < n && p.active; k++) {
      p.x += p.vx * sdt;
      p.y += p.vy * sdt;

      // Pared o puerta cerrada: se apaga sin más.
      if (cellAt(map, p.x, p.y) !== 0) {
        p.active = false;
        break;
      }
      // Jugador: daño 10-16 (× dificultad).
      const dx = player.x - p.x;
      const dy = player.y - p.y;
      if (dx * dx + dy * dy < HIT_DIST2) {
        damagePlayer(Math.round((10 + ((Math.random() * 7) | 0)) * difficulty.dmgMul));
        window.__audio?.playFireballHit?.(p.x, p.y);
        p.active = false;
        break;
      }
      // Barriles: también los revienta.
      for (let j = 0; j < barrels.length; j++) {
        const b = barrels[j];
        if (!b.alive) continue;
        const bx = b.x - p.x;
        const by = b.y - p.y;
        if (bx * bx + by * by < BARREL_DIST2) {
          damageBarrel(b, 16);
          window.__audio?.playFireballHit?.(p.x, p.y);
          p.active = false;
          break;
        }
      }
    }
  }
}

// Añade las bolas activas a la lista de render (frame según edad: titileo).
export function pushSprites(list) {
  for (let i = 0; i < MAX_FIREBALLS; i++) {
    const p = fireballs[i];
    if (!p.active) continue;
    p.tex = FB_FRAMES[((p.age * 10) | 0) & 1];
    list.push(p);
  }
}
