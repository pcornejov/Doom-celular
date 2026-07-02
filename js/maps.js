// Mapas del juego. Cada nivel es una grilla de caracteres:
//   '.' vacío   '#' piedra gris   'B' ladrillo   'M' metal   'R' rojo   'G' verde
//   'D' puerta (se abre al usarla de cerca)   'X' salida de nivel
//   'S' imp   's' imp rápido   'H' botiquín   'A' munición   'W' escopeta
// Los marcadores S/s/H/A/W se extraen en compile() y su celda queda vacía.
// Diseñado para leerse visualmente: cada string es una fila del mapa.

export const DOOR_TYPE = 6;
export const EXIT_TYPE = 7;

const LEVEL_1 = [
  '########################',
  '#..........#...........#',
  '#.BBBB.....#..MMMM.....#',
  '#.B.AB.....#..M..M.....#',
  '#.BS..........MS.M...S.#',
  '#.B..B.....#..M..M.....#',
  '#.BBBB.....#..M.MM.....#',
  '#..........#...........#',
  '#####D######......######',
  '#.....#....#.S..RRRR...#',
  '#.....#....#....R..R...#',
  '#.....#....#....RS.R...#',
  '#.....#....#....R..R...#',
  '#H....#....#....R.RR...#',
  '#.....#....#...........#',
  '###D###....#D###########',
  '#......................#',
  '#..GGG.....GGG......M..#',
  '#..G.G.S.S.G.G......M..#',
  '#..GGG.....GGG......MA.#',
  '#......................#',
  '#..........MM....S.....#',
  '#.H...............A....#',
  '####################X###',
];

const LEVEL_2 = [
  '##########################',
  '#.......#........#....s..#',
  '#.......#..MM..S.#..BB...#',
  '#.......D..MM....#..BB..A#',
  '#.......#................#',
  '#.A.....#........#.......#',
  '#....S..#....S...#....s..#',
  '####.#######D########.####',
  '#.......#........#.......#',
  '#..BB...#..GG....#..MM...#',
  '#..BB...D..GG..s.#..MM..W#',
  '#.......#........D.......#',
  '#...S...#.....S..#....s..#',
  '#.......#........#.......#',
  '###.########D########D####',
  '#.......#........#.......#',
  '#..H....#..RR....#..RR...#',
  '#.......#..RR..S...RR....#',
  '#...A............#.......#',
  '#.......#....s...#....s..#',
  '#....s..#........#..HA...#',
  '#####################X####',
];

const LEVEL_3 = [
  '##########################',
  '#........................#',
  '#.A..RR........RR......H.#',
  '#....RR........RR........#',
  '#..........ss............#',
  '#....S.............S.....#',
  '#........................#',
  '#..RR......MM......RR....#',
  '#..RR..S...MM...S..RR....#',
  '#..........MM............#',
  '#....s..............s....#',
  '#........................#',
  '#.H..RR........RR.....A..#',
  '#....RR....SS..RR........#',
  '#........................#',
  '######D#############D#####',
  '#..A.................H...#',
  '#...s..............s.....#',
  '#........................#',
  '#############X############',
];

// Tipo de pared por carácter → índice en la paleta.
const WALL_TYPES = {
  '.': 0, '#': 1, 'B': 2, 'M': 3, 'R': 4, 'G': 5,
  'D': DOOR_TYPE, 'X': EXIT_TYPE,
};

// Paleta estilo Doom: [r, g, b] por tipo de pared.
export const WALL_COLORS = [
  [0, 0, 0],       // 0: vacío (no se dibuja)
  [128, 122, 116], // 1: piedra gris
  [146, 82, 52],   // 2: ladrillo marrón
  [96, 108, 130],  // 3: metal azulado
  [152, 44, 38],   // 4: rojo sangre
  [88, 112, 62],   // 5: verde militar
  [138, 110, 64],  // 6: puerta metálica dorada
  [64, 68, 60],    // 7: panel de salida
];

export const CEILING_COLOR = [42, 32, 26];
export const FLOOR_COLOR = [58, 54, 46];

// Ítems: índice de tipo (los usa items.js para textura y efecto).
export const ITEM_HEALTH = 0;
export const ITEM_AMMO = 1;
export const ITEM_SHOTGUN = 2;
const ITEM_KINDS = { H: ITEM_HEALTH, A: ITEM_AMMO, W: ITEM_SHOTGUN };

function compile(rows) {
  const h = rows.length;
  const w = rows[0].length;
  const cells = new Uint8Array(w * h);
  const enemySpawns = [];
  const items = [];
  const doors = [];
  let exit = null;
  for (let y = 0; y < h; y++) {
    if (rows[y].length !== w) throw new Error(`Mapa: fila ${y} mide ${rows[y].length}, se esperaba ${w}`);
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      let t = WALL_TYPES[ch];
      if (t === undefined) {
        if (ch === 'S' || ch === 's') {
          enemySpawns.push({ x: x + 0.5, y: y + 0.5, fast: ch === 's' });
        } else if (ITEM_KINDS[ch] !== undefined) {
          items.push({ x: x + 0.5, y: y + 0.5, kind: ITEM_KINDS[ch] });
        } else {
          throw new Error(`Mapa: carácter desconocido '${ch}' en (${x},${y})`);
        }
        t = 0;
      } else if (t === DOOR_TYPE) {
        doors.push({ cx: x, cy: y, idx: y * w + x, prog: 0, opening: false });
      } else if (t === EXIT_TYPE) {
        exit = { cx: x, cy: y };
      }
      cells[y * w + x] = t;
    }
  }
  if (!exit) throw new Error('Mapa sin salida (X)');
  // doorProg: progreso de apertura por celda, lo lee el raycaster (0 = cerrada).
  return { w, h, cells, doorProg: new Float32Array(w * h), doors, items, enemySpawns, exit };
}

export const level1 = {
  ...compile(LEVEL_1),
  name: 'E1M1 — LABERINTO DE HORMIGÓN',
  playerStart: { x: 2.5, y: 10.5, angle: 0 },
};

export const level2 = {
  ...compile(LEVEL_2),
  name: 'E1M2 — CATACUMBAS DE ÓXIDO',
  playerStart: { x: 2.5, y: 2.5, angle: 0 },
};

export const level3 = {
  ...compile(LEVEL_3),
  name: 'E1M3 — ARENA DEL AVERNO',
  playerStart: { x: 13.5, y: 14.5, angle: -Math.PI / 2 },
};

export const levels = [level1, level2, level3];

// Devuelve el tipo de celda; fuera de rango cuenta como pared.
export function cellAt(map, x, y) {
  const cx = x | 0;
  const cy = y | 0;
  if (cx < 0 || cy < 0 || cx >= map.w || cy >= map.h) return 1;
  return map.cells[cy * map.w + cx];
}
