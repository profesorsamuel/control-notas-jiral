// =========================================================
// Ejercicio 3 — Pareo de fotos | Clase 2: La vida en la Tierra, la historia
// geológica y la exploración del universo | Ciencias Naturales 9°
// C.E.B.G. EL JIRAL
// =========================================================
// Igual que el Ejercicio 2 (pareo de términos), pero con fotos: de
// las 25 fotos del banco (BANCO_FOTOS_CLASE2), se toman 8 al azar,
// SIEMPRE en un orden distinto, y la lista de nombres (para elegir)
// también sale revuelta cada vez — nunca en el mismo orden que las
// fotos, para que el estudiante tenga que fijarse en la foto y no
// adivinar por la posición.
//
// Identificación y guardado: exactamente el mismo mecanismo que ya
// usan el examen y el pareo de términos de esta clase (mismo
// localStorage, misma tabla "prueba_intentos_practica", esta vez con
// tipo_ejercicio:"fotos" para distinguirlo en el panel del docente).
// =========================================================

const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
const CONFIG = window.PRUEBA_CONFIG;
const T = CONFIG.tablas;
const BANCO = window.BANCO_FOTOS_CLASE2;
const CANTIDAD_POR_INTENTO = 8;

if (!Array.isArray(BANCO) || BANCO.length < CANTIDAD_POR_INTENTO) {
  throw new Error("El banco de fotos no tiene suficientes imágenes.");
}

const LS_KEY = `examen_${CONFIG.codigoExamen}`;
let estudiante = null;

function normalizarCedula(c) {
  return (c || "").trim().toLowerCase().replace(/[\s-]/g, "");
}

