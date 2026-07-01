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

export function render(ctx, player, map) {
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

  ctx.putImageData(image, 0, 0);
}
