// Motor de render por raycasting (algoritmo DDA, una columna por rayo).
// Dibuja directo sobre un buffer de píxeles (Uint32Array ABGR) que se
// vuelca al canvas con putImageData: cero allocations por frame.

import { WALL_COLORS, DOOR_TYPE } from './maps.js';

const FOV_PLANE = 0.66; // ~66° de campo visual
const FOG_DISTANCE = 14; // a esta distancia las paredes llegan al mínimo de luz
const MIN_LIGHT = 0.18;

let W = 0;
let H = 0;
let image = null;   // ImageData
let buf32 = null;   // vista Uint32 del ImageData
let rowColor = null; // color precalculado de techo/suelo por fila
export let zbuffer = null; // distancia de pared por columna (para sprites)

function pack(r, g, b) {
  return (255 << 24) | (b << 16) | (g << 8) | r;
}

// ---------------------------------------------------------------------------
// Sprites de enemigos: pixel art procedural generado UNA VEZ al cargar.
// Se dibujan con fillRect sobre un canvas temporal y se leen como Uint32Array
// en el mismo formato ABGR del buffer de render (0x00000000 = transparente).
// ---------------------------------------------------------------------------

const SPR_W = 24;
const SPR_H = 32;

// Hornea un dibujo hecho con canvas 2D a un Uint32Array en el formato ABGR
// del buffer de render. Lo usan los sprites (también los ítems de items.js)
// y las texturas de pared.
export function bake(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  draw(g);
  return new Uint32Array(g.getImageData(0, 0, w, h).data.buffer);
}

function bakeSprite(draw) {
  return bake(SPR_W, SPR_H, draw);
}

// Imp marrón/rojizo: cuernos, ojos brillantes, pecho rojo, garras.
function drawImp(g, attack) {
  const BODY = '#96502a';
  const DARK = '#3c1e12';
  const HORN = '#dcc8aa';

  // Cuernos
  g.fillStyle = HORN;
  g.fillRect(7, 0, 2, 3);
  g.fillRect(15, 0, 2, 3);
  // Cabeza
  g.fillStyle = DARK;
  g.fillRect(7, 3, 10, 8);
  g.fillStyle = BODY;
  g.fillRect(8, 4, 8, 6);
  // Ojos brillantes
  g.fillStyle = '#ffdc28';
  g.fillRect(9, 5, 2, 2);
  g.fillRect(13, 5, 2, 2);
  // Boca (abierta y encendida al atacar)
  g.fillStyle = attack ? '#ff7830' : '#2a0a0a';
  g.fillRect(10, 8, 4, attack ? 3 : 2);
  // Torso
  g.fillStyle = DARK;
  g.fillRect(6, 11, 12, 10);
  g.fillStyle = BODY;
  g.fillRect(7, 12, 10, 8);
  // Pecho rojo
  g.fillStyle = '#be2820';
  g.fillRect(10, 13, 4, 4);
  // Brazos: a los lados de pie, en alto con garras al atacar
  g.fillStyle = BODY;
  if (attack) {
    g.fillRect(3, 4, 3, 9);
    g.fillRect(18, 4, 3, 9);
    g.fillStyle = HORN;
    g.fillRect(3, 2, 3, 2);
    g.fillRect(18, 2, 3, 2);
  } else {
    g.fillRect(4, 12, 3, 8);
    g.fillRect(17, 12, 3, 8);
    g.fillStyle = HORN;
    g.fillRect(4, 20, 3, 2);
    g.fillRect(17, 20, 3, 2);
  }
  // Piernas y pies con garras
  g.fillStyle = DARK;
  g.fillRect(8, 21, 3, 8);
  g.fillRect(13, 21, 3, 8);
  g.fillStyle = BODY;
  g.fillRect(8, 21, 2, 7);
  g.fillRect(13, 21, 2, 7);
  g.fillStyle = HORN;
  g.fillRect(7, 29, 4, 2);
  g.fillRect(13, 29, 4, 2);
}

