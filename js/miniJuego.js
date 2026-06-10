'use strict';
/* ================================================================
   miniJuego.js — Runner del Felénix v5.1
   Patrón STRATEGY: cada obstáculo es una estrategia intercambiable.
   Correcciones v5.1:
   - Sin alas dibujadas al planear (solo efecto de partículas)
   - AGACHAR cancela el planeo y cae
   - Audio fondo reinicia al repetir (reiniciarFondo)
   - Audio daño y diamante funciona siempre (pools de 4-6)
   - Diamante: sin mensaje flotante de contador
   - Cada 20 diamantes = +1 salud
   - Portal inevitable: zona de detección muy ancha
   - Distancias de obstáculos corregidas (gap mínimo mayor)
   - Bloques flotantes con separación calculada por arco de salto
================================================================ */

const GROUND_H      = 80;
const PLAYER_W      = 64;
const PLAYER_H      = 62;
const PLAYER_H_DUCK = 30;
const GRAV          = 0.58;
const JUMP_VY       = -13.8;
const GLIDE_VY_MAX  = 1.3;
const GLIDE_GRAV    = 0.07;
const DIAMONDS_PER_HP = 20;  // cada 20 diamantes → +1 salud

/* ════════════════════ STRATEGIES ════════════════════ */
class ObstaculoStrategy { generar(cv) { return null; } }

/* Escalón bajo — altura suficiente para requerir salto real */
class EscalonBajo extends ObstaculoStrategy {
  generar(cv) {
    const h = 58 + Math.floor(Math.random() * 2) * 22; // 58 o 80
    return _blq(cv.width, cv.height - GROUND_H - h, 58, h, 'escalon');
  }
}

/* Escalón alto — requiere salto alto o doble */
class EscalonAlto extends ObstaculoStrategy {
  generar(cv) {
    return _blq(cv.width, cv.height - GROUND_H - 95, 58, 95, 'escalon_alto');
  }
}

/* Doble escalón en pendiente — gap de 160px entre ellos */
class DobleEscalon extends ObstaculoStrategy {
  generar(cv) {
    const b1 = _blq(cv.width,       cv.height - GROUND_H - 60,  54, 60,  'escalon');
    const b2 = _blq(cv.width + 170, cv.height - GROUND_H - 105, 54, 105, 'escalon_alto');
    return [b1, b2];
  }
}

/* Pinchos en el suelo — saltar */
class PinchoSuelo extends ObstaculoStrategy {
  generar(cv) {
    const count = 2 + Math.floor(Math.random() * 3);
    const w = count * 18;
    return { x: cv.width, y: cv.height - GROUND_H - 40, w, h: 40,
             tipo: 'pincho', pasable: false, colisionable: true, pinchoCount: count };
  }
}

/* Abismo — saltar (o planear) */
class HuecoAbismo extends ObstaculoStrategy {
  generar(cv) {
    const w = 95 + Math.random() * 40;
    return { x: cv.width, y: cv.height - GROUND_H, w, h: GROUND_H,
             tipo: 'hueco', abismo: true, colisionable: false };
  }
}

/* TúnelTecho — techo sólido, debe agacharse */
class TunelTecho extends ObstaculoStrategy {
  generar(cv) {
    const suelo  = cv.height - GROUND_H;
    const huecoH = 40;  // espacio libre (jugador agachado = 30 + 10 margen)
    const techoY = suelo - huecoH - 24;
    return {
      x: cv.width, y: 0, w: 95, tipo: 'tunel',
      techo: { y: techoY, h: 24 }, huecoH, colisionable: true,
    };
  }
}

/*
  SeccionPlataformas: bloques aéreos bien separados.
  Separación calculada con arco de salto: a vel 3-4 px/frame,
  un salto cubre ~180px horizontales. Se usa 160px de gap mínimo.
*/
class SeccionPlataformas extends ObstaculoStrategy {
  generar(cv) {
    const suelo = cv.height - GROUND_H;
    const plats = [];
    let x = cv.width;
    const count = 3 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      const alto = (i % 2 === 0);
      const py   = suelo - (alto ? 130 : 75);
      plats.push(_blq(x, py, 75, 18, 'plataforma_aerea'));
      x += 160 + Math.floor(Math.random() * 30); // gap mínimo 160px
    }
    /* Abismo largo debajo */
    plats.push({ x: cv.width - 15, y: suelo, w: x - cv.width + 30, h: GROUND_H,
                 tipo: 'hueco_largo', abismo: true, colisionable: false });
    return plats;
  }
}

function _blq(x, y, w, h, tipo) {
  return { x, y, w, h, tipo, pasable: true, colisionable: true };
}

