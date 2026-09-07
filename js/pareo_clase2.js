// =========================================================
// Ejercicio 2 — Pareo de términos | Clase 2: La vida en la Tierra, la historia
// geológica y la exploración del universo | Ciencias Naturales 9°
// C.E.B.G. EL JIRAL
// =========================================================
// Cómo funciona el pareo: de todo el banco de términos
// (BANCO_PAREO_CLASE2, que puede seguir creciendo), se toman 8 al azar
// cada vez que el estudiante practica. Se numeran los términos (1-8)
// en un orden y se les asigna una letra (A-H) a sus definiciones en
// OTRO orden distinto, para que no queden pegadas una debajo de la
// otra. El estudiante elige, para cada número, cuál letra corresponde.
//
// Identificación: se reutiliza EXACTAMENTE el mismo mecanismo que el
// examen de esta clase (mismo localStorage, mismas tablas de
// estudiantes) — si el estudiante ya se registró para el examen, este
// ejercicio lo reconoce solo.
//
// Guardado de resultados: cada intento terminado se guarda en
// "prueba_intentos_practica" (la misma tabla que ya usa la práctica
// del examen de opción múltiple), marcado con tipo_ejercicio:"pareo"
// para poder distinguirlo en el panel del docente. Requiere haber
// corrido antes el SQL "agregar_tipo_ejercicio.sql".
// =========================================================

const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
const CONFIG = window.PRUEBA_CONFIG;
const T = CONFIG.tablas;
const BANCO = window.BANCO_PAREO_CLASE2;
const CANTIDAD_POR_INTENTO = 8;
const LETRAS = ["A", "B", "C", "D", "E", "F", "G", "H"];

