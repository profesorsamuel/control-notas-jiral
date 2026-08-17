// Portal de Clase — lógica pública (lectura + entrega de tareas)
//
// IMPORTANTE: esta página YA NO pide crear cuenta ni iniciar sesión.
// El estudiante solo escribe su nombre, cédula y teléfono UNA vez;
// el navegador lo recuerda (localStorage) y las próximas veces entra
// directo a ver/entregar sus tareas. La identificación de "quién es"
// para saber qué ya entregó se hace por cédula (no por cuenta).
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

// Deja la cédula siempre en el mismo formato (sin espacios/guiones,
// minúsculas) para poder compararla de forma confiable sin importar
// cómo la haya escrito el estudiante ("8-123-456" vs "8123456").
function normalizarCedula(cedula) {
  return (cedula || '').trim().toLowerCase().replace(/[\s-]/g, '');
}

// ---------- Identidad guardada en este navegador ----------
function obtenerIdentidadGuardada() {
  try {
    const bruto = localStorage.getItem(CLAVE_IDENTIDAD);
    if (!bruto) return null;
    const datos = JSON.parse(bruto);
    if (!datos || !datos.nombre || !datos.cedula) return null;
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
  selectorEstudiante.innerHTML = '';
  listaTareas.innerHTML = '<p class="estado-cargando">Cargando…</p>';
  vistaClases.style.display = 'none';
  vistaTareas.classList.remove('oculto');

  cargarMaterialClase(materia, grado);

  const identidad = obtenerIdentidadGuardada();

  if (!identidad) {
    mostrarFormularioIdentidad(materia, grado);
    return;
  }

  renderBannerEstudiante(materia, grado, identidad);
  await cargarTareasConEstado(materia, grado, identidad);
}

// ---------- Formulario simple: nombre, cédula, teléfono ----------
// Ya no hace falta "registrarse" con contraseña. Solo se pide esto la
// primera vez; el navegador lo recuerda para las próximas visitas.
function mostrarFormularioIdentidad(materia, grado) {
  selectorEstudiante.innerHTML = `
    <div class="selector-estudiante">
      <label for="idNombre">Nombre completo</label>
      <input type="text" id="idNombre" placeholder="Tu nombre y apellido">
      <label for="idCedula">Cédula</label>
      <input type="text" id="idCedula" placeholder="0-000-0000">
      <label for="idTelefono">Teléfono</label>
      <input type="tel" id="idTelefono" placeholder="6000-0000">
      <button id="btn-continuar-identidad">Continuar y ver mis tareas</button>
      <p class="msg" id="msgIdentidad"></p>
    </div>
  `;

  const boton = document.getElementById('btn-continuar-identidad');
  const msg = document.getElementById('msgIdentidad');

  boton.addEventListener('click', async () => {
    const nombre = document.getElementById('idNombre').value.trim();
    const cedula = document.getElementById('idCedula').value.trim();
    const telefono = document.getElementById('idTelefono').value.trim();

    if (!nombre || !cedula || !telefono) {
      msg.textContent = 'Completa tu nombre, cédula y teléfono.';
      msg.className = 'msg error';
      return;
    }

    boton.disabled = true;
    msg.textContent = 'Cargando tus tareas…';
    msg.className = 'msg';

    const identidad = { nombre, cedula: normalizarCedula(cedula), telefono };
    guardarIdentidad(identidad);

    renderBannerEstudiante(materia, grado, identidad);
    await cargarTareasConEstado(materia, grado, identidad);
  });
}

function renderBannerEstudiante(materia, grado, identidad) {
  selectorEstudiante.innerHTML = `
    <div class="banner-estudiante">
      <span>👤 ${escapeHtml(identidad.nombre)}</span>
      <button class="cambiar" id="btn-cambiar-identidad">¿No eres tú? Cambiar</button>
    </div>
  `;
  document.getElementById('btn-cambiar-identidad').addEventListener('click', () => {
    borrarIdentidad();
    listaTareas.innerHTML = '';
    mostrarFormularioIdentidad(materia, grado);
  });
}

function determinarEstado(fechaEntrega) {
  if (!fechaEntrega) return 'a_tiempo';
  const limite = new Date(`${fechaEntrega}T23:59:59`);
  return new Date() <= limite ? 'a_tiempo' : 'tarde';
}

// ---------- Cargar tareas + lo que este estudiante ya entregó ----------
// Ya no se busca por "estudiante_id" de una cuenta: se busca por la
// cédula que escribió, junto con materia y grado, directo en la
// tabla "entregas".
async function cargarTareasConEstado(materia, grado, identidad) {
  listaTareas.innerHTML = '<p class="estado-cargando">Cargando tareas…</p>';

  const [{ data: tareas, error: errTareas }, { data: entregas, error: errEntregas }] = await Promise.all([
    sb.from('tareas').select('*').eq('materia', materia).eq('grado', grado).order('creado_en', { ascending: false }),
    sb.from('entregas').select('*').eq('materia', materia).eq('grado', grado).eq('cedula', identidad.cedula),
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
          ${renderEstadoEntrega(t, entrega)}
        </div>
      </article>
    `;
  }).join('');

  // Conectar los formularios de entrega que se hayan renderizado
  tareas.forEach(t => {
    if (entregasPorTarea[t.id]) return; // ya entregada, no hay formulario
    const form = document.querySelector(`[data-form-entrega="${t.id}"]`);
    if (!form) return;
    form.addEventListener('submit', (e) => manejarEnvioEntrega(e, t, materia, grado, identidad));
  });
}

function renderEstadoEntrega(tarea, entrega) {
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
      estudiante_nombre: identidad.nombre,
      cedula: identidad.cedula,
      telefono: identidad.telefono,
      materia, grado, tipo, entrega_url, estado,
    });
    if (errInsert) throw errInsert;

    // Recargar la vista para mostrar el estado "Entregada"
    await cargarTareasConEstado(materia, grado, identidad);
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
