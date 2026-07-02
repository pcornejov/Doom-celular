// Doom Celular — vibración háptica (Iteración 7).
//
// Canal independiente del audio: envuelve las funciones de window.__audio
// (este módulo se carga DESPUÉS de audio.js) sin tocar la lógica del juego.
// El mute NO afecta a la vibración: silenciar el sonido no quita el táctil.
//
// Compatibilidad: navigator.vibrate solo existe en Android (Chrome/Firefox).
// En iOS Safari no existe: se comprueba con typeof y, si no hay soporte,
// este módulo no envuelve nada y todo queda exactamente como estaba.
//
// Duraciones (ms): pistola 20, escopeta 35, recibir daño 80, morir 200.

const VIBRATE_SHOT = 20;
const VIBRATE_SHOTGUN = 35;
const VIBRATE_HURT = 80;
const VIBRATE_DEATH = 200;

function hasVibration() {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

// Depuración / tests: window.__haptics.last registra la última duración.
const debug = { enabled: false, last: 0 };

function buzz(ms) {
  debug.last = ms;
  // try/catch: algunos navegadores lanzan si el documento no está activo.
  try { navigator.vibrate(ms); } catch (e) { /* sin vibración, sin drama */ }
}

if (hasVibration() && window.__audio) {
  const audio = window.__audio;
  const origShot = audio.playShot;
  const origHurt = audio.playerHurt;
  const origDeath = audio.playerDeath;

  // Pistola: weapon.js llama a playShot en cada disparo.
  audio.playShot = function playShotHaptic() {
    buzz(VIBRATE_SHOT);
    origShot();
  };

  // Escopeta: weapon.js usa (playShotgun ?? playShot); definir playShotgun
  // aquí permite una vibración más fuerte reutilizando el MISMO sonido de
  // disparo (sin duplicar la vibración de playShot).
  audio.playShotgun = function playShotgunHaptic() {
    buzz(VIBRATE_SHOTGUN);
    origShot();
  };

  // Recibir daño: player.js llama a playerHurt desde damagePlayer.
  audio.playerHurt = function playerHurtHaptic() {
    buzz(VIBRATE_HURT);
    origHurt();
  };

  // Morir: main.js llama a playerDeath al llegar a 0 de salud.
  audio.playerDeath = function playerDeathHaptic() {
    buzz(VIBRATE_DEATH);
    origDeath();
  };

  debug.enabled = true;
  window.__haptics = debug;
}
