// HUD estilo Doom: barra inferior compacta y centrada (no choca con el botón
// de disparo táctil de la esquina), flash rojo de daño y pantallas de
// muerte / victoria. Las caritas se pre-renderizan una vez a canvases 12x12.

import { player } from './player.js';
import { weapon } from './weapon.js';
import { enemies, countKills } from './enemies.js';

const BAR_W = 132;
const BAR_H = 14;

// --- Caritas procedurales: 0 sana, 1 tocada, 2 al borde de la muerte ---
function bakeFace(level) {
  const c = document.createElement('canvas');
  c.width = 12;
  c.height = 12;
  const g = c.getContext('2d');
  // Piel (más pálida y ensangrentada cuanto peor)
  g.fillStyle = ['#d8a060', '#c08850', '#a86840'][level];
  g.fillRect(2, 1, 8, 10);
  g.fillRect(1, 3, 10, 6);
  // Pelo
  g.fillStyle = '#503018';
  g.fillRect(2, 0, 8, 2);
  // Ojos
  g.fillStyle = '#fff';
  g.fillRect(3, 4, 2, 2);
  g.fillRect(7, 4, 2, 2);
  g.fillStyle = '#204080';
  g.fillRect(level === 2 ? 3 : 4, 5, 1, 1);
  g.fillRect(level === 2 ? 7 : 8, 5, 1, 1);
  if (level === 2) {
    // Ojo hinchado y sangre
    g.fillStyle = '#8a1810';
    g.fillRect(7, 4, 2, 2);
    g.fillRect(2, 7, 2, 4);
    g.fillRect(8, 8, 2, 3);
  } else if (level === 1) {
    g.fillStyle = '#8a1810';
    g.fillRect(8, 7, 2, 3);
  }
  // Boca: sonrisa → recta → mueca
  g.fillStyle = '#401008';
  if (level === 0) {
    g.fillRect(4, 8, 4, 1);
    g.fillRect(3, 7, 1, 1);
    g.fillRect(8, 7, 1, 1);
  } else if (level === 1) {
    g.fillRect(4, 8, 4, 1);
  } else {
    g.fillRect(4, 8, 4, 2);
  }
  return c;
}

const faces = [bakeFace(0), bakeFace(1), bakeFace(2)];

let blinkTime = 0;

