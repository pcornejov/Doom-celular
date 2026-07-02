// Doom Celular — Iteración 4: música y efectos de sonido con Web Audio API.
//
// Módulo autónomo: define window.__audio (efectos + control de música/mute) y
// window.__onFirstGesture (desbloqueo del AudioContext en el primer gesto,
// requisito de iOS/Android). El resto del juego lo invoca con optional
// chaining, así que si el audio no está disponible todo sigue funcionando.
//
// Reglas móviles que respeta este módulo:
// - Un único AudioContext, creado en el primer gesto del usuario.
// - Nada de crear nodos por frame de render: los efectos crean sus nodos al
//   dispararse (eventos discretos) y el secuenciador programa por delante con
//   AudioContext.currentTime (look-ahead), no con requestAnimationFrame.
// - resume() también en visibilitychange→visible por si iOS suspende.
// - Mute persistido en localStorage ('doomcel_mute').

const MASTER_LEVEL = 0.9; // nivel maestro (con limitador detrás)
const MUSIC_LEVEL = 0.35; // música ~ -8 dB por debajo de los efectos
const SFX_LEVEL = 0.8;
const MUTE_KEY = 'doomcel_mute';

let ctx = null;      // el único AudioContext
let master = null;   // GainNode maestro (el mute actúa aquí)
let musicBus = null; // bus de música
let sfxBus = null;   // bus de efectos
let noiseBuffer = null; // ruido blanco generado UNA vez

let muted = false;
try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { /* sin storage */ }

// --- Motor -----------------------------------------------------------------

function ensureContext() {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();

    // Limitador suave al final de la cadena: compresor con ratio alto para
    // que la suma de música + varios efectos no llegue a clipear.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.knee.value = 8;
    limiter.ratio.value = 16;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.15;
    limiter.connect(ctx.destination);

    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_LEVEL;
    master.connect(limiter);

    musicBus = ctx.createGain();
    musicBus.gain.value = MUSIC_LEVEL;
    musicBus.connect(master);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = SFX_LEVEL;
    sfxBus.connect(master);

    // Buffer de ruido blanco de 1 s, compartido por todos los efectos.
    const len = ctx.sampleRate;
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    // Depuración / tests: acceso al contexto y al nodo maestro.
    window.__audioDebug = { ctx, master, limiter, musicBus, sfxBus };
  } catch (e) {
    ctx = null; // sin audio el juego sigue igual
  }
  return ctx;
}

// Envolvente exponencial estándar: pico en t y decay hasta silencio.
function envelope(gainNode, t, peak, dur) {
  gainNode.gain.setValueAtTime(peak, t);
  gainNode.gain.exponentialRampToValueAtTime(0.001, t + dur);
}

// Ráfaga de ruido filtrado (base de disparo, impactos y batería).
function noiseBurst(t, type, freq, q, peak, dur, bus) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const g = ctx.createGain();
  envelope(g, t, peak, dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(bus);
  src.start(t, Math.random() * 0.5); // offset aleatorio: cada ráfaga suena distinta
  src.stop(t + dur + 0.05);
}

// Oscilador con barrido de frecuencia y envolvente (base de casi todo).
function sweep(t, type, from, to, peak, dur, bus, filterFreq) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t + dur);
  const g = ctx.createGain();
  envelope(g, t, peak, dur);
  let head = osc;
  let filter = null;
  if (filterFreq) {
    filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    osc.connect(filter);
    head = filter;
  }
  head.connect(g);
  g.connect(bus);
  osc.start(t);
  osc.stop(t + dur + 0.05);
  return { osc, filter, gain: g };
}

// --- Límite de voces: máximo ~8 disparos/s por efecto ------------------------

const lastFire = Object.create(null);
function allow(name) {
  if (!ctx || ctx.state !== 'running') return false;
  const now = ctx.currentTime;
  if (lastFire[name] !== undefined && now - lastFire[name] < 0.125) return false;
  lastFire[name] = now;
  return true;
}

