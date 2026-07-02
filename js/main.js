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
import * as barrels from './barrels.js';
import * as projectiles from './projectiles.js';
import * as hud from './hud.js';
import { difficulty, setDifficulty, storedDifficultyIndex } from './difficulty.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// Resolución interna de render: baja, estilo retro. El canvas se escala por
// CSS a pantalla completa (sin devicePixelRatio: la resolución interna NO
// sube con la densidad de píxeles). Iteración 7: la altura es DINÁMICA — si
// el teléfono no sostiene 45 fps se baja un escalón (180 → 150 → 120) y con
// 10 s por encima de 55 fps se recupera uno (histéresis).
const RES_STEPS = [180, 150, 120];
let resStep = 0;
let renderHeight = RES_STEPS[0];
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

// resize se define antes de loadLevel porque loadLevel lo invoca: al cambiar
// de nivel hay que re-llamar a raycaster.init con el mapa nuevo para que el
// degradado de techo/suelo use los colores de ESE nivel.
function resize() {
  const aspect = window.innerWidth / window.innerHeight;
  renderWidth = Math.max(120, Math.round(renderHeight * aspect));
  canvas.width = renderWidth;
  canvas.height = renderHeight;
  ctx.imageSmoothingEnabled = false;
  raycaster.init(ctx, renderWidth, renderHeight, state.map);
}
window.addEventListener('resize', resize);

// --- Mejor marca del episodio (localStorage) ---
// Se guarda el mejor tiempo total y su % de bajas POR DIFICULTAD (clave
// compuesta). Gana el tiempo más bajo. La marca antigua sin sufijo
// ('doomcel_best') se migra como marca de HÁGANME DAÑO.
const BEST_KEY = 'doomcel_best';
let best = null;    // { t: segundos totales, k: % de bajas }
let newBest = false; // el episodio recién terminado batió la marca

function bestKey() {
  return `${BEST_KEY}_${difficulty.id}`;
}

function loadBest() {
  best = null;
  try {
    let raw = localStorage.getItem(bestKey());
    if (!raw && difficulty.id === 'normal') {
      // Migración: la marca vieja cuenta como marca de HÁGANME DAÑO.
      raw = localStorage.getItem(BEST_KEY);
      if (raw) localStorage.setItem(bestKey(), raw);
    }
    if (raw) {
      const b = JSON.parse(raw);
      if (b && typeof b.t === 'number' && typeof b.k === 'number') best = b;
    }
  } catch (e) { /* sin storage: se juega sin récords */ }
}

setDifficulty(storedDifficultyIndex());
loadBest();

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
  barrels.loadBarrels(state.map);
  projectiles.reset();
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
  resize(); // re-precalcula techo/suelo con los colores del mapa nuevo
}
loadLevel(0, 100);

// Depuración: expone el estado para inspección / tests.
window.player = player;
window.enemies = enemies;
window.barrels = barrels.barrels;
window.__game = {
  state, weapon: weapon.weapon, items: items.items, touch,
  fireballs: projectiles.fireballs, difficulty,
  get best() { return best; },
  get newBest() { return newBest; },
  get renderHeight() { return renderHeight; },
};

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

  // Fin del episodio: ¿se batió la mejor marca? (gana el tiempo más bajo)
  if (state.phase === 'end') {
    const pct = totalEnemies > 0 ? Math.round((totalKills / totalEnemies) * 100) : 100;
    newBest = !best || totalTime < best.t;
    if (newBest) {
      best = { t: totalTime, k: pct };
      try { localStorage.setItem(bestKey(), JSON.stringify(best)); } catch (e) { /* sin storage */ }
    }
  }
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

// --- Resolución dinámica ---
// Cada muestra de FPS llega cada 0.5 s; la media móvil usa una ventana de
// 3 s (6 muestras en un ring preasignado: sin allocations por frame).
const FPS_SAMPLES = 6;
const fpsRing = new Float32Array(FPS_SAMPLES);
fpsRing.fill(60);
let fpsRingIdx = 0;
let highTime = 0;        // segundos seguidos por encima de 55 fps
let resNoticeTimer = 0;  // segundos que le quedan al aviso en pantalla

function setResolution(step) {
  resStep = step;
  renderHeight = RES_STEPS[step];
  resize();
  fpsRing.fill(60); // ventana limpia: que el cambio se evalúe desde cero
  highTime = 0;
  resNoticeTimer = 1;
}

