// Portal de Clase — lógica pública (lectura + entrega de tareas)
//
// Las tareas y el material de clase se ven SIEMPRE, sin pedir nada.
// Solo para poder "Entregar" una tarea se necesita saber quién es el
// estudiante: en vez de escribir su nombre a mano, lo elige de una
// lista desplegable (la misma lista de estudiantes de ese salón que
// ya carga el profesor/administrador) y agrega su teléfono. Eso se
// pide UNA sola vez por dispositivo; el navegador lo recuerda
// (localStorage) y de ahí en adelante entrega directo.
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

const CLAVE_IDENTIDAD = 'nj_portal_identidad';

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

// ---------- Identidad guardada en este navegador ----------
// { estudianteId, nombre, cedula, telefono, salon }
function obtenerIdentidadGuardada() {
  try {
    const bruto = localStorage.getItem(CLAVE_IDENTIDAD);
    if (!bruto) return null;
    const datos = JSON.parse(bruto);
    if (!datos || !datos.estudianteId || !datos.nombre) return null;
    return datos;
  } catch {
    return null;
  }
}

function guardarIdentidad(identidad) {
  try {
    localStorage.setItem(CLAVE_IDENTIDAD, JSON.stringify(identidad));
  } catch {
    // Si el navegador bloquea localStorage (modo privado, etc.) no pasa
    // nada grave: simplemente se le volverá a pedir la próxima vez.
  }
}

function borrarIdentidad() {
  try { localStorage.removeItem(CLAVE_IDENTIDAD); } catch {}
}

// Identidad guardada, pero solo sirve si es del mismo salón que se
// está viendo ahora mismo (si alguien más usa el mismo dispositivo
// para otro grado, se le vuelve a pedir su nombre).
function identidadValidaPara(grado) {
  const identidad = obtenerIdentidadGuardada();
  if (!identidad || identidad.salon !== grado) return null;
  return identidad;
}

