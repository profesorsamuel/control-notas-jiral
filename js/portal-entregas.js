// Portal de Clase — panel de entregas (requiere sesión de profesor)
const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const loginBox = document.getElementById('login-box');
const panel = document.getElementById('panel');
const loginMsg = document.getElementById('login-msg');

const fMateria = document.getElementById('f-materia');
const fGrado = document.getElementById('f-grado');
const fTarea = document.getElementById('f-tarea');
const fEstado = document.getElementById('f-estado');
const tbody = document.getElementById('tbody-entregas');
const resumen = document.getElementById('resumen');

let TODAS_LAS_TAREAS = [];
let TODAS_LAS_ENTREGAS = [];

async function revisarSesion() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    loginBox.classList.add('oculto');
    panel.classList.remove('oculto');
    await cargarDatos();
  } else {
    loginBox.classList.remove('oculto');
    panel.classList.add('oculto');
  }
}

document.getElementById('btn-login').addEventListener('click', async () => {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-pass').value;
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    loginMsg.textContent = 'Correo o contraseña incorrectos.';
    loginMsg.className = 'msg-error';
    return;
  }
  loginBox.classList.add('oculto');
  panel.classList.remove('oculto');
  await cargarDatos();
});

async function cargarDatos() {
  const [{ data: tareas }, { data: entregas }] = await Promise.all([
    sb.from('tareas').select('*').order('creado_en', { ascending: false }),
    sb.from('entregas').select('*').order('entregado_en', { ascending: false }),
  ]);
  TODAS_LAS_TAREAS = tareas || [];
  TODAS_LAS_ENTREGAS = entregas || [];
  actualizarOpcionesTarea();
  renderTabla();
}

function actualizarOpcionesTarea() {
  const materia = fMateria.value;
  const grado = fGrado.value;
  const filtradas = TODAS_LAS_TAREAS.filter(t =>
    (!materia || t.materia === materia) && (!grado || t.grado === grado)
  );
  const vistas = new Set();
  const opciones = [];
  filtradas.forEach(t => {
    const clave = t.titulo + '|' + t.materia;
    if (vistas.has(clave)) return;
    vistas.add(clave);
    opciones.push(t);
  });
  fTarea.innerHTML = '<option value="">Todas</option>' +
    opciones.map(t => `<option value="${escapeAttr(t.titulo)}">${escapeHtml(t.titulo)}</option>`).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
function escapeAttr(str) { return escapeHtml(str); }

function renderTabla() {
  const materia = fMateria.value;
  const grado = fGrado.value;
  const tareaTitulo = fTarea.value;
  const estado = fEstado.value;

  // Mapa tarea_id -> tarea, para mostrar título/materia/grado de cada entrega
  const mapaTareas = {};
  TODAS_LAS_TAREAS.forEach(t => { mapaTareas[t.id] = t; });

  let filas = TODAS_LAS_ENTREGAS.filter(en => {
    const t = mapaTareas[en.tarea_id];
    if (!t) return false;
    if (materia && en.materia !== materia) return false;
    if (grado && en.grado !== grado) return false;
    if (tareaTitulo && t.titulo !== tareaTitulo) return false;
    if (estado && en.estado !== estado) return false;
    return true;
  });

  resumen.textContent = `${filas.length} entrega${filas.length === 1 ? '' : 's'} encontrada${filas.length === 1 ? '' : 's'}`;

  if (!filas.length) {
    tbody.innerHTML = `<tr><td colspan="6">No hay entregas con estos filtros.</td></tr>`;
    return;
  }

  tbody.innerHTML = filas.map(en => {
    const t = mapaTareas[en.tarea_id];
    const esATiempo = en.estado === 'a_tiempo';
    return `
      <tr>
        <td>${escapeHtml(en.estudiante_nombre)}</td>
        <td>${escapeHtml(en.materia)} · ${escapeHtml(en.grado)}</td>
        <td>${escapeHtml(t ? t.titulo : '(tarea borrada)')}</td>
        <td>${formatearFechaHora(en.entregado_en)}</td>
        <td><span class="badge-tabla ${esATiempo ? 'a-tiempo' : 'tarde'}">${esATiempo ? 'A tiempo' : 'Después de la fecha'}</span></td>
        <td><a href="${en.entrega_url}" target="_blank" rel="noopener">Abrir</a></td>
      </tr>
    `;
  }).join('');
}

function formatearFechaHora(fechaISO) {
  const d = new Date(fechaISO);
  return d.toLocaleString('es-PA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

fMateria.addEventListener('change', () => { actualizarOpcionesTarea(); renderTabla(); });
fGrado.addEventListener('change', () => { actualizarOpcionesTarea(); renderTabla(); });
fTarea.addEventListener('change', renderTabla);
fEstado.addEventListener('change', renderTabla);

revisarSesion();
