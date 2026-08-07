import { supabase } from "./supabase.js";

// =====================================================
// LISTA BASE DE MATERIAS (igual que en el panel del estudiante)
// =====================================================

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
const filtroTrimestre = document.getElementById("filtroTrimestre");
const contenedorMaterias = document.getElementById("materias");
const btnPdf = document.getElementById("btnPdf");

// =====================================================
// ESTADO
// =====================================================

let estudianteActual = null;   // { nombre, salon }
let notasCrudas = [];          // todas las filas que devuelve la función
let cedulaConsultada = "";

// =====================================================
// MOSTRAR / OCULTAR CÉDULA
// =====================================================

btnOjo.addEventListener("click", () => {
    const oculto = inputCedula.type === "password";
    inputCedula.type = oculto ? "text" : "password";
    btnOjo.textContent = oculto ? "🙈" : "👁️";
});

// Enter también busca
inputCedula.addEventListener("keydown", (e) => {
    if (e.key === "Enter") buscar();
});

// Si la página llega con ?cedula=... (por ejemplo desde inicio.html),
// se precarga y se busca automáticamente.
const cedulaDesdeURL = new URLSearchParams(window.location.search).get("cedula");
if (cedulaDesdeURL) {
    inputCedula.value = cedulaDesdeURL;
    buscar();
}

btnBuscar.addEventListener("click", buscar);
filtroTrimestre.addEventListener("change", () => render());

// =====================================================
// MENSAJES
// =====================================================

function mostrarMensaje(texto, tipo) {
    mensaje.textContent = texto;
    mensaje.className = `mensaje ${tipo}`;
}

function ocultarMensaje() {
    mensaje.className = "mensaje";
    mensaje.textContent = "";
}

// =====================================================
// BUSCAR
// =====================================================

