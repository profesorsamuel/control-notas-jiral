import { supabase } from "./supabase.js";
import { cedulaAEmail } from "./utils.js";

// =====================================================
// BOLETÍN DE LOS 3 TRIMESTRES
// =====================================================
// Esta página muestra, para cada materia, el promedio del
// Trimestre 1, Trimestre 2, Trimestre 3 y el Promedio Final
// (promedio de los trimestres que ya tengan notas), todo en
// una sola tabla que se puede imprimir / descargar en PDF.

const MATERIAS_BASE = [
    "Español",
    "Matemática",
    "Ciencias Naturales",
    "Inglés",
    "Expresión Artística",
    "Música",
    "Educación Física",
    "Familia y Desarrollo Comunitario",
    "Historia",
    "Educación Agropecuaria",
    "Contabilidad",
    "Geografía",
    "Orientación",
    "Cívica",
    "Religión, Moral y Valores"
];

const TRIMESTRES = ["Trimestre 1", "Trimestre 2", "Trimestre 3"];
const NOTA_MINIMA_APROBAR = 3;

// Redondeo matemático estándar a 1 decimal (ej. 4.66 -> 4.7, 4.64 -> 4.6),
// no truncamiento. Se usa siempre que se muestra o exporta una nota
// calculada, para que el boletín coincida con la "ley del redondeo".
function redondear1(valor) {
    if (valor === null || valor === undefined || Number.isNaN(valor)) return null;
    return Math.round((valor + Number.EPSILON) * 10) / 10;
}

function formatearNota(valor) {
    const redondeado = redondear1(valor);
    return redondeado === null ? "-" : redondeado.toFixed(1);
}

// =====================================================
// ELEMENTOS DEL DOM
// =====================================================

const inputCedula = document.getElementById("cedula");
const btnOjo = document.getElementById("btnOjo");
const btnBuscar = document.getElementById("btnBuscar");
const mensaje = document.getElementById("mensaje");
const resultado = document.getElementById("resultado");
const nombreEstudianteEl = document.getElementById("nombreEstudiante");
const salonEstudianteEl = document.getElementById("salonEstudiante");
const cuerpoTabla = document.getElementById("cuerpoTabla");
const promedioGeneralEl = document.getElementById("promedioGeneral");
const bloquePromedioGeneral = document.getElementById("bloquePromedioGeneral");
const avisoFracaso = document.getElementById("avisoFracaso");
const btnPdf = document.getElementById("btnPdf");
const btnImprimir = document.getElementById("btnImprimir");
const fechaGeneracionEl = document.getElementById("fechaGeneracion");

let estudianteActual = null;
let notasCrudas = [];
let resumenActual = [];

// =====================================================
// MOSTRAR / OCULTAR CÉDULA Y BÚSQUEDA
// =====================================================

btnOjo.addEventListener("click", () => {
    const oculto = inputCedula.type === "password";
    inputCedula.type = oculto ? "text" : "password";
    btnOjo.textContent = oculto ? "🙈" : "👁️";
});

inputCedula.addEventListener("keydown", (e) => {
    if (e.key === "Enter") buscar();
});

const cedulaDesdeURL = new URLSearchParams(window.location.search).get("cedula");
if (cedulaDesdeURL) {
    inputCedula.value = cedulaDesdeURL;
    buscar();
}

btnBuscar.addEventListener("click", buscar);

function mostrarMensaje(texto, tipo) {
    mensaje.textContent = texto;
    mensaje.className = `mensaje ${tipo}`;
}

function ocultarMensaje() {
    mensaje.className = "mensaje";
    mensaje.textContent = "";
}

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// =====================================================
// BUSCAR
// =====================================================

