// =========================================================
// Decoremos el salón — Clase 1 y 2 (catálogo exclusivo)
// C.E.B.G. EL JIRAL
// =========================================================
// Cada actividad del catálogo (CATALOGO_DECORACION_CLASE1) la puede
// tomar UN SOLO grupo — en cuanto alguien la reclama, la tabla
// "decoracion_clase1" tiene una fila con ese actividad_id (columna
// UNIQUE), así que nadie más puede insertar otra para la misma.
//
// Los estudiantes NO pueden cancelar ni cambiar su propia
// inscripción: la única forma de liberar un cupo es que el
// profesor(a), con su sesión real de Supabase Auth, use el botón
// "Liberar" que aparece SOLO cuando esa sesión existe.
// =========================================================

const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
const CONFIG = window.PRUEBA_CONFIG;
const CATALOGO = window.CATALOGO_DECORACION_CLASE1;
const TABLA = "decoracion_clase1";
const LS_KEY = "decoracion_clase1_estudiante";
const LS_KEY_PRUEBA = "decoracion_clase1_modo_prueba_estudiante";

let estudiante = null;
let inscripciones = [];
let actividadEligiendo = null;
let esProfesor = false;
// true solo cuando el profesor, teniendo su sesión real activa, decidió
// a propósito "entrar como estudiante" para ver esa experiencia. Mientras
// esto sea true, tratamos al profesor como estudiante normal para efectos
// de qué ve (aunque esProfesor siga en true por debajo).
let modoPruebaEstudiante = false;
let filtroActual = "todas";
let filtroActualProfesor = "todas";
let companerosSalon = []; // resto de estudiantes del mismo salón que el líder, para marcar integrantes

// La misma rúbrica de 7 criterios que ya tienes en papel/Word, más un
// 8vo criterio de "Evaluación del profesor" (10 puntos, el resto son
// de 5). El total (sobre 45 puntos) se convierte a nota MEDUCA (1.0 a
// 5.0) con la misma fórmula que ya usan los demás ejercicios de la
// clase. Cada criterio puede tener su propio máximo (campo "max").
const RUBRICA = [
  { id: "contenido", etiqueta: "Contenido correcto", max: 5 },
  { id: "creatividad", etiqueta: "Creatividad y presentación", max: 5 },
  { id: "materiales", etiqueta: "Uso correcto de materiales (sin sillas)", max: 5 },
  { id: "trabajo_equipo", etiqueta: "Trabajo en equipo", max: 5 },
  { id: "foto", etiqueta: "Foto del proyecto terminado", max: 5 },
  { id: "video", etiqueta: "Video explicativo", max: 5 },
  { id: "puntualidad", etiqueta: "Puntualidad (antes del 25 de sept.)", max: 5 },
  { id: "eval_profesor", etiqueta: "Evaluación del profesor", max: 10 },
];
const RUBRICA_TOTAL_MAX = RUBRICA.reduce((a, r) => a + r.max, 0);

function normalizarCedula(c) {
  return (c || "").trim().toLowerCase().replace(/[\s-]/g, "");
}
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// Muestra la nota (o notas) de autoevaluación como una tabla: cada fila
// es un estudiante, con su % y su nota MEDUCA al lado. Soporta el
// formato nuevo (una nota por integrante) y el formato viejo (una sola
// nota de número para todo el grupo, de antes de este cambio).
function calcularPorcentajeIndividual(criterios) {
  if (!criterios || typeof criterios !== "object") return null;
  const valores = RUBRICA.map((r) => criterios[r.id]).filter((v) => typeof v === "number");
  if (valores.length === 0) return null;
  const puntos = valores.reduce((a, b) => a + b, 0);
  return Math.round((puntos / RUBRICA_TOTAL_MAX) * 100);
}

// Las fotos 2, 3 y 4 son evidencia opcional del proceso (trabajando,
// haciendo la actividad, etc.), aparte de la foto principal del
// proyecto terminado.
function renderFotosAdicionales(registro) {
  const fotos = [registro.entrega_foto2_url, registro.entrega_foto3_url, registro.entrega_foto4_url].filter(Boolean);
  if (fotos.length === 0) return "";
  return fotos.map((url, i) => `<br>📷 <a href="${escapeHtml(url)}" target="_blank" rel="noopener">Ver foto adicional ${i + 1}</a>`).join("");
}

// Evaluación del profesor sobre el contenido — es una nota aparte de la
// autoevaluación del estudiante (0 a 20 puntos), la pone el profesor
// directamente en su panel.
function renderEvalProfesorHtml(tomada) {
  const valor = (tomada.evaluacion_profesor_contenido === null || tomada.evaluacion_profesor_contenido === undefined) ? "" : tomada.evaluacion_profesor_contenido;
  return `
    <div class="eval-profesor-cont">
      <label>📋 Evaluación del profesor — Contenido correcto (0 a 20 pts)</label>
      <div class="eval-profesor-fila">
        <input type="number" min="0" max="20" step="1" class="eval-profesor-input" data-id="${tomada.id}" value="${valor}" placeholder="0-20">
        <button type="button" class="btn secundario eval-profesor-guardar" data-id="${tomada.id}">Guardar</button>
      </div>
    </div>`;
}

function renderTablaAutoevaluacion(registro) {
  const notas = registro.autoevaluacion_nota;
  const criteriosPorEstudiante = registro.autoevaluacion;

  if (typeof notas === "number") {
    return `<span>${notas} (nota MEDUCA, autoevaluación grupal — formato anterior)</span>`;
  }
  if (!notas || typeof notas !== "object" || Object.keys(notas).length === 0) {
    return `<span style="color:var(--muted);">Sin autoevaluación todavía</span>`;
  }

  const filas = Object.keys(notas).map((nombre) => {
    const nota = notas[nombre];
    const criterios = (criteriosPorEstudiante && typeof criteriosPorEstudiante === "object") ? criteriosPorEstudiante[nombre] : null;
    const porcentaje = calcularPorcentajeIndividual(criterios);
    return `<tr><td>${escapeHtml(nombre)}</td><td>${porcentaje !== null ? porcentaje + "%" : "-"}</td><td>${nota !== null && nota !== undefined ? nota : "-"}</td></tr>`;
  }).join("");

  return `
    <table class="mini-autoeval">
      <thead><tr><th>Estudiante</th><th>%</th><th>Nota</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>`;
}

const vistaRegistro = document.getElementById("vista-registro-deco");
const vistaTablero = document.getElementById("vista-tablero-deco");
const vistaProfesor = document.getElementById("vista-profesor-deco");

