'use strict';
/* ================================================================
   mascota.js — Patrón SINGLETON
   Correcciones v5.2:
   - Frases en PRIMERA PERSONA (yo/me/mi/mis)
   - Degradación más rápida cuando stats bajas
   - No muere mientras está en mini-juego (Jugando state protege)
   - Energía se consume siempre al jugar (incluso si no gana)
================================================================ */
class Mascota {
  constructor() {
    this._nombre    = 'Felénix';
    this._salud     = 100;
    this._energia   = 100;
    this._felicidad = 100;
    this._hambre    = 100;
    this._higiene   = 100;
    this._edad      = 0;
    this._vivo      = true;

    this._estado = new Despierto();
    this._estado.setMascota(this);

    this._observadores = [
      new ObservadorSalud(),
      new ObservadorEnergia(),
      new ObservadorFelicidad(),
      new ObservadorHambre(),
      new ObservadorHigiene(),
      new ObservadorUI(),
    ];

    /* Frases en primera persona */
    this._frases = {
      feliz: [
        { a:'¡Purrr~! 🔥',  h:'¡Me siento lleno de fuego y vida, guardián!' },
        { a:'¡Nyaaah! ✨',   h:'¡Estoy tan feliz contigo! ¡Eres el mejor guardián!' },
        { a:'¡Mrrr~! 🌟',   h:'¡Mi llama interior brilla más que nunca!' },
      ],
      triste: [
        { a:'Mrrr... 😢',    h:'Me siento muy mal... Necesito tu ayuda, guardián.' },
        { a:'Nyaa... 💧',    h:'Mis llamas se apagan... ¿Puedes cuidarme?' },
        { a:'Kraak... 🌧️',  h:'Me siento solo y débil... No me abandones.' },
      ],
      hambre: [
        { a:'¡KRAAK! 🍖',   h:'¡Tengo mucha hambre! ¡Mis llamas se apagan, aliméntame!' },
        { a:'Mrrr-nyaaa! 🔥',h:'¡No puedo volar así! ¡Necesito comer ya, por favor!' },
      ],
      cansado: [
        { a:'Purrr... 💤',   h:'Estoy agotado... Mis alas ya no me sostienen.' },
        { a:'Mrrrow... 😴',  h:'Necesito descansar... Siento las alas como de piedra.' },
      ],
      comiendo: [
        { a:'Mrrr-nom! 🍗',  h:'¡Mmm! ¡Cada bocado me recarga! ¡Gracias, guardián!' },
        { a:'¡Nom-nom! ✨',   h:'¡Siento cómo mi fuego se reaviva con cada mordisco!' },
      ],
      bañando: [
        { a:'¡Prrr-splash! 💦', h:'¡El agua sagrada me purifica! ¡Me siento renovado!' },
        { a:'Nyaa-splash! ✨',   h:'¡Qué bien me sienta esto! ¡Brillo como una estrella!' },
      ],
      durmiendo: [
        { a:'Zzz... 💤',     h:'Sueño con constelaciones de fuego... Zzz...' },
        { a:'Mrrr-zzz 🌙',   h:'Mis alas descansan... Me recargo para el nuevo día...' },
      ],
      sucio: [
        { a:'Mrrr... 😷',    h:'Me siento sucio... ¿Me das un baño, por favor?' },
        { a:'Kraak-ugh 💧',   h:'Las cenizas me pesan... Necesito purificarme.' },
      ],
      normal: [
        { a:'Purrr... 🔥',   h:'Aquí estoy, guardián. ¿Qué haremos hoy?' },
        { a:'Mrrr~ ✨',       h:'Me alegra tenerte cerca. ¿Cuidas de mí, verdad?' },
      ],
    };
  }

  static getInstance()   { if (!Mascota._instance) Mascota._instance = new Mascota(); return Mascota._instance; }
  static resetInstance() { Mascota._instance = null; }

  getNombre()    { return this._nombre; }
  setNombre(n)   { this._nombre = n || 'Felénix'; }
  getSalud()     { return this._salud; }
  getEnergia()   { return this._energia; }
  getFelicidad() { return this._felicidad; }
  getHambre()    { return this._hambre; }
  getHigiene()   { return this._higiene; }
  getEstado()    { return this._estado; }
  estaVivo()     { return this._vivo; }

  setSalud(v)     { this._salud     = Math.min(100, Math.max(0, +v||0)); }
  setEnergia(v)   { this._energia   = Math.min(100, Math.max(0, +v||0)); }
  setFelicidad(v) { this._felicidad = Math.min(100, Math.max(0, +v||0)); }
  setHambre(v)    { this._hambre    = Math.min(100, Math.max(0, +v||0)); }
  setHigiene(v)   { this._higiene   = Math.min(100, Math.max(0, +v||0)); }

  satisfacer(v, n)   { return Math.min(v + n, 100); }
  insatisfacer(v, n) { return Math.max(v - n, 0);   }

  jugar()  { this._estado.jugar();  }
  comer()  { this._estado.comer();  }
  bañar()  { this._estado.bañar();  }
  dormir() { this._estado.dormir(); }

  cambiarEstado(s) {
    this._estado = s;
    s.setMascota(this);
    SoundManager.getInstance().reproducirEstado(s.getNombre());
  }

  actualizarObservadores() {
    this._observadores.forEach(o => o.actualizarBarra(this));
  }

