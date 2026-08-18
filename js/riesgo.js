// =========================================================
// riesgo.js — Página aparte: "Estudiantes en riesgo"
// =========================================================
// El "modo" (quién puede ver qué) llega por la URL, según desde
// dónde se entró:
//   riesgo.html?modo=profesor   -> solo sus propios salones/materias
//   riesgo.html?modo=consejero  -> su salón asignado, TODAS las materias
//   riesgo.html?modo=admin      -> cualquier salón (o varios a la vez),
//                                   TODAS las materias
// Si no llega el parámetro (o la cuenta no tiene ese rol), se elige
// automáticamente el mejor rol disponible: admin > consejero > profesor.
//
// "En riesgo" = promedio final por debajo de 3.0 (o sea, 2.9 y menos),
// con la misma fórmula que la columna "Prom. Final" del panel del
// docente: promedio de Apreciación, Ejercicio y Examen, cada categoría
// con el mismo peso, ignorando las que todavía no tengan notas.
// =========================================================

import { supabase } from "./supabase.js";
import { pintarCambiarPanel, obtenerRolesDeCuenta } from "./roles.js";

const PROMEDIO_MINIMO_APROBAR = 3.0;

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------
// Elementos
// ---------------------------------------------------------------
const enlaceVolver = document.getElementById("enlaceVolver");
const bloqueSalonSelect = document.getElementById("bloqueSalonSelect");
const bloqueSalonFijo = document.getElementById("bloqueSalonFijo");
const chipsSalonesRiesgo = document.getElementById("chipsSalonesRiesgo");
const btnSalonesTodos = document.getElementById("btnSalonesTodos");
const btnSalonesNinguno = document.getElementById("btnSalonesNinguno");
const textoSalonFijo = document.getElementById("textoSalonFijo");
const selectTrimestreRiesgo = document.getElementById("selectTrimestreRiesgo");
const btnGenerarReporte = document.getElementById("btnGenerarReporte");
const textoAyudaScope = document.getElementById("textoAyudaScope");
const tarjetaReporte = document.getElementById("tarjetaReporte");
const tarjetaVacia = document.getElementById("tarjetaVacia");
const textoGenerado = document.getElementById("textoGenerado");
const fechaMembrete = document.getElementById("fechaMembrete");
const resumenTop = document.getElementById("resumenTop");
const zonaReporte = document.getElementById("zonaReporte");
const contenidoImprimible = document.getElementById("contenidoImprimible");
const btnImprimir = document.getElementById("btnImprimir");
const btnDescargarPdf = document.getElementById("btnDescargarPdf");
const btnCartasDropdown = document.getElementById("btnCartasDropdown");
const btnDescargarCartasTodas = document.getElementById("btnDescargarCartasTodas");
const btnDescargarCartasSeleccionadas = document.getElementById("btnDescargarCartasSeleccionadas");
const btnDescargarCuadroConsejero = document.getElementById("btnDescargarCuadroConsejero");
const barraSeleccionCartas = document.getElementById("barraSeleccionCartas");
const btnSeleccionarTodasCartas = document.getElementById("btnSeleccionarTodasCartas");
const btnQuitarSeleccionCartas = document.getElementById("btnQuitarSeleccionCartas");
const contadorSeleccionCartas = document.getElementById("contadorSeleccionCartas");
const cajaMensajeWhatsapp = document.getElementById("cajaMensajeWhatsapp");
const textareaMensajeWhatsapp = document.getElementById("textareaMensajeWhatsapp");
const btnRestaurarMensajeWa = document.getElementById("btnRestaurarMensajeWa");

// ---------------------------------------------------------------
// Mensaje de WhatsApp: una sola plantilla editable que se usa para
// todos los estudiantes en riesgo. Los { } se reemplazan con los
// datos de cada estudiante al momento de enviar.
// ---------------------------------------------------------------
const MENSAJE_WHATSAPP_PREDETERMINADO =
    "Buenos días/tardes, saludos. Soy el profesor(a) de {MATERIA} del salón {SALON}. " +
    "Le informo que su acudido(a) {ESTUDIANTE} está presentando bajo rendimiento en las notas " +
    "de la materia durante el {TRIMESTRE}. De seguir así, esto le traerá fracaso este trimestre. " +
    "Le recomendamos que mejore en la materia. ¡Gracias por su atención!";

textareaMensajeWhatsapp.value = MENSAJE_WHATSAPP_PREDETERMINADO;

btnRestaurarMensajeWa.addEventListener("click", () => {
    textareaMensajeWhatsapp.value = MENSAJE_WHATSAPP_PREDETERMINADO;
});

function soloDigitos(str) {
    return String(str ?? "").replace(/\D/g, "");
}

// Arma el número para wa.me: si ya trae el 507 lo deja, si no se lo
// agrega (los celulares en Panamá se guardan sin código de país).
function numeroWhatsapp(telefonoCrudo) {
    const digitos = soloDigitos(telefonoCrudo);
    if (!digitos) return "";
    if (digitos.startsWith("507") && digitos.length >= 11) return digitos;
    return `507${digitos}`;
}

// Un solo listener para todos los botones de WhatsApp de la tabla
// (delegado en zonaReporte, que no se reemplaza como elemento, solo
// su contenido cada vez que se genera el reporte de nuevo).
zonaReporte.addEventListener("click", (ev) => {
    const boton = ev.target.closest(".btn-whatsapp-fila");
    if (!boton || boton.disabled) return;

    const plantilla = textareaMensajeWhatsapp.value.trim() || MENSAJE_WHATSAPP_PREDETERMINADO;
    const mensaje = plantilla
        .replaceAll("{ESTUDIANTE}", boton.dataset.estudiante || "")
        .replaceAll("{MATERIA}", boton.dataset.materia || "")
        .replaceAll("{SALON}", boton.dataset.salon || "")
        .replaceAll("{PROFESOR}", boton.dataset.profesor || "")
        .replaceAll("{TRIMESTRE}", boton.dataset.trimestre || "")
        .replaceAll("{PADRE}", boton.dataset.padre || "");

    const url = `https://wa.me/${boton.dataset.telefono}?text=${encodeURIComponent(mensaje)}`;
    window.open(url, "_blank", "noopener");
});

// ---------------------------------------------------------------
// 1) Sesión y modo
// ---------------------------------------------------------------
let modo = null; // "profesor" | "consejero" | "admin"
let correoCuenta = "";
let salonesProfesor = []; // [{salon, materias:[...]}] -- solo lo del docente
let salonConsejero = "";
let salonesTodos = []; // [{codigo, nombre_visible}] -- para admin
let salonesSeleccionados = new Set();

