# Plan de trabajo — Doom Celular

Juego estilo Doom (shooter en primera persona con motor raycasting), jugable desde el teléfono con controles táctiles, desplegado en GitHub Pages mediante iteraciones incrementales.

---

## 1. Investigación técnica

### 1.1 ¿Cómo se hace un "Doom" que corra en el navegador del teléfono?

Se evaluaron tres enfoques:

| Enfoque | Descripción | Veredicto |
|---|---|---|
| **Motor raycasting propio (JS + Canvas)** | Técnica de Wolfenstein 3D / Doom clásico: se lanza un rayo por columna de píxeles y se dibujan franjas verticales de pared. Corre a 60 fps incluso en teléfonos modestos. | ✅ **Elegido** |
| Port de Doom real vía WebAssembly (js-dos, Chocolate Doom + Emscripten) | Es el Doom original, pero requiere el archivo WAD (problemas de licencia), pesa mucho y adaptar controles táctiles al binario es muy difícil. | ❌ Descartado |
| Motor 3D completo (Three.js / WebGL) | Sobredimensionado para la estética retro que se busca; más peso, más consumo de batería, curva de desarrollo más larga. | ❌ Descartado |

**Decisión: motor raycasting propio en JavaScript puro + Canvas 2D.** Ventajas clave para este proyecto:

- **Cero dependencias y cero build**: HTML + JS + CSS estáticos, ideal para GitHub Pages (se sube y funciona).
- **Rendimiento móvil excelente**: el raycasting clásico es O(ancho de pantalla), no O(geometría). Se puede renderizar a resolución interna baja (ej. 320×180) y escalar al tamaño de la pantalla, exactamente como el Doom original.
- **Control total sobre la jugabilidad**: podemos adaptar velocidad, sensibilidad, tamaño de botones, etc., sin pelear con código ajeno.

Referencias base:
- Lode Vandevenne, *Raycasting tutorial* (la referencia canónica del algoritmo DDA): https://lodev.org/cgtutor/raycasting.html
- MDN, *Touch events*: https://developer.mozilla.org/en-US/docs/Web/API/Touch_events
- MDN, *Web Audio API*: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
- GitHub Docs, *Publishing with GitHub Actions to Pages*: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

### 1.2 Controles táctiles (lo que funciona en shooters móviles)

Patrón estándar de la industria (probado en Doom Mobile, Call of Duty Mobile, etc.):

- **Mitad izquierda de la pantalla = joystick virtual** de movimiento (aparece donde el pulgar toca, "floating joystick").
- **Mitad derecha = arrastrar para girar/apuntar** (delta del dedo → rotación de cámara).
- **Botón de disparo** fijo en la esquina inferior derecha, grande (mínimo 48×48 px táctiles según guías de accesibilidad), con soporte multi-touch (disparar mientras se mueve y gira).
- Extras necesarios en web móvil: `touch-action: none` para bloquear scroll/zoom del navegador, meta viewport correcto, pantalla completa opcional (Fullscreen API), orientación horizontal recomendada con aviso si el teléfono está vertical.

### 1.3 Audio y música en móvil

- **Web Audio API** para todo (música y efectos). En iOS/Android el audio solo puede iniciarse tras un gesto del usuario → el `AudioContext` se desbloquea en el primer toque (pantalla de "TAP TO START").
- Música estilo Doom: MIDI-metal sintetizado. Dos caminos complementarios:
  1. **Música procedural con osciladores** de Web Audio (cero archivos, cero peso) para las primeras iteraciones.
  2. Pistas cortas en **OGG/M4A en loop** (archivos pequeños, < 500 KB) para la versión final si se quiere más calidad.
- Efectos (disparo, impacto, puerta, muerte) sintetizados con osciladores + ruido → estética retro auténtica y sin assets externos.

### 1.4 Despliegue en GitHub Pages

- Sitio 100 % estático → **GitHub Actions con `actions/deploy-pages`**: cada push a `main` publica automáticamente.
- URL resultante: `https://pcornejov.github.io/Doom-celular/`
- Sin paso de build: el workflow sube el repositorio tal cual como artefacto de Pages.
- **Requisito manual (una sola vez)**: en *Settings → Pages* del repo, seleccionar **Source: GitHub Actions**.

---

## 2. Equipo de 4 agentes

Los roles están definidos como subagentes de Claude Code en `.claude/agents/` para poder invocarlos en cada iteración:

| Agente | Archivo | Responsabilidad |
|---|---|---|
| 🎨 **Diseñador** (`disenador`) | `.claude/agents/disenador.md` | Dirección de arte retro (paleta, texturas, sprites, HUD), diseño de niveles/mapas, pantallas de menú, legibilidad en pantallas chicas. |
| 💻 **Programador** (`programador`) | `.claude/agents/programador.md` | Motor raycasting, game loop, colisiones, enemigos/IA, sistema de armas, arquitectura del código. |
| 📱 **Jugabilidad móvil** (`jugabilidad-movil`) | `.claude/agents/jugabilidad-movil.md` | Controles táctiles, responsividad, rendimiento en teléfonos (60 fps), ergonomía (zonas de pulgar), ajuste fino de sensibilidad y dificultad. |
| 🎵 **Músico** (`musico`) | `.claude/agents/musico.md` | Música con Web Audio API, efectos de sonido sintetizados, mezcla de volúmenes, desbloqueo de audio en móvil. |

**Flujo de trabajo por iteración**: el orquestador (sesión principal) reparte las tareas de la iteración al agente responsable, integra el resultado, verifica en conjunto con el agente de jugabilidad y despliega.

---

## 3. Iteraciones incrementales

