// Doom Celular — game loop y orquestación.
// Iteración 6: campaña de 3 niveles con puertas, ítems, escopeta e
// intermisiones. La salida ('X') de cada mapa lleva al siguiente; salud,
// balas y armas se conservan entre niveles. Morir reinicia el nivel actual
// con 100 de salud y el equipo con el que se entró (snapshot al entrar).

import { levels } from './maps.js';
import * as raycaster from './raycaster.js';
import { player, spawn, update as updatePlayer } from './player.js';
import { initTouch, touch } from './touch.js';
import { enemies, update as updateEnemies, loadEnemies, countKills } from './enemies.js';
import * as doors from './doors.js';
import * as items from './items.js';
import * as weapon from './weapon.js';
import * as hud from './hud.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// Resolución interna de render: baja y fija, estilo retro. El canvas se
// escala por CSS a pantalla completa (sin devicePixelRatio: la resolución
// interna NO sube con la densidad de píxeles).
const RENDER_HEIGHT = 180;
let renderWidth = 320;

initTouch(canvas);
weapon.initWeapon(canvas);

// Estado de la campaña. phase: playing | dead | intermission | end.
const state = {
  phase: 'playing',
  levelIndex: 0,
  map: levels[0],
  fps: 0,
};

let endTimer = 0;   // evita avanzar por el mismo toque que te mató/ganó
let levelTime = 0;  // tiempo en el nivel actual
let nameTimer = 0;  // segundos que le quedan al rótulo con el nombre del nivel

// Estadísticas del último nivel completado (para la intermisión) y totales.
let lastKills = 0;
let lastTotal = 0;
let lastTime = 0;
let totalKills = 0;
let totalEnemies = 0;
let totalTime = 0;

// Equipo con el que se ENTRÓ al nivel: se restaura al morir.
const snapshot = { ammo: weapon.weapon.ammo, hasShotgun: false, current: 0 };

function loadLevel(index, hp) {
  state.levelIndex = index;
  state.map = levels[index];
  doors.loadDoors(state.map);
  items.loadItems(state.map);
  loadEnemies(state.map);
  spawn(state.map);
  player.hp = hp;
  snapshot.ammo = weapon.weapon.ammo;
  snapshot.hasShotgun = weapon.weapon.hasShotgun;
  snapshot.current = weapon.weapon.current;
  state.phase = 'playing';
  endTimer = 0;
  levelTime = 0;
  nameTimer = 3;
}
loadLevel(0, 100);

// Depuración: expone el estado para inspección / tests.
window.player = player;
window.enemies = enemies;
window.__game = { state, weapon: weapon.weapon, items: items.items, touch };

function completeLevel() {
  lastKills = countKills();
  lastTotal = enemies.length;
  lastTime = levelTime;
  totalKills += lastKills;
  totalEnemies += lastTotal;
  totalTime += lastTime;
  state.phase = state.levelIndex === levels.length - 1 ? 'end' : 'intermission';
  endTimer = 0;
  window.__audio?.playVictory?.();
}

function nextLevel() {
  loadLevel(state.levelIndex + 1, player.hp);
}

function restartEpisode() {
  totalKills = 0;
  totalEnemies = 0;
  totalTime = 0;
  weapon.reset();
  loadLevel(0, 100);
}

function retryLevel() {
  // Restaurar el equipo de entrada ANTES de recargar: el snapshot nuevo
  // queda igual y morir varias veces seguidas no acumula ni pierde nada.
  weapon.weapon.ammo = snapshot.ammo;
  weapon.weapon.hasShotgun = snapshot.hasShotgun;
  weapon.weapon.current = snapshot.current;
  loadLevel(state.levelIndex, 100);
}

function tryAdvance() {
  if (!started) return;
  if (state.phase === 'dead' && endTimer > 0.8) retryLevel();
  else if (state.phase === 'intermission' && endTimer > 0.4) nextLevel();
  else if (state.phase === 'end' && endTimer > 0.8) restartEpisode();
}
canvas.addEventListener('touchstart', tryAdvance, { passive: true });
canvas.addEventListener('click', tryAdvance);
window.addEventListener('keydown', tryAdvance);

function resize() {
  const aspect = window.innerWidth / window.innerHeight;
  renderWidth = Math.max(120, Math.round(RENDER_HEIGHT * aspect));
  canvas.width = renderWidth;
  canvas.height = RENDER_HEIGHT;
  ctx.imageSmoothingEnabled = false;
  raycaster.init(ctx, renderWidth, RENDER_HEIGHT);
}
window.addEventListener('resize', resize);
resize();

// --- TAP TO START ---
// El juego arranca pausado; el primer gesto (toque, clic o tecla) lo inicia.
// La Iteración 4 engancha el desbloqueo de audio en window.__onFirstGesture.
let started = false;
const startOverlay = document.getElementById('start-overlay');