// Cadáver: bulto oscuro achatado sobre un charco de sangre.
function drawCorpse(g) {
  g.fillStyle = '#48100c';
  g.fillRect(3, 29, 18, 2);
  g.fillStyle = '#2e1109';
  g.fillRect(5, 26, 14, 3);
  g.fillStyle = '#5c2c16';
  g.fillRect(7, 25, 8, 2);
  g.fillStyle = '#8a8066';
  g.fillRect(5, 24, 2, 2); // cuerno asomando
  g.fillStyle = '#78180f';
  g.fillRect(9, 28, 8, 2);
}

// Tinte al hornear: pinta encima solo donde ya hay píxeles (source-atop).
function tint(g, color) {
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = color;
  g.fillRect(0, 0, SPR_W, SPR_H);
  g.globalCompositeOperation = 'source-over';
}

// Poses: 0 de pie, 1 atacando, 2 herido (tintado blanco), 3 cadáver.
// El imp rápido reusa los mismos dibujos con un tinte azulado al hornear.
const FAST_TINT = 'rgba(45,90,220,0.5)';

function bakePoses(fast) {
  return [
    bakeSprite((g) => {
      drawImp(g, false);
      if (fast) tint(g, FAST_TINT);
    }),
    bakeSprite((g) => {
      drawImp(g, true);
      if (fast) tint(g, FAST_TINT);
    }),
    bakeSprite((g) => {
      drawImp(g, false);
      if (fast) tint(g, FAST_TINT);
      tint(g, 'rgba(255,255,255,0.55)');
    }),
    bakeSprite((g) => {
      drawCorpse(g);
      if (fast) tint(g, FAST_TINT);
    }),
  ];
}

const POSES = bakePoses(false);
const POSES_FAST = bakePoses(true);

// ---------------------------------------------------------------------------
// Texturas de pared: 32×32, procedurales, horneadas UNA VEZ al cargar con el
// mismo mecanismo que los sprites. Cada tipo parte de su color base de
// WALL_COLORS (la paleta sigue viviendo en maps.js) y añade detalle encima.
// ---------------------------------------------------------------------------

const TEX = 32;        // lado de la textura (potencia de 2)
const TEX_MASK = 31;   // para envolver texY con AND
const TEX_SHIFT = 5;   // texY * 32 == texY << 5

// RNG determinista (LCG): el moteado sale igual en cada carga.
let texSeed = 0x1e51;
function trnd() {
  texSeed = (texSeed * 1103515245 + 12345) & 0x7fffffff;
  return texSeed / 0x7fffffff;
}

// Color CSS a partir de un base [r,g,b] y un factor de brillo (solo al hornear).
function css(base, f) {
  let r = (base[0] * f) | 0;
  let g = (base[1] * f) | 0;
  let b = (base[2] * f) | 0;
  if (r > 255) r = 255;
  if (g > 255) g = 255;
  if (b > 255) b = 255;
  return `rgb(${r},${g},${b})`;
}

// Tipo 1 — piedra gris: bloques irregulares con juntas oscuras y moteado.
function drawStoneTex(g, base) {
  g.fillStyle = css(base, 0.5); // juntas (queda como fondo)
  g.fillRect(0, 0, TEX, TEX);
  for (let row = 0; row < 4; row++) {
    let x = row & 1 ? -3 : 0; // hiladas alternadas para que no casen las juntas
    while (x < TEX) {
      const w = 6 + ((trnd() * 6) | 0);
      g.fillStyle = css(base, 0.88 + trnd() * 0.26);
      g.fillRect(x + 1, row * 8 + 1, w - 1, 6);
      x += w;
    }
  }
  for (let i = 0; i < 70; i++) {
    g.fillStyle = css(base, trnd() < 0.5 ? 0.72 : 1.18);
    g.fillRect((trnd() * TEX) | 0, (trnd() * TEX) | 0, 1, 1);
  }
}

