'use strict';
/* ================================================================
   soundManager.js — Patrón SINGLETON + PROXY (AudioPool)
   v5.3 — Audio intro robusto cross-device:
   - Usa AudioContext + fetch/decodeAudioData para la intro
   - Fallback a HTMLAudio si AudioContext no está disponible
   - Compatible con políticas de autoplay en Chrome/Safari/FF mobile
   - Todos los demás audios mantienen comportamiento original
================================================================ */

class AudioPool {
  constructor(src, volume = 0.7, poolSize = 4) {
    this._pool = Array.from({ length: poolSize }, () => {
      const a = new Audio(src);
      a.volume = volume;
      return a;
    });
    this._idx = 0;
  }
  play() {
    const node = this._pool[this._idx];
    this._idx = (this._idx + 1) % this._pool.length;
    node.currentTime = 0;
    return node.play().catch(() => {});
  }
  pause() { this._pool.forEach(a => { try { a.pause(); a.currentTime = 0; } catch(e){} }); }
  setVolume(v) { this._pool.forEach(a => a.volume = v); }
}

/* ----------------------------------------------------------------
   IntroAudio — maneja el audio de intro con AudioContext para
   máxima compatibilidad en web (desktop + mobile).
   Flujo:
   1. Al crear la instancia, pre-carga el buffer vía fetch.
   2. reproducir() crea/reanuda el AudioContext y conecta el buffer.
   3. Si el fetch aún no terminó, espera y reproduce cuando termine.
   4. Si el navegador bloquea el AudioContext hasta gesto, se retoma
      en el primer pointerdown/touchstart/click.
---------------------------------------------------------------- */
class IntroAudio {
  constructor(src, volume = 0.85) {
    this._src     = src;
    this._volume  = volume;
    this._ctx     = null;
    this._buffer  = null;
    this._source  = null;
    this._playing = false;
    this._cargado = false;
    this._pendiente = false; // reproducir en cuanto tengamos buffer + gesto

    this._precargar();
  }