function firstGesture(fromTouch) {
  if (started) return;
  started = true;
  startOverlay.classList.add('hidden');
  if (fromTouch) {
    // Pantalla completa: solo vale desde un gesto táctil. En iOS Safari no
    // existe requestFullscreen sobre documentElement: no pasa nada si falla.
    try {
      const p = document.documentElement.requestFullscreen();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (err) { /* sin pantalla completa, seguimos igual */ }
  }
  if (typeof window.__onFirstGesture === 'function') window.__onFirstGesture();
}

startOverlay.addEventListener('touchstart', (e) => {
  e.preventDefault();
  firstGesture(true);
}, { passive: false });
startOverlay.addEventListener('click', () => firstGesture(false));
window.addEventListener('keydown', () => firstGesture(false));

// --- Contador de FPS ---
let fps = 0;
let frames = 0;
let fpsTime = 0;

// --- Game loop ---
let lastFrameTime = 0;
const TAU = Math.PI * 2;

function frame(time) {
  const dt = Math.min((time - lastFrameTime) / 1000, 0.1);
  lastFrameTime = time;

  frames++;
  fpsTime += dt;
  if (fpsTime >= 0.5) {
    fps = Math.round(frames / fpsTime);
    state.fps = fps;
    frames = 0;
    fpsTime = 0;
  }

  if (started) {
    if (state.phase === 'playing') {
      levelTime += dt;
      if (nameTimer > 0) nameTimer -= dt;
      updatePlayer(state.map, dt);
      doors.update(state.map, dt);
      updateEnemies(state.map, dt);
      weapon.update(state.map, dt);
      items.update();
      if (player.hp <= 0) {
        state.phase = 'dead';
        endTimer = 0;
        window.__audio?.playerDeath?.();
      } else if (doors.checkExit(state.map)) {
        completeLevel();
      }
    } else {
      endTimer += dt;
      // La intermisión avanza sola a los 2 s (o antes con un toque).
      if (state.phase === 'intermission' && endTimer >= 2) nextLevel();
    }
  }

  // Orden de dibujo: mundo (paredes + sprites con z-buffer) → arma → HUD →
  // pantallas de fin → controles táctiles y FPS.
  raycaster.render(ctx, player, state.map, enemies, items.items);
  if (started) {
    if (state.phase === 'playing' || state.phase === 'intermission') {
      weapon.render(ctx, renderWidth, RENDER_HEIGHT);
    }
    hud.render(ctx, renderWidth, RENDER_HEIGHT, dt);
    if (state.phase === 'playing' && nameTimer > 0) {
      hud.renderLevelName(ctx, renderWidth, RENDER_HEIGHT, state.map.name, nameTimer);
    } else if (state.phase === 'dead') {
      hud.renderDeath(ctx, renderWidth, RENDER_HEIGHT, dt);
    } else if (state.phase === 'intermission') {
      hud.renderIntermission(ctx, renderWidth, RENDER_HEIGHT, dt, state.map.name, lastKills, lastTotal, lastTime);
    } else if (state.phase === 'end') {
      hud.renderEnd(ctx, renderWidth, RENDER_HEIGHT, dt, totalKills, totalEnemies, totalTime);
    }
  }
  drawOverlay();

  requestAnimationFrame(frame);
}

// Controles táctiles dibujados sobre el frame, en coordenadas del canvas de
// render (se convierte desde px CSS; el aspecto coincide, así que la escala
// vertical vale para los radios). Semitransparentes y en los bordes: no
// tapan el centro de la pantalla. Sin allocations por frame.
function drawTouchControls() {
  const sx = renderWidth / window.innerWidth;
  const sy = RENDER_HEIGHT / window.innerHeight;

  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1;

  // Joystick flotante: base + palanca, solo mientras el pulgar toca.
  if (touch.joyActive) {
    const r = touch.joyRadius * sy;
    ctx.strokeStyle = '#ddd';
    ctx.beginPath();
    ctx.arc(touch.joyOriginX * sx, touch.joyOriginY * sy, r, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = '#eee';
    ctx.beginPath();
    ctx.arc(touch.joyStickX * sx, touch.joyStickY * sy, r * 0.4, 0, TAU);
    ctx.fill();
  }

  // Botón de disparo fijo, con feedback al presionar.
  const fr = touch.fireRadius * sy;
  const fx = touch.fireX * sx;
  const fy = touch.fireY * sy;
  if (touch.firePressed) ctx.globalAlpha = 0.7;
  ctx.fillStyle = touch.firePressed ? '#f53a2a' : '#8a2418';
  ctx.beginPath();
  ctx.arc(fx, fy, fr, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#f0d8b0';
  ctx.beginPath();
  ctx.arc(fx, fy, fr, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = '#f0d8b0';
  ctx.beginPath();
  ctx.arc(fx, fy, fr * 0.28, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 0.35;

  // Botón de cambio de arma: solo cuando ya hay escopeta que alternar.
  // Muestra el número del arma activa (1 pistola, 2 escopeta).
  if (touch.weaponBtnEnabled) {
    const wr = touch.weaponRadius * sy;
    const wx = touch.weaponX * sx;
    const wy = touch.weaponY * sy;
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#243248';
    ctx.beginPath();
    ctx.arc(wx, wy, wr, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#f0d8b0';
    ctx.beginPath();
    ctx.arc(wx, wy, wr, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = '#f0d8b0';
    ctx.textAlign = 'center';
    ctx.font = 'bold 9px monospace';
    ctx.fillText(weapon.weapon.current === 1 ? '2' : '1', wx, wy + 3);
  }

  ctx.globalAlpha = 1;
}

function drawOverlay() {
  if (started && touch.enabled) drawTouchControls();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#0f0';
  ctx.font = '8px monospace';
  ctx.fillText(`FPS ${fps}`, 4, 10);
}

requestAnimationFrame(frame);
