// Portal de Clase — panel de administración (requiere sesión de profesor)
//
// Lógica de selección en 3 pasos:
//   1. Materia (Ciencias Naturales / Informática)
//   2. Salón(es) — se pueden marcar varios a la vez (ej: 9A, 9B y 9C
//      reciben la misma clase de Ciencias Naturales; 8A y 8B la misma
//      de Informática). Los salones marcados son los que reciben,
//      desde ese momento, las clases/lecciones/tareas que se creen.
//   3. Clase (Clase 1, Clase 2...) — cada "Clase N" que se crea queda
//      "agrupada" (grupo_id) entre todos los salones que estaban
//      marcados al crearla. Agregar/borrar una lección o tarea dentro
//      de esa clase la agrega/borra en TODOS los salones del grupo a
//      la vez, sin tener que repetir la carga salón por salón.
//
// Requiere estas columnas nuevas (ver migración SQL adjunta):
//   alter table clases     add column if not exists grupo_id text;
//   alter table lecciones  add column if not exists grupo_id text;
//   alter table tareas     add column if not exists grupo_id text;
const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

// Materias que se dictan, y qué salón(es) recibe cada una.
const MATERIAS = ['Ciencias Naturales', 'Informática'];
const MATERIA_SALONES = {
  'Ciencias Naturales': ['9A', '9B', '9C', '8A'],
  'Informática': ['8A', '8B'],
};

const loginBox = document.getElementById('login-box');
const panel = document.getElementById('panel');
const loginMsg = document.getElementById('login-msg');
const userEmailEl = document.getElementById('user-email');

const listaClases = document.getElementById('lista-clases');
const panelClaseSeleccionada = document.getElementById('panel-clase-seleccionada');

const feMateria = document.getElementById('fe-materia');
const feGrados = document.getElementById('fe-grados');
const formExamen = document.getElementById('form-examen');
const formExamenMsg = document.getElementById('form-examen-msg');
const listaExamenes = document.getElementById('lista-examenes');

function pintarGrados(contenedor, materia) {
  const opciones = MATERIA_SALONES[materia] || [];
  contenedor.innerHTML = opciones.map((g) => `
    <label>
      <input type="checkbox" name="grado" value="${g}" ${opciones.length === 1 ? 'checked' : ''}>
      ${g}
    </label>
  `).join('');
}

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

// ---------- Utilidades ----------
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