// Tipo 2 — ladrillo: hiladas marrón/rojizas alternadas sobre mortero.
function drawBrickTex(g, base) {
  g.fillStyle = 'rgb(58,48,42)'; // mortero
  g.fillRect(0, 0, TEX, TEX);
  for (let row = 0; row < 8; row++) {
    const off = row & 1 ? 4 : 0;
    for (let col = -1; col < 4; col++) {
      const f = 0.82 + trnd() * 0.36;
      g.fillStyle = css(base, f);
      g.fillRect(col * 8 + off, row * 4, 7, 3);
      g.fillStyle = css(base, f * 0.68); // sombra en la base del ladrillo
      g.fillRect(col * 8 + off, row * 4 + 2, 7, 1);
    }
  }
}

// Tipo 3 — metal: placas azul-gris con remaches y franja de advertencia.
function drawMetalTex(g, base) {
  g.fillStyle = css(base, 0.92);
  g.fillRect(0, 0, TEX, TEX);
  for (let i = 0; i < 60; i++) { // vetas de cepillado
    g.fillStyle = css(base, 0.82 + trnd() * 0.22);
    g.fillRect((trnd() * TEX) | 0, (trnd() * TEX) | 0, 1, 2 + ((trnd() * 3) | 0));
  }
  // Juntas entre placas (arriba, medio, abajo) con canto iluminado.
  g.fillStyle = css(base, 0.45);
  g.fillRect(0, 0, TEX, 1);
  g.fillRect(0, 15, TEX, 2);
  g.fillRect(0, 31, TEX, 1);
  g.fillStyle = css(base, 1.3);
  g.fillRect(0, 1, TEX, 1);
  g.fillRect(0, 17, TEX, 1);
  // Franja de advertencia amarilla/negra en la placa inferior.
  for (let x = 0; x < TEX; x += 8) {
    g.fillStyle = '#b0951e';
    g.fillRect(x, 22, 4, 4);
    g.fillStyle = '#181818';
    g.fillRect(x + 4, 22, 4, 4);
  }
  g.fillStyle = css(base, 0.55);
  g.fillRect(0, 21, TEX, 1);
  g.fillRect(0, 26, TEX, 1);
  // Remaches de la placa superior.
  for (let x = 3; x < TEX; x += 8) {
    g.fillStyle = css(base, 1.45);
    g.fillRect(x, 4, 2, 2);
    g.fillRect(x, 10, 2, 2);
    g.fillStyle = css(base, 0.6);
    g.fillRect(x + 1, 5, 1, 1);
    g.fillRect(x + 1, 11, 1, 1);
  }
}

// Tipo 4 — piedra roja infernal: vetas oscuras serpenteantes ('sangre/marte').
function drawRedTex(g, base) {
  g.fillStyle = css(base, 0.95);
  g.fillRect(0, 0, TEX, TEX);
  for (let i = 0; i < 90; i++) { // moteado rugoso
    g.fillStyle = css(base, trnd() < 0.5 ? 0.72 : 1.22);
    g.fillRect((trnd() * TEX) | 0, (trnd() * TEX) | 0, 2, 1);
  }
  for (let v = 0; v < 5; v++) { // vetas: caminatas verticales que serpentean
    let x = (trnd() * TEX) | 0;
    const f = 0.4 + trnd() * 0.15;
    for (let y = 0; y < TEX; y++) {
      g.fillStyle = css(base, f);
      g.fillRect(x & TEX_MASK, y, 1, 1);
      if (trnd() < 0.45) x += trnd() < 0.5 ? -1 : 1;
    }
  }
  g.fillStyle = css(base, 1.35); // brasas sueltas
  for (let i = 0; i < 8; i++) {
    g.fillRect((trnd() * TEX) | 0, (trnd() * TEX) | 0, 1, 1);
  }
}