// --- Efectos de sonido -------------------------------------------------------

// Disparo: ráfaga de ruido lowpass con decay rápido + golpe grave triangle.
function playShot() {
  if (!allow('shot')) return;
  const t = ctx.currentTime;
  noiseBurst(t, 'lowpass', 1800, 1, 0.9, 0.12, sfxBus);
  sweep(t, 'triangle', 150, 60, 0.7, 0.12, sfxBus);
}

// Impacto carnoso: ruido bandpass estrecho ~400 Hz + thud grave.
function playHit() {
  if (!allow('hit')) return;
  const t = ctx.currentTime;
  noiseBurst(t, 'bandpass', 400, 2, 0.7, 0.08, sfxBus);
  sweep(t, 'sine', 160, 70, 0.5, 0.09, sfxBus);
}

// Muerte de enemigo: gruñido sawtooth descendente con vibrato rápido + ruido.
function playEnemyDeath() {
  if (!allow('enemyDeath')) return;
  const t = ctx.currentTime;
  const v = sweep(t, 'sawtooth', 220, 50, 0.6, 0.4, sfxBus, 1200);
  // Vibrato: LFO sobre la frecuencia del oscilador principal.
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 24;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 18;
  lfo.connect(lfoGain);
  lfoGain.connect(v.osc.frequency);
  lfo.start(t);
  lfo.stop(t + 0.45);
  noiseBurst(t, 'lowpass', 900, 0.7, 0.35, 0.35, sfxBus);
}

// Dolor del jugador: quejido square corto y descendente.
function playerHurt() {
  if (!allow('hurt')) return;
  const t = ctx.currentTime;
  sweep(t, 'square', 300, 180, 0.4, 0.15, sfxBus, 1500);
}

// Muerte del jugador: caída dramática con el filtro cerrándose.
function playerDeath() {
  if (!allow('playerDeath')) return;
  const t = ctx.currentTime;
  const v = sweep(t, 'sawtooth', 400, 40, 0.7, 1.2, sfxBus, 2400);
  v.filter.frequency.setValueAtTime(2400, t);
  v.filter.frequency.exponentialRampToValueAtTime(120, t + 1.2);
  noiseBurst(t, 'lowpass', 600, 0.7, 0.3, 0.8, sfxBus);
}

// Victoria: fanfarria corta — arpegio mayor ascendente (E mayor), ~1 s.
function playVictory() {
  if (!allow('victory')) return;
  const t = ctx.currentTime;
  const notes = [329.63, 415.30, 493.88, 659.25]; // E4 G#4 B4 E5
  for (let i = 0; i < notes.length; i++) {
    const nt = t + i * 0.16;
    const dur = i === notes.length - 1 ? 0.6 : 0.22;
    sweep(nt, 'square', notes[i], notes[i], 0.25, dur, sfxBus, 2500);
    sweep(nt, 'triangle', notes[i] / 2, notes[i] / 2, 0.3, dur, sfxBus);
  }
}

// Extras para futuros hooks (puertas, ítems, pasos).
function playDoor() {
  if (!allow('door')) return;
  const t = ctx.currentTime;
  sweep(t, 'square', 60, 110, 0.3, 0.5, sfxBus, 500);
  noiseBurst(t, 'lowpass', 300, 0.7, 0.25, 0.5, sfxBus);
}
function playPickup() {
  if (!allow('pickup')) return;
  const t = ctx.currentTime;
  sweep(t, 'square', 660, 660, 0.25, 0.08, sfxBus);
  sweep(t + 0.09, 'square', 990, 990, 0.25, 0.12, sfxBus);
}
function playStep() {
  if (!allow('step')) return;
  noiseBurst(ctx.currentTime, 'lowpass', 250, 0.7, 0.2, 0.07, sfxBus);
}

