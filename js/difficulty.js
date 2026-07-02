// Dificultad seleccionable en la pantalla de inicio (Iteración 8a).
// Los multiplicadores se consultan EN CALIENTE desde enemies.js y
// projectiles.js (no se hornean al cargar el nivel), así que cambiar la
// dificultad antes del primer gesto afecta al nivel ya cargado.
//
//   dmgMul        × al daño que hacen los enemigos (zarpazo y bola de fuego)
//   projSpeedMul  × a la velocidad de las bolas de fuego
//   enemySpeedMul × a la velocidad de persecución de los imps
//   fireRateMul   × a la cadencia de bolas de fuego (más alto = más bolas)

export const DIFFICULTIES = [
  { id: 'joven', name: 'SOY MUY JOVEN PARA MORIR', dmgMul: 0.6, projSpeedMul: 0.8, enemySpeedMul: 1, fireRateMul: 1 },
  { id: 'normal', name: 'HÁGANME DAÑO', dmgMul: 1, projSpeedMul: 1, enemySpeedMul: 1, fireRateMul: 1 },
  { id: 'pesadilla', name: 'PESADILLA', dmgMul: 1.5, projSpeedMul: 1, enemySpeedMul: 1.2, fireRateMul: 1.3 },
];

const STORE_KEY = 'doomcel_difficulty';

// Dificultad activa: objeto ÚNICO cuyo contenido se sobreescribe (los módulos
// que lo importan siempre ven los valores vigentes).
export const difficulty = { index: 1, ...DIFFICULTIES[1] };

export function setDifficulty(index) {
  if (index < 0 || index >= DIFFICULTIES.length) index = 1;
  Object.assign(difficulty, DIFFICULTIES[index]);
  difficulty.index = index;
  try { localStorage.setItem(STORE_KEY, DIFFICULTIES[index].id); } catch (e) { /* sin storage */ }
}

// Índice guardado en localStorage (por defecto HÁGANME DAÑO).
export function storedDifficultyIndex() {
  try {
    const id = localStorage.getItem(STORE_KEY);
    for (let i = 0; i < DIFFICULTIES.length; i++) {
      if (DIFFICULTIES[i].id === id) return i;
    }
  } catch (e) { /* sin storage */ }
  return 1;
}
