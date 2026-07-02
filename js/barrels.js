// Barriles explosivos (marcador 'O' en los mapas).
// Un tiro de pistola (o cualquier perdigón / bola de fuego enemiga) los
// revienta: daño radial que afecta a jugador, enemigos y otros barriles.
// Las reacciones en cadena llevan un retardo de 0.15 s por eslabón (fuse).
// El flash de explosión es un sprite de 2 frames que vive 0.25 s en un pool
// preasignado; barriles y explosiones se dibujan por el mismo pase de
// sprites del raycaster (pushSprites añade descriptores ya construidos:
// cero allocations por frame).

import { bake } from './raycaster.js';
import { player, damagePlayer } from './player.js';
import { enemies, hitEnemy, STATE } from './enemies.js';

const BARREL_W = 16;
const BARREL_H = 20;
const BARREL_HP = 10;

const BLAST_DMG = 60;     // daño en el centro de la explosión
const BLAST_RADIUS = 2.5; // el daño decae a 0 a esta distancia
const CHAIN_DELAY = 0.15; // segundos entre eslabones de una cadena

const EXPL_TEX = 24;
const EXPL_TIME = 0.25;   // duración del flash (2 frames)
const MAX_EXPLOSIONS = 12;

// Barril metálico gris con banda amarilla radiactiva y líquido verde asomando.
function drawBarrel(g) {
  // Líquido verde asomando por la boca
  g.fillStyle = '#38d038';
  g.fillRect(4, 0, 8, 2);
  g.fillStyle = '#8aff6a';
  g.fillRect(6, 0, 3, 1);
  // Cuerpo metálico
  g.fillStyle = '#3a3e44';
  g.fillRect(2, 2, 12, 17);
  g.fillStyle = '#5c626c';
  g.fillRect(3, 2, 10, 17);
  g.fillStyle = '#7e8692'; // brillo lateral
  g.fillRect(4, 3, 2, 15);
  // Aros superior e inferior
  g.fillStyle = '#23262b';
  g.fillRect(2, 3, 12, 1);
  g.fillRect(2, 17, 12, 1);
  // Banda amarilla radiactiva con muescas negras
  g.fillStyle = '#d8b428';
  g.fillRect(3, 8, 10, 4);
  g.fillStyle = '#181410';
  g.fillRect(5, 8, 2, 4);
  g.fillRect(9, 8, 2, 4);
  // Goterón verde por delante
  g.fillStyle = '#38d038';
  g.fillRect(11, 2, 2, 4);
  // Base en sombra
  g.fillStyle = '#23262b';
  g.fillRect(3, 18, 10, 1);
}

// Bola de explosión naranja/blanca; el frame 2 es más grande y más blanco.
function drawExplosion(g, big) {
  if (big) {
    g.fillStyle = '#b42400';
    g.fillRect(1, 1, 22, 22);
    g.clearRect(1, 1, 4, 4);
    g.clearRect(19, 1, 4, 4);
    g.clearRect(1, 19, 4, 4);
    g.clearRect(19, 19, 4, 4);
    g.fillStyle = '#ff7010';
    g.fillRect(4, 4, 16, 16);
    g.fillStyle = '#ffc030';
    g.fillRect(7, 7, 10, 10);
    g.fillStyle = '#fff8d0';
    g.fillRect(9, 9, 6, 6);
  } else {
    g.fillStyle = '#c83800';
    g.fillRect(5, 5, 14, 14);
    g.clearRect(5, 5, 3, 3);
    g.clearRect(16, 5, 3, 3);
    g.clearRect(5, 16, 3, 3);
    g.clearRect(16, 16, 3, 3);
    g.fillStyle = '#ff8c20';
    g.fillRect(7, 7, 10, 10);
    g.fillStyle = '#ffe060';
    g.fillRect(9, 9, 6, 6);
  }
}

const BARREL_TEX = bake(BARREL_W, BARREL_H, drawBarrel);
const EXPL_FRAMES = [
  bake(EXPL_TEX, EXPL_TEX, (g) => drawExplosion(g, false)),
  bake(EXPL_TEX, EXPL_TEX, (g) => drawExplosion(g, true)),
];

