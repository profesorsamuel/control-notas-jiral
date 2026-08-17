// Portal de Clase — panel de administración (requiere sesión de profesor)
const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const GRADOS_POR_MATERIA = {
  'Ciencias Naturales': ['9A', '9B', '9C', '8A'],
  'Informática': ['8A', '8B'],
};

// Todos los salones que existen, en el orden en que se muestran,
// y qué materia(s) recibe cada uno (8A tiene las dos materias).
const SALONES = ['9A', '9B', '9C', '8A', '8B'];
const SALON_MATERIAS = {
  '9A': ['Ciencias Naturales'],
  '9B': ['Ciencias Naturales'],
  '9C': ['Ciencias Naturales'],
  '8A': ['Ciencias Naturales', 'Informática'],
  '8B': ['Informática'],
};

const loginBox = document.getElementById('login-box');
const panel = document.getElementById('panel');
const loginMsg = document.getElementById('login-msg');
const userEmailEl = document.getElementById('user-email');

const fcMateria = document.getElementById('fc-materia');
const fcGrados = document.getElementById('fc-grados');
const formClase = document.getElementById('form-clase');
const formClaseMsg = document.getElementById('form-clase-msg');
const listaClases = document.getElementById('lista-clases');

const feMateria = document.getElementById('fe-materia');
const feGrados = document.getElementById('fe-grados');
const formExamen = document.getElementById('form-examen');
const formExamenMsg = document.getElementById('form-examen-msg');
const listaExamenes = document.getElementById('lista-examenes');

function pintarGrados(contenedor, materia) {
  const opciones = GRADOS_POR_MATERIA[materia] || [];
  contenedor.innerHTML = opciones.map((g) => `
    <label>
      <input type="checkbox" name="grado" value="${g}" ${opciones.length === 1 ? 'checked' : ''}>
      ${g}
    </label>
  `).join('');
}

fcMateria.addEventListener('change', () => pintarGrados(fcGrados, fcMateria.value));
pintarGrados(fcGrados, fcMateria.value);

feMateria.addEventListener('change', () => pintarGrados(feGrados, feMateria.value));
pintarGrados(feGrados, feMateria.value);

// ---------- Sesión ----------
async function revisarSesion() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    mostrarPanel(session.user.email);
  } else {
    loginBox.classList.remove('oculto');
    panel.classList.add('oculto');
  }
}

function mostrarPanel(email) {
  loginBox.classList.add('oculto');
  panel.classList.remove('oculto');
  userEmailEl.textContent = email;
  cargarClasesAdmin();
  cargarExamenesAdmin();
}

document.getElementById('btn-login').addEventListener('click', async () => {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-pass').value;
  loginMsg.textContent = '';
  loginMsg.className = '';

  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    loginMsg.textContent = 'Correo o contraseña incorrectos.';
    loginMsg.className = 'msg-error';
    return;
  }
  mostrarPanel(data.user.email);
});

document.getElementById('btn-salir').addEventListener('click', async () => {
  await sb.auth.signOut();
  location.reload();
});

function sanitizarNombre(str) {
  return str
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita tildes
    .replace(/[^a-zA-Z0-9.\-_]/g, '_'); // reemplaza espacios y símbolos raros
}