function mostrarVista(vista) {
  [vistaRegistro, vistaTablero, vistaProfesor].forEach((v) => { v.hidden = v !== vista; });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// El aviso de arriba solo debe salir cuando REALMENTE estás viendo el
// catálogo en modo monitoreo (profesor real y no estás probando cómo
// lo ve un estudiante).
function actualizarBannerProfesor() {
  document.getElementById("deco-modo-profesor").hidden = !(esProfesor && !modoPruebaEstudiante);
}

// =========================================================
// 0) ¿Hay una sesión de profesor/admin activa en este navegador?
// =========================================================
// Se revisa en silencio: si el docente ya tiene su sesión de
// Supabase Auth iniciada en este mismo navegador (por ejemplo, porque
// entró antes a su panel de notas), esta página lo detecta sola y le
// da su propio panel de monitoreo — SIN pedirle identificarse como
// estudiante. Los estudiantes nunca tienen esta sesión, así que para
// ellos esto nunca se activa, sin importar qué nombre elijan al
// identificarse.
async function revisarModoProfesor() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) { esProfesor = false; return; }
  const correo = (user.email || "").trim().toLowerCase();
  const [perfil, asignaciones] = await Promise.all([
    sb.from("usuarios").select("rol").eq("auth_user_id", user.id).maybeSingle(),
    sb.from("profesor_materias").select("id").eq("correo_profesor", correo).limit(1),
  ]);
  esProfesor = perfil.data?.rol === "admin" || (Array.isArray(asignaciones.data) && asignaciones.data.length > 0);
  if (!esProfesor) {
    // Nunca debe quedar un modo de prueba "pegado" para alguien que ya
    // no tiene sesión de profesor (por ejemplo, cerró sesión).
    sessionStorage.removeItem(LS_KEY_PRUEBA);
  }
}

// =========================================================
// 1) IDENTIFICACIÓN DEL ESTUDIANTE
// =========================================================
function cargarSalones() {
  const sel = document.getElementById("reg-salon-deco");
  sel.innerHTML = `<option value="">Selecciona tu salón…</option>` +
    CONFIG.salones.map((s) => `<option value="${s}">${s.replace(/(\d+)([A-Z])/, "$1°$2")}</option>`).join("");
}

// Para el paso de identificación: excluye solo a quienes YA fueron
// marcados como integrantes de un grupo de otra persona (para que no
// se registren aparte y reclamen su propia actividad, quedando en dos
// grupos). A los LÍDERES no se les excluye aquí: alguien que ya lidera
// una actividad debe poder seguir identificándose (por ejemplo, si
// entra desde otro dispositivo) para llegar a "Entregar mi actividad".
function obtenerNombresYaIntegrantes() {
  const set = new Set();
  inscripciones.forEach((i) => {
    if (i.integrantes) {
      i.integrantes.split(";").map((s) => s.trim()).filter(Boolean).forEach((n) => set.add(n));
    }
  });
  return set;
}

// Para el checklist de "¿quiénes más son del grupo?": ahí sí se
// excluye a CUALQUIERA ya comprometido, sea líder o integrante de
// otra actividad — a esos ya no se les puede volver a marcar.
function obtenerNombresYaAsignados() {
  const set = new Set();
  inscripciones.forEach((i) => {
    if (i.nombre) set.add(i.nombre);
    if (i.integrantes) {
      i.integrantes.split(";").map((s) => s.trim()).filter(Boolean).forEach((n) => set.add(n));
    }
  });
  return set;
}

// Se trae la lista de inscripciones DESDE ANTES de identificarse, para
// poder filtrar el selector de nombres del registro (si alguien ya
// está en un grupo, ni siquiera debe verse ahí como opción).
async function precargarInscripciones() {
  const { data, error } = await sb.from(TABLA).select("*");
  if (error) { console.error("No se pudo precargar inscripciones:", error); return; }
  inscripciones = data || [];
}

document.getElementById("reg-salon-deco").addEventListener("change", async (e) => {
  const salon = e.target.value;
  const selNombre = document.getElementById("reg-nombre-deco");
  const inputCedula = document.getElementById("reg-cedula-deco");
  selNombre.innerHTML = `<option value="">Cargando…</option>`;
  selNombre.disabled = true;
  inputCedula.value = "";
  inputCedula.disabled = true;
  if (!salon) {
    selNombre.innerHTML = `<option value="">Selecciona primero tu salón…</option>`;
    return;
  }
  const { data, error } = await sb.from("estudiantes").select("id, nombre, cedula").eq("salon", salon).order("nombre", { ascending: true });
  if (error || !data || data.length === 0) {
    selNombre.innerHTML = `<option value="">No se encontraron estudiantes en este salón</option>`;
    return;
  }
  const yaIntegrantes = obtenerNombresYaIntegrantes();
  const disponibles = data.filter((e2) => !yaIntegrantes.has(e2.nombre));
  selNombre.disabled = false;
  if (disponibles.length === 0) {
    selNombre.innerHTML = `<option value="">Todos en este salón ya están en un grupo</option>`;
    return;
  }
  selNombre.innerHTML = `<option value="">Selecciona tu nombre…</option>` +
    disponibles.map((e2) => `<option value="${e2.id}" data-cedula="${e2.cedula || ""}">${e2.nombre}</option>`).join("");
});

document.getElementById("reg-nombre-deco").addEventListener("change", (e) => {
  const opt = e.target.selectedOptions[0];
  const inputCedula = document.getElementById("reg-cedula-deco");
  const errorBox = document.getElementById("reg-error-deco");
  errorBox.hidden = true;
  inputCedula.value = "";
  inputCedula.disabled = true;
  if (!opt || !opt.value) return;
  if (!opt.dataset.cedula) {
    errorBox.textContent = "Este estudiante no tiene cédula registrada. Contacta a tu profesor.";
    errorBox.hidden = false;
    return;
  }
  inputCedula.disabled = false;
});

document.getElementById("btn-registrar-deco").addEventListener("click", () => {
  const errorBox = document.getElementById("reg-error-deco");
  errorBox.hidden = true;
  const salon = document.getElementById("reg-salon-deco").value;
  const nombreOpt = document.getElementById("reg-nombre-deco").selectedOptions[0];
  const cedulaReal = nombreOpt ? (nombreOpt.dataset.cedula || "") : "";
  const cedulaEscrita = document.getElementById("reg-cedula-deco").value;

  if (!salon || !nombreOpt || !nombreOpt.value) { errorBox.textContent = "Selecciona tu salón y tu nombre."; errorBox.hidden = false; return; }
  if (!cedulaReal) { errorBox.textContent = "Este estudiante no tiene cédula registrada."; errorBox.hidden = false; return; }
  if (!cedulaEscrita.trim()) { errorBox.textContent = "Escribe tu número de cédula."; errorBox.hidden = false; return; }
  if (normalizarCedula(cedulaEscrita) !== normalizarCedula(cedulaReal)) {
    errorBox.textContent = "La cédula no coincide con la registrada. Verifica e intenta de nuevo.";
    errorBox.hidden = false;
    return;
  }

  estudiante = { salon, nombre: nombreOpt.textContent, cedula: normalizarCedula(cedulaReal) };
  localStorage.setItem(LS_KEY, JSON.stringify(estudiante));
  irAlTablero();
});

