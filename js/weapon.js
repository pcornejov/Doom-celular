// Armas hitscan en primera persona: pistola (arma 0) y escopeta (arma 1, se
// recoge en E1M2). Munición compartida (BALAS, máx 99).
// - Pistola: 1 bala, daño 10-15, cadencia ~3/s.
// - Escopeta: 2 balas, 7 perdigones con dispersión ±0.09 rad, daño 6-10 cada
//   uno, cadencia 0.9 s. Si se dispara con menos de 2 balas cae a la pistola.
// - Cambio de arma: teclas 1/2 o el botón táctil '1/2' sobre el de disparo
//   (touch.js encola touch.switchQueued; se consume aquí).
// - Render: bitmaps procedurales pre-renderizados a canvases offscreen una
//   sola vez; retroceso en pasos discretos, fogonazo y bob al caminar.

import { player } from './player.js';
import { touch } from './touch.js';
import { cellAt } from './maps.js';
import { enemies, hitEnemy, STATE } from './enemies.js';

export const MAX_AMMO = 99;
const START_AMMO = 48;
const PISTOL_COOLDOWN = 0.34;
const SHOTGUN_COOLDOWN = 0.9;
const SHOTGUN_PELLETS = 7;
const SHOTGUN_SPREAD = 0.03; // rad entre perdigones (±0.09 en total)
const HIT_HALF_WIDTH = 0.35;

export const weapon = {
  ammo: START_AMMO,
  hasShotgun: false,
  current: 0,  // 0 pistola, 1 escopeta
  cooldown: 0,
  recoil: 0,   // temporizador de retroceso
  flash: 0,    // temporizador de fogonazo
  bobPhase: 0, // fase del balanceo al caminar
};

// Reinicio total (nuevo episodio): pierde la escopeta.
export function reset() {
  weapon.ammo = START_AMMO;
  weapon.hasShotgun = false;
  weapon.current = 0;
  weapon.cooldown = 0;
  weapon.recoil = 0;
  weapon.flash = 0;
  weapon.bobPhase = 0;
}

// Recoger la escopeta (lo llama items.js): la equipa y regala unas balas.
export function giveShotgun() {
  weapon.hasShotgun = true;
  weapon.current = 1;
  weapon.ammo = Math.min(MAX_AMMO, weapon.ammo + 4);
}

// --- Entrada de disparo (teclado / ratón; lo táctil llega por touch.js) ---
let fireKey = false;
let fireMouse = false;

export function initWeapon(canvas) {
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      fireKey = true;
    } else if (e.code === 'Digit1') {
      weapon.current = 0;
    } else if (e.code === 'Digit2' && weapon.hasShotgun) {
      weapon.current = 1;
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') fireKey = false;
  });
  window.addEventListener('blur', () => {
    fireKey = false;
    fireMouse = false;
  });
  canvas.addEventListener('mousedown', () => { fireMouse = true; });
  window.addEventListener('mouseup', () => { fireMouse = false; });
}

// --- Bitmaps de las armas (una vez, al cargar) ---
const GUN_W = 40;
const GUN_H = 30;
const SG_W = 56;
const SG_H = 30;

function bakeGun(slideBack) {
  const c = document.createElement('canvas');
  c.width = GUN_W;
  c.height = GUN_H;
  const g = c.getContext('2d');
  const slide = slideBack ? 3 : 0; // el carro recula al disparar

  // Cañón / carro superior
  g.fillStyle = '#101014';
  g.fillRect(16, slide, 8, 10);
  g.fillStyle = '#787c88';
  g.fillRect(17, slide + 1, 6, 8);
  g.fillStyle = '#b4bac8';
  g.fillRect(18, slide + 1, 2, 8);
  // Carro ancho
  g.fillStyle = '#101014';
  g.fillRect(13, 10 + slide, 14, 8 - slide);
  g.fillStyle = '#787c88';
  g.fillRect(14, 11 + slide, 12, 6 - slide);
  g.fillStyle = '#b4bac8';
  g.fillRect(14, 11 + slide, 12, 2);
  // Armazón
  g.fillStyle = '#101014';
  g.fillRect(12, 18, 16, 4);
  g.fillStyle = '#40444e';
  g.fillRect(13, 19, 14, 3);
  // Manos sujetando
  g.fillStyle = '#c8905a';
  g.fillRect(8, 22, 24, 8);
  g.fillStyle = '#96683c';
  g.fillRect(8, 22, 4, 8);
  g.fillRect(28, 22, 4, 8);
  g.fillRect(8, 28, 24, 2);
  // Culata visible entre las manos
  g.fillStyle = '#503018';
  g.fillRect(18, 22, 4, 6);
  return c;
}