// Tipo 5 — placas verde militar con manchas de óxido y musgo.
function drawGreenTex(g, base) {
  g.fillStyle = css(base, 1);
  g.fillRect(0, 0, TEX, TEX);
  // Rejilla de placas 16×16: junta oscura y canto iluminado.
  g.fillStyle = css(base, 0.5);
  g.fillRect(0, 0, TEX, 1);
  g.fillRect(0, 15, TEX, 1);
  g.fillRect(0, 31, TEX, 1);
  g.fillRect(0, 0, 1, TEX);
  g.fillRect(15, 0, 1, TEX);
  g.fillRect(31, 0, 1, TEX);
  g.fillStyle = css(base, 1.2);
  g.fillRect(1, 1, 14, 1);
  g.fillRect(17, 1, 14, 1);
  g.fillRect(1, 16, 14, 1);
  g.fillRect(17, 16, 14, 1);
  // Manchas: óxido marrón y musgo verde claro.
  for (let i = 0; i < 26; i++) {
    g.fillStyle = trnd() < 0.5 ? 'rgb(104,74,40)' : css(base, 1.3);
    g.fillRect((trnd() * TEX) | 0, (trnd() * TEX) | 0, 1 + ((trnd() * 2) | 0), 1 + ((trnd() * 2) | 0));
  }
  // Tornillos en las esquinas interiores de cada placa.
  g.fillStyle = css(base, 1.45);
  for (let py = 3; py < TEX; py += 16) {
    for (let px = 3; px < TEX; px += 16) {
      g.fillRect(px, py, 2, 2);
      g.fillRect(px + 9, py, 2, 2);
      g.fillRect(px, py + 9, 2, 2);
      g.fillRect(px + 9, py + 9, 2, 2);
    }
  }
}

// Tipo 6 — puerta: paneles verticales dorados con junta central y tiradores.
function drawDoorTex(g, base) {
  g.fillStyle = css(base, 0.9);
  g.fillRect(0, 0, TEX, TEX);
  for (let i = 0; i < 40; i++) { // veta vertical
    g.fillStyle = css(base, 0.78 + trnd() * 0.34);
    g.fillRect((trnd() * TEX) | 0, (trnd() * TEX) | 0, 1, 3 + ((trnd() * 4) | 0));
  }
  // Marco oscuro y junta central (por donde "abre").
  g.fillStyle = css(base, 0.4);
  g.fillRect(0, 0, 2, TEX);
  g.fillRect(30, 0, 2, TEX);
  g.fillRect(0, 0, TEX, 2);
  g.fillRect(0, 30, TEX, 2);
  g.fillRect(15, 0, 2, TEX);
  g.fillStyle = css(base, 1.3);
  g.fillRect(2, 2, 1, 28);
  g.fillRect(17, 2, 1, 28);
  // Tiradores a ambos lados de la junta.
  g.fillStyle = css(base, 1.5);
  g.fillRect(11, 15, 3, 3);
  g.fillRect(18, 15, 3, 3);
  g.fillStyle = '#181008';
  g.fillRect(12, 16, 1, 1);
  g.fillRect(19, 16, 1, 1);
}

// Tipo 7 — salida: panel oscuro con botón verde brillante y franjas.
function drawExitTex(g, base) {
  g.fillStyle = css(base, 0.9);
  g.fillRect(0, 0, TEX, TEX);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = css(base, 0.75 + trnd() * 0.3);
    g.fillRect((trnd() * TEX) | 0, (trnd() * TEX) | 0, 2, 1);
  }
  // Franjas de advertencia verdes arriba y abajo.
  for (let x = 0; x < TEX; x += 8) {
    g.fillStyle = '#1e8a2a';
    g.fillRect(x, 1, 4, 3);
    g.fillRect(x + 4, 28, 4, 3);
    g.fillStyle = '#0e1410';
    g.fillRect(x + 4, 1, 4, 3);
    g.fillRect(x, 28, 4, 3);
  }
  // Placa hundida con el botón de salida.
  g.fillStyle = css(base, 0.45);
  g.fillRect(8, 8, 16, 16);
  g.fillStyle = css(base, 1.25);
  g.fillRect(8, 8, 16, 1);
  g.fillRect(8, 8, 1, 16);
  g.fillStyle = '#0c3812';
  g.fillRect(11, 11, 10, 10);
  g.fillStyle = '#2ec83e';
  g.fillRect(12, 12, 8, 8);
  g.fillStyle = '#9cffa8';
  g.fillRect(13, 13, 3, 3);
}

