// Portal de Clase — lógica pública (lectura + entrega de tareas)
const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const vistaClases = document.getElementById('vista-clases');
const vistaTareas = document.getElementById('vista-tareas');
const vistaTitulo = document.getElementById('vista-titulo');
const selectorEstudiante = document.getElementById('selector-estudiante');
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

function formatearFechaHora(fechaISO) {
  const d = new Date(fechaISO);
  return d.toLocaleString('es-PA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function sanitizarNombre(str) {
  return str
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9.\-_]/g, '_');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function cargarConteos() {
  const { data, error } = await sb.from('tareas').select('materia, grado');
  if (error) { console.error(error); return; }
  document.querySelectorAll('.folder-card').forEach(card => {
    const materia = card.dataset.materia;
    const grado = card.dataset.grado;
    const total = data.filter(t => t.materia === materia && t.grado === grado).length;
    const el = card.querySelector('[data-conteo]');
    el.textContent = total === 0 ? 'sin tareas' : (total === 1 ? '1 tarea' : `${total} tareas`);
  });
}

// ---------- Selección de estudiante (guardada por sesión, por grado) ----------
function claveSesion(grado) { return `estudiante_${grado}`; }

function obtenerEstudianteSesion(grado) {
  const raw = sessionStorage.getItem(claveSesion(grado));
  return raw ? JSON.parse(raw) : null;
}

function guardarEstudianteSesion(grado, estudiante) {
  sessionStorage.setItem(claveSesion(grado), JSON.stringify(estudiante));
}

function borrarEstudianteSesion(grado) {
  sessionStorage.removeItem(claveSesion(grado));
}

async function abrirClase(materia, grado) {
  vistaTitulo.textContent = `${materia} · ${grado}`;
  selectorEstudiante.innerHTML = '';
  listaTareas.innerHTML = '<p class="estado-cargando">Cargando…</p>';
  vistaClases.style.display = 'none';
  vistaTareas.classList.remove('oculto');

  const estudianteGuardado = obtenerEstudianteSesion(grado);
  if (estudianteGuardado) {
    renderBannerEstudiante(materia, grado, estudianteGuardado);
    await cargarTareasConEstado(materia, grado, estudianteGuardado);
  } else {
    await mostrarSelectorEstudiante(materia, grado);
  }
}

async function mostrarSelectorEstudiante(materia, grado) {
  listaTareas.innerHTML = '';
  selectorEstudiante.innerHTML = `<p class="estado-cargando">Cargando lista de estudiantes…</p>`;

  const { data, error } = await sb
    .from('estudiantes')
    .select('id, nombre, cedula, puede_publicar_tareas')
    .eq('salon', grado)
    .order('nombre', { ascending: true });

  if (error) {
    selectorEstudiante.innerHTML = `<p class="estado-vacio">No se pudo cargar la lista de estudiantes. Avísale al profesor.</p>`;
    console.error(error);
    return;
  }

  selectorEstudiante.innerHTML = `
    <div class="selector-estudiante">
      <label for="sel-quien-soy">¿Quién eres?</label>
      <select id="sel-quien-soy">
        <option value="">-- Selecciona tu nombre --</option>
        ${data.map(e => `<option value="${e.id}">${escapeHtml(e.nombre)}</option>`).join('')}
      </select>
      <button id="btn-continuar-estudiante">Continuar</button>
    </div>
  `;

  document.getElementById('btn-continuar-estudiante').addEventListener('click', async () => {
    const id = document.getElementById('sel-quien-soy').value;
    if (!id) return;
    const estudiante = data.find(e => e.id === id);
    guardarEstudianteSesion(grado, estudiante);
    renderBannerEstudiante(materia, grado, estudiante);
    await cargarTareasConEstado(materia, grado, estudiante);
  });
}

function renderBannerEstudiante(materia, grado, estudiante) {
  selectorEstudiante.innerHTML = `
    <div class="banner-estudiante">
      <span>👤 ${escapeHtml(estudiante.nombre)}</span>
      <button class="cambiar" id="btn-cambiar-estudiante">Cambiar estudiante</button>
    </div>
    ${!estudiante.puede_publicar_tareas ? `
      <div class="aviso-bloqueo">
        ⚠️ Tu registro de estudiante está incompleto (faltan datos como teléfono u otra información).
        Habla con el profesor para poder entregar tareas. Igual puedes ver cuáles tienes pendientes.
      </div>
    ` : ''}
  `;
  document.getElementById('btn-cambiar-estudiante').addEventListener('click', () => {
    borrarEstudianteSesion(grado);
    mostrarSelectorEstudiante(materia, grado);
    listaTareas.innerHTML = '';
  });
}

function determinarEstado(fechaEntrega) {
  if (!fechaEntrega) return 'a_tiempo';
  const limite = new Date(`${fechaEntrega}T23:59:59`);
  return new Date() <= limite ? 'a_tiempo' : 'tarde';
}