async function buscar() {
    const cedula = inputCedula.value.trim();

    if (!cedula) {
        mostrarMensaje("⚠️ Por favor escribe la cédula.", "error");
        return;
    }

    btnBuscar.disabled = true;
    btnBuscar.textContent = "Buscando...";
    ocultarMensaje();
    resultado.style.display = "none";

    const [{ data: est, error: errEst }, { data: notas, error: errNotas }] = await Promise.all([
        supabase.rpc("obtener_estudiante_por_cedula", { p_cedula: cedula }),
        supabase.rpc("obtener_notas_por_cedula", { p_cedula: cedula })
    ]);

    btnBuscar.disabled = false;
    btnBuscar.textContent = "Ver boletín";

    if (errEst || errNotas) {
        console.error("❌ Error al consultar:", errEst || errNotas);
        mostrarMensaje("❌ Ocurrió un error al consultar. Intenta de nuevo.", "error");
        return;
    }

    const estudiante = Array.isArray(est) ? est[0] : est;

    if (!estudiante) {
        mostrarMensaje("⚠️ No se encontró ningún estudiante con esa cédula. Verifica que esté bien escrita.", "error");
        return;
    }

    estudianteActual = estudiante;
    notasCrudas = await quitarNotasOcultasParaEstudiante(notas || [], estudiante.salon);

    nombreEstudianteEl.textContent = estudiante.nombre || "Estudiante";
    salonEstudianteEl.textContent = estudiante.salon ? `Salón: ${estudiante.salon}` : "";

    fechaGeneracionEl.textContent = new Date().toLocaleString("es-PA", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit"
    });

    resultado.style.display = "block";
    render();
}

async function quitarNotasOcultasParaEstudiante(notas, salon) {
    if (!notas.length || !salon) return notas;

    const { data: ocultas, error } = await supabase
        .from("temas_casillas")
        .select("materia, trimestre, tipo, numero")
        .eq("salon", salon)
        .eq("oculta_estudiante", true)
        .is("eliminado_en", null);

    if (error) {
        console.warn("⚠️ No se pudieron consultar las casillas ocultas:", error);
        return notas;
    }
    if (!ocultas || ocultas.length === 0) return notas;

    const clavesOcultas = new Set(
        ocultas.map((o) => `${o.materia}|${o.trimestre}|${(o.tipo || "").toLowerCase()}|${o.numero}`)
    );

    return notas.filter((n) => {
        const clave = `${n.materia}|${n.trimestre}|${(n.tipo || "").toLowerCase()}|${n.numero}`;
        return !clavesOcultas.has(clave);
    });
}

// =====================================================
// CÁLCULO DE PROMEDIOS
// =====================================================

function calcularPromedio(valores) {
    if (valores.length === 0) return null;
    return valores.reduce((a, b) => a + b, 0) / valores.length;
}

// Promedio final de UNA materia en UN trimestre: promedio de
// Apreciación / Ejercicio / Examen. Usa el mismo límite (mínimo 1,
// máximo 5) que aplica formatearNotaFinal() en la tabla real de
// edición del docente, para que el boletín SIEMPRE coincida con lo
// que el docente ve ahí, incluso si alguna nota quedó mal escrita en
// la base de datos.
function limitarNota(valor) {
    if (valor < 1) return 1;
    if (valor > 5) return 5;
    return valor;
}

function promedioMateriaTrimestre(materia, trimestre) {
    const filas = notasCrudas.filter((n) => n.materia === materia && n.trimestre === trimestre);
    if (filas.length === 0) return null;

    const porTipo = { apreciacion: [], ejercicio: [], examen: [] };
    filas.forEach((n) => {
        const tipoNorm = (n.tipo || "").toLowerCase();
        if (tipoNorm !== "apreciacion" && tipoNorm !== "ejercicio" && tipoNorm !== "examen") return;
        const valor = Number(n.nota);
        if (isNaN(valor)) return;
        porTipo[tipoNorm].push(limitarNota(valor));
    });

    const promApr = calcularPromedio(porTipo.apreciacion);
    const promEje = calcularPromedio(porTipo.ejercicio);
    const promExa = calcularPromedio(porTipo.examen);
    const presentes = [promApr, promEje, promExa].filter((v) => v !== null);

    return presentes.length ? presentes.reduce((a, b) => a + b, 0) / presentes.length : null;
}

function materiasParaMostrar() {
    const materiasConNotas = new Set(notasCrudas.map((n) => n.materia));
    const extras = [...materiasConNotas]
        .filter((m) => !MATERIAS_BASE.includes(m) && m !== "Informática")
        .sort();

    const base = estudianteActual?.salon === "8A"
        ? MATERIAS_BASE.map((m) => (m === "Contabilidad" ? "Informática" : m))
        : MATERIAS_BASE;

    return [...base, ...extras].filter((m) => materiasConNotas.has(m));
}