/* ════════════════════════════════════════════════════════════════
   CLASE PRINCIPAL
════════════════════════════════════════════════════════════════ */
class JuegoFenix {
  constructor(canvasId) {
    this._cv  = document.getElementById(canvasId);
    this._ctx = this._cv.getContext('2d');

    this._running  = false;
    this._score    = 0;
    this._hiScore  = parseInt(localStorage.getItem('fenix_hi') || '0', 10);
    this._vidas    = 3;
    this._diamonds = 0;
    this._diamTotal = 0;
    this._invincible = 0;
    this._danoFlash  = 0;

    /* Mundo */
    this._worldX   = 0;
    this._vel      = 2.8;
    this._nivelLen = 18000;
    this._obstaculos = [];
    this._diamondW   = [];
    this._vidasW     = [];
    this._portal     = null;
    this._nextObjX   = 200;
    this._lastTipo   = '';

    this._strategies = [
      new EscalonBajo(),        // 0
      new EscalonAlto(),        // 1
      new DobleEscalon(),       // 2
      new PinchoSuelo(),        // 3
      new HuecoAbismo(),        // 4
      new TunelTecho(),         // 5
      new SeccionPlataformas(), // 6
    ];

    /* Jugador */
    this._px = 80; this._py = this._groundY();
    this._vy = 0;
    this._enAire = false; this._agachado = false;
    this._planeando = false; this._planeoTimer = 0; this._saltos = 0;

    /* Fondo */
    this._bgImg = null; this._bgX = 0; this._bgReady = false;
    this._cargarFondo();

    /* Sprites */
    this._sprCache  = {};
    this._runFrames = UIManager.getInstance().getRunFrames();
    this._flyFrames = UIManager.getInstance().getFlyFrames();
    this._idlFrames = UIManager.getInstance().getIdleFrames();
    this._duckSrc   = UIManager.getInstance().getDuckFrame();
    this._preloadSprites();

    this._sprKey = 'run'; this._sprIdx = 0; this._sprTick = 0;
    this._sprFPS = { run:12, fly:14, duck:5 };

    this._bindTeclado();
    this._bindBotones();
    this._resizeCanvas();
    window.addEventListener('resize', () => { requestAnimationFrame(() => this._resizeCanvas()); });
    window.addEventListener('orientationchange', () => { setTimeout(() => { requestAnimationFrame(() => this._resizeCanvas()); }, 200); });
  }

  _groundY()    { return this._cv.height - GROUND_H - PLAYER_H; }
  _groundBase() { return this._cv.height - GROUND_H; }

  _resizeCanvas() {
    const wrap = this._cv.parentElement; if (!wrap) return;
    const availW = wrap.clientWidth  || window.innerWidth  || 480;
    const availH = wrap.clientHeight || window.innerHeight * 0.6 || 320;
    /* Ratio 3:2 — TAMAÑO VISUAL: llena todo el espacio disponible
       tanto en teléfono como en pantalla grande de computadora */
    const ratioW = 480 / 320; // ancho/alto = 3/2
    let dw, dh;
    if (availW / availH >= ratioW) {
      /* Contenedor más ancho que el ratio — ajustar por alto */
      dh = availH;
      dw = Math.round(dh * ratioW);
    } else {
      /* Contenedor más alto — ajustar por ancho */
      dw = availW;
      dh = Math.round(dw / ratioW);
    }
    /* RESOLUCIÓN LÓGICA (gameplay): limitada a 760px para que el juego
       se sienta IGUAL en teléfono y computadora. En pantallas grandes
       el canvas se escala visualmente (style) para llenar la pantalla. */
    const lw = Math.min(dw, 760);
    const lh = Math.round(lw / ratioW);
    this._cv.width  = lw;
    this._cv.height = lh;
    this._cv.style.width  = dw + 'px';
    this._cv.style.height = dh + 'px';
  }

  _cargarFondo() {
    const img = new Image();
    img.onload  = () => { this._bgImg = img; this._bgReady = true; };
    img.onerror = () => {};
    img.src = 'imagenes/bg_panorama.jpg';
  }

  _preloadSprites() {
    [...this._runFrames, ...this._flyFrames, ...this._idlFrames, this._duckSrc].forEach(src => {
      if (!this._sprCache[src]) { const img = new Image(); img.src = src; this._sprCache[src] = img; }
    });
  }

  /* ── Teclado ── */
  _bindTeclado() {
    this._onKey = e => {
      if (!this._running) return;
      if (e.code === 'ArrowLeft')                          this._moverIzq();
      else if (e.code === 'ArrowRight')                   this._moverDer();
      else if (e.code === 'ArrowUp' || e.code === 'Space'){ this._saltar(); e.preventDefault(); }
      else if (e.code === 'ArrowDown')                     this._agachar(true);
    };
    this._onKeyUp = e => { if (e.code === 'ArrowDown') this._agachar(false); };
    document.addEventListener('keydown', this._onKey);
    document.addEventListener('keyup',   this._onKeyUp);
  }

  /* ── Botones táctiles (SIN audio_botones — son flechas del runner) ── */
  _bindBotones() {
    const map = { btnLeft:'left', btnRight:'right', btnJump:'jump', btnDown:'duck' };
    Object.entries(map).forEach(([id, a]) => {
      const el = document.getElementById(id); if (!el) return;
      el.addEventListener('pointerdown', () => {
        if (!this._running) return;
        /* Solo salto y agachado reproducen el audio de salto */
        if (a === 'jump')  this._saltar();
        else if (a === 'duck') this._agachar(true);
        else if (a === 'left') this._moverIzq();
        else this._moverDer();
      });
      el.addEventListener('pointerup',    () => { if (a === 'duck') this._agachar(false); });
      el.addEventListener('pointerleave', () => { if (a === 'duck') this._agachar(false); });
      el.addEventListener('pointercancel',() => { if (a === 'duck') this._agachar(false); });
    });
  }

