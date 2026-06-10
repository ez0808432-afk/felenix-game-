'use strict';
/* ================================================================
   uiManager.js — Patrón SINGLETON + FACADE
   Correcciones v5.2:
   - Audio mascota: 2 veces al cambiar expresión de estado
   - Loop mascota mientras hambre < 50
   - Triste cuando mayoría de stats bajas (no expresión feliz si stats < 40)
   - Felicidad < 50: alterna imágenes triste en interval
   - Cambio de expresión más rápido (throttle reducido a 8s)
================================================================ */
class UIManager {
  constructor() {
    this._spriteMap = {
      idle:      { frames: this._seq('normal', 1, 18), fps: 8  },
      feliz:     { frames: this._seq('normal', 1, 18), fps: 11 },
      caminando: { frames: this._seq('normal', 1, 18), fps: 8  },
      jugando:   { frames: this._seq('normal', 1, 18), fps: 12 },
      normal:    { frames: this._seq('normal', 1, 18), fps: 7  },
      comiendo:  { frames: this._seq('normal', 1, 18), fps: 9  },
      triste:    { frames: this._seq('triste',  1, 24), fps: 7 },
      muerto:    { frames: this._seq('triste',  1, 24), fps: 3 },
      cansado:   { frames: this._seq('cansado', 1, 6),  fps: 5 },
      durmiendo: { frames: this._seq('dorm',    1, 18), fps: 5 },
      bañando:   { frames: this._seq('bano',    1, 18), fps: 6 },
      hambre:    { frames: this._seq('hambre',  1, 12), fps: 7 },
    };

    this._estadoActual  = 'idle';
    this._frameTimer    = null;
    this._frameIdx      = 0;
    this._currentFrames = [];
    this._burbujaTimer  = null;

    /* Throttle para cambios de expresión — 8 segundos */
    this._lastExpresionChange = 0;
    this._THROTTLE_EXPR       = 8000;

    /* Throttle para sonido mascota — 8s entre repeticiones */
    this._lastSonidoMascota = 0;
    this._THROTTLE_SONIDO   = 8000;

    this._particulasMap = {
      comiendo:  ['🍖','✨','🔥','💫'],
      bañando:   ['💧','✨','🫧','💦'],
      durmiendo: ['💤','⭐','✨','🌙'],
      jugando:   ['🔥','⚡','✨','💥'],
      hambre:    ['🍗','😋','🔥','✨'],
    };

    this._precargarSprites();
  }

  static getInstance() {
    if (!UIManager._instance) UIManager._instance = new UIManager();
    return UIManager._instance;
  }

  _seq(prefix, from, to) {
    const arr = [];
    for (let i = from; i <= to; i++)
      arr.push(`imagenes/${prefix}${String(i).padStart(2,'0')}.png`);
    return arr;
  }

  _precargarSprites() {
    const todas = Object.values(this._spriteMap)
      .flatMap(c => c.frames)
      .filter((v,i,a) => a.indexOf(v) === i);
    todas.forEach(src => { const img = new Image(); img.src = src; });
  }

  /* ── Animación principal ── */
  mostrarAnimacion(nombre) {
    const img  = document.getElementById('gifMascota');
    const wrap = document.getElementById('spriteWrapper');
    const disp = document.getElementById('mascotaDisplay');
    if (!img) return;

    this._estadoActual = nombre;
    this._detenerCiclo();

    const cfg = this._spriteMap[nombre] || this._spriteMap.idle;
    this._currentFrames = cfg.frames;
    this._frameIdx = 0;
    img.src = this._currentFrames[0];
    img.style.display = 'block';

    if (this._currentFrames.length > 1) {
      const ms = Math.round(1000 / cfg.fps);
      this._frameTimer = setInterval(() => this._avanzarFrame(), ms);
    }

    if (wrap) {
      wrap.className = 'mascota__sprite-wrapper';
      void wrap.offsetWidth;
      wrap.classList.add(`anim--${nombre}`);
    }
    if (disp) { disp.classList.remove('bounce'); void disp.offsetWidth; disp.classList.add('bounce'); }
    this._actualizarAura(nombre);
  }

