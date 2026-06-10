'use strict';
/* ================================================================
   appController.js — Patrón SINGLETON + COMMAND
   - idle_f00 aparece en screenNombre Y en el showcase del menú
     (misma imagen, mismo tamaño visual — punto 3)
   - En el juego principal: sprites de estado reales (no idle_f00)
================================================================ */

class Comando { ejecutar() {} }

class MostrarNombreCmd extends Comando {
  ejecutar() {
    UIManager.getInstance().mostrarPantalla('screenNombre');
    /* idle_f00 — aparición #1: pantalla de nombre */
    const img = document.getElementById('nombreImg');
    if (img) { img.src = 'imagenes/idle_f00.png'; img.style.display = 'block'; }
  }
}

class MostrarMenuCmd extends Comando {
  ejecutar() {
    SoundManager.getInstance().detenerFondo();
    UIManager.getInstance().mostrarPantalla('screenMenu');
    const n  = Mascota.getInstance().getNombre();
    const el = document.getElementById('menuNombreMascota');
    if (el) el.textContent = n;
    /* idle_f00 — aparición #2: showcase del menú (misma imagen que en nombre) */
    const menuImg = document.getElementById('menuImg');
    if (menuImg) { menuImg.src = 'imagenes/idle_f00.png'; menuImg.style.display = 'block'; }
    /* NO ciclamos — la imagen se queda estática como en nombre, solo con la animación CSS flotar */
  }
}

class MostrarJuegoCmd extends Comando {
  constructor(ctrl) { super(); this._ctrl = ctrl; }
  ejecutar() {
    const ctrl = this._ctrl;
    SoundManager.getInstance().detenerFondo();
    UIManager.getInstance().mostrarPantalla('screenJuego');

    const n  = Mascota.getInstance().getNombre();
    const el = document.getElementById('juegoNombreMascota');
    if (el) el.textContent = `🔥 ${n}`;

    /* Iniciar tick de degradación una sola vez */
    if (!ctrl._tick) {
      ctrl._tick = setInterval(() => Mascota.getInstance().tickNecesidades(), 1000);
    }
    /* Frases periódicas */
    if (!ctrl._fraseInterval) {
      ctrl._fraseInterval = setInterval(() => {
        if (ctrl._pantalla === 'juego') UIManager.getInstance().mostrarFrase();
      }, 22000);
    }

    /* Juego principal: sprite normal01 (NO idle_f00) */
    UIManager.getInstance().mostrarAnimacion('idle');
    UIManager.getInstance().mostrarMensajeMascota(`🔥 ¡Hola, guardián! Soy ${n} y te estaba esperando.`);
    Mascota.getInstance().actualizarObservadores();
  }
}

class MostrarMiniJuegoCmd extends Comando {
  ejecutar() {
    UIManager.getInstance().mostrarPantalla('screenMiniJuego');
    Mascota.getInstance().cambiarEstado(new Jugando());
    if (!window.juegoFenix) window.juegoFenix = new JuegoFenix('gameCanvas');
    /* Si el juego quedó detenido (se salió con "Volver"), mostrar de nuevo
       la pantalla de inicio para poder REINICIAR el vuelo desde cero.
       (Reiniciar es lo correcto: los resultados parciales ya se aplicaron
       a la mascota al salir, así que reanudar duplicaría recompensas). */
    if (!window.juegoFenix._running) {
      window.juegoFenix.mostrarOverlayInicio();
    }
    /* Audio fondo: se activa en main.js al pulsar btnIniciarRunner */
  }
}

class VolverAlJuegoCmd extends Comando {
  constructor(ctrl) { super(); this._ctrl = ctrl; }
  ejecutar() {
    SoundManager.getInstance().detenerFondo();
    if (Mascota.getInstance().getEstado() instanceof Jugando) {
      Mascota.getInstance().cambiarEstado(new Despierto());
    }
    new MostrarJuegoCmd(this._ctrl).ejecutar();
  }
}

/* ════════════════════════════════════════════════════════════════ */
class AppController {
  constructor() {
    this._pantalla      = 'intro';
    this._tick          = null;
    this._fraseInterval = null;

    this._comandos = {
      nombre:    new MostrarNombreCmd(),
      menu:      new MostrarMenuCmd(),
      juego:     new MostrarJuegoCmd(this),
      miniJuego: new MostrarMiniJuegoCmd(),
      volver:    new VolverAlJuegoCmd(this),
    };
  }

  static getInstance() {
    if (!AppController._instance) AppController._instance = new AppController();
    return AppController._instance;
  }

  _ejecutar(nombre) {
    this._pantalla = nombre;
    this._comandos[nombre]?.ejecutar();
  }

  init()             { IntroController.getInstance().iniciar(); }
  mostrarNombre()    { this._ejecutar('nombre'); }
  mostrarMenu()      { this._ejecutar('menu'); }
  mostrarJuego()     { this._ejecutar('juego'); }
  mostrarMiniJuego() { this._ejecutar('miniJuego'); }
  volverAlJuego()    { this._ejecutar('volver'); }
}
