'use strict';
/* ================================================================
   introController.js — Singleton  v5.7
   
   Flujo:
   1. iniciar() → muestra screenIntro con la PUERTA visible.
      Video, audio y textos están ocultos.
   2. El usuario toca/clica el botón "TOCA PARA EMPEZAR".
      → Este es el gesto garantizado que desbloquea el AudioContext.
   3. _lanzarIntro():
      → desbloquearAudio() dentro del handler del gesto ✓
      → reproducirIntroAsync() → suena ya sin bloqueo
      → video.play() 
      → muestra partículas, textos, botón saltar
      → lanza la secuencia de typewriter
================================================================ */
class IntroController {
  constructor() {
    this._skip          = false;
    this._partInterval  = null;
    this._flamaInterval = null;
  }

  static getInstance() {
    if (!IntroController._instance) IntroController._instance = new IntroController();
    return IntroController._instance;
  }

  iniciar() {
    UIManager.getInstance().mostrarPantalla('screenIntro');
    this._skip = false;

    /* Asegurar que la puerta esté visible y el resto oculto */
    const puerta = document.getElementById('introPuerta');
    if (puerta) puerta.style.display = 'flex';

    const btn = document.getElementById('btnEmpezar');
    if (btn) {
      /* Reemplazar el nodo para quitar listeners anteriores */
      const nuevoBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(nuevoBtn, btn);
      nuevoBtn.addEventListener('click', () => this._lanzarIntro(), { once: true });
    }
  }

  /* Llamado DENTRO del click del botón — gesto garantizado */
  _lanzarIntro() {
    /* 1. Ocultar puerta */
    const puerta = document.getElementById('introPuerta');
    if (puerta) puerta.style.display = 'none';

    /* 2. DESBLOQUEAR AUDIO — dentro del handler del gesto ✓ */
    SoundManager.getInstance().desbloquearAudio();

    /* 3. Reproducir audio intro — ctx ya running, suena de inmediato */
    SoundManager.getInstance().reproducirIntroAsync();

    /* 4. Mostrar y reproducir video */
    const video = document.getElementById('introVideo');
    if (video) {
      video.style.display = 'block';
      video.currentTime = 0;
      video.play().catch(() => {});
    }

    /* 5. Mostrar overlay, partículas, textos, botón saltar */
    const ids = ['introOverlay','introParticles','huevoWrap','introTextos','btnSkipIntro'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = '';
    });

    /* 6. Partículas y secuencia */
    this._generarParticulas();

    document.getElementById('btnSkipIntro')
      ?.addEventListener('click', () => this._saltar(), { once: true });

    this._secuencia();
  }

  _saltar() {
    if (this._skip) return;
    this._skip = true;
    this._limpiar();
    SoundManager.getInstance().detenerIntro();
    const video = document.getElementById('introVideo');
    if (video) { video.pause(); video.style.display = 'none'; }
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
      { id:'intro-cta',       texto:' 🐦‍🔥 ' },
    ];
    let delay = 300;
    for (const t of textos) { t.delay = delay; delay += t.texto.length * CHAR_MS + 200; }

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
    const ex = document.getElementById('introExplosion'); if (!ex) return;
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
      const c = setInterval(() => { if (this._skip) { clearTimeout(t); clearInterval(c); res(); } }, 50);
      setTimeout(() => clearInterval(c), ms + 100);
    });
  }
}
