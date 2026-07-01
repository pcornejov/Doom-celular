// Doom Celular — game loop y orquestación.
// Iteración 1: motor raycasting + movimiento con teclado (desktop).
// Los toques se visualizan como círculos; los controles táctiles reales
// llegan en la Iteración 2.

import { level1 } from './maps.js';
import * as raycaster from './raycaster.js';
import { player, spawn, update as updatePlayer } from './player.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// Resolución interna de render: baja y fija, estilo retro. El canvas se
// escala por CSS a pantalla completa; aquí solo importa la relación de
// aspecto de la pantalla.
const RENDER_HEIGHT = 180;
let renderWidth = 320;

const map = level1;
spawn(map);

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

// --- Registro de toques activos (verificación de multi-touch) ---
const touches = new Map();

function touchPos(t) {
  return {
    x: (t.clientX / window.innerWidth) * renderWidth,
    y: (t.clientY / window.innerHeight) * RENDER_HEIGHT,
  };
}

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  for (const t of e.changedTouches) touches.set(t.identifier, touchPos(t));
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  for (const t of e.changedTouches) touches.set(t.identifier, touchPos(t));
}, { passive: false });

for (const type of ['touchend', 'touchcancel']) {
  canvas.addEventListener(type, (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) touches.delete(t.identifier);
  }, { passive: false });
}

// --- Contador de FPS ---
let fps = 0;
let frames = 0;
let fpsTime = 0;

// --- Game loop ---
let lastTime = 0;

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

  updatePlayer(map, dt);
  raycaster.render(ctx, player, map);
  drawOverlay();

  requestAnimationFrame(frame);
}

function drawOverlay() {
  // Toques activos: un círculo por dedo.
  ctx.strokeStyle = '#f80';
  ctx.lineWidth = 2;
  for (const p of touches.values()) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.textAlign = 'left';
  ctx.fillStyle = '#0f0';
  ctx.font = '8px monospace';
  ctx.fillText(`FPS ${fps}`, 4, 10);

  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(200, 190, 170, 0.6)';
  ctx.fillText('WASD + flechas — controles táctiles en la próxima iteración', renderWidth / 2, RENDER_HEIGHT - 6);
}

requestAnimationFrame(frame);