// Índice por tipo de pared (0 no se dibuja nunca: el DDA para en tipo > 0).
const WALL_TEX = [
  null,
  bake(TEX, TEX, (g) => drawStoneTex(g, WALL_COLORS[1])),
  bake(TEX, TEX, (g) => drawBrickTex(g, WALL_COLORS[2])),
  bake(TEX, TEX, (g) => drawMetalTex(g, WALL_COLORS[3])),
  bake(TEX, TEX, (g) => drawRedTex(g, WALL_COLORS[4])),
  bake(TEX, TEX, (g) => drawGreenTex(g, WALL_COLORS[5])),
  bake(TEX, TEX, (g) => drawDoorTex(g, WALL_COLORS[6])),
  bake(TEX, TEX, (g) => drawExitTex(g, WALL_COLORS[7])),
];

// Buffers de ordenación por distancia (preasignados; insertion sort in-place).
// Capacidad para enemigos + ítems del nivel más poblado, con margen.
const MAX_SPRITES = 64;
const spriteOrder = new Int32Array(MAX_SPRITES);
const spriteDist = new Float32Array(MAX_SPRITES);
const NO_ITEMS = [];

// init se llama al redimensionar Y al cambiar de nivel/resolución: recibe el
// mapa actual para precalcular el degradado con SUS colores de techo/suelo
// (map.ceilingColor / map.floorColor). Todo el coste es aquí, no por frame.
export function init(ctx, width, height, map) {
  W = width;
  H = height;
  image = ctx.createImageData(W, H);
  buf32 = new Uint32Array(image.data.buffer);
  zbuffer = new Float32Array(W);

  // Techo y suelo: degradado vertical hacia el horizonte (más oscuro lejos).
  rowColor = new Uint32Array(H);
  const half = H / 2;
  for (let y = 0; y < H; y++) {
    const isCeiling = y < half;
    const base = isCeiling ? map.ceilingColor : map.floorColor;
    const t = isCeiling ? (half - y) / half : (y - half) / half;
    const f = 0.35 + 0.65 * t;
    rowColor[y] = pack((base[0] * f) | 0, (base[1] * f) | 0, (base[2] * f) | 0);
  }
}