async function iniciar() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
        window.location.href = "login.html";
        return;
    }
    correoCuenta = (user.email || "").trim().toLowerCase();

    const { esAdmin, consejeroInfo, esProfesor } = await obtenerRolesDeCuenta(user.id, correoCuenta);

    const params = new URLSearchParams(window.location.search);
    const modoPedido = params.get("modo");

    if (modoPedido === "profesor" && esProfesor) modo = "profesor";
    else if (modoPedido === "consejero" && consejeroInfo) modo = "consejero";
    else if (modoPedido === "admin" && esAdmin) modo = "admin";
    else if (esAdmin) modo = "admin";
    else if (consejeroInfo) modo = "consejero";
    else if (esProfesor) modo = "profesor";

    if (!modo) {
        alert("Esta cuenta no tiene un panel (docente, consejería o admin) para ver este reporte.");
        window.location.href = "login.html";
        return;
    }

    pintarCambiarPanel("riesgo", "claro-sobre-oscuro");

    if (modo === "profesor") {
        enlaceVolver.href = "profesor.html";
        const { data: materias, error: errM } = await supabase
            .from("profesor_materias")
            .select("materia, salon")
            .eq("correo_profesor", correoCuenta);
        if (errM || !materias || materias.length === 0) {
            alert("No se encontraron materias asignadas a esta cuenta.");
            window.location.href = "profesor.html";
            return;
        }
        const porSalon = {};
        materias.forEach((m) => {
            (porSalon[m.salon] ??= new Set()).add(m.materia);
        });
        salonesProfesor = Object.entries(porSalon).map(([salon, mats]) => ({ salon, materias: [...mats] }));
        salonesProfesor.sort((a, b) => a.salon.localeCompare(b.salon));

        pintarChipsSalones(salonesProfesor.map((s) => ({ valor: s.salon, etiqueta: s.salon })));
        textoAyudaScope.textContent = "Se revisan solo las materias que tú dictas en cada salón elegido.";
    } else if (modo === "consejero") {
        enlaceVolver.href = "consejero.html";
        salonConsejero = (consejeroInfo.salon || "").trim().toUpperCase();
        bloqueSalonFijo.style.display = "";
        textoSalonFijo.textContent = salonConsejero || "—";
        textoAyudaScope.textContent = "Se revisan todas las materias registradas en tu salón asignado.";
    } else if (modo === "admin") {
        enlaceVolver.href = "admin.html";
        const { data: salones, error: errS } = await supabase
            .from("salones")
            .select("codigo, nombre_visible")
            .eq("activo", true)
            .order("orden", { ascending: true });
        salonesTodos = salones || [];

        pintarChipsSalones(salonesTodos.map((s) => ({ valor: s.codigo, etiqueta: s.nombre_visible || s.codigo })));
        textoAyudaScope.textContent = "Se revisan todas las materias registradas en cada salón elegido.";
    }
}

// ---------------------------------------------------------------
// Chips de salón (multi-selección) para profesor / admin
// ---------------------------------------------------------------
function pintarChipsSalones(opciones) {
    bloqueSalonSelect.style.display = "";
    if (opciones.length === 0) {
        chipsSalonesRiesgo.innerHTML = `<span class="small text-muted">No hay salones disponibles.</span>`;
        return;
    }
    chipsSalonesRiesgo.innerHTML = opciones.map((o) => `
        <span class="chip-salon" data-valor="${escapeHtml(o.valor)}">${escapeHtml(o.etiqueta)}</span>
    `).join("");

    chipsSalonesRiesgo.querySelectorAll(".chip-salon").forEach((chip) => {
        chip.addEventListener("click", () => {
            const valor = chip.dataset.valor;
            if (salonesSeleccionados.has(valor)) {
                salonesSeleccionados.delete(valor);
                chip.classList.remove("activo");
            } else {
                salonesSeleccionados.add(valor);
                chip.classList.add("activo");
            }
            dispararAutoGenerar();
        });
    });
}

btnSalonesTodos.addEventListener("click", () => {
    chipsSalonesRiesgo.querySelectorAll(".chip-salon").forEach((chip) => {
        salonesSeleccionados.add(chip.dataset.valor);
        chip.classList.add("activo");
    });
    dispararAutoGenerar();
});

btnSalonesNinguno.addEventListener("click", () => {
    salonesSeleccionados.clear();
    chipsSalonesRiesgo.querySelectorAll(".chip-salon").forEach((chip) => chip.classList.remove("activo"));
    dispararAutoGenerar();
});

// ---------------------------------------------------------------
// Auto-generar el reporte al tocar un chip de salón (con un pequeño
// "debounce": si el usuario toca varios salones seguidos, espera a
// que se detenga un momento antes de generar, para no lanzar una
// búsqueda por cada clic individual).
// ---------------------------------------------------------------
let timerAutoGenerar = null;
function dispararAutoGenerar() {
    clearTimeout(timerAutoGenerar);
    timerAutoGenerar = setTimeout(() => generarReporte({ avisarSiVacio: false }), 250);
}

