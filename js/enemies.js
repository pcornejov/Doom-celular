// Enemigos (imps): máquina de estados idle → chase → attack, con hurt y dead.
// Todo preasignado al cargar el módulo: cero allocations dentro del update.
//
// Cada enemigo expone `pose` (0 de pie, 1 atacando, 2 herido, 3 cadáver) para
// que el raycaster elija el bitmap sin conocer la lógica de estados.

import { cellAt } from './maps.js';
import { player, damagePlayer } from './player.js';

export const STATE = { IDLE: 0, CHASE: 1, ATTACK: 2, HURT: 3, DEAD: 4 };

const HP = 30;
const SPEED = 1.6;          // celdas por segundo persiguiendo
const RADIUS = 0.22;        // mismo margen de colisión que el jugador
const SIGHT_DIST = 10;      // distancia máxima a la que ve al jugador
const ATTACK_DIST = 1.2;    // entra en ataque por debajo de esta distancia
const ATTACK_EXIT = 1.6;    // vuelve a perseguir por encima de esta
const ATTACK_PERIOD = 1.0;  // segundos entre golpes
const ATTACK_WINDUP = 0.6;  // retardo del primer golpe al entrar en ataque
const HURT_TIME = 0.3;      // stun al recibir daño
const SEPARATION = 0.6;     // distancia mínima entre enemigos (repulsión)

// Posiciones iniciales en el nivel 1, repartidas por las salas y lejos del
// spawn del jugador (2.5, 10.5).
const SPAWNS = [
  [3.5, 4.5],    // sala de ladrillo (noroeste)
  [15.5, 4.5],   // sala de metal (norte)
  [21.5, 4.5],   // pasillo este
  [17.5, 11.5],  // sala roja
  [13.5, 9.5],   // corredor central
  [7.5, 18.5],   // sala sur oeste
  [9.5, 18.5],   // sala sur centro
  [17.5, 21.5],  // sala sur este
];

export const enemies = [];
for (let i = 0; i < SPAWNS.length; i++) {
  enemies.push({
    x: SPAWNS[i][0],
    y: SPAWNS[i][1],
    hp: HP,
    state: STATE.IDLE,
    pose: 0,
    stateTime: 0,
    attackTimer: 0,
  });
}

export function reset() {
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    e.x = SPAWNS[i][0];
    e.y = SPAWNS[i][1];
    e.hp = HP;
    e.state = STATE.IDLE;
    e.pose = 0;
    e.stateTime = 0;
    e.attackTimer = 0;
  }
}

export function allDead() {
  for (let i = 0; i < enemies.length; i++) {
    if (enemies[i].state !== STATE.DEAD) return false;
  }
  return true;
}

// Daño recibido (lo llama el arma). Stun breve; a dead si se queda sin vida.
export function hitEnemy(e, dmg) {
  if (e.state === STATE.DEAD) return;
  e.hp -= dmg;
  if (e.hp <= 0) {
    e.state = STATE.DEAD;
    e.pose = 3;
    window.__audio?.playEnemyDeath?.();
  } else {
    e.state = STATE.HURT;
    e.pose = 2;
    e.stateTime = 0;
    window.__audio?.playHit?.();
  }
}

// Línea de visión por DDA sobre la grilla: true si no hay pared entre
// (x0,y0) y (x1,y1). Sin allocations.
function lineOfSight(map, x0, y0, x1, y1) {
  let rdx = x1 - x0;
  let rdy = y1 - y0;
  const dist = Math.sqrt(rdx * rdx + rdy * rdy);
  if (dist < 1e-6) return true;
  rdx /= dist;
  rdy /= dist;

  let mapX = x0 | 0;
  let mapY = y0 | 0;
  const targetX = x1 | 0;
  const targetY = y1 | 0;
  const deltaDistX = rdx === 0 ? 1e30 : Math.abs(1 / rdx);
  const deltaDistY = rdy === 0 ? 1e30 : Math.abs(1 / rdy);

  let stepX, stepY, sideDistX, sideDistY;
  if (rdx < 0) {
    stepX = -1;
    sideDistX = (x0 - mapX) * deltaDistX;
  } else {
    stepX = 1;
    sideDistX = (mapX + 1 - x0) * deltaDistX;
  }
  if (rdy < 0) {
    stepY = -1;
    sideDistY = (y0 - mapY) * deltaDistY;
  } else {
    stepY = 1;
    sideDistY = (mapY + 1 - y0) * deltaDistY;
  }

  for (let i = 0; i < 64; i++) {
    if (mapX === targetX && mapY === targetY) return true;
    if (sideDistX < sideDistY) {
      sideDistX += deltaDistX;
      mapX += stepX;
    } else {
      sideDistY += deltaDistY;
      mapY += stepY;
    }
    if (cellAt(map, mapX, mapY) !== 0) return false;
  }
  return false;
}

