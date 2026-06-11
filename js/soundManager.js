'use strict';
/* ================================================================
   soundManager.js — Singleton + Proxy (AudioPool)  v5.6
   ----------------------------------------------------------------
   AUDIO INTRO — estrategia definitiva cross-device:

   Regla de los navegadores:
     • ctx.resume() SOLO funciona dentro de un user-gesture handler.
     • Llamarlo fuera de un gesto (ej: en fetch.then) falla en mobile.

   Flujo correcto:
   1. fetch() del mp3 al cargar la página → ArrayBuffer en memoria.
   2. AudioContext creado SUSPENDIDO (sin resume, sin play).
   3. En el PRIMER GESTO (touchstart/mousedown/keydown capturado en
      main.js con capture:true) → desbloquearAudio():
        a. ctx.resume()  ← dentro del handler del gesto ✓
        b. Si buffer listo → reproduce inmediatamente.
        c. Si buffer aún cargando → _pendPlay=true, reproduce
           cuando el fetch termine.
   4. reproducirIntroAsync() solo marca _pendPlay=true y lanza
      el fetch si no estaba iniciado. NO llama resume() nunca.
================================================================ */

class AudioPool {
  constructor(src, volume = 0.7, poolSize = 4) {
    this._pool = Array.from({ length: poolSize }, () => {
      const a = new Audio(src); a.volume = volume; return a;
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

class IntroAudio {
  constructor(src, volume = 0.85) {
    this._src      = src;
    this._volume   = volume;
    this._ctx      = null;
    this._gainNode = null;
    this._buffer   = null;   // AudioBuffer listo para reproducir
    this._source   = null;   // BufferSourceNode activo
    this._loaded   = false;  // fetch + decode completado
    this._pendPlay = false;  // reproducir en cuanto tengamos ctx+buffer
    this._stopped  = false;  // se llamó stop() — no reproducir

    this._initCtx();
    this._fetch();
  }

  /* Crear AudioContext en estado suspendido — NO llamar resume() aquí */
  _initCtx() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this._ctx      = new AC();
      this._gainNode = this._ctx.createGain();
      this._gainNode.gain.value = this._volume;
      this._gainNode.connect(this._ctx.destination);
    } catch(e) {}
  }

  /* Pre-cargar via fetch — no necesita gesto */
  _fetch() {
    if (!this._ctx) return; // sin AudioContext → fallback HTMLAudio en unlock()

    fetch(this._src)
      .then(r => r.arrayBuffer())
      .then(ab => this._ctx.decodeAudioData(ab))
      .then(decoded => {
        this._buffer = decoded;
        this._loaded = true;
        /* Si ya tenemos el gesto y estaba pendiente, reproducir AHORA */
        if (this._pendPlay && !this._stopped && this._ctx.state === 'running') {
          this._pendPlay = false;
          this._playBuffer();
        }
      })
      .catch(() => {
        /* fetch/decode falló → usar HTMLAudio como respaldo */
        this._loaded = true; // marcar para que unlock() use fallback
      });
  }

  /* ── LLAMAR SOLO DENTRO DE UN USER-GESTURE HANDLER ──
     ctx.resume() es sincrónico-en-gesto en Chrome/Safari mobile.     */
  unlock() {
    if (!this._ctx) {
      /* Sin AudioContext: intentar HTMLAudio directo (iOS antiguo, etc.) */
      if (this._pendPlay && !this._stopped) {
        this._pendPlay = false;
        const a = new Audio(this._src);
        a.volume = this._volume;
        a.play().catch(() => {});
      }
      return Promise.resolve();
    }

    if (this._ctx.state === 'suspended') {
      return this._ctx.resume().then(() => {
        if (this._pendPlay && !this._stopped) {
          this._pendPlay = false;
          if (this._loaded && this._buffer) {
            this._playBuffer();
          } else if (this._loaded && !this._buffer) {
            /* fetch/decode falló → HTMLAudio */
            const a = new Audio(this._src);
            a.volume = this._volume;
            a.play().catch(() => {});
          }
          /* Si !this._loaded: el fetch sigue en curso,
             _playBuffer() se llamará cuando termine (_fetch → then). */
        }
      }).catch(() => {});
    }

    /* ctx ya running (desktop sin bloqueo) */
    if (this._pendPlay && !this._stopped && this._loaded && this._buffer) {
      this._pendPlay = false;
      this._playBuffer();
    }
    return Promise.resolve();
  }

  /* Solicitar reproducción — NO llama resume() */
  play() {
    this._stopped  = false;
    this._pendPlay = true; // siempre marcar pendiente

    /* Si el ctx ya está running Y el buffer está listo → reproducir ya */
    if (this._ctx && this._ctx.state === 'running' && this._loaded && this._buffer) {
      this._pendPlay = false;
      this._playBuffer();
    }
    /* En cualquier otro caso: esperar unlock() */
    return Promise.resolve(this._pendPlay === false);
  }

  _playBuffer() {
    if (!this._ctx || !this._buffer) return;
    if (this._source) {
      try { this._source.stop(); } catch(e) {}
      this._source.disconnect();
      this._source = null;
    }
    const src = this._ctx.createBufferSource();
    src.buffer = this._buffer;
    src.connect(this._gainNode);
    src.onended = () => { this._source = null; };
    src.start(0);
    this._source = src;
  }

  stop() {
    this._stopped  = true;
    this._pendPlay = false;
    if (this._source) {
      try { this._source.stop(); } catch(e) {}
      this._source = null;
    }
  }
}

/* ════════════════════════════════════════════════════
   SoundManager — Singleton
════════════════════════════════════════════════════ */
class SoundManager {
  constructor() {
    this._muted       = false;
    this._fondoActivo = false;

    this._introAudio  = new IntroAudio('audio/audio_intro.mp3', 0.85);

    this._botonesPool = new AudioPool('audio/audio_botones.mp3',  0.7,  4);
    this._saltoPool   = new AudioPool('audio/audio_salto.mp3',    0.75, 6);
    this._danoPool    = new AudioPool('audio/audio_dano.mp3',     0.8,  4);
    this._diamPool    = new AudioPool('audio/audio_diamante.mp3', 0.7,  6);
    this._mascotaPool = new AudioPool('audio/audio_mascota.mp3',  0.75, 4);

    this._fondoNode = new Audio('audio/audio_fondo.mp3');
    this._fondoNode.loop   = true;
    this._fondoNode.volume = 0.45;

    this._mascotaLoopTimer  = null;
    this._mascotaLoopActivo = false;

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this._pausarTodo();
      else this._reanudar();
    });
  }