// Arma, para cada materia, los 3 promedios trimestrales y el
// promedio final (promedio de los trimestres que sí tengan datos).
function calcularResumenCompleto() {
    const materias = materiasParaMostrar();

    return materias.map((materia) => {
        const porTrimestre = TRIMESTRES.map((t) => promedioMateriaTrimestre(materia, t));
        const presentes = porTrimestre.filter((v) => v !== null);
        const promFinal = presentes.length ? presentes.reduce((a, b) => a + b, 0) / presentes.length : null;

        return {
            materia,
            t1: porTrimestre[0],
            t2: porTrimestre[1],
            t3: porTrimestre[2],
            promFinal,
            fracaso: promFinal !== null && promFinal < NOTA_MINIMA_APROBAR
        };
    });
}

// =====================================================
// RENDER (pantalla)
// =====================================================

function render() {
    resumenActual = calcularResumenCompleto();

    if (resumenActual.length === 0) {
        cuerpoTabla.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#64748b; padding:20px;">Todavía no hay notas registradas.</td></tr>`;
        bloquePromedioGeneral.style.display = "none";
        avisoFracaso.style.display = "none";
        return;
    }

    const celda = (valor) => {
        if (valor === null) return `<td class="celda-nota">-</td>`;
        const fallo = valor < NOTA_MINIMA_APROBAR;
        return `<td class="celda-nota${fallo ? " resaltado-rojo" : ""}">${formatearNota(valor)}</td>`;
    };

    cuerpoTabla.innerHTML = resumenActual.map((r) => {
        const filaClase = r.fracaso ? "fila-fracaso" : "";
        const finalClase = r.promFinal === null
            ? "celda-nota celda-final"
            : `celda-nota celda-final${r.fracaso ? " resaltado-rojo" : " resaltado-verde"}`;
        const finalTexto = formatearNota(r.promFinal);

        return `
            <tr class="${filaClase}">
                <td class="celda-materia">${escapeHtml(r.materia)}${r.fracaso ? ` <span class="etiqueta-fracaso">EN RIESGO</span>` : ""}</td>
                ${celda(r.t1)}
                ${celda(r.t2)}
                ${celda(r.t3)}
                <td class="${finalClase}">${finalTexto}</td>
            </tr>
        `;
    }).join("");

    const materiasConPromedio = resumenActual.filter((r) => r.promFinal !== null);
    const promedioGeneral = materiasConPromedio.length > 0
        ? materiasConPromedio.reduce((a, r) => a + r.promFinal, 0) / materiasConPromedio.length
        : null;

    if (promedioGeneral !== null) {
        const enFracaso = promedioGeneral < NOTA_MINIMA_APROBAR;
        bloquePromedioGeneral.style.display = "flex";
        promedioGeneralEl.textContent = formatearNota(promedioGeneral) + (enFracaso ? "  (EN FRACASO)" : "");
        promedioGeneralEl.className = enFracaso ? "valor-promedio-general fracaso" : "valor-promedio-general";
    } else {
        bloquePromedioGeneral.style.display = "none";
    }

    const materiasEnFracaso = resumenActual.filter((r) => r.fracaso);
    if (materiasEnFracaso.length > 0) {
        avisoFracaso.style.display = "block";
        avisoFracaso.innerHTML = `⚠️ <strong>Materias en riesgo (por debajo de ${NOTA_MINIMA_APROBAR.toFixed(1)}):</strong> ${escapeHtml(materiasEnFracaso.map((r) => r.materia).join(", "))}. Recuerda que todavía pueden faltar notas por registrar en algunos trimestres, así que estos promedios pueden cambiar.`;
    } else {
        avisoFracaso.style.display = "none";
    }
}

// =====================================================
// IMPRIMIR (usa el diálogo de impresión del navegador,
// desde donde se puede elegir "Guardar como PDF")
// =====================================================

btnImprimir.addEventListener("click", () => {
    window.print();
});

// =====================================================
// DESCARGAR PDF (jsPDF, con las materias en riesgo resaltadas)
// =====================================================

