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
const fichaClase = document.getElementById('ficha-clase');
const selectorEstudiante = document.getElementById('selector-estudiante');
const listaTareas = document.getElementById('lista-tareas');
const btnVolver = document.getElementById('btn-volver');

const ACCENTOS = {
  'Ciencias Naturales': 'var(--ciencias)',
  'Ciencias': 'var(--ciencias)',
  'Informática': 'var(--informatica)',
};

// Datos fijos de la ficha (encabezado tipo "hoja de trabajo")
const ESCUELA_NOMBRE = 'C.E.B.G. El Jiral';
const PROFESOR_NOMBRE = 'Samuel Ortega';

// ---------- Ficha institucional (escuela · materia · profesor · grado) ----------
function renderFicha(materia, grado) {
  if (!fichaClase) return;
  fichaClase.innerHTML = `
    <p class="ficha-escuela">${escapeHtml(ESCUELA_NOMBRE)}</p>
    <div class="ficha-datos">
      <p><span>Materia</span>${escapeHtml(materia)}</p>
      <p><span>Profesor</span>${escapeHtml(PROFESOR_NOMBRE)}</p>
      <p><span>Grado</span>${escapeHtml(grado)}</p>
    </div>
  `;
}

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

function esImagen(nombreOUrl) {
  if (!nombreOUrl) return false;
  return /\.(jpe?g|png|gif|webp)(\?|$)/i.test(nombreOUrl);
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

// ---------- Navegación dentro de una materia+grado ----------
// Paso 2: lista de "Clase 1", "Clase 2"... (y Examen final si existe)
// Paso 3: detalle de una sola clase, con sus lecciones y sus tareas
const vistaListaClases = document.getElementById('vista-lista-clases');
const vistaDetalleClase = document.getElementById('vista-detalle-clase');
const btnVolverClase = document.getElementById('btn-volver-clase');

let claseActual = null; // la clase abierta ahora mismo en el paso 3 (o null)

function mostrarListaClases() {
  vistaListaClases.classList.remove('oculto');
  vistaDetalleClase.classList.add('oculto');
  claseActual = null;
}

function mostrarDetalleClase() {
  vistaListaClases.classList.add('oculto');
  vistaDetalleClase.classList.remove('oculto');
}

// ---------- Paso 2: lista de "Clase 1", "Clase 2"... ----------
async function cargarListaClases(materia, grado) {
  const contenedor = document.getElementById('lista-clases-grid');
  if (!contenedor) return;
  contenedor.innerHTML = '<p class="estado-cargando">Cargando…</p>';

  const { data: clases, error: errClases } = await sb
    .from('clases').select('*').eq('materia', materia).eq('grado', grado).order('numero', { ascending: true });

  if (errClases) {
    console.error(errClases);
    contenedor.innerHTML = '<p class="estado-vacio">No se pudieron cargar las clases.</p>';
    return;
  }

  const listaClasesData = (clases || []).filter(c => !c.es_examen_final);
  const examen = (clases || []).find(c => c.es_examen_final);

  if (!listaClasesData.length && !examen) {
    contenedor.innerHTML = '<p class="estado-vacio">Todavía no hay clases publicadas para este salón.</p>';
    return;
  }

  const idsClases = listaClasesData.map(c => c.id);
  const [{ data: leccionesData }, { data: tareasData }] = await Promise.all([
    idsClases.length ? sb.from('lecciones').select('id, clase_id').in('clase_id', idsClases) : Promise.resolve({ data: [] }),
    sb.from('tareas').select('id, clase_id, clase_numero').eq('materia', materia).eq('grado', grado),
  ]);

  const contarLecciones = (claseId) => (leccionesData || []).filter(l => l.clase_id === claseId).length;
  const contarTareas = (c) => (tareasData || []).filter(t => (t.clase_id != null ? t.clase_id === c.id : t.clase_numero === c.numero)).length;

  const accent = ACCENTOS[materia] || 'var(--ciencias)';

  const tarjetasClases = listaClasesData.map(c => {
    const nLecciones = contarLecciones(c.id);
    const nTareas = contarTareas(c);
    return `
      <button type="button" class="clase-card" style="--accent:${accent}" data-clase-id="${c.id}">
        <span class="clase-card-num">Clase ${c.numero}</span>
        <p class="clase-card-nombre">${c.nombre ? escapeHtml(c.nombre) : `Clase ${c.numero}`}</p>
        ${(c.fecha_inicio || c.fecha_fin) ? `<p class="clase-card-fechas">${formatearFecha(c.fecha_inicio) || '?'} — ${formatearFecha(c.fecha_fin) || '?'}</p>` : ''}
        <p class="clase-card-conteo">${nLecciones ? `${nLecciones} lección${nLecciones === 1 ? '' : 'es'}` : 'sin lecciones'} · ${nTareas ? `${nTareas} tarea${nTareas === 1 ? '' : 's'}` : 'sin tareas'}</p>
      </button>
    `;
  }).join('');

  const tarjetaExamen = examen ? `
    <button type="button" class="clase-card examen" data-clase-id="examen">
      <span class="clase-card-num">📕 Examen</span>
      <p class="clase-card-nombre">Examen final</p>
    </button>
  ` : '';

  contenedor.innerHTML = tarjetasClases + tarjetaExamen;

  contenedor.querySelectorAll('[data-clase-id]').forEach(boton => {
    boton.addEventListener('click', () => {
      const id = boton.dataset.claseId;
      const clase = id === 'examen' ? examen : listaClasesData.find(c => String(c.id) === id);
      if (clase) abrirDetalleClase(materia, grado, clase);
    });
  });
}

// ---------- Paso 3: detalle de una clase (lecciones + tareas) ----------
async function abrirDetalleClase(materia, grado, clase) {
  claseActual = clase;
  mostrarDetalleClase();

  const contenedor = document.getElementById('detalle-clase');
  const accent = ACCENTOS[materia] || 'var(--ciencias)';

  // Examen final: solo el archivo/enlace, sin lecciones ni tareas.
  if (clase.es_examen_final) {
    contenedor.innerHTML = `
      <article class="tarea-item" style="--accent:var(--coral); border-color:var(--coral);">
        <h3>📕 Examen final</h3>
        ${clase.archivo_url ? `<a class="btn-descargar" href="${clase.archivo_url}" target="_blank" rel="noopener">${clase.tipo === 'archivo' ? '↓ Descargar examen' : '↗ Abrir enlace'}</a>` : ''}
      </article>
    `;
    document.getElementById('selector-estudiante').innerHTML = '';
    listaTareas.innerHTML = '';
    return;
  }

  contenedor.innerHTML = '<p class="estado-cargando">Cargando…</p>';

  const { data: lecciones, error: errLecciones } = await sb
    .from('lecciones').select('*').eq('clase_id', clase.id).order('creado_en', { ascending: true });
  if (errLecciones) console.error(errLecciones);

  const imagenes = (lecciones || []).filter(l => l.tipo === 'archivo' && esImagen(l.archivo_nombre || l.archivo_url));
  const otras = (lecciones || []).filter(l => !imagenes.includes(l));

  contenedor.innerHTML = `
    <article class="tarea-item" style="--accent:${accent}">
      <h3>Clase ${clase.numero}${clase.nombre ? `: ${escapeHtml(clase.nombre)}` : ''}</h3>
      ${(clase.fecha_inicio || clase.fecha_fin) ? `
        <div class="tarea-meta">
          <span>${formatearFecha(clase.fecha_inicio) || '?'} — ${formatearFecha(clase.fecha_fin) || '?'}</span>
        </div>
      ` : ''}
      ${clase.archivo_url ? `<a class="btn-descargar" href="${clase.archivo_url}" target="_blank" rel="noopener">${clase.tipo === 'archivo' ? '↓ Descargar material' : '↗ Abrir enlace'}</a>` : ''}
      ${(lecciones && lecciones.length) ? `
        <p style="font-size:12px; color:var(--muted); margin:10px 0 4px;">Lecciones:</p>
        ${imagenes.length ? `
          <div class="leccion-miniaturas">
            ${imagenes.map(l => `
              <a class="leccion-miniatura" href="${l.archivo_url}" target="_blank" rel="noopener" title="${l.nombre ? escapeHtml(l.nombre) : 'Ver imagen'}">
                <img src="${l.archivo_url}" alt="${l.nombre ? escapeHtml(l.nombre) : 'Lección'}" loading="lazy">
                ${l.nombre ? `<span>${escapeHtml(l.nombre)}</span>` : ''}
              </a>
            `).join('')}
          </div>
        ` : ''}
        ${otras.length ? `
          <div style="display:flex; flex-wrap:wrap; gap:8px; ${imagenes.length ? 'margin-top:8px;' : ''}">
            ${otras.map(l => `<a class="btn-descargar" style="margin-top:0;" href="${l.archivo_url}" target="_blank" rel="noopener">${l.tipo === 'archivo' ? '↓' : '↗'} ${l.nombre ? escapeHtml(l.nombre) : (l.tipo === 'archivo' ? 'Descargar' : 'Abrir enlace')}</a>`).join('')}
          </div>
        ` : ''}
      ` : `<p class="estado-vacio" style="padding:6px 0 0;">Todavía no hay lecciones en esta clase.</p>`}
    </article>
  `;

  renderIdentidadWidget(materia, grado);
  await cargarTareas(materia, grado);
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

// ---------- Abrir una materia+grado (paso 1 → paso 2) ----------
async function abrirClase(materia, grado) {
  renderFicha(materia, grado);
  vistaClases.style.display = 'none';
  vistaTareas.classList.remove('oculto');
  mostrarListaClases();

  await cargarListaClases(materia, grado);
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
  const { data: tareasTodas, error: errTareas } = resultados[0];
  const entregas = identidad ? (resultados[1].data || []) : [];
  if (identidad && resultados[1].error) console.error(resultados[1].error);

  if (errTareas) {
    listaTareas.innerHTML = '<p class="estado-vacio">No se pudieron cargar las tareas. Intenta de nuevo más tarde.</p>';
    console.error(errTareas);
    return;
  }

  // Solo las tareas de la clase que se está viendo ahora mismo.
  const tareas = claseActual
    ? tareasTodas.filter(t => (t.clase_id != null ? t.clase_id === claseActual.id : t.clase_numero === claseActual.numero))
    : tareasTodas;

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

  // Conectar los formularios de entrega que se hayan renderizado (tanto
  // el de "Entregar tarea" por primera vez como el de "Reemplazar entrega")
  if (identidad) {
    tareas.forEach(t => {
      const form = document.querySelector(`[data-form-entrega="${t.id}"]`);
      if (!form) return;
      form.addEventListener('submit', (e) => manejarEnvioEntrega(e, t, materia, grado, identidad, entregasPorTarea[t.id]));
    });
  }

  // Enlace "¿Te equivocaste? Cambiar entrega": muestra el formulario para
  // subir un archivo nuevo o pegar otro enlace, reemplazando el anterior.
  document.querySelectorAll('[data-cambiar-entrega]').forEach(enlace => {
    enlace.addEventListener('click', (e) => {
      e.preventDefault();
      const form = document.querySelector(`[data-form-entrega="${enlace.dataset.cambiarEntrega}"]`);
      if (form) form.classList.toggle('oculto');
    });
  });

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
        · <a href="#" data-cambiar-entrega="${tarea.id}" style="color:var(--muted);">¿Te equivocaste? Cambiar entrega</a>
      </p>
      <form class="form-entrega oculto" data-form-entrega="${tarea.id}">
        <input type="file" name="archivo">
        <input type="url" name="enlace" placeholder="O pega un enlace en vez de subir archivo">
        <button type="submit">Reemplazar entrega</button>
        <p class="msg"></p>
      </form>
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

async function manejarEnvioEntrega(e, tarea, materia, grado, identidad, entregaExistente) {
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
  msg.textContent = entregaExistente ? 'Reemplazando…' : 'Enviando…';
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

    if (entregaExistente) {
      // El estudiante ya había entregado esta tarea: se reemplaza la
      // entrega anterior (mismo registro) en vez de crear una nueva.
      const { error: errUpdate } = await sb.from('entregas')
        .update({ tipo, entrega_url, estado, entregado_en: new Date().toISOString() })
        .eq('id', entregaExistente.id);
      if (errUpdate) throw errUpdate;
    } else {
      const { error: errInsert } = await sb.from('entregas').insert({
        tarea_id: tarea.id,
        estudiante_id: identidad.estudianteId,
        estudiante_nombre: identidad.nombre,
        cedula: identidad.cedula,
        telefono: identidad.telefono,
        materia, grado, tipo, entrega_url, estado,
      });
      if (errInsert) throw errInsert;
    }

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

btnVolverClase.addEventListener('click', () => {
  mostrarListaClases();
});

cargarConteos();
