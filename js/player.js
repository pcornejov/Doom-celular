// Jugador: posición, rotación, movimiento con colisión contra la grilla.
// Entrada provisional de teclado para probar en desktop; los controles
// táctiles llegan en la Iteración 2 y alimentarán las mismas variables
// de intención (moveForward, moveStrafe, turn).

import { cellAt } from './maps.js';

const MOVE_SPEED = 3.2;   // celdas por segundo
const TURN_SPEED = 2.6;   // radianes por segundo
const RADIUS = 0.22;      // margen de colisión

export const player = {
  x: 0,
  y: 0,
  angle: 0,
  // Intención de movimiento por frame, en [-1, 1]. La escribe el teclado
  // hoy y el táctil mañana.
  moveForward: 0,
  moveStrafe: 0,
  turn: 0,
};

export function spawn(map) {
  player.x = map.playerStart.x;
  player.y = map.playerStart.y;
  player.angle = map.playerStart.angle;
}

// --- Teclado (desktop) ---
const keys = new Set();
window.addEventListener('keydown', (e) => keys.add(e.code));
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

function readKeyboard() {
  let f = 0, s = 0, t = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
  if (keys.has('KeyA')) s -= 1;
  if (keys.has('KeyD')) s += 1;
  if (keys.has('ArrowLeft')) t -= 1;
  if (keys.has('ArrowRight')) t += 1;
  player.moveForward = f;
  player.moveStrafe = s;
  player.turn = t;
}

// Intenta mover cada eje por separado para deslizarse por las paredes.
function tryMove(map, nx, ny) {
  if (
    cellAt(map, nx - RADIUS, player.y - RADIUS) === 0 &&
    cellAt(map, nx + RADIUS, player.y - RADIUS) === 0 &&
    cellAt(map, nx - RADIUS, player.y + RADIUS) === 0 &&
    cellAt(map, nx + RADIUS, player.y + RADIUS) === 0
  ) {
    player.x = nx;
  }
  if (
    cellAt(map, player.x - RADIUS, ny - RADIUS) === 0 &&
    cellAt(map, player.x + RADIUS, ny - RADIUS) === 0 &&
    cellAt(map, player.x - RADIUS, ny + RADIUS) === 0 &&
    cellAt(map, player.x + RADIUS, ny + RADIUS) === 0
  ) {
    player.y = ny;
  }
}

export function update(map, dt) {
  readKeyboard();

  player.angle += player.turn * TURN_SPEED * dt;

  const cos = Math.cos(player.angle);
  const sin = Math.sin(player.angle);
  const dx = (cos * player.moveForward - sin * player.moveStrafe) * MOVE_SPEED * dt;
  const dy = (sin * player.moveForward + cos * player.moveStrafe) * MOVE_SPEED * dt;

  if (dx !== 0 || dy !== 0) tryMove(map, player.x + dx, player.y + dy);
}