function extraerRuta(url) {
  const marcador = '/tareas-archivos/';
  const i = url.indexOf(marcador);
  return i === -1 ? '' : url.slice(i + marcador.length);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatearFechaCorta(fechaISO) {
  if (!fechaISO) return null;
  const [y, m, d] = fechaISO.split('-');
  return `${d}/${m}/${y}`;
}

function extraerRutaClase(url) {
  const marcador = '/material-clases/';
  const i = url.indexOf(marcador);
  return i === -1 ? '' : url.slice(i + marcador.length);
}

function esImagen(nombreOUrl) {
  if (!nombreOUrl) return false;
  return /\.(jpe?g|png|gif|webp)(\?|$)/i.test(nombreOUrl);
}

// ---------- Crear "Clase N" (solo el contenedor: título y fechas) ----------
formClase.addEventListener('submit', async (e) => {
  e.preventDefault();
  formClaseMsg.textContent = 'Guardando…';
  formClaseMsg.className = '';

  const materia = fcMateria.value;
  const gradosSeleccionados = Array.from(
    fcGrados.querySelectorAll('input[name="grado"]:checked')
  ).map(cb => cb.value);
  const nombreClase = document.getElementById('fc-nombre').value.trim();
  const fechaInicio = document.getElementById('fc-inicio').value || null;
  const fechaFin = document.getElementById('fc-fin').value || null;

  if (!gradosSeleccionados.length) {
    formClaseMsg.textContent = 'Selecciona al menos un grado.';
    formClaseMsg.className = 'msg-error';
    return;
  }

  if (!nombreClase) {
    formClaseMsg.textContent = 'Escribe un título para la clase.';
    formClaseMsg.className = 'msg-error';
    return;
  }

  try {
    // El número de "Clase N" se calcula por separado para cada grado,
    // siguiendo cuántas clases (que no sean el examen final) ya existen.
    let nuevoIdParaSeleccionar = null;
    for (const grado of gradosSeleccionados) {
      const { count } = await sb
        .from('clases')
        .select('id', { count: 'exact', head: true })
        .eq('materia', materia)
        .eq('grado', grado)
        .eq('es_examen_final', false);

      const siguienteNumero = (count || 0) + 1;

      const { data: insertada, error: errInsert } = await sb.from('clases').insert({
        materia, grado, numero: siguienteNumero,
        es_examen_final: false, nombre: nombreClase,
        fecha_inicio: fechaInicio, fecha_fin: fechaFin,
      }).select('id').single();
      if (errInsert) throw errInsert;
      nuevoIdParaSeleccionar = insertada.id;
    }

    formClaseMsg.textContent = '✅ Clase creada. Selecciónala abajo para cargarle lecciones y tareas.';
    formClaseMsg.className = 'msg-ok';
    formClase.reset();
    pintarGrados(fcGrados, fcMateria.value);
    salonSeleccionado = gradosSeleccionados[0];
    materiaSeleccionada = materia;
    await cargarClasesAdmin();
    if (nuevoIdParaSeleccionar) seleccionarClase(nuevoIdParaSeleccionar);
  } catch (err) {
    console.error(err);
    formClaseMsg.textContent = 'Ocurrió un error al guardar. Intenta de nuevo.';
    formClaseMsg.className = 'msg-error';
  }
});

// clasesAbiertas ya no existe: ahora solo una clase seleccionada a la vez.
let claseSeleccionadaId = null;
let salonSeleccionado = SALONES[0];
let materiaSeleccionada = SALON_MATERIAS[salonSeleccionado][0];
const leccionesPorClase = {};
const tareasPorClaseId = {};

const panelClaseSeleccionada = document.getElementById('panel-clase-seleccionada');

async function cargarClasesAdmin() {
  listaClases.innerHTML = '<p class="estado-cargando">Cargando…</p>';
  const { data, error } = await sb
    .from('clases')
    .select('*')
    .eq('es_examen_final', false)
    .order('materia', { ascending: true })
    .order('grado', { ascending: true })
    .order('numero', { ascending: true });

  if (error) {
    listaClases.innerHTML = '<p class="estado-vacio">No se pudo cargar el material de clase.</p>';
    console.error(error);
    return;
  }

  window.__clasesAdmin = data;

  // Si la clase que estaba seleccionada ya no existe (se borró), se limpia.
  if (claseSeleccionadaId && !data.some(c => c.id === claseSeleccionadaId)) {
    claseSeleccionadaId = null;
    panelClaseSeleccionada.innerHTML = '';
  }

  renderListaClases(data);
  if (claseSeleccionadaId) renderPanelClase(claseSeleccionadaId);
}

// ---------- Paso 1: elegir salón · Paso 2: elegir la clase (Clase 1, Clase 2...) ----------
function renderListaClases(clases) {
  const salonesHtml = SALONES.map(s => `
    <button class="salon-tab ${s === salonSeleccionado ? 'activa' : ''}" data-salon="${s}">${s}</button>
  `).join('');

  const materiasDelSalon = SALON_MATERIAS[salonSeleccionado] || [];
  const mostrarPasoMateria = materiasDelSalon.length > 1;
  const materiaHtml = mostrarPasoMateria ? `
    <p class="paso-label" style="margin-top:16px;">2. Elige la materia</p>
    <div class="materia-tabs">
      ${materiasDelSalon.map(m => `
        <button class="materia-tab ${m === materiaSeleccionada ? 'activa' : ''}" data-materia="${m}">${m}</button>
      `).join('')}
    </div>
  ` : '';

  const clasesFiltradas = clases
    .filter(c => c.grado === salonSeleccionado && c.materia === materiaSeleccionada)
    .sort((a, b) => a.numero - b.numero);

  const claseTabsHtml = clasesFiltradas.length ? `
    <div class="clase-tabs">
      ${clasesFiltradas.map(c => `
        <button class="clase-tab ${c.id === claseSeleccionadaId ? 'activa' : ''}" data-id="${c.id}">Clase ${c.numero}</button>
      `).join('')}
    </div>
  ` : `<p class="estado-vacio" style="margin:0;">Aún no hay clases creadas para ${materiaSeleccionada} · ${salonSeleccionado}.</p>`;

  listaClases.innerHTML = `
    <p class="paso-label">1. Elige el salón</p>
    <div class="salon-tabs">${salonesHtml}</div>
    ${materiaHtml}
    <p class="paso-label" style="margin-top:16px;">${mostrarPasoMateria ? '3' : '2'}. Elige la clase</p>
    ${claseTabsHtml}
  `;

  listaClases.querySelectorAll('.salon-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.salon === salonSeleccionado) return;
      salonSeleccionado = btn.dataset.salon;
      const materias = SALON_MATERIAS[salonSeleccionado] || [];
      if (!materias.includes(materiaSeleccionada)) materiaSeleccionada = materias[0];
      claseSeleccionadaId = null;
      panelClaseSeleccionada.innerHTML = '';
      renderListaClases(window.__clasesAdmin || []);
    });
  });

  listaClases.querySelectorAll('.materia-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.materia === materiaSeleccionada) return;
      materiaSeleccionada = btn.dataset.materia;
      claseSeleccionadaId = null;
      panelClaseSeleccionada.innerHTML = '';
      renderListaClases(window.__clasesAdmin || []);
    });
  });

  listaClases.querySelectorAll('.clase-tab').forEach(btn => {
    btn.addEventListener('click', () => seleccionarClase(btn.dataset.id));
  });
}