  _moverIzq() { if (this._px > 15) this._px -= 26; }
  _moverDer() { if (this._px < this._cv.width - PLAYER_W - 15) this._px += 26; }

  _saltar() {
    if (this._agachado) { this._agachar(false); return; }
    if (!this._enAire) {
      this._vy = JUMP_VY; this._enAire = true; this._saltos = 1;
      this._planeando = false;
      SoundManager.getInstance().reproducirSalto();
    } else if (this._saltos < 2) {
      /* Segundo salto → planeo */
      this._planeando   = true;
      this._planeoTimer = 110;
      this._vy          = -1.8;
      this._saltos      = 2;
      SoundManager.getInstance().reproducirSalto();
    }
  }

  /* Agachar cancela el planeo y hace caer */
  _agachar(v) {
    if (!this._enAire) {
      this._agachado = v;
    } else if (v && this._planeando) {
      /* Cancelar planeo → caída normal */
      this._planeando   = false;
      this._planeoTimer = 0;
      this._vy = Math.max(this._vy, 2); // impulso hacia abajo
    }
  }

  /* ── Iniciar nivel ── */
  iniciar() {
    this._running   = true;
    this._score     = 0; this._vidas = 3; this._diamonds = 0;
    this._diamTotal = 0; this._vel = 2.8; this._worldX = 0;
    this._invincible = 0; this._danoFlash = 0; this._bgX = 0;
    this._obstaculos = []; this._diamondW = []; this._vidasW = [];
    this._portal = null; this._nextObjX = 220; this._lastTipo = '';
    this._px = 80; this._py = this._groundY();
    this._vy = 0; this._enAire = false; this._agachado = false;
    this._planeando = false; this._saltos = 0;

    const ov = document.getElementById('juegoOverlay'); if (ov) ov.style.display = 'none';
    this._updateHi();
    this._resizeCanvas();

    /* Reiniciar audio de fondo al repetir */
    SoundManager.getInstance().reiniciarFondo();

    requestAnimationFrame(() => this._loop());
  }

  _loop() {
    if (!this._running) return;
    this._update();
    this._draw();
    requestAnimationFrame(() => this._loop());
  }