// Movimiento con colisión por eje (deslizamiento), igual que el jugador.
function tryMoveEnemy(map, e, nx, ny) {
  if (
    cellAt(map, nx - RADIUS, e.y - RADIUS) === 0 &&
    cellAt(map, nx + RADIUS, e.y - RADIUS) === 0 &&
    cellAt(map, nx - RADIUS, e.y + RADIUS) === 0 &&
    cellAt(map, nx + RADIUS, e.y + RADIUS) === 0
  ) {
    e.x = nx;
  }
  if (
    cellAt(map, e.x - RADIUS, ny - RADIUS) === 0 &&
    cellAt(map, e.x + RADIUS, ny - RADIUS) === 0 &&
    cellAt(map, e.x - RADIUS, ny + RADIUS) === 0 &&
    cellAt(map, e.x + RADIUS, ny + RADIUS) === 0
  ) {
    e.y = ny;
  }
}

export function update(map, dt) {
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (e.state === STATE.DEAD) continue;

    e.stateTime += dt;
    const dx = player.x - e.x;
    const dy = player.y - e.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    switch (e.state) {
      case STATE.IDLE:
        e.pose = 0;
        if (dist < SIGHT_DIST && lineOfSight(map, e.x, e.y, player.x, player.y)) {
          e.state = STATE.CHASE;
          e.stateTime = 0;
        }
        break;

      case STATE.CHASE: {
        e.pose = 0;
        if (dist < ATTACK_DIST) {
          e.state = STATE.ATTACK;
          e.stateTime = 0;
          e.attackTimer = ATTACK_WINDUP;
          break;
        }
        if (dist > 1e-6) {
          const step = (SPEED * dt) / dist;
          tryMoveEnemy(map, e, e.x + dx * step, e.y + dy * step);
        }
        break;
      }

      case STATE.ATTACK:
        // Pose de zarpazo justo antes de golpear.
        e.pose = e.attackTimer < 0.25 ? 1 : 0;
        if (dist > ATTACK_EXIT) {
          e.state = STATE.CHASE;
          e.stateTime = 0;
          break;
        }
        e.attackTimer -= dt;
        if (e.attackTimer <= 0) {
          e.attackTimer += ATTACK_PERIOD;
          if (dist < ATTACK_EXIT && lineOfSight(map, e.x, e.y, player.x, player.y)) {
            damagePlayer(8 + ((Math.random() * 5) | 0)); // 8-12
          }
        }
        break;

      case STATE.HURT:
        e.pose = 2;
        if (e.stateTime >= HURT_TIME) {
          e.state = STATE.CHASE; // al recibir un tiro queda alertado
          e.stateTime = 0;
          e.pose = 0;
        }
        break;
    }
  }

  // Repulsión par a par: los enemigos vivos no se atraviesan entre ellos.
  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i];
    if (a.state === STATE.DEAD) continue;
    for (let j = i + 1; j < enemies.length; j++) {
      const b = enemies[j];
      if (b.state === STATE.DEAD) continue;
      let sx = b.x - a.x;
      let sy = b.y - a.y;
      const d2 = sx * sx + sy * sy;
      if (d2 >= SEPARATION * SEPARATION || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const push = (SEPARATION - d) * 0.5;
      sx /= d;
      sy /= d;
      tryMoveEnemy(map, a, a.x - sx * push, a.y - sy * push);
      tryMoveEnemy(map, b, b.x + sx * push, b.y + sy * push);
    }
  }
}