document.getElementById("btn-cambiar-usuario-deco").addEventListener("click", () => {
  localStorage.removeItem(LS_KEY);
  estudiante = null;
  mostrarVista(vistaRegistro);
  cargarSalones();
});

function irAlTablero() {
  document.getElementById("deco-saludo").textContent = `Hola, ${estudiante.nombre.split(" ")[0]} 👋 — Elige una actividad para decorar el salón`;
  document.getElementById("btn-salir-prueba-estudiante").hidden = !modoPruebaEstudiante;
  mostrarVista(vistaTablero);
  cargarTablero();
  cargarCompanerosSalon();
}

// Trae al resto de estudiantes del mismo salón del líder, para poder
// marcarlos como integrantes del grupo con un clic (en vez de
// escribir los nombres a mano, donde es fácil equivocarse).
async function cargarCompanerosSalon() {
  const { data, error } = await sb.from("estudiantes").select("id, nombre").eq("salon", estudiante.salon).order("nombre", { ascending: true });
  if (error) { console.error("No se pudo cargar la lista del salón:", error); return; }
  companerosSalon = (data || []).filter((e) => e.nombre !== estudiante.nombre);
}

(async function arrancar() {
  await revisarModoProfesor();
  await precargarInscripciones();

  modoPruebaEstudiante = esProfesor && sessionStorage.getItem(LS_KEY_PRUEBA) === "1";
  actualizarBannerProfesor();

  // Camino 1: sesión de profesor real y NO está probando como
  // estudiante → va directo a su propio panel, sin identificarse.
  if (esProfesor && !modoPruebaEstudiante) {
    mostrarVista(vistaProfesor);
    renderPanelProfesor();
    return;
  }

  // Camino 2: sin sesión de profesor (o el profesor pidió explícitamente
  // probar como estudiante) → identificación normal de estudiante.
  const guardado = localStorage.getItem(LS_KEY);
  if (guardado) {
    try { estudiante = JSON.parse(guardado); irAlTablero(); return; } catch { /* sigue a registro */ }
  }
  mostrarVista(vistaRegistro);
  cargarSalones();
})();

document.getElementById("btn-entrar-como-estudiante").addEventListener("click", () => {
  sessionStorage.setItem(LS_KEY_PRUEBA, "1");
  modoPruebaEstudiante = true;
  localStorage.removeItem(LS_KEY); // empieza limpio, no arrastra una identidad vieja
  estudiante = null;
  actualizarBannerProfesor();
  mostrarVista(vistaRegistro);
  cargarSalones();
});

document.getElementById("btn-salir-prueba-estudiante").addEventListener("click", () => {
  sessionStorage.removeItem(LS_KEY_PRUEBA);
  localStorage.removeItem(LS_KEY);
  modoPruebaEstudiante = false;
  estudiante = null;
  actualizarBannerProfesor();
  mostrarVista(vistaProfesor);
  renderPanelProfesor();
});

// =========================================================
// 2) CATÁLOGO — ver estado y reclamar
// =========================================================
async function cargarTablero() {
  const { data, error } = await sb.from(TABLA).select("*");
  if (error) { console.error("No se pudo cargar el tablero:", error); return; }
  inscripciones = data || [];
  renderTablero();
}

document.querySelectorAll(".filtro-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filtro-btn").forEach((b) => b.classList.remove("activo"));
    btn.classList.add("activo");
    filtroActual = btn.dataset.filtro;
    renderTablero();
  });
});

