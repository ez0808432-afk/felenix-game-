'use strict';
/* ================================================================
   states.js — Patrón STATE
   Correcciones v6:
   - TODOS los mensajes de la mascota en PRIMERA PERSONA
     y siempre acompañados del audio_mascota (mostrarMensajeMascota).
   - HAMBRE: cada comida llena +35 → se necesitan mínimo 3 comidas
     para llenar la barra completa desde cero.
   - FELICIDAD: sube DESPACIO con cada cuidado (comer +5, bañar +6,
     dormir +4, caricias +2) — nunca de golpe.
================================================================ */

class State {
  constructor() { this.mascota = null; }
  jugar()  {}
  comer()  {}
  bañar()  {}
  dormir() {}
  setMascota(m) { this.mascota = m; }
  getNombre()   { return 'Estado'; }
}

const _ui  = () => UIManager.getInstance();
const _snd = () => SoundManager.getInstance();

/* ════════════════════════════════════════════════════
   DESPIERTO
════════════════════════════════════════════════════ */
class Despierto extends State {
  getNombre() { return 'Despierto'; }

  jugar() {
    const m = this.mascota;
    if (m.getEnergia() > 20 && m.getHambre() > 20) {
      AppController.getInstance().mostrarMiniJuego();
    } else if (m.getEnergia() <= 20) {
      _ui().mostrarMensajeMascota('💤 Estoy demasiado cansado para volar... necesito descansar primero.');
      _ui().mostrarAnimacion('cansado');
    } else {
      _ui().mostrarMensajeMascota('🍖 Mi estómago ruge como un volcán... ¡aliméntame antes de jugar!');
      _ui().mostrarAnimacion('hambre');
    }
  }

  comer() {
    const m = this.mascota;
    if (m.getHambre() <= 95) {
      m.cambiarEstado(new Comiendo());
      _ui().lanzarParticulas('comiendo');
    } else {
      _ui().mostrarMensajeMascota('✨ ¡Estoy completamente satisfecho! No me cabe ni una brasa más.');
      _ui().mostrarAnimacion('feliz');
    }
  }

  bañar() {
    const m = this.mascota;
    if (m.getHigiene() <= 95) {
      m.cambiarEstado(new Bañando());
      _ui().lanzarParticulas('bañando');
    } else {
      _ui().mostrarMensajeMascota('✨ ¡Ya brillo como una estrella recién nacida! Estoy impecable.');
      _ui().mostrarAnimacion('feliz');
    }
  }

  dormir() {
    const m = this.mascota;
    if (m.getEnergia() <= 85) {
      m.cambiarEstado(new Durmiendo());
    } else {
      _ui().mostrarMensajeMascota('⚡ ¡Mi fuego arde con demasiada fuerza para dormir ahora!');
      _ui().mostrarAnimacion('feliz');
    }
  }
}

/* ════════════════════════════════════════════════════
   JUGANDO — iniciado desde el mini-juego
════════════════════════════════════════════════════ */
class Jugando extends State {
  getNombre() { return 'Jugando'; }
  jugar()  { _ui().mostrarMensajeMascota('🎮 ¡Ya estoy en pleno vuelo!'); }
  comer()  { _ui().mostrarMensajeMascota('🎮 ¡Después del vuelo comeré, lo prometo!'); }
  bañar()  { _ui().mostrarMensajeMascota('🎮 ¡Ahora mismo estoy surcando los cielos!'); }
  dormir() { _ui().mostrarMensajeMascota('🎮 ¡Vuelo libre entre las llamas, no puedo dormir!'); }

  setMascota(m) {
    this.mascota = m;
    _ui().mostrarAnimacion('jugando');
    _ui().mostrarMensajeMascota('🔥 ¡Despliego mis alas de fuego! ¡A volar se ha dicho!');
  }
}

/* ════════════════════════════════════════════════════
   COMIENDO — hambre +35 (mínimo 3 comidas para llenar)
   Felicidad sube apenas +5 (sube despacio, no de golpe)
════════════════════════════════════════════════════ */
class Comiendo extends State {
  getNombre() { return 'Comiendo'; }
  jugar()  { _ui().mostrarMensajeMascota('🍖 ¡Espera! Primero termino de comer.'); }
  comer()  { _ui().mostrarMensajeMascota('🍖 ¡Ñam! Aún estoy masticando este bocado.'); }
  bañar()  { _ui().mostrarMensajeMascota('🍖 ¡Déjame terminar mi festín y luego me baño!'); }
  dormir() { _ui().mostrarMensajeMascota('🍖 ¡Comiendo estoy! Después dormiré.'); }

