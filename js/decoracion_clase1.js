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

let estudiante = null;
let inscripciones = [];
let actividadEligiendo = null;
let esProfesor = false;
let filtroActual = "todas";
let companerosSalon = []; // resto de estudiantes del mismo salón que el líder, para marcar integrantes

// La misma rúbrica de 7 criterios que ya tienes en papel/Word, ahora
// integrada aquí para que el líder se autoevalúe en línea. El total
// (sobre 35 puntos) se convierte a nota MEDUCA (1.0 a 5.0) con la
// misma fórmula que ya usan los demás ejercicios de la clase.
const RUBRICA = [
  { id: "contenido", etiqueta: "Contenido correcto" },
  { id: "creatividad", etiqueta: "Creatividad y presentación" },
  { id: "materiales", etiqueta: "Uso correcto de materiales (sin sillas)" },
  { id: "trabajo_equipo", etiqueta: "Trabajo en equipo" },
  { id: "foto", etiqueta: "Foto del proyecto terminado" },
  { id: "video", etiqueta: "Video explicativo" },
  { id: "puntualidad", etiqueta: "Puntualidad (antes del 25 de sept.)" },
];

function normalizarCedula(c) {
  return (c || "").trim().toLowerCase().replace(/[\s-]/g, "");
}
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

const vistaRegistro = document.getElementById("vista-registro-deco");
const vistaTablero = document.getElementById("vista-tablero-deco");