function renderTablero() {
  const miInscripcion = inscripciones.find((i) => i.cedula === estudiante.cedula);
  const cont = document.getElementById("mi-inscripcion-cont");
  const filtroCont = document.getElementById("filtro-estado-cont");
  const grid = document.getElementById("actividades-grid");

  // Un estudiante normal que YA tiene su actividad ya no necesita ver
  // el resto del catálogo — se le queda solo su propia actividad
  // (con la descripción completa, para no perder la instrucción de
  // cómo hacerla) y el botón de entrega. El profesor sigue viendo
  // todo, para poder monitorear a todos los grupos.
  if (miInscripcion && (!esProfesor || modoPruebaEstudiante)) {
    const act = CATALOGO.find((a) => a.id === miInscripcion.actividad_id);
    const yaEntrego = !!miInscripcion.entregado_at;
    cont.innerHTML = `
      <div class="mi-inscripcion-card">
        ✅ Tu grupo ya está inscrito en: <b>${act ? escapeHtml(act.titulo) : miInscripcion.actividad_id}</b> (líder: tú, ${escapeHtml(estudiante.nombre)}).
        ${act ? `
          <div class="entrega-resumen">
            <span class="actividad-zona">${escapeHtml(act.zona)}</span><br>
            ${escapeHtml(act.descripcion)}
          </div>` : ""}
        ${miInscripcion.integrantes ? `<p style="font-size:13px; color:var(--muted); margin-top:8px;">Equipo: ${escapeHtml(miInscripcion.integrantes)}</p>` : ""}
        ${(miInscripcion.evaluacion_profesor_contenido !== null && miInscripcion.evaluacion_profesor_contenido !== undefined) ? `<p style="font-size:13px; margin-top:8px;">📋 Evaluación del profesor (contenido): <b>${miInscripcion.evaluacion_profesor_contenido}/20 pts</b></p>` : ""}
        ${yaEntrego
          ? `<div class="entrega-resumen">
               ✅ <b>Ya entregaste</b> el ${new Date(miInscripcion.entregado_at).toLocaleString("es-PA")}.
               ${miInscripcion.entrega_foto_url ? `<br>📷 <a href="${escapeHtml(miInscripcion.entrega_foto_url)}" target="_blank" rel="noopener">Ver foto</a>${renderFotosAdicionales(miInscripcion)}` : ""}
               ${miInscripcion.entrega_video_url ? `<br>🎬 <a href="${escapeHtml(miInscripcion.entrega_video_url)}" target="_blank" rel="noopener">Ver video</a>` : ""}
               ${miInscripcion.autoevaluacion_nota !== null && miInscripcion.autoevaluacion_nota !== undefined ? `<div style="margin-top:8px;">📝 Autoevaluación:${renderTablaAutoevaluacion(miInscripcion)}</div>` : ""}
             </div>
             <button id="btn-abrir-entrega" class="wide" style="margin-top:12px;">✏️ Editar mi entrega</button>`
          : `<button id="btn-abrir-entrega" class="wide" style="margin-top:12px;">📤 Entregar mi actividad</button>`}
        <button id="btn-liberar-mi-grupo" class="link" style="padding:8px 0; color:var(--red);">🗑️ Liberar mi grupo (elegir otra actividad)</button>
      </div>`;
    document.getElementById("btn-abrir-entrega").addEventListener("click", () => abrirModalEntrega(miInscripcion));
    document.getElementById("btn-liberar-mi-grupo").addEventListener("click", async () => {
      const ok = window.confirm("¿Liberar tu grupo de esta actividad? Se borra todo lo que llevabas (incluida la entrega si ya habías subido algo) y la actividad queda libre para cualquiera. Esta acción no se puede deshacer.");
      if (!ok) return;
      const { error } = await sb.from(TABLA).delete().eq("id", miInscripcion.id);
      if (error) { alert("No se pudo liberar tu grupo: " + error.message); return; }
      await cargarTablero();
    });

    // Se esconde el resto del catálogo — ya no hace falta.
    filtroCont.hidden = true;
    grid.hidden = true;
    return;
  }

  filtroCont.hidden = false;
  grid.hidden = false;

  if (miInscripcion) {
    // Esta rama solo la ve el profesor (si entró identificado como un
    // estudiante que también tiene actividad, caso raro pero posible).
    cont.innerHTML = `<div class="mi-inscripcion-card">✅ Ya tienes una actividad reclamada, pero como modo profesor sigues viendo el catálogo completo abajo.</div>`;
  } else {
    cont.innerHTML = `<p class="lead" style="margin-top:12px;">Todavía no has reclamado ninguna actividad — elige una de la lista de abajo.</p>`;
  }

  const porActividad = {};
  inscripciones.forEach((i) => { porActividad[i.actividad_id] = i; });

  let lista = CATALOGO;
  if (filtroActual === "disponibles") lista = CATALOGO.filter((a) => !porActividad[a.id]);
  if (filtroActual === "tomadas") lista = CATALOGO.filter((a) => porActividad[a.id]);

  grid.innerHTML = lista.map((a) => {
    const tomada = porActividad[a.id];
    if (!tomada) {
      return `
        <div class="actividad-card disponible" data-actividad="${a.id}">
          <div class="actividad-titulo"><span>${escapeHtml(a.titulo)}</span><span class="actividad-zona">${escapeHtml(a.zona)}</span></div>
          <p class="actividad-desc">${escapeHtml(a.descripcion)}</p>
        </div>`;
    }
    const entregoInfo = tomada.entregado_at
      ? `<p class="actividad-tomada-por" style="color:var(--green);">✅ Entregado el ${new Date(tomada.entregado_at).toLocaleDateString("es-PA")}</p>`
      : `<p class="actividad-tomada-por" style="color:var(--amber);">⏳ Todavía no ha entregado</p>`;
    // Al profesor le mostramos el detalle completo de la entrega
    // (foto, video, autoevaluación, observación de participación)
    // directo aquí, sin necesidad de un panel aparte.
    const detalleProfesor = (esProfesor && !modoPruebaEstudiante && tomada.entregado_at) ? `
      <div class="entrega-resumen">
        ${tomada.entrega_foto_url ? `📷 <a href="${escapeHtml(tomada.entrega_foto_url)}" target="_blank" rel="noopener">Ver foto</a>${renderFotosAdicionales(tomada)}<br>` : ""}
        ${tomada.entrega_video_url ? `🎬 <a href="${escapeHtml(tomada.entrega_video_url)}" target="_blank" rel="noopener">Ver video</a><br>` : ""}
        ${tomada.autoevaluacion_nota !== null && tomada.autoevaluacion_nota !== undefined ? `<div style="margin-top:6px;">📝 Autoevaluación:${renderTablaAutoevaluacion(tomada)}</div>` : ""}
        ${tomada.observacion_participacion ? `⚠️ <b>Observación de participación:</b> ${escapeHtml(tomada.observacion_participacion)}` : `<span style="color:var(--muted);">Sin observaciones de participación.</span>`}
      </div>` : "";
    return `
      <div class="actividad-card tomada">
        <div class="actividad-titulo"><span>${escapeHtml(a.titulo)}</span><span class="actividad-zona">${escapeHtml(a.zona)}</span></div>
        <p class="actividad-desc">${escapeHtml(a.descripcion)}</p>
        <p class="actividad-tomada-por">🔒 Ya la tomó — 👑 Líder: <b>${escapeHtml(tomada.nombre)}</b> (${escapeHtml((tomada.salon || "").replace(/(\d+)([A-Z])/, "$1°$2"))})${tomada.integrantes ? ` · Equipo: ${escapeHtml(tomada.integrantes)}` : ""}</p>
        ${entregoInfo}
        ${detalleProfesor}
        ${(esProfesor && !modoPruebaEstudiante) ? renderEvalProfesorHtml(tomada) : ""}
        ${(esProfesor && !modoPruebaEstudiante) ? `<button type="button" class="btn secundario actividad-liberar" data-id="${tomada.id}" data-titulo="${escapeHtml(a.titulo)}">🗑️ Liberar este cupo</button>` : ""}
      </div>`;
  }).join("");

  grid.querySelectorAll(".actividad-card.disponible").forEach((card) => {
    card.addEventListener("click", () => abrirModal(card.dataset.actividad));
  });
  grid.querySelectorAll(".actividad-liberar").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const ok = window.confirm(`¿Liberar el cupo de "${btn.dataset.titulo}"? Volverá a estar disponible para cualquier grupo.`);
      if (!ok) return;
      const { error } = await sb.from(TABLA).delete().eq("id", btn.dataset.id);
      if (error) { alert("No se pudo liberar: " + error.message); return; }
      await cargarTablero();
    });
  });
  grid.querySelectorAll(".eval-profesor-guardar").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const input = grid.querySelector(`.eval-profesor-input[data-id="${id}"]`);
      const crudo = input.value.trim();
      const valor = crudo === "" ? null : Number(crudo);
      if (valor !== null && (Number.isNaN(valor) || valor < 0 || valor > 20)) {
        alert("La evaluación del profesor debe ser un número entre 0 y 20.");
        return;
      }
      const { error } = await sb.from(TABLA).update({ evaluacion_profesor_contenido: valor }).eq("id", id);
      if (error) { alert("No se pudo guardar la evaluación: " + error.message); return; }
      await cargarTablero();
    });
  });
}

