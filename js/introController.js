'use strict';
/* ================================================================
   introController.js — Singleton
   v5.4:
   AUDIO INTRO en web (Vercel):
   - El AudioContext está suspendido hasta el primer gesto.
   - Al entrar a la intro se llama reproducirIntroAsync() de
     inmediato: si el ctx está suspendido, IntroAudio marca
     _pendPlay=true y espera a unlock().
   - Se registran touchstart + click + keydown UNA sola vez
     en document. El primero que llegue llama desbloquearAudio()
     que hace ctx.resume() y luego reproduce automáticamente.
   - En desktop (sin bloqueo de autoplay) suena de inmediato.
   - En mobile (iOS/Android) suena al primer toque.
================================================================ */
class IntroController {
  constructor() {
    this._skip          = false;
    this._partInterval  = null;
    this._flamaInterval = null;
    this._audioIniciado = false;
    this._unlockBound   = null; // referencia al listener de desbloqueo
  }

  static getInstance() {
    if (!IntroController._instance) IntroController._instance = new IntroController();
    return IntroController._instance;
  }

  iniciar() {
    UIManager.getInstance().mostrarPantalla('screenIntro');
    this._skip          = false;
    this._audioIniciado = false;

    /* Quitar listener de desbloqueo previo si quedó colgado */
    this._quitarUnlockListener();

    /* ── Video (muted — siempre permitido) ── */
    const video = document.getElementById('introVideo');
    if (video) {
      video.loop        = false;
      video.muted       = true;
      video.currentTime = 0;
      const vp = video.play();
      if (vp) {
        vp.catch(() => {
          document.addEventListener('pointerdown',
            () => video.play().catch(() => {}), { once: true });
        });
      }
    }

    this._generarParticulas();

    /* ── AUDIO INTRO ──
       1. Llamar play() de inmediato — en desktop suena ya.
          En mobile el AudioContext queda en estado "pendiente".
       2. Registrar listener de desbloqueo para el primer gesto. */
    SoundManager.getInstance().reproducirIntroAsync().then(ok => {
      if (ok) this._audioIniciado = true;
    });

    /* Listener de desbloqueo: primer gesto -> ctx.resume() -> suena */
    this._unlockBound = () => {
      if (this._skip) return;
      SoundManager.getInstance().desbloquearAudio().then(() => {
        this._audioIniciado = true;
      });
      this._quitarUnlockListener();
    };
    /* passive:true permite que touchstart no bloquee el scroll */
    document.addEventListener('touchstart', this._unlockBound, { passive: true });
    document.addEventListener('click',      this._unlockBound);
    document.addEventListener('keydown',    this._unlockBound);

    /* Botones de skip */
    document.getElementById('btnSkipIntro')
      ?.addEventListener('click', () => this._saltar(), { once: true });
    document.getElementById('screenIntro')
      ?.addEventListener('click', () => this._saltar(), { once: true });

    this._secuencia();
  }

  _quitarUnlockListener() {
    if (!this._unlockBound) return;
    document.removeEventListener('touchstart', this._unlockBound);
    document.removeEventListener('click',      this._unlockBound);
    document.removeEventListener('keydown',    this._unlockBound);
    this._unlockBound = null;
  }

  _saltar() {
    if (this._skip) return;
    this._skip = true;
    this._limpiar();
    this._quitarUnlockListener();
    SoundManager.getInstance().detenerIntro();
    const video = document.getElementById('introVideo');
    if (video) video.pause();
    AppController.getInstance().mostrarNombre();
  }

  _limpiar() {
    if (this._partInterval)  { clearInterval(this._partInterval);  this._partInterval  = null; }
    if (this._flamaInterval) { clearInterval(this._flamaInterval); this._flamaInterval = null; }
  }

  _generarParticulas() {
    const c = document.getElementById('introParticles'); if (!c) return;
    this._partInterval = setInterval(() => {
      if (this._skip) { clearInterval(this._partInterval); return; }
      const p = document.createElement('div');
      p.className = 'particle';
      const cols = ['#ff6600','#ffaa00','#ff3300','#ffdd00','#ff9900'];
      p.style.cssText =
        `left:${20+Math.random()*60}%;bottom:${8+Math.random()*20}%;`+
        `background:${cols[Math.floor(Math.random()*cols.length)]};`+
        `width:${2+Math.random()*5}px;height:${2+Math.random()*5}px;`+
        `--dx:${(Math.random()-.5)*80}px;`+
        `animation-duration:${1.5+Math.random()*2}s;animation-delay:${Math.random()*.3}s;`;
      c.appendChild(p);
      setTimeout(() => p.remove(), 3500);
    }, 110);
  }

  async _secuencia() {
    const CHAR_MS = 45;
    const textos = [
      { id:'intro-pretitulo', texto:'✦  En el principio, existía el Fuego Eterno  ✦' },
      { id:'intro-titulo',    texto:'DE LAS CENIZAS' },
      { id:'intro-subtitulo', texto:'NACE FELÉNIX — GATO, DRAGÓN Y FÉNIX' },
      { id:'intro-cta',       texto:'[ Toca para comenzar tu aventura ]' },
    ];

    let delay = 300;
    for (const t of textos) {
      t.delay = delay;
      delay += t.texto.length * CHAR_MS + 200;
    }

    textos.forEach(t => {
      setTimeout(() => {
        if (this._skip) return;
        const el = document.getElementById(t.id); if (!el) return;
        el.textContent = ''; el.style.opacity = '1';
        this._typewriter(el, t.texto, CHAR_MS);
      }, t.delay);
    });

    setTimeout(() => { if (!this._skip) this._animarFlama(); }, 800);

    await this._esperar(14000);
    if (!this._skip) this._saltar();
  }

  _typewriter(el, texto, msPerChar) {
    let i = 0;
    const t = setInterval(() => {
      if (this._skip || i >= texto.length) {
        clearInterval(t);
        if (!this._skip) el.textContent = texto;
        return;
      }
      el.textContent += texto[i++];
    }, msPerChar);
  }

  _animarFlama() {
    const ex = document.getElementById('introExplosion');
    if (!ex) return;
    ex.style.transition = 'all .8s cubic-bezier(.17,.67,.35,1.5)';
    ex.style.opacity    = '1';
    ex.style.transform  = 'scale(1.6)';
    ex.style.fontSize   = '90px';
    let grande = true;
    this._flamaInterval = setInterval(() => {
      if (this._skip) { clearInterval(this._flamaInterval); return; }
      ex.style.transform = grande ? 'scale(1.25)' : 'scale(1.6)';
      grande = !grande;
    }, 900);
  }

  _esperar(ms) {
    return new Promise(res => {
      const t = setTimeout(res, ms);
      const c = setInterval(() => {
        if (this._skip) { clearTimeout(t); clearInterval(c); res(); }
      }, 50);
      setTimeout(() => clearInterval(c), ms + 100);
    });
  }
}
