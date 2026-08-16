// Portal de Clase — panel de administración (requiere sesión de profesor)
const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const GRADOS_POR_MATERIA = {
  'Ciencias Naturales': ['9A', '9B', '9C'],
  'Ciencias': ['8A'],
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

function actualizarGrados() {
  const opciones = GRADOS_POR_MATERIA[fMateria.value] || [];
  fGrados.innerHTML = opciones.map((g, i) => `
    <label>
      <input type="checkbox" name="grado" value="${g}" ${opciones.length === 1 ? 'checked' : ''}>
      ${g}
    </label>
  `).join('');
}
fMateria.addEventListener('change', actualizarGrados);
actualizarGrados();

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
  const archivoInput = document.getElementById('f-archivo');
  const archivo = archivoInput.files[0];

  if (!gradosSeleccionados.length) {
    formMsg.textContent = 'Selecciona al menos un grado.';
    formMsg.className = 'msg-error';
    return;
  }

  let archivo_url = null;
  let archivo_nombre = null;

  try {
    if (archivo) {
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
      archivo_url, archivo_nombre,
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

revisarSesion();
