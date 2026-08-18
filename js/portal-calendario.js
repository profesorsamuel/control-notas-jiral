// Portal de Clase — calendario escolar (trimestre actual + días libres)
// Basado en el calendario oficial MEDUCA 2026 (Decreto Ejecutivo N.° 49).
// Este archivo es independiente de portal-clase.js: solo pinta el
// encabezado (trimestre + días libres) y activa los botones de
// "Accesos rápidos" que todavía no tienen función (muestran un aviso).

(function () {

  const TRIMESTRES = [
    { id: 1, nombre: 'I Trimestre',   inicio: '2026-03-02', fin: '2026-05-29' },
    { id: 2, nombre: 'II Trimestre',  inicio: '2026-06-08', fin: '2026-09-04' },
    { id: 3, nombre: 'III Trimestre', inicio: '2026-09-14', fin: '2026-12-11' },
  ];

  const RECESOS = [
    { nombre: 'Receso escolar',            inicio: '2026-02-23', fin: '2026-02-27' },
    { nombre: 'Receso escolar',            inicio: '2026-06-01', fin: '2026-06-05' },
    { nombre: 'Receso escolar',            inicio: '2026-09-07', fin: '2026-09-11' },
    { nombre: 'Balance y graduaciones',    inicio: '2026-12-14', fin: '2026-12-18' },
  ];

  // Días libres / feriados que caen DENTRO de cada trimestre.
  const DIAS_LIBRES = {
    1: [
      { fecha: '2026-02-18', nombre: 'Miércoles de Ceniza' },
      { fecha: '2026-04-02', nombre: 'Jueves Santo' },
      { fecha: '2026-04-03', nombre: 'Viernes Santo' },
      { fecha: '2026-05-01', nombre: 'Día del Trabajo' },
    ],
    2: [
      // No hay feriados nacionales obligatorios dentro de este trimestre.
    ],
    3: [
      { fecha: '2026-11-02', nombre: 'Día de los Difuntos (asueto nacional)' },
      { fecha: '2026-11-03', nombre: 'Separación de Panamá de Colombia' },
      { fecha: '2026-11-04', nombre: 'Día de los Símbolos Patrios' },
      { fecha: '2026-11-05', nombre: 'Consolidación de la Separación en Colón' },
      { fecha: '2026-11-10', nombre: 'Grito de Independencia (Villa de Los Santos)' },
      { fecha: '2026-11-28', nombre: 'Independencia de Panamá de España' },
      { fecha: '2026-12-08', nombre: 'Día de las Madres' },
    ],
  };

  function parseFecha(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function formatearFecha(str) {
    const f = parseFecha(str);
    return f.toLocaleDateString('es-PA', { day: '2-digit', month: 'short' });
  }

  function hoyEntre(inicio, fin, hoy) {
    return hoy >= parseFecha(inicio) && hoy <= parseFecha(fin);
  }

  function calcularEstado() {
    // window.__DEMO_HOY__ permite simular una fecha (solo para vistas previas).
    const hoy = window.__DEMO_HOY__ ? parseFecha(window.__DEMO_HOY__) : new Date();
    hoy.setHours(0, 0, 0, 0);

    for (const t of TRIMESTRES) {
      if (hoyEntre(t.inicio, t.fin, hoy)) {
        return { tipo: 'trimestre', trimestre: t };
      }
    }
    for (const r of RECESOS) {
      if (hoyEntre(r.inicio, r.fin, hoy)) {
        const siguiente = TRIMESTRES.find(t => parseFecha(t.inicio) > hoy);
        return { tipo: 'receso', receso: r, siguiente };
      }
    }
    // Fuera de todo rango: mostrar el trimestre más próximo.
    const futuro = TRIMESTRES.find(t => parseFecha(t.inicio) > hoy);
    if (futuro) return { tipo: 'proximo', trimestre: futuro };
    return { tipo: 'finalizado' };
  }

  function renderBadge(estado) {
    const badge = document.getElementById('badge-trimestre');
    if (!badge) return;

    if (estado.tipo === 'trimestre') {
      badge.textContent = `📘 ${estado.trimestre.nombre} · hasta ${formatearFecha(estado.trimestre.fin)}`;
    } else if (estado.tipo === 'receso') {
      badge.textContent = estado.siguiente
        ? `🏖️ ${estado.receso.nombre} · vuelve el ${formatearFecha(estado.siguiente.inicio)}`
        : `🏖️ ${estado.receso.nombre}`;
    } else if (estado.tipo === 'proximo') {
      badge.textContent = `📘 ${estado.trimestre.nombre} · inicia ${formatearFecha(estado.trimestre.inicio)}`;
    } else {
      badge.textContent = '🎓 Año escolar finalizado';
    }
  }

  function renderDiasLibres(estado) {
    const cont = document.getElementById('dias-libres-lista');
    const wrap = document.getElementById('dias-libres');
    if (!cont || !wrap) return;

    const trimestreActivo = estado.trimestre || (estado.siguiente || null);
    const lista = trimestreActivo ? (DIAS_LIBRES[trimestreActivo.id] || []) : [];

    if (!trimestreActivo) {
      wrap.classList.add('oculto');
      return;
    }

    if (lista.length === 0) {
      cont.innerHTML = '<p class="dias-libres-vacio">No hay días libres programados en este trimestre. ¡A clases! 🎒</p>';
      return;
    }

    cont.innerHTML = lista.map(d => `
      <span class="dia-libre-chip">
        <strong>${formatearFecha(d.fecha)}</strong>${escapeHtml(d.nombre)}
      </span>
    `).join('');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function activarAccesosRapidos() {
    const toast = document.getElementById('toast-proximamente');
    document.querySelectorAll('[data-proximamente]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!toast) return;
        const nombre = btn.textContent.trim();
        toast.textContent = `🚧 "${nombre}" estará disponible próximamente.`;
        toast.classList.remove('oculto');
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => toast.classList.add('oculto'), 3200);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    const estado = calcularEstado();
    renderBadge(estado);
    renderDiasLibres(estado);
    activarAccesosRapidos();
  });

})();
