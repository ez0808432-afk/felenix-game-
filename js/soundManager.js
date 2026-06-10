'use strict';
/* ================================================================
   soundManager.js — Patrón SINGLETON + PROXY (AudioPool)
   Correcciones v5.2:
   - Intro: se reproduce exactamente al primer gesto del usuario
   - Audio mascota: suena 2 veces al cambiar estado, y en loop suave
     mientras hambre < 50 (hasta que se alimente al 50%)
   - Pausa todos los audios al ocultar página (visibilitychange)
   - Reanuda fondo al volver a la página
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

class SoundManager {
  constructor() {
    this._muted       = false;
    this._fondoActivo = false;
    this._fondoPantalla = ''; // qué pantalla activó el fondo

    /* ── Pools de audio (todos desde /audio/) ── */
    this._introPool   = new AudioPool('audio/audio_intro.mp3',    0.85, 1);
    this._botonesPool = new AudioPool('audio/audio_botones.mp3',  0.7,  4);
    this._saltoPool   = new AudioPool('audio/audio_salto.mp3',    0.75, 6);
    this._danoPool    = new AudioPool('audio/audio_dano.mp3',     0.8,  4);
    this._diamPool    = new AudioPool('audio/audio_diamante.mp3', 0.7,  6);
    this._mascotaPool = new AudioPool('audio/audio_mascota.mp3',  0.75, 4);

    this._fondoNode = new Audio('audio/audio_fondo.mp3');
    this._fondoNode.loop   = true;
    this._fondoNode.volume = 0.45;

    /* Sonido mascota en loop mientras hambre < 50 */
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

  /* ── Pausa TODOS los audios (visibilitychange / salir) ── */
  _pausarTodo() {
    this._introPool.pause();
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

  /* ────────────────────────────────────────────
     INTRO — se llama DESPUÉS del primer gesto
     del usuario para cumplir política de autoplay
  ──────────────────────────────────────────── */
  reproducirIntro() {
    if (this._muted) return;
    this._introPool.pause(); // resetear si estaba en otro state
    this._introPool.play();
  }

  /* Intenta reproducir la intro de inmediato.
     Devuelve Promise<boolean>: true si el navegador lo permitió. */
  reproducirIntroAsync() {
    if (this._muted) return Promise.resolve(true);
    this._introPool.pause();
    const node = this._introPool._pool[0];
    node.currentTime = 0;
    return node.play().then(() => true).catch(() => false);
  }
  detenerIntro() { this._introPool.pause(); }

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
     MASCOTA — suena 2 veces al cambiar estado
     Loop mientras hambre < 50
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
