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
  selNombre.disabled = false;
  selNombre.innerHTML = `<option value="">Selecciona tu nombre…</option>` +
    data.map((e2) => `<option value="${e2.id}" data-cedula="${e2.cedula || ""}">${e2.nombre}</option>`).join("");
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
}

(async function arrancar() {
  await revisarModoProfesor();
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
  const porActividad = {};
  inscripciones.forEach((i) => { porActividad[i.actividad_id] = i; });

  const miInscripcion = inscripciones.find((i) => i.cedula === estudiante.cedula);
  const cont = document.getElementById("mi-inscripcion-cont");
  if (miInscripcion) {
    const act = CATALOGO.find((a) => a.id === miInscripcion.actividad_id);
    cont.innerHTML = `
      <div class="mi-inscripcion" style="background: var(--green-bg); border: 1px solid #bfe6cc; border-radius: 14px; padding: 16px; margin-top: 16px;">
        ✅ Tu grupo ya está inscrito en: <b>${act ? escapeHtml(act.titulo) : miInscripcion.actividad_id}</b>.
        Si necesitas cambiar de actividad, pídele a tu profesor(a) que la libere.
      </div>`;
  } else {
    cont.innerHTML = `<p class="lead" style="margin-top:12px;">Todavía no has reclamado ninguna actividad — elige una de la lista de abajo.</p>`;
  }

  let lista = CATALOGO;
  if (filtroActual === "disponibles") lista = CATALOGO.filter((a) => !porActividad[a.id]);
  if (filtroActual === "tomadas") lista = CATALOGO.filter((a) => porActividad[a.id]);

  const grid = document.getElementById("actividades-grid");
  grid.innerHTML = lista.map((a) => {
    const tomada = porActividad[a.id];
    if (!tomada) {
      return `
        <div class="actividad-card disponible" data-actividad="${a.id}">
          <div class="actividad-titulo"><span>${escapeHtml(a.titulo)}</span><span class="actividad-zona">${escapeHtml(a.zona)}</span></div>
          <p class="actividad-desc">${escapeHtml(a.descripcion)}</p>
        </div>`;
    }
    return `
      <div class="actividad-card tomada">
        <div class="actividad-titulo"><span>${escapeHtml(a.titulo)}</span><span class="actividad-zona">${escapeHtml(a.zona)}</span></div>
        <p class="actividad-desc">${escapeHtml(a.descripcion)}</p>
        <p class="actividad-tomada-por">🔒 Ya la tomó: ${escapeHtml(tomada.nombre)} (${escapeHtml((tomada.salon || "").replace(/(\d+)([A-Z])/, "$1°$2"))})${tomada.integrantes ? " + " + escapeHtml(tomada.integrantes) : ""}</p>
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
  document.getElementById("deco-integrantes").value = "";
  document.getElementById("deco-error").hidden = true;
  modal.hidden = false;
}
document.getElementById("btn-cerrar-modal-deco").addEventListener("click", () => { modal.hidden = true; });
modal.addEventListener("click", (e) => { if (e.target === modal) modal.hidden = true; });

document.getElementById("btn-guardar-deco").addEventListener("click", async () => {
  const errorBox = document.getElementById("deco-error");
  errorBox.hidden = true;
  const integrantes = document.getElementById("deco-integrantes").value.trim();

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