  /* ════════════════════════════════════════════════════
     ACTUALIZACIÓN
  ════════════════════════════════════════════════════ */
  _update() {
    const cv = this._cv;
    this._worldX += this._vel;
    this._bgX    += this._vel * 0.35;
    this._vel     = Math.min(6.5, 2.8 + Math.floor(this._worldX / 2500) * 0.3);
    this._score   = Math.floor(this._worldX);

    /* Portal al acercarse al final — zona muy ancha para que sea inevitable */
    if (this._worldX >= this._nivelLen - 300 && !this._portal) {
      this._portal = { x: cv.width + 80, y: cv.height - GROUND_H - 130, w: 80, h: 130 };
    }
    if (this._portal) {
      this._portal.x -= this._vel;
      /* Zona de detección extra-ancha: si el portal cruza la X del jugador */
      const p = this._portal;
      if (p.x <= this._px + PLAYER_W + 20) {
        /* Portal inevitable: se activa cuando el portal alcanza al jugador */
        this._victoria(); return;
      }
    }

    /* Generar obstáculos */
    if (this._worldX > this._nextObjX && this._worldX < this._nivelLen - 1200) {
      this._generarObstaculo(cv);
    }

    /* Mover objetos */
    const mv = o => ({ ...o, x: o.x - this._vel });
    this._obstaculos = this._obstaculos.map(mv).filter(o => o.x + (o.w||200) > -80);
    this._diamondW   = this._diamondW.map(mv).filter(o => o.x > -20);
    this._vidasW     = this._vidasW.map(mv).filter(o => o.x > -20);

    /* ── Física ── */
    if (this._enAire) {
      if (this._planeando && this._planeoTimer > 0) {
        this._vy += GLIDE_GRAV; this._vy = Math.min(this._vy, GLIDE_VY_MAX);
        this._planeoTimer--;
        if (this._planeoTimer <= 0) this._planeando = false;
      } else {
        this._vy += GRAV;
      }
      this._py += this._vy;
      if (this._py >= this._groundY()) {
        this._py = this._groundY(); this._vy = 0;
        this._enAire = false; this._planeando = false; this._saltos = 0;
      }
    }

    /* Aterrizar sobre plataformas */
    for (const o of this._obstaculos) {
      if (!o.pasable) continue;
      if (this._vy >= 0 || this._enAire) {
        const feetY = this._py + PLAYER_H;
        if (this._px + PLAYER_W - 8 > o.x && this._px + 8 < o.x + o.w &&
            feetY >= o.y && feetY <= o.y + 20) {
          this._py = o.y - PLAYER_H; this._vy = 0;
          this._enAire = false; this._planeando = false; this._saltos = 0;
        }
      }
    }

    /* Caída desde plataforma */
    if (!this._enAire) {
      const onSuelo = this._py + PLAYER_H >= this._groundY() + PLAYER_H - 2;
      if (!onSuelo) {
        let sobre = false;
        for (const o of this._obstaculos) {
          if (o.pasable && this._px + PLAYER_W - 8 > o.x && this._px + 8 < o.x + o.w &&
              Math.abs(this._py + PLAYER_H - o.y) < 6) { sobre = true; break; }
        }
        if (!sobre) { this._enAire = true; if (this._vy === 0) this._vy = 0.5; }
      }
    }

    if (this._invincible > 0) this._invincible--;
    if (this._danoFlash  > 0) this._danoFlash--;

    /* Hitbox */
    const hx = this._px + 8;
    const hy = this._agachado ? this._py + PLAYER_H - PLAYER_H_DUCK : this._py;
    const hw = PLAYER_W - 16;
    const hh = this._agachado ? PLAYER_H_DUCK : PLAYER_H;

    /* ── Colisiones ── */
    for (const o of this._obstaculos) {
      if (o.abismo) {
        if (!this._enAire && this._invincible === 0) {
          const cx = hx + hw / 2;
          if (cx > o.x + 6 && cx < o.x + o.w - 6 &&
              this._py + PLAYER_H >= this._groundBase() - 4) {
            this._caerAbismo(); return;
          }
        }
        continue;
      }

      if (o.tipo === 'tunel') {
        if (!this._agachado && this._invincible === 0) {
          const techoBot = o.techo.y + o.techo.h;
          if (hx + hw > o.x && hx < o.x + o.w && hy < techoBot && hy + hh > o.techo.y) {
            this._recibirDanio(); return;
          }
        }
        continue;
      }

      if (o.tipo === 'pincho' && this._invincible === 0) {
        if (hx < o.x + o.w && hx + hw > o.x && hy < o.y + o.h && hy + hh > o.y) {
          this._recibirDanio(); return;
        }
        continue;
      }

      /* Escalones — colisión lateral */
      if (o.pasable && o.colisionable && this._invincible === 0) {
        const sobreEl = this._py + PLAYER_H <= o.y + 5 && this._vy >= 0;
        if (!sobreEl && hx < o.x + o.w && hx + hw > o.x && hy < o.y + o.h && hy + hh > o.y) {
          this._recibirDanio(); return;
        }
      }
    }

    /* ── Recolección de diamantes ── */
    this._diamondW = this._diamondW.filter(d => {
      if (hx < d.x + d.r * 2 && hx + hw > d.x - d.r &&
          hy < d.y + d.r * 2 && hy + hh > d.y - d.r) {
        this._diamonds++;
        this._diamTotal++;
        SoundManager.getInstance().reproducirDiamante();
        /* Cada DIAMONDS_PER_HP diamantes → +1 salud */
        if (this._diamTotal % DIAMONDS_PER_HP === 0) {
          Mascota.getInstance().setSalud(
            Mascota.getInstance().satisfacer(Mascota.getInstance().getSalud(), 1)
          );
          Mascota.getInstance().actualizarObservadores();
        }
        return false;
      }
      return true;
    });

    /* ── Recolección de vidas ── */
    this._vidasW = this._vidasW.filter(v => {
      if (hx < v.x + 20 && hx + hw > v.x - 20 && hy < v.y + 20 && hy + hh > v.y - 20) {
        this._vidas = Math.min(3, this._vidas + 1);
        SoundManager.getInstance().reproducirDiamante();
        return false;
      }
      return true;
    });
  }

  /* ── Generación coherente de obstáculos ── */
  _generarObstaculo(cv) {
    /* Respetar gap mínimo de 280px entre obstáculos */
    const ultimo = [...this._obstaculos].reverse().find(o => !o.abismo && o.tipo !== 'hueco_largo');
    const GAP_MIN = 280;
    if (ultimo && ultimo.x + (ultimo.w||60) + GAP_MIN > cv.width) return;

    const hayAbismo = this._obstaculos.some(o => o.abismo && o.x > -80 && o.x < cv.width + 80);
    const hayTunel  = this._obstaculos.some(o => o.tipo === 'tunel' && o.x > 0);

    const p = [22, 14, 10, 18, 10, 12, 8];
    if (hayAbismo || ['hueco','hueco_largo'].includes(this._lastTipo)) { p[4]=0; p[5]=0; p[6]=0; }
    if (hayTunel  || this._lastTipo === 'tunel')    p[5] = 0;
    if (this._lastTipo === 'escalon_alto')           { p[1]=0; p[2]=0; }
    if (this._worldX < this._nivelLen * 0.4)         p[6] = 0;

    const idx = this._pesado(p); if (idx < 0) return;

    const resultado = this._strategies[idx].generar(cv); if (!resultado) return;
    const lista = Array.isArray(resultado) ? resultado : [resultado];
    lista.forEach(o => this._obstaculos.push(o));
    this._lastTipo = lista[0].tipo;

    this._colocarDiamantes(lista, cv);

    /* Calcular siguiente posición — gap adicional según tipo */
    const extraGap = ['escalon_alto','doble_escalon','plataforma_aerea'].includes(this._lastTipo) ? 80 : 0;
    const maxX = Math.max(...lista.map(o => o.x + o.w));
    const gap  = GAP_MIN + extraGap + Math.random() * 160;
    this._nextObjX = this._worldX + (maxX - cv.width) / this._vel + gap / this._vel;

    if (Math.random() < 0.06 && this._vidas < 3) {
      this._vidasW.push({ x: cv.width + 100, y: cv.height - GROUND_H - 130, r: 13 });
    }
  }

