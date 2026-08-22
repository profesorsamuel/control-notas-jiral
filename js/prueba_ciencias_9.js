// =========================================================
// Examen de Recuperación de Ciencias Naturales 9° — lógica del portal
// C.E.B.G. El Jiral
// =========================================================

const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
const CONFIG = window.PRUEBA_CONFIG;
const BANCO = window.BANCO_CIENCIAS_9;
const T = CONFIG.tablas;

const LS_KEY = `examen_${CONFIG.codigoExamen}`;

// ---------- Modo vista previa de administrador ----------
// Se activa abriendo la página con ?preview=1 (el panel admin tiene un botón
// para esto). En este modo: no hay fecha límite, no se pide cédula real, y
// NADA se guarda en Supabase — es solo para que el docente vea/pruebe el
// examen exactamente como lo vive un estudiante, sin gastar el intento único.
const MODO_VISTA_PREVIA = new URLSearchParams(location.search).get("preview") === "1";

if (MODO_VISTA_PREVIA) {
  const banner = document.createElement("div");
  banner.className = "banner-vista-previa";
  banner.textContent = "🔍 MODO VISTA PREVIA (administrador) — nada de lo que hagas aquí se guarda ni cuenta como intento real";
  document.body.prepend(banner);
}

// ---------- Referencias DOM ----------
const vistaInicio = document.getElementById("vista-inicio");
const vistaRegistro = document.getElementById("vista-registro");
const vistaMenu = document.getElementById("vista-menu");
const vistaQuiz = document.getElementById("vista-quiz");
const vistaResultado = document.getElementById("vista-resultado");

// ---------- Estado en memoria ----------
let estudiante = null; // { salon, nombre, cedula, estudianteId }
let quizState = null;  // ver iniciarQuiz()

// =========================================================
// UTILIDADES
// =========================================================
function normalizarCedula(c) {
  return (c || "").trim().toLowerCase().replace(/[\s-]/g, "");
}

