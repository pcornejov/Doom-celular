// Doom Celular — game loop y orquestación.
// Iteración 3: combate — enemigos con IA, pistola hitscan, vida del jugador,
// HUD estilo Doom y pantallas de muerte / victoria con reinicio.

import { level1 } from './maps.js';
import * as raycaster from './raycaster.js';
import { player, spawn, update as updatePlayer } from './player.js';
import { initTouch, touch } from './touch.js';
import { enemies, update as updateEnemies, reset as resetEnemies, allDead } from './enemies.js';
import * as weapon from './weapon.js';
import * as hud from './hud.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// Resolución interna de render: baja y fija, estilo retro. El canvas se
// escala por CSS a pantalla completa (sin devicePixelRatio: la resolución
// interna NO sube con la densidad de píxeles).
const RENDER_HEIGHT = 180;
let renderWidth = 320;

const map = level1;
spawn(map);
initTouch(canvas);
weapon.initWeapon(canvas);

// Depuración: expone jugador y enemigos para inspección / tests.
window.player = player;
window.enemies = enemies;

// Fase de la partida una vez iniciada: jugando, muerto o nivel limpio.
let phase = 'playing';
let endTimer = 0; // evita reiniciar por el mismo toque que te mató/ganó

function resetLevel() {
  spawn(map);
  resetEnemies();
  weapon.reset();
  phase = 'playing';
  endTimer = 0;
}

function tryRestart() {
  if (started && phase !== 'playing' && endTimer > 0.8) resetLevel();
}
canvas.addEventListener('touchstart', tryRestart, { passive: true });
canvas.addEventListener('click', tryRestart);
window.addEventListener('keydown', tryRestart);

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
let lastTime = 0;
const TAU = Math.PI * 2;

function frame(time) {
  const dt = Math.min((time - lastTime) / 1000, 0.1);
  lastTime = time;

  frames++;
  fpsTime += dt;
  if (fpsTime >= 0.5) {
    fps = Math.round(frames / fpsTime);
    frames = 0;
    fpsTime = 0;
  }

  if (started) {
    if (phase === 'playing') {
      updatePlayer(map, dt);
      updateEnemies(map, dt);
      weapon.update(map, dt);
      if (player.hp <= 0) {
        phase = 'dead';
        window.__audio?.playerDeath?.();
      } else if (allDead()) {
        phase = 'victory';
        window.__audio?.playVictory?.();
      }
    } else {
      endTimer += dt;
    }
  }

  // Orden de dibujo: mundo (paredes + sprites con z-buffer) → arma → HUD →
  // pantallas de fin → controles táctiles y FPS.
  raycaster.render(ctx, player, map, enemies);
  if (started) {
    if (phase !== 'dead') weapon.render(ctx, renderWidth, RENDER_HEIGHT);
    hud.render(ctx, renderWidth, RENDER_HEIGHT, dt);
    if (phase === 'dead') hud.renderDeath(ctx, renderWidth, RENDER_HEIGHT, dt);
    else if (phase === 'victory') hud.renderVictory(ctx, renderWidth, RENDER_HEIGHT, dt);
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