  static getInstance() {
    if (!SoundManager._instance) SoundManager._instance = new SoundManager();
    return SoundManager._instance;
  }

  /* Llamar dentro de un user-gesture handler */
  desbloquearAudio() {
    return this._introAudio.unlock();
  }

  _pausarTodo() {
    this._introAudio.stop();
    this._fondoNode.pause();
    this._mascotaPool.pause();
    this._detenerLoopMascota();
  }

  _reanudar() {
    if (this._fondoActivo && !this._muted) {
      this._fondoNode.play().catch(() => {});
    }
  }

  reproducirIntro() {
    if (this._muted) return;
    this._introAudio.stop();
    this._introAudio.play();
  }

  reproducirIntroAsync() {
    if (this._muted) return Promise.resolve(true);
    this._introAudio.stop();
    return Promise.resolve(this._introAudio.play());
  }

  detenerIntro() { this._introAudio.stop(); }

  iniciarFondo() {
    if (this._muted || this._fondoActivo) return;
    this._fondoNode.currentTime = 0;
    this._fondoNode.play().then(() => { this._fondoActivo = true; }).catch(() => {});
  }
  reiniciarFondo() {
    this._fondoNode.pause();
    this._fondoActivo = false;
    if (!this._muted) {
      this._fondoNode.currentTime = 0;
      this._fondoNode.play().then(() => { this._fondoActivo = true; }).catch(() => {});
    }
  }
  detenerFondo() {
    this._fondoNode.pause();
    this._fondoNode.currentTime = 0;
    this._fondoActivo = false;
  }

  reproducirClick()    { if (!this._muted) this._botonesPool.play(); }
  reproducirSalto()    { if (!this._muted) this._saltoPool.play(); }
  reproducirDanio()    { if (!this._muted) this._danoPool.play(); }
  reproducirDiamante() { if (!this._muted) this._diamPool.play(); }

  reproducirMascota(veces = 2) {
    if (this._muted) return;
    let count = 0;
    const tocar = () => {
      if (count >= veces) return;
      this._mascotaPool.play(); count++;
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
    if (this._muted) { this._pausarTodo(); this._mascotaPool.pause(); }
    else if (this._fondoActivo) { this._fondoNode.play().catch(() => {}); }
    return this._muted;
  }
  isMuted() { return this._muted; }
}