async function cargarTareasConEstado(materia, grado, estudiante) {
  listaTareas.innerHTML = '<p class="estado-cargando">Cargando tareas…</p>';

  const [{ data: tareas, error: errTareas }, { data: entregas, error: errEntregas }] = await Promise.all([
    sb.from('tareas').select('*').eq('materia', materia).eq('grado', grado).order('creado_en', { ascending: false }),
    sb.from('entregas').select('*').eq('materia', materia).eq('grado', grado).eq('estudiante_id', estudiante.id),
  ]);

  if (errTareas) {
    listaTareas.innerHTML = '<p class="estado-vacio">No se pudieron cargar las tareas. Intenta de nuevo más tarde.</p>';
    console.error(errTareas);
    return;
  }
  if (errEntregas) console.error(errEntregas);

  if (!tareas.length) {
    listaTareas.innerHTML = '<p class="estado-vacio">Todavía no hay tareas publicadas para esta clase.</p>';
    return;
  }

  const entregasPorTarea = {};
  (entregas || []).forEach(en => { entregasPorTarea[en.tarea_id] = en; });

  const accent = ACCENTOS[materia] || 'var(--ciencias)';

  listaTareas.innerHTML = tareas.map(t => {
    const entrega = entregasPorTarea[t.id];
    return `
      <article class="tarea-item" style="--accent:${accent}" data-tarea-id="${t.id}">
        <h3>${escapeHtml(t.titulo)}</h3>
        ${t.descripcion ? `<p>${escapeHtml(t.descripcion)}</p>` : ''}
        <div class="tarea-meta">
          <span>Publicado: ${formatearFecha(t.creado_en.split('T')[0])}</span>
          ${t.fecha_entrega ? `<span class="entrega">Entrega: ${formatearFecha(t.fecha_entrega)}</span>` : ''}
        </div>
        ${t.archivo_url ? `<a class="btn-descargar" href="${t.archivo_url}" target="_blank" rel="noopener">${t.archivo_nombre ? '↓ Descargar archivo' : '↗ Abrir enlace'}</a>` : ''}

        <div class="estado-entrega">
          ${renderEstadoEntrega(t, entrega, estudiante)}
        </div>
      </article>
    `;
  }).join('');

  // Conectar los formularios de entrega que se hayan renderizado
  tareas.forEach(t => {
    if (entregasPorTarea[t.id]) return; // ya entregada, no hay formulario
    if (!estudiante.puede_publicar_tareas) return; // bloqueado, no hay formulario
    const form = document.querySelector(`[data-form-entrega="${t.id}"]`);
    if (!form) return;
    form.addEventListener('submit', (e) => manejarEnvioEntrega(e, t, materia, grado, estudiante));
  });
}

function renderEstadoEntrega(tarea, entrega, estudiante) {
  if (entrega) {
    const esATiempo = entrega.estado === 'a_tiempo';
    return `
      <span class="badge-estado ${esATiempo ? 'a-tiempo' : 'tarde'}">
        ${esATiempo ? '✓ Entregada a tiempo' : '✓ Entregada después de la fecha'}
      </span>
      <p style="font-size:12px; color:var(--muted); margin:4px 0 0;">
        Enviada el ${formatearFechaHora(entrega.entregado_en)}
        · <a href="${entrega.entrega_url}" target="_blank" rel="noopener" style="color:var(--muted);">ver lo que enviaste</a>
      </p>
    `;
  }

  if (!estudiante.puede_publicar_tareas) {
    return `<span class="badge-estado pendiente">Pendiente</span>`;
  }

  return `
    <span class="badge-estado pendiente">Pendiente</span>
    <form class="form-entrega" data-form-entrega="${tarea.id}">
      <input type="file" name="archivo">
      <input type="url" name="enlace" placeholder="O pega un enlace en vez de subir archivo">
      <button type="submit">Entregar tarea</button>
      <p class="msg"></p>
    </form>
  `;
}

async function manejarEnvioEntrega(e, tarea, materia, grado, estudiante) {
  e.preventDefault();
  const form = e.target;
  const msg = form.querySelector('.msg');
  const boton = form.querySelector('button');
  const archivo = form.querySelector('input[name="archivo"]').files[0];
  const enlace = form.querySelector('input[name="enlace"]').value.trim();

  if (!archivo && !enlace) {
    msg.textContent = 'Selecciona un archivo o pega un enlace.';
    msg.className = 'msg error';
    return;
  }

  boton.disabled = true;
  msg.textContent = 'Enviando…';
  msg.className = 'msg';

  try {
    let tipo, entrega_url;

    if (enlace) {
      tipo = 'enlace';
      entrega_url = enlace;
    } else {
      tipo = 'archivo';
      const ruta = `${sanitizarNombre(materia)}/${sanitizarNombre(grado)}/${Date.now()}-${sanitizarNombre(estudiante.nombre)}-${sanitizarNombre(archivo.name)}`;
      const { error: errSubida } = await sb.storage.from('entregas-archivos').upload(ruta, archivo);
      if (errSubida) throw errSubida;
      const { data: pub } = sb.storage.from('entregas-archivos').getPublicUrl(ruta);
      entrega_url = pub.publicUrl;
    }

    const estado = determinarEstado(tarea.fecha_entrega);

    const { error: errInsert } = await sb.from('entregas').insert({
      tarea_id: tarea.id,
      estudiante_id: estudiante.id,
      estudiante_nombre: estudiante.nombre,
      cedula: estudiante.cedula,
      materia, grado, tipo, entrega_url, estado,
    });
    if (errInsert) throw errInsert;

    // Recargar la vista para mostrar el estado "Entregada"
    await cargarTareasConEstado(materia, grado, estudiante);
  } catch (err) {
    console.error(err);
    msg.textContent = 'Ocurrió un error al entregar. Intenta de nuevo.';
    msg.className = 'msg error';
    boton.disabled = false;
  }
}

document.querySelectorAll('.folder-card').forEach(card => {
  card.addEventListener('click', () => abrirClase(card.dataset.materia, card.dataset.grado));
});

btnVolver.addEventListener('click', () => {
  vistaTareas.classList.add('oculto');
  vistaClases.style.display = '';
});

cargarConteos();
