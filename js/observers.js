'use strict';
/* ================================================================
   observers.js — Patrón OBSERVER
   Justificación: Desacopla la mascota de la UI. Cada observador
   reacciona a cambios de estado sin que Mascota conozca el DOM.
   Permite agregar/quitar observadores sin modificar Mascota.
================================================================ */

/** Interfaz base Observer */
class Observador {
  actualizarBarra(mascota) {}
}

/* Fábrica interna para reducir repetición */
class _BarraObservador extends Observador {
  constructor(barraId, msgId, valId, umbral, textoBajo) {
    super();
    this._bid = barraId; this._mid = msgId; this._vid = valId;
    this._umbral = umbral; this._texto = textoBajo;
  }
  _getStat(m) { return 100; } // override
  actualizarBarra(m) {
    const b = document.getElementById(this._bid);
    const msg = document.getElementById(this._mid);
    const v = document.getElementById(this._vid);
    if (!b) return;
    const val = this._getStat(m);
    b.value = val;
    if (v) v.textContent = Math.round(val);
    const wrap = b.closest('.stat__item');
    if (val < this._umbral) {
      if (msg) { msg.textContent = this._texto; msg.style.display = 'block'; }
      if (wrap) wrap.classList.add('barra--low');
    } else {
      if (msg) msg.style.display = 'none';
      if (wrap) wrap.classList.remove('barra--low');
    }
  }
}

class ObservadorSalud extends _BarraObservador {
  constructor() { super('barraSalud','mensajeSalud','valorSalud',15,'⚠️ ¡Me estoy apagando... ayúdame!'); }
  _getStat(m) { return m.getSalud(); }
}
class ObservadorEnergia extends _BarraObservador {
  constructor() { super('barraEnergia','mensajeEnergia','valorEnergia',20,'💤 Estoy agotado, necesito dormir...'); }
  _getStat(m) { return m.getEnergia(); }
}
class ObservadorFelicidad extends _BarraObservador {
  constructor() { super('barraFelicidad','mensajeFelicidad','valorFelicidad',20,'😢 Me siento muy triste...'); }
  _getStat(m) { return m.getFelicidad(); }
}
class ObservadorHambre extends _BarraObservador {
  constructor() { super('barraHambre','mensajeHambre','valorHambre',20,'🍖 ¡Tengo mucha hambre!'); }
  _getStat(m) { return m.getHambre(); }
}
class ObservadorHigiene extends _BarraObservador {
  constructor() { super('barraHigiene','mensajeHigiene','valorHigiene',15,'✨ Necesito un baño, me siento sucio'); }
  _getStat(m) { return m.getHigiene(); }
}

/** Observador de UI: actualiza badge y expresión visual */
class ObservadorUI extends Observador {
  actualizarBarra(m) {
    UIManager.getInstance().actualizarExpresion(m);
    UIManager.getInstance().actualizarBadge(m);
  }
}