// ---------- Material de clase (Clase 1, Clase 2... + Examen final) ----------
async function cargarMaterialClase(materia, grado) {
  const contenedor = document.getElementById('material-clase');
  if (!contenedor) return;
  contenedor.innerHTML = '';

  const [{ data: clases, error: errClases }, { data: tareasResumen }] = await Promise.all([
    sb.from('clases').select('*').eq('materia', materia).eq('grado', grado).order('numero', { ascending: true }),
    sb.from('tareas').select('id, titulo, clase_numero').eq('materia', materia).eq('grado', grado),
  ]);

  if (errClases) { console.error(errClases); return; }

  const listaClasesData = (clases || []).filter(c => !c.es_examen_final);
  const examen = (clases || []).find(c => c.es_examen_final);

  if (!listaClasesData.length && !examen) return;

  const tareasPorClase = {};
  (tareasResumen || []).forEach(t => {
    if (t.clase_numero == null) return;
    (tareasPorClase[t.clase_numero] = tareasPorClase[t.clase_numero] || []).push(t);
  });

  const accent = ACCENTOS[materia] || 'var(--ciencias)';

  const tarjetasClases = listaClasesData.map(c => {
    const tareasDeEsta = tareasPorClase[c.numero] || [];
    return `
      <article class="tarea-item" style="--accent:${accent}">
        <h3>Clase ${c.numero}</h3>
        ${(c.fecha_inicio || c.fecha_fin) ? `
          <div class="tarea-meta">
            <span>${formatearFecha(c.fecha_inicio) || '?'} — ${formatearFecha(c.fecha_fin) || '?'}</span>
          </div>
        ` : ''}
        <a class="btn-descargar" href="${c.archivo_url}" target="_blank" rel="noopener">${c.tipo === 'archivo' ? '↓ Descargar material' : '↗ Abrir enlace'}</a>
        ${tareasDeEsta.length ? `
          <p style="font-size:12px; color:var(--muted); margin:10px 0 0;">Tareas de esta clase:</p>
          <ul style="margin:4px 0 0; padding-left:18px; font-size:13px;">
            ${tareasDeEsta.map(t => `<li>${escapeHtml(t.titulo)}</li>`).join('')}
          </ul>
        ` : ''}
      </article>
    `;
  }).join('');

  const tarjetaExamen = examen ? `
    <article class="tarea-item" style="--accent:var(--coral); border-color:var(--coral);">
      <h3>📕 Examen final</h3>
      <a class="btn-descargar" href="${examen.archivo_url}" target="_blank" rel="noopener">${examen.tipo === 'archivo' ? '↓ Descargar examen' : '↗ Abrir enlace'}</a>
    </article>
  ` : '';

  contenedor.innerHTML = `
    <h3 style="font-family:'Space Grotesk',sans-serif; margin:0 0 12px;">Material de clase</h3>
    ${tarjetasClases}
    ${tarjetaExamen}
  `;
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

// ---------- Abrir una clase (materia + grado) ----------
async function abrirClase(materia, grado) {
  vistaTitulo.textContent = `${materia} · ${grado}`;
  listaTareas.innerHTML = '<p class="estado-cargando">Cargando…</p>';
  vistaClases.style.display = 'none';
  vistaTareas.classList.remove('oculto');

  cargarMaterialClase(materia, grado);
  renderIdentidadWidget(materia, grado);
  await cargarTareas(materia, grado);
}

// ---------- Widget de identidad (arriba de la lista de tareas) ----------
// Si ya sabemos quién es (mismo salón), se muestra un banner chiquito.
// Si no, se muestra el selector con la lista de estudiantes del salón
// + teléfono. Esto NO bloquea ver las tareas, solo hace falta para
// poder entregarlas.
function renderIdentidadWidget(materia, grado) {
  const identidad = identidadValidaPara(grado);

  if (identidad) {
    selectorEstudiante.innerHTML = `
      <div class="banner-estudiante">
        <span>👤 ${escapeHtml(identidad.nombre)}</span>
        <button class="cambiar" id="btn-cambiar-identidad">¿No eres tú? Cambiar</button>
      </div>
    `;
    document.getElementById('btn-cambiar-identidad').addEventListener('click', async () => {
      borrarIdentidad();
      renderIdentidadWidget(materia, grado);
      await cargarTareas(materia, grado);
    });
    return;
  }

  selectorEstudiante.innerHTML = `
    <div class="selector-estudiante" id="identidad-widget">
      <label for="idNombreSelect">Tu nombre (elige de la lista de tu salón)</label>
      <select id="idNombreSelect"><option value="">Cargando estudiantes…</option></select>
      <label for="idTelefono">Teléfono</label>
      <input type="tel" id="idTelefono" placeholder="6000-0000">
      <button id="btn-guardar-identidad">Guardar y poder entregar tareas</button>
      <p class="msg" id="msgIdentidad"></p>
    </div>
  `;

  cargarSelectorNombres(grado);

  document.getElementById('btn-guardar-identidad').addEventListener('click', async () => {
    const select = document.getElementById('idNombreSelect');
    const opcion = select.selectedOptions[0];
    const telefono = document.getElementById('idTelefono').value.trim();
    const msg = document.getElementById('msgIdentidad');

    if (!select.value) {
      msg.textContent = 'Selecciona tu nombre en la lista.';
      msg.className = 'msg error';
      return;
    }
    if (!telefono) {
      msg.textContent = 'Escribe tu teléfono.';
      msg.className = 'msg error';
      return;
    }

    const identidad = {
      estudianteId: opcion.dataset.id,
      nombre: opcion.dataset.nombre,
      cedula: opcion.dataset.cedula || '',
      telefono,
      salon: grado,
    };
    guardarIdentidad(identidad);

    renderIdentidadWidget(materia, grado);
    await cargarTareas(materia, grado);
  });
}

// Carga la lista de estudiantes de ese salón (la misma que ya usa el
// profesor/administrador en "estudiantes") para el <select>.
async function cargarSelectorNombres(grado) {
  const select = document.getElementById('idNombreSelect');
  if (!select) return;

  const { data: estudiantes, error } = await sb
    .from('estudiantes')
    .select('id, nombre, cedula')
    .eq('salon', grado)
    .order('nombre', { ascending: true });

  if (error) {
    console.error(error);
    select.innerHTML = '<option value="">No se pudo cargar la lista. Recarga la página.</option>';
    return;
  }

  if (!estudiantes || !estudiantes.length) {
    select.innerHTML = '<option value="">Tu salón todavía no tiene estudiantes cargados. Avísale al profesor.</option>';
    return;
  }

  select.innerHTML = '<option value="">Selecciona tu nombre</option>' +
    estudiantes.map(e => `
      <option value="${e.id}" data-id="${e.id}" data-nombre="${escapeHtml(e.nombre)}" data-cedula="${escapeHtml(e.cedula || '')}">
        ${escapeHtml(e.nombre)}
      </option>
    `).join('');
}

function determinarEstado(fechaEntrega) {
  if (!fechaEntrega) return 'a_tiempo';
  const limite = new Date(`${fechaEntrega}T23:59:59`);
  return new Date() <= limite ? 'a_tiempo' : 'tarde';
}

// ---------- Cargar y mostrar TODAS las tareas (siempre visibles) ----------
async function cargarTareas(materia, grado) {
  listaTareas.innerHTML = '<p class="estado-cargando">Cargando tareas…</p>';

  const identidad = identidadValidaPara(grado);

  const promesas = [
    sb.from('tareas').select('*').eq('materia', materia).eq('grado', grado).order('creado_en', { ascending: false }),
  ];
  if (identidad) {
    promesas.push(
      sb.from('entregas').select('*').eq('materia', materia).eq('grado', grado).eq('estudiante_id', identidad.estudianteId)
    );
  }

  const resultados = await Promise.all(promesas);
  const { data: tareas, error: errTareas } = resultados[0];
  const entregas = identidad ? (resultados[1].data || []) : [];
  if (identidad && resultados[1].error) console.error(resultados[1].error);

  if (errTareas) {
    listaTareas.innerHTML = '<p class="estado-vacio">No se pudieron cargar las tareas. Intenta de nuevo más tarde.</p>';
    console.error(errTareas);
    return;
  }

  if (!tareas.length) {
    listaTareas.innerHTML = '<p class="estado-vacio">Todavía no hay tareas publicadas para esta clase.</p>';
    return;
  }

  const entregasPorTarea = {};
  entregas.forEach(en => { entregasPorTarea[en.tarea_id] = en; });

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
          ${renderEstadoEntrega(t, entrega, identidad)}
        </div>
      </article>
    `;
  }).join('');

  // Conectar los formularios de entrega que se hayan renderizado
  if (identidad) {
    tareas.forEach(t => {
      if (entregasPorTarea[t.id]) return; // ya entregada, no hay formulario
      const form = document.querySelector(`[data-form-entrega="${t.id}"]`);
      if (!form) return;
      form.addEventListener('submit', (e) => manejarEnvioEntrega(e, t, materia, grado, identidad));
    });
  }

  // Botón "Selecciona tu nombre" cuando todavía no hay identidad
  document.querySelectorAll('[data-ir-a-identidad]').forEach(boton => {
    boton.addEventListener('click', () => {
      const widget = document.getElementById('identidad-widget');
      if (widget) widget.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });
}

function renderEstadoEntrega(tarea, entrega, identidad) {
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

  if (!identidad) {
    return `
      <span class="badge-estado pendiente">Pendiente</span>
      <p style="font-size:12px; color:var(--muted); margin:6px 0 0;">
        <a href="#" data-ir-a-identidad style="color:var(--muted);">Selecciona tu nombre arriba para poder entregarla ↑</a>
      </p>
    `;
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

async function manejarEnvioEntrega(e, tarea, materia, grado, identidad) {
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
      const ruta = `${sanitizarNombre(materia)}/${sanitizarNombre(grado)}/${Date.now()}-${sanitizarNombre(identidad.nombre)}-${sanitizarNombre(archivo.name)}`;
      const { error: errSubida } = await sb.storage.from('entregas-archivos').upload(ruta, archivo);
      if (errSubida) throw errSubida;
      const { data: pub } = sb.storage.from('entregas-archivos').getPublicUrl(ruta);
      entrega_url = pub.publicUrl;
    }

    const estado = determinarEstado(tarea.fecha_entrega);

    const { error: errInsert } = await sb.from('entregas').insert({
      tarea_id: tarea.id,
      estudiante_id: identidad.estudianteId,
      estudiante_nombre: identidad.nombre,
      cedula: identidad.cedula,
      telefono: identidad.telefono,
      materia, grado, tipo, entrega_url, estado,
    });
    if (errInsert) throw errInsert;

    // Recargar la vista para mostrar el estado "Entregada"
    await cargarTareas(materia, grado);
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