if (!Array.isArray(BANCO) || BANCO.length < CANTIDAD_POR_INTENTO) {
  throw new Error("El banco de términos de pareo no tiene suficientes palabras.");
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
const vistaRegistro = document.getElementById("vista-registro-pareo");
const vistaInicio = document.getElementById("vista-inicio-pareo");
const vistaEjercicio = document.getElementById("vista-ejercicio-pareo");
const vistaResultado = document.getElementById("vista-resultado-pareo");
const TODAS_LAS_VISTAS = [vistaRegistro, vistaInicio, vistaEjercicio, vistaResultado];

function mostrarVista(vista) {
  TODAS_LAS_VISTAS.forEach((v) => { v.hidden = v !== vista; });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// =========================================================
// 1) IDENTIFICACIÓN (igual que el examen de esta clase)
// =========================================================
function cargarSalones() {
  const sel = document.getElementById("reg-salon-pareo");
  sel.innerHTML = `<option value="">Selecciona tu salón…</option>` +
    CONFIG.salones.map((s) => `<option value="${s}">${s.replace(/(\d+)([A-Z])/, "$1°$2")}</option>`).join("");
}

document.getElementById("reg-salon-pareo").addEventListener("change", async (e) => {
  const salon = e.target.value;
  const selNombre = document.getElementById("reg-nombre-pareo");
  const inputCedula = document.getElementById("reg-cedula-pareo");
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

document.getElementById("reg-nombre-pareo").addEventListener("change", (e) => {
  const opt = e.target.selectedOptions[0];
  const inputCedula = document.getElementById("reg-cedula-pareo");
  const errorBox = document.getElementById("reg-error-pareo");
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

document.getElementById("btn-registrar-pareo").addEventListener("click", () => {
  const errorBox = document.getElementById("reg-error-pareo");
  errorBox.hidden = true;

  const salon = document.getElementById("reg-salon-pareo").value;
  const selNombre = document.getElementById("reg-nombre-pareo");
  const nombreOpt = selNombre.selectedOptions[0];
  const cedulaReal = nombreOpt ? (nombreOpt.dataset.cedula || "") : "";
  const cedulaEscrita = document.getElementById("reg-cedula-pareo").value;

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

document.getElementById("btn-cambiar-usuario-pareo").addEventListener("click", () => {
  localStorage.removeItem(LS_KEY);
  estudiante = null;
  mostrarVista(vistaRegistro);
  cargarSalones();
});

function irAInicio() {
  document.getElementById("pareo-saludo").textContent =
    `Hola, ${estudiante.nombre.split(" ")[0]} 👋 — Relaciona cada término con su definición`;
  mostrarVista(vistaInicio);
}

// Al cargar la página: si ya hay un estudiante guardado (por ejemplo,
// porque ya hizo el examen de esta clase), se salta el registro.
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
// 2) EL PAREO EN SÍ
// =========================================================
let intentoActual = null;

function iniciarIntento() {
  const elegidos = mezclar(BANCO).slice(0, CANTIDAD_POR_INTENTO);
  const ordenTerminos = elegidos.map((t, i) => ({ ...t, numero: i + 1 }));

  // Orden DISTINTO en el que se muestran las definiciones, para que el
  // estudiante tenga que pensar y no pueda emparejar solo mirando la
  // posición en la fila.
  const ordenDefiniciones = mezclar(ordenTerminos);
  const letraPorTermino = {};
  const definicionPorLetra = {};
  ordenDefiniciones.forEach((t, i) => {
    const letra = LETRAS[i];
    letraPorTermino[t.termino] = letra;
    definicionPorLetra[letra] = t.definicion;
  });

  intentoActual = {
    terminos: ordenTerminos.map((t) => ({ ...t, letraCorrecta: letraPorTermino[t.termino] })),
    definicionPorLetra,
    tInicio: Date.now(),
  };

  renderEjercicio();
  mostrarVista(vistaEjercicio);
}

function renderEjercicio() {
  const cuerpoTabla = document.getElementById("pareo-tabla-cuerpo");
  const listaDefiniciones = document.getElementById("pareo-lista-definiciones");

  cuerpoTabla.innerHTML = intentoActual.terminos.map((t) => `
    <tr data-numero="${t.numero}">
      <td class="pareo-col-numero">${t.numero}</td>
      <td class="pareo-col-palabra">${escapeHtml(t.termino)}</td>
      <td class="pareo-col-select">
        <select class="pareo-select" data-numero="${t.numero}">
          <option value="">— elige —</option>
          ${LETRAS.map((l) => `<option value="${l}">${l}</option>`).join("")}
        </select>
      </td>
    </tr>
  `).join("");

  const letrasEnUso = LETRAS.slice(0, intentoActual.terminos.length);
  listaDefiniciones.innerHTML = letrasEnUso.map((l) => `
    <li><b>${l}.</b> ${escapeHtml(intentoActual.definicionPorLetra[l])}</li>
  `).join("");

  document.getElementById("pareo-progreso").textContent = `0 / ${intentoActual.terminos.length} respondidas`;
  cuerpoTabla.querySelectorAll(".pareo-select").forEach((sel) => {
    sel.addEventListener("change", actualizarProgreso);
  });
  document.getElementById("btn-revisar-pareo").disabled = true;
}

function actualizarProgreso() {
  const selects = document.querySelectorAll(".pareo-select");
  const respondidas = [...selects].filter((s) => s.value !== "").length;
  document.getElementById("pareo-progreso").textContent = `${respondidas} / ${selects.length} respondidas`;
  document.getElementById("btn-revisar-pareo").disabled = respondidas < selects.length;
}

document.getElementById("btn-comenzar-pareo").addEventListener("click", iniciarIntento);
document.getElementById("btn-otro-intento").addEventListener("click", iniciarIntento);
document.getElementById("btn-volver-menu-pareo").addEventListener("click", () => mostrarVista(vistaInicio));

document.getElementById("btn-revisar-pareo").addEventListener("click", async () => {
  let correctas = 0;
  const detalle = [];

  intentoActual.terminos.forEach((t) => {
    const sel = document.querySelector(`.pareo-select[data-numero="${t.numero}"]`);
    const elegida = sel.value;
    const esCorrecta = elegida === t.letraCorrecta;
    if (esCorrecta) correctas++;
    detalle.push({ ...t, elegida, esCorrecta });
    sel.disabled = true;
    sel.closest("tr").classList.toggle("pareo-fila-correcta", esCorrecta);
    sel.closest("tr").classList.toggle("pareo-fila-incorrecta", !esCorrecta);
  });

  const total = intentoActual.terminos.length;
  const incorrectas = total - correctas;
  const porcentaje = Math.round((correctas / total) * 100);
  const tiempoSeg = Math.round((Date.now() - intentoActual.tInicio) / 1000);
  const notaMeduca = window.calcularNotaMeduca ? window.calcularNotaMeduca(porcentaje) : null;

  document.getElementById("pareo-res-correctas").textContent = `${correctas}/${total}`;
  document.getElementById("pareo-res-nota").textContent = notaMeduca !== null ? notaMeduca.toFixed(1) : "-";
  document.getElementById("pareo-res-porcentaje").textContent = `${porcentaje}%`;
  document.getElementById("pareo-res-tiempo").textContent = formatoSeg(tiempoSeg);

  const cont = document.getElementById("pareo-revision");
  cont.innerHTML = detalle.map((d) => `
    <div class="revision-item ${d.esCorrecta ? "ok" : "mal"}">
      <p><b>${d.numero}. ${escapeHtml(d.termino)}</b></p>
      ${d.esCorrecta
        ? `<p>✅ Correcto: ${escapeHtml(intentoActual.definicionPorLetra[d.letraCorrecta])}</p>`
        : `<p>Tu respuesta (${d.elegida || "sin responder"}): ${escapeHtml(intentoActual.definicionPorLetra[d.elegida] || "—")}</p>
           <p>Respuesta correcta (${d.letraCorrecta}): ${escapeHtml(intentoActual.definicionPorLetra[d.letraCorrecta])}</p>`}
    </div>
  `).join("");

  // Guarda el intento en la misma tabla que ya usa la práctica del
  // examen de opción múltiple, marcado como "pareo" para distinguirlo
  // en el panel del docente. Si falla (ej. sin conexión), no se le
  // avisa al estudiante ni se bloquea ver su resultado.
  const { error } = await sb.from(T.intentosPractica).insert({
    codigo_examen: CONFIG.codigoExamen,
    tipo_ejercicio: "pareo",
    cedula: estudiante.cedula,
    nombre: estudiante.nombre,
    salon: estudiante.salon,
    preguntas_ids: detalle.map((d) => d.termino),
    respuestas: detalle.map((d) => ({ termino: d.termino, elegida: d.elegida, correcta: d.esCorrecta })),
    correctas, incorrectas, porcentaje, nota_meduca: notaMeduca,
    tiempo_total_seg: tiempoSeg,
    iniciado_at: new Date(intentoActual.tInicio).toISOString(),
    finalizado_at: new Date().toISOString(),
  });
  if (error) console.error("No se pudo guardar el intento de pareo:", error);

  mostrarVista(vistaResultado);
});

function formatoSeg(s) {
  const m = Math.floor(s / 60), r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}