// --- Música: MIDI-metal procedural (secuenciador con look-ahead) -------------
//
// ~140 BPM, Mi frigia (E2 tónica). Riff original de 2 compases con la vibra de
// E1M1: semicorcheas galopantes en la tónica (palm-mute) con una línea aguda
// descendente por la escala frigia (8ª, b7, b6, 5ª, b3, b2). Cada 4 compases
// el riff sube una tercera menor para que no canse.

const BPM = 140;
const STEP_DUR = 60 / BPM / 4;   // duración de una semicorchea
const LOOKAHEAD = 0.2;           // programa 0.2 s por delante
const TICK_MS = 100;             // el setInterval despierta cada 100 ms
const E2 = 82.407;               // tónica

// 2 compases = 32 semicorcheas. Semitonos sobre E2; null = silencio.
// Patrón chug-chug-acento: 0,0,X (pedal en la tónica, acentos descendentes).
const RIFF = [
  0, 0, 12,  0, 0, 10,  0, 0, 8,  0, 0, 7,  0, 0, 3, 1,
  0, 0, 12,  0, 0, 10,  0, 0, 7,  0, 0, 5,  3, 1, 0, null,
];

let seqTimer = null;
let nextNoteTime = 0;
let seqStep = 0;

function scheduler() {
  if (!ctx) return;
  // Si la pestaña estuvo en segundo plano (setInterval estrangulado), salta
  // hacia delante en vez de disparar una ráfaga de notas atrasadas.
  if (nextNoteTime < ctx.currentTime - 0.05) {
    const missed = Math.ceil((ctx.currentTime - nextNoteTime) / STEP_DUR);
    seqStep += missed;
    nextNoteTime += missed * STEP_DUR;
  }
  while (nextNoteTime < ctx.currentTime + LOOKAHEAD) {
    scheduleStep(seqStep, nextNoteTime);
    seqStep++;
    nextNoteTime += STEP_DUR;
  }
}

function scheduleStep(s, t) {
  const pos = s % 32;                 // posición dentro del riff de 2 compases
  const beat16 = pos % 16;            // semicorchea dentro del compás
  const bar = Math.floor(s / 16);     // compás absoluto
  // Cada 4 compases alterna: riff en E ↔ riff una tercera menor arriba (G).
  const transpose = (Math.floor(bar / 4) % 2) ? 3 : 0;

  const semi = RIFF[pos];
  if (semi !== null) {
    const accent = semi !== 0; // las notas fuera del pedal se acentúan
    guitarNote(t, semi + transpose, accent);
    bassNote(t, semi + transpose);
  }

  // Batería: kick en negras (con variación en compases impares), snare en los
  // contratiempos 2 y 4, hihat en semicorcheas alternas (acento en negras).
  if (beat16 % 4 === 0) kick(t);
  if (bar % 2 === 1 && beat16 === 14) kick(t);
  if (beat16 === 4 || beat16 === 12) snare(t);
  if (beat16 % 2 === 0) hihat(t, beat16 % 4 === 0);
}

// Guitarra: 2 sawtooth con detune leve → lowpass ~900 Hz con Q alto →
// envolvente palm-mute (ataque 0, decay corto).
function guitarNote(t, semi, accent) {
  const freq = E2 * Math.pow(2, semi / 12);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  lp.Q.value = 6;
  const g = ctx.createGain();
  envelope(g, t, accent ? 0.5 : 0.38, accent ? 0.14 : 0.08);
  lp.connect(g);
  g.connect(musicBus);
  for (const det of [-6, 6]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    osc.detune.value = det;
    osc.connect(lp);
    osc.start(t);
    osc.stop(t + 0.2);
  }
}

// Bajo: triangle una octava abajo siguiendo el riff.
function bassNote(t, semi) {
  const freq = (E2 / 2) * Math.pow(2, semi / 12);
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  const g = ctx.createGain();
  envelope(g, t, 0.55, 0.1);
  osc.connect(g);
  g.connect(musicBus);
  osc.start(t);
  osc.stop(t + 0.15);
}