export function render(ctx, W, H, dt) {
  // Flash rojo de daño (0.2 s, alpha 0.3).
  if (player.hurtTimer > 0) {
    player.hurtTimer -= dt;
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#e00000';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  const x0 = ((W - BAR_W) / 2) | 0;
  const y0 = H - BAR_H;

  // Fondo de la barra
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = '#181818';
  ctx.fillRect(x0, y0, BAR_W, BAR_H);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#4a4a4a';
  ctx.fillRect(x0, y0, BAR_W, 1);

  // Etiquetas pequeñas y números grandes (rojo / ámbar, estilo Doom)
  ctx.textAlign = 'left';
  ctx.font = '5px monospace';
  ctx.fillStyle = '#909090';
  ctx.fillText('SALUD', x0 + 6, y0 + 6);
  ctx.font = 'bold 9px monospace';
  ctx.fillStyle = player.hp > 33 ? '#e03428' : '#ff1400';
  ctx.fillText(`${player.hp}%`, x0 + 6, y0 + 13);

  ctx.textAlign = 'right';
  ctx.font = '5px monospace';
  ctx.fillStyle = '#909090';
  ctx.fillText('BALAS', x0 + BAR_W - 6, y0 + 6);
  ctx.font = 'bold 9px monospace';
  ctx.fillStyle = '#e9a33c';
  ctx.fillText(`${weapon.ammo}`, x0 + BAR_W - 6, y0 + 13);

  // Carita al centro: empeora con la vida.
  const face = player.hp > 66 ? faces[0] : player.hp > 33 ? faces[1] : faces[2];
  ctx.drawImage(face, ((W - 12) / 2) | 0, y0 + 1, 12, 12);
}

// Nombre del nivel unos segundos al empezar (main.js lleva el temporizador;
// se desvanece en el último medio segundo).
export function renderLevelName(ctx, W, H, name, timer) {
  ctx.globalAlpha = timer < 0.5 ? timer * 2 : 1;
  ctx.textAlign = 'center';
  ctx.font = 'bold 10px monospace';
  ctx.fillStyle = '#000';
  ctx.fillText(name, W / 2 + 1, 25);
  ctx.fillStyle = '#ffd870';
  ctx.fillText(name, W / 2, 24);
  ctx.globalAlpha = 1;
}

function formatTime(t) {
  const m = (t / 60) | 0;
  const s = (t % 60) | 0;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// Pantalla de fin genérica: título, subtítulo, hasta 3 líneas de
// estadísticas y aviso parpadeante. Solo se ejecuta fuera del juego activo.
function endScreen(ctx, W, H, dt, bg, title, titleColor, sub, l1, l2, l3, prompt) {
  blinkTime += dt;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // Viñeta barata: bandas oscuras arriba y abajo, estilo intermisión de Doom.
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, 0, W, 26);
  ctx.fillRect(0, H - 26, W, 26);

  ctx.textAlign = 'center';
  ctx.font = 'bold 16px monospace';
  ctx.fillStyle = titleColor;
  ctx.fillText(title, W / 2, H / 2 - 28);

  if (sub) {
    ctx.font = 'bold 7px monospace';
    ctx.fillStyle = '#e0d0a0';
    ctx.fillText(sub, W / 2, H / 2 - 16);
  }

  // Estadísticas con la misma tipografía monospace del HUD.
  ctx.font = 'bold 7px monospace';
  ctx.fillStyle = '#c8b890';
  ctx.fillText(l1, W / 2, H / 2 - 2);
  ctx.fillText(l2, W / 2, H / 2 + 8);
  if (l3) ctx.fillText(l3, W / 2, H / 2 + 18);

  if (blinkTime % 1 < 0.65) {
    ctx.font = 'bold 8px monospace';
    ctx.fillStyle = '#ffd870';
    ctx.fillText(prompt, W / 2, H / 2 + 34);
  }
}

export function renderDeath(ctx, W, H, dt) {
  endScreen(
    ctx, W, H, dt, 'rgba(90,0,0,0.55)', 'HAS MUERTO', '#ff2814', null,
    `IMPS ELIMINADOS  ${countKills()}/${enemies.length}`,
    `BALAS RESTANTES  ${weapon.ammo}`,
    null,
    'TOCA PARA REINTENTAR',
  );
}

// Intermisión entre niveles: estadísticas del nivel recién completado.
export function renderIntermission(ctx, W, H, dt, levelName, kills, total, time) {
  endScreen(
    ctx, W, H, dt, 'rgba(10,30,50,0.6)', 'NIVEL COMPLETADO', '#ffd870', levelName,
    `IMPS ELIMINADOS  ${kills}/${total}`,
    `BALAS RESTANTES  ${weapon.ammo}`,
    `TIEMPO  ${formatTime(time)}`,
    'TOCA PARA CONTINUAR',
  );
}

// Fin del episodio (tras E1M3): totales de toda la campaña y mejor marca
// histórica DE LA DIFICULTAD JUGADA (best = { t: segundos, k: % de bajas }
// o null si no hay récord).
export function renderEnd(ctx, W, H, dt, kills, total, time, best, newBest, diffName) {
  endScreen(
    ctx, W, H, dt, 'rgba(10,40,10,0.6)', 'FIN DEL EPISODIO', '#2ec83e',
    diffName ? `HAS PURGADO EL AVERNO — ${diffName}` : 'HAS PURGADO EL AVERNO',
    `IMPS ELIMINADOS  ${kills}/${total}`,
    `TIEMPO TOTAL  ${formatTime(time)}`,
    best ? `MEJOR MARCA  ${formatTime(best.t)} — ${best.k}%` : null,
    'TOCA PARA VOLVER A E1M1',
  );
  // Récord recién batido: aviso parpadeante (más rápido que el prompt).
  if (newBest && blinkTime % 0.7 < 0.4) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 8px monospace';
    ctx.fillStyle = '#ffe050';
    ctx.fillText('¡NUEVA MEJOR MARCA!', W / 2, H / 2 + 26);
  }
}