  _avanzarFrame() {
    const img = document.getElementById('gifMascota');
    if (!img || !this._currentFrames.length) return;
    this._frameIdx = (this._frameIdx + 1) % this._currentFrames.length;
    img.src = this._currentFrames[this._frameIdx];
  }

  _detenerCiclo() {
    if (this._frameTimer) { clearInterval(this._frameTimer); this._frameTimer = null; }
  }

  _actualizarAura(n) {
    const a = document.getElementById('mascotaAura'); if (!a) return;
    const col = {
      jugando:'rgba(255,200,0,.28)',  comiendo:'rgba(0,200,50,.22)',
      bañando:'rgba(0,180,255,.28)', durmiendo:'rgba(80,80,220,.22)',
      cansado:'rgba(100,80,200,.18)', triste:'rgba(100,100,220,.18)',
      hambre:'rgba(200,100,0,.2)',    muerto:'rgba(40,40,40,.5)',
      feliz:'rgba(255,200,0,.22)',    normal:'rgba(180,140,80,.15)',
    };
    a.style.background = `radial-gradient(ellipse at 50% 65%,${col[n]||'rgba(255,80,0,.15)'} 0%,transparent 65%)`;
  }

  mostrarMensaje(texto) {
    const el = document.getElementById('mensajeAccion');
    if (el) { el.textContent = texto; el.classList.remove('msg-flash'); void el.offsetWidth; el.classList.add('msg-flash'); }
    this._burbuja(texto);
  }

  /* Mensaje HABLADO por la mascota: muestra el texto Y suena audio_mascota
     al mismo tiempo (con anti-spam de 1.5s). */
  mostrarMensajeMascota(texto) {
    this.mostrarMensaje(texto);
    const ahora = Date.now();
    if (ahora - (this._lastVozMascota || 0) > 1500) {
      this._lastVozMascota = ahora;
      SoundManager.getInstance().reproducirMascota(1);
    }
  }

  _burbuja(texto) {
    const b = document.getElementById('burbujaMascota');
    const s = document.getElementById('burbujaTexto');
    if (!b || !s) return;
    s.textContent = texto;
    b.classList.add('visible');
    if (this._burbujaTimer) clearTimeout(this._burbujaTimer);
    this._burbujaTimer = setTimeout(() => b.classList.remove('visible'), 3500);
  }

  actualizarBadge(m) {
    const badge = document.getElementById('estadoBadge'); if (!badge) return;
    const ic = { Despierto:'✨', Jugando:'🎮', Comiendo:'🍖', Bañando:'🛁', Durmiendo:'💤' };
    const n  = m.getEstado().getNombre();
    badge.textContent = (ic[n] || '🔥') + ' ' + n;
  }