  setMascota(m) {
    this.mascota = m;
    /* Hambre +35: se necesitan al menos 3 comidas para llenar de 0 a 100 */
    m.setHambre(m.satisfacer(m.getHambre(), 35));
    m.setEnergia(m.satisfacer(m.getEnergia(), 8));
    m.setSalud(m.satisfacer(m.getSalud(), 3));
    /* Felicidad sube poco a poco */
    m.setFelicidad(m.satisfacer(m.getFelicidad(), 5));
    m.actualizarObservadores();

    _ui().mostrarAnimacion('comiendo');
    _ui().mostrarMensajeMascota(this._frase());

    this._timer = setTimeout(() => {
      if (this.mascota && this.mascota.getEstado() === this) {
        this.mascota.cambiarEstado(new Despierto());
        _ui().mostrarAnimacion('feliz');
        const lleno = this.mascota.getHambre() >= 95;
        _ui().mostrarMensajeMascota(lleno
          ? '🔥 ¡Estoy completamente lleno! Mi fuego interior arde al máximo.'
          : '🔥 ¡Qué rico estuvo! Aunque todavía me cabe otro festín...');
      }
    }, 4000);
  }

  _frase() {
    const frases = [
      '🍗 ¡Mrrr-nom! ¡Cada bocado reaviva mi fuego interior!',
      '🍖 ¡Kraak-ñom! ¡Estoy devorando este delicioso festín de llamas!',
      '✨ Purrr... ¡Siento cómo el alimento sagrado me restaura!',
    ];
    return frases[Math.floor(Math.random() * frases.length)];
  }
}

/* ════════════════════════════════════════════════════
   BAÑANDO — felicidad +6 (cuidarlo lo hace feliz poco a poco)
════════════════════════════════════════════════════ */
class Bañando extends State {
  getNombre() { return 'Bañando'; }
  jugar()  { _ui().mostrarMensajeMascota('💧 ¡Estoy purificándome! Un momento, por favor.'); }
  comer()  { _ui().mostrarMensajeMascota('💧 ¡Sigo en mi baño sagrado!'); }
  bañar()  { _ui().mostrarMensajeMascota('💧 ¡Ya me estoy bañando, guardián!'); }
  dormir() { _ui().mostrarMensajeMascota('💧 ¡Déjame terminar de purificarme!'); }

  setMascota(m) {
    this.mascota = m;
    m.setHigiene(m.satisfacer(m.getHigiene(), 50));
    m.setSalud(m.satisfacer(m.getSalud(), 3));
    /* Bañarlo también lo hace un poco más feliz */
    m.setFelicidad(m.satisfacer(m.getFelicidad(), 6));
    m.actualizarObservadores();

    _ui().mostrarAnimacion('bañando');
    _ui().mostrarMensajeMascota(this._frase());

    this._timer = setTimeout(() => {
      if (this.mascota && this.mascota.getEstado() === this) {
        this.mascota.cambiarEstado(new Despierto());
        _ui().mostrarAnimacion('feliz');
        _ui().mostrarMensajeMascota('✨ ¡Estoy limpio ahora, gracias! Brillo como el astro del amanecer.');
      }
    }, 4000);
  }

  _frase() {
    const frases = [
      '💦 ¡Prrr-SPLASH! ¡Las cascadas celestiales me purifican!',
      '🫧 ¡Nyaa-fwwsh! ¡Siento cómo el agua sagrada limpia mi espíritu!',
      '✨ Mrrr-splash... ¡Renazco purificado entre burbujas!',
    ];
    return frases[Math.floor(Math.random() * frases.length)];
  }
}

/* ════════════════════════════════════════════════════
   DURMIENDO — felicidad +4 al despertar descansado
════════════════════════════════════════════════════ */
class Durmiendo extends State {
  getNombre() { return 'Durmiendo'; }
  jugar()  { _ui().mostrarMensajeMascota('💤 Shhh... estoy soñando con las estrellas...'); }
  comer()  { _ui().mostrarMensajeMascota('💤 Zzz... déjame dormir un poco más...'); }
  bañar()  { _ui().mostrarMensajeMascota('💤 Zzz... después del descanso me baño...'); }
  dormir() { _ui().mostrarMensajeMascota('💤 Ya estoy durmiendo profundamente...'); }

  setMascota(m) {
    this.mascota = m;
    m.setEnergia(m.satisfacer(m.getEnergia(), 50));
    m.setSalud(m.satisfacer(m.getSalud(), 3));
    m.setFelicidad(m.satisfacer(m.getFelicidad(), 4));
    m.actualizarObservadores();

    _ui().mostrarAnimacion('durmiendo');
    _ui().mostrarMensajeMascota(this._frase());

    this._timer = setTimeout(() => {
      if (this.mascota && this.mascota.getEstado() === this) {
        this.mascota.cambiarEstado(new Despierto());
        _ui().mostrarAnimacion('feliz');
        _ui().mostrarMensajeMascota('🔥 ¡Desperté renovado! Mis alas están llenas de energía otra vez.');
      }
    }, 5000);
  }

  _frase() {
    const frases = [
      '💤 Zzz... Purr... Sueño con mundos de fuego...',
      '🌙 Mrrr... zzz... Mis alas descansan bajo la luna...',
      '⭐ Purr-zzz... En mis sueños vuelo entre constelaciones...',
    ];
    return frases[Math.floor(Math.random() * frases.length)];
  }
}
