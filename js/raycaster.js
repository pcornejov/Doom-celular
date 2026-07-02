// Motor de render por raycasting (algoritmo DDA, una columna por rayo).
// Dibuja directo sobre un buffer de píxeles (Uint32Array ABGR) que se
// vuelca al canvas con putImageData: cero allocations por frame.

import { WALL_COLORS, CEILING_COLOR, FLOOR_COLOR } from './maps.js';

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

function bakeSprite(draw) {
  const c = document.createElement('canvas');
  c.width = SPR_W;
  c.height = SPR_H;
  const g = c.getContext('2d', { willReadFrequently: true });
  draw(g);
  return new Uint32Array(g.getImageData(0, 0, SPR_W, SPR_H).data.buffer);
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

// Poses: 0 de pie, 1 atacando, 2 herido (tintado blanco), 3 cadáver.
const POSES = [
  bakeSprite((g) => drawImp(g, false)),
  bakeSprite((g) => drawImp(g, true)),
  bakeSprite((g) => {
    drawImp(g, false);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.fillRect(0, 0, SPR_W, SPR_H);
  }),
  bakeSprite(drawCorpse),
];

// Buffers de ordenación por distancia (preasignados; insertion sort in-place).
const spriteOrder = new Int32Array(32);
const spriteDist = new Float32Array(32);

export function init(ctx, width, height) {
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
    const base = isCeiling ? CEILING_COLOR : FLOOR_COLOR;
    const t = isCeiling ? (half - y) / half : (y - half) / half;
    const f = 0.35 + 0.65 * t;
    rowColor[y] = pack((base[0] * f) | 0, (base[1] * f) | 0, (base[2] * f) | 0);
  }
}

export function render(ctx, player, map, enemies) {
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
    let drawStart = ((H - lineHeight) / 2) | 0;
    let drawEnd = ((H + lineHeight) / 2) | 0;
    if (drawStart < 0) drawStart = 0;
    if (drawEnd > H) drawEnd = H;

    // Sombreado: por distancia (niebla) y por orientación de la pared.
    const base = WALL_COLORS[wallType];
    let light = 1 - perpDist / FOG_DISTANCE;
    if (light < MIN_LIGHT) light = MIN_LIGHT;
    if (side === 1) light *= 0.72;
    const color = pack((base[0] * light) | 0, (base[1] * light) | 0, (base[2] * light) | 0);

    for (let y = drawStart; y < drawEnd; y++) {
      buf32[y * W + x] = color;
    }
  }

  if (enemies) drawSprites(player, dirX, dirY, planeX, planeY, enemies);

  ctx.putImageData(image, 0, 0);
}

// Proyección clásica de sprites: transformar la posición relativa con la
// inversa de la matriz cámara [dir, plane], escalar por 1/transformY y
// recortar cada columna contra el z-buffer de las paredes.
function drawSprites(player, dirX, dirY, planeX, planeY, enemies) {
  // Orden por distancia descendente (los lejanos primero).
  let n = 0;
  for (let i = 0; i < enemies.length; i++) {
    const dx = enemies[i].x - player.x;
    const dy = enemies[i].y - player.y;
    spriteDist[n] = dx * dx + dy * dy;
    spriteOrder[n] = i;
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
    const e = enemies[spriteOrder[i]];
    const sx = e.x - player.x;
    const sy = e.y - player.y;
    // Espacio cámara: transformY es la profundidad (compara con el z-buffer).
    const transformX = invDet * (dirY * sx - dirX * sy);
    const transformY = invDet * (-planeY * sx + planeX * sy);
    if (transformY < 0.15) continue;

    const tex = POSES[e.pose];
    const cellH = H / transformY;              // alto de una celda a esa distancia
    const sprH = (cellH * 0.82) | 0;           // el imp no llega al techo
    if (sprH < 2) continue;
    const sprW = (sprH * (SPR_W / SPR_H)) | 0;
    if (sprW < 1) continue;

    // Pies apoyados en el suelo: alineados con la base de la celda.
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
      const texX = (((x - x0) * SPR_W) / sprW) | 0;
      for (let y = yStart; y < yEnd; y++) {
        const texY = (((y - y0) * SPR_H) / sprH) | 0;
        const pix = tex[texY * SPR_W + texX];
        if (pix === 0) continue; // transparente
        const r = ((pix & 0xff) * lightI) >> 8;
        const g = (((pix >> 8) & 0xff) * lightI) >> 8;
        const b = (((pix >> 16) & 0xff) * lightI) >> 8;
        buf32[y * W + x] = (255 << 24) | (b << 16) | (g << 8) | r;
      }
    }
  }
}
