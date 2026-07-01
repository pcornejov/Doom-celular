# Doom Celular 👹📱

Juego estilo Doom jugable desde el teléfono, con controles táctiles, hecho con un motor raycasting propio en JavaScript + Canvas 2D (sin frameworks, sin build) y desplegado en GitHub Pages.

🎮 **Jugar**: https://pcornejov.github.io/Doom-celular/ *(disponible a partir de la Iteración 0)*

## Plan de trabajo

Ver [PLAN.md](PLAN.md): investigación técnica, equipo de 4 agentes (diseño, programación, jugabilidad móvil y música) y las 7 iteraciones incrementales — cada una termina con una versión jugable publicada.

## Equipo de agentes

Definidos en [`.claude/agents/`](.claude/agents/):

- 🎨 `disenador` — arte retro, niveles, HUD
- 💻 `programador` — motor raycasting, IA, combate
- 📱 `jugabilidad-movil` — controles táctiles, rendimiento, game feel
- 🎵 `musico` — música y efectos con Web Audio API

## Despliegue

Cada push a `main` publica automáticamente en GitHub Pages ([workflow](.github/workflows/deploy.yml)).
**Configuración inicial (una sola vez)**: en *Settings → Pages* del repositorio, seleccionar **Source: GitHub Actions**.