  /* ── Diamantes DIFÍCILES: solo alcanzables saltando ──
     · Sobre la PUNTA de escalones/plataformas (hay que saltar para cogerlos)
     · Sobre el ABISMO, a altura de arco de salto (cogerlos en pleno vuelo)
     · NUNCA a ras de suelo en zona libre */
  _colocarDiamantes(obstaculos, cv) {
    obstaculos.forEach(o => {
      /* Sobre el abismo: en el centro del hueco, a altura de salto */
      if (o.abismo) {
        const cxAb = o.x + o.w / 2;
        const yAb  = this._groundBase() - 95; // altura del arco de salto
        this._diamondW.push({ x: cxAb, y: yAb, r: 10 });
        return;
      }
      if (!o.pasable || o.tipo === 'tunel') return;
      /* Sobre la punta del escalón/plataforma: ALTO, requiere saltar
         estando encima (o llegar saltando desde otro escalón) */
      this._diamondW.push({ x: o.x + o.w / 2, y: o.y - 70, r: 10 });
    });
  }

  _pesado(pesos) {
    const total = pesos.reduce((a,b)=>a+b, 0); if (total===0) return -1;
    let r = Math.random() * total;
    for (let i=0; i<pesos.length; i++) { r-=pesos[i]; if (r<=0) return i; }
    return 0;
  }

  _recibirDanio() {
    this._vidas--;
    SoundManager.getInstance().reproducirDanio();
    this._invincible = 80;
    this._danoFlash  = 14;
    if (this._vidas <= 0) { this._gameOver(); }
  }

  _caerAbismo() {
    this._vidas--;
    SoundManager.getInstance().reproducirDanio();
    if (this._vidas <= 0) { this._gameOver(); return; }
    this._px = 80; this._py = this._groundY();
    this._vy = 0; this._enAire = false;
    this._invincible = 120; this._danoFlash = 14;
  }

  _gameOver() {
    this._running = false;
    SoundManager.getInstance().detenerFondo();
    this._guardarHi();
    this._overlay('💀 GAME OVER', false);
  }

  _victoria() {
    this._running = false;
    SoundManager.getInstance().reproducirVictoria();
    Mascota.getInstance().aplicarResultadoJuego(this._score, this._diamonds);
    this._guardarHi();
    this._overlay('🏆 ¡VICTORIA!', true);
  }

  _guardarHi() {
    if (this._score > this._hiScore) {
      this._hiScore = this._score;
      localStorage.setItem('fenix_hi', this._hiScore);
      this._updateHi();
    }
  }

  _overlay(titulo, victoria) {
    const box = document.getElementById('gameOverBox'); if (!box) return;
    box.innerHTML = `
      <div class="go-title">${titulo}</div>
      <div class="go-score">Puntaje: ${this._score} &nbsp;|&nbsp; 💎 ${this._diamonds}</div>
      <div class="go-hi">Récord: ${this._hiScore}</div>
      ${victoria ? '<div style="color:#ffcc00;font-family:var(--font-s);font-size:.78rem;margin:6px 0">¡Felénix regresó victorioso! 🔥</div>' : ''}
      <button class="go-btn" id="btnR2">🔥 REINTENTAR</button>
      <button class="go-btn" id="btnV2" style="background:#2a2a2a">← VOLVER AL NIDO</button>`;
    /* Audio en botones del overlay */
    document.getElementById('btnR2')?.addEventListener('click', () => {
      SoundManager.getInstance().reproducirClick();
      this.iniciar();
    });
    document.getElementById('btnV2')?.addEventListener('click', () => {
      SoundManager.getInstance().reproducirClick();
      AppController.getInstance().volverAlJuego();
    });
    const ov = document.getElementById('juegoOverlay'); if (ov) ov.style.display = 'flex';
  }

  _updateHi() {
    const el = document.getElementById('hiScoreDisplay'); if (el) el.textContent = this._hiScore;
  }

  /* Restaurar la pantalla de inicio del runner (al volver a entrar
     después de haber salido con "Volver") */
  mostrarOverlayInicio() {
    const box = document.getElementById('gameOverBox'); if (!box) return;
    box.innerHTML = `
      <div class="go-title">🔥 VUELO DEL FELÉNIX</div>
      <div class="go-sub">
        Recoge 💎 (cada ${DIAMONDS_PER_HP} = +1❤️) · Evita pinchos<br>
        Salta escalones · Agáchate en túneles<br>
        <strong style="color:#ffcc00">▲▲ Doble salto = PLANEO 🪶</strong>
      </div>
      <button class="go-btn" id="btnIniciarRunner2">▶ INICIAR VUELO</button>`;
    document.getElementById('btnIniciarRunner2')?.addEventListener('click', () => {
      SoundManager.getInstance().reproducirClick();
      this.iniciar();
      SoundManager.getInstance().iniciarFondo();
    });
    const ov = document.getElementById('juegoOverlay'); if (ov) ov.style.display = 'flex';
    this._updateHi();
  }

