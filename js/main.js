// Doom Celular — Iteración 0: esqueleto del juego.
// Canvas a pantalla completa, game loop con requestAnimationFrame,
// contador de FPS y visualización de toques para verificar multi-touch
// en un teléfono real.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// Resolución interna de render: baja y fija, estilo retro. El canvas se
// escala por CSS a pantalla completa; aquí solo importa la relación de
// aspecto de la pantalla.
const RENDER_HEIGHT = 180;
let renderWidth = 320;

function resize() {
  const aspect = window.innerWidth / window.innerHeight;
  renderWidth = Math.round(RENDER_HEIGHT * aspect);
  canvas.width = renderWidth;
  canvas.height = RENDER_HEIGHT;
  ctx.imageSmoothingEnabled = false;
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

  update(time / 1000);
  render(time / 1000);

  requestAnimationFrame(frame);
}

function update(t) {
  // Iteración 1: aquí vivirá la lógica del jugador y del mundo.
}

function render(t) {
  const w = renderWidth;
  const h = RENDER_HEIGHT;

  // Techo y suelo provisionales: el "hola mundo" del raycaster.
  ctx.fillStyle = '#1a0e08';
  ctx.fillRect(0, 0, w, h / 2);
  ctx.fillStyle = '#2e2a24';
  ctx.fillRect(0, h / 2, w, h / 2);

  // Franja central pulsante, para ver que el loop está vivo.
  const pulse = 0.5 + 0.5 * Math.sin(t * 2);
  ctx.fillStyle = `rgb(${Math.round(120 + 80 * pulse)}, 20, 10)`;
  ctx.fillRect(0, h / 2 - 2, w, 4);

  // Título.
  ctx.textAlign = 'center';
  ctx.fillStyle = '#c22';
  ctx.font = 'bold 24px monospace';
  ctx.fillText('DOOM CELULAR', w / 2, h / 2 - 14);
  ctx.fillStyle = '#886';
  ctx.font = '8px monospace';
  ctx.fillText('ITERACIÓN 0 — ESQUELETO', w / 2, h / 2 + 14);

  // Toques activos: un círculo por dedo.
  ctx.strokeStyle = '#f80';
  ctx.lineWidth = 2;
  for (const p of touches.values()) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
    ctx.stroke();
  }

  // FPS arriba a la izquierda.
  ctx.textAlign = 'left';
  ctx.fillStyle = '#0f0';
  ctx.font = '8px monospace';
  ctx.fillText(`FPS ${fps}`, 4, 10);
}

requestAnimationFrame(frame);