// =========================================================
// 1.5) PANEL DEL PROFESOR — catálogo completo, sin identificarse
// =========================================================
// Esta es la vista que ve el profesor de una vez, con su sesión real,
// sin tener que pasar por el formulario de "identifícate como
// estudiante". Muestra todo: quién tomó qué, entregas y el botón de
// liberar cupos.
function renderPanelProfesor() {
  const grid = document.getElementById("actividades-grid-profesor");
  const porActividad = {};
  inscripciones.forEach((i) => { porActividad[i.actividad_id] = i; });

  let lista = CATALOGO;
  if (filtroActualProfesor === "disponibles") lista = CATALOGO.filter((a) => !porActividad[a.id]);
  if (filtroActualProfesor === "tomadas") lista = CATALOGO.filter((a) => porActividad[a.id]);

  grid.innerHTML = lista.map((a) => {
    const tomada = porActividad[a.id];
    if (!tomada) {
      return `
        <div class="actividad-card">
          <div class="actividad-titulo"><span>${escapeHtml(a.titulo)}</span><span class="actividad-zona">${escapeHtml(a.zona)}</span></div>
          <p class="actividad-desc">${escapeHtml(a.descripcion)}</p>
          <p class="actividad-tomada-por" style="color:var(--muted);">Todavía nadie la ha reclamado.</p>
        </div>`;
    }
    const entregoInfo = tomada.entregado_at
      ? `<p class="actividad-tomada-por" style="color:var(--green);">✅ Entregado el ${new Date(tomada.entregado_at).toLocaleDateString("es-PA")}</p>`
      : `<p class="actividad-tomada-por" style="color:var(--amber);">⏳ Todavía no ha entregado</p>`;
    const detalleProfesor = tomada.entregado_at ? `
      <div class="entrega-resumen">
        ${tomada.entrega_foto_url ? `📷 <a href="${escapeHtml(tomada.entrega_foto_url)}" target="_blank" rel="noopener">Ver foto</a>${renderFotosAdicionales(tomada)}<br>` : ""}
        ${tomada.entrega_video_url ? `🎬 <a href="${escapeHtml(tomada.entrega_video_url)}" target="_blank" rel="noopener">Ver video</a><br>` : ""}
        ${tomada.autoevaluacion_nota !== null && tomada.autoevaluacion_nota !== undefined ? `<div style="margin-top:6px;">📝 Autoevaluación:${renderTablaAutoevaluacion(tomada)}</div>` : ""}
        ${tomada.observacion_participacion ? `⚠️ <b>Observación de participación:</b> ${escapeHtml(tomada.observacion_participacion)}` : `<span style="color:var(--muted);">Sin observaciones de participación.</span>`}
      </div>` : "";
    return `
      <div class="actividad-card tomada">
        <div class="actividad-titulo"><span>${escapeHtml(a.titulo)}</span><span class="actividad-zona">${escapeHtml(a.zona)}</span></div>
        <p class="actividad-desc">${escapeHtml(a.descripcion)}</p>
        <p class="actividad-tomada-por">🔒 Ya la tomó — 👑 Líder: <b>${escapeHtml(tomada.nombre)}</b> (${escapeHtml((tomada.salon || "").replace(/(\d+)([A-Z])/, "$1°$2"))})${tomada.integrantes ? ` · Equipo: ${escapeHtml(tomada.integrantes)}` : ""}</p>
        ${entregoInfo}
        ${detalleProfesor}
        ${renderEvalProfesorHtml(tomada)}
        <button type="button" class="btn secundario actividad-liberar" data-id="${tomada.id}" data-titulo="${escapeHtml(a.titulo)}">🗑️ Liberar este cupo</button>
      </div>`;
  }).join("");

  grid.querySelectorAll(".actividad-liberar").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const ok = window.confirm(`¿Liberar el cupo de "${btn.dataset.titulo}"? Volverá a estar disponible para cualquier grupo.`);
      if (!ok) return;
      const { error } = await sb.from(TABLA).delete().eq("id", btn.dataset.id);
      if (error) { alert("No se pudo liberar: " + error.message); return; }
      await precargarInscripciones();
      renderPanelProfesor();
    });
  });
  grid.querySelectorAll(".eval-profesor-guardar").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const input = grid.querySelector(`.eval-profesor-input[data-id="${id}"]`);
      const crudo = input.value.trim();
      const valor = crudo === "" ? null : Number(crudo);
      if (valor !== null && (Number.isNaN(valor) || valor < 0 || valor > 20)) {
        alert("La evaluación del profesor debe ser un número entre 0 y 20.");
        return;
      }
      const { error } = await sb.from(TABLA).update({ evaluacion_profesor_contenido: valor }).eq("id", id);
      if (error) { alert("No se pudo guardar la evaluación: " + error.message); return; }
      await precargarInscripciones();
      renderPanelProfesor();
    });
  });
}

document.querySelectorAll(".filtro-btn-profesor").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filtro-btn-profesor").forEach((b) => b.classList.remove("activo"));
    btn.classList.add("activo");
    filtroActualProfesor = btn.dataset.filtro;
    renderPanelProfesor();
  });
});

