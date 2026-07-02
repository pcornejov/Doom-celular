// Puertas y salida de nivel.
// Una puerta es una celda DOOR_TYPE que se abre sola cuando el jugador la
// "usa": está a menos de USE_DIST de su centro y mirando hacia ella. Mientras
// se abre (0.5 s) sigue bloqueando movimiento y rayos; el raycaster lee
// map.doorProg[idx] para dibujar la hoja hundiéndose en el suelo. Al terminar,
// la celda pasa a 0 y deja de existir.
// La salida (EXIT_TYPE) usa la misma comprobación de proximidad + orientación.

import { player } from './player.js';
import { DOOR_TYPE } from './maps.js';

const USE_DIST = 1.2;
const OPEN_TIME = 0.5; // segundos de animación de apertura
const FACING_DOT = 0.3;

// ¿Está el jugador a menos de USE_DIST del centro de (cx,cy) y mirándolo?
function playerUses(cx, cy) {
  const dx = cx + 0.5 - player.x;
  const dy = cy + 0.5 - player.y;
  const d2 = dx * dx + dy * dy;
  if (d2 > USE_DIST * USE_DIST) return false;
  const d = Math.sqrt(d2);
  return (dx * Math.cos(player.angle) + dy * Math.sin(player.angle)) / d > FACING_DOT;
}

// Reinicio dinámico al (re)cargar un nivel: cierra todas las puertas.
export function loadDoors(map) {
  for (let i = 0; i < map.doors.length; i++) {
    const d = map.doors[i];
    d.prog = 0;
    d.opening = false;
    map.cells[d.idx] = DOOR_TYPE;
    map.doorProg[d.idx] = 0;
  }
}

export function update(map, dt) {
  for (let i = 0; i < map.doors.length; i++) {
    const d = map.doors[i];
    if (d.prog >= 1) continue;
    if (!d.opening) {
      if (!playerUses(d.cx, d.cy)) continue;
      d.opening = true;
      window.__audio?.playDoor?.();
    }
    d.prog += dt / OPEN_TIME;
    if (d.prog >= 1) {
      d.prog = 1;
      map.cells[d.idx] = 0;    // abierta del todo: deja pasar rayos y cuerpos
      map.doorProg[d.idx] = 0;
    } else {
      map.doorProg[d.idx] = d.prog;
    }
  }
}

// true si el jugador está tocando la salida del nivel.
export function checkExit(map) {
  return playerUses(map.exit.cx, map.exit.cy);
}