  _crearContexto() {
    if (this._ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this._ctx = new AC();
  }

  _precargar() {
    fetch(this._src)
      .then(r => r.arrayBuffer())
      .then(buf => {
        // Necesitamos un contexto para decodificar
        this._crearContexto();
        if (!this._ctx) {
          // Guardar raw buffer para decodificar más tarde
          this._rawBuffer = buf;
          this._cargado = false;
          return;
        }
        return this._ctx.decodeAudioData(buf);
      })
      .then(decoded => {
        if (!decoded) return;
        this._buffer  = decoded;
        this._cargado = true;
        if (this._pendiente) {
          this._pendiente = false;
          this._reproducirBuffer();
        }
      })
      .catch(() => {
        // Fallback: usar HTMLAudio si fetch/decode falla
        this._fallbackAudio = new Audio(this._src);
        this._fallbackAudio.volume = this._volume;
        this._cargado = true;
        if (this._pendiente) {
          this._pendiente = false;
          this._fallbackAudio.play().catch(() => {});
        }
      });
  }

  _decodificarConContexto() {
    if (!this._rawBuffer || !this._ctx) return Promise.resolve();
    return this._ctx.decodeAudioData(this._rawBuffer).then(decoded => {
      this._buffer  = decoded;
      this._rawBuffer = null;
      this._cargado = true;
    }).catch(() => {});
  }

  _reproducirBuffer() {
    if (!this._ctx || !this._buffer) {
      if (this._fallbackAudio) {
        this._fallbackAudio.currentTime = 0;
        this._fallbackAudio.play().catch(() => {});
        this._playing = true;
      }
      return;
    }

    // Reutilizar o crear contexto
    if (this._ctx.state === 'suspended') {
      this._ctx.resume().then(() => this._reproducirBuffer());
      return;
    }

    // Detener fuente anterior si existe
    if (this._source) {
      try { this._source.stop(); } catch(e) {}
      this._source = null;
    }

    const gainNode = this._ctx.createGain();
    gainNode.gain.value = this._volume;
    gainNode.connect(this._ctx.destination);

    this._source = this._ctx.createBufferSource();
    this._source.buffer = this._buffer;
    this._source.connect(gainNode);
    this._source.onended = () => { this._playing = false; };
    this._source.start(0);
    this._playing = true;
  }

  /* Intenta reproducir inmediatamente. Devuelve Promise<boolean>. */
  reproducirAsync() {
    return new Promise(resolve => {
      this._crearContexto();

      // Si no hay contexto disponible (browser muy antiguo), usar HTMLAudio
      if (!this._ctx) {
        if (!this._fallbackAudio) {
          this._fallbackAudio = new Audio(this._src);
          this._fallbackAudio.volume = this._volume;
        }
        this._fallbackAudio.currentTime = 0;
        this._fallbackAudio.play()
          .then(() => { this._playing = true; resolve(true); })
          .catch(() => resolve(false));
        return;
      }

      // Si hay rawBuffer pendiente de decodificar, decodificar ahora
      const decodificar = this._rawBuffer
        ? this._decodificarConContexto()
        : Promise.resolve();

      decodificar.then(() => {
        const intentar = () => {
          if (this._ctx.state === 'suspended') {
            this._ctx.resume()
              .then(() => {
                if (this._cargado) {
                  this._reproducirBuffer();
                  resolve(true);
                } else {
                  this._pendiente = true;
                  resolve(false);
                }
              })
              .catch(() => resolve(false));
          } else if (this._cargado) {
            this._reproducirBuffer();
            resolve(true);
          } else {
            // Buffer aún cargando — marcar pendiente
            this._pendiente = true;
            resolve(false);
          }
        };
        intentar();
      });
    });
  }

  detener() {
    this._pendiente = false;
    this._playing   = false;
    if (this._source) {
      try { this._source.stop(); } catch(e) {}
      this._source = null;
    }
    if (this._fallbackAudio) {
      this._fallbackAudio.pause();
      this._fallbackAudio.currentTime = 0;
    }
  }

  reanudarContexto() {
    if (this._ctx && this._ctx.state === 'suspended') {
      this._ctx.resume().then(() => {
        if (this._pendiente && this._cargado) {
          this._pendiente = false;
          this._reproducirBuffer();
        }
      }).catch(() => {});
    }
  }
}

class SoundManager {
  constructor() {
    this._muted       = false;
    this._fondoActivo = false;

    /* ── Audio intro — usa IntroAudio (AudioContext) ── */
    this._introAudio  = new IntroAudio('audio/audio_intro.mp3', 0.85);

    /* ── Pools de audio para el resto ── */
    this._botonesPool = new AudioPool('audio/audio_botones.mp3',  0.7,  4);
    this._saltoPool   = new AudioPool('audio/audio_salto.mp3',    0.75, 6);
    this._danoPool    = new AudioPool('audio/audio_dano.mp3',     0.8,  4);
    this._diamPool    = new AudioPool('audio/audio_diamante.mp3', 0.7,  6);
    this._mascotaPool = new AudioPool('audio/audio_mascota.mp3',  0.75, 4);

    this._fondoNode = new Audio('audio/audio_fondo.mp3');
    this._fondoNode.loop   = true;
    this._fondoNode.volume = 0.45;

    /* Sonido mascota en loop */
    this._mascotaLoopTimer  = null;
    this._mascotaLoopActivo = false;

    /* Pausa/reanuda al ocultar/mostrar la página */
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this._pausarTodo();
      } else {
        this._reanudar();
      }
    });
  }

  static getInstance() {
    if (!SoundManager._instance) SoundManager._instance = new SoundManager();
    return SoundManager._instance;
  }

  /* ── Pausa TODOS los audios ── */
  _pausarTodo() {
    this._introAudio.detener();
    this._fondoNode.pause();
    this._mascotaPool.pause();
    this._detenerLoopMascota();
  }

  /* ── Reanuda solo el fondo si estaba activo ── */
  _reanudar() {
    if (this._fondoActivo && !this._muted) {
      this._fondoNode.play().catch(() => {});
    }
  }

  /* ── Llamar en el primer gesto del usuario para desbloquear AudioContext ── */
  desbloquearAudio() {
    this._introAudio.reanudarContexto();
  }

  /* ────────────────────────────────────────────
     INTRO
  ──────────────────────────────────────────── */
  reproducirIntro() {
    if (this._muted) return;
    this._introAudio.detener();
    this._introAudio.reproducirAsync();
  }

  reproducirIntroAsync() {
    if (this._muted) return Promise.resolve(true);
    this._introAudio.detener();
    return this._introAudio.reproducirAsync();
  }

  detenerIntro() { this._introAudio.detener(); }

  /* ────────────────────────────────────────────
     FONDO mini-juego
  ──────────────────────────────────────────── */
  iniciarFondo() {
    if (this._muted || this._fondoActivo) return;
    this._fondoNode.currentTime = 0;
    this._fondoNode.play()
      .then(() => { this._fondoActivo = true; })
      .catch(() => {});
  }
  reiniciarFondo() {
    this._fondoNode.pause();
    this._fondoActivo = false;
    if (!this._muted) {
      this._fondoNode.currentTime = 0;
      this._fondoNode.play()
        .then(() => { this._fondoActivo = true; })
        .catch(() => {});
    }
  }
  detenerFondo() {
    this._fondoNode.pause();
    this._fondoNode.currentTime = 0;
    this._fondoActivo = false;
  }

  /* ────────────────────────────────────────────
     BOTONES / SALTO / DAÑO / DIAMANTE
  ──────────────────────────────────────────── */
  reproducirClick()    { if (!this._muted) this._botonesPool.play(); }
  reproducirSalto()    { if (!this._muted) this._saltoPool.play(); }
  reproducirDanio()    { if (!this._muted) this._danoPool.play(); }
  reproducirDiamante() { if (!this._muted) this._diamPool.play(); }

  /* ────────────────────────────────────────────
     MASCOTA
  ──────────────────────────────────────────── */
  reproducirMascota(veces = 2) {
    if (this._muted) return;
    let count = 0;
    const tocar = () => {
      if (count >= veces) return;
      this._mascotaPool.play();
      count++;
      if (count < veces) setTimeout(tocar, 1800);
    };
    tocar();
  }

  iniciarLoopMascota() {
    if (this._mascotaLoopActivo || this._muted) return;
    this._mascotaLoopActivo = true;
    const ciclo = () => {
      if (!this._mascotaLoopActivo || this._muted) return;
      this._mascotaPool.play();
      this._mascotaLoopTimer = setTimeout(ciclo, 8000);
    };
    ciclo();
  }

  detenerLoopMascota() { this._detenerLoopMascota(); }
  _detenerLoopMascota() {
    this._mascotaLoopActivo = false;
    if (this._mascotaLoopTimer) { clearTimeout(this._mascotaLoopTimer); this._mascotaLoopTimer = null; }
  }

  /* ── Estados de la mascota ── */
  reproducirEstado(nombre) {
    if (['Comiendo','Bañando','Durmiendo'].includes(nombre)) {
      if (!this._muted) this._botonesPool.play();
    }
  }

  reproducirVictoria() { this.detenerFondo(); if (!this._muted) this._botonesPool.play(); }
  reproducirMuerte()   { if (!this._muted) this._danoPool.play(); }
  reproducirRenacer()  { if (!this._muted) this._botonesPool.play(); }

  toggleMute() {
    this._muted = !this._muted;
    if (this._muted) {
      this._pausarTodo();
      this._mascotaPool.pause();
    } else if (this._fondoActivo) {
      this._fondoNode.play().catch(() => {});
    }
    return this._muted;
  }
  isMuted() { return this._muted; }
}