// =========================================================
// 2.5) RESUMEN DEL PROFESOR — proyectos, grupos y evaluación
// =========================================================
// Una sola tabla con las 3 secciones juntas: qué actividad tomó cada
// grupo, quién lo lidera y quiénes son los integrantes (cómo se
// formaron los grupos), si ya entregaron y cómo va la autoevaluación
// de cada integrante.
function renderResumenProfesor() {
  const cont = document.getElementById("resumen-profesor-tabla-cont");
  const porActividad = {};
  inscripciones.forEach((i) => { porActividad[i.actividad_id] = i; });

  const filas = CATALOGO.map((a) => {
    const tomada = porActividad[a.id];
    if (!tomada) {
      return `
        <tr class="sin-tomar">
          <td>${escapeHtml(a.titulo)}</td>
          <td>${escapeHtml(a.zona)}</td>
          <td colspan="5">Todavía nadie la ha reclamado.</td>
        </tr>`;
    }
    const integrantes = tomada.integrantes
      ? tomada.integrantes.split(";").map((s) => s.trim()).filter(Boolean)
      : [];
    const evalTexto = renderTablaAutoevaluacion(tomada);
    const evalProfesorTexto = (tomada.evaluacion_profesor_contenido !== null && tomada.evaluacion_profesor_contenido !== undefined)
      ? `<b>${tomada.evaluacion_profesor_contenido}/20</b>`
      : `<span style="color:var(--muted);">Sin evaluar</span>`;
    const estado = tomada.entregado_at
      ? `✅ Entregado (${new Date(tomada.entregado_at).toLocaleDateString("es-PA")})`
      : "⏳ Pendiente de entregar";
    return `
      <tr class="${tomada.entregado_at ? "" : "pendiente"}">
        <td>${escapeHtml(a.titulo)}</td>
        <td>${escapeHtml(a.zona)}</td>
        <td>${escapeHtml((tomada.salon || "").replace(/(\d+)([A-Z])/, "$1°$2"))}</td>
        <td>
          👑 ${escapeHtml(tomada.nombre)}
          ${integrantes.length ? `<br><span style="color:var(--muted);">+ ${integrantes.length} integrante(s): ${escapeHtml(integrantes.join(", "))}</span>` : `<br><span style="color:var(--muted);">Sin más integrantes registrados.</span>`}
        </td>
        <td>${estado}</td>
        <td>${evalTexto}</td>
        <td>${evalProfesorTexto}</td>
      </tr>`;
  }).join("");

  cont.innerHTML = `
    <table class="resumen-tabla">
      <thead>
        <tr>
          <th>Actividad</th>
          <th>Zona</th>
          <th>Salón</th>
          <th>Grupo (líder + integrantes)</th>
          <th>Entrega</th>
          <th>Autoevaluación</th>
          <th>Eval. profesor (contenido)</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>`;
}

document.getElementById("btn-ver-resumen-profesor").addEventListener("click", () => {
  renderResumenProfesor();
  document.getElementById("modal-resumen-profesor").hidden = false;
});
document.getElementById("btn-cerrar-modal-resumen").addEventListener("click", () => {
  document.getElementById("modal-resumen-profesor").hidden = true;
});
document.getElementById("modal-resumen-profesor").addEventListener("click", (e) => {
  if (e.target.id === "modal-resumen-profesor") document.getElementById("modal-resumen-profesor").hidden = true;
});

// =========================================================
// 3) MODAL — reclamar una actividad
// =========================================================
const modal = document.getElementById("modal-deco");

function abrirModal(actividadId) {
  if (inscripciones.some((i) => i.cedula === estudiante.cedula)) {
    alert("Tu grupo ya tiene una actividad reclamada. Si necesitas cambiar, pídele a tu profesor(a) que la libere primero.");
    return;
  }
  actividadEligiendo = actividadId;
  const act = CATALOGO.find((a) => a.id === actividadId);
  document.getElementById("modal-deco-titulo").textContent = act.titulo;
  document.getElementById("modal-deco-desc").textContent = act.descripcion;
  document.getElementById("modal-deco-lider-nombre").textContent = estudiante.nombre;
  document.getElementById("deco-error").hidden = true;
  renderChecklistIntegrantes();
  modal.hidden = false;
}

function renderChecklistIntegrantes() {
  const cont = document.getElementById("deco-integrantes-lista");
  const vacio = document.getElementById("deco-integrantes-vacio");

  // Un estudiante que ya es líder de otra actividad, o que ya fue
  // marcado como integrante de otro grupo, no debe volver a aparecer
  // aquí — así nadie queda anotado en dos grupos a la vez.
  const yaAsignados = new Set();
  inscripciones.forEach((i) => {
    if (i.nombre) yaAsignados.add(i.nombre);
    if (i.integrantes) {
      i.integrantes.split(";").map((s) => s.trim()).filter(Boolean).forEach((n) => yaAsignados.add(n));
    }
  });

  const disponibles = companerosSalon.filter((c) => !yaAsignados.has(c.nombre));

  if (disponibles.length === 0) {
    cont.innerHTML = "";
    vacio.hidden = false;
    vacio.textContent = companerosSalon.length === 0
      ? "No se encontraron más estudiantes en tu salón."
      : "Todos tus compañeros de salón ya están en otro grupo.";
    return;
  }
  vacio.hidden = true;
  cont.innerHTML = disponibles.map((c) => `
    <label class="integrante-item">
      <input type="checkbox" value="${escapeHtml(c.nombre)}">
      <span>${escapeHtml(c.nombre)}</span>
    </label>
  `).join("");
}

document.getElementById("btn-cerrar-modal-deco").addEventListener("click", () => { modal.hidden = true; });
modal.addEventListener("click", (e) => { if (e.target === modal) modal.hidden = true; });

document.getElementById("btn-guardar-deco").addEventListener("click", async () => {
  const errorBox = document.getElementById("deco-error");
  errorBox.hidden = true;
  const integrantes = [...document.querySelectorAll("#deco-integrantes-lista input:checked")].map((i) => i.value).join("; ");

  const btn = document.getElementById("btn-guardar-deco");
  btn.disabled = true;
  const { error } = await sb.from(TABLA).insert({
    actividad_id: actividadEligiendo,
    cedula: estudiante.cedula,
    nombre: estudiante.nombre,
    salon: estudiante.salon,
    integrantes: integrantes || null,
  });
  btn.disabled = false;

  if (error) {
    // Código 23505 = ya existe una fila con ese actividad_id: alguien
    // se le adelantó justo antes de que este grupo confirmara.
    if (error.code === "23505") {
      errorBox.textContent = "¡Justo se te adelantaron! Alguien más acaba de tomar esta actividad. Elige otra de la lista.";
    } else {
      errorBox.textContent = "No se pudo guardar tu inscripción. Intenta de nuevo. (" + error.message + ")";
    }
    errorBox.hidden = false;
    await cargarTablero();
    return;
  }

  modal.hidden = true;
  await cargarTablero();
});

// =========================================================
// 4) MODAL — entregar (foto, video, autoevaluación, observación)
// =========================================================
const modalEntrega = document.getElementById("modal-entrega");
let inscripcionEntregando = null;

// Devuelve la lista de nombres del grupo (líder primero, luego
// integrantes), para poder generar un bloque de rúbrica por persona.
function obtenerMiembrosDeGrupo(inscripcion) {
  const miembros = [inscripcion.nombre];
  if (inscripcion.integrantes) {
    inscripcion.integrantes.split(";").map((s) => s.trim()).filter(Boolean).forEach((n) => {
      if (!miembros.includes(n)) miembros.push(n);
    });
  }
  return miembros;
}