  /* ── Expresión reactiva — más rápida, triste si stats bajas ── */
  actualizarExpresion(m) {
    if (!m.estaVivo()) return;
    if (!(m.getEstado() instanceof Despierto)) return;

    const sinInterrumpir = ['comiendo','bañando','durmiendo','muerto'];
    if (sinInterrumpir.includes(this._estadoActual)) return;

    const ahora = Date.now();
    const snd   = SoundManager.getInstance();

    /* Función helper: cambiar expresión con throttle */
    const cambiar = (nombre) => {
      if (this._estadoActual === nombre) return;
      if (ahora - this._lastExpresionChange < this._THROTTLE_EXPR) return;
      this._lastExpresionChange = ahora;
      this.mostrarAnimacion(nombre);
    };

    /* Función helper: sonar mascota con throttle */
    const sonar = (veces = 2) => {
      if (ahora - this._lastSonidoMascota < this._THROTTLE_SONIDO) return;
      this._lastSonidoMascota = ahora;
      snd.reproducirMascota(veces);
    };

    /* ── Calcular "bienestar general" ── */
    const statsBasicas = [m.getSalud(), m.getEnergia(), m.getFelicidad(), m.getHambre()];
    const bajas        = statsBasicas.filter(v => v < 40).length;
    const muyBajas     = statsBasicas.filter(v => v < 20).length;

    /* Si la mayoría de stats están bajas → triste (no feliz nunca si stats < 40) */
    const estadoGenMalo = bajas >= 2 || muyBajas >= 1;

    /* ── Prioridad de expresión ── */
    if (m.getSalud() < 20) {
      cambiar('triste'); sonar();
    } else if (m.getEnergia() < 25) {
      cambiar('cansado'); sonar();
    } else if (m.getHambre() < 25) {
      cambiar('hambre'); sonar();
      /* Loop mascota mientras hambre < 50 */
      snd.iniciarLoopMascota();
    } else if (m.getFelicidad() < 50) {
      /* Felicidad < 50: alterna entre triste y normal en intervals */
      if (this._estadoActual !== 'triste') { cambiar('triste'); sonar(); }
    } else if (m.getHigiene() < 20) {
      cambiar('normal');
    } else if (estadoGenMalo) {
      cambiar('triste');
    } else {
      /* Detener loop si hambre ya está bien (≥ 50) */
      snd.detenerLoopMascota();
      /* Solo mostrar feliz si TODO está bien */
      if (m.getFelicidad() > 70 && m.getSalud() > 60 && m.getHambre() > 50 && m.getEnergia() > 40) {
        if (!['feliz','idle','caminando'].includes(this._estadoActual)) cambiar('feliz');
      } else if (!['idle','normal'].includes(this._estadoActual)) {
        cambiar('idle');
      }
    }

    /* Detener loop mascota si hambre ya se recuperó a >= 50 */
    if (m.getHambre() >= 50) snd.detenerLoopMascota();
  }

  lanzarParticulas(accion) {
    const d = document.getElementById('mascotaDisplay'); if (!d) return;
    const em = this._particulasMap[accion] || ['✨'];
    for (let i = 0; i < 6; i++) {
      setTimeout(() => {
        const p = document.createElement('div');
        p.className = 'particula-accion';
        p.textContent = em[Math.floor(Math.random() * em.length)];
        p.style.setProperty('--dx', `${(Math.random()-.5)*70}px`);
        p.style.left   = `${25+Math.random()*50}%`;
        p.style.bottom = `${30+Math.random()*25}%`;
        d.appendChild(p);
        setTimeout(() => p.remove(), 1100);
      }, i * 140);
    }
  }

  mostrarFrase() {
    const f = Mascota.getInstance().getFrase();
    this._burbuja(`${f.a}\n"${f.h}"`);
    this.mostrarMensajeMascota(`${f.a} — "${f.h}"`);
  }

  mostrarMuerte() {
    this._detenerCiclo();
    this._estadoActual = 'muerto';
    const img = document.getElementById('gifMascota');
    if (img) { img.src = this._spriteMap.triste.frames[0]; img.style.filter = 'saturate(0) brightness(0.4)'; }
    SoundManager.getInstance().reproducirMuerte();
    const o = document.getElementById('muerteOverlay'); if (o) o.style.display = 'flex';
  }

  ocultarMuerte() {
    const o  = document.getElementById('muerteOverlay'); if (o) o.style.display = 'none';
    const img = document.getElementById('gifMascota'); if (img) img.style.filter = '';
  }

  mostrarPantalla(id) {
    ['screenIntro','screenNombre','screenMenu','screenJuego','screenMiniJuego'].forEach(s => {
      const el = document.getElementById(s); if (!el) return;
      el.style.display = (s === id) ? 'flex' : 'none';
      el.classList.toggle('screen--active', s === id);
    });
  }

  getRunFrames()  { return Array.from({length:30},(_,i)=>`imagenes/run_f${String(i).padStart(2,'0')}.png`); }
  getFlyFrames()  { return Array.from({length:30},(_,i)=>`imagenes/fly_f${String(i).padStart(2,'0')}.png`); }
  getDuckFrame()  { return 'imagenes/duck_sprite.png'; }
  getIdleFrames() { return this._spriteMap.idle.frames; }
}
