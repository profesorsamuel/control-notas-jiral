// Portal de Clase — panel de administración (requiere sesión de profesor)
const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const GRADOS_POR_MATERIA = {
  'Ciencias Naturales': ['9A', '9B', '9C'],
  'Informática': ['8A', '8B'],
};

const loginBox = document.getElementById('login-box');
const panel = document.getElementById('panel');
const loginMsg = document.getElementById('login-msg');
const userEmailEl = document.getElementById('user-email');

const fMateria = document.getElementById('f-materia');
const fGrados = document.getElementById('f-grados');
const formTarea = document.getElementById('form-tarea');
const formMsg = document.getElementById('form-msg');
const listaAdmin = document.getElementById('lista-admin');

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

function actualizarGrados() {
  pintarGrados(fGrados, fMateria.value);
}
fMateria.addEventListener('change', actualizarGrados);
actualizarGrados();

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
  cargarTareasAdmin();
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

// ---------- Crear tarea ----------
formTarea.addEventListener('submit', async (e) => {
  e.preventDefault();
  formMsg.textContent = 'Publicando…';
  formMsg.className = '';

  const materia = fMateria.value;
  const gradosSeleccionados = Array.from(
    fGrados.querySelectorAll('input[name="grado"]:checked')
  ).map(cb => cb.value);
  const titulo = document.getElementById('f-titulo').value.trim();
  const descripcion = document.getElementById('f-descripcion').value.trim();
  const fechaEntrega = document.getElementById('f-entrega').value || null;
  const claseNumeroRaw = document.getElementById('f-clase-numero').value;
  const claseNumero = claseNumeroRaw ? Number(claseNumeroRaw) : null;
  const archivoInput = document.getElementById('f-archivo');
  const archivo = archivoInput.files[0];
  const enlace = document.getElementById('f-enlace').value.trim();

  if (!gradosSeleccionados.length) {
    formMsg.textContent = 'Selecciona al menos un grado.';
    formMsg.className = 'msg-error';
    return;
  }

  let archivo_url = null;
  let archivo_nombre = null;

  try {
    if (enlace) {
      // Se usa el enlace pegado, sin subir nada
      archivo_url = enlace;
      archivo_nombre = null;
    } else if (archivo) {
      // Se sube una sola vez y se reutiliza el mismo enlace para todos los grados marcados
      const ruta = `${sanitizarNombre(materia)}/${Date.now()}-${sanitizarNombre(archivo.name)}`;
      const { error: errSubida } = await sb.storage.from('tareas-archivos').upload(ruta, archivo);
      if (errSubida) throw errSubida;
      const { data: pub } = sb.storage.from('tareas-archivos').getPublicUrl(ruta);
      archivo_url = pub.publicUrl;
      archivo_nombre = archivo.name;
    }

    const filas = gradosSeleccionados.map(grado => ({
      materia, grado, titulo, descripcion, fecha_entrega: fechaEntrega,
      archivo_url, archivo_nombre, clase_numero: claseNumero,
    }));

    const { error: errInsert } = await sb.from('tareas').insert(filas);
    if (errInsert) throw errInsert;

    formMsg.textContent = gradosSeleccionados.length > 1
      ? `Tarea publicada en ${gradosSeleccionados.join(', ')} ✓`
      : 'Tarea publicada ✓';
    formMsg.className = 'msg-ok';
    formTarea.reset();
    actualizarGrados();
    cargarTareasAdmin();
  } catch (err) {
    console.error(err);
    formMsg.textContent = 'Ocurrió un error al publicar. Intenta de nuevo.';
    formMsg.className = 'msg-error';
  }
});

// ---------- Listar / borrar ----------
async function cargarTareasAdmin() {
  listaAdmin.innerHTML = '<p class="estado-cargando">Cargando…</p>';
  const { data, error } = await sb.from('tareas').select('*').order('creado_en', { ascending: false });
  if (error) {
    listaAdmin.innerHTML = '<p class="estado-vacio">No se pudieron cargar las tareas.</p>';
    return;
  }
  if (!data.length) {
    listaAdmin.innerHTML = '<p class="estado-vacio">Aún no has publicado tareas.</p>';
    return;
  }
  listaAdmin.innerHTML = data.map(t => `
    <div class="tarea-admin-item" data-id="${t.id}">
      <div class="info">
        <div class="tag">${t.materia} · ${t.grado}</div>
        <strong>${escapeHtml(t.titulo)}</strong>
      </div>
      <button class="btn-borrar" data-id="${t.id}" data-archivo="${t.archivo_url ? extraerRuta(t.archivo_url) : ''}">Borrar</button>
    </div>
  `).join('');

  listaAdmin.querySelectorAll('.btn-borrar').forEach(btn => {
    btn.addEventListener('click', () => borrarTarea(btn.dataset.id, btn.dataset.archivo));
  });
}