// ---------------------------------------------------------------
// 2) Cálculo de riesgo por materia (promedio final < 3.0)
// ---------------------------------------------------------------
async function calcularRiesgoPorMateria(materia, trimestre, estudiantes) {
    const ids = estudiantes.map((e) => e.id);
    if (ids.length === 0) return [];

    const porEstudiante = {};
    function registrarNota(estudianteId, tipo, nota) {
        if (nota === null || nota === undefined) return;
        const num = Number(nota);
        if (isNaN(num)) return;
        const grupo = (porEstudiante[estudianteId] ??= { apr: [], eje: [], exa: [] });
        if (tipo === "apreciacion") grupo.apr.push(num);
        else if (tipo === "examen") grupo.exa.push(num);
        else grupo.eje.push(num);
    }

    // Fuente principal: notas ya conectadas por estudiante_id.
    const { data: notas, error } = await supabase
        .from("notas")
        .select("estudiante_id, tipo, nota")
        .eq("materia", materia).eq("trimestre", trimestre)
        .in("estudiante_id", ids)
        .is("eliminado_en", null);

    if (error) { console.error(error); return []; }
    (notas || []).forEach((n) => registrarNota(n.estudiante_id, n.tipo, n.nota));

    // Fuente de respaldo: notas antiguas que todavía solo tienen "correo"
    // (sin estudiante_id), igual que hace profesor.js y cuadro_aprobados.js.
    // Sin esto, un estudiante con notas viejas aparecía como "sin
    // calificaciones" y quedaba fuera del reporte de riesgo aunque su
    // promedio real estuviera por debajo del mínimo.
    const correoAId = {};
    estudiantes.forEach((e) => { if (e.correo) correoAId[e.correo] = e.id; });
    const correosActuales = Object.keys(correoAId);
    if (correosActuales.length > 0) {
        const { data: notasPorCorreo, error: errCorreo } = await supabase
            .from("notas")
            .select("estudiante_id, correo, tipo, nota")
            .eq("materia", materia).eq("trimestre", trimestre)
            .in("correo", correosActuales)
            .is("eliminado_en", null);
        if (errCorreo) { console.error(errCorreo); }
        else {
            (notasPorCorreo || []).forEach((n) => {
                if (n.estudiante_id) return; // ya se registró arriba
                const idEst = correoAId[n.correo];
                if (idEst) registrarNota(idEst, n.tipo, n.nota);
            });
        }
    }

    const prom = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

    const resultado = [];
    estudiantes.forEach((est) => {
        const g = porEstudiante[est.id];
        if (!g) return;
        const promApr = prom(g.apr), promEje = prom(g.eje), promExa = prom(g.exa);
        const presentes = [promApr, promEje, promExa].filter((v) => v !== null);
        const promFinalCrudo = presentes.length ? presentes.reduce((a, b) => a + b, 0) / presentes.length : null;
        // Redondeamos a 1 decimal ANTES de comparar, para que un promedio
        // que se muestra como "3.0" (ej. 2.96) no aparezca como en riesgo.
        const promFinal = promFinalCrudo !== null ? Math.round(promFinalCrudo * 10) / 10 : null;
        // "En riesgo" = por debajo de 3.0, usando el valor ya redondeado.
        if (promFinal !== null && promFinal < PROMEDIO_MINIMO_APROBAR) {
            resultado.push({
                nombre: est.nombre,
                telefonoAcudiente: est.telefonoAcudiente || "",
                nombrePadre: est.nombrePadre || "",
                promApr, promEje, promExa, promFinal,
            });
        }
    });

    resultado.sort((a, b) => a.promFinal - b.promFinal);
    return resultado;
}

// Materias a revisar en un salón, y (si aplica) el nombre del/de la
// docente de cada una, para el membrete del reporte.
async function obtenerMateriasYDocentes(salon) {
    if (modo === "profesor") {
        const entrada = salonesProfesor.find((s) => s.salon === salon);
        return (entrada?.materias || []).map((materia) => ({ materia, docentes: [] }));
    }

    const { data: filas, error } = await supabase
        .from("profesor_materias")
        .select("materia, correo_profesor")
        .eq("salon", salon);
    if (error || !filas || filas.length === 0) return [];

    const porMateria = {};
    filas.forEach((f) => (porMateria[f.materia] ??= new Set()).add(f.correo_profesor));

    const correos = [...new Set(filas.map((f) => f.correo_profesor))];
    const { data: profes } = await supabase
        .from("profesores")
        .select("correo_profesor, nombre_profesor")
        .in("correo_profesor", correos);
    const nombrePorCorreo = {};
    (profes || []).forEach((p) => (nombrePorCorreo[p.correo_profesor] = p.nombre_profesor));

    return Object.entries(porMateria).map(([materia, correosSet]) => ({
        materia,
        docentes: [...correosSet].map((c) => nombrePorCorreo[c] || c),
    }));
}

// ---------------------------------------------------------------
// 2.5) Cartas individuales para padres/acudientes (PDF)
// ---------------------------------------------------------------
// Se llena de nuevo cada vez que se genera/regenera el reporte.
// Cada elemento trae todo lo necesario para redactar UNA carta:
// estudiante + materia + salón + notas de ese estudiante en esa materia.
let listaCartasActual = [];
let seleccionCartas = new Set(); // índices (de listaCartasActual) marcados con su casilla

// A partir del código de salón (ej. "8A", "9B") intenta separar el
// grado (número) de la sección (letra), para mostrarlo en la carta.
// Si el código no sigue ese patrón, se muestra tal cual.
function textoGradoDesdeSalon(salon) {
    const m = String(salon || "").trim().match(/^(\d+)\s*[°º]?\s*([A-Za-z]*)$/);
    if (!m) return salon || "—";
    const grado = m[1];
    const seccion = m[2] ? m[2].toUpperCase() : "";
    return seccion ? `${grado}° Grado, Sección ${seccion}` : `${grado}° Grado`;
}

function formatoNota(n) {
    return (n === null || n === undefined || isNaN(n)) ? "aún no registrada" : n.toFixed(1);
}

// Calcula la nota mínima que hace falta en el examen para que el
// promedio final (promedio simple de las categorías con nota) llegue
// a 3.0. Solo tiene sentido cuando el examen todavía no tiene nota.
// Devuelve { aplica, notaMinima, imposible } .
function calcularNotaMinimaExamen(promApr, promEje, promExa) {
    if (promExa !== null && promExa !== undefined) {
        return { aplica: false, notaMinima: null, imposible: false };
    }
    const presentes = [promApr, promEje].filter((v) => v !== null && v !== undefined);
    const totalCategorias = presentes.length + 1; // +1 por el examen que falta
    const sumaPresentes = presentes.reduce((a, b) => a + b, 0);
    let necesaria = (PROMEDIO_MINIMO_APROBAR * totalCategorias) - sumaPresentes;
    // Redondeamos hacia arriba a 1 decimal para garantizar que, tras el
    // redondeo que usa el sistema al calcular el promedio final, sí
    // alcance el mínimo (más vale pedir un poquito de más que de menos).
    necesaria = Math.ceil(necesaria * 10) / 10;
    const imposible = necesaria > 5;
    if (necesaria < 0) necesaria = 0;
    return { aplica: true, notaMinima: Math.min(necesaria, 5), imposible };
}

function textoFechaCartaHoy() {
    const hoy = new Date();
    const texto = hoy.toLocaleDateString("es-PA", { day: "numeric", month: "long", year: "numeric" });
    return `El Jiral, ${texto}`;
}

