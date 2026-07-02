// Doom Celular — controles táctiles (Iteración 2).
//
// - Joystick virtual flotante en la mitad IZQUIERDA: aparece donde toca el
//   pulgar; la dirección/magnitud del arrastre controla avance y strafe.
// - Mitad DERECHA: arrastrar gira la cámara (delta horizontal en px CSS ×
//   sensibilidad → radianes acumulados en player.turnImpulse).
// - Botón de disparo fijo en la esquina inferior derecha. Un toque que
//   empieza sobre el botón NUNCA gira la cámara.
// - Multi-touch real: cada rol (joystick / giro / disparo) guarda el
//   identifier de su toque; touchend/touchcancel liberan solo ese toque.
//
// Escribe la intención directamente en `player` (touchForward, touchStrafe,
// touchMoveActive, turnImpulse); player.update() la combina con el teclado.
// Cero allocations por frame: los handlers solo mutan estado preexistente.

import { player } from './player.js';

// Sensibilidad de giro: radianes por píxel CSS de arrastre horizontal.
export const LOOK_SENSITIVITY = 0.006;

// Joystick: radio máximo como fracción del alto de pantalla y zona muerta
// como fracción de ese radio.
const JOY_RADIUS_FRAC = 0.12;
const JOY_DEADZONE_FRAC = 0.15;

// Botón de disparo: diámetro mínimo 15% del alto de pantalla (y nunca menor
// que 56 px táctiles), con margen respecto al borde.
const FIRE_DIAMETER_FRAC = 0.15;
const FIRE_MIN_DIAMETER = 56;
const FIRE_MARGIN_FRAC = 0.05;

// Estado observable para el overlay de main.js (píxeles CSS).
export const touch = {
  enabled: false,       // hay pantalla táctil (o ya llegó un toque real)
  joyActive: false,
  joyOriginX: 0,
  joyOriginY: 0,
  joyStickX: 0,
  joyStickY: 0,
  joyRadius: 0,
  firePressed: false,
  fireX: 0,
  fireY: 0,
  fireRadius: 0,
};

// Un identifier por rol; -1 = libre. (Los identifiers táctiles son >= 0.)
let joyId = -1;
let lookId = -1;
let fireId = -1;
let lookLastX = 0;

function layout() {
  const h = window.innerHeight;
  touch.joyRadius = h * JOY_RADIUS_FRAC;
  touch.fireRadius = Math.max(h * FIRE_DIAMETER_FRAC, FIRE_MIN_DIAMETER) / 2;
  const margin = h * FIRE_MARGIN_FRAC;
  touch.fireX = window.innerWidth - margin - touch.fireRadius;
  touch.fireY = h - margin - touch.fireRadius;
}

function insideFire(x, y) {
  const dx = x - touch.fireX;
  const dy = y - touch.fireY;
  return dx * dx + dy * dy <= touch.fireRadius * touch.fireRadius;
}

function updateJoystick(x, y) {
  const dx = x - touch.joyOriginX;
  const dy = y - touch.joyOriginY;
  const max = touch.joyRadius;
  const mag = Math.sqrt(dx * dx + dy * dy);

  // Palanca visual saturada al radio máximo.
  const clamp = mag > max ? max / mag : 1;
  touch.joyStickX = touch.joyOriginX + dx * clamp;
  touch.joyStickY = touch.joyOriginY + dy * clamp;

  const dead = max * JOY_DEADZONE_FRAC;
  if (mag <= dead) {
    player.touchForward = 0;
    player.touchStrafe = 0;
  } else {
    // Dirección unitaria × magnitud reescalada de [dead, max] a [0, 1].
    const norm = Math.min((mag - dead) / (max - dead), 1) / mag;
    player.touchStrafe = dx * norm;
    player.touchForward = -dy * norm; // arrastrar hacia arriba = avanzar
  }
}

function releaseJoystick() {
  joyId = -1;
  touch.joyActive = false;
  player.touchMoveActive = false;
  player.touchForward = 0;
  player.touchStrafe = 0;
}

function onTouchStart(e) {
  e.preventDefault();
  touch.enabled = true;
  const half = window.innerWidth * 0.5;
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    const x = t.clientX;
    const y = t.clientY;
    if (fireId === -1 && insideFire(x, y)) {
      fireId = t.identifier;
      touch.firePressed = true;
    } else if (joyId === -1 && x < half) {
      joyId = t.identifier;
      touch.joyActive = true;
      touch.joyOriginX = x;
      touch.joyOriginY = y;
      touch.joyStickX = x;
      touch.joyStickY = y;
      player.touchMoveActive = true;
      player.touchForward = 0;
      player.touchStrafe = 0;
    } else if (lookId === -1 && x >= half) {
      lookId = t.identifier;
      lookLastX = x;
    }
  }
}

function onTouchMove(e) {
  e.preventDefault();
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    if (t.identifier === joyId) {
      updateJoystick(t.clientX, t.clientY);
    } else if (t.identifier === lookId) {
      player.turnImpulse += (t.clientX - lookLastX) * LOOK_SENSITIVITY;
      lookLastX = t.clientX;
    }
    // El dedo sobre el botón de disparo no hace nada al moverse: sigue
    // disparando hasta soltar.
  }
}

function onTouchEnd(e) {
  e.preventDefault();
  for (let i = 0; i < e.changedTouches.length; i++) {
    const id = e.changedTouches[i].identifier;
    if (id === joyId) {
      releaseJoystick();
    } else if (id === lookId) {
      lookId = -1;
    } else if (id === fireId) {
      fireId = -1;
      touch.firePressed = false;
    }
  }
}

export function initTouch(target) {
  layout();
  window.addEventListener('resize', layout);
  touch.enabled = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  target.addEventListener('touchstart', onTouchStart, { passive: false });
  target.addEventListener('touchmove', onTouchMove, { passive: false });
  target.addEventListener('touchend', onTouchEnd, { passive: false });
  target.addEventListener('touchcancel', onTouchEnd, { passive: false });
}
