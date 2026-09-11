import { supabase } from "./supabase.js";
// La mayor parte de los cálculos y del HTML del cuadro ahora vive en
// cuadro_aprobados_core.js (sin depender del DOM de esta página), para
// que el botón "📦 Descargar TODO" de boletin_profesor.js pueda generar
// exactamente el mismo reporte para muchas materias de golpe, sin
// duplicar esta lógica.
import {
    PROMEDIO_MINIMO_APROBAR,
    calcularDatosSalon,
    construirTablaHtml,
    construirEncabezadoHtml,
    construirNotasHtml,
    construirTablaRiesgoHtml,
    esMismaMateria,
} from "./cuadro_aprobados_core.js";

// =========================================================
// 0) UTILIDADES
// =========================================================

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// =========================================================
// 1) SESIÓN (mismo patrón que profesor.js / consejero.js)
// =========================================================

let correoProfesor = "";
let nombreProfesor = "";
let misAsignaciones = []; // [{materia, salon}]
let mapaSalones = {}; // codigo -> {nivel, letra, nombre_visible, orden}

async function verificarSesion() {
    const { data: { user }, error: errUser } = await supabase.auth.getUser();
    if (errUser || !user) {
        window.location.href = "login.html";
        return false;
    }
    correoProfesor = (user.email || "").trim().toLowerCase();

    const { data: materias, error: errMaterias } = await supabase
        .from("profesor_materias")
        .select("materia, salon")
        .eq("correo_profesor", correoProfesor);

    if (errMaterias) {
        alert("Ocurrió un error al verificar tu acceso: " + errMaterias.message);
        window.location.href = "login.html";
        return false;
    }
    if (!materias || materias.length === 0) {
        alert("⛔ Esta cuenta no tiene materias asignadas como docente.");
        window.location.href = "login.html";
        return false;
    }
    misAsignaciones = materias;

    const { data: perfilProfesor } = await supabase
        .from("profesores")
        .select("nombre_profesor")
        .eq("correo_profesor", correoProfesor)
        .maybeSingle();
    nombreProfesor = perfilProfesor?.nombre_profesor || correoProfesor;

    const elNombre = document.getElementById("nombreProfesorHeader");
    if (elNombre) elNombre.textContent = nombreProfesor;
    const elCampoProfesor = document.getElementById("campoNombreProfesor");
    if (elCampoProfesor) elCampoProfesor.textContent = nombreProfesor;

    return true;
}

async function cargarCatalogoSalones() {
    const { data } = await supabase
        .from("salones")
        .select("codigo, nivel, letra, nombre_visible, orden")
        .order("orden", { ascending: true });
    mapaSalones = {};
    (data || []).forEach((s) => { mapaSalones[s.codigo] = s; });
}

// =========================================================
// 2) ELEMENTOS Y POBLADO DE SELECTORES
// =========================================================

const selectMateria = document.getElementById("selectMateria");
const selectTrimestre = document.getElementById("selectTrimestre");
const inputAnio = document.getElementById("inputAnio");
const selectJornada = document.getElementById("selectJornada");
const contenedorSalones = document.getElementById("contenedorSalones");
const btnGenerar = document.getElementById("btnGenerar");
const estadoGeneracion = document.getElementById("estadoGeneracion");
const bloqueReporte = document.getElementById("bloqueReporte");
const contenidoReporte = document.getElementById("contenidoReporte");
const btnPdf = document.getElementById("btnPdf");
const btnImprimir = document.getElementById("btnImprimir");

function poblarSelectMateria() {
    const materias = [...new Set(misAsignaciones.map((a) => a.materia))].sort();
    selectMateria.innerHTML = `<option value="">Selecciona una asignatura</option>` +
        materias.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
}

function poblarSalones() {
    const materia = selectMateria.value;
    if (!materia) {
        contenedorSalones.innerHTML = `<span class="small text-muted">Elige primero una asignatura.</span>`;
        return;
    }
    const salones = [...new Set(misAsignaciones.filter((a) => a.materia === materia).map((a) => a.salon))];
    salones.sort((a, b) => {
        const oa = mapaSalones[a]?.orden ?? 999;
        const ob = mapaSalones[b]?.orden ?? 999;
        return oa !== ob ? oa - ob : String(a).localeCompare(String(b));
    });

    if (salones.length === 0) {
        contenedorSalones.innerHTML = `<span class="small text-muted">No tienes salones asignados en esta asignatura.</span>`;
        return;
    }

    contenedorSalones.innerHTML = salones.map((s) => {
        const label = mapaSalones[s]?.nombre_visible || s;
        return `<label class="chip-check">
            <input type="checkbox" value="${escapeHtml(s)}" class="chkSalon" checked>
            ${escapeHtml(label)}
        </label>`;
    }).join("");
}

selectMateria.addEventListener("change", () => { poblarSalones(); ocultarReporte(); });

function ocultarReporte() {
    bloqueReporte.style.display = "none";
    contenidoReporte.innerHTML = "";
}