  getFrase() {
    if (!this._vivo) return { a:'Kraak... 🪦', h:'Espero renacer pronto...' };
    const n = this._estado.getNombre();
    const key =
      n === 'Comiendo'  ? 'comiendo'  :
      n === 'Bañando'   ? 'bañando'   :
      n === 'Durmiendo' ? 'durmiendo' :
      this._hambre    < 25 ? 'hambre'  :
      this._energia   < 25 ? 'cansado' :
      this._higiene   < 20 ? 'sucio'   :
      (this._salud < 25 || this._felicidad < 25) ? 'triste' :
      this._felicidad > 70 ? 'feliz' : 'normal';
    const arr = this._frases[key] || this._frases.normal;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /* ================================================================
     TICK — Degradación más rápida cuando stats están bajas.
     NO muere mientras está en estado Jugando (mini-juego).
     Energía se consume siempre que esté jugando.
  ================================================================ */
  tickNecesidades() {
    if (!this._vivo) return;

    /* Consumo continuo mientras juega: se CANSA y se ENSUCIA jugando */
    if (this._estado instanceof Jugando) {
      this._energia = Math.max(this._energia - 0.20, 0); // se cansa más rápido al jugar
      this._hambre  = Math.max(this._hambre  - 0.08, 0);
      this._higiene = Math.max(this._higiene - 0.15, 0); // se ensucia mientras juega
      this.actualizarObservadores();
      return; // No afectar salud mientras juega
    }

    if (!(this._estado instanceof Despierto)) return;
    this._edad++;

    /* ── Degradación base — más rápida si stats ya están bajas ── */
    const factor = (v) => v < 30 ? 1.6 : v < 50 ? 1.2 : 1.0; // aceleración en zona baja

    this._hambre    = Math.max(this._hambre    - 0.22 * factor(this._hambre),    0);
    this._energia   = Math.max(this._energia   - 0.16 * factor(this._energia),   0);
    this._felicidad = Math.max(this._felicidad - 0.18 * factor(this._felicidad), 0);
    this._higiene   = Math.max(this._higiene   - 0.11 * factor(this._higiene),   0);

    /* ── Penalizaciones cruzadas ── */
    let danoSalud = 0;

    if (this._hambre < 10) {
      danoSalud += 0.35;
      this._energia = Math.max(this._energia - 0.15, 0);
    } else if (this._hambre < 30) danoSalud += 0.12;

    if (this._energia < 10)      danoSalud += 0.22;
    else if (this._energia < 30) danoSalud += 0.08;

    if (this._felicidad < 10)      danoSalud += 0.18;
    else if (this._felicidad < 30) danoSalud += 0.06;

    if (this._higiene < 8)        danoSalud += 0.18;
    else if (this._higiene < 20)  danoSalud += 0.06;

    /* Recuperación lenta si todo bien */
    const todosBien = this._hambre > 55 && this._energia > 55 &&
                      this._felicidad > 55 && this._higiene > 55;
    if (todosBien && this._salud < 100) this._salud = Math.min(this._salud + 0.04, 100);

    this._salud = Math.max(this._salud - danoSalud, 0);

    /* ── Muerte ── */
    if (this._salud <= 0) {
      this._vivo = false;
      this._energia = this._higiene = this._felicidad = this._hambre = 0;
      this.actualizarObservadores();
      UIManager.getInstance().mostrarMuerte();
      return;
    }

    /* ── Expresión visual (sin acciones auto) ── */
    const ui  = UIManager.getInstance();
    const act = ui._estadoActual;
    const bajas     = [this._salud, this._energia, this._felicidad, this._hambre].filter(v => v < 40).length;

    if      (this._salud     < 20 && act !== 'triste')  ui.mostrarAnimacion('triste');
    else if (this._energia   < 20 && act !== 'cansado') ui.mostrarAnimacion('cansado');
    else if (this._hambre    < 20 && act !== 'hambre')  ui.mostrarAnimacion('hambre');
    else if (this._felicidad < 50 && act !== 'triste')  ui.mostrarAnimacion('triste');
    else if (this._higiene   < 15 && act !== 'normal')  ui.mostrarAnimacion('normal');
    else if (bajas >= 2 && !['triste','cansado','hambre'].includes(act)) ui.mostrarAnimacion('triste');
    else if (
      this._salud > 65 && this._hambre > 55 && this._energia > 55 &&
      this._felicidad > 65 && !['feliz','idle','caminando'].includes(act)
    ) ui.mostrarAnimacion('feliz');

    this.actualizarObservadores();
  }

  /*
    Aplica resultado al TERMINAR el juego.
    Pero la energía se fue consumiendo DURANTE el juego vía tickNecesidades.
  */
  aplicarResultadoJuego(score, diamonds) {
    /* Felicidad sube DESPACIO: bono moderado por jugar */
    const bonusFelicidad = 6 + Math.min(10, Math.floor(score / 500) * 2);

    this.setFelicidad(this.satisfacer(this._felicidad, bonusFelicidad));

    /* Gasto adicional al terminar: jugar CANSA y ENSUCIA */
    this.setEnergia(this.insatisfacer(this._energia, 18));
    this.setHambre(this.insatisfacer(this._hambre, 12));
    this.setHigiene(this.insatisfacer(this._higiene, 15));

    if (this._energia < 30 && this._hambre < 30) {
      this.setSalud(this.insatisfacer(this._salud, 4));
    }

    this.actualizarObservadores();
  }

  renacer() {
    this._salud = this._energia = this._felicidad = this._hambre = this._higiene = 100;
    this._vivo  = true;
    this._estado = new Despierto();
    this._estado.setMascota(this);
    SoundManager.getInstance().detenerLoopMascota();
    this.actualizarObservadores();
  }
}