function mostrarVista(vista) {
  [vistaInicio, vistaRegistro, vistaMenu, vistaQuiz, vistaResultado].forEach((v) => (v.hidden = v !== vista));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Generador pseudoaleatorio determinístico (para que cada estudiante
// tenga siempre el mismo set de preguntas si recarga la página, pero
// distinto de los demás estudiantes).
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function crearRng(semilla) {
  return mulberry32(xmur3(semilla)());
}
function shuffleSeeded(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function pickNSeeded(arr, n, rng) {
  return shuffleSeeded(arr, rng).slice(0, n);
}

function formatoReloj(seg) {
  const s = Math.max(0, Math.round(seg));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function generarObservacion(pct) {
  if (pct >= 91) return "Excelente dominio de los temas evaluados. ¡Felicidades!";
  if (pct >= 71) return "Buen desempeño general, con algunos temas por reforzar.";
  if (pct >= 51) return "Desempeño aceptable. Se recomienda repasar los temas con más errores.";
  if (pct >= 31) return "Desempeño bajo. Es importante reforzar varios temas antes de otra evaluación.";
  return "Desempeño muy bajo. Se recomienda apoyo adicional y repaso completo del contenido.";
}

async function obtenerIP() {
  try {
    const r = await fetch("https://api.ipify.org?format=json");
    const d = await r.json();
    return d.ip || null;
  } catch {
    return null;
  }
}

// =========================================================
// 1) PANTALLA INICIAL — CUENTA REGRESIVA
// =========================================================
const fInicio = new Date(CONFIG.fechaInicio);
const fLimite = new Date(CONFIG.fechaLimiteAcceso);
const fLimiteInscripcion = new Date(CONFIG.fechaLimiteInscripcion);

function actualizarCuentaRegresiva() {
  const ahora = new Date();
  const titulo = document.getElementById("inicio-estado-titulo");
  const fechaTxt = document.getElementById("inicio-fecha");
  const cont = document.getElementById("cuenta-regresiva");
  const btn = document.getElementById("btn-continuar-inicio");

  const opcionesFecha = { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" };
  fechaTxt.textContent = `El examen oficial se presenta el: ${fInicio.toLocaleString("es-PA", opcionesFecha)}`;

  // La inscripción (registrarse por primera vez) SÍ está abierta desde ya,
  // solo se cierra para estudiantes nuevos después de fechaLimiteInscripcion.
  // El botón de "Continuar" nunca se bloquea: solo cambia el mensaje.
  btn.disabled = false;
  btn.textContent = "Continuar →";

  if (ahora < fInicio) {
    cont.hidden = false;
    titulo.textContent = "Ya puedes inscribirte. El examen oficial comienza en:";
    const diff = fInicio - ahora;
    const dias = Math.floor(diff / 86400000);
    const horas = Math.floor((diff % 86400000) / 3600000);
    const min = Math.floor((diff % 3600000) / 60000);
    const seg = Math.floor((diff % 60000) / 1000);
    document.getElementById("cr-dias").textContent = String(dias).padStart(2, "0");
    document.getElementById("cr-horas").textContent = String(horas).padStart(2, "0");
    document.getElementById("cr-min").textContent = String(min).padStart(2, "0");
    document.getElementById("cr-seg").textContent = String(seg).padStart(2, "0");
  } else if (ahora <= fLimite) {
    cont.hidden = true;
    titulo.textContent = "El examen oficial ya está habilitado";
  } else {
    cont.hidden = true;
    titulo.textContent = "El horario del examen oficial ya cerró";
  }
}
actualizarCuentaRegresiva();
setInterval(actualizarCuentaRegresiva, 1000);

document.getElementById("btn-continuar-inicio").addEventListener("click", () => {
  const guardado = localStorage.getItem(LS_KEY);
  if (guardado) {
    try {
      estudiante = JSON.parse(guardado);
      cargarMenu();
      return;
    } catch { /* sigue a registro */ }
  }
  mostrarVista(vistaRegistro);
  cargarSalones();
});

// =========================================================
// 2) REGISTRO DEL ESTUDIANTE
// =========================================================
function cargarSalones() {
  const sel = document.getElementById("reg-salon");
  sel.innerHTML = `<option value="">Selecciona tu salón…</option>` +
    CONFIG.salones.map((s) => `<option value="${s}">${s.replace(/(\d+)([A-Z])/, "$1°$2")}</option>`).join("");
}

document.getElementById("reg-salon").addEventListener("change", async (e) => {
  const salon = e.target.value;
  const selNombre = document.getElementById("reg-nombre");
  const inputCedula = document.getElementById("reg-cedula");
  selNombre.innerHTML = `<option value="">Cargando…</option>`;
  selNombre.disabled = true;
  inputCedula.value = "";
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

// Al elegir el nombre, la cédula se autocompleta sola (ya vive en la base de
// datos) — el estudiante solo la confirma visualmente, no la escribe.
document.getElementById("reg-nombre").addEventListener("change", (e) => {
  const opt = e.target.selectedOptions[0];
  const inputCedula = document.getElementById("reg-cedula");
  const errorBox = document.getElementById("reg-error");
  errorBox.hidden = true;
  if (!opt || !opt.value) {
    inputCedula.value = "";
    return;
  }
  const cedula = opt.dataset.cedula || "";
  if (!cedula) {
    inputCedula.value = "";
    errorBox.textContent = "Este estudiante no tiene cédula registrada en el sistema. Contacta a tu profesor para que la agregue antes de continuar.";
    errorBox.hidden = false;
    return;
  }
  inputCedula.value = cedula;
});

document.getElementById("btn-registrar").addEventListener("click", async () => {
  const errorBox = document.getElementById("reg-error");
  errorBox.hidden = true;

  const salon = document.getElementById("reg-salon").value;
  const selNombre = document.getElementById("reg-nombre");
  const nombreOpt = selNombre.selectedOptions[0];
  const cedulaRegistrada = document.getElementById("reg-cedula").value;

  if (!salon || !nombreOpt || !nombreOpt.value) {
    errorBox.textContent = "Selecciona tu salón y tu nombre.";
    errorBox.hidden = false;
    return;
  }
  if (!cedulaRegistrada) {
    errorBox.textContent = "Este estudiante no tiene cédula registrada en el sistema. Contacta a tu profesor.";
    errorBox.hidden = false;
    return;
  }

  estudiante = {
    salon,
    nombre: nombreOpt.textContent,
    cedula: normalizarCedula(cedulaRegistrada),
    estudianteId: nombreOpt.value,
  };

  // Bloqueo de NUEVAS inscripciones después del plazo, salvo que el estudiante
  // ya se hubiera registrado antes (entonces se le deja continuar sin problema).
  const ahora = new Date();
  if (ahora > fLimiteInscripcion) {
    const { data: previas } = await sb
      .from(T.sesiones)
      .select("id")
      .eq("codigo_examen", CONFIG.codigoExamen)
      .eq("cedula", estudiante.cedula)
      .limit(1);
    if (!previas || previas.length === 0) {
      const opcionesFecha = { day: "numeric", month: "long" };
      errorBox.textContent = `El plazo para inscribirse por primera vez cerró el ${fLimiteInscripcion.toLocaleDateString("es-PA", opcionesFecha)}. Contacta a tu profesor.`;
      errorBox.hidden = false;
      return;
    }
  }

  localStorage.setItem(LS_KEY, JSON.stringify(estudiante));
  cargarMenu();
});

document.getElementById("btn-cambiar-usuario").addEventListener("click", () => {
  localStorage.removeItem(LS_KEY);
  estudiante = null;
  mostrarVista(vistaRegistro);
  cargarSalones();
});

// =========================================================
// 3) MENÚ PRINCIPAL
// =========================================================
async function cargarMenu() {
  mostrarVista(vistaMenu);
  document.getElementById("menu-saludo").textContent = MODO_VISTA_PREVIA
    ? "Vista previa de administrador 🔍"
    : `Hola, ${estudiante.nombre.split(" ")[0]} 👋`;
  document.getElementById("menu-info").textContent = MODO_VISTA_PREVIA
    ? "Puedes probar la práctica y el examen oficial tal como los ve un estudiante. Nada de esto se guarda."
    : `${estudiante.salon.replace(/(\d+)([A-Z])/, "$1°$2")} · Confirma que la información sea correcta antes de presentar tu examen oficial.`;

  const btnOficial = document.getElementById("btn-oficial");
  const aviso = document.getElementById("menu-aviso");
  aviso.hidden = true;
  btnOficial.disabled = false;
  btnOficial.innerHTML = `📝 Presentar examen oficial<br><small>25 preguntas · un solo intento · cuenta para tu nota</small>`;

  if (MODO_VISTA_PREVIA) {
    // Sin fechas, sin sesión previa: el admin siempre puede probar ambos modos.
    document.getElementById("btn-practica").onclick = () => iniciarQuiz("practica");
    document.getElementById("btn-oficial").onclick = () => iniciarQuiz("oficial", null);
    return;
  }

  const { data: sesiones } = await sb
    .from(T.sesiones)
    .select("*")
    .eq("codigo_examen", CONFIG.codigoExamen)
    .eq("cedula", estudiante.cedula)
    .eq("modo", "oficial")
    .limit(1);

  const sesion = sesiones && sesiones[0];

  if (sesion && sesion.estado === "finalizado") {
    btnOficial.disabled = true;
    btnOficial.innerHTML = `✅ Ya presentaste tu examen oficial<br><small>Nota: ${sesion.nota_meduca} · ${sesion.porcentaje}% correctas</small>`;
  } else if (sesion && sesion.estado === "en_progreso") {
    btnOficial.innerHTML = `⏵ Continuar examen oficial<br><small>Tenías un intento en curso, pregunta ${sesion.pregunta_actual + 1} de ${CONFIG.preguntasExamenOficial}</small>`;
  } else {
    const ahora = new Date();
    if (ahora < fInicio) {
      btnOficial.disabled = true;
      aviso.hidden = false;
      aviso.textContent = "El examen oficial todavía no ha iniciado. Espera la hora oficial.";
    } else if (ahora > fLimite) {
      btnOficial.disabled = true;
      aviso.hidden = false;
      aviso.textContent = "El horario de acceso al examen oficial ya cerró.";
    }
  }

  document.getElementById("btn-practica").onclick = () => iniciarQuiz("practica");
  document.getElementById("btn-oficial").onclick = () => iniciarQuiz("oficial", sesion);
}

// =========================================================
// 4) MOTOR DEL QUIZ (práctica y oficial)
// =========================================================
async function iniciarQuiz(modo, sesionExistente) {
  let preguntasIds, respuestasPrevias = [], pregActual = 0, sesionId = null;

  if (modo === "oficial" && MODO_VISTA_PREVIA) {
    // Simulación completa (25 preguntas, mismo flujo estricto) pero sin
    // tocar Supabase para nada — es solo para que el admin la pruebe.
    const rng = crearRng(`admin-preview-oficial-${Date.now()}-${Math.random()}`);
    preguntasIds = pickNSeeded(BANCO.map((q) => q.id), CONFIG.preguntasExamenOficial, rng);
  } else if (modo === "oficial") {
    if (sesionExistente && sesionExistente.estado === "en_progreso") {
      preguntasIds = sesionExistente.preguntas_ids;
      respuestasPrevias = sesionExistente.respuestas || [];
      pregActual = sesionExistente.pregunta_actual || 0;
      sesionId = sesionExistente.id;
    } else {
      const rng = crearRng(`${estudiante.cedula}-${CONFIG.codigoExamen}-oficial`);
      preguntasIds = pickNSeeded(BANCO.map((q) => q.id), CONFIG.preguntasExamenOficial, rng);
      const ip = await obtenerIP();
      const { data, error } = await sb.from(T.sesiones).insert({
        codigo_examen: CONFIG.codigoExamen,
        cedula: estudiante.cedula,
        nombre: estudiante.nombre,
        salon: estudiante.salon,
        modo: "oficial",
        preguntas_ids: preguntasIds,
        respuestas: [],
        pregunta_actual: 0,
        estado: "en_progreso",
        ip,
        dispositivo: navigator.userAgent,
      }).select().single();
      if (error) {
        alert("No se pudo iniciar tu examen oficial. Es posible que ya tengas un intento registrado. Recarga la página e intenta de nuevo.");
        cargarMenu();
        return;
      }
      sesionId = data.id;
    }
  } else {
    const rng = crearRng(`${estudiante.cedula}-${CONFIG.codigoExamen}-practica-${Date.now()}`);
    preguntasIds = pickNSeeded(BANCO.map((q) => q.id), CONFIG.preguntasModoPractica, rng);
  }

  quizState = {
    modo, sesionId, preguntasIds, respuestas: respuestasPrevias,
    indice: pregActual, tInicio: Date.now(), cambiosPestana: 0,
    idleAlertado: false, ultimaActividad: Date.now(), timerId: null, tiempoRestante: 0,
  };

  document.getElementById("quiz-modo-label").textContent = modo === "oficial" ? "Examen oficial" : "Modo práctica";
  document.getElementById("quiz-violation").hidden = true;
  mostrarVista(vistaQuiz);
  renderPregunta();
}

function preguntaActualObj() {
  const id = quizState.preguntasIds[quizState.indice];
  return BANCO.find((q) => q.id === id);
}

function renderPregunta() {
  clearInterval(quizState.timerId);
  const total = quizState.preguntasIds.length;
  const q = preguntaActualObj();
  if (!q) { finalizarQuiz(); return; }

  document.getElementById("quiz-progreso").textContent = `Pregunta ${quizState.indice + 1} / ${total}`;
  document.getElementById("quiz-tema").textContent = `${q.tema} · dificultad ${q.dificultad}`;
  document.getElementById("quiz-enunciado").textContent = q.enunciado;

  const rng = crearRng(`${estudiante.cedula}-${q.id}`);
  const ordenOpciones = shuffleSeeded(q.opciones.map((_, i) => i), rng);
  quizState.ordenOpciones = ordenOpciones;
  quizState.seleccion = null;

  const cont = document.getElementById("quiz-opciones");
  const letras = ["A", "B", "C", "D"];
  cont.innerHTML = ordenOpciones.map((origIdx, pos) => `
    <div class="choice" data-idx="${origIdx}">
      <span class="choice-letra">${letras[pos]}</span>
      <span>${q.opciones[origIdx]}</span>
    </div>
  `).join("");

  cont.querySelectorAll(".choice").forEach((el) => {
    el.addEventListener("click", () => {
      cont.querySelectorAll(".choice").forEach((c) => c.classList.remove("selected"));
      el.classList.add("selected");
      quizState.seleccion = Number(el.dataset.idx);
      document.getElementById("btn-siguiente").disabled = false;
    });
  });

  document.getElementById("btn-siguiente").disabled = true;
  document.getElementById("btn-siguiente").onclick = () => avanzarPregunta(q);

  // Timer
  quizState.tiempoRestante = window.tiempoPorDificultad(q.dificultad);
  quizState.tQPreguntaInicio = Date.now();
  actualizarTimerUI();
  quizState.timerId = setInterval(() => {
    quizState.tiempoRestante -= 0.25;
    actualizarTimerUI();
    if (quizState.tiempoRestante <= 0) {
      clearInterval(quizState.timerId);
      avanzarPregunta(q, true);
    }
  }, 250);
}

function actualizarTimerUI() {
  const el = document.getElementById("quiz-timer");
  el.textContent = formatoReloj(quizState.tiempoRestante);
  el.classList.toggle("urgente", quizState.tiempoRestante <= 10);
}

async function avanzarPregunta(q, porTiempo) {
  clearInterval(quizState.timerId);
  const tiempoUsado = Math.round((Date.now() - quizState.tQPreguntaInicio) / 1000);
  const opcionElegida = porTiempo ? null : quizState.seleccion;
  const correcta = opcionElegida !== null && opcionElegida === q.respuesta;

  quizState.respuestas.push({
    id: q.id, tema: q.tema, tipo: q.tipo, dificultad: q.dificultad,
    opcion_elegida: opcionElegida, correcta, tiempo_usado_seg: tiempoUsado, por_tiempo: !!porTiempo,
  });
  quizState.indice += 1;

  if (quizState.modo === "oficial" && !MODO_VISTA_PREVIA) {
    await sb.from(T.sesiones).update({
      respuestas: quizState.respuestas,
      pregunta_actual: quizState.indice,
      ultima_actividad: new Date().toISOString(),
    }).eq("id", quizState.sesionId);
  }

  if (quizState.indice >= quizState.preguntasIds.length) {
    finalizarQuiz();
  } else {
    renderPregunta();
  }
}

async function finalizarQuiz() {
  clearInterval(quizState.timerId);
  const respuestas = quizState.respuestas;
  const total = respuestas.length;
  const correctas = respuestas.filter((r) => r.correcta).length;
  const incorrectas = total - correctas;
  const porcentaje = Math.round((correctas / total) * 100);
  const nota = window.calcularNotaMeduca(porcentaje);
  const tiempoTotal = Math.round((Date.now() - quizState.tInicio) / 1000);

  if (quizState.modo === "oficial" && !MODO_VISTA_PREVIA) {
    await sb.from(T.sesiones).update({
      estado: "finalizado",
      correctas, incorrectas, porcentaje, nota_meduca: nota,
      tiempo_total_seg: tiempoTotal,
      finalizado_at: new Date().toISOString(),
    }).eq("id", quizState.sesionId);
  }

  mostrarResultado({ modo: quizState.modo, correctas, incorrectas, porcentaje, nota, tiempoTotal, respuestas });
}

function mostrarResultado({ modo, correctas, incorrectas, porcentaje, nota, tiempoTotal, respuestas }) {
  mostrarVista(vistaResultado);
  document.getElementById("res-tag").textContent = modo === "oficial" ? "RESULTADO OFICIAL" : "RESULTADO DE PRÁCTICA";
  document.getElementById("res-nota").textContent = nota.toFixed(1);
  document.getElementById("res-titulo").textContent = modo === "oficial" ? "¡Examen oficial finalizado!" : "¡Práctica finalizada!";
  document.getElementById("res-observacion").textContent = generarObservacion(porcentaje);
  document.getElementById("res-correctas").textContent = correctas;
  document.getElementById("res-incorrectas").textContent = incorrectas;
  document.getElementById("res-porcentaje").textContent = `${porcentaje}%`;
  document.getElementById("res-tiempo").textContent = formatoReloj(tiempoTotal);

  const revCont = document.getElementById("res-revision");
  revCont.innerHTML = "";
  if (modo === "practica") {
    revCont.innerHTML = respuestas.map((r) => {
      const q = BANCO.find((b) => b.id === r.id);
      const opcionTxt = r.opcion_elegida !== null ? q.opciones[r.opcion_elegida] : "(sin responder — se acabó el tiempo)";
      return `
        <div class="revision-item ${r.correcta ? "ok" : "mal"}">
          <p><b>${q.enunciado}</b></p>
          <p>Tu respuesta: ${opcionTxt}</p>
          ${!r.correcta ? `<p>Respuesta correcta: ${q.opciones[q.respuesta]}</p>` : ""}
          <p class="rev-exp">${q.explicacion}</p>
        </div>`;
    }).join("");
  } else {
    revCont.innerHTML = `<p class="lead" style="text-align:center">Por seguridad, las respuestas correctas del examen oficial no se muestran aquí. Tu profesor revisará los resultados.</p>`;
  }
  if (MODO_VISTA_PREVIA) {
    revCont.innerHTML += `<p class="warning" style="text-align:center">Esto fue una vista previa de administrador: no se guardó en Supabase ni cuenta como intento de ningún estudiante.</p>`;
  }

  document.getElementById("btn-volver-menu").onclick = () => cargarMenu();
}

// =========================================================
// 5) SEGURIDAD: cambios de pestaña e inactividad
// =========================================================
document.addEventListener("visibilitychange", async () => {
  if (!quizState || vistaQuiz.hidden) return;
  if (document.hidden) {
    quizState.cambiosPestana += 1;
    if (quizState.modo === "oficial" && !MODO_VISTA_PREVIA) {
      await sb.from(T.eventos).insert({
        sesion_id: quizState.sesionId,
        codigo_examen: CONFIG.codigoExamen,
        tipo: "cambio_pestana",
        detalle: `Cambio #${quizState.cambiosPestana} — ${estudiante.nombre}`,
      });
    }
    if (quizState.cambiosPestana >= CONFIG.maxCambiosPestanaAntesDeAlerta) {
      const v = document.getElementById("quiz-violation");
      v.hidden = false;
      v.textContent = `⚠ Se detectaron ${quizState.cambiosPestana} cambios de pestaña. Esto queda registrado para tu profesor.`;
    }
  }
});

["mousemove", "keydown", "touchstart", "click"].forEach((evt) => {
  document.addEventListener(evt, () => {
    if (quizState) {
      quizState.ultimaActividad = Date.now();
      quizState.idleAlertado = false;
    }
  });
});

setInterval(async () => {
  if (!quizState || vistaQuiz.hidden) return;
  const idleSeg = (Date.now() - quizState.ultimaActividad) / 1000;
  if (idleSeg >= CONFIG.segundosInactividadAlerta && !quizState.idleAlertado) {
    quizState.idleAlertado = true;
    const v = document.getElementById("quiz-violation");
    v.hidden = false;
    v.textContent = `⚠ Inactividad detectada (${Math.round(idleSeg)}s sin interacción).`;
    if (quizState.modo === "oficial" && !MODO_VISTA_PREVIA) {
      await sb.from(T.eventos).insert({
        sesion_id: quizState.sesionId,
        codigo_examen: CONFIG.codigoExamen,
        tipo: "inactividad",
        detalle: `${Math.round(idleSeg)}s sin interacción — ${estudiante.nombre}`,
      });
    }
  }
}, 5000);

window.addEventListener("beforeunload", (e) => {
  if (quizState && quizState.modo === "oficial" && !vistaQuiz.hidden) {
    e.preventDefault();
    e.returnValue = "";
  }
});

// =========================================================
// ARRANQUE
// =========================================================
if (MODO_VISTA_PREVIA) {
  estudiante = { salon: "ADMIN", nombre: "Vista previa (admin)", cedula: `preview-${Date.now()}`, estudianteId: null };
  cargarMenu();
} else {
  mostrarVista(vistaInicio);
}
