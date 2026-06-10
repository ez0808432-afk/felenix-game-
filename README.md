# 🔥 Felénix Tamagotchi v5.0

## Despliegue rápido (cualquier hosting estático)

### Netlify — recomendado, gratis, link instantáneo
1. Ve a **netlify.com/drop**
2. Arrastra el ZIP directamente → obtienes URL pública

### GitHub Pages
```
git init && git add . && git commit -m "Felénix v5"
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git push -u origin main
# Settings → Pages → Branch: main → / (root)
```

### Vercel
```bash
npm i -g vercel
vercel --prod   # desde la carpeta del proyecto
```

---

## 🏗️ Patrones de Diseño Implementados

| # | Patrón | Archivo(s) | Justificación |
|---|--------|-----------|---------------|
| 1 | **Singleton** | `mascota.js`, `uiManager.js`, `soundManager.js`, `appController.js` | Una sola instancia garantizada de cada subsistema. Evita timers duplicados y estados inconsistentes. |
| 2 | **Observer** | `observers.js` | Desacopla `Mascota` del DOM. Cada barra de stat es un observador independiente. Extensible sin modificar `Mascota`. |
| 3 | **State** | `states.js` | Comportamiento encapsulado por estado. Las acciones delegadas eliminan if/switch dispersos. Transiciones controladas y limpias. |
| 4 | **Strategy** | `miniJuego.js` | Cada tipo de obstáculo es una estrategia intercambiable. Nuevos obstáculos = nueva clase sin tocar `JuegoFenix`. |
| 5 | **Command** | `appController.js` | Transiciones de pantalla encapsuladas como objetos ejecutables. Desacopla botones del receptor. Extensible a historial/deshacer. |
| 6 | **Proxy (AudioPool)** | `soundManager.js` | Pool de clones de `<audio>`. Resuelve el bloqueo de reproducción simultánea en navegadores. Transparente para el cliente. |

---

## 🎮 Controles del Runner

| Acción | Teclado | Botón táctil |
|--------|---------|--------------|
| Mover ←/→ | `←` `→` | `◀` `▶` |
| Saltar | `↑` / `SPACE` | `▲ SALTAR` |
| Doble salto / planeo | `↑↑` | doble toque `▲` |
| Agacharse | `↓` mantener | `▼ AGACHAR` mantener |

## 💎 Mecánica de Diamantes
Cada **5 diamantes** recolectados en el mini-juego → **+1 de salud** a Felénix.
