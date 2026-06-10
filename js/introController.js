'use strict';
/* ================================================================
   introController.js — Singleton
   Corrección: el audio se reproduce exactamente cuando el usuario
   hace el PRIMER gesto (clic en skip o en la pantalla).
   El video NO tiene autoplay de audio — el audio se inicia
   manualmente en el primer evento pointer/touch/click.
================================================================ */
class IntroController {
  constructor() {
    this._skip       = false;
    this._partInterval = null;
    this._audioIniciado = false;
  }

  static getInstance() {
    if (!IntroController._instance) IntroController._instance = new IntroController();
    return IntroController._instance;
  }

  iniciar() {
    UIManager.getInstance().mostrarPantalla('screenIntro');
    this._skip = false;
    this._audioIniciado = false;

    const video = document.getElementById('introVideo');
    if (video) {
      video.loop  = false;
      video.muted = true;
      video.currentTime = 0;

      /* Intentar reproducir el video inmediatamente (muted = permitido) */
      const playPromise = video.play();
      if (playPromise) {
        playPromise.catch(() => {
          /* En algunos navegadores móviles necesitamos esperar interacción */
          const startOnTouch = () => {
            video.play().catch(() => {});
            document.removeEventListener('pointerdown', startOnTouch);
          };
          document.addEventListener('pointerdown', startOnTouch, { once: true });
        });
      }

      /* Al terminar el video: queda congelado en último frame */
      video.addEventListener('ended', () => { /* sin acción */ }, { once: true });
    }

    this._generarParticulas();

    /* ── AUDIO DE INTRO: suena APENAS se entra a la página, junto al video.
       Se intenta reproducir de inmediato. Si el navegador bloquea el
       autoplay, se reintenta en el primer gesto del usuario. ── */
    const intentarAudio = () => {
      if (this._audioIniciado || this._skip) return;
      SoundManager.getInstance().reproducirIntroAsync().then(ok => {
        if (ok) this._audioIniciado = true;
      });
    };

    /* Intento INMEDIATO (sin retraso) — sincronizado con el video */
    intentarAudio();

    /* Respaldo: si el autoplay fue bloqueado, sonará al primer gesto */
    document.addEventListener('pointerdown', intentarAudio, { once: true });
    document.addEventListener('keydown',     intentarAudio, { once: true });

    document.getElementById('btnSkipIntro')
      ?.addEventListener('click', () => this._saltar(), { once: true });
    document.getElementById('screenIntro')
      ?.addEventListener('click', () => this._saltar(), { once: true });

    this._secuencia();
  }

  _saltar() {
    if (this._skip) return;
    this._skip = true;
    this._limpiar();
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

  /* Solo la FLAMA — sin huevo, sin grieta */
  _animarFlama() {
    const ex = document.getElementById('introExplosion');
    if (!ex) return;
    ex.style.transition = 'all .8s cubic-bezier(.17,.67,.35,1.5)';
    ex.style.opacity    = '1';
    ex.style.transform  = 'scale(1.6)';
    ex.style.fontSize   = '90px';
    /* Pulso suave continuo */
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
      const c = setInterval(() => { if (this._skip) { clearTimeout(t); clearInterval(c); res(); } }, 50);
      setTimeout(() => clearInterval(c), ms + 100);
    });
  }
}