// Si "autoevaluacion" guardada trae directamente las claves de la
// rúbrica (contenido, creatividad, ...) es el formato viejo — una sola
// autoevaluación para todo el grupo. Se usa para no perder lo ya
// guardado al editar una entrega antigua.
const RUBRICA_IDS = new Set(RUBRICA.map((r) => r.id));
function esAutoevaluacionFormatoAntiguo(previo) {
  return !!previo && Object.keys(previo).some((k) => RUBRICA_IDS.has(k));
}

function abrirModalEntrega(inscripcion) {
  inscripcionEntregando = inscripcion;
  const act = CATALOGO.find((a) => a.id === inscripcion.actividad_id);
  document.getElementById("entrega-titulo-actividad").textContent = `Entregar: ${act ? act.titulo : inscripcion.actividad_id}`;
  document.getElementById("entrega-lider-nombre").textContent = inscripcion.nombre;
  document.getElementById("entrega-observacion").value = inscripcion.observacion_participacion || "";
  document.getElementById("entrega-error").hidden = true;
  CAMPOS_AUTOGUARDABLES.forEach(({ inputId, fileInputId, previewId, tipo, columna }) => {
    const url = inscripcion[columna] || "";
    document.getElementById(inputId).value = url;
    document.getElementById(fileInputId).value = "";
    renderPreviewArchivo(previewId, url, tipo);
    const indicador = document.getElementById(`${inputId}-guardado`);
    if (indicador) indicador.hidden = true;
  });

  const previo = inscripcion.autoevaluacion || {};
  const formatoAntiguo = esAutoevaluacionFormatoAntiguo(previo);
  const miembros = obtenerMiembrosDeGrupo(inscripcion);

  const rubricaCont = document.getElementById("rubrica-cont");
  const encabezados = miembros.map((nombre, idx) => `
    <th>${idx === 0 ? "👑" : "🙋"}<br>${escapeHtml(nombre)}${idx === 0 ? "<br><span style=\"font-weight:400;\">(líder)</span>" : ""}</th>
  `).join("");

  const filas = RUBRICA.map((r) => {
    const celdas = miembros.map((nombre, idx) => {
      // Formato viejo: solo se le puede recuperar el valor guardado al
      // líder (idx 0), porque antes no se guardaba por persona.
      const previoEstudiante = formatoAntiguo ? (idx === 0 ? previo : {}) : (previo[nombre] || {});
      return `
        <td>
          <select data-nombre="${escapeHtml(nombre)}" data-id="${r.id}">
            ${Array.from({ length: r.max }, (_, i) => r.max - i).map((n) => `<option value="${n}" ${previoEstudiante[r.id] === n ? "selected" : ""}>${n}</option>`).join("")}
          </select>
        </td>`;
    }).join("");
    return `<tr><td class="rubrica-tabla-criterio">${r.etiqueta}${r.max !== 5 ? ` <span style="color:var(--muted); font-weight:400;">(0–${r.max})</span>` : ""}</td>${celdas}</tr>`;
  }).join("");

  rubricaCont.innerHTML = `
    <div style="overflow-x:auto;">
      <table class="rubrica-tabla">
        <thead><tr><th></th>${encabezados}</tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>`;
  rubricaCont.querySelectorAll("select").forEach((sel) => sel.addEventListener("change", actualizarNotaPreview));
  actualizarNotaPreview();

  modalEntrega.hidden = false;
}

// Calcula la nota de cada integrante por separado (cada uno se evalúa
// con las mismas 7 preguntas, sobre 35 puntos).
function calcularNotaAutoevaluacion() {
  const porNombre = {};
  document.querySelectorAll("#rubrica-cont select").forEach((sel) => {
    const nombre = sel.dataset.nombre;
    if (!porNombre[nombre]) porNombre[nombre] = [];
    porNombre[nombre].push(parseInt(sel.value, 10));
  });
  return Object.keys(porNombre).map((nombre) => {
    const valores = porNombre[nombre];
    const puntos = valores.reduce((a, b) => a + b, 0);
    const porcentaje = Math.round((puntos / RUBRICA_TOTAL_MAX) * 100);
    const nota = window.calcularNotaMeduca ? window.calcularNotaMeduca(porcentaje) : null;
    return { nombre, puntos, porcentaje, nota };
  });
}

// Muestra, al final del formulario, la nota de cada integrante y la
// suma/promedio del grupo — así se ve de una vez lo que le va a quedar
// a cada quien antes de guardar.
function actualizarNotaPreview() {
  const resultados = calcularNotaAutoevaluacion();
  const p = document.getElementById("entrega-nota-preview");
  if (resultados.length === 0) { p.hidden = true; return; }

  p.hidden = false;
  const filas = resultados.map((r) =>
    `${escapeHtml(r.nombre)}: ${r.puntos}/${RUBRICA_TOTAL_MAX} pts (${r.porcentaje}%) → nota MEDUCA <b>${r.nota !== null ? r.nota.toFixed(1) : "-"}</b>`
  ).join("<br>");

  const notasValidas = resultados.map((r) => r.nota).filter((n) => n !== null);
  const sumaPuntos = resultados.reduce((a, r) => a + r.puntos, 0);
  const promedio = notasValidas.length ? notasValidas.reduce((a, b) => a + b, 0) / notasValidas.length : null;

  p.innerHTML = filas +
    `<br><br>Suma total del grupo: <b>${sumaPuntos}/${RUBRICA_TOTAL_MAX * resultados.length} pts</b>` +
    (promedio !== null ? ` — Promedio del grupo: <b>${promedio.toFixed(1)}</b>` : "");
}

document.getElementById("btn-cerrar-modal-entrega").addEventListener("click", () => { modalEntrega.hidden = true; });
document.getElementById("btn-cerrar-modal-entrega-top").addEventListener("click", () => { modalEntrega.hidden = true; });
modalEntrega.addEventListener("click", (e) => { if (e.target === modalEntrega) modalEntrega.hidden = true; });