export function render(ctx, player, map, enemies, items) {
  const dirX = Math.cos(player.angle);
  const dirY = Math.sin(player.angle);
  const planeX = -dirY * FOV_PLANE;
  const planeY = dirX * FOV_PLANE;

  // Fondo: techo y suelo fila por fila.
  for (let y = 0; y < H; y++) {
    buf32.fill(rowColor[y], y * W, y * W + W);
  }

  // Paredes: un rayo por columna.
  for (let x = 0; x < W; x++) {
    const cameraX = (2 * x) / W - 1;
    const rayDirX = dirX + planeX * cameraX;
    const rayDirY = dirY + planeY * cameraX;

    let mapX = player.x | 0;
    let mapY = player.y | 0;

    const deltaDistX = rayDirX === 0 ? 1e30 : Math.abs(1 / rayDirX);
    const deltaDistY = rayDirY === 0 ? 1e30 : Math.abs(1 / rayDirY);

    let stepX, stepY, sideDistX, sideDistY;
    if (rayDirX < 0) {
      stepX = -1;
      sideDistX = (player.x - mapX) * deltaDistX;
    } else {
      stepX = 1;
      sideDistX = (mapX + 1 - player.x) * deltaDistX;
    }
    if (rayDirY < 0) {
      stepY = -1;
      sideDistY = (player.y - mapY) * deltaDistY;
    } else {
      stepY = 1;
      sideDistY = (mapY + 1 - player.y) * deltaDistY;
    }

    // DDA: avanzar celda a celda hasta chocar con una pared.
    let side = 0;
    let wallType = 0;
    for (let i = 0; i < 128; i++) {
      if (sideDistX < sideDistY) {
        sideDistX += deltaDistX;
        mapX += stepX;
        side = 0;
      } else {
        sideDistY += deltaDistY;
        mapY += stepY;
        side = 1;
      }
      if (mapX < 0 || mapY < 0 || mapX >= map.w || mapY >= map.h) {
        wallType = 1;
        break;
      }
      wallType = map.cells[mapY * map.w + mapX];
      if (wallType > 0) break;
    }

    const perpDist = side === 0 ? sideDistX - deltaDistX : sideDistY - deltaDistY;
    zbuffer[x] = perpDist;

    const lineHeight = (H / perpDist) | 0;
    // Borde superior de la columna. Una puerta abriéndose se hunde en el
    // suelo: su tope baja según el progreso de apertura (map.doorProg).
    let wallTop = (H - lineHeight) / 2;
    if (wallType === DOOR_TYPE) {
      const p = map.doorProg[mapY * map.w + mapX];
      if (p > 0) wallTop += lineHeight * p;
    }
    let drawStart = wallTop | 0;
    let drawEnd = ((H + lineHeight) / 2) | 0;
    if (drawStart < 0) drawStart = 0;
    if (drawEnd > H) drawEnd = H;

    // Coordenada fraccionaria del impacto dentro de la celda → columna de
    // textura, con el flip clásico según cara y sentido del rayo para que la
    // textura no salga espejada al rodear el bloque.
    let wallX = side === 0
      ? player.y + perpDist * rayDirY
      : player.x + perpDist * rayDirX;
    wallX -= Math.floor(wallX);
    let texX = (wallX * TEX) | 0;
    if ((side === 0 && rayDirX > 0) || (side === 1 && rayDirY < 0)) texX = TEX_MASK - texX;

    // Sombreado: por distancia (niebla) y por orientación de la pared, como
    // factor entero 0-256 que multiplica cada texel (igual que los sprites).
    let light = 1 - perpDist / FOG_DISTANCE;
    if (light < MIN_LIGHT) light = MIN_LIGHT;
    if (side === 1) light *= 0.72;
    const lightI = (light * 256) | 0;

    // texY avanza a paso fijo por columna dibujada (precalculado fuera del
    // bucle); el AND con TEX_MASK envuelve la textura verticalmente.
    const tex = WALL_TEX[wallType] || WALL_TEX[1];
    const texStep = TEX / lineHeight;
    let texPos = (drawStart - wallTop) * texStep;
    let idx = drawStart * W + x;
    for (let y = drawStart; y < drawEnd; y++) {
      const pix = tex[(((texPos | 0) & TEX_MASK) << TEX_SHIFT) | texX];
      texPos += texStep;
      const r = ((pix & 0xff) * lightI) >> 8;
      const g = (((pix >> 8) & 0xff) * lightI) >> 8;
      const b = (((pix >> 16) & 0xff) * lightI) >> 8;
      buf32[idx] = (255 << 24) | (b << 16) | (g << 8) | r;
      idx += W;
    }
  }

  if (enemies) drawSprites(player, dirX, dirY, planeX, planeY, enemies, items || NO_ITEMS);

  ctx.putImageData(image, 0, 0);
}

