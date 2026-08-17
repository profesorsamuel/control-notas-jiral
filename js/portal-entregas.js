// Portal de Clase — panel de entregas (requiere sesión de profesor)
//
// Muestra TODAS las entregas de TODOS los salones juntas, con:
//   - Un resumen arriba con el conteo de entregas por salón (clic para
//     filtrar la tabla por ese salón).
//   - Filtros combinables: materia, salón, estudiante, tarea, estado.
const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const MATERIAS = ['Ciencias Naturales', 'Informática'];
const MATERIA_SALONES = {
  'Ciencias Naturales': ['9A', '9B', '9C', '8A'],
  'Informática': ['8A', '8B'],
};
const TODOS_LOS_SALONES = Array.from(new Set(Object.values(MATERIA_SALONES).flat())).sort();

const loginBox = document.getElementById('login-box');
const panel = document.getElementById('panel');
const loginMsg = document.getElementById('login-msg');
const userEmailEl = document.getElementById('user-email');

const fMateria = document.getElementById('f-materia');
const fGrado = document.getElementById('f-grado');
const fEstudiante = document.getElementById('f-estudiante');
const fTarea = document.getElementById('f-tarea');
const fEstado = document.getElementById('f-estado');
const tbody = document.getElementById('tbody-entregas');
const resumen = document.getElementById('resumen');
const resumenSalones = document.getElementById('resumen-salones');
const btnLimpiar = document.getElementById('btn-limpiar-filtros');

let TODAS_LAS_TAREAS = [];
let TODAS_LAS_ENTREGAS = [];
let TODOS_LOS_ESTUDIANTES = [];

async function revisarSesion() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    loginBox.classList.add('oculto');
    panel.classList.remove('oculto');
    userEmailEl.textContent = session.user.email;
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
  loginMsg.textContent = '';
  loginBox.classList.add('oculto');
  panel.classList.remove('oculto');
  userEmailEl.textContent = email;
  await cargarDatos();
});

document.getElementById('btn-salir').addEventListener('click', async () => {
  await sb.auth.signOut();
  location.reload();
});

async function cargarDatos() {
  tbody.innerHTML = '<tr><td colspan="6">Cargando…</td></tr>';
  resumenSalones.innerHTML = '<p class="estado-cargando">Cargando…</p>';

  const [{ data: tareas, error: errTareas }, { data: entregas, error: errEntregas }, { data: estudiantes, error: errEstudiantes }] = await Promise.all([
    sb.from('tareas').select('*').order('creado_en', { ascending: false }),
    sb.from('entregas').select('*').order('entregado_en', { ascending: false }),
    sb.from('estudiantes').select('id, nombre, salon').order('nombre', { ascending: true }),
  ]);

  if (errTareas) console.error(errTareas);
  if (errEntregas) console.error(errEntregas);
  if (errEstudiantes) console.error(errEstudiantes);

  TODAS_LAS_TAREAS = tareas || [];
  TODAS_LAS_ENTREGAS = entregas || [];
  TODOS_LOS_ESTUDIANTES = estudiantes || [];

  pintarOpcionesGrado();
  actualizarOpcionesEstudiante();
  actualizarOpcionesTarea();
  renderResumenSalones();
  renderTabla();
}

// ---------- Las opciones de "Salón" dependen de la materia elegida ----------
function pintarOpcionesGrado() {
  const materia = fMateria.value;
  const salones = materia ? (MATERIA_SALONES[materia] || []) : TODOS_LOS_SALONES;
  const valorActual = fGrado.value;
  fGrado.innerHTML = '<option value="">Todos los salones</option>' +
    salones.map((g) => `<option value="${g}">${g}</option>`).join('');
  if (salones.includes(valorActual)) fGrado.value = valorActual;
}

// ---------- Las opciones de "Estudiante" dependen del salón elegido ----------
function actualizarOpcionesEstudiante() {
  const grado = fGrado.value;
  const lista = grado ? TODOS_LOS_ESTUDIANTES.filter((e) => e.salon === grado) : TODOS_LOS_ESTUDIANTES;
  const valorActual = fEstudiante.value;
  fEstudiante.innerHTML = '<option value="">Todos los estudiantes</option>' +
    lista.map((e) => `<option value="${e.id}">${escapeHtml(e.nombre)}${!grado ? ` · ${escapeHtml(e.salon || '')}` : ''}</option>`).join('');
  if (lista.some((e) => String(e.id) === valorActual)) fEstudiante.value = valorActual;
}

