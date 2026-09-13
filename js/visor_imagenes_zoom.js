// Pantalla completa, zoom con rueda o pellizco, desplazamiento por
// arrastre, y navegación a la siguiente/anterior imagen de la misma
// galería con un toque (o con los botones ‹ ›, o con las flechas del
// teclado). Al abrir una imagen intenta entrar a pantalla completa de
// una vez (si el navegador lo permite); si no, igual queda ocupando
// toda la pantalla dentro de su propio overlay.
(() => {
  const selector = '.gallery img,#grid img,.photo';
  const overlay = document.createElement('div');
  let scale = 1, x = 0, y = 0;
  let points = new Map(), lastDist = 0;
  let lista = [], idx = 0;
  let temporizadorClick = null;

  overlay.id = 'zoom8';
  overlay.innerHTML =
    '<div class="zbar">' +
    '<button data-z="prev" title="Anterior">‹</button>' +
    '<button data-z="out" title="Alejar">−</button>' +
    '<button data-z="reset" title="Restablecer">100%</button>' +
    '<button data-z="in" title="Acercar">+</button>' +
    '<button data-z="next" title="Siguiente">›</button>' +
    '<button data-z="full" title="Pantalla completa">⛶</button>' +
    '<button data-z="close" title="Cerrar">×</button>' +
    '</div><div class="zstage"><img alt="Imagen ampliada"></div>';

  const css = document.createElement('style');
  css.textContent =
    '#zoom8{display:none;position:fixed;inset:0;z-index:100000;background:#050505;touch-action:none;overflow:hidden}' +
    '#zoom8.open{display:block}' +
    '#zoom8 .zstage{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;overflow:hidden;cursor:grab}' +
    '#zoom8 img{max-width:94vw;max-height:90vh;width:auto;height:auto;object-fit:contain;user-select:none;-webkit-user-drag:none;transform-origin:center;will-change:transform}' +
    '#zoom8 .zbar{position:fixed;z-index:2;top:12px;right:12px;display:flex;gap:6px;background:#000a;padding:7px;border-radius:30px;flex-wrap:wrap;max-width:96vw;justify-content:flex-end}' +
    '#zoom8 button{border:0;border-radius:50%;width:40px;height:40px;background:#fff;color:#111;font:bold 18px Arial;cursor:pointer}' +
    '#zoom8 [data-z=reset]{width:60px;border-radius:22px;font-size:12px}' +
    '@media(max-width:520px){#zoom8 .zbar{left:50%;right:auto;transform:translateX(-50%)}#zoom8 button{width:38px;height:38px;font-size:16px}}';
  document.head.append(css);
  document.body.append(overlay);

  const img = overlay.querySelector('img');
  const stage = overlay.querySelector('.zstage');

  const draw = () => {
    img.style.transform = `translate(${x}px,${y}px) scale(${scale})`;
    overlay.querySelector('[data-z=reset]').textContent = `${Math.round(scale * 100)}%`;
  };
  const reset = () => { scale = 1; x = 0; y = 0; draw(); };
  const zoom = (f, cx = innerWidth / 2, cy = innerHeight / 2) => {
    const old = scale;
    scale = Math.max(1, Math.min(6, scale * f));
    if (scale === 1) { x = 0; y = 0; }
    else {
      x -= (cx - innerWidth / 2 - x) * (scale / old - 1);
      y -= (cy - innerHeight / 2 - y) * (scale / old - 1);
    }
    draw();
  };
  const close = () => {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    if (document.fullscreenElement === overlay) document.exitFullscreen().catch(() => {});
  };

  // Muestra la imagen "i" de la lista actual (con vuelta de carrusel:
  // después de la última vuelve a la primera, y viceversa) y resetea
  // el zoom/paneo para que cada imagen nueva empiece limpia.
  const show = (i) => {
    if (!lista.length) return;
    idx = ((i % lista.length) + lista.length) % lista.length;
    const el = lista[idx];
    img.src = el.currentSrc || el.src;
    img.alt = el.alt || 'Imagen ampliada';
    reset();
  };

  // Abre la galería en la imagen "el" (arma la lista de imágenes de
  // esta misma galería, entra a pantalla completa de una vez si el
  // navegador lo permite, y muestra la imagen tocada).
  const abrir = (el) => {
    lista = [...document.querySelectorAll(selector)];
    idx = Math.max(0, lista.indexOf(el));
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    show(idx);
    overlay.requestFullscreen?.().catch(() => {});
  };

  document.addEventListener('click', (e) => {
    const t = e.target.closest(selector);
    if (t) { e.preventDefault(); e.stopImmediatePropagation(); abrir(t); return; }
    const b = e.target.closest('[data-z]');
    if (!b) return;
    ({
      in: () => zoom(1.3),
      out: () => zoom(1 / 1.3),
      reset,
      close,
      prev: () => show(idx - 1),
      next: () => show(idx + 1),
      full: () => (document.fullscreenElement ? document.exitFullscreen() : overlay.requestFullscreen?.()),
    }[b.dataset.z] || (() => {}))();
  }, true);

  overlay.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoom(e.deltaY < 0 ? 1.18 : 1 / 1.18, e.clientX, e.clientY);
  }, { passive: false });

  stage.onpointerdown = (e) => {
    stage.setPointerCapture(e.pointerId);
    points.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  stage.onpointermove = (e) => {
    if (!points.has(e.pointerId)) return;
    const old = points.get(e.pointerId);
    points.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const a = [...points.values()];
    if (a.length === 1 && scale > 1) {
      x += e.clientX - old.x;
      y += e.clientY - old.y;
      draw();
    } else if (a.length === 2) {
      const dist = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
      if (lastDist) zoom(dist / lastDist, (a[0].x + a[1].x) / 2, (a[0].y + a[1].y) / 2);
      lastDist = dist;
    }
  };
  ['pointerup', 'pointercancel'].forEach((n) => stage.addEventListener(n, (e) => {
    points.delete(e.pointerId);
    lastDist = 0;
  }));

  stage.ondblclick = () => (scale === 1 ? zoom(2) : reset());

  // Un solo toque en el tercio izquierdo/derecho de la imagen pasa a
  // la anterior/siguiente — pero solo si no está con zoom (si hay
  // zoom, ese gesto se usa para arrastrar/ver detalle, no para
  // cambiar de imagen). Se espera un instante antes de actuar, para
  // no "comerse" el primer click de un doble clic (que hace zoom).
  stage.addEventListener('click', (e) => {
    if (temporizadorClick) { clearTimeout(temporizadorClick); temporizadorClick = null; return; }
    const clickX = e.clientX;
    temporizadorClick = setTimeout(() => {
      temporizadorClick = null;
      if (scale !== 1) return;
      const w = innerWidth;
      if (clickX < w / 3) show(idx - 1);
      else if (clickX > (w * 2) / 3) show(idx + 1);
    }, 250);
  });

  document.addEventListener('keydown', (e) => {
    if (!overlay.classList.contains('open')) return;
    if (e.key === 'Escape') close();
    if (e.key === '+') zoom(1.3);
    if (e.key === '-') zoom(1 / 1.3);
    if (e.key === 'ArrowLeft') show(idx - 1);
    if (e.key === 'ArrowRight') show(idx + 1);
  });
})();