function onFpsSample(sample) {
  fpsRing[fpsRingIdx] = sample;
  fpsRingIdx = (fpsRingIdx + 1) % FPS_SAMPLES;
  let sum = 0;
  for (let i = 0; i < FPS_SAMPLES; i++) sum += fpsRing[i];
  if (sum / FPS_SAMPLES < 45 && resStep < RES_STEPS.length - 1) {
    setResolution(resStep + 1);
    return;
  }
  // Histéresis para subir: 10 s seguidos por encima de 55 fps.
  if (sample > 55) {
    highTime += 0.5;
    if (highTime >= 10 && resStep > 0) setResolution(resStep - 1);
  } else {
    highTime = 0;
  }
}

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

// --- Selector de dificultad (pantalla de inicio) ---
// Tocar un botón NO inicia el juego (stopPropagation): solo cambia la
// dificultad, la persiste y recarga la mejor marca de ESA dificultad.
const diffButtons = startOverlay.querySelectorAll('#difficulty button');

function selectDifficulty(index) {
  setDifficulty(index);
  loadBest();
  newBest = false;
  for (let i = 0; i < diffButtons.length; i++) {
    diffButtons[i].classList.toggle('selected', Number(diffButtons[i].dataset.diff) === index);
  }
}

for (let i = 0; i < diffButtons.length; i++) {
  const btn = diffButtons[i];
  const index = Number(btn.dataset.diff);
  btn.addEventListener('touchstart', (e) => {
    // preventDefault evita el click sintético posterior (doble activación).
    e.stopPropagation();
    e.preventDefault();
    selectDifficulty(index);
  }, { passive: false });
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    selectDifficulty(index);
  });
}
selectDifficulty(difficulty.index); // refleja la dificultad guardada

// --- Contador de FPS ---
let fps = 0;
let frames = 0;
let fpsTime = 0;

// --- Game loop ---
let lastFrameTime = 0;
const TAU = Math.PI * 2;

// Lista persistente de sprites no-enemigos (ítems + barriles + proyectiles +
// explosiones) que se pasa al pase unificado de sprites del raycaster.
const renderSprites = [];

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
    onFpsSample(fps);
  }
  if (resNoticeTimer > 0) resNoticeTimer -= dt;

  if (started) {
    if (state.phase === 'playing') {
      levelTime += dt;
      if (nameTimer > 0) nameTimer -= dt;
      updatePlayer(state.map, dt);
      doors.update(state.map, dt);
      updateEnemies(state.map, dt);
      projectiles.update(state.map, dt);
      barrels.update(dt);
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
  // La lista de sprites no-enemigos se reconstruye reutilizando el MISMO
  // array (solo se re-empujan referencias a descriptores preasignados:
  // cero objetos nuevos por frame).
  renderSprites.length = 0;
  for (let i = 0; i < items.items.length; i++) renderSprites.push(items.items[i]);
  barrels.pushSprites(renderSprites);
  projectiles.pushSprites(renderSprites);
  raycaster.render(ctx, player, state.map, enemies, renderSprites);
  if (started) {
    if (state.phase === 'playing' || state.phase === 'intermission') {
      weapon.render(ctx, renderWidth, renderHeight);
    }
    hud.render(ctx, renderWidth, renderHeight, dt);
    if (state.phase === 'playing' && nameTimer > 0) {
      hud.renderLevelName(ctx, renderWidth, renderHeight, state.map.name, nameTimer);
    } else if (state.phase === 'dead') {
      hud.renderDeath(ctx, renderWidth, renderHeight, dt);
    } else if (state.phase === 'intermission') {
      hud.renderIntermission(ctx, renderWidth, renderHeight, dt, state.map.name, lastKills, lastTotal, lastTime);
    } else if (state.phase === 'end') {
      hud.renderEnd(ctx, renderWidth, renderHeight, dt, totalKills, totalEnemies, totalTime, best, newBest, difficulty.name);
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
  const sy = renderHeight / window.innerHeight;

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

  // Aviso de 1 s cuando la resolución dinámica cambia de escalón.
  if (resNoticeTimer > 0) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 8px monospace';
    ctx.fillStyle = '#000';
    ctx.fillText('RESOLUCIÓN AJUSTADA', renderWidth / 2 + 1, 13);
    ctx.fillStyle = '#ffd870';
    ctx.fillText('RESOLUCIÓN AJUSTADA', renderWidth / 2, 12);
  }

  ctx.textAlign = 'left';
  ctx.fillStyle = '#0f0';
  ctx.font = '8px monospace';
  ctx.fillText(`FPS ${fps}`, 4, 10);
}

requestAnimationFrame(frame);

// --- Service worker: instalable y jugable offline (cache-first, ver sw.js) ---
// Ruta RELATIVA: en GitHub Pages el juego vive bajo /Doom-celular/.
if ('serviceWorker' in navigator) {
  try {
    const p = navigator.serviceWorker.register('./sw.js');
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch (e) { /* sin SW el juego funciona igual, solo no va offline */ }
}