function seleccionarClase(id) {
  claseSeleccionadaId = (claseSeleccionadaId === id) ? null : id; // volver a pulsarla la cierra
  renderListaClases(window.__clasesAdmin || []);
  if (claseSeleccionadaId) {
    renderPanelClase(claseSeleccionadaId);
    panelClaseSeleccionada.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else {
    panelClaseSeleccionada.innerHTML = '';
  }
}

async function renderPanelClase(claseId) {
  const clase = (window.__clasesAdmin || []).find(c => c.id === claseId);
  if (!clase) return;

  panelClaseSeleccionada.innerHTML = '<div class="clase-panel"><p class="estado-cargando">Cargando lecciones y tareas…</p></div>';

  const [lecciones, tareas] = await Promise.all([
    obtenerLecciones(claseId),
    obtenerTareasDeClase(claseId),
  ]);

  // Si mientras cargaba se cambió de clase, no pisar el panel nuevo.
  if (claseSeleccionadaId !== claseId) return;

  panelClaseSeleccionada.innerHTML = `
    <div class="clase-panel" data-panel="${claseId}">
      <div class="clase-panel-cabecera">
        <div>
          <h3>Clase ${clase.numero}: ${escapeHtml(clase.nombre || '')}</h3>
          <span class="tag">${clase.materia} · ${clase.grado}${(clase.fecha_inicio || clase.fecha_fin) ? ` · ${formatearFechaCorta(clase.fecha_inicio) || '?'} — ${formatearFechaCorta(clase.fecha_fin) || '?'}` : ''}</span>
        </div>
        <button class="btn-borrar btn-borrar-clase" data-id="${claseId}">Borrar clase</button>
      </div>

      <h4>📖 Lecciones de esta clase</h4>
      <form class="sub-form" data-form-leccion="${claseId}">
        <input type="text" name="nombre" placeholder="Nombre de la lección (opcional)">
        <input type="file" name="archivo" accept=".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp" multiple>
        <input type="url" name="enlace" placeholder="O pega un enlace">
        <button type="submit">Agregar lección</button>
        <p class="sub-form-msg"></p>
        <p style="font-size:11px; color:var(--muted); flex-basis:100%; margin:0;">Puedes seleccionar varios archivos/imágenes a la vez — se agregan como lecciones separadas.</p>
      </form>
      <div class="sub-lista">
        ${lecciones.length ? lecciones.map(l => `
          <div class="item-mini" data-id="${l.id}">
            <span style="display:flex; align-items:center; gap:8px;">
              ${l.tipo === 'archivo' && esImagen(l.archivo_nombre || l.archivo_url) ? `<img src="${l.archivo_url}" alt="" style="width:32px;height:32px;object-fit:cover;border-radius:4px;border:1px solid var(--line);">` : ''}
              ${l.nombre ? escapeHtml(l.nombre) : (l.tipo === 'archivo' ? 'Archivo' : 'Enlace')} <span class="item-mini-meta">· ${l.tipo === 'archivo' ? '↓ archivo' : '↗ enlace'}</span>
            </span>
            <button class="btn-borrar btn-borrar-leccion" data-id="${l.id}" data-clase="${claseId}" data-archivo="${l.tipo === 'archivo' ? extraerRutaClase(l.archivo_url) : ''}">Borrar</button>
          </div>
        `).join('') : '<p class="estado-vacio" style="padding:8px 0;">Aún no hay lecciones en esta clase.</p>'}
      </div>

      <hr class="seccion-divisoria">

      <h4>📚 Tareas de esta clase</h4>
      <form class="sub-form" data-form-tarea-clase="${claseId}">
        <input type="text" name="titulo" placeholder="Título de la tarea" required style="flex-basis:100%;">
        <textarea name="descripcion" rows="2" placeholder="Descripción / instrucciones (opcional)"></textarea>
        <input type="date" name="entrega" title="Fecha de entrega (opcional)">
        <input type="file" name="archivo">
        <input type="url" name="enlace" placeholder="O pega un enlace">
        <button type="submit">Agregar tarea</button>
        <p class="sub-form-msg"></p>
      </form>
      <div class="sub-lista">
        ${tareas.length ? tareas.map(t => `
          <div class="item-mini" data-id="${t.id}">
            <span>${escapeHtml(t.titulo)} ${t.fecha_entrega ? `<span class="item-mini-meta">· entrega ${formatearFechaCorta(t.fecha_entrega)}</span>` : ''}</span>
            <button class="btn-borrar btn-borrar-tarea-clase" data-id="${t.id}" data-clase="${claseId}" data-archivo="${t.archivo_url ? extraerRuta(t.archivo_url) : ''}">Borrar</button>
          </div>
        `).join('') : '<p class="estado-vacio" style="padding:8px 0;">Aún no hay tareas en esta clase.</p>'}
      </div>
    </div>
  `;

  panelClaseSeleccionada.querySelector(`[data-form-leccion="${claseId}"]`).addEventListener('submit', (e) => manejarNuevaLeccion(e, claseId));
  panelClaseSeleccionada.querySelector(`[data-form-tarea-clase="${claseId}"]`).addEventListener('submit', (e) => manejarNuevaTareaDeClase(e, claseId));
  panelClaseSeleccionada.querySelectorAll('.btn-borrar-leccion').forEach(btn => {
    btn.addEventListener('click', () => borrarLeccion(btn.dataset.id, btn.dataset.clase, btn.dataset.archivo));
  });
  panelClaseSeleccionada.querySelectorAll('.btn-borrar-tarea-clase').forEach(btn => {
    btn.addEventListener('click', () => borrarTareaDeClase(btn.dataset.id, btn.dataset.clase, btn.dataset.archivo));
  });
  panelClaseSeleccionada.querySelector('.btn-borrar-clase').addEventListener('click', () => borrarClase(claseId));
}

async function obtenerLecciones(claseId) {
  const { data, error } = await sb.from('lecciones').select('*').eq('clase_id', claseId).order('creado_en', { ascending: true });
  if (error) { console.error(error); return []; }
  leccionesPorClase[claseId] = data || [];
  return leccionesPorClase[claseId];
}

async function obtenerTareasDeClase(claseId) {
  const { data, error } = await sb.from('tareas').select('*').eq('clase_id', claseId).order('creado_en', { ascending: true });
  if (error) { console.error(error); return []; }
  tareasPorClaseId[claseId] = data || [];
  return tareasPorClaseId[claseId];
}

// ---------- Agregar una o varias lecciones dentro de una clase ----------
async function manejarNuevaLeccion(e, claseId) {
  e.preventDefault();
  const form = e.target;
  const msg = form.querySelector('.sub-form-msg');
  const nombre = form.nombre.value.trim() || null;
  const archivos = Array.from(form.archivo.files);
  const enlace = form.enlace.value.trim();

  if (!archivos.length && !enlace) {
    msg.textContent = 'Sube uno o varios archivos, o pega un enlace.';
    msg.className = 'sub-form-msg msg-error';
    return;
  }

  msg.textContent = 'Guardando…';
  msg.className = 'sub-form-msg';

  try {
    const clase = (window.__clasesAdmin || []).find(c => c.id === claseId);
    const materia = clase ? clase.materia : 'general';
    const filas = [];

    if (enlace) {
      filas.push({ clase_id: claseId, nombre, tipo: 'enlace', archivo_url: enlace, archivo_nombre: null });
    } else {
      for (const [i, archivo] of archivos.entries()) {
        const ruta = `${sanitizarNombre(materia)}/${Date.now()}-${i}-${sanitizarNombre(archivo.name)}`;
        const { error: errSubida } = await sb.storage.from('material-clases').upload(ruta, archivo);
        if (errSubida) throw errSubida;
        const { data: pub } = sb.storage.from('material-clases').getPublicUrl(ruta);
        const nombreLeccion = nombre
          ? (archivos.length > 1 ? `${nombre} (${i + 1})` : nombre)
          : archivo.name.replace(/\.[^/.]+$/, '');
        filas.push({
          clase_id: claseId, nombre: nombreLeccion, tipo: 'archivo',
          archivo_url: pub.publicUrl, archivo_nombre: archivo.name,
        });
      }
    }

    const { error: errInsert } = await sb.from('lecciones').insert(filas);
    if (errInsert) throw errInsert;

    form.reset();
    renderPanelClase(claseId);
  } catch (err) {
    console.error(err);
    msg.textContent = 'Ocurrió un error al guardar. Intenta de nuevo.';
    msg.className = 'sub-form-msg msg-error';
  }
}

async function borrarLeccion(id, claseId, rutaArchivo) {
  if (!confirm('¿Borrar esta lección?')) return;
  await sb.from('lecciones').delete().eq('id', id);
  if (rutaArchivo) {
    await sb.storage.from('material-clases').remove([rutaArchivo]);
  }
  renderPanelClase(claseId);
}

// ---------- Agregar una tarea dentro de una clase ----------
async function manejarNuevaTareaDeClase(e, claseId) {
  e.preventDefault();
  const form = e.target;
  const msg = form.querySelector('.sub-form-msg');
  const titulo = form.titulo.value.trim();
  const descripcion = form.descripcion.value.trim();
  const fechaEntrega = form.entrega.value || null;
  const archivo = form.archivo.files[0];
  const enlace = form.enlace.value.trim();

  if (!titulo) {
    msg.textContent = 'Escribe un título para la tarea.';
    msg.className = 'sub-form-msg msg-error';
    return;
  }

  msg.textContent = 'Guardando…';
  msg.className = 'sub-form-msg';

  try {
    const clase = (window.__clasesAdmin || []).find(c => c.id === claseId);
    if (!clase) throw new Error('Clase no encontrada');
    const materia = clase.materia, grado = clase.grado;
    let archivo_url = null, archivo_nombre = null;

    if (enlace) {
      archivo_url = enlace;
    } else if (archivo) {
      const ruta = `${sanitizarNombre(materia)}/${Date.now()}-${sanitizarNombre(archivo.name)}`;
      const { error: errSubida } = await sb.storage.from('tareas-archivos').upload(ruta, archivo);
      if (errSubida) throw errSubida;
      const { data: pub } = sb.storage.from('tareas-archivos').getPublicUrl(ruta);
      archivo_url = pub.publicUrl;
      archivo_nombre = archivo.name;
    }

    const { error: errInsert } = await sb.from('tareas').insert({
      materia, grado, titulo, descripcion, fecha_entrega: fechaEntrega,
      archivo_url, archivo_nombre, clase_id: claseId, clase_numero: clase.numero,
    });
    if (errInsert) throw errInsert;

    form.reset();
    renderPanelClase(claseId);
  } catch (err) {
    console.error(err);
    msg.textContent = 'Ocurrió un error al guardar. Intenta de nuevo.';
    msg.className = 'sub-form-msg msg-error';
  }
}

async function borrarTareaDeClase(id, claseId, rutaArchivo) {
  if (!confirm('¿Borrar esta tarea?')) return;
  await sb.from('tareas').delete().eq('id', id);
  if (rutaArchivo) {
    await sb.storage.from('tareas-archivos').remove([rutaArchivo]);
  }
  renderPanelClase(claseId);
}

async function borrarClase(id) {
  if (!confirm('¿Borrar esta clase junto con TODAS sus lecciones y tareas?')) return;
  const lecciones = leccionesPorClase[id] || (await obtenerLecciones(id));
  const tareas = tareasPorClaseId[id] || (await obtenerTareasDeClase(id));

  const rutasLecciones = lecciones.filter(l => l.tipo === 'archivo').map(l => extraerRutaClase(l.archivo_url));
  const rutasTareas = tareas.filter(t => t.archivo_url).map(t => extraerRuta(t.archivo_url));

  await sb.from('clases').delete().eq('id', id); // ON DELETE CASCADE borra lecciones y desvincula tareas
  if (rutasLecciones.length) await sb.storage.from('material-clases').remove(rutasLecciones);
  if (rutasTareas.length) await sb.storage.from('tareas-archivos').remove(rutasTareas);

  claseSeleccionadaId = null;
  panelClaseSeleccionada.innerHTML = '';
  cargarClasesAdmin();
}

// ---------- Examen final ----------
formExamen.addEventListener('submit', async (e) => {
  e.preventDefault();
  formExamenMsg.textContent = 'Guardando…';
  formExamenMsg.className = '';

  const materia = feMateria.value;
  const gradosSeleccionados = Array.from(
    feGrados.querySelectorAll('input[name="grado"]:checked')
  ).map(cb => cb.value);
  const archivoInput = document.getElementById('fe-archivo');
  const archivo = archivoInput.files[0];
  const enlace = document.getElementById('fe-enlace').value.trim();

  if (!gradosSeleccionados.length) {
    formExamenMsg.textContent = 'Selecciona al menos un grado.';
    formExamenMsg.className = 'msg-error';
    return;
  }

  if (!archivo && !enlace) {
    formExamenMsg.textContent = 'Sube un archivo o pega un enlace.';
    formExamenMsg.className = 'msg-error';
    return;
  }

  try {
    let tipo, archivo_url, archivo_nombre = null;

    if (enlace) {
      tipo = 'enlace';
      archivo_url = enlace;
    } else {
      tipo = 'archivo';
      const ruta = `${sanitizarNombre(materia)}/examen-${Date.now()}-${sanitizarNombre(archivo.name)}`;
      const { error: errSubida } = await sb.storage.from('material-clases').upload(ruta, archivo);
      if (errSubida) throw errSubida;
      const { data: pub } = sb.storage.from('material-clases').getPublicUrl(ruta);
      archivo_url = pub.publicUrl;
      archivo_nombre = archivo.name;
    }

    const filas = gradosSeleccionados.map(grado => ({
      materia, grado, numero: null, es_examen_final: true,
      tipo, archivo_url, archivo_nombre,
    }));

    const { error: errInsert } = await sb.from('clases').insert(filas);
    if (errInsert) throw errInsert;

    formExamenMsg.textContent = '✅ Examen final publicado';
    formExamenMsg.className = 'msg-ok';
    formExamen.reset();
    pintarGrados(feGrados, feMateria.value);
    cargarExamenesAdmin();
  } catch (err) {
    console.error(err);
    formExamenMsg.textContent = 'Ocurrió un error al guardar. Intenta de nuevo.';
    formExamenMsg.className = 'msg-error';
  }
});

async function cargarExamenesAdmin() {
  listaExamenes.innerHTML = '<p class="estado-cargando">Cargando…</p>';
  const { data, error } = await sb
    .from('clases')
    .select('*')
    .eq('es_examen_final', true)
    .order('materia', { ascending: true })
    .order('grado', { ascending: true });

  if (error) {
    listaExamenes.innerHTML = '<p class="estado-vacio">No se pudo cargar los exámenes.</p>';
    console.error(error);
    return;
  }
  if (!data.length) {
    listaExamenes.innerHTML = '<p class="estado-vacio">Aún no has publicado ningún examen final.</p>';
    return;
  }

  listaExamenes.innerHTML = data.map(c => `
    <div class="tarea-admin-item" data-id="${c.id}">
      <div class="info">
        <div class="tag">${c.materia} · ${c.grado}</div>
        <strong>Examen final</strong>
      </div>
      <button class="btn-borrar" data-id="${c.id}" data-archivo="${c.tipo === 'archivo' ? extraerRutaClase(c.archivo_url) : ''}">Borrar</button>
    </div>
  `).join('');

  listaExamenes.querySelectorAll('.btn-borrar').forEach(btn => {
    btn.addEventListener('click', () => borrarClase(btn.dataset.id, btn.dataset.archivo));
  });
}

revisarSesion();
