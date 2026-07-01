// Mapas del juego. Cada nivel es una grilla de caracteres:
//   '.' vacío   '#' piedra gris   'B' ladrillo   'M' metal   'R' rojo   'G' verde
// Diseñado para leerse visualmente: cada string es una fila del mapa.

const LEVEL_1 = [
  '########################',
  '#..........#...........#',
  '#.BBBB.....#..MMMM.....#',
  '#.B..B.....#..M..M.....#',
  '#.B........#..M..M.....#',
  '#.B..B.....#..M..M.....#',
  '#.BBBB.....#..M.MM.....#',
  '#..........#...........#',
  '#####.######......######',
  '#.....#....#....RRRR...#',
  '#.....#....#....R..R...#',
  '#.....#....#....R..R...#',
  '#.....#....#....R..R...#',
  '#.....#....#....R.RR...#',
  '#.....#....#...........#',
  '###.###....#############',
  '#......................#',
  '#..GGG.....GGG......M..#',
  '#..G.G.....G.G......M..#',
  '#..GGG.....GGG......M..#',
  '#......................#',
  '#..........MM..........#',
  '#......................#',
  '########################',
];

// Tipo de pared por carácter → índice en la paleta.
const WALL_TYPES = { '.': 0, '#': 1, 'B': 2, 'M': 3, 'R': 4, 'G': 5 };

// Paleta estilo Doom: [r, g, b] por tipo de pared.
export const WALL_COLORS = [
  [0, 0, 0],       // 0: vacío (no se dibuja)
  [128, 122, 116], // 1: piedra gris
  [146, 82, 52],   // 2: ladrillo marrón
  [96, 108, 130],  // 3: metal azulado
  [152, 44, 38],   // 4: rojo sangre
  [88, 112, 62],   // 5: verde militar
];

export const CEILING_COLOR = [42, 32, 26];
export const FLOOR_COLOR = [58, 54, 46];

function compile(rows) {
  const h = rows.length;
  const w = rows[0].length;
  const cells = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    if (rows[y].length !== w) throw new Error(`Mapa: fila ${y} mide ${rows[y].length}, se esperaba ${w}`);
    for (let x = 0; x < w; x++) {
      const t = WALL_TYPES[rows[y][x]];
      if (t === undefined) throw new Error(`Mapa: carácter desconocido '${rows[y][x]}' en (${x},${y})`);
      cells[y * w + x] = t;
    }
  }
  return { w, h, cells };
}

export const level1 = {
  ...compile(LEVEL_1),
  playerStart: { x: 2.5, y: 10.5, angle: 0 },
};

// Devuelve el tipo de celda; fuera de rango cuenta como pared.
export function cellAt(map, x, y) {
  const cx = x | 0;
  const cy = y | 0;
  if (cx < 0 || cy < 0 || cx >= map.w || cy >= map.h) return 1;
  return map.cells[cy * map.w + cx];
}
