// Jugador: posición, rotación, movimiento con colisión contra la grilla.
// La entrada llega por dos vías que se combinan en update():
//   - Teclado (desktop): readKeyboard() cada frame.
//   - Táctil (touch.js): escribe touchForward/touchStrafe/touchMoveActive
//     y acumula turnImpulse (radianes que se consumen este frame).
// Si el joystick táctil está activo tiene prioridad sobre el teclado.

import { cellAt } from './maps.js';

const MOVE_SPEED = 3.2;   // celdas por segundo
const TURN_SPEED = 2.6;   // radianes por segundo
const RADIUS = 0.22;      // margen de colisión

export const player = {
  x: 0,
  y: 0,
  angle: 0,
  // Intención de movimiento resultante de este frame, en [-1, 1].
  moveForward: 0,
  moveStrafe: 0,
  turn: 0,
  // Giro táctil: radianes acumulados por touch.js, se consumen en update().
  turnImpulse: 0,
  // Joystick táctil (lo escribe touch.js).
  touchForward: 0,
  touchStrafe: 0,
  touchMoveActive: false,
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

// Intención del teclado de este frame (no pisa a player.* directamente:
// update() la combina con la entrada táctil).
let kbForward = 0;
let kbStrafe = 0;
let kbTurn = 0;

function readKeyboard() {
  let f = 0, s = 0, t = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
  if (keys.has('KeyA')) s -= 1;
  if (keys.has('KeyD')) s += 1;
  if (keys.has('ArrowLeft')) t -= 1;
  if (keys.has('ArrowRight')) t += 1;
  kbForward = f;
  kbStrafe = s;
  kbTurn = t;
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

  // El joystick táctil manda mientras está activo; si no, teclado.
  if (player.touchMoveActive) {
    player.moveForward = player.touchForward;
    player.moveStrafe = player.touchStrafe;
  } else {
    player.moveForward = kbForward;
    player.moveStrafe = kbStrafe;
  }
  player.turn = kbTurn;

  // Giro: continuo (teclado) + impulso táctil en radianes, que se consume.
  player.angle += player.turn * TURN_SPEED * dt + player.turnImpulse;
  player.turnImpulse = 0;

  const cos = Math.cos(player.angle);
  const sin = Math.sin(player.angle);
  const dx = (cos * player.moveForward - sin * player.moveStrafe) * MOVE_SPEED * dt;
  const dy = (sin * player.moveForward + cos * player.moveStrafe) * MOVE_SPEED * dt;

  if (dx !== 0 || dy !== 0) tryMove(map, player.x + dx, player.y + dy);
}