function bakeShotgun(fired) {
  const c = document.createElement('canvas');
  c.width = SG_W;
  c.height = SG_H;
  const g = c.getContext('2d');
  const kick = fired ? 3 : 0; // toda el arma recula al disparar

  // Doble cañón vertical al centro
  g.fillStyle = '#0c0e12';
  g.fillRect(21, kick, 6, 13);
  g.fillRect(29, kick, 6, 13);
  g.fillStyle = '#7e8694';
  g.fillRect(22, kick + 1, 4, 12);
  g.fillRect(30, kick + 1, 4, 12);
  g.fillStyle = '#c0c8d4';
  g.fillRect(22, kick + 1, 1, 12);
  g.fillRect(30, kick + 1, 1, 12);
  // Bocas de los cañones
  g.fillStyle = '#000';
  g.fillRect(22, kick, 4, 2);
  g.fillRect(30, kick, 4, 2);
  // Abrazadera
  g.fillStyle = '#2e323a';
  g.fillRect(20, kick + 8, 16, 3);
  // Recámara y guardamanos de madera
  g.fillStyle = '#3a2410';
  g.fillRect(18, 13 + kick, 20, 7);
  g.fillStyle = '#7a4a20';
  g.fillRect(19, 14 + kick, 18, 5);
  g.fillStyle = '#935c2a';
  g.fillRect(19, 14 + kick, 18, 2);
  // Manos: izquierda en el guardamanos, derecha en el disparador
  g.fillStyle = '#c8905a';
  g.fillRect(12, 18, 12, 9);
  g.fillRect(32, 20, 12, 9);
  g.fillStyle = '#96683c';
  g.fillRect(12, 18, 3, 9);
  g.fillRect(41, 20, 3, 9);
  g.fillRect(12, 25, 12, 2);
  g.fillRect(32, 27, 12, 2);
  // Culata asomando a la derecha
  g.fillStyle = '#503018';
  g.fillRect(38, 22, 8, 6);
  return c;
}

const gunIdle = bakeGun(false);
const gunFire = bakeGun(true);
const sgIdle = bakeShotgun(false);
const sgFire = bakeShotgun(true);

// --- Lógica ---
let prevX = 0;
let prevY = 0;
const TAU = Math.PI * 2;

// Distancia a la primera pared siguiendo una dirección (DDA).
function castWallDistance(map, x, y, rdx, rdy) {
  let mapX = x | 0;
  let mapY = y | 0;
  const deltaDistX = rdx === 0 ? 1e30 : Math.abs(1 / rdx);
  const deltaDistY = rdy === 0 ? 1e30 : Math.abs(1 / rdy);

  let stepX, stepY, sideDistX, sideDistY;
  if (rdx < 0) {
    stepX = -1;
    sideDistX = (x - mapX) * deltaDistX;
  } else {
    stepX = 1;
    sideDistX = (mapX + 1 - x) * deltaDistX;
  }
  if (rdy < 0) {
    stepY = -1;
    sideDistY = (y - mapY) * deltaDistY;
  } else {
    stepY = 1;
    sideDistY = (mapY + 1 - y) * deltaDistY;
  }

  let side = 0;
  for (let i = 0; i < 128; i++) {
    if (sideDistX < sideDistY) {
      sideDistX += deltaDistX;
      mapX += stepX;
      side = 0;
    } else {
      sideDistY += deltaDistY;
      mapY += stepY;
      side = 1;
    }
    if (cellAt(map, mapX, mapY) !== 0) break;
  }
  return side === 0 ? sideDistX - deltaDistX : sideDistY - deltaDistY;
}

// Un rayo hitscan: daña al primer enemigo vivo dentro del pasillo de impacto
// y antes de la primera pared.
function hitscan(map, angle, dmg) {
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const wallDist = castWallDistance(map, player.x, player.y, dirX, dirY);

  let best = null;
  let bestForward = Infinity;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (e.state === STATE.DEAD) continue;
    const rx = e.x - player.x;
    const ry = e.y - player.y;
    const forward = rx * dirX + ry * dirY;         // profundidad sobre la vista
    if (forward <= 0.1 || forward >= wallDist) continue;
    const side = -rx * dirY + ry * dirX;           // desvío perpendicular
    if (side > HIT_HALF_WIDTH || side < -HIT_HALF_WIDTH) continue;
    if (forward < bestForward) {
      bestForward = forward;
      best = e;
    }
  }
  if (best) hitEnemy(best, dmg);
}