// =========================================================
// 4.5) SUBIR ARCHIVOS (fotos y video) directo a Supabase Storage —
// en vez de pegar un link, el estudiante elige el archivo de su
// celular/computadora y se sube solo. El link público que genera
// Supabase Storage se guarda automáticamente en la misma fila de la
// tabla, en las mismas columnas de siempre (entrega_foto_url, etc.).
// Requiere que exista el bucket "decoracion-entregas" en Supabase
// Storage, marcado como público, con permiso de subida para el rol
// "anon" (los estudiantes no tienen sesión real de Supabase Auth).
// =========================================================
const BUCKET_ENTREGAS = "decoracion-entregas";
const CAMPOS_AUTOGUARDABLES = [
  { inputId: "entrega-foto", fileInputId: "entrega-foto-file", previewId: "entrega-foto-preview", columna: "entrega_foto_url", tipo: "imagen" },
  { inputId: "entrega-foto2", fileInputId: "entrega-foto2-file", previewId: "entrega-foto2-preview", columna: "entrega_foto2_url", tipo: "imagen" },
  { inputId: "entrega-foto3", fileInputId: "entrega-foto3-file", previewId: "entrega-foto3-preview", columna: "entrega_foto3_url", tipo: "imagen" },
  { inputId: "entrega-foto4", fileInputId: "entrega-foto4-file", previewId: "entrega-foto4-preview", columna: "entrega_foto4_url", tipo: "imagen" },
  { inputId: "entrega-video", fileInputId: "entrega-video-file", previewId: "entrega-video-preview", columna: "entrega_video_url", tipo: "video" },
];

async function guardarCampoAuto(columna, valor) {
  if (!inscripcionEntregando) return false;
  const { error } = await sb.from(TABLA).update({ [columna]: valor || null }).eq("id", inscripcionEntregando.id);
  if (error) { console.error("No se pudo autoguardar", columna, error); return false; }
  inscripcionEntregando[columna] = valor || null;
  return true;
}

function mostrarIndicadorGuardado(inputId, texto) {
  const indicador = document.getElementById(`${inputId}-guardado`);
  if (!indicador) return;
  indicador.textContent = texto;
  indicador.hidden = false;
  clearTimeout(indicador._timeoutId);
  if (texto) indicador._timeoutId = setTimeout(() => { indicador.hidden = true; }, 2500);
}

function renderPreviewArchivo(previewId, url, tipo) {
  const cont = document.getElementById(previewId);
  if (!cont) return;
  if (!url) { cont.innerHTML = ""; return; }
  cont.innerHTML = tipo === "video"
    ? `<video src="${escapeHtml(url)}" controls class="archivo-preview-video"></video>`
    : `<a href="${escapeHtml(url)}" target="_blank" rel="noopener"><img src="${escapeHtml(url)}" class="archivo-preview-img" alt="Vista previa"></a>`;
}

CAMPOS_AUTOGUARDABLES.forEach(({ inputId, fileInputId, previewId, columna, tipo }) => {
  const fileInput = document.getElementById(fileInputId);
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file || !inscripcionEntregando) return;

    const limiteMB = tipo === "video" ? 200 : 15;
    if (file.size > limiteMB * 1024 * 1024) {
      alert(`El archivo pesa demasiado (máximo ${limiteMB} MB para ${tipo === "video" ? "video" : "fotos"}). Comprímelo e inténtalo de nuevo.`);
      fileInput.value = "";
      return;
    }

    mostrarIndicadorGuardado(inputId, "⏳ Subiendo…");
    fileInput.disabled = true;
    const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
    const ruta = `${inscripcionEntregando.id}/${inputId}_${Date.now()}.${ext}`;

    const { error: errorSubida } = await sb.storage.from(BUCKET_ENTREGAS).upload(ruta, file, {
      upsert: true,
      contentType: file.type || undefined,
    });
    fileInput.disabled = false;

    if (errorSubida) {
      console.error("No se pudo subir el archivo:", errorSubida);
      mostrarIndicadorGuardado(inputId, "");
      alert("No se pudo subir el archivo: " + errorSubida.message);
      fileInput.value = "";
      return;
    }

    const { data: urlData } = sb.storage.from(BUCKET_ENTREGAS).getPublicUrl(ruta);
    const url = urlData ? urlData.publicUrl : "";
    document.getElementById(inputId).value = url;
    const ok = await guardarCampoAuto(columna, url);
    renderPreviewArchivo(previewId, url, tipo);
    mostrarIndicadorGuardado(inputId, ok ? "✓ Guardado" : "");
  });
});

document.querySelectorAll(".btn-eliminar-campo").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const inputId = btn.dataset.target;
    const campo = CAMPOS_AUTOGUARDABLES.find((c) => c.inputId === inputId);
    if (!campo) return;
    document.getElementById(inputId).value = "";
    document.getElementById(campo.fileInputId).value = "";
    renderPreviewArchivo(campo.previewId, "", campo.tipo);
    const ok = await guardarCampoAuto(campo.columna, null);
    if (ok) mostrarIndicadorGuardado(inputId, "🗑️ Eliminado");
  });
});

document.getElementById("btn-guardar-entrega").addEventListener("click", async () => {
  const errorBox = document.getElementById("entrega-error");
  errorBox.hidden = true;

  const fotoUrl = document.getElementById("entrega-foto").value.trim();
  const foto2Url = document.getElementById("entrega-foto2").value.trim();
  const foto3Url = document.getElementById("entrega-foto3").value.trim();
  const foto4Url = document.getElementById("entrega-foto4").value.trim();
  const videoUrl = document.getElementById("entrega-video").value.trim();
  if (!fotoUrl) { errorBox.textContent = "Pega el link de la foto del proyecto terminado."; errorBox.hidden = false; return; }

  const resultados = calcularNotaAutoevaluacion();
  const autoevaluacion = {};
  const autoevaluacion_nota = {};
  document.querySelectorAll("#rubrica-cont select").forEach((sel) => {
    const nombre = sel.dataset.nombre;
    if (!autoevaluacion[nombre]) autoevaluacion[nombre] = {};
    autoevaluacion[nombre][sel.dataset.id] = parseInt(sel.value, 10);
  });
  resultados.forEach((r) => { autoevaluacion_nota[r.nombre] = r.nota !== null ? Number(r.nota.toFixed(1)) : null; });
  const observacion = document.getElementById("entrega-observacion").value.trim();

  const btn = document.getElementById("btn-guardar-entrega");
  btn.disabled = true;
  const { error } = await sb.from(TABLA).update({
    entrega_foto_url: fotoUrl,
    entrega_foto2_url: foto2Url || null,
    entrega_foto3_url: foto3Url || null,
    entrega_foto4_url: foto4Url || null,
    entrega_video_url: videoUrl || null,
    autoevaluacion,
    autoevaluacion_nota,
    observacion_participacion: observacion || null,
    entregado_at: new Date().toISOString(),
  }).eq("id", inscripcionEntregando.id);
  btn.disabled = false;

  if (error) {
    errorBox.textContent = "No se pudo guardar tu entrega. Intenta de nuevo. (" + error.message + ")";
    errorBox.hidden = false;
    return;
  }

  modalEntrega.hidden = true;
  await cargarTablero();
});