// Dibuja UNA carta dentro del documento jsPDF ya creado (en la página
// actual). El llamador se encarga de agregar una página nueva antes de
// llamar a esta función para cada carta adicional.
function dibujarCartaPDF(pdf, datos) {
    const margenIzq = 25, margenDer = 25, anchoUtil = 210 - margenIzq - margenDer;
    let y = 20;

    const centrar = (texto, tam, negrita = true) => {
        pdf.setFont("helvetica", negrita ? "bold" : "normal");
        pdf.setFontSize(tam);
        pdf.text(texto, 105, y, { align: "center" });
        y += tam * 0.45;
    };
    const parrafo = (texto, tam = 10.5, espacioExtra = 3) => {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(tam);
        const lineas = pdf.splitTextToSize(texto, anchoUtil);
        pdf.text(lineas, margenIzq, y);
        y += lineas.length * (tam * 0.42) + espacioExtra;
    };

    // --- Membrete ---
    centrar("REPÚBLICA DE PANAMÁ", 12);
    centrar("MINISTERIO DE EDUCACIÓN", 12);
    centrar("C.E.B.G. EL JIRAL", 12);
    centrar("DEPARTAMENTO DE ORIENTACIÓN- CONSEJERÍA Y PROFESOR DE LA MATERIA", 9.5);
    y += 4;
    pdf.setDrawColor(153, 27, 27);
    pdf.setLineWidth(0.6);
    pdf.line(margenIzq, y, 210 - margenDer, y);
    y += 9;

    // --- Fecha y asunto ---
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10.5);
    pdf.text(datos.fechaTexto, margenIzq, y);
    y += 8;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10.5);
    pdf.text(`Asunto: Seguimiento académico del estudiante`, margenIzq, y);
    y += 9;

    // --- Saludo ---
    parrafo("Estimado(a) Padre, Madre o Acudiente:", 10.5, 5);

    // --- Cuadro de datos del estudiante ---
    pdf.setDrawColor(148, 163, 184);
    pdf.setLineWidth(0.3);
    const altoCaja = 20;
    pdf.rect(margenIzq, y, anchoUtil, altoCaja);
    pdf.setFontSize(9.7);
    let yCaja = y + 5.5;
    pdf.setFont("helvetica", "bold"); pdf.text("Estudiante:", margenIzq + 3, yCaja);
    pdf.setFont("helvetica", "normal"); pdf.text(datos.nombre, margenIzq + 27, yCaja);
    yCaja += 6;
    pdf.setFont("helvetica", "bold"); pdf.text("Grado / Salón:", margenIzq + 3, yCaja);
    pdf.setFont("helvetica", "normal"); pdf.text(`${datos.grado} (${datos.salon})`, margenIzq + 27, yCaja);
    yCaja += 6;
    pdf.setFont("helvetica", "bold"); pdf.text("Materia:", margenIzq + 3, yCaja);
    pdf.setFont("helvetica", "normal"); pdf.text(datos.materia, margenIzq + 27, yCaja);
    pdf.setFont("helvetica", "bold"); pdf.text("Trimestre:", margenIzq + 95, yCaja);
    pdf.setFont("helvetica", "normal"); pdf.text(datos.trimestre, margenIzq + 118, yCaja);
    y += altoCaja + 8;

    // --- Cuerpo ---
    parrafo(
        `Reciba un cordial saludo de parte del Departamento de Orientación y Consejería, en conjunto con ` +
        `el/la profesor(a) de la materia, del C.E.B.G. El Jiral. Nos dirigimos a usted de manera respetuosa para ` +
        `informarle sobre el desempeño académico de su acudido(a) durante el ${datos.trimestre}.`
    );

    if (datos.aplicaNotaMinima) {
        parrafo(
            `Hasta la fecha, el/la estudiante registra un promedio de ${formatoNota(datos.promApr)} en el área de ` +
            `Apreciación y ${formatoNota(datos.promEje)} en el área de Ejercicios, para un promedio actual de ` +
            `${datos.promFinal.toFixed(1)} en la materia de ${datos.materia}. Le informamos que, para completar la ` +
            `evaluación del trimestre, únicamente falta la nota correspondiente al examen.`
        );
        if (datos.imposibleAlcanzar) {
            parrafo(
                `Según los promedios registrados, aun obteniendo la nota máxima en el examen, el promedio podría ` +
                `no alcanzar el mínimo de aprobación de 3.0 en esta materia. Por ello, es fundamental que el/la ` +
                `estudiante se prepare con dedicación para obtener la mejor nota posible.`
            );
        } else {
            parrafo(
                `De acuerdo con los promedios actuales, el/la estudiante necesita obtener como mínimo ` +
                `${datos.notaMinima.toFixed(1)} en el examen para poder alcanzar un promedio final de 3.0 en esta materia.`
            );
        }
    } else {
        parrafo(
            `Hasta la fecha, el/la estudiante registra un promedio de ${formatoNota(datos.promApr)} en Apreciación, ` +
            `${formatoNota(datos.promEje)} en Ejercicios y ${formatoNota(datos.promExa)} en el examen, para un ` +
            `promedio final de ${datos.promFinal.toFixed(1)} en la materia de ${datos.materia}, por debajo del ` +
            `mínimo de aprobación de 3.0.`
        );
    }

    parrafo(
        `Solicitamos de manera cordial su valioso apoyo para que el/la estudiante estudie y se prepare adecuadamente, ` +
        `dedicando tiempo en casa para repasar los temas de la materia.`
    );

    parrafo(
        `Le recordamos que los estudiantes ya cuentan con el temario del examen en sus manos, por lo que le ` +
        `sugerimos revisarlo juntos(as) en casa.`
    );

    parrafo(
        `Confiamos en que, con su apoyo y el esfuerzo del/de la estudiante, podrá alcanzar y superar el promedio ` +
        `requerido. ¡Con dedicación y constancia, toda meta es alcanzable!`,
        10.5, 8
    );

    // --- Firma institucional ---
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(10.5);
    pdf.text("Atentamente,", margenIzq, y);
    y += 12;
    pdf.setFont("helvetica", "bold");
    pdf.text("Departamento de Orientación y Consejería, C.E.B.G. El Jiral", margenIzq, y);
    y += 12;

    // --- Constancia de recibido ---
    // Si el contenido de arriba resultó más largo de lo normal (nombres o
    // materias largas), pasamos la constancia a una página nueva para que
    // no se corte al final de la hoja.
    if (y > 235) {
        pdf.addPage();
        y = 20;
    }
    pdf.setDrawColor(120, 120, 120);
    pdf.setLineDashPattern([1, 1], 0);
    pdf.line(margenIzq, y, 210 - margenDer, y);
    pdf.setLineDashPattern([], 0);
    y += 8;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text("CONSTANCIA DE RECIBIDO", 105, y, { align: "center" });
    y += 7;

    parrafo(
        `Yo, ______________________________________________, acudiente del estudiante ${datos.nombre}, hago ` +
        `constar que recibí la presente comunicación y que apoyaré al estudiante en su preparación para el examen.`,
        10, 10
    );

    pdf.setFont("helvetica", "normal"); pdf.setFontSize(10.5);
    pdf.text("Firma del acudiente: __________________________________", margenIzq, y);
    y += 10;
    pdf.text("Fecha: ____________________", margenIzq, y);
}