// Proyección clásica de sprites: transformar la posición relativa con la
// inversa de la matriz cámara [dir, plane], escalar por 1/transformY y
// recortar cada columna contra el z-buffer de las paredes.
// Una sola lista ordenada mezcla enemigos (índices 0..nE-1, textura según
// pose) e ítems (índices nE.., textura y tamaño propios: {x,y,tex,texW,texH,
// sizeFactor}).
function drawSprites(player, dirX, dirY, planeX, planeY, enemies, items) {
  // Orden por distancia descendente (los lejanos primero).
  const nE = enemies.length;
  let n = 0;
  for (let i = 0; i < nE && n < MAX_SPRITES; i++) {
    const dx = enemies[i].x - player.x;
    const dy = enemies[i].y - player.y;
    spriteDist[n] = dx * dx + dy * dy;
    spriteOrder[n] = i;
    n++;
  }
  for (let i = 0; i < items.length && n < MAX_SPRITES; i++) {
    const dx = items[i].x - player.x;
    const dy = items[i].y - player.y;
    spriteDist[n] = dx * dx + dy * dy;
    spriteOrder[n] = nE + i;
    n++;
  }
  for (let i = 1; i < n; i++) {
    const d = spriteDist[i];
    const o = spriteOrder[i];
    let j = i - 1;
    while (j >= 0 && spriteDist[j] < d) {
      spriteDist[j + 1] = spriteDist[j];
      spriteOrder[j + 1] = spriteOrder[j];
      j--;
    }
    spriteDist[j + 1] = d;
    spriteOrder[j + 1] = o;
  }

  const invDet = 1 / (planeX * dirY - dirX * planeY);

  for (let i = 0; i < n; i++) {
    const oi = spriteOrder[i];
    let tex, tw, th, sizeFactor, wx, wy;
    if (oi < nE) {
      const e = enemies[oi];
      tex = (e.fast ? POSES_FAST : POSES)[e.pose];
      tw = SPR_W;
      th = SPR_H;
      sizeFactor = 0.82; // el imp no llega al techo
      wx = e.x;
      wy = e.y;
    } else {
      const it = items[oi - nE];
      tex = it.tex;
      tw = it.texW;
      th = it.texH;
      sizeFactor = it.sizeFactor;
      wx = it.x;
      wy = it.y;
    }
    const sx = wx - player.x;
    const sy = wy - player.y;
    // Espacio cámara: transformY es la profundidad (compara con el z-buffer).
    const transformX = invDet * (dirY * sx - dirX * sy);
    const transformY = invDet * (-planeY * sx + planeX * sy);
    if (transformY < 0.15) continue;

    const cellH = H / transformY;              // alto de una celda a esa distancia
    const sprH = (cellH * sizeFactor) | 0;
    if (sprH < 2) continue;
    const sprW = (sprH * (tw / th)) | 0;
    if (sprW < 1) continue;

    // Base apoyada en el suelo: alineada con la base de la celda.
    const floorY = ((H + cellH) / 2) | 0;
    const y0 = floorY - sprH;
    const screenX = ((W / 2) * (1 + transformX / transformY)) | 0;
    const x0 = screenX - (sprW >> 1);

    let xStart = x0 < 0 ? 0 : x0;
    let xEnd = x0 + sprW > W ? W : x0 + sprW;
    let yStart = y0 < 0 ? 0 : y0;
    let yEnd = floorY > H ? H : floorY;

    // Mismo sombreado por distancia que las paredes (factor entero 0-256).
    let light = 1 - transformY / FOG_DISTANCE;
    if (light < MIN_LIGHT) light = MIN_LIGHT;
    const lightI = (light * 256) | 0;

    for (let x = xStart; x < xEnd; x++) {
      if (transformY >= zbuffer[x]) continue; // columna tapada por una pared
      const texX = (((x - x0) * tw) / sprW) | 0;
      for (let y = yStart; y < yEnd; y++) {
        const texY = (((y - y0) * th) / sprH) | 0;
        const pix = tex[texY * tw + texX];
        if (pix === 0) continue; // transparente
        const r = ((pix & 0xff) * lightI) >> 8;
        const g = (((pix >> 8) & 0xff) * lightI) >> 8;
        const b = (((pix >> 16) & 0xff) * lightI) >> 8;
        buf32[y * W + x] = (255 << 24) | (b << 16) | (g << 8) | r;
      }
    }
  }
}