export const barrels = [];

// Pool de flashes de explosión (preasignado; sin allocations por frame).
const explosions = [];
for (let i = 0; i < MAX_EXPLOSIONS; i++) {
  explosions.push({
    active: false,
    t: 0,
    x: 0,
    y: 0,
    tex: EXPL_FRAMES[0],
    texW: EXPL_TEX,
    texH: EXPL_TEX,
    sizeFactor: 0.95,
  });
}

// (Re)puebla el array in-place desde el mapa al cargar cada nivel.
export function loadBarrels(map) {
  barrels.length = 0;
  const spawns = map.barrelSpawns;
  for (let i = 0; i < spawns.length; i++) {
    barrels.push({
      x: spawns[i].x,
      y: spawns[i].y,
      hp: BARREL_HP,
      alive: true,
      fuse: 0, // > 0: explosión en cadena pendiente
      tex: BARREL_TEX,
      texW: BARREL_W,
      texH: BARREL_H,
      sizeFactor: 0.55,
    });
  }
  for (let i = 0; i < MAX_EXPLOSIONS; i++) explosions[i].active = false;
}

function spawnFlash(x, y) {
  for (let i = 0; i < MAX_EXPLOSIONS; i++) {
    if (explosions[i].active) continue;
    const ex = explosions[i];
    ex.active = true;
    ex.t = 0;
    ex.x = x;
    ex.y = y;
    return;
  }
}

// Explosión inmediata: daño radial decayendo linealmente de BLAST_DMG a 0.
function explode(b) {
  b.alive = false;
  spawnFlash(b.x, b.y);
  window.__audio?.playExplosion?.(b.x, b.y);

  // Jugador
  {
    const dx = player.x - b.x;
    const dy = player.y - b.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const dmg = (BLAST_DMG * (1 - d / BLAST_RADIUS)) | 0;
    if (dmg > 0) damagePlayer(dmg);
  }
  // Enemigos
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (e.state === STATE.DEAD) continue;
    const dx = e.x - b.x;
    const dy = e.y - b.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const dmg = (BLAST_DMG * (1 - d / BLAST_RADIUS)) | 0;
    if (dmg > 0) hitEnemy(e, dmg);
  }
  // Otros barriles: si el daño los revienta, explotan con retardo (cadena).
  for (let i = 0; i < barrels.length; i++) {
    const c = barrels[i];
    if (!c.alive || c === b || c.fuse > 0) continue;
    const dx = c.x - b.x;
    const dy = c.y - b.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const dmg = (BLAST_DMG * (1 - d / BLAST_RADIUS)) | 0;
    if (dmg <= 0) continue;
    c.hp -= dmg;
    if (c.hp <= 0) c.fuse = CHAIN_DELAY;
  }
}

// Daño directo (hitscan del arma o bola de fuego enemiga).
export function damageBarrel(b, dmg) {
  if (!b.alive || b.fuse > 0) return;
  b.hp -= dmg;
  if (b.hp <= 0) explode(b);
}

export function update(dt) {
  // Cadenas pendientes
  for (let i = 0; i < barrels.length; i++) {
    const b = barrels[i];
    if (!b.alive || b.fuse <= 0) continue;
    b.fuse -= dt;
    if (b.fuse <= 0) explode(b);
  }
  // Flashes de explosión
  for (let i = 0; i < MAX_EXPLOSIONS; i++) {
    const ex = explosions[i];
    if (!ex.active) continue;
    ex.t += dt;
    if (ex.t >= EXPL_TIME) ex.active = false;
  }
}

// Añade a la lista de render los barriles vivos y los flashes activos.
export function pushSprites(list) {
  for (let i = 0; i < barrels.length; i++) {
    if (barrels[i].alive) list.push(barrels[i]);
  }
  for (let i = 0; i < MAX_EXPLOSIONS; i++) {
    const ex = explosions[i];
    if (!ex.active) continue;
    ex.tex = ex.t < EXPL_TIME * 0.5 ? EXPL_FRAMES[0] : EXPL_FRAMES[1];
    list.push(ex);
  }
}