// Genera y descarga un PDF con una o varias cartas (una por página).
function generarPdfCartas(listaDatos, nombreArchivo) {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    listaDatos.forEach((datos, i) => {
        if (i > 0) pdf.addPage();
        dibujarCartaPDF(pdf, datos);
    });
    pdf.save(nombreArchivo);
}

// Botón individual de "Carta" en cada fila de la tabla.
zonaReporte.addEventListener("click", (ev) => {
    const boton = ev.target.closest(".btn-carta-fila");
    if (!boton || boton.disabled) return;
    const indice = Number(boton.dataset.indice);
    const datos = listaCartasActual[indice];
    if (!datos) return;
    const nombreArchivo = `Carta_${datos.nombre.replace(/[^\w]+/g, "_")}_${datos.materia.replace(/[^\w]+/g, "_")}.pdf`;
    generarPdfCartas([datos], nombreArchivo);
});

// ---- Selección con casillas (para elegir a quién descargarle la carta) ----
function actualizarContadorSeleccion() {
    const n = seleccionCartas.size;
    contadorSeleccionCartas.textContent = `${n} seleccionado${n === 1 ? "" : "s"}`;
}

zonaReporte.addEventListener("change", (ev) => {
    const casilla = ev.target.closest(".chk-carta");
    if (!casilla) return;
    const indice = Number(casilla.dataset.indice);
    if (casilla.checked) seleccionCartas.add(indice);
    else seleccionCartas.delete(indice);
    actualizarContadorSeleccion();
});

btnSeleccionarTodasCartas.addEventListener("click", () => {
    zonaReporte.querySelectorAll(".chk-carta").forEach((c) => {
        c.checked = true;
        seleccionCartas.add(Number(c.dataset.indice));
    });
    actualizarContadorSeleccion();
});

btnQuitarSeleccionCartas.addEventListener("click", () => {
    zonaReporte.querySelectorAll(".chk-carta").forEach((c) => { c.checked = false; });
    seleccionCartas.clear();
    actualizarContadorSeleccion();
});

// Botón "Descargar cartas de los seleccionados" (menú desplegable).
btnDescargarCartasSeleccionadas.addEventListener("click", () => {
    if (seleccionCartas.size === 0) {
        alert("Primero marca la casilla de uno o más estudiantes en la tabla (o usa \"Seleccionar todos\").");
        return;
    }
    const indicesOrdenados = [...seleccionCartas].sort((a, b) => a - b);
    const seleccionadas = indicesOrdenados.map((i) => listaCartasActual[i]).filter(Boolean);
    generarPdfCartas(seleccionadas, "Cartas_estudiantes_seleccionados.pdf");
});

// Botón "Descargar carta de todos" (una sola en el menú desplegable).
btnDescargarCartasTodas.addEventListener("click", () => {
    if (listaCartasActual.length === 0) {
        alert("No hay cartas para generar todavía. Genera primero el reporte.");
        return;
    }
    generarPdfCartas(listaCartasActual, "Cartas_estudiantes_en_riesgo.pdf");
});

// ---------------------------------------------------------------
// 2.6) Cuadro para consejería: una tabla (no cartas) con todos los
// estudiantes en riesgo del reporte actual y la nota mínima que cada
// uno necesita en el examen para llegar a 3.0. Pensado para que
// consejería lo tenga a mano sin tener que abrir cada carta.
// ---------------------------------------------------------------
// Clasifica qué tan comprometido está el estudiante según la nota que
// necesita en el examen, para que consejería identifique de un vistazo
// a quiénes hay que darles seguimiento más de cerca (los que necesitan
// más de 4.0 están "muy comprometidos").
function calcularNivelUrgencia(d) {
    if (!d.aplicaNotaMinima) {
        return { texto: "Trimestre ya evaluado", color: [100, 116, 139] };
    }
    if (d.imposibleAlcanzar) {
        return { texto: "CRÍTICO – no alcanza ni con 5.0", color: [127, 29, 29] };
    }
    if (d.notaMinima > 4.0) {
        return { texto: "Muy comprometido (necesita > 4.0)", color: [185, 28, 28] };
    }
    if (d.notaMinima > 3.5) {
        return { texto: "Comprometido (necesita > 3.5)", color: [217, 119, 6] };
    }
    return { texto: "Leve", color: [21, 128, 61] };
}

function generarPdfCuadroConsejero() {
    if (listaCartasActual.length === 0) {
        alert("No hay datos para el cuadro todavía. Genera primero el reporte.");
        return;
    }
    generarPdfCuadroConsejeroAsync().catch((err) => {
        console.error(err);
        alert("No se pudo generar el cuadro para consejería: " + err.message);
    });
}