function firePistol(map) {
  weapon.cooldown = PISTOL_COOLDOWN;
  weapon.ammo--;
  weapon.recoil = 0.15;
  weapon.flash = 0.08;
  window.__audio?.playShot?.();
  hitscan(map, player.angle, 10 + ((Math.random() * 6) | 0)); // 10-15
}

function fireShotgun(map) {
  weapon.cooldown = SHOTGUN_COOLDOWN;
  weapon.ammo -= 2;
  weapon.recoil = 0.22;
  weapon.flash = 0.1;
  (window.__audio?.playShotgun ?? window.__audio?.playShot)?.();
  for (let k = 0; k < SHOTGUN_PELLETS; k++) {
    const a = player.angle + (k - (SHOTGUN_PELLETS - 1) / 2) * SHOTGUN_SPREAD;
    hitscan(map, a, 6 + ((Math.random() * 5) | 0)); // 6-10 por perdigón
  }
}

export function update(map, dt) {
  if (weapon.cooldown > 0) weapon.cooldown -= dt;
  if (weapon.recoil > 0) weapon.recoil -= dt;
  if (weapon.flash > 0) weapon.flash -= dt;

  // Botón táctil de cambio de arma: touch.js solo encola la intención.
  touch.weaponBtnEnabled = weapon.hasShotgun;
  if (touch.switchQueued) {
    touch.switchQueued = false;
    if (weapon.hasShotgun) weapon.current = weapon.current === 0 ? 1 : 0;
  }

  // Bob: la fase avanza con la distancia recorrida (no con el tiempo).
  const mx = player.x - prevX;
  const my = player.y - prevY;
  prevX = player.x;
  prevY = player.y;
  const moved = Math.sqrt(mx * mx + my * my);
  if (moved > 0.0005) {
    weapon.bobPhase = (weapon.bobPhase + moved * 3.4) % TAU;
  }

  const wantFire = touch.firePressed || fireKey || fireMouse;
  if (wantFire && weapon.cooldown <= 0) {
    if (weapon.current === 1 && weapon.hasShotgun && weapon.ammo >= 2) fireShotgun(map);
    else if (weapon.ammo >= 1) firePistol(map);
  }
}

// Dibuja el arma abajo al centro, sobre el frame ya volcado.
export function render(ctx, W, H) {
  const shotgun = weapon.current === 1 && weapon.hasShotgun;
  const gw = shotgun ? SG_W : GUN_W;
  const gh = shotgun ? SG_H : GUN_H;
  const scale = H / 66; // el arma ocupa ~45% del alto de render
  const w = gw * scale;
  const h = gh * scale;

  const bobX = Math.sin(weapon.bobPhase) * 3;
  const bobY = Math.abs(Math.cos(weapon.bobPhase)) * 2;

  // Retroceso en 3 pasos discretos (baja y vuelve a subir).
  let kick = 0;
  if (weapon.recoil > 0.1) kick = 3;
  else if (weapon.recoil > 0.05) kick = 2;
  else if (weapon.recoil > 0) kick = 1;
  const kickY = kick * (shotgun ? 4 : 3);

  const x = (W - w) / 2 + bobX;
  const y = H - h * 0.86 + bobY + kickY;

  const firing = weapon.recoil > 0.05;
  ctx.drawImage(
    shotgun ? (firing ? sgFire : sgIdle) : (firing ? gunFire : gunIdle),
    x, y, w, h,
  );

  // Fogonazo en la boca del cañón (1-2 frames); más ancho en la escopeta.
  if (weapon.flash > 0) {
    const fx = x + w / 2;
    const fy = y + 2 * scale;
    const r = (weapon.flash > 0.04 ? 7 : 4) * scale * (shotgun ? 0.9 : 0.6);
    ctx.fillStyle = '#ff9820';
    ctx.beginPath();
    ctx.arc(fx, fy, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffe050';
    ctx.beginPath();
    ctx.arc(fx, fy, r * 0.55, 0, TAU);
    ctx.fill();
  }
}
