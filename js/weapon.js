// Pistola hitscan en primera persona.
// - Disparo con touch.firePressed, Espacio o clic; cadencia ~3/s, munición 48.
// - El impacto es instantáneo: primer enemigo vivo cuya perpendicular a la
//   línea de vista es < 0.35 y que queda antes de la primera pared.
// - Render: bitmap procedural (pistola + manos) pre-renderizado a un canvas
//   offscreen una sola vez; retroceso en 3 pasos, fogonazo y bob al caminar.

import { player } from './player.js';
import { touch } from './touch.js';
import { cellAt } from './maps.js';
import { enemies, hitEnemy, STATE } from './enemies.js';

const FIRE_COOLDOWN = 0.34; // ~3 disparos por segundo
const HIT_HALF_WIDTH = 0.35;
const START_AMMO = 48;

export const weapon = {
  ammo: START_AMMO,
  cooldown: 0,
  recoil: 0,   // temporizador de retroceso
  flash: 0,    // temporizador de fogonazo
  bobPhase: 0, // fase del balanceo al caminar
};

export function reset() {
  weapon.ammo = START_AMMO;
  weapon.cooldown = 0;
  weapon.recoil = 0;
  weapon.flash = 0;
  weapon.bobPhase = 0;
}

// --- Entrada de disparo (teclado / ratón; lo táctil llega por touch.js) ---
let fireKey = false;
let fireMouse = false;

export function initWeapon(canvas) {
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      fireKey = true;
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

// --- Bitmap de la pistola (una vez, al cargar) ---
const GUN_W = 40;
const GUN_H = 30;

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

const gunIdle = bakeGun(false);
const gunFire = bakeGun(true);

// --- Lógica ---
let prevX = 0;
let prevY = 0;
const TAU = Math.PI * 2;

// Distancia a la primera pared siguiendo la dirección de vista (DDA).
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

function fire(map) {
  weapon.cooldown = FIRE_COOLDOWN;
  weapon.ammo--;
  weapon.recoil = 0.15;
  weapon.flash = 0.08;
  window.__audio?.playShot?.();

  const dirX = Math.cos(player.angle);
  const dirY = Math.sin(player.angle);
  const wallDist = castWallDistance(map, player.x, player.y, dirX, dirY);

  // Primer enemigo vivo dentro del pasillo de impacto y antes de la pared.
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
  if (best) hitEnemy(best, 10 + ((Math.random() * 6) | 0)); // 10-15
}

export function update(map, dt) {
  if (weapon.cooldown > 0) weapon.cooldown -= dt;
  if (weapon.recoil > 0) weapon.recoil -= dt;
  if (weapon.flash > 0) weapon.flash -= dt;

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
  if (wantFire && weapon.cooldown <= 0 && weapon.ammo > 0) fire(map);
}

// Dibuja el arma abajo al centro, sobre el frame ya volcado.
export function render(ctx, W, H) {
  const scale = H / 66; // la pistola ocupa ~45% del alto de render
  const w = GUN_W * scale;
  const h = GUN_H * scale;

  const bobX = Math.sin(weapon.bobPhase) * 3;
  const bobY = Math.abs(Math.cos(weapon.bobPhase)) * 2;

  // Retroceso en 3 pasos discretos (baja y vuelve a subir).
  let kick = 0;
  if (weapon.recoil > 0.1) kick = 3;
  else if (weapon.recoil > 0.05) kick = 2;
  else if (weapon.recoil > 0) kick = 1;
  const kickY = kick * 3;

  const x = (W - w) / 2 + bobX;
  const y = H - h * 0.86 + bobY + kickY;

  const firing = weapon.recoil > 0.05;
  ctx.drawImage(firing ? gunFire : gunIdle, x, y, w, h);

  // Fogonazo en la boca del cañón (1-2 frames).
  if (weapon.flash > 0) {
    const fx = x + w / 2;
    const fy = y + 2 * scale;
    const r = (weapon.flash > 0.04 ? 7 : 4) * scale * 0.6;
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
