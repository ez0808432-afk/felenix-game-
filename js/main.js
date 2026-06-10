'use strict';
/* ================================================================
   main.js — Punto de entrada
   - audio_botones suena en TODOS los botones excepto flechas runner
   - btnIniciarRunner también inicia audio fondo
================================================================ */
document.addEventListener('DOMContentLoaded', () => {

  const snd = () => SoundManager.getInstance();

  /* ── Pantalla de nombre ── */
  document.getElementById('btnConfirmarNombre')?.addEventListener('click', () => {
    snd().reproducirClick();
    const inp    = document.getElementById('inputNombre');
    const nombre = (inp?.value || '').trim().replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s\-]/g,'').trim();
    Mascota.getInstance().setNombre(nombre || 'Felénix');
    AppController.getInstance().mostrarMenu();
  });

  document.getElementById('inputNombre')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btnConfirmarNombre')?.click();
  });

  /* ── Menú principal ── */
  document.getElementById('btnIniciarJuego')?.addEventListener('click', () => {
    snd().reproducirClick();
    AppController.getInstance().mostrarJuego();
  });

  document.getElementById('btnVerCreditos')?.addEventListener('click', () => {
    snd().reproducirClick();
    _mostrarLeyenda();
  });

  /* ── Acciones de la mascota ── */
  document.getElementById('btnComer')?.addEventListener('click', () => {
    snd().reproducirClick();
    Mascota.getInstance().comer();
  });
  document.getElementById('btnJugar')?.addEventListener('click', () => {
    snd().reproducirClick();
    Mascota.getInstance().jugar();
  });
  document.getElementById('btnBañar')?.addEventListener('click', () => {
    snd().reproducirClick();
    Mascota.getInstance().bañar();
  });
  document.getElementById('btnDormir')?.addEventListener('click', () => {
    snd().reproducirClick();
    Mascota.getInstance().dormir();
  });

  /* ── Mute ── */
  document.getElementById('btnMute')?.addEventListener('click', () => {
    const muted = snd().toggleMute();
    const btn   = document.getElementById('btnMute');
    if (btn) {
      const spans = btn.querySelectorAll('span');
      if (spans[0]) spans[0].textContent = muted ? '🔇' : '🔊';
      if (spans[1]) spans[1].textContent = muted ? 'Mute' : 'Sonido';
      btn.classList.toggle('muted', muted);
    }
  });

  /* ── Volver al juego desde el runner — pausa/finaliza el juego ── */
  document.getElementById('btnVolverJuego')?.addEventListener('click', () => {
    snd().reproducirClick();
    snd().detenerFondo();
    /* Detener el runner correctamente antes de salir */
    if (window.juegoFenix && window.juegoFenix._running) {
      window.juegoFenix._running = false;
      /* Aplicar resultado parcial (energía consumida durante el juego) */
      Mascota.getInstance().aplicarResultadoJuego(
        window.juegoFenix._score || 0,
        window.juegoFenix._diamonds || 0
      );
    }
    AppController.getInstance().volverAlJuego();
  });

  /* ── Iniciar runner — botón JUGAR en overlay ── */
  document.getElementById('btnIniciarRunner')?.addEventListener('click', () => {
    snd().reproducirClick();
    if (!window.juegoFenix) window.juegoFenix = new JuegoFenix('gameCanvas');
    window.juegoFenix.iniciar();
    /* Iniciar fondo: primera vez */
    snd().iniciarFondo();
  });

  /* ── Renacer ── */
  document.getElementById('btnRenacer')?.addEventListener('click', () => {
    snd().reproducirClick();
    Mascota.getInstance().renacer();
    UIManager.getInstance().ocultarMuerte();
    UIManager.getInstance().mostrarAnimacion('feliz');
    UIManager.getInstance().mostrarMensajeMascota('🔥 ¡He renacido de mis propias cenizas! Mi llama arde de nuevo.');
    Mascota.getInstance().actualizarObservadores();
  });

  /* ── Clic en la mascota = ACARICIAR (sube la felicidad poco a poco) ── */
  document.getElementById('mascotaDisplay')?.addEventListener('click', () => {
    const m = Mascota.getInstance(); if (!m.estaVivo()) return;
    snd().reproducirClick();
    UIManager.getInstance().mostrarFrase();
    UIManager.getInstance().lanzarParticulas('jugando');
    m.setFelicidad(m.satisfacer(m.getFelicidad(), 2));
    m.actualizarObservadores();
  });

  _crearEstrellas();
  AppController.getInstance().init();
});

function _crearEstrellas() {
  const c = document.getElementById('menuStars'); if (!c) return;
  for (let i = 0; i < 50; i++) {
    const s = document.createElement('div');
    s.className = 'star';
    const sz = 1 + Math.random() * 3;
    s.style.cssText =
      `left:${Math.random()*100}%;top:${Math.random()*100}%;`+
      `width:${sz}px;height:${sz}px;`+
      `--dur:${1.5+Math.random()*3}s;`+
      `animation-delay:${Math.random()*3}s;`+
      `opacity:${.3+Math.random()*.7}`;
    c.appendChild(s);
  }
}

function _mostrarLeyenda() {
  const ya = document.getElementById('leyendaModal');
  if (ya) { ya.remove(); return; }
  const m = document.createElement('div');
  m.id = 'leyendaModal';
  m.style.cssText =
    'position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.88);'+
    'backdrop-filter:blur(6px);display:flex;align-items:center;'+
    'justify-content:center;padding:16px;';
  m.innerHTML = `
    <div style="background:rgba(10,2,22,.97);border:1px solid rgba(255,100,0,.35);
      border-radius:18px;padding:28px 22px;max-width:420px;width:100%;text-align:center;
      color:#ffe8c0;font-family:'Rajdhani',sans-serif;
      box-shadow:0 0 40px rgba(255,80,0,.28);max-height:90dvh;overflow-y:auto;">
      <h2 style="font-family:'Cinzel Decorative',serif;color:#ffcc00;font-size:1.1rem;
        margin-bottom:16px;text-shadow:0 0 10px rgba(255,200,0,.6)">🔥 Historia de Felénix</h2>
      <p style="font-size:.92rem;line-height:1.9;color:#c8a070;margin-bottom:18px">
        En la era de los mundos primordiales, tres fuerzas eternas se fusionaron:<br><br>
        el <strong style="color:#ffcc00">Fénix</strong> del renacimiento,<br>
        el <strong style="color:#ff6600">Dragón</strong> del fuego ancestral,<br>
        y el <strong style="color:#ff9966">Gato</strong> de los nueve mundos.<br><br>
        De esta unión nació <em style="color:#ffd700">Felénix</em>,<br>
        criatura inmortal que muere y renace,<br>
        que vuela entre constelaciones y trepa montañas de lava,<br>
        que escupe llamas sagradas y ronronea con el universo.<br><br>
        <em style="color:#ffaa44;font-size:.95rem">
          Tú eres su guardián eterno.<br>
          Cuídalo con sabiduría, pues solo contigo puede alcanzar<br>
          la llama más alta del cielo eterno.
        </em>
      </p>
      <button onclick="SoundManager.getInstance().reproducirClick();document.getElementById('leyendaModal').remove()"
        style="margin-top:10px;padding:11px 30px;background:linear-gradient(135deg,#cc3300,#ff6600);
          border:none;border-radius:10px;color:#fff;font-family:'Cinzel Decorative',serif;
          font-size:.72rem;cursor:pointer;box-shadow:0 4px 14px rgba(255,80,0,.4)">
        CERRAR
      </button>
    </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });
}