function extraerRuta(url) {
  const marcador = '/tareas-archivos/';
  const i = url.indexOf(marcador);
  return i === -1 ? '' : url.slice(i + marcador.length);
}

async function borrarTarea(id, rutaArchivo) {
  if (!confirm('¿Borrar esta tarea?')) return;
  await sb.from('tareas').delete().eq('id', id);
  if (rutaArchivo) {
    await sb.storage.from('tareas-archivos').remove([rutaArchivo]);
  }
  cargarTareasAdmin();
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

// ---------- Crear "Clase N" ----------
formClase.addEventListener('submit', async (e) => {
  e.preventDefault();
  formClaseMsg.textContent = 'Guardando…';
  formClaseMsg.className = '';

  const materia = fcMateria.value;
  const gradosSeleccionados = Array.from(
    fcGrados.querySelectorAll('input[name="grado"]:checked')
  ).map(cb => cb.value);
  const fechaInicio = document.getElementById('fc-inicio').value || null;
  const fechaFin = document.getElementById('fc-fin').value || null;
  const archivoInput = document.getElementById('fc-archivo');
  const archivo = archivoInput.files[0];
  const enlace = document.getElementById('fc-enlace').value.trim();

  if (!gradosSeleccionados.length) {
    formClaseMsg.textContent = 'Selecciona al menos un grado.';
    formClaseMsg.className = 'msg-error';
    return;
  }

  if (!archivo && !enlace) {
    formClaseMsg.textContent = 'Sube un archivo o pega un enlace.';
    formClaseMsg.className = 'msg-error';
    return;
  }

  try {
    let tipo, archivo_url, archivo_nombre = null;

    if (enlace) {
      tipo = 'enlace';
      archivo_url = enlace;
    } else {
      tipo = 'archivo';
      const ruta = `${sanitizarNombre(materia)}/${Date.now()}-${sanitizarNombre(archivo.name)}`;
      const { error: errSubida } = await sb.storage.from('material-clases').upload(ruta, archivo);
      if (errSubida) throw errSubida;
      const { data: pub } = sb.storage.from('material-clases').getPublicUrl(ruta);
      archivo_url = pub.publicUrl;
      archivo_nombre = archivo.name;
    }

    // El número de "Clase N" se calcula por separado para cada grado,
    // siguiendo cuántas clases (que no sean el examen final) ya existen.
    for (const grado of gradosSeleccionados) {
      const { count } = await sb
        .from('clases')
        .select('id', { count: 'exact', head: true })
        .eq('materia', materia)
        .eq('grado', grado)
        .eq('es_examen_final', false);

      const siguienteNumero = (count || 0) + 1;

      const { error: errInsert } = await sb.from('clases').insert({
        materia, grado, numero: siguienteNumero,
        es_examen_final: false,
        fecha_inicio: fechaInicio, fecha_fin: fechaFin,
        tipo, archivo_url, archivo_nombre,
      });
      if (errInsert) throw errInsert;
    }

    formClaseMsg.textContent = '✅ Clase agregada';
    formClaseMsg.className = 'msg-ok';
    formClase.reset();
    pintarGrados(fcGrados, fcMateria.value);
    cargarClasesAdmin();
  } catch (err) {
    console.error(err);
    formClaseMsg.textContent = 'Ocurrió un error al guardar. Intenta de nuevo.';
    formClaseMsg.className = 'msg-error';
  }
});

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
  if (!data.length) {
    listaClases.innerHTML = '<p class="estado-vacio">Aún no has agregado ninguna clase.</p>';
    return;
  }

  listaClases.innerHTML = data.map(c => `
    <div class="tarea-admin-item" data-id="${c.id}">
      <div class="info">
        <div class="tag">${c.materia} · ${c.grado}</div>
        <strong>Clase ${c.numero}</strong>
        ${c.fecha_inicio || c.fecha_fin ? `<div class="tag">${formatearFechaCorta(c.fecha_inicio) || '?'} — ${formatearFechaCorta(c.fecha_fin) || '?'}</div>` : ''}
      </div>
      <button class="btn-borrar" data-id="${c.id}" data-archivo="${c.tipo === 'archivo' ? extraerRutaClase(c.archivo_url) : ''}">Borrar</button>
    </div>
  `).join('');

  listaClases.querySelectorAll('.btn-borrar').forEach(btn => {
    btn.addEventListener('click', () => borrarClase(btn.dataset.id, btn.dataset.archivo));
  });
}

async function borrarClase(id, rutaArchivo) {
  if (!confirm('¿Borrar esta clase?')) return;
  await sb.from('clases').delete().eq('id', id);
  if (rutaArchivo) {
    await sb.storage.from('material-clases').remove([rutaArchivo]);
  }
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