function extraerRutaClase(url) {
  const marcador = '/material-clases/';
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

function esImagen(nombreOUrl) {
  if (!nombreOUrl) return false;
  return /\.(jpe?g|png|gif|webp)(\?|$)/i.test(nombreOUrl);
}

// Detecta el tipo de archivo adjunto (por extensión) para mostrar un
// botón pequeño con el ícono correspondiente (Word, Excel, PDF, imagen...).
function detectarTipoArchivo(nombreOUrl, esEnlace) {
  if (esEnlace) return { icono: '🔗', etiqueta: 'Enlace' };
  const s = (nombreOUrl || '').toLowerCase();
  if (/\.pdf(\?|$)/.test(s)) return { icono: '📕', etiqueta: 'PDF' };
  if (/\.docx?(\?|$)/.test(s)) return { icono: '📄', etiqueta: 'Word' };
  if (/\.xlsx?(\?|$)/.test(s)) return { icono: '📊', etiqueta: 'Excel' };
  if (/\.pptx?(\?|$)/.test(s)) return { icono: '📽️', etiqueta: 'PowerPoint' };
  if (/\.(jpe?g|png|gif|webp)(\?|$)/.test(s)) return { icono: '🖼️', etiqueta: 'Imagen' };
  return { icono: '📎', etiqueta: 'Archivo' };
}

// Genera el botón pequeño de "ver adjunto" para un ítem de tarea/lección.
function botonVerAdjunto(url, esEnlace, nombreArchivo) {
  if (!url) return '';
  const tipo = detectarTipoArchivo(esEnlace ? url : (nombreArchivo || url), esEnlace);
  return `<a class="btn-ver-adjunto" href="${url}" target="_blank" rel="noopener" title="${esEnlace ? 'Abrir enlace' : `Ver ${tipo.etiqueta}`}">${tipo.icono} ${tipo.etiqueta}</a>`;
}

// Identificador para agrupar filas creadas juntas (una por salón),
// tanto para "clases" como para lecciones/tareas dentro de ellas.
function generarId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return `g-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Agrupa un arreglo de filas (lecciones o tareas) por su grupo_id.
// Las filas sin grupo_id (datos antiguos) quedan cada una en su propio grupo.
function agruparPorGrupoId(filas) {
  const mapa = new Map();
  filas.forEach((f) => {
    const key = f.grupo_id || `solo-${f.id}`;
    if (!mapa.has(key)) mapa.set(key, { key, muestra: f, filas: [] });
    mapa.get(key).filas.push(f);
  });
  return Array.from(mapa.values());
}

// Agrupa las filas de "clases" (una fila por salón) en "grupos de clase"
// (una "Clase N" que puede abarcar varios salones a la vez).
function agruparClases(clases) {
  const mapa = new Map();
  clases.forEach((c) => {
    const key = c.grupo_id || `solo-${c.id}`;
    if (!mapa.has(key)) {
      mapa.set(key, {
        key,
        grupoId: c.grupo_id || null,
        materia: c.materia,
        numero: c.numero,
        nombre: c.nombre,
        fecha_inicio: c.fecha_inicio,
        fecha_fin: c.fecha_fin,
        archivo_url: c.archivo_url || null,
        archivo_nombre: c.archivo_nombre || null,
        tipo: c.tipo || null,
        filas: [],
      });
    }
    mapa.get(key).filas.push({ id: c.id, grado: c.grado });
  });
  return Array.from(mapa.values());
}

function obtenerGrupoPorKey(key) {
  return (window.__gruposAdmin || []).find((g) => g.key === key);
}

// "Clave" de una combinación de salones (para comparar sin importar el orden).
function claveDeSalones(grados) {
  return Array.from(grados).slice().sort().join('|');
}

// ---------- Estado de selección ----------
let materiaSeleccionada = MATERIAS[0];
let salonesSeleccionados = new Set(MATERIA_SALONES[materiaSeleccionada]); // por defecto, todos los salones de la materia
let grupoSeleccionadoId = null; // "key" del grupo de clase abierto (grupo_id, o "solo-<id>")
let mostrandoFormNuevaClase = false;
const leccionesPorGrupo = {};
const tareasPorGrupo = {};

// ---------- Crear "Clase N" para todos los salones marcados ----------
async function crearClase(nombreClase, fechaInicio, fechaFin, msgEl) {
  const materia = materiaSeleccionada;
  const salones = Array.from(salonesSeleccionados);

  if (!salones.length) {
    if (msgEl) {
      msgEl.textContent = 'Elige al menos un salón.';
      msgEl.className = 'msg-error';
    }
    return;
  }

  try {
    const claveSeleccion = claveDeSalones(salones);
    const gruposMismaCombinacion = (window.__gruposAdmin || [])
      .filter((g) => g.materia === materia && claveDeSalones(g.filas.map((f) => f.grado)) === claveSeleccion);
    const siguienteNumero = gruposMismaCombinacion.length
      ? Math.max(...gruposMismaCombinacion.map((g) => g.numero || 0)) + 1
      : 1;

    const grupoId = generarId();
    const filas = salones.map((grado) => ({
      materia, grado, numero: siguienteNumero,
      es_examen_final: false, nombre: nombreClase,
      fecha_inicio: fechaInicio, fecha_fin: fechaFin,
      grupo_id: grupoId,
    }));

    const { error: errInsert } = await sb.from('clases').insert(filas);
    if (errInsert) throw errInsert;

    mostrandoFormNuevaClase = false;
    grupoSeleccionadoId = grupoId;
    await cargarClasesAdmin();
  } catch (err) {
    console.error(err);
    if (msgEl) {
      msgEl.textContent = 'Ocurrió un error al guardar. Intenta de nuevo.';
      msgEl.className = 'msg-error';
    }
  }
}

async function cargarClasesAdmin() {
  listaClases.innerHTML = '<p class="estado-cargando">Cargando…</p>';
  const { data, error } = await sb
    .from('clases')
    .select('*')
    .eq('es_examen_final', false)
    .order('materia', { ascending: true })
    .order('numero', { ascending: true })
    .order('grado', { ascending: true });

  if (error) {
    listaClases.innerHTML = '<p class="estado-vacio">No se pudo cargar el material de clase.</p>';
    console.error(error);
    return;
  }

  window.__clasesAdmin = data;
  window.__gruposAdmin = agruparClases(data);

  // Si el grupo que estaba abierto ya no existe (se borró), se limpia.
  if (grupoSeleccionadoId && !window.__gruposAdmin.some((g) => g.key === grupoSeleccionadoId)) {
    grupoSeleccionadoId = null;
    panelClaseSeleccionada.innerHTML = '';
  }

  renderListaClases(data);
  if (grupoSeleccionadoId) renderPanelClase(grupoSeleccionadoId);
}

// ---------- Paso 1: materia · Paso 2: salón(es) · Paso 3: clase ----------
function renderListaClases(clases) {
  window.__gruposAdmin = agruparClases(clases);

  // Paso 1 — materia
  const materiaHtml = MATERIAS.map((m) => `
    <button class="salon-tab ${m === materiaSeleccionada ? 'activa' : ''}" data-materia="${m}">${m}</button>
  `).join('');

  // Paso 2 — salón(es) de la materia elegida, selección múltiple
  const salonesDeMateria = MATERIA_SALONES[materiaSeleccionada] || [];
  const salonesHtml = salonesDeMateria.map((s) => `
    <label>
      <input type="checkbox" data-salon-check value="${s}" ${salonesSeleccionados.has(s) ? 'checked' : ''}>
      ${s}
    </label>
  `).join('');

  // Paso 3 — clases (grupos) que pertenecen EXACTAMENTE a la combinación de
  // salones marcada arriba. Si marcas solo 8A, solo ves las clases de 8A
  // (que son distintas a las de 9A+9B+9C, aunque sean de la misma materia).
  const claveSeleccion = claveDeSalones(salonesSeleccionados);
  const gruposDeLaMateria = (window.__gruposAdmin || [])
    .filter((g) => g.materia === materiaSeleccionada && claveDeSalones(g.filas.map((f) => f.grado)) === claveSeleccion)
    .sort((a, b) => (a.numero || 0) - (b.numero || 0));

  const claseTabsHtml = gruposDeLaMateria.map((g) => `
    <span class="clase-tab-wrap">
      <button class="clase-tab ${g.key === grupoSeleccionadoId ? 'activa' : ''}" data-key="${g.key}">
        Clase ${g.numero}
        <span style="opacity:.65; font-weight:500;">· ${g.filas.map((f) => f.grado).join(', ')}</span>
      </button>
      <button class="clase-tab-borrar" data-key="${g.key}" title="Borrar esta clase">✕</button>
    </span>
  `).join('');

  const nuevaClaseFormHtml = mostrandoFormNuevaClase ? `
    <form id="form-nueva-clase" class="nueva-clase-form">
      <p style="font-size:12px; color:var(--muted); margin:0 0 10px;">
        Se creará a la vez en: <strong>${Array.from(salonesSeleccionados).join(', ') || '— elige un salón arriba —'}</strong>
      </p>
      <label for="nc-nombre">Título de la clase</label>
      <input type="text" id="nc-nombre" required placeholder="Ej: Función de nutrición y sistema circulatorio">
      <div class="campo-fila">
        <div>
          <label for="nc-inicio">Fecha de inicio (opcional)</label>
          <input type="date" id="nc-inicio">
        </div>
        <div>
          <label for="nc-fin">Fecha de fin (opcional)</label>
          <input type="date" id="nc-fin">
        </div>
      </div>
      <div class="botones-fila">
        <button type="submit">Crear clase</button>
        <button type="button" class="btn-cancelar" id="btn-cancelar-nueva-clase">Cancelar</button>
      </div>
      <p id="nueva-clase-msg" style="margin:8px 0 0;"></p>
    </form>
  ` : '';

  listaClases.innerHTML = `
    <p class="paso-label">1. Elige la materia</p>
    <div class="salon-tabs">${materiaHtml}</div>

    <p class="paso-label" style="margin-top:16px;">2. Elige el/los salón(es)</p>
    <p style="font-size:12px; color:var(--muted); margin:0 0 10px;">
      Marca todos los que reciben la misma clase (ej: 9A, 9B y 9C juntos). Lo que crees o subas abajo se publicará en todos los salones marcados.
    </p>
    <div class="grados-check">${salonesHtml}</div>

    <p class="paso-label" style="margin-top:16px;">3. Elige la clase</p>
    <div class="clase-tabs">
      ${claseTabsHtml}
      ${!mostrandoFormNuevaClase ? '<button class="clase-tab-nueva" id="btn-nueva-clase">+ Nueva clase</button>' : ''}
    </div>
    ${nuevaClaseFormHtml}
  `;

  listaClases.querySelectorAll('[data-materia]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.materia === materiaSeleccionada) return;
      materiaSeleccionada = btn.dataset.materia;
      salonesSeleccionados = new Set(MATERIA_SALONES[materiaSeleccionada] || []);
      grupoSeleccionadoId = null;
      mostrandoFormNuevaClase = false;
      panelClaseSeleccionada.innerHTML = '';
      renderListaClases(window.__clasesAdmin || []);
    });
  });

  listaClases.querySelectorAll('[data-salon-check]').forEach((chk) => {
    chk.addEventListener('change', () => {
      if (chk.checked) {
        salonesSeleccionados.add(chk.value);
      } else {
        if (salonesSeleccionados.size === 1) {
          // Debe quedar al menos un salón marcado.
          chk.checked = true;
          return;
        }
        salonesSeleccionados.delete(chk.value);
      }
      // La combinación de salones cambió: las clases que se muestran en el
      // paso 3 dependen de esa combinación exacta, así que se refresca y se
      // cierra cualquier clase que estuviera abierta de la combinación anterior.
      grupoSeleccionadoId = null;
      mostrandoFormNuevaClase = false;
      panelClaseSeleccionada.innerHTML = '';
      renderListaClases(window.__clasesAdmin || []);
    });
  });

  listaClases.querySelectorAll('.clase-tab').forEach((btn) => {
    btn.addEventListener('click', () => seleccionarGrupoClase(btn.dataset.key));
  });

  listaClases.querySelectorAll('.clase-tab-borrar').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      borrarGrupoClase(btn.dataset.key);
    });
  });

  const btnNueva = document.getElementById('btn-nueva-clase');
  if (btnNueva) {
    btnNueva.addEventListener('click', () => {
      mostrandoFormNuevaClase = true;
      renderListaClases(window.__clasesAdmin || []);
      document.getElementById('nc-nombre')?.focus();
    });
  }

  const btnCancelar = document.getElementById('btn-cancelar-nueva-clase');
  if (btnCancelar) {
    btnCancelar.addEventListener('click', () => {
      mostrandoFormNuevaClase = false;
      renderListaClases(window.__clasesAdmin || []);
    });
  }

  const formNueva = document.getElementById('form-nueva-clase');
  if (formNueva) {
    formNueva.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msgEl = document.getElementById('nueva-clase-msg');
      const nombreClase = document.getElementById('nc-nombre').value.trim();
      const fechaInicio = document.getElementById('nc-inicio').value || null;
      const fechaFin = document.getElementById('nc-fin').value || null;
      if (!salonesSeleccionados.size) {
        msgEl.textContent = 'Elige al menos un salón.';
        msgEl.className = 'msg-error';
        return;
      }
      if (!nombreClase) {
        msgEl.textContent = 'Escribe un título para la clase.';
        msgEl.className = 'msg-error';
        return;
      }
      msgEl.textContent = 'Guardando…';
      msgEl.className = '';
      await crearClase(nombreClase, fechaInicio, fechaFin, msgEl);
    });
  }
}

function seleccionarGrupoClase(key) {
  grupoSeleccionadoId = (grupoSeleccionadoId === key) ? null : key; // volver a pulsarla la cierra
  mostrandoFormNuevaClase = false;
  renderListaClases(window.__clasesAdmin || []);
  if (grupoSeleccionadoId) {
    renderPanelClase(grupoSeleccionadoId);
    panelClaseSeleccionada.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else {
    panelClaseSeleccionada.innerHTML = '';
  }
}

async function renderPanelClase(grupoKey) {
  const grupo = obtenerGrupoPorKey(grupoKey);
  if (!grupo) return;

  panelClaseSeleccionada.innerHTML = '<div class="clase-panel"><p class="estado-cargando">Cargando lecciones y tareas…</p></div>';

  const claseIds = grupo.filas.map((f) => f.id);
  const [{ data: leccionesRaw, error: errLecciones }, { data: tareasRaw, error: errTareas }] = await Promise.all([
    sb.from('lecciones').select('*').in('clase_id', claseIds).order('creado_en', { ascending: true }),
    sb.from('tareas').select('*').in('clase_id', claseIds).order('creado_en', { ascending: true }),
  ]);
  if (errLecciones) console.error(errLecciones);
  if (errTareas) console.error(errTareas);

  // Si mientras cargaba se cambió de clase, no pisar el panel nuevo.
  if (grupoSeleccionadoId !== grupoKey) return;

  const leccionesAgrupadas = agruparPorGrupoId(leccionesRaw || []);
  const tareasAgrupadas = agruparPorGrupoId(tareasRaw || []);
  leccionesPorGrupo[grupoKey] = leccionesAgrupadas;
  tareasPorGrupo[grupoKey] = tareasAgrupadas;

  const gradosTexto = grupo.filas.map((f) => f.grado).join(', ');

  panelClaseSeleccionada.innerHTML = `
    <div class="clase-panel" data-panel="${grupoKey}">
      <div class="clase-panel-cabecera">
        <div>
          <h3>Clase ${grupo.numero}: ${escapeHtml(grupo.nombre || '')}</h3>
          <span class="tag">${grupo.materia} · ${gradosTexto}${(grupo.fecha_inicio || grupo.fecha_fin) ? ` · ${formatearFechaCorta(grupo.fecha_inicio) || '?'} — ${formatearFechaCorta(grupo.fecha_fin) || '?'}` : ''}</span>
        </div>
        <button class="btn-borrar btn-borrar-clase" data-key="${grupoKey}">Borrar clase</button>
      </div>

      <h4>📖 Lecciones de esta clase</h4>
      <p style="font-size:11px; color:var(--muted); margin:-6px 0 12px;">Se agregan a la vez en: ${gradosTexto}</p>
      <form class="sub-form" data-form-leccion="${grupoKey}">
        <input type="text" name="nombre" placeholder="Nombre de la lección (opcional)">
        <input type="file" name="archivo" accept=".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp" multiple>
        <input type="url" name="enlace" placeholder="O pega un enlace">
        <button type="submit">Agregar lección</button>
        <p class="sub-form-msg"></p>
        <p style="font-size:11px; color:var(--muted); flex-basis:100%; margin:0;">Puedes seleccionar varios archivos/imágenes a la vez — se agregan como lecciones separadas.</p>
      </form>
      <div class="sub-lista">
        ${leccionesAgrupadas.length ? leccionesAgrupadas.map((g) => {
          const l = g.muestra;
          return `
          <div class="item-mini" data-key="${g.key}">
            <span style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              ${l.tipo === 'archivo' && esImagen(l.archivo_nombre || l.archivo_url) ? `<img src="${l.archivo_url}" alt="" style="width:32px;height:32px;object-fit:cover;border-radius:4px;border:1px solid var(--line);">` : ''}
              ${l.nombre ? escapeHtml(l.nombre) : (l.tipo === 'archivo' ? 'Archivo' : 'Enlace')}
              ${botonVerAdjunto(l.archivo_url, l.tipo === 'enlace', l.archivo_nombre)}
            </span>
            <button class="btn-borrar btn-borrar-leccion" data-key="${g.key}" data-grupo="${grupoKey}">Borrar</button>
          </div>
        `;
        }).join('') : '<p class="estado-vacio" style="padding:8px 0;">Aún no hay lecciones en esta clase.</p>'}
      </div>

      <hr class="seccion-divisoria">

      <h4>📚 Tareas de esta clase</h4>
      <p style="font-size:11px; color:var(--muted); margin:-6px 0 12px;">Se publican a la vez en: ${gradosTexto}</p>

      <p style="font-size:12px; color:var(--ink); font-weight:600; margin:0 0 6px;">📎 Explicación general de las tareas (opcional)</p>
      <p style="font-size:11px; color:var(--muted); margin:-2px 0 10px;">Un solo archivo o enlace con las instrucciones de todas las tareas de esta clase.</p>
      <div class="explicacion-tareas" data-explicacion="${grupoKey}">
        ${grupo.archivo_url ? `
          <div class="item-mini">
            <span style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              ${grupo.archivo_nombre ? escapeHtml(grupo.archivo_nombre) : (grupo.tipo === 'enlace' ? 'Enlace' : 'Archivo')}
              ${botonVerAdjunto(grupo.archivo_url, grupo.tipo === 'enlace', grupo.archivo_nombre)}
            </span>
            <button type="button" class="btn-borrar btn-quitar-explicacion" data-grupo="${grupoKey}">Quitar</button>
          </div>
        ` : `
          <form class="sub-form" data-form-explicacion="${grupoKey}">
            <input type="file" name="archivo" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp">
            <input type="url" name="enlace" placeholder="O pega un enlace">
            <button type="submit">Adjuntar explicación</button>
            <p class="sub-form-msg"></p>
          </form>
        `}
      </div>

      <hr class="seccion-divisoria">

      <p style="font-size:12px; color:var(--ink); font-weight:600; margin:0 0 8px;">Tareas individuales (Tarea 1, Tarea 2...)</p>
      <form class="sub-form" data-form-tarea-clase="${grupoKey}">
        <input type="text" name="titulo" placeholder="Título de la tarea" required style="flex-basis:100%;">
        <textarea name="descripcion" rows="2" placeholder="Descripción / instrucciones (opcional)"></textarea>
        <input type="date" name="entrega" title="Fecha de entrega (opcional)">
        <input type="file" name="archivo">
        <input type="url" name="enlace" placeholder="O pega un enlace">
        <button type="submit">Agregar tarea</button>
        <p class="sub-form-msg"></p>
      </form>
      <div class="sub-lista">
        ${tareasAgrupadas.length ? tareasAgrupadas.map((g) => {
          const t = g.muestra;
          return `
          <div class="item-mini" data-key="${g.key}">
            <span style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              ${escapeHtml(t.titulo)} ${t.fecha_entrega ? `<span class="item-mini-meta">· entrega ${formatearFechaCorta(t.fecha_entrega)}</span>` : ''}
              ${botonVerAdjunto(t.archivo_url, !t.archivo_nombre && !!t.archivo_url, t.archivo_nombre)}
            </span>
            <button class="btn-borrar btn-borrar-tarea-clase" data-key="${g.key}" data-grupo="${grupoKey}">Borrar</button>
          </div>
        `;
        }).join('') : '<p class="estado-vacio" style="padding:8px 0;">Aún no hay tareas en esta clase.</p>'}
      </div>
    </div>
  `;

  panelClaseSeleccionada.querySelector(`[data-form-leccion="${grupoKey}"]`).addEventListener('submit', (e) => manejarNuevaLeccion(e, grupoKey));
  panelClaseSeleccionada.querySelector(`[data-form-tarea-clase="${grupoKey}"]`).addEventListener('submit', (e) => manejarNuevaTareaDeClase(e, grupoKey));
  const formExplicacion = panelClaseSeleccionada.querySelector(`[data-form-explicacion="${grupoKey}"]`);
  if (formExplicacion) formExplicacion.addEventListener('submit', (e) => manejarNuevaExplicacion(e, grupoKey));
  const btnQuitarExplicacion = panelClaseSeleccionada.querySelector('.btn-quitar-explicacion');
  if (btnQuitarExplicacion) btnQuitarExplicacion.addEventListener('click', () => quitarExplicacion(btnQuitarExplicacion.dataset.grupo));
  panelClaseSeleccionada.querySelectorAll('.btn-borrar-leccion').forEach((btn) => {
    btn.addEventListener('click', () => borrarLeccion(btn.dataset.key, btn.dataset.grupo));
  });
  panelClaseSeleccionada.querySelectorAll('.btn-borrar-tarea-clase').forEach((btn) => {
    btn.addEventListener('click', () => borrarTareaDeClase(btn.dataset.key, btn.dataset.grupo));
  });
  panelClaseSeleccionada.querySelector('.btn-borrar-clase').addEventListener('click', () => borrarGrupoClase(grupoKey));
}

// ---------- Archivo/enlace explicativo general de las tareas de la clase ----------
async function manejarNuevaExplicacion(e, grupoKey) {
  e.preventDefault();
  const grupo = obtenerGrupoPorKey(grupoKey);
  if (!grupo) return;

  const form = e.target;
  const msgEl = form.querySelector('.sub-form-msg');
  const archivo = form.querySelector('input[name="archivo"]').files[0];
  const enlace = form.querySelector('input[name="enlace"]').value.trim();

  if (!archivo && !enlace) {
    msgEl.textContent = 'Sube un archivo o pega un enlace.';
    msgEl.className = 'sub-form-msg msg-error';
    return;
  }

  msgEl.textContent = 'Guardando…';
  msgEl.className = 'sub-form-msg';

  try {
    let tipo, archivo_url, archivo_nombre = null;

    if (enlace) {
      tipo = 'enlace';
      archivo_url = enlace;
    } else {
      tipo = 'archivo';
      const ruta = `${sanitizarNombre(grupo.materia)}/explicacion-${Date.now()}-${sanitizarNombre(archivo.name)}`;
      const { error: errSubida } = await sb.storage.from('material-clases').upload(ruta, archivo);
      if (errSubida) throw errSubida;
      const { data: pub } = sb.storage.from('material-clases').getPublicUrl(ruta);
      archivo_url = pub.publicUrl;
      archivo_nombre = archivo.name;
    }

    const claseIds = grupo.filas.map((f) => f.id);
    const { error: errUpdate } = await sb.from('clases')
      .update({ tipo, archivo_url, archivo_nombre })
      .in('id', claseIds);
    if (errUpdate) throw errUpdate;

    await cargarClasesAdmin();
    renderPanelClase(grupoKey);
  } catch (err) {
    console.error(err);
    msgEl.textContent = 'Ocurrió un error al guardar. Intenta de nuevo.';
    msgEl.className = 'sub-form-msg msg-error';
  }
}

async function quitarExplicacion(grupoKey) {
  const grupo = obtenerGrupoPorKey(grupoKey);
  if (!grupo) return;
  if (!confirm('¿Quitar el archivo/enlace explicativo de las tareas de esta clase?')) return;

  try {
    const claseIds = grupo.filas.map((f) => f.id);
    if (grupo.tipo === 'archivo' && grupo.archivo_url) {
      const ruta = extraerRutaClase(grupo.archivo_url);
      if (ruta) await sb.storage.from('material-clases').remove([ruta]);
    }
    const { error: errUpdate } = await sb.from('clases')
      .update({ tipo: null, archivo_url: null, archivo_nombre: null })
      .in('id', claseIds);
    if (errUpdate) throw errUpdate;

    await cargarClasesAdmin();
    renderPanelClase(grupoKey);
  } catch (err) {
    console.error(err);
    alert('Ocurrió un error al quitar el archivo. Intenta de nuevo.');
  }
}

// ---------- Agregar una o varias lecciones, sincronizadas en todos los salones de la clase ----------
async function manejarNuevaLeccion(e, grupoKey) {
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

  const grupo = obtenerGrupoPorKey(grupoKey);
  if (!grupo) return;

  msg.textContent = 'Guardando…';
  msg.className = 'sub-form-msg';

  try {
    const materia = grupo.materia;
    const filas = [];

    if (enlace) {
      const leccionGrupoId = generarId();
      grupo.filas.forEach((f) => {
        filas.push({ clase_id: f.id, nombre, tipo: 'enlace', archivo_url: enlace, archivo_nombre: null, grupo_id: leccionGrupoId });
      });
    } else {
      for (const [i, archivo] of archivos.entries()) {
        // El archivo se sube UNA sola vez y se comparte entre todos los salones del grupo.
        const ruta = `${sanitizarNombre(materia)}/${Date.now()}-${i}-${sanitizarNombre(archivo.name)}`;
        const { error: errSubida } = await sb.storage.from('material-clases').upload(ruta, archivo);
        if (errSubida) throw errSubida;
        const { data: pub } = sb.storage.from('material-clases').getPublicUrl(ruta);
        const nombreLeccion = nombre
          ? (archivos.length > 1 ? `${nombre} (${i + 1})` : nombre)
          : archivo.name.replace(/\.[^/.]+$/, '');

        const leccionGrupoId = generarId();
        grupo.filas.forEach((f) => {
          filas.push({
            clase_id: f.id, nombre: nombreLeccion, tipo: 'archivo',
            archivo_url: pub.publicUrl, archivo_nombre: archivo.name,
            grupo_id: leccionGrupoId,
          });
        });
      }
    }

    const { error: errInsert } = await sb.from('lecciones').insert(filas);
    if (errInsert) throw errInsert;

    form.reset();
    renderPanelClase(grupoKey);
  } catch (err) {
    console.error(err);
    msg.textContent = 'Ocurrió un error al guardar. Intenta de nuevo.';
    msg.className = 'sub-form-msg msg-error';
  }
}

async function borrarLeccion(leccionKey, grupoKey) {
  if (!confirm('¿Borrar esta lección? Se quitará de todos los salones donde aparece.')) return;

  const entrada = (leccionesPorGrupo[grupoKey] || []).find((g) => g.key === leccionKey);
  if (!entrada) return;

  const ids = entrada.filas.map((f) => f.id);
  await sb.from('lecciones').delete().in('id', ids);

  if (entrada.muestra.tipo === 'archivo') {
    const ruta = extraerRutaClase(entrada.muestra.archivo_url);
    if (ruta) await sb.storage.from('material-clases').remove([ruta]);
  }

  renderPanelClase(grupoKey);
}

// ---------- Agregar una tarea, sincronizada en todos los salones de la clase ----------
async function manejarNuevaTareaDeClase(e, grupoKey) {
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

  const grupo = obtenerGrupoPorKey(grupoKey);
  if (!grupo) return;

  msg.textContent = 'Guardando…';
  msg.className = 'sub-form-msg';

  try {
    const materia = grupo.materia;
    let archivo_url = null, archivo_nombre = null;

    if (enlace) {
      archivo_url = enlace;
    } else if (archivo) {
      // Un solo archivo subido, reutilizado en la tarea de cada salón.
      const ruta = `${sanitizarNombre(materia)}/${Date.now()}-${sanitizarNombre(archivo.name)}`;
      const { error: errSubida } = await sb.storage.from('tareas-archivos').upload(ruta, archivo);
      if (errSubida) throw errSubida;
      const { data: pub } = sb.storage.from('tareas-archivos').getPublicUrl(ruta);
      archivo_url = pub.publicUrl;
      archivo_nombre = archivo.name;
    }

    const tareaGrupoId = generarId();
    const filas = grupo.filas.map((f) => ({
      materia, grado: f.grado, titulo, descripcion, fecha_entrega: fechaEntrega,
      archivo_url, archivo_nombre, clase_id: f.id, clase_numero: grupo.numero,
      grupo_id: tareaGrupoId,
    }));

    const { error: errInsert } = await sb.from('tareas').insert(filas);
    if (errInsert) throw errInsert;

    form.reset();
    renderPanelClase(grupoKey);
  } catch (err) {
    console.error(err);
    msg.textContent = 'Ocurrió un error al guardar. Intenta de nuevo.';
    msg.className = 'sub-form-msg msg-error';
  }
}

async function borrarTareaDeClase(tareaKey, grupoKey) {
  if (!confirm('¿Borrar esta tarea? Se quitará de todos los salones donde aparece.')) return;

  const entrada = (tareasPorGrupo[grupoKey] || []).find((g) => g.key === tareaKey);
  if (!entrada) return;

  const ids = entrada.filas.map((f) => f.id);
  await sb.from('tareas').delete().in('id', ids);

  if (entrada.muestra.archivo_url) {
    const ruta = extraerRuta(entrada.muestra.archivo_url);
    if (ruta) await sb.storage.from('tareas-archivos').remove([ruta]);
  }

  renderPanelClase(grupoKey);
}

async function borrarGrupoClase(grupoKey) {
  const grupo = obtenerGrupoPorKey(grupoKey);
  if (!grupo) return;

  const gradosTexto = grupo.filas.map((f) => f.grado).join(', ');
  if (!confirm(`¿Borrar "Clase ${grupo.numero}" en ${gradosTexto} junto con TODAS sus lecciones y tareas?`)) return;

  const claseIds = grupo.filas.map((f) => f.id);
  const [{ data: lecciones }, { data: tareas }] = await Promise.all([
    sb.from('lecciones').select('*').in('clase_id', claseIds),
    sb.from('tareas').select('*').in('clase_id', claseIds),
  ]);

  // Varias filas (una por salón) apuntan al mismo archivo: se borra una sola vez.
  const rutasLecciones = [...new Set((lecciones || []).filter((l) => l.tipo === 'archivo').map((l) => extraerRutaClase(l.archivo_url)))];
  const rutasTareas = [...new Set((tareas || []).filter((t) => t.archivo_url).map((t) => extraerRuta(t.archivo_url)))];

  await sb.from('clases').delete().in('id', claseIds); // ON DELETE CASCADE borra lecciones y desvincula tareas
  if (rutasLecciones.length) await sb.storage.from('material-clases').remove(rutasLecciones);
  if (rutasTareas.length) await sb.storage.from('tareas-archivos').remove(rutasTareas);

  if (grupoSeleccionadoId === grupoKey) {
    grupoSeleccionadoId = null;
    panelClaseSeleccionada.innerHTML = '';
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
  ).map((cb) => cb.value);
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

    const grupoId = generarId();
    const filas = gradosSeleccionados.map((grado) => ({
      materia, grado, numero: null, es_examen_final: true,
      tipo, archivo_url, archivo_nombre, grupo_id: grupoId,
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

  listaExamenes.innerHTML = data.map((c) => `
    <div class="tarea-admin-item" data-id="${c.id}">
      <div class="info">
        <div class="tag">${c.materia} · ${c.grado}</div>
        <strong>Examen final</strong>
      </div>
      <button class="btn-borrar" data-id="${c.id}" data-archivo="${c.tipo === 'archivo' ? extraerRutaClase(c.archivo_url) : ''}">Borrar</button>
    </div>
  `).join('');

  listaExamenes.querySelectorAll('.btn-borrar').forEach((btn) => {
    btn.addEventListener('click', () => borrarExamen(btn.dataset.id, btn.dataset.archivo));
  });
}

async function borrarExamen(id, rutaArchivo) {
  if (!confirm('¿Borrar este examen final?')) return;
  await sb.from('clases').delete().eq('id', id);
  if (rutaArchivo) {
    await sb.storage.from('material-clases').remove([rutaArchivo]);
  }
  cargarExamenesAdmin();
}

revisarSesion();