Regla de oro: **cada iteración termina con una versión jugable publicada en GitHub Pages**. Nunca se acumula trabajo sin desplegar.

> **Estado**: iteraciones 0–4, 5a (pulido visual) y 6 completadas y en producción.
> Pendiente 5b: ajuste fino de sensibilidad/dificultad con feedback de juego en
> teléfonos reales.

### Iteración 0 — Esqueleto + despliegue funcionando 🏗️
*Responsables: Programador + Jugabilidad móvil*

- `index.html` con canvas a pantalla completa, meta viewport, `touch-action: none`.
- Game loop básico (`requestAnimationFrame`) que pinta algo en pantalla (aunque sea un color y un contador de FPS).
- Workflow de GitHub Actions (`.github/workflows/deploy.yml`) publicando en Pages.
- **Criterio de aceptación**: abrir la URL de Pages desde un teléfono y ver el canvas ocupando toda la pantalla sin scroll ni zoom.

### Iteración 1 — Motor raycasting: caminar por un laberinto 🧱
*Responsable: Programador. Apoyo: Diseñador (mapa y paleta)*

- Mapa en grilla (array 2D), algoritmo DDA de raycasting, paredes con sombreado por distancia y por orientación.
- Resolución interna baja (~320×180) escalada al canvas para mantener 60 fps.
- Movimiento provisional con teclado (para probar en desktop) + colisión contra paredes.
- Primer mapa de prueba diseñado por el Diseñador.
- **Criterio de aceptación**: recorrer el laberinto con fluidez en desktop; ≥ 30 fps en un teléfono de gama media.

### Iteración 2 — Controles táctiles 📱
*Responsable: Jugabilidad móvil. Apoyo: Diseñador (UI de controles)*

- Joystick virtual flotante (mitad izquierda) para avanzar/retroceder/desplazarse lateral.
- Giro de cámara arrastrando en la mitad derecha, con sensibilidad ajustada.
- Botón de disparo grande con multi-touch real (mover + girar + disparar a la vez).
- Pantalla "TAP TO START", manejo de orientación y botón de pantalla completa.
- **Criterio de aceptación**: partida completa jugada solo con los pulgares en un teléfono real, sin gestos accidentales del navegador.

### Iteración 3 — Combate: enemigos, arma y vida 👹
*Responsable: Programador. Apoyo: Diseñador (sprites y HUD)*

- Sprites de enemigos renderizados con z-buffer (ordenados por distancia, recortados por paredes).
- IA básica: patrullar → perseguir al jugador → atacar a corta distancia.
- Arma en pantalla con animación de disparo, hitscan, vida del jugador y de enemigos.
- HUD estilo Doom: vida, munición, cara del protagonista.
- **Criterio de aceptación**: es posible morir y es posible ganar limpiando el nivel.

### Iteración 4 — Música y sonido 🎵
*Responsable: Músico*

- Motor de audio sobre Web Audio API con desbloqueo en el primer toque.
- Efectos sintetizados: disparo, impacto, dolor, muerte de enemigo, pasos, puerta.
- Pista musical en loop estilo MIDI-metal (procedural con osciladores).
- Mezcla: la música no tapa los efectos; control de mute en el HUD.
- **Criterio de aceptación**: audio funciona en Chrome Android y Safari iOS; el juego sigue a 60 fps con el audio activo.

### Iteración 5 — Pulido y rendimiento 🚀
*Responsables: Jugabilidad móvil + Diseñador*

- Perfilado en teléfonos reales; optimizaciones (typed arrays, cero allocations en el loop, `imageSmoothingEnabled = false`).
- Ajuste fino: sensibilidad de giro, tamaño/opacidad de controles, dificultad de enemigos.
- Pantallas de inicio, muerte y victoria con estética Doom; favicon y título.
- Textura de paredes y suelo/techo con degradado (si el rendimiento lo permite).
- **Criterio de aceptación**: 60 fps estables en gama media; un jugador nuevo entiende los controles sin explicación.

### Iteración 6 — Contenido: más niveles y progresión 🗺️
*Responsables: Diseñador + Programador*

- 2–3 niveles adicionales con dificultad creciente, llaves/puertas, ítems (botiquín, munición).
- Segunda arma (escopeta) y segundo tipo de enemigo.
- Progresión entre niveles y puntuación final.
- **Criterio de aceptación**: campaña corta completa (10–15 min) jugable de principio a fin en el teléfono.

---

## 4. Estructura del proyecto (objetivo)

```
Doom-celular/
├── index.html            # Punto de entrada, canvas, pantalla de inicio
├── css/style.css         # Layout responsivo, controles táctiles
├── js/
│   ├── main.js           # Game loop, estados (menú/juego/muerte/victoria)
│   ├── raycaster.js      # Motor de render (DDA, paredes, sprites, z-buffer)
│   ├── player.js         # Movimiento, colisiones, vida, armas
│   ├── enemies.js        # IA y estados de los enemigos
│   ├── touch.js          # Joystick virtual, giro táctil, botones
│   ├── audio.js          # Música y SFX con Web Audio API
│   └── maps.js           # Definición de niveles
├── .github/workflows/deploy.yml   # Despliegue automático a Pages
├── .claude/agents/       # Definiciones de los 4 agentes
└── PLAN.md               # Este documento
```

## 5. Flujo de trabajo git

1. Cada iteración se desarrolla en una rama `iteracion-N-descripcion`.
2. Al cumplir el criterio de aceptación, se integra a `main`.
3. El push a `main` dispara el workflow y publica automáticamente en GitHub Pages.
4. Se prueba en un teléfono real desde la URL pública antes de empezar la siguiente iteración.