async function buscar() {
    const cedula = inputCedula.value.trim();

    if (!cedula) {
        mostrarMensaje("⚠️ Por favor escribe tu cédula.", "error");
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
    btnBuscar.textContent = "Ver mis notas";

    if (errEst || errNotas) {
        console.error("❌ Error al consultar:", errEst || errNotas);
        mostrarMensaje("❌ Ocurrió un error al consultar. Intenta de nuevo.", "error");
        return;
    }

    const estudiante = Array.isArray(est) ? est[0] : est;

    if (!estudiante) {
        mostrarMensaje("⚠️ No se encontró ningún estudiante con esa cédula. Verifica que esté bien escrita, o que ya te hayas registrado.", "error");
        return;
    }

    estudianteActual = estudiante;
    notasCrudas = notas || [];
    cedulaConsultada = cedula;

    nombreEstudianteEl.textContent = estudiante.nombre || "Estudiante";
    salonEstudianteEl.textContent = estudiante.salon ? `Salón: ${estudiante.salon}` : "";

    resultado.style.display = "block";
    render();
}

// =====================================================
// AGRUPAR NOTAS
// =====================================================

function calcularPromedio(valores) {
    if (valores.length === 0) return null;
    return valores.reduce((a, b) => a + b, 0) / valores.length;
}

function filasParaTrimestre(trimestre) {
    return trimestre === "todos"
        ? notasCrudas
        : notasCrudas.filter((n) => n.trimestre === trimestre);
}

function agruparPorMateria(filas) {
    const porMateria = {};

    filas.forEach((n) => {
        if (!porMateria[n.materia]) {
            porMateria[n.materia] = { apreciacion: [], ejercicio: [] };
        }
        const tipoNorm = (n.tipo || "").toLowerCase();
        if (tipoNorm !== "apreciacion" && tipoNorm !== "ejercicio") return;

        const valor = n.estado === "Intencional" ? 0 : Number(n.nota);
        porMateria[n.materia][tipoNorm].push({ numero: n.numero, valor, tema: n.tema });
    });

    return porMateria;
}

function materiasParaMostrar(porMateria) {
    const extras = Object.keys(porMateria)
        .filter((m) => !MATERIAS_BASE.includes(m) && m !== "Informática")
        .sort();

    const base = estudianteActual?.salon === "8A"
        ? MATERIAS_BASE.map((m) => (m === "Contabilidad" ? "Informática" : m))
        : MATERIAS_BASE;

    return [...base, ...extras];
}

// =====================================================
// RENDER
// =====================================================

function render() {
    const trimestre = filtroTrimestre.value;
    const filas = filasParaTrimestre(trimestre);
    const porMateria = agruparPorMateria(filas);
    const materias = materiasParaMostrar(porMateria);

    let html = "";

    materias.forEach((materia) => {
        const datos = porMateria[materia] || { apreciacion: [], ejercicio: [] };
        const promApr = calcularPromedio(datos.apreciacion.map((x) => x.valor));
        const promEje = calcularPromedio(datos.ejercicio.map((x) => x.valor));
        const promFinal = promApr !== null && promEje !== null
            ? (promApr + promEje) / 2
            : (promApr ?? promEje);

        if (datos.apreciacion.length === 0 && datos.ejercicio.length === 0) {
            // No hay ninguna nota registrada todavía en esta materia: se omite
            // para no llenar la pantalla de materias vacías.
            return;
        }

        const filasApr = datos.apreciacion
            .sort((a, b) => a.numero - b.numero)
            .map((n) => `<td>${n.valor.toFixed(1)}</td>`)
            .join("");

        const filasEje = datos.ejercicio
            .sort((a, b) => a.numero - b.numero)
            .map((n) => `<td>${n.valor.toFixed(1)}</td>`)
            .join("");

        html += `
            <div class="materia-card">
                <h3>${escapeHtml(materia)}</h3>
                <div style="overflow-x:auto;">
                    <table class="tabla-notas">
                        <thead>
                            <tr>
                                <th>Tipo</th>
                                ${datos.apreciacion.length || datos.ejercicio.length ? "" : ""}
                                <th colspan="99" style="text-align:left; padding-left:10px;">Notas</th>
                                <th>Promedio</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><strong>Apreciación</strong></td>
                                ${filasApr || `<td>-</td>`}
                                <td class="promedio">${promApr !== null ? promApr.toFixed(1) : "-"}</td>
                            </tr>
                            <tr>
                                <td><strong>Ejercicio</strong></td>
                                ${filasEje || `<td>-</td>`}
                                <td class="promedio">${promEje !== null ? promEje.toFixed(1) : "-"}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <p style="text-align:right; margin:10px 2px 0; font-weight:bold; color:#1f4e79;">
                    Promedio final: ${promFinal !== null ? promFinal.toFixed(1) : "-"}
                </p>
            </div>
        `;
    });

    if (!html) {
        html = `<p style="text-align:center; color:#64748b;">Todavía no hay notas registradas para este trimestre.</p>`;
    }

    contenedorMaterias.innerHTML = html;
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
// DESCARGAR PDF
// =====================================================

btnPdf.addEventListener("click", () => {
    if (!estudianteActual) return;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(14);
    doc.text("C.E.B.G. EL JIRAL - Notas de Evaluación", 20, 20);
    doc.setFontSize(11);
    doc.text(`Estudiante: ${estudianteActual.nombre || "-"}`, 20, 30);
    doc.text(`Salón: ${estudianteActual.salon || "-"}`, 20, 37);

    const trimestre = filtroTrimestre.value;
    doc.text(`Trimestre: ${trimestre === "todos" ? "Todos" : trimestre}`, 20, 44);

    const filas = filasParaTrimestre(trimestre);
    const porMateria = agruparPorMateria(filas);
    const materias = materiasParaMostrar(porMateria);

    const cuerpo = [];
    materias.forEach((materia) => {
        const datos = porMateria[materia] || { apreciacion: [], ejercicio: [] };
        if (datos.apreciacion.length === 0 && datos.ejercicio.length === 0) return;

        const promApr = calcularPromedio(datos.apreciacion.map((x) => x.valor));
        const promEje = calcularPromedio(datos.ejercicio.map((x) => x.valor));
        const promFinal = promApr !== null && promEje !== null
            ? (promApr + promEje) / 2
            : (promApr ?? promEje);

        cuerpo.push([
            materia,
            promApr !== null ? promApr.toFixed(1) : "-",
            promEje !== null ? promEje.toFixed(1) : "-",
            promFinal !== null ? promFinal.toFixed(1) : "-"
        ]);
    });

    doc.autoTable({
        head: [["Materia", "Prom. Apreciación", "Prom. Ejercicio", "Promedio Final"]],
        body: cuerpo,
        startY: 52,
        styles: { fontSize: 9, halign: "center" },
        headStyles: { fillColor: [31, 78, 121], textColor: 255 },
        columnStyles: { 0: { halign: "left", fontStyle: "bold" } }
    });

    const nombreArchivo = (estudianteActual.nombre || "Boletin").replace(/[,\s]+/g, "_");
    doc.save(`Notas_${nombreArchivo}.pdf`);
});
