// Enemigos (imps): máquina de estados idle → chase → attack, con hurt y dead.
// Los spawns vienen del mapa compilado (marcadores 'S' y 's'); loadEnemies()
// reconstruye el array al cargar cada nivel (fuera del loop: cero allocations
// por frame).
//
// Dos variantes: imp normal y imp rápido ('s', tinte azulado en el sprite):
// más veloz y frágil, pega menos pero solo cuerpo a cuerpo (su amenaza es la
// velocidad). El imp NORMAL además lanza bolas de fuego a media distancia
// (estado CAST: 0.4 s en pose de ataque y dispara; ver projectiles.js).
// Cada enemigo expone `pose` (0 de pie/andar A, 1 atacando, 2 herido,
// 3 cadáver, 4 andar B) y `fast` para que el raycaster elija el bitmap sin
// conocer la lógica de estados.

import { cellAt } from './maps.js';
import { player, damagePlayer } from './player.js';
import { spawnFireball } from './projectiles.js';
import { difficulty } from './difficulty.js';

export const STATE = { IDLE: 0, CHASE: 1, ATTACK: 2, HURT: 3, DEAD: 4, CAST: 5 };

const HP = 30;
const HP_FAST = 20;
const SPEED = 1.6;          // celdas por segundo persiguiendo
const SPEED_FAST = 2.4;
const RADIUS = 0.22;        // mismo margen de colisión que el jugador
const SIGHT_DIST = 10;      // distancia máxima a la que ve al jugador
const ATTACK_DIST = 1.2;    // entra en ataque por debajo de esta distancia
const ATTACK_EXIT = 1.6;    // vuelve a perseguir por encima de esta
const ATTACK_PERIOD = 1.0;  // segundos entre golpes
const ATTACK_WINDUP = 0.6;  // retardo del primer golpe al entrar en ataque
const HURT_TIME = 0.3;      // stun al recibir daño

// Bolas de fuego (solo imps normales)
const FIRE_MIN_DIST = 2.5;  // no dispara más cerca (ahí prefiere el zarpazo)
const FIRE_MAX_DIST = 9;    // ni más lejos
const FIRE_PERIOD_MIN = 1.6; // el periodo se sortea en [1.6, 2.4] por disparo
const FIRE_PERIOD_VAR = 0.8;
const CAST_TIME = 0.4;      // segundos en pose de ataque antes de lanzar

const WALK_RATE = 4;        // pasos por segundo del ciclo de andar

const SEPARATION = 0.6;     // distancia mínima entre enemigos (repulsión)

export const enemies = [];

// (Re)puebla el array in-place con los spawns del mapa: la identidad del
// array se conserva (window.enemies y los módulos que lo importan siguen
// viendo el mismo objeto).
export function loadEnemies(map) {
  enemies.length = 0;
  const spawns = map.enemySpawns;
  for (let i = 0; i < spawns.length; i++) {
    enemies.push({
      x: spawns[i].x,
      y: spawns[i].y,
      fast: spawns[i].fast,
      hp: spawns[i].fast ? HP_FAST : HP,
      state: STATE.IDLE,
      pose: 0,
      stateTime: 0,
      attackTimer: 0,
      animTime: 0, // fase del ciclo de andar
      // Aleatorio por imp: los disparos del grupo no salen sincronizados.
      fireTimer: FIRE_PERIOD_MIN + Math.random() * FIRE_PERIOD_VAR,
    });
  }
}

export function countKills() {
  let k = 0;
  for (let i = 0; i < enemies.length; i++) {
    if (enemies[i].state === STATE.DEAD) k++;
  }
  return k;
}

// Daño recibido (lo llama el arma). Stun breve; a dead si se queda sin vida.
export function hitEnemy(e, dmg) {
  if (e.state === STATE.DEAD) return;
  e.hp -= dmg;
  if (e.hp <= 0) {
    e.state = STATE.DEAD;
    e.pose = 3;
    window.__audio?.playEnemyDeath?.(e.x, e.y);
  } else {
    e.state = STATE.HURT;
    e.pose = 2;
    e.stateTime = 0;
    window.__audio?.playHit?.(e.x, e.y);
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
          window.__audio?.playAlert?.(e.x, e.y); // gruñido posicional "¡te vio!"
        }
        break;

      case STATE.CHASE: {
        if (dist < ATTACK_DIST) {
          e.state = STATE.ATTACK;
          e.stateTime = 0;
          e.attackTimer = ATTACK_WINDUP;
          break;
        }
        // Ataque a distancia (solo imps normales): cuando vence el periodo,
        // con línea de visión y a distancia media, pasa a CAST. En PESADILLA
        // el periodo corre un 30% más rápido (fireRateMul).
        if (!e.fast) {
          e.fireTimer -= dt * difficulty.fireRateMul;
          if (
            e.fireTimer <= 0 &&
            dist >= FIRE_MIN_DIST && dist <= FIRE_MAX_DIST &&
            lineOfSight(map, e.x, e.y, player.x, player.y)
          ) {
            e.state = STATE.CAST;
            e.stateTime = 0;
            e.pose = 1;
            break;
          }
        }
        // Ciclo de andar: alterna poses 0/4 a WALK_RATE pasos/s SOLO mientras
        // se mueve (en chase siempre avanza hacia el jugador).
        e.animTime += dt;
        e.pose = ((e.animTime * WALK_RATE) | 0) & 1 ? 4 : 0;
        if (dist > 1e-6) {
          const step = ((e.fast ? SPEED_FAST : SPEED) * difficulty.enemySpeedMul * dt) / dist;
          tryMoveEnemy(map, e, e.x + dx * step, e.y + dy * step);
        }
        break;
      }

      case STATE.CAST:
        // Quieto en pose de ataque CAST_TIME segundos y lanza la bola hacia
        // la posición ACTUAL del jugador (sin predicción: esquivable).
        e.pose = 1;
        if (e.stateTime >= CAST_TIME) {
          spawnFireball(e.x, e.y, player.x, player.y);
          window.__audio?.playFireball?.(e.x, e.y);
          e.fireTimer = FIRE_PERIOD_MIN + Math.random() * FIRE_PERIOD_VAR;
          e.state = STATE.CHASE;
          e.stateTime = 0;
        }
        break;

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
            // Normal 8-12, rápido 5-8; escalado por la dificultad elegida.
            const base = e.fast ? 5 + ((Math.random() * 4) | 0) : 8 + ((Math.random() * 5) | 0);
            damagePlayer(Math.round(base * difficulty.dmgMul));
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
