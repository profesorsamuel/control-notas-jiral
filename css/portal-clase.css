// Portal de Clase — lógica pública (solo lectura)
const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const vistaClases = document.getElementById('vista-clases');
const vistaTareas = document.getElementById('vista-tareas');
const vistaTitulo = document.getElementById('vista-titulo');
const listaTareas = document.getElementById('lista-tareas');
const btnVolver = document.getElementById('btn-volver');

const ACCENTOS = {
  'Ciencias Naturales': 'var(--ciencias)',
  'Ciencias': 'var(--ciencias)',
  'Informática': 'var(--informatica)',
};

function formatearFecha(fechaISO) {
  if (!fechaISO) return null;
  const [y, m, d] = fechaISO.split('-');
  return `${d}/${m}/${y}`;
}

async function cargarConteos() {
  const { data, error } = await sb.from('tareas').select('materia, grado');
  if (error) {
    console.error(error);
    return;
  }
  document.querySelectorAll('.folder-card').forEach(card => {
    const materia = card.dataset.materia;
    const grado = card.dataset.grado;
    const total = data.filter(t => t.materia === materia && t.grado === grado).length;
    const el = card.querySelector('[data-conteo]');
    el.textContent = total === 0 ? 'sin tareas' : (total === 1 ? '1 tarea' : `${total} tareas`);
  });
}

async function abrirClase(materia, grado) {
  vistaTitulo.textContent = `${materia} · ${grado}`;
  listaTareas.innerHTML = '<p class="estado-cargando">Cargando tareas…</p>';
  vistaClases.style.display = 'none';
  vistaTareas.classList.remove('oculto');

  const { data, error } = await sb
    .from('tareas')
    .select('*')
    .eq('materia', materia)
    .eq('grado', grado)
    .order('creado_en', { ascending: false });

  if (error) {
    listaTareas.innerHTML = '<p class="estado-vacio">No se pudieron cargar las tareas. Intenta de nuevo más tarde.</p>';
    console.error(error);
    return;
  }

  if (!data.length) {
    listaTareas.innerHTML = '<p class="estado-vacio">Todavía no hay tareas publicadas para esta clase.</p>';
    return;
  }

  const accent = ACCENTOS[materia] || 'var(--ciencias)';
  listaTareas.innerHTML = data.map(t => `
    <article class="tarea-item" style="--accent:${accent}">
      <h3>${escapeHtml(t.titulo)}</h3>
      ${t.descripcion ? `<p>${escapeHtml(t.descripcion)}</p>` : ''}
      <div class="tarea-meta">
        <span>Publicado: ${formatearFecha(t.creado_en.split('T')[0])}</span>
        ${t.fecha_entrega ? `<span class="entrega">Entrega: ${formatearFecha(t.fecha_entrega)}</span>` : ''}
      </div>
      ${t.archivo_url ? `<a class="btn-descargar" href="${t.archivo_url}" target="_blank" rel="noopener">↓ Descargar archivo</a>` : ''}
    </article>
  `).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

document.querySelectorAll('.folder-card').forEach(card => {
  card.addEventListener('click', () => abrirClase(card.dataset.materia, card.dataset.grado));
});

btnVolver.addEventListener('click', () => {
  vistaTareas.classList.add('oculto');
  vistaClases.style.display = '';
});

cargarConteos();