async function generarPdfCuadroConsejeroAsync() {
    const btnTextoOriginal = btnDescargarCuadroConsejero.innerHTML;
    btnDescargarCuadroConsejero.disabled = true;
    btnDescargarCuadroConsejero.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Generando...`;

    try {
        const trimestre = selectTrimestreRiesgo.value;
        const fechaGen = new Date().toLocaleString("es-PA", {
            day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
        });

        // Nombre del consejero(a) de cada salón involucrado, para
        // mencionarlo en la sección de comentarios de cada grupo.
        const salonesUnicos = [...new Set(listaCartasActual.map((d) => d.salon))];
        const nombreConsejeroPorSalon = {};
        if (salonesUnicos.length > 0) {
            const { data: filasConsejeros, error } = await supabase
                .from("consejeros")
                .select("salon, nombre")
                .in("salon", salonesUnicos);
            if (error) console.error(error);
            (filasConsejeros || []).forEach((c) => {
                nombreConsejeroPorSalon[(c.salon || "").trim().toUpperCase()] = c.nombre || "";
            });
        }

        // Agrupamos por salón + materia (igual que el reporte en pantalla),
        // para poder mostrar arriba de cada tabla el/la profesor(a), el
        // grado y la materia, sin repetirlos en cada fila.
        const gruposMap = {};
        listaCartasActual.forEach((d) => {
            const clave = `${d.salon}|||${d.materia}`;
            (gruposMap[clave] ??= { salon: d.salon, materia: d.materia, docente: d.docente, items: [] }).items.push(d);
        });
        const listaGrupos = Object.values(gruposMap).sort((a, b) =>
            a.salon.localeCompare(b.salon) || a.materia.localeCompare(b.materia)
        );
        listaGrupos.forEach((g) => g.items.sort((a, b) => a.nombre.localeCompare(b.nombre)));

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const altoPagina = pdf.internal.pageSize.getHeight();
        const margenIzq = 12, margenDer = 12;

        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(13);
        pdf.text("C.E.B.G. EL JIRAL", anchoPagina / 2, 14, { align: "center" });
        pdf.setFontSize(10.5);
        pdf.text("Cuadro de seguimiento para consejería · Estudiantes en riesgo académico", anchoPagina / 2, 20, { align: "center" });
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        pdf.text(`${trimestre} · Generado el ${fechaGen}`, anchoPagina / 2, 25, { align: "center" });

        let y = 31;

        listaGrupos.forEach((grupo, idxGrupo) => {
            // Si queda muy poco espacio en la página para empezar un grupo
            // nuevo, saltamos a una página en blanco antes de dibujarlo.
            if (idxGrupo > 0 && y > altoPagina - 55) {
                pdf.addPage();
                y = 15;
            }

            const grado = textoGradoDesdeSalon(grupo.salon);

            // --- Barra de título del grupo (salón + grado) ---
            pdf.setFillColor(153, 27, 27);
            pdf.rect(margenIzq, y, anchoPagina - margenIzq - margenDer, 7, "F");
            pdf.setTextColor(255, 255, 255);
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(10);
            pdf.text(`Salón ${grupo.salon}  ·  ${grado}`, margenIzq + 3, y + 5);
            pdf.setTextColor(0, 0, 0);
            y += 11;

            // --- Datos del grupo: profesor(a), grado y materia ---
            pdf.setFontSize(9.3);
            pdf.setFont("helvetica", "bold"); pdf.text("Profesor(a) de la materia:", margenIzq, y);
            pdf.setFont("helvetica", "normal");
            pdf.text(grupo.docente && grupo.docente !== "—" ? grupo.docente : "No asignado(a)", margenIzq + 43, y);

            pdf.setFont("helvetica", "bold"); pdf.text("Grado:", margenIzq + 110, y);
            pdf.setFont("helvetica", "normal"); pdf.text(grado, margenIzq + 122, y);

            pdf.setFont("helvetica", "bold"); pdf.text("Materia:", margenIzq + 165, y);
            pdf.setFont("helvetica", "normal"); pdf.text(grupo.materia, margenIzq + 179, y);
            y += 6;

            // --- Tabla del grupo (sin columnas de Salón/Materia, ya van arriba) ---
            const niveles = grupo.items.map((d) => calcularNivelUrgencia(d));
            const filas = grupo.items.map((d, i) => {
                let notaCol;
                if (!d.aplicaNotaMinima) notaCol = `Examen ya registrado (${formatoNota(d.promExa)})`;
                else if (d.imposibleAlcanzar) notaCol = "No alcanza ni con 5.0";
                else notaCol = d.notaMinima.toFixed(1);
                return [i + 1, d.nombre, formatoNota(d.promApr), formatoNota(d.promEje), d.promFinal.toFixed(1), notaCol, niveles[i].texto];
            });

            pdf.autoTable({
                startY: y,
                head: [["#", "Estudiante", "Aprec.", "Ejer.", "Prom. actual", "Mínimo en examen para pasar (3.0)", "Nivel de compromiso"]],
                body: filas,
                styles: { font: "helvetica", fontSize: 8.3, cellPadding: 2.1, valign: "middle" },
                headStyles: { fillColor: [127, 29, 29], textColor: 255, fontStyle: "bold", halign: "center", fontSize: 7.8 },
                alternateRowStyles: { fillColor: [254, 242, 242] },
                columnStyles: {
                    0: { cellWidth: 8, halign: "center" },
                    1: { cellWidth: 68 },
                    2: { cellWidth: 20, halign: "center" },
                    3: { cellWidth: 20, halign: "center" },
                    4: { cellWidth: 26, halign: "center" },
                    5: { cellWidth: 50, halign: "center" },
                    6: { cellWidth: 58, halign: "center" },
                },
                margin: { left: margenIzq, right: margenDer },
                didParseCell: (data) => {
                    if (data.section === "body" && (data.column.index === 5 || data.column.index === 6)) {
                        const nivel = niveles[data.row.index];
                        if (nivel) {
                            data.cell.styles.textColor = nivel.color;
                            data.cell.styles.fontStyle = "bold";
                        }
                    }
                },
            });

            y = pdf.lastAutoTable.finalY + 4;

            // --- Comentarios para el/la consejero(a) de este salón ---
            const nombreConsejero = nombreConsejeroPorSalon[grupo.salon.trim().toUpperCase()] || "";
            const altoCajaComentarios = 16;
            if (y + altoCajaComentarios > altoPagina - 10) {
                pdf.addPage();
                y = 15;
            }
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(9);
            pdf.text(
                `Comentarios para el/la consejero(a) del salón ${grupo.salon}${nombreConsejero ? ` (${nombreConsejero})` : " (sin consejero(a) asignado(a))"}:`,
                margenIzq, y
            );
            y += 3;
            pdf.setDrawColor(148, 163, 184);
            pdf.setLineWidth(0.25);
            pdf.rect(margenIzq, y, anchoPagina - margenIzq - margenDer, altoCajaComentarios);
            for (let linea = 1; linea <= 2; linea++) {
                const yLinea = y + (altoCajaComentarios / 3) * linea;
                pdf.setDrawColor(203, 213, 225);
                pdf.line(margenIzq + 3, yLinea, anchoPagina - margenDer - 3, yLinea);
            }
            y += altoCajaComentarios + 10;
        });

        // --- Leyenda de niveles, al final del documento ---
        if (y > altoPagina - 35) { pdf.addPage(); y = 15; }
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(8.5);
        pdf.text("Nivel de compromiso (según la nota mínima que necesita en el examen para llegar a 3.0):", margenIzq, y);
        y += 5;
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        const leyenda = [
            { color: [21, 128, 61], texto: "Leve: necesita 3.5 o menos." },
            { color: [217, 119, 6], texto: "Comprometido: necesita más de 3.5." },
            { color: [185, 28, 28], texto: "Muy comprometido: necesita más de 4.0." },
            { color: [127, 29, 29], texto: "Crítico: no alcanza ni obteniendo 5.0 en el examen." },
        ];
        leyenda.forEach((it) => {
            pdf.setFillColor(...it.color);
            pdf.circle(margenIzq + 1, y - 1, 1.1, "F");
            pdf.setTextColor(...it.color);
            pdf.text(it.texto, margenIzq + 5, y);
            y += 4.6;
        });
        pdf.setTextColor(0, 0, 0);

        pdf.save(`Cuadro_consejeria_${trimestre.replace(/\s+/g, "_")}.pdf`);
    } finally {
        btnDescargarCuadroConsejero.disabled = false;
        btnDescargarCuadroConsejero.innerHTML = btnTextoOriginal;
    }
}

btnDescargarCuadroConsejero.addEventListener("click", generarPdfCuadroConsejero);

// ---------------------------------------------------------------
// 3) Generar el reporte en pantalla
// ---------------------------------------------------------------
let generandoReporte = false;

async function generarReporte({ avisarSiVacio = true } = {}) {
    const salones = modo === "consejero"
        ? (salonConsejero ? [salonConsejero] : [])
        : [...salonesSeleccionados];

    if (salones.length === 0) {
        if (avisarSiVacio) alert("Elige al menos un salón.");
        // Si se vació la selección desde los chips (sin querer avisar),
        // simplemente ocultamos el reporte y volvemos al estado vacío.
        tarjetaReporte.style.display = "none";
        tarjetaVacia.style.display = "";
        return;
    }

    // Evita solapar dos generaciones si el usuario toca chips muy rápido
    // mientras la anterior todavía está buscando en la base de datos.
    if (generandoReporte) return;
    generandoReporte = true;

    const trimestre = selectTrimestreRiesgo.value;

    btnGenerarReporte.disabled = true;
    const textoOriginal = btnGenerarReporte.innerHTML;
    btnGenerarReporte.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Buscando...`;

    try {
        const reportePorSalon = [];

        for (const salon of salones.sort()) {
            const materiasInfo = await obtenerMateriasYDocentes(salon);
            if (materiasInfo.length === 0) continue;

            const { data: estudiantesSalon, error: errEst } = await supabase
                .from("estudiantes")
                .select("id, nombre, correo, es_prueba")
                .eq("salon", salon)
                .order("nombre", { ascending: true });

            if (errEst) { console.error(errEst); continue; }
            const estudiantes = (estudiantesSalon || []).filter((e) => !e.es_prueba);

            // Traer el teléfono/nombre del acudiente de cada estudiante de
            // este salón, para poder armar el botón de WhatsApp por fila.
            const correosSalon = estudiantes.map((e) => e.correo).filter(Boolean);
            if (correosSalon.length > 0) {
                const { data: datosContacto, error: errContacto } = await supabase
                    .from("datos_estudiante")
                    .select("correo, celular_acudiente1, telefono_acudiente2, nombre_padre_acudiente")
                    .in("correo", correosSalon);
                if (errContacto) console.error(errContacto);
                const contactoPorCorreo = {};
                (datosContacto || []).forEach((d) => { contactoPorCorreo[d.correo] = d; });
                estudiantes.forEach((e) => {
                    const c = contactoPorCorreo[e.correo];
                    e.telefonoAcudiente = c ? (c.celular_acudiente1 || c.telefono_acudiente2 || "") : "";
                    e.nombrePadre = c ? (c.nombre_padre_acudiente || "") : "";
                });
            }

            const porMateria = [];
            for (const { materia, docentes } of materiasInfo) {
                const enRiesgo = await calcularRiesgoPorMateria(materia, trimestre, estudiantes);
                porMateria.push({ materia, docentes, enRiesgo });
            }
            reportePorSalon.push({ salon, porMateria });
        }

        renderizarReporte(trimestre, reportePorSalon);
    } catch (err) {
        console.error(err);
        alert("No se pudo generar el reporte: " + err.message);
    } finally {
        btnGenerarReporte.disabled = false;
        btnGenerarReporte.innerHTML = textoOriginal;
        generandoReporte = false;
    }
}