// Kick: seno descendente 120→40 Hz, 0.1 s.
function kick(t) {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(120, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.1);
  const g = ctx.createGain();
  envelope(g, t, 1.0, 0.1);
  osc.connect(g);
  g.connect(musicBus);
  osc.start(t);
  osc.stop(t + 0.15);
}

// Snare: ruido bandpass ~1500 Hz, 0.12 s.
function snare(t) {
  noiseBurst(t, 'bandpass', 1500, 0.8, 0.55, 0.12, musicBus);
}

// Hihat: ruido highpass 8 kHz, muy corto.
function hihat(t, accent) {
  noiseBurst(t, 'highpass', 8000, 0.7, accent ? 0.25 : 0.14, 0.03, musicBus);
}

function startMusic() {
  if (!ensureContext() || seqTimer !== null) return;
  seqStep = 0;
  nextNoteTime = ctx.currentTime + 0.1;
  seqTimer = setInterval(scheduler, TICK_MS);
}

function stopMusic() {
  if (seqTimer !== null) {
    clearInterval(seqTimer);
    seqTimer = null;
  }
}

// --- Mute --------------------------------------------------------------------

let muteBtn = null;

function applyMute() {
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  master.gain.cancelScheduledValues(t);
  // Rampa cortísima para evitar clic; el secuenciador sigue corriendo.
  master.gain.setTargetAtTime(muted ? 0 : MASTER_LEVEL, t, 0.02);
}

function toggleMute() {
  muted = !muted;
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) { /* sin storage */ }
  applyMute();
  if (muteBtn) muteBtn.textContent = muted ? '🔇' : '🔊';
}

function createMuteButton() {
  const btn = document.createElement('button');
  btn.id = 'mute-btn';
  btn.type = 'button';
  btn.textContent = muted ? '🔇' : '🔊';
  btn.setAttribute('aria-label', 'Silenciar');
  btn.style.cssText = [
    'position:fixed', 'top:calc(6px + env(safe-area-inset-top, 0px))',
    'right:calc(6px + env(safe-area-inset-right, 0px))', 'z-index:30',
    'width:44px', 'height:44px', 'padding:0', 'font-size:22px', 'line-height:44px',
    'text-align:center', 'background:rgba(0,0,0,0.35)', 'color:#fff',
    'border:1px solid rgba(255,255,255,0.4)', 'border-radius:8px',
    'opacity:0.7', 'cursor:pointer', 'touch-action:none', 'user-select:none',
    '-webkit-user-select:none', '-webkit-tap-highlight-color:transparent',
  ].join(';');
  // touchstart con stopPropagation + preventDefault: el toque no llega al
  // control de giro táctil ni genera un click sintético duplicado.
  btn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleMute();
  }, { passive: false });
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMute();
    btn.blur(); // que Espacio siga disparando, no re-pulsando el botón
  });
  document.body.appendChild(btn);
  return btn;
}

try { muteBtn = createMuteButton(); } catch (e) { /* sin botón, el juego sigue */ }

// --- Desbloqueo en el primer gesto y supervivencia en móvil -------------------

function unlock() {
  if (!ensureContext()) return;
  if (ctx.state !== 'running') {
    try {
      const p = ctx.resume();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (e) { /* seguimos sin audio */ }
  }
  applyMute();
  startMusic(); // la música empieza aquí; si está el mute puesto, suena a 0
}

window.__onFirstGesture = unlock;

// iOS puede suspender el contexto al perder el foco: reanudar al volver.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && ctx && ctx.state !== 'running') {
    try {
      const p = ctx.resume();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (e) { /* nada */ }
  }
});

// --- API pública para el resto del juego --------------------------------------

window.__audio = {
  playShot,
  playHit,
  playEnemyDeath,
  playerHurt,
  playerDeath,
  playVictory,
  playDoor,
  playPickup,
  playStep,
  startMusic,
  stopMusic,
  toggleMute,
  get muted() { return muted; },
};