function mezclar(arr) {
  const copia = [...arr];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// =========================================================
// VISTAS
// =========================================================
const vistaRegistro = document.getElementById("vista-registro-fotos");
const vistaInicio = document.getElementById("vista-inicio-fotos");
const vistaEjercicio = document.getElementById("vista-ejercicio-fotos");
const vistaResultado = document.getElementById("vista-resultado-fotos");
const TODAS_LAS_VISTAS = [vistaRegistro, vistaInicio, vistaEjercicio, vistaResultado];

function mostrarVista(vista) {
  TODAS_LAS_VISTAS.forEach((v) => { v.hidden = v !== vista; });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// =========================================================
// 1) IDENTIFICACIÓN (igual que el examen y el pareo de términos)
// =========================================================
function cargarSalones() {
  const sel = document.getElementById("reg-salon-fotos");
  sel.innerHTML = `<option value="">Selecciona tu salón…</option>` +
    CONFIG.salones.map((s) => `<option value="${s}">${s.replace(/(\d+)([A-Z])/, "$1°$2")}</option>`).join("");
}

document.getElementById("reg-salon-fotos").addEventListener("change", async (e) => {
  const salon = e.target.value;
  const selNombre = document.getElementById("reg-nombre-fotos");
  const inputCedula = document.getElementById("reg-cedula-fotos");
  selNombre.innerHTML = `<option value="">Cargando…</option>`;
  selNombre.disabled = true;
  inputCedula.value = "";
  inputCedula.disabled = true;
  if (!salon) {
    selNombre.innerHTML = `<option value="">Selecciona primero tu salón…</option>`;
    return;
  }
  const { data, error } = await sb
    .from("estudiantes")
    .select("id, nombre, cedula")
    .eq("salon", salon)
    .order("nombre", { ascending: true });

  if (error || !data || data.length === 0) {
    selNombre.innerHTML = `<option value="">No se encontraron estudiantes en este salón</option>`;
    return;
  }
  selNombre.disabled = false;
  selNombre.innerHTML = `<option value="">Selecciona tu nombre…</option>` +
    data.map((e2) => `<option value="${e2.id}" data-cedula="${e2.cedula || ""}">${e2.nombre}</option>`).join("");
});

document.getElementById("reg-nombre-fotos").addEventListener("change", (e) => {
  const opt = e.target.selectedOptions[0];
  const inputCedula = document.getElementById("reg-cedula-fotos");
  const errorBox = document.getElementById("reg-error-fotos");
  errorBox.hidden = true;
  inputCedula.value = "";
  inputCedula.disabled = true;
  if (!opt || !opt.value) return;
  const cedula = opt.dataset.cedula || "";
  if (!cedula) {
    errorBox.textContent = "Este estudiante no tiene cédula registrada en el sistema. Contacta a tu profesor para que la agregue antes de continuar.";
    errorBox.hidden = false;
    return;
  }
  inputCedula.disabled = false;
});

document.getElementById("btn-registrar-fotos").addEventListener("click", () => {
  const errorBox = document.getElementById("reg-error-fotos");
  errorBox.hidden = true;

  const salon = document.getElementById("reg-salon-fotos").value;
  const selNombre = document.getElementById("reg-nombre-fotos");
  const nombreOpt = selNombre.selectedOptions[0];
  const cedulaReal = nombreOpt ? (nombreOpt.dataset.cedula || "") : "";
  const cedulaEscrita = document.getElementById("reg-cedula-fotos").value;

  if (!salon || !nombreOpt || !nombreOpt.value) {
    errorBox.textContent = "Selecciona tu salón y tu nombre.";
    errorBox.hidden = false;
    return;
  }
  if (!cedulaReal) {
    errorBox.textContent = "Este estudiante no tiene cédula registrada en el sistema. Contacta a tu profesor.";
    errorBox.hidden = false;
    return;
  }
  if (!cedulaEscrita.trim()) {
    errorBox.textContent = "Escribe tu número de cédula para continuar.";
    errorBox.hidden = false;
    return;
  }
  if (normalizarCedula(cedulaEscrita) !== normalizarCedula(cedulaReal)) {
    errorBox.textContent = "La cédula que escribiste no coincide con la registrada para este estudiante. Verifica e intenta de nuevo.";
    errorBox.hidden = false;
    return;
  }

  estudiante = {
    salon,
    nombre: nombreOpt.textContent,
    cedula: normalizarCedula(cedulaReal),
    estudianteId: nombreOpt.value,
  };
  localStorage.setItem(LS_KEY, JSON.stringify(estudiante));
  irAInicio();
});

document.getElementById("btn-cambiar-usuario-fotos").addEventListener("click", () => {
  localStorage.removeItem(LS_KEY);
  estudiante = null;
  mostrarVista(vistaRegistro);
  cargarSalones();
});

// Verdadero si ya pasó la fecha límite de esta Clase (CONFIG.fechaCierreTotal).
// A partir de ese momento nadie más puede empezar ni repetir el ejercicio.
function claseYaCerro() {
  return !!(CONFIG.fechaCierreTotal && new Date() > new Date(CONFIG.fechaCierreTotal));
}

function irAInicio() {
  document.getElementById("fotos-saludo").textContent =
    `Hola, ${estudiante.nombre.split(" ")[0]} 👋 — Relaciona cada foto con su nombre`;
  mostrarVista(vistaInicio);

  const btnComenzar = document.getElementById("btn-comenzar-fotos");
  if (claseYaCerro()) {
    btnComenzar.disabled = true;
    btnComenzar.textContent = "🔒 Esta clase ya cerró";
  } else {
    btnComenzar.disabled = false;
    btnComenzar.textContent = "📷 Comenzar pareo de fotos";
  }
}

(function arrancar() {
  const guardado = localStorage.getItem(LS_KEY);
  if (guardado) {
    try {
      estudiante = JSON.parse(guardado);
      irAInicio();
      return;
    } catch { /* sigue a registro */ }
  }
  mostrarVista(vistaRegistro);
  cargarSalones();
})();

// =========================================================
// 2) EL PAREO DE FOTOS EN SÍ
// =========================================================
let intentoActual = null;

function iniciarIntento() {
  if (claseYaCerro()) {
    alert("🔒 Esta clase ya cerró. Ya no se pueden hacer más intentos de práctica.");
    irAInicio();
    return;
  }
  // Las fotos siempre salen en un orden al azar (aunque se repita el
  // banco completo, el ORDEN de las 8 elegidas cambia cada vez).
  const elegidos = mezclar(BANCO).slice(0, CANTIDAD_POR_INTENTO);
  const fotos = elegidos.map((f, i) => ({ ...f, numero: i + 1 }));

  // La lista de nombres para elegir SIEMPRE sale revuelta, en un orden
  // distinto al de las fotos — la misma lista se usa en los 8 select.
  const nombresRevueltos = mezclar(fotos.map((f) => f.nombre));

  intentoActual = { fotos, nombresRevueltos, tInicio: Date.now() };
  renderEjercicio();
  mostrarVista(vistaEjercicio);
}

function renderEjercicio() {
  const grid = document.getElementById("fotos-grid");

  grid.innerHTML = intentoActual.fotos.map((f) => `
    <div class="fotos-item" data-numero="${f.numero}">
      <div class="fotos-foto"><img src="${f.imagen}" alt="Foto ${f.numero}" loading="lazy"></div>
      <div class="fotos-select-cont">
        <div class="fotos-num">Foto ${f.numero}</div>
        <select class="fotos-select" data-numero="${f.numero}">
          <option value="">— elige el nombre —</option>
          ${intentoActual.nombresRevueltos.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("")}
        </select>
      </div>
    </div>
  `).join("");

  document.getElementById("fotos-progreso").textContent = `0 / ${intentoActual.fotos.length} respondidas`;
  grid.querySelectorAll(".fotos-select").forEach((sel) => sel.addEventListener("change", actualizarProgreso));
  document.getElementById("btn-revisar-fotos").disabled = true;
}

function actualizarProgreso() {
  const selects = document.querySelectorAll(".fotos-select");
  const respondidas = [...selects].filter((s) => s.value !== "").length;
  document.getElementById("fotos-progreso").textContent = `${respondidas} / ${selects.length} respondidas`;
  document.getElementById("btn-revisar-fotos").disabled = respondidas < selects.length;
}

document.getElementById("btn-comenzar-fotos").addEventListener("click", iniciarIntento);
document.getElementById("btn-otro-intento-fotos").addEventListener("click", iniciarIntento);
document.getElementById("btn-volver-menu-fotos").addEventListener("click", () => mostrarVista(vistaInicio));

document.getElementById("btn-revisar-fotos").addEventListener("click", async () => {
  let correctas = 0;
  const detalle = [];

  intentoActual.fotos.forEach((f) => {
    const sel = document.querySelector(`.fotos-select[data-numero="${f.numero}"]`);
    const elegido = sel.value;
    const esCorrecta = elegido === f.nombre;
    if (esCorrecta) correctas++;
    detalle.push({ ...f, elegido, esCorrecta });
    sel.disabled = true;
  });

  const total = intentoActual.fotos.length;
  const incorrectas = total - correctas;
  const porcentaje = Math.round((correctas / total) * 100);
  const tiempoSeg = Math.round((Date.now() - intentoActual.tInicio) / 1000);
  const notaMeduca = window.calcularNotaMeduca ? window.calcularNotaMeduca(porcentaje) : null;

  document.getElementById("fotos-res-correctas").textContent = `${correctas}/${total}`;
  document.getElementById("fotos-res-nota").textContent = notaMeduca !== null ? notaMeduca.toFixed(1) : "-";
  document.getElementById("fotos-res-porcentaje").textContent = `${porcentaje}%`;
  document.getElementById("fotos-res-tiempo").textContent = formatoSeg(tiempoSeg);

  const cont = document.getElementById("fotos-revision");
  cont.innerHTML = detalle.map((d) => `
    <div class="fotos-item ${d.esCorrecta ? "fotos-correcta" : "fotos-incorrecta"}">
      <div class="fotos-foto"><img src="${d.imagen}" alt="Foto ${d.numero}"></div>
      <div>
        <div class="fotos-num">Foto ${d.numero}</div>
        ${d.esCorrecta
          ? `<div class="fotos-respuesta-correcta">✅ ${escapeHtml(d.nombre)}</div>`
          : `<div class="fotos-respuesta-incorrecta">Tu respuesta: ${escapeHtml(d.elegido || "sin responder")}</div>
             <div class="fotos-respuesta-correcta">Correcto: ${escapeHtml(d.nombre)}</div>`}
      </div>
    </div>
  `).join("");

  // Solo se conserva el ÚLTIMO intento de este estudiante para este
  // ejercicio de fotos: si ya hay un registro previo se actualiza (aunque
  // la nota nueva sea más baja que la anterior); si no hay, se crea uno.
  const payloadFotos = {
    codigo_examen: CONFIG.codigoExamen,
    tipo_ejercicio: "fotos",
    cedula: estudiante.cedula,
    nombre: estudiante.nombre,
    salon: estudiante.salon,
    preguntas_ids: detalle.map((d) => d.imagen),
    respuestas: detalle.map((d) => ({ imagen: d.imagen, nombreCorrecto: d.nombre, elegido: d.elegido, correcta: d.esCorrecta })),
    correctas, incorrectas, porcentaje, nota_meduca: notaMeduca,
    tiempo_total_seg: tiempoSeg,
    iniciado_at: new Date(intentoActual.tInicio).toISOString(),
    finalizado_at: new Date().toISOString(),
  };

  // upsert: inserta si es el primer intento, o actualiza si ya había uno
  // (resuelto por la base de datos misma vía la restricción única
  // codigo_examen + tipo_ejercicio + cedula — no hace falta leer nada antes).
  const { error } = await sb
    .from(T.intentosPractica)
    .upsert(payloadFotos, { onConflict: "codigo_examen,tipo_ejercicio,cedula" });
  if (error) console.error("No se pudo guardar el intento de pareo de fotos:", error);

  mostrarVista(vistaResultado);
});

function formatoSeg(s) {
  const m = Math.floor(s / 60), r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}