btnGenerarReporte.addEventListener("click", () => generarReporte({ avisarSiVacio: true }));

function renderizarReporte(trimestre, reportePorSalon) {
    // Solo las materias que sí tienen estudiantes en riesgo.
    const salonesConRiesgo = reportePorSalon
        .map((s) => ({ salon: s.salon, materias: s.porMateria.filter((m) => m.enRiesgo.length > 0) }))
        .filter((s) => s.materias.length > 0);

    const totalEnRiesgo = salonesConRiesgo.reduce(
        (a, s) => a + s.materias.reduce((b, m) => b + m.enRiesgo.length, 0), 0
    );
    const estudiantesUnicos = new Set(
        salonesConRiesgo.flatMap((s) => s.materias.flatMap((m) => m.enRiesgo.map((e) => `${s.salon}-${e.nombre}`)))
    ).size;

    tarjetaVacia.style.display = "none";
    tarjetaReporte.style.display = "";

    const fechaGeneracion = new Date().toLocaleString("es-PA", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
    textoGenerado.textContent = `Generado el ${fechaGeneracion}`;
    fechaMembrete.textContent = `${trimestre} · Fecha de impresión: ${fechaGeneracion}`;

    listaCartasActual = [];
    seleccionCartas.clear();
    actualizarContadorSeleccion();

    if (totalEnRiesgo === 0) {
        resumenTop.innerHTML = "";
        zonaReporte.innerHTML = `<p class="text-success text-center py-3">✅ Ningún estudiante de los salones elegidos está por debajo de ${PROMEDIO_MINIMO_APROBAR.toFixed(1)} en ${escapeHtml(trimestre)}.</p>`;
        btnImprimir.style.display = "none";
        btnDescargarPdf.style.display = "none";
        btnCartasDropdown.style.display = "none";
        barraSeleccionCartas.style.display = "none";
        cajaMensajeWhatsapp.style.display = "none";
        return;
    }

    btnImprimir.style.display = "";
    btnDescargarPdf.style.display = "";
    btnCartasDropdown.style.display = "";
    barraSeleccionCartas.style.display = "";
    cajaMensajeWhatsapp.style.display = "";

    resumenTop.innerHTML = `
        <span class="pastilla-resumen">${estudiantesUnicos} estudiante${estudiantesUnicos === 1 ? "" : "s"} en riesgo</span>
        <span class="pastilla-resumen">${salonesConRiesgo.length} salón${salonesConRiesgo.length === 1 ? "" : "es"} afectado${salonesConRiesgo.length === 1 ? "" : "s"}</span>`;

    zonaReporte.innerHTML = salonesConRiesgo.map(({ salon, materias }) => {
        const fichas = materias.map(({ materia, docentes, enRiesgo }) => {
            const nombreDocente = docentes.length ? docentes.join(", ") : "—";

            const filas = enRiesgo.map((e, i) => {
                const numeroWa = numeroWhatsapp(e.telefonoAcudiente);
                const botonWa = numeroWa
                    ? `<button type="button" class="btn-whatsapp-fila"
                            data-estudiante="${escapeHtml(e.nombre)}"
                            data-materia="${escapeHtml(materia)}"
                            data-salon="${escapeHtml(salon)}"
                            data-profesor="${escapeHtml(nombreDocente)}"
                            data-trimestre="${escapeHtml(trimestre)}"
                            data-padre="${escapeHtml(e.nombrePadre || "")}"
                            data-telefono="${numeroWa}"
                            title="Enviar mensaje por WhatsApp al acudiente">
                            <i class="fa-brands fa-whatsapp"></i>
                        </button>`
                    : `<button type="button" class="btn-whatsapp-fila" disabled
                            title="Este estudiante no tiene número de WhatsApp del acudiente registrado (se agrega en 'Información de estudiantes')">
                            <i class="fa-brands fa-whatsapp"></i>
                        </button>`;

                // Registramos los datos de esta carta y guardamos su índice
                // para poder generarla al vuelo (individual o en el lote).
                const { aplica, notaMinima, imposible } = calcularNotaMinimaExamen(e.promApr, e.promEje, e.promExa);
                const indiceCarta = listaCartasActual.length;
                listaCartasActual.push({
                    nombre: e.nombre,
                    salon,
                    grado: textoGradoDesdeSalon(salon),
                    materia,
                    docente: nombreDocente,
                    trimestre,
                    promApr: e.promApr, promEje: e.promEje, promExa: e.promExa, promFinal: e.promFinal,
                    aplicaNotaMinima: aplica, notaMinima, imposibleAlcanzar: imposible,
                    fechaTexto: textoFechaCartaHoy(),
                });
                const botonCarta = `<button type="button" class="btn-carta-fila" data-indice="${indiceCarta}"
                            title="Descargar carta individual para el acudiente (PDF)">
                            <i class="fa-solid fa-file-lines"></i>
                        </button>`;
                const casillaCarta = `<input type="checkbox" class="chk-carta" data-indice="${indiceCarta}"
                            title="Marcar para incluir en 'Descargar cartas de los seleccionados'">`;

                return `
                <tr>
                    <td>${i + 1}</td>
                    <td class="nombre">${escapeHtml(e.nombre)}</td>
                    <td>${e.promApr !== null ? e.promApr.toFixed(1) : "–"}</td>
                    <td>${e.promEje !== null ? e.promEje.toFixed(1) : "–"}</td>
                    <td>${e.promExa !== null ? e.promExa.toFixed(1) : "–"}</td>
                    <td class="final">${e.promFinal.toFixed(1)}</td>
                    <td class="no-imprimir"><div class="celda-acciones-fila">${casillaCarta}${botonWa}${botonCarta}</div></td>
                </tr>`;
            }).join("");

            return `
                <div class="ficha-materia">
                    <h2 class="conteo-materia">${escapeHtml(materia)} <span class="conteo">(${enRiesgo.length} en riesgo)</span></h2>
                    <div class="datos-ficha">
                        <span><b>Profesor:</b> ${escapeHtml(nombreDocente)}</span>
                        <span><b>Materia:</b> ${escapeHtml(materia)}</span>
                        <span><b>Salón:</b> ${escapeHtml(salon)}</span>
                    </div>
                    <table>
                        <thead>
                            <tr><th>#</th><th>Estudiante</th><th>Prom. Aprec.</th><th>Prom. Ejer.</th><th>Prom. Examen</th><th>Prom. Final</th><th class="no-imprimir">Acciones</th></tr>
                        </thead>
                        <tbody>${filas}</tbody>
                    </table>
                    <div class="linea-envio">
                        Enviado a consejero(a) del salón:
                        <span class="casilla"></span> Sí
                        <span class="casilla"></span> No
                    </div>
                </div>`;
        }).join("");

        return `<h2 class="titulo-salon">Salón ${escapeHtml(salon)}</h2>${fichas}`;
    }).join("");
}

// ---------------------------------------------------------------
// 4) Imprimir / Descargar en PDF
// ---------------------------------------------------------------
btnImprimir.addEventListener("click", () => window.print());

btnDescargarPdf.addEventListener("click", async () => {
    btnDescargarPdf.disabled = true;
    const textoOriginal = btnDescargarPdf.innerHTML;
    btnDescargarPdf.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Generando...`;
    try {
        if (document.fonts && document.fonts.ready) await document.fonts.ready;
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        const canvas = await html2canvas(contenidoImprimible, { scale: 2, backgroundColor: "#ffffff" });
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const imgWidth = pageWidth;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        const imgData = canvas.toDataURL("image/jpeg", 0.95);
        let alturaRestante = imgHeight;
        let posicion = 0;
        pdf.addImage(imgData, "JPEG", 0, posicion, imgWidth, imgHeight);
        alturaRestante -= pageHeight;
        while (alturaRestante > 0) {
            posicion = alturaRestante - imgHeight;
            pdf.addPage();
            pdf.addImage(imgData, "JPEG", 0, posicion, imgWidth, imgHeight);
            alturaRestante -= pageHeight;
        }

        const nombreSalones = modo === "consejero"
            ? salonConsejero
            : [...salonesSeleccionados].sort().join("-");
        pdf.save(`Estudiantes_en_riesgo_${nombreSalones || "reporte"}.pdf`);
    } catch (err) {
        console.error(err);
        alert("No se pudo generar el PDF: " + err.message);
    } finally {
        btnDescargarPdf.disabled = false;
        btnDescargarPdf.innerHTML = textoOriginal;
    }
});

iniciar();