// Aviso de trabajo (NO se imprime ni sale en el PDF): lista, por grado,
// los nombres de los estudiantes sin género registrado, para que el
// profesor sepa exactamente a quién completarle el dato.
function mostrarAvisoGenero(filas) {
    const contenedor = document.getElementById("avisoGeneroFaltante");
    const conFaltantes = filas.filter((f) => f.sinGeneroNombres.length > 0);
    if (!conFaltantes.length) {
        contenedor.style.display = "none";
        contenedor.innerHTML = "";
        return;
    }
    const total = conFaltantes.reduce((a, f) => a + f.sinGeneroNombres.length, 0);
    contenedor.innerHTML = `
        <div class="aviso-genero">
            ⚠️ <strong>${total} estudiante(s)</strong> no tienen el campo "Género" lleno en "Información de estudiantes".
            Los totales de APROBADOS/REPROBADOS/SIN CALIFICACIONES ya son correctos, pero el desglose M/F de ellos
            no aparece hasta que les completes el género (Panel Admin → Información de estudiantes → columna "Género").
            Este aviso no sale en el cuadro impreso ni en el PDF.
            ${conFaltantes.map((f) => `
                <div style="margin-top:8px;">
                    <strong>${escapeHtml(f.etiqueta)}:</strong> ${f.sinGeneroNombres.map(escapeHtml).join(", ")}
                </div>
            `).join("")}
        </div>`;
    contenedor.style.display = "block";
}

// =========================================================
// 6) GENERAR CUADRO
// =========================================================

btnGenerar.addEventListener("click", async () => {
    const materia = selectMateria.value;
    const trimestre = selectTrimestre.value;
    const salonesSeleccionados = Array.from(document.querySelectorAll(".chkSalon:checked")).map((c) => c.value);

    if (!materia) return alert("Selecciona una asignatura.");
    if (!salonesSeleccionados.length) return alert("Selecciona al menos un grado/salón.");

    btnGenerar.disabled = true;
    estadoGeneracion.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Calculando...`;

    try {
        const filas = [];
        for (const salon of salonesSeleccionados) {
            const datos = await calcularDatosSalon(salon, materia, trimestre, mapaSalones);
            filas.push(datos);
        }

        const datosEncabezado = {
            materia,
            trimestre,
            anio: inputAnio.value || new Date().getFullYear(),
            jornada: selectJornada.value || "—",
            nombreProfesor,
            mapaSalones,
        };

        contenidoReporte.innerHTML = `
            ${construirEncabezadoHtml(filas, datosEncabezado)}
            ${construirTablaHtml(filas)}
            ${esMismaMateria(materia, "Informática") ? "" : construirTablaRiesgoHtml(filas, PROMEDIO_MINIMO_APROBAR)}
            ${construirNotasHtml(filas)}
        `;
        mostrarAvisoGenero(filas);
        bloqueReporte.style.display = "block";
        bloqueReporte.scrollIntoView({ behavior: "smooth", block: "start" });
        estadoGeneracion.textContent = "";
    } catch (err) {
        console.error(err);
        alert("No se pudo generar el cuadro: " + err.message);
        estadoGeneracion.textContent = "";
    } finally {
        btnGenerar.disabled = false;
    }
});

// =========================================================
// 7) EXPORTAR A PDF (mismo método que profesor.js: html2canvas + jsPDF,
//    A4 horizontal, para que quede idéntico a lo que se ve en pantalla)
// =========================================================

btnPdf.addEventListener("click", async () => {
    if (!contenidoReporte.innerHTML.trim()) return alert("Primero genera el cuadro.");
    btnPdf.disabled = true;
    const textoOriginal = btnPdf.innerHTML;
    btnPdf.innerHTML = "⏳ Generando PDF...";
    try {
        if (document.fonts && document.fonts.ready) await document.fonts.ready;
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

        const canvas = await html2canvas(contenidoReporte, { scale: 2.5, backgroundColor: "#ffffff" });
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const ratio = Math.min((pageWidth - 24) / canvas.width, (pageHeight - 24) / canvas.height);
        const w = canvas.width * ratio;
        const h = canvas.height * ratio;
        pdf.addImage(canvas.toDataURL("image/jpeg", 1.0), "JPEG", (pageWidth - w) / 2, (pageHeight - h) / 2, w, h);
        const materia = selectMateria.value.replace(/\s+/g, "_");
        pdf.save(`Cuadro_Aprobados_${materia}_${selectTrimestre.value.replace(/\s+/g, "_")}.pdf`);
    } catch (err) {
        console.error(err);
        alert("No se pudo generar el PDF: " + err.message);
    } finally {
        btnPdf.disabled = false;
        btnPdf.innerHTML = textoOriginal;
    }
});

btnImprimir.addEventListener("click", () => {
    if (!contenidoReporte.innerHTML.trim()) return alert("Primero genera el cuadro.");
    window.print();
});

// =========================================================
// 8) INICIO
// =========================================================

(async function init() {
    const ok = await verificarSesion();
    if (!ok) return;
    await cargarCatalogoSalones();
    poblarSelectMateria();
    if (inputAnio) inputAnio.value = new Date().getFullYear();
})();