  /* ════════════════════════════════════════════════════
     RENDERIZADO
  ════════════════════════════════════════════════════ */
  _draw() {
    const ctx = this._ctx, cv = this._cv;
    ctx.clearRect(0, 0, cv.width, cv.height);
    this._drawFondo(ctx, cv);
    this._drawSuelo(ctx, cv);
    this._drawObstaculos(ctx, cv);
    this._drawColeccionables(ctx, cv);
    if (this._portal) this._drawPortal(ctx, cv);
    this._drawFenix(ctx, cv);
    this._drawHUD(ctx, cv);
    if (this._danoFlash > 0) {
      const a = this._danoFlash / 14 * 0.3;
      ctx.fillStyle = `rgba(255,20,0,${a})`; ctx.fillRect(0,0,cv.width,cv.height);
    }
  }

  _drawFondo(ctx, cv) {
    const h = cv.height - GROUND_H;
    if (this._bgReady && this._bgImg?.complete && this._bgImg.naturalWidth > 0) {
      const img = this._bgImg;
      const scH = h / img.naturalHeight, scW = img.naturalWidth * scH;
      const off = this._bgX % scW;
      for (let r = 0; r < 4; r++) {
        const dx = r * scW - off;
        if (dx + scW < 0 || dx > cv.width) continue;
        ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, dx, 0, scW, h);
      }
      ctx.fillStyle = 'rgba(12,0,28,0.20)'; ctx.fillRect(0,0,cv.width,h);
    } else {
      const g = ctx.createLinearGradient(0,0,0,h);
      g.addColorStop(0,'#1a0a2e'); g.addColorStop(.5,'#5c1060'); g.addColorStop(1,'#3a0800');
      ctx.fillStyle = g; ctx.fillRect(0,0,cv.width,h);
    }
  }

  _drawSuelo(ctx, cv) {
    const sy = cv.height - GROUND_H;
    const abismos = this._obstaculos.filter(o => o.abismo);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, sy, cv.width, GROUND_H);
    abismos.forEach(a => {
      const ax = Math.max(0,a.x), aw = Math.min(a.x+a.w,cv.width)-ax;
      if (aw>0) ctx.rect(ax, sy, aw, GROUND_H);
    });
    ctx.clip('evenodd');
    const g = ctx.createLinearGradient(0,sy,0,cv.height);
    g.addColorStop(0,'#7a4520'); g.addColorStop(.2,'#5c3010'); g.addColorStop(1,'#120800');
    ctx.fillStyle = g; ctx.fillRect(0,sy,cv.width,GROUND_H);
    const t = Date.now()/400;
    ctx.strokeStyle = `rgba(255,${110+Math.sin(t)*45|0},0,0.8)`;
    ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0,sy); ctx.lineTo(cv.width,sy); ctx.stroke();
    ctx.restore();
  }

  _drawObstaculos(ctx, cv) {
    const sy = cv.height - GROUND_H;
    this._obstaculos.forEach(o => {
      if (o.abismo) {
        const t = Date.now()/300;
        const lava = ctx.createLinearGradient(o.x,sy,o.x,cv.height);
        lava.addColorStop(0,'rgba(0,0,0,.96)');
        lava.addColorStop(.7,`rgba(${180+Math.sin(t)*40|0},30,0,.9)`);
        lava.addColorStop(1,'rgba(255,80,0,.8)');
        ctx.fillStyle = lava; ctx.fillRect(o.x,sy,o.w,cv.height-sy);
        ctx.strokeStyle='rgba(255,60,0,.8)'; ctx.lineWidth=2;
        ctx.beginPath(); ctx.moveTo(o.x,sy); ctx.lineTo(o.x+o.w,sy); ctx.stroke();
        return;
      }
      if (o.tipo === 'tunel') {
        ctx.fillStyle='rgba(18,5,0,.58)'; ctx.fillRect(o.x,0,o.w,o.techo.y);
        const tg = ctx.createLinearGradient(o.x,o.techo.y,o.x,o.techo.y+o.techo.h);
        tg.addColorStop(0,'#5c2200'); tg.addColorStop(1,'#1a0800');
        ctx.fillStyle=tg; ctx.fillRect(o.x,o.techo.y,o.w,o.techo.h);
        ctx.strokeStyle='rgba(255,120,40,.6)'; ctx.lineWidth=2;
        ctx.strokeRect(o.x,o.techo.y,o.w,o.techo.h);
        ctx.fillStyle='rgba(255,200,80,.88)';
        ctx.font=`bold ${Math.round(cv.width*.026)}px Arial`;
        ctx.textAlign='center'; ctx.fillText('▼ AGÁCHATE', o.x+o.w/2, o.techo.y-5);
        return;
      }
      if (o.tipo === 'pincho') {
        for (let i=0; i<o.pinchoCount; i++) {
          const px = o.x+i*18;
          const g = ctx.createLinearGradient(px,o.y,px+9,o.y+o.h);
          g.addColorStop(0,'#e8e8ff'); g.addColorStop(1,'#3a3a88');
          ctx.fillStyle=g;
          ctx.beginPath(); ctx.moveTo(px,o.y+o.h); ctx.lineTo(px+9,o.y); ctx.lineTo(px+18,o.y+o.h);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle='rgba(200,200,255,.55)'; ctx.lineWidth=1; ctx.stroke();
        }
        return;
      }
      /* Escalones y plataformas aéreas */
      const isAereo = o.tipo === 'plataforma_aerea';
      const g = ctx.createLinearGradient(o.x,o.y,o.x,o.y+o.h);
      if (isAereo) {
        g.addColorStop(0,'#9b6a35'); g.addColorStop(.35,'#6b4020'); g.addColorStop(1,'#2a1008');
      } else {
        g.addColorStop(0,'#c89050'); g.addColorStop(.35,'#8c6030'); g.addColorStop(1,'#3a1a08');
      }
      ctx.fillStyle=g; ctx.fillRect(o.x,o.y,o.w,o.h);
      ctx.strokeStyle = isAereo ? 'rgba(200,150,60,.7)':'rgba(255,180,70,.75)';
      ctx.lineWidth=1.5; ctx.strokeRect(o.x,o.y,o.w,o.h);
      if (!isAereo) {
        ctx.fillStyle='rgba(255,220,80,.75)';
        ctx.font=`${Math.round(cv.width*.025)}px Arial`;
        ctx.textAlign='center'; ctx.fillText('▲', o.x+o.w/2, o.y-4);
      }
    });
  }

  _drawColeccionables(ctx, cv) {
    const t = Date.now()/500;
    this._diamondW.forEach(d => {
      const bob = Math.sin(t + d.x * 0.012) * 5;
      ctx.save(); ctx.translate(d.x, d.y+bob);
      ctx.rotate(Math.PI/4 + Math.sin(t*1.5)*.15);
      const r = d.r;
      const dg = ctx.createRadialGradient(0,0,1,0,0,r);
      dg.addColorStop(0,'#ffffff'); dg.addColorStop(.3,'#80d8ff');
      dg.addColorStop(.7,'#0088ff'); dg.addColorStop(1,'#004488');
      ctx.fillStyle=dg;
      ctx.beginPath(); ctx.moveTo(0,-r*1.3); ctx.lineTo(r,0); ctx.lineTo(0,r*1.1); ctx.lineTo(-r,0);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle='rgba(180,230,255,.9)'; ctx.lineWidth=1.2; ctx.stroke();
      ctx.fillStyle='rgba(255,255,255,.75)';
      ctx.beginPath(); ctx.ellipse(-r*.25,-r*.4,r*.22,r*.12,-Math.PI/5,0,Math.PI*2); ctx.fill();
      ctx.restore();
      ctx.save(); ctx.globalAlpha=.22;
      ctx.shadowColor='#00aaff'; ctx.shadowBlur=12;
      ctx.fillStyle='#00aaff'; ctx.beginPath(); ctx.arc(d.x,d.y+bob,r*.6,0,Math.PI*2); ctx.fill();
      ctx.restore();
    });
    this._vidasW.forEach(v => {
      const bob = Math.sin(t*1.4+v.x*.01)*4;
      ctx.save(); ctx.shadowColor='rgba(255,50,50,.9)'; ctx.shadowBlur=14;
      ctx.font=`${v.r*2}px serif`; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('❤️',v.x,v.y+bob); ctx.restore();
    });
    ctx.textBaseline='alphabetic';
  }

  _drawPortal(ctx, cv) {
    const p = this._portal, t = Date.now()/1000;
    const cx = p.x+p.w/2, cy = p.y+p.h/2;
    const glo = ctx.createRadialGradient(cx,cy,5,cx,cy,70);
    glo.addColorStop(0,'rgba(100,190,255,.45)'); glo.addColorStop(1,'rgba(50,80,255,0)');
    ctx.fillStyle=glo; ctx.beginPath(); ctx.ellipse(cx,cy,70,88,0,0,Math.PI*2); ctx.fill();
    ctx.save(); ctx.translate(cx,cy);
    for (let i=0;i<8;i++) {
      ctx.rotate(Math.PI*2/8);
      ctx.strokeStyle=`rgba(150,210,255,${.3+Math.sin(t*3+i)*.2})`;
      ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0,-55); ctx.stroke();
    }
    ctx.restore();
    const ig=ctx.createRadialGradient(cx,cy,4,cx,cy,36);
    ig.addColorStop(0,'rgba(220,240,255,.95)'); ig.addColorStop(.5,'rgba(80,140,255,.7)'); ig.addColorStop(1,'rgba(20,50,220,.2)');
    ctx.fillStyle=ig; ctx.beginPath(); ctx.ellipse(cx,cy,36,60,0,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle=`rgba(180,225,255,${.75+Math.sin(t*4)*.25})`; ctx.lineWidth=3;
    ctx.beginPath(); ctx.ellipse(cx,cy,36,60,0,0,Math.PI*2); ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,.92)';
    ctx.font=`bold ${Math.round(cv.width*.014)}px "Press Start 2P",monospace`;
    ctx.textAlign='center'; ctx.fillText('¡META!',cx,p.y-10);
  }

  _drawFenix(ctx, cv) {
    const isFlying = this._planeando || (this._enAire && this._saltos >= 2);
    const key = this._agachado ? 'duck' : isFlying ? 'fly' : 'run';

    if (key !== this._sprKey) { this._sprKey=key; this._sprIdx=0; this._sprTick=0; }
    this._sprTick++;
    const fps = this._sprFPS[key] || 12;
    if (this._sprTick >= Math.round(60/fps)) {
      this._sprTick = 0;
      if (key !== 'duck') {
        const frames = key==='fly' ? this._flyFrames : this._runFrames;
        this._sprIdx = (this._sprIdx+1) % frames.length;
      }
    }

    const w = PLAYER_W;
    const h = this._agachado ? PLAYER_H_DUCK : PLAYER_H;
    const x = this._px;
    const y = this._agachado ? this._py + (PLAYER_H - PLAYER_H_DUCK) : this._py;

    if (this._invincible > 0 && Math.floor(this._invincible/5)%2===0) return;

    /* Aura de fuego (sin alas dibujadas al planear) */
    const aura = ctx.createRadialGradient(x+w/2,y+h/2,3,x+w/2,y+h/2,34);
    aura.addColorStop(0,'rgba(255,130,0,.28)'); aura.addColorStop(1,'rgba(255,50,0,0)');
    ctx.fillStyle=aura; ctx.beginPath(); ctx.ellipse(x+w/2,y+h/2,36,28,0,0,Math.PI*2); ctx.fill();

    /* Sprite */
    const src = this._agachado ? this._duckSrc :
                (key==='fly' ? this._flyFrames[this._sprIdx % this._flyFrames.length]
                             : this._runFrames[this._sprIdx % this._runFrames.length]);
    const img = this._sprCache[src];
    if (img?.complete && img.naturalWidth>0) {
      ctx.drawImage(img, x, y, w, h);
    } else {
      ctx.fillStyle='#ff6600';
      ctx.beginPath(); ctx.ellipse(x+w/2,y+h*.6,w*.38,h*.28,0,0,Math.PI*2); ctx.fill();
    }

    /* Cola de llamas */
    const t2 = Date.now()/200;
    ctx.lineWidth=2.5;
    ['#ff4400','#ff8800','#ffcc00'].forEach((c,i) => {
      ctx.strokeStyle=c;
      ctx.beginPath();
      ctx.moveTo(x+w*.12,y+h*.58+i*5);
      ctx.quadraticCurveTo(x-10+Math.sin(t2+i)*6,y+h*.76+i*4,x-22+Math.sin(t2+i*.7)*8,y+h*.66+i*7);
      ctx.stroke();
    });
  }

  _drawHUD(ctx, cv) {
    const W = cv.width;

    /* ── Fuentes escaladas: reducidas para caber en canvas estrecho ── */
    const fs   = Math.max(7, Math.round(W * 0.024));   // texto (score, diamantes)
    const fsHe = Math.max(9, Math.round(W * 0.034));   // corazones (más pequeños)

    /* Altura de la barra HUD adaptada */
    const hudH = Math.round(W * 0.092);
    ctx.fillStyle = 'rgba(0,0,0,.62)';
    ctx.fillRect(0, 0, W, hudH);

    const cy = Math.round(hudH * 0.68); // baseline vertical centrada

    /* ── PUNTAJE (izquierda) ── */
    ctx.fillStyle = '#ffcc00';
    ctx.font = `bold ${fs}px "Press Start 2P",monospace`;
    ctx.textAlign = 'left';
    ctx.fillText(`${this._score}`, 5, cy);

    /* ── DIAMANTES: icono + número ── */
    ctx.fillStyle = '#80d8ff';
    const scoreW = ctx.measureText(`${this._score}`).width;
    const diam_x = 7 + scoreW + Math.round(W * 0.03);
    ctx.fillText(`\u{1F48E}${this._diamonds}`, diam_x, cy);

    /* ── BARRA DE PROGRESO (centro) ── */
    const barW = Math.round(W * 0.26);
    const barH = Math.max(4, Math.round(hudH * 0.22));
    const bx   = Math.round(W / 2 - barW / 2);
    const by   = Math.round(hudH / 2 - barH / 2);
    const prog = Math.min(1, this._worldX / this._nivelLen);
    ctx.fillStyle = 'rgba(255,255,255,.12)';
    ctx.fillRect(bx, by, barW, barH);
    const pg = ctx.createLinearGradient(bx, by, bx + barW, by);
    pg.addColorStop(0, '#ff4400'); pg.addColorStop(1, '#ffcc00');
    ctx.fillStyle = pg;
    ctx.fillRect(bx, by, Math.round(barW * prog), barH);
    ctx.strokeStyle = 'rgba(255,150,0,.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, barW, barH);

    /* ── CORAZONES (derecha): dibujados individualmente para control exacto ──
       Cada corazón tiene ancho conocido — así nunca se salen del canvas.       */
    ctx.font = `${fsHe}px serif`;
    const heW  = fsHe * 1.35;          // ancho estimado por emoji
    const heGap = Math.round(heW * 0.15); // separación entre ellos
    const totalHe = 3 * heW + 2 * heGap;
    let hx = W - 4 - totalHe;         // x inicial del primer corazón
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i < this._vidas ? '#ff3333' : '#444444';
      ctx.textAlign = 'left';
      ctx.fillText(i < this._vidas ? '❤' : '♥', hx + i * (heW + heGap), cy);
    }

    /* ── PLANEO ── */
    if (this._planeando) {
      ctx.fillStyle = 'rgba(255,220,0,.9)';
      ctx.font = `${Math.round(W * 0.020)}px Arial`;
      ctx.textAlign = 'center';
      ctx.fillText('\uD83E\uDEB6 PLANEANDO', W / 2, hudH + Math.round(W * 0.04));
    }
  }
}