btnPdf.addEventListener("click", () => {
    if (!estudianteActual || resumenActual.length === 0) return;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(14);
    doc.text("C.E.B.G. EL JIRAL - Boletín de los 3 Trimestres", 20, 20);
    doc.setFontSize(11);
    doc.text(`Estudiante: ${estudianteActual.nombre || "-"}`, 20, 30);
    doc.text(`Salón: ${estudianteActual.salon || "-"}`, 20, 37);

    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generado el: ${fechaGeneracionEl.textContent}`, 20, 43);
    doc.setTextColor(0, 0, 0);

    const cuerpo = resumenActual.map((r) => [
        r.materia + (r.fracaso ? "  (EN RIESGO)" : ""),
        r.t1 !== null ? formatearNota(r.t1) : "-",
        r.t2 !== null ? formatearNota(r.t2) : "-",
        r.t3 !== null ? formatearNota(r.t3) : "-",
        r.promFinal !== null ? formatearNota(r.promFinal) : "-"
    ]);

    doc.autoTable({
        head: [["Materia", "Trimestre 1", "Trimestre 2", "Trimestre 3", "Promedio Final"]],
        body: cuerpo,
        startY: 50,
        styles: { fontSize: 9.5, halign: "center" },
        headStyles: { fillColor: [31, 78, 121], textColor: 255 },
        columnStyles: { 0: { halign: "left", fontStyle: "bold" } },
        margin: { left: 20, right: 20 },
        didParseCell: (data) => {
            // Resalta en rojo las notas trimestrales y el promedio
            // final que estén por debajo de la nota mínima.
            if (data.section !== "body") return;

            const fila = resumenActual[data.row.index];
            const valor = [null, fila.t1, fila.t2, fila.t3, fila.promFinal][data.column.index];

            if (data.column.index === 0 && fila.fracaso) {
                data.cell.styles.textColor = [180, 0, 0];
            } else if (data.column.index >= 1 && valor !== null && valor < NOTA_MINIMA_APROBAR) {
                data.cell.styles.fillColor = [254, 226, 226];
                data.cell.styles.textColor = [185, 28, 28];
                data.cell.styles.fontStyle = "bold";
            } else if (data.column.index === 4 && valor !== null) {
                data.cell.styles.fontStyle = "bold";
            }
        }
    });

    let y = doc.lastAutoTable.finalY + 10;

    const materiasConPromedio = resumenActual.filter((r) => r.promFinal !== null);
    const promedioGeneral = materiasConPromedio.length > 0
        ? materiasConPromedio.reduce((a, r) => a + r.promFinal, 0) / materiasConPromedio.length
        : null;

    if (promedioGeneral !== null) {
        const enFracaso = promedioGeneral < NOTA_MINIMA_APROBAR;
        doc.setDrawColor(150, 150, 150);
        doc.line(20, y, 190, y);
        y += 8;
        doc.setFontSize(13);
        doc.setFont(undefined, "bold");
        if (enFracaso) doc.setTextColor(200, 0, 0);
        doc.text(`Promedio General: ${formatearNota(promedioGeneral)}${enFracaso ? "  (EN FRACASO)" : ""}`, 20, y);
        doc.setTextColor(0, 0, 0);
        doc.setFont(undefined, "normal");
        y += 10;
    }

    const materiasEnFracaso = resumenActual.filter((r) => r.fracaso);
    if (materiasEnFracaso.length > 0) {
        if (y > 250) { doc.addPage(); y = 25; }
        doc.setDrawColor(200, 0, 0);
        doc.setLineWidth(0.5);
        doc.line(20, y, 190, y);
        y += 8;

        doc.setFont(undefined, "bold");
        doc.setFontSize(11);
        doc.setTextColor(180, 0, 0);
        doc.text("MATERIAS EN RIESGO", 20, y);
        y += 7;

        doc.setFont(undefined, "normal");
        doc.setFontSize(9);
        doc.setTextColor(0, 0, 0);
        const texto = `Están por debajo de la nota mínima para aprobar (${NOTA_MINIMA_APROBAR.toFixed(1)}): ${materiasEnFracaso.map((r) => r.materia).join(", ")}. Todavía pueden faltar notas por registrar en algunos trimestres, por lo que estos resultados pueden cambiar.`;
        const lineas = doc.splitTextToSize(texto, 170);
        doc.text(lineas, 20, y);
    }

    const nombreArchivo = (estudianteActual.nombre || "Boletin").replace(/[,\s]+/g, "_");
    doc.save(`Boletin_3_Trimestres_${nombreArchivo}.pdf`);
});
