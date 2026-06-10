'use strict';
/* ================================================================
   soundManager.js — Singleton + Proxy (AudioPool)
   v5.4 — Audio intro 100% compatible web (Vercel/GitHub Pages):

   ESTRATEGIA AUDIO INTRO:
   Los navegadores modernos bloquean todo audio hasta el primer
   gesto del usuario (click/touch/key). Esto afecta tanto a
   HTMLAudio como a AudioContext en carga inicial.

   Solución implementada:
   1. Se pre-carga el buffer del audio intro via fetch() desde
      el inicio (no necesita gesto, solo red).
   2. Se crea un AudioContext SUSPENDIDO al inicio.
   3. Al primer gesto del usuario (touchstart/click/keydown),
      se llama a ctx.resume() y se inicia la reproducción.
   4. Si el gesto ocurre ANTES de que cargue el fetch, se
      marca como pendiente y reproduce cuando termina la carga.
   5. Fallback a HTMLAudio si AudioContext no está disponible.

   Los demás audios usan HTMLAudio pools (funcionan tras 1er gesto).
================================================================ */

/* ── AudioPool: pool de HTMLAudio para sonidos cortos/frecuentes ── */
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

/* ── IntroAudio: reproduce audio largo con AudioContext ── */
class IntroAudio {
  constructor(src, volume = 0.85) {
    this._src      = src;
    this._volume   = volume;
    this._buffer   = null;      // AudioBuffer decodificado
    this._rawAB    = null;      // ArrayBuffer crudo (antes de decodificar)
    this._ctx      = null;      // AudioContext
    this._source   = null;      // BufferSourceNode activo
    this._gainNode = null;
    this._playing  = false;
    this._loaded   = false;     // fetch+decode completado
    this._pendPlay = false;     // reproducir cuando ctx.resume() esté listo
    this._useFallback = false;  // usar HTMLAudio si no hay AudioContext
    this._fallback = null;

    this._initContext();
    this._preload();
  }

  /* Crear AudioContext suspendido (no requiere gesto) */
  _initContext() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this._useFallback = true; return; }
    try {
      this._ctx = new AC();
      // Crear gain node persistente
      this._gainNode = this._ctx.createGain();
      this._gainNode.gain.value = this._volume;
      this._gainNode.connect(this._ctx.destination);
    } catch(e) {
      this._useFallback = true;
    }
  }

  /* Pre-cargar el audio via fetch (no requiere gesto) */
  _preload() {
    if (this._useFallback) {
      this._fallback = new Audio(this._src);
      this._fallback.volume = this._volume;
      this._loaded = true;
      return;
    }

    fetch(this._src)
      .then(r => {
        if (!r.ok) throw new Error('fetch failed');
        return r.arrayBuffer();
      })
      .then(ab => {
        this._rawAB = ab;
        // Intentar decodificar si el contexto ya está disponible
        return this._ctx.decodeAudioData(ab.slice(0));
      })
      .then(decoded => {
        this._buffer = decoded;
        this._rawAB  = null;
        this._loaded = true;
        // Si había una reproducción pendiente, ejecutarla ahora
        if (this._pendPlay) {
          this._pendPlay = false;
          this._playBuffer();
        }
      })
      .catch(() => {
        // Fallback a HTMLAudio si algo falla
        this._useFallback = true;
        this._fallback = new Audio(this._src);
        this._fallback.volume = this._volume;
        this._loaded = true;
        if (this._pendPlay) {
          this._pendPlay = false;
          this._fallback.play().catch(() => {});
        }
      });
  }

  /* Reanudar el AudioContext (llamar en el primer gesto del usuario) */
  unlock() {
    if (this._useFallback || !this._ctx) return Promise.resolve();
    if (this._ctx.state === 'running') {
      if (this._pendPlay && this._loaded) {
        this._pendPlay = false;
        this._playBuffer();
      }
      return Promise.resolve();
    }
    return this._ctx.resume().then(() => {
      if (this._pendPlay && this._loaded) {
        this._pendPlay = false;
        this._playBuffer();
      }
    }).catch(() => {});
  }

  /* Intentar reproducir. Devuelve Promise<boolean> — true si sonó. */
  play() {
    if (this._useFallback) {
      if (!this._fallback) {
        this._fallback = new Audio(this._src);
        this._fallback.volume = this._volume;
      }
      this._fallback.currentTime = 0;
      return this._fallback.play()
        .then(() => { this._playing = true; return true; })
        .catch(() => false);
    }

    if (!this._ctx) return Promise.resolve(false);

    // Si el buffer aún no cargó, marcar pendiente
    if (!this._loaded) {
      this._pendPlay = true;
      // Intentar desbloquear el contexto de todos modos
      if (this._ctx.state === 'suspended') this._ctx.resume().catch(() => {});
      return Promise.resolve(false);
    }

    // Si el contexto está suspendido, reanudarlo y reproducir
    if (this._ctx.state === 'suspended') {
      this._pendPlay = true;
      return this._ctx.resume()
        .then(() => {
          if (this._pendPlay) {
            this._pendPlay = false;
            this._playBuffer();
          }
          return true;
        })
        .catch(() => false);
    }

    this._playBuffer();
    return Promise.resolve(true);
  }

  _playBuffer() {
    if (!this._ctx || !this._buffer) return;
    // Parar fuente anterior
    if (this._source) {
      try { this._source.stop(); } catch(e) {}
      this._source.disconnect();
      this._source = null;
    }
    const src = this._ctx.createBufferSource();
    src.buffer = this._buffer;
    src.connect(this._gainNode);
    src.onended = () => { this._playing = false; this._source = null; };
    src.start(0);
    this._source  = src;
    this._playing = true;
  }

  stop() {
    this._pendPlay = false;
    this._playing  = false;
    if (this._source) {
      try { this._source.stop(); } catch(e) {}
      this._source = null;
    }
    if (this._fallback) {
      this._fallback.pause();
      this._fallback.currentTime = 0;
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

    /* Intro usa AudioContext para compatibilidad cross-device */
    this._introAudio = new IntroAudio('audio/audio_intro.mp3', 0.85);

    /* El resto usa pools HTMLAudio */
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

  /* ── Llamar en el primer gesto (desbloquea AudioContext) ── */
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

  /* INTRO */
  reproducirIntro() {
    if (this._muted) return;
    this._introAudio.stop();
    this._introAudio.play();
  }

  reproducirIntroAsync() {
    if (this._muted) return Promise.resolve(true);
    this._introAudio.stop();
    return this._introAudio.play();
  }

  detenerIntro() { this._introAudio.stop(); }

  /* FONDO */
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

  /* EFECTOS */
  reproducirClick()    { if (!this._muted) this._botonesPool.play(); }
  reproducirSalto()    { if (!this._muted) this._saltoPool.play(); }
  reproducirDanio()    { if (!this._muted) this._danoPool.play(); }
  reproducirDiamante() { if (!this._muted) this._diamPool.play(); }

  /* MASCOTA */
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