// ---------- Las opciones de "Tarea" dependen de materia + salón elegidos ----------
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
  const valorActual = fTarea.value;
  fTarea.innerHTML = '<option value="">Todas</option>' +
    opciones.map(t => `<option value="${escapeAttr(t.titulo)}">${escapeHtml(t.titulo)}</option>`).join('');
  if (opciones.some(t => t.titulo === valorActual)) fTarea.value = valorActual;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
function escapeAttr(str) { return escapeHtml(str); }

// ---------- Resumen: cuántas entregas hay en cada salón, siempre visible ----------
function renderResumenSalones() {
  if (!resumenSalones) return;

  const conteos = {};
  TODOS_LOS_SALONES.forEach(g => { conteos[g] = 0; });
  TODAS_LAS_ENTREGAS.forEach(en => {
    if (conteos[en.grado] != null) conteos[en.grado]++;
  });

  resumenSalones.innerHTML = TODOS_LOS_SALONES.map(g => `
    <button type="button" class="chip-salon ${fGrado.value === g ? 'activo' : ''}" data-salon="${g}">
      ${g} <span class="chip-salon-conteo">${conteos[g]}</span>
    </button>
  `).join('');

  resumenSalones.querySelectorAll('[data-salon]').forEach(btn => {
    btn.addEventListener('click', () => {
      const salon = btn.dataset.salon;
      // Clic de nuevo sobre el mismo salón activo lo quita (vuelve a "Todos").
      fGrado.value = (fGrado.value === salon) ? '' : salon;
      actualizarOpcionesEstudiante();
      actualizarOpcionesTarea();
      renderResumenSalones();
      renderTabla();
    });
  });
}

// ---------- Tabla filtrada ----------
function renderTabla() {
  const materia = fMateria.value;
  const grado = fGrado.value;
  const estudianteId = fEstudiante.value;
  const tareaTitulo = fTarea.value;
  const estado = fEstado.value;

  const mapaTareas = {};
  TODAS_LAS_TAREAS.forEach(t => { mapaTareas[t.id] = t; });

  let filas = TODAS_LAS_ENTREGAS.filter(en => {
    const t = mapaTareas[en.tarea_id];
    if (!t) return false;
    if (materia && en.materia !== materia) return false;
    if (grado && en.grado !== grado) return false;
    if (estudianteId && String(en.estudiante_id) !== estudianteId) return false;
    if (tareaTitulo && t.titulo !== tareaTitulo) return false;
    if (estado && en.estado !== estado) return false;
    return true;
  });

  resumen.textContent = `${filas.length} entrega${filas.length === 1 ? '' : 's'} encontrada${filas.length === 1 ? '' : 's'}`;

  if (!filas.length) {
    tbody.innerHTML = '<tr><td colspan="6">No hay entregas con estos filtros.</td></tr>';
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

fMateria.addEventListener('change', () => {
  pintarOpcionesGrado();
  actualizarOpcionesEstudiante();
  actualizarOpcionesTarea();
  renderResumenSalones();
  renderTabla();
});

fGrado.addEventListener('change', () => {
  actualizarOpcionesEstudiante();
  actualizarOpcionesTarea();
  renderResumenSalones();
  renderTabla();
});

fEstudiante.addEventListener('change', renderTabla);
fTarea.addEventListener('change', renderTabla);
fEstado.addEventListener('change', renderTabla);

if (btnLimpiar) {
  btnLimpiar.addEventListener('click', () => {
    fMateria.value = '';
    pintarOpcionesGrado();
    fGrado.value = '';
    actualizarOpcionesEstudiante();
    fEstudiante.value = '';
    actualizarOpcionesTarea();
    fTarea.value = '';
    fEstado.value = '';
    renderResumenSalones();
    renderTabla();
  });
}

revisarSesion();