function mostrarVista(vista) {
  [vistaRegistro, vistaTablero].forEach((v) => { v.hidden = v !== vista; });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// =========================================================
// 0) ¿Hay una sesión de profesor/admin activa en este navegador?
// =========================================================
// Se revisa en silencio: si el docente ya tiene su sesión de
// Supabase Auth iniciada en este mismo navegador (por ejemplo, porque
// entró antes a su panel de notas), esta página lo detecta sola y le
// habilita el botón "Liberar" en las actividades ya tomadas. Los
// estudiantes nunca tienen esta sesión, así que para ellos el botón
// simplemente no existe.
async function revisarModoProfesor() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) { esProfesor = false; return; }
  const correo = (user.email || "").trim().toLowerCase();
  const [perfil, asignaciones] = await Promise.all([
    sb.from("usuarios").select("rol").eq("auth_user_id", user.id).maybeSingle(),
    sb.from("profesor_materias").select("id").eq("correo_profesor", correo).limit(1),
  ]);
  esProfesor = perfil.data?.rol === "admin" || (Array.isArray(asignaciones.data) && asignaciones.data.length > 0);
  document.getElementById("deco-modo-profesor").hidden = !esProfesor;
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
  const guardado = localStorage.getItem(LS_KEY);
  if (guardado) {
    try { estudiante = JSON.parse(guardado); irAlTablero(); return; } catch { /* sigue a registro */ }
  }
  mostrarVista(vistaRegistro);
  cargarSalones();
})();

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
  if (miInscripcion && !esProfesor) {
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
        ${yaEntrego
          ? `<div class="entrega-resumen">
               ✅ <b>Ya entregaste</b> el ${new Date(miInscripcion.entregado_at).toLocaleString("es-PA")}.
               ${miInscripcion.entrega_foto_url ? `<br>📷 <a href="${escapeHtml(miInscripcion.entrega_foto_url)}" target="_blank" rel="noopener">Ver foto</a>` : ""}
               ${miInscripcion.entrega_video_url ? `<br>🎬 <a href="${escapeHtml(miInscripcion.entrega_video_url)}" target="_blank" rel="noopener">Ver video</a>` : ""}
               ${miInscripcion.autoevaluacion_nota !== null && miInscripcion.autoevaluacion_nota !== undefined ? `<br>📝 Tu autoevaluación: <b>${miInscripcion.autoevaluacion_nota}</b> (nota MEDUCA)` : ""}
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
    const detalleProfesor = (esProfesor && tomada.entregado_at) ? `
      <div class="entrega-resumen">
        ${tomada.entrega_foto_url ? `📷 <a href="${escapeHtml(tomada.entrega_foto_url)}" target="_blank" rel="noopener">Ver foto</a><br>` : ""}
        ${tomada.entrega_video_url ? `🎬 <a href="${escapeHtml(tomada.entrega_video_url)}" target="_blank" rel="noopener">Ver video</a><br>` : ""}
        ${tomada.autoevaluacion_nota !== null && tomada.autoevaluacion_nota !== undefined ? `📝 Autoevaluación del grupo: <b>${tomada.autoevaluacion_nota}</b><br>` : ""}
        ${tomada.observacion_participacion ? `⚠️ <b>Observación de participación:</b> ${escapeHtml(tomada.observacion_participacion)}` : `<span style="color:var(--muted);">Sin observaciones de participación.</span>`}
      </div>` : "";
    return `
      <div class="actividad-card tomada">
        <div class="actividad-titulo"><span>${escapeHtml(a.titulo)}</span><span class="actividad-zona">${escapeHtml(a.zona)}</span></div>
        <p class="actividad-desc">${escapeHtml(a.descripcion)}</p>
        <p class="actividad-tomada-por">🔒 Ya la tomó — 👑 Líder: <b>${escapeHtml(tomada.nombre)}</b> (${escapeHtml((tomada.salon || "").replace(/(\d+)([A-Z])/, "$1°$2"))})${tomada.integrantes ? ` · Equipo: ${escapeHtml(tomada.integrantes)}` : ""}</p>
        ${entregoInfo}
        ${detalleProfesor}
        ${esProfesor ? `<button type="button" class="btn secundario actividad-liberar" data-id="${tomada.id}" data-titulo="${escapeHtml(a.titulo)}">🗑️ Liberar este cupo</button>` : ""}
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
}

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

function abrirModalEntrega(inscripcion) {
  inscripcionEntregando = inscripcion;
  const act = CATALOGO.find((a) => a.id === inscripcion.actividad_id);
  document.getElementById("entrega-titulo-actividad").textContent = `Entregar: ${act ? act.titulo : inscripcion.actividad_id}`;
  document.getElementById("entrega-lider-nombre").textContent = inscripcion.nombre;  document.getElementById("entrega-foto").value = inscripcion.entrega_foto_url || "";
  document.getElementById("entrega-video").value = inscripcion.entrega_video_url || "";
  document.getElementById("entrega-observacion").value = inscripcion.observacion_participacion || "";
  document.getElementById("entrega-error").hidden = true;

  const previo = inscripcion.autoevaluacion || {};
  const rubricaCont = document.getElementById("rubrica-cont");
  rubricaCont.innerHTML = RUBRICA.map((r) => `
    <div class="rubrica-fila">
      <label for="rub-${r.id}">${r.etiqueta}</label>
      <select id="rub-${r.id}" data-id="${r.id}">
        ${[5, 4, 3, 2, 1].map((n) => `<option value="${n}" ${previo[r.id] === n ? "selected" : ""}>${n}</option>`).join("")}
      </select>
    </div>
  `).join("");
  rubricaCont.querySelectorAll("select").forEach((sel) => sel.addEventListener("change", actualizarNotaPreview));
  actualizarNotaPreview();

  modalEntrega.hidden = false;
}

function calcularNotaAutoevaluacion() {
  const valores = RUBRICA.map((r) => parseInt(document.getElementById(`rub-${r.id}`).value, 10));
  const puntos = valores.reduce((a, b) => a + b, 0);
  const porcentaje = Math.round((puntos / (RUBRICA.length * 5)) * 100);
  const nota = window.calcularNotaMeduca ? window.calcularNotaMeduca(porcentaje) : null;
  return { puntos, porcentaje, nota };
}

function actualizarNotaPreview() {
  const { puntos, porcentaje, nota } = calcularNotaAutoevaluacion();
  const p = document.getElementById("entrega-nota-preview");
  p.hidden = false;
  p.textContent = `Autoevaluación: ${puntos}/${RUBRICA.length * 5} puntos (${porcentaje}%) → nota MEDUCA ${nota !== null ? nota.toFixed(1) : "-"}`;
}

document.getElementById("btn-cerrar-modal-entrega").addEventListener("click", () => { modalEntrega.hidden = true; });
modalEntrega.addEventListener("click", (e) => { if (e.target === modalEntrega) modalEntrega.hidden = true; });

document.getElementById("btn-guardar-entrega").addEventListener("click", async () => {
  const errorBox = document.getElementById("entrega-error");
  errorBox.hidden = true;

  const fotoUrl = document.getElementById("entrega-foto").value.trim();
  const videoUrl = document.getElementById("entrega-video").value.trim();
  if (!fotoUrl) { errorBox.textContent = "Pega el link de la foto del proyecto terminado."; errorBox.hidden = false; return; }

  const autoevaluacion = {};
  RUBRICA.forEach((r) => { autoevaluacion[r.id] = parseInt(document.getElementById(`rub-${r.id}`).value, 10); });
  const { nota } = calcularNotaAutoevaluacion();
  const observacion = document.getElementById("entrega-observacion").value.trim();

  const btn = document.getElementById("btn-guardar-entrega");
  btn.disabled = true;
  const { error } = await sb.from(TABLA).update({
    entrega_foto_url: fotoUrl,
    entrega_video_url: videoUrl || null,
    autoevaluacion,
    autoevaluacion_nota: nota !== null ? Number(nota.toFixed(1)) : null,
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
