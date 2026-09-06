// =========================================================
// Ejercicio 2 — Pareo de términos | Clase 1: El origen del universo y
// del sistema solar | Ciencias Naturales 9° | C.E.B.G. EL JIRAL
// =========================================================
// Cómo funciona: de todo el banco de términos (BANCO_PAREO_CLASE1,
// que puede seguir creciendo), se toman 8 al azar cada vez que el
// estudiante practica. Se numeran los términos (1-8) en un orden y se
// les asigna una letra (A-H) a sus definiciones en OTRO orden
// distinto, para que no queden pegadas una debajo de la otra. El
// estudiante elige, para cada número, cuál letra le corresponde.
// =========================================================

const BANCO = window.BANCO_PAREO_CLASE1;
const CANTIDAD_POR_INTENTO = 8;
const LETRAS = ["A", "B", "C", "D", "E", "F", "G", "H"];

if (!Array.isArray(BANCO) || BANCO.length < CANTIDAD_POR_INTENTO) {
  throw new Error("El banco de términos de pareo no tiene suficientes palabras.");
}

function mezclar(arr) {
  const copia = [...arr];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

const vistaInicio = document.getElementById("vista-inicio-pareo");
const vistaEjercicio = document.getElementById("vista-ejercicio-pareo");
const vistaResultado = document.getElementById("vista-resultado-pareo");

function mostrarVista(vista) {
  [vistaInicio, vistaEjercicio, vistaResultado].forEach((v) => { v.hidden = v !== vista; });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

let intentoActual = null; // { terminos: [{numero, termino, definicion, letraCorrecta}], definicionesPorLetra: {A: "...", ...} }

function iniciarIntento() {
  const elegidos = mezclar(BANCO).slice(0, CANTIDAD_POR_INTENTO);

  // Orden en que se numeran los términos (columna 1 y 2).
  const ordenTerminos = elegidos.map((t, i) => ({ ...t, numero: i + 1 }));

  // Orden DISTINTO en el que se muestran las definiciones (columna 3 y 4),
  // para que el estudiante tenga que pensar y no pueda emparejar solo
  // mirando la posición en la fila.
  const ordenDefiniciones = mezclar(ordenTerminos);
  const letraPorTermino = {}; // termino.termino -> letra correcta
  const definicionPorLetra = {}; // letra -> texto de la definición
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

  // Las definiciones se listan aparte, en el orden mezclado, cada una
  // con su letra — así el estudiante las lee todas antes de elegir.
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

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

document.getElementById("btn-comenzar-pareo").addEventListener("click", iniciarIntento);
document.getElementById("btn-otro-intento").addEventListener("click", iniciarIntento);
document.getElementById("btn-volver-menu-pareo").addEventListener("click", () => mostrarVista(vistaInicio));

document.getElementById("btn-revisar-pareo").addEventListener("click", () => {
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
  const porcentaje = Math.round((correctas / total) * 100);
  const tiempoSeg = Math.round((Date.now() - intentoActual.tInicio) / 1000);

  document.getElementById("pareo-res-correctas").textContent = `${correctas}/${total}`;
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

  mostrarVista(vistaResultado);
});

function formatoSeg(s) {
  const m = Math.floor(s / 60), r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}
