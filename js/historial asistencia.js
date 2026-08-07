import { supabase } from "./supabase.js";
import { pintarCambiarPanel } from "./roles.js";

// =========================================================
// UTILIDADES
// =========================================================

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

const TEXTO_ESTADO = {
    presente: "🟢 Presente",
    ausente: "🔴 Ausente",
    tardanza: "🟡 Tardanza",
    permiso: "🔵 Permiso",
};

// Versión sin emoji, para PDF/Excel/CSV (las fuentes estándar de PDF no
// dibujan emojis correctamente).
const TEXTO_ESTADO_PLANO = {
    presente: "Presente",
    ausente: "Ausente",
    tardanza: "Tardanza",
    permiso: "Permiso",
};

// ⚠️ AJUSTA ESTOS DOS VALORES a los datos reales de tu colegio.
const NOMBRE_COLEGIO = "Nombre del Colegio";
const LOGO_URL = "logo-colegio.png"; // ruta o URL pública del logo (PNG/JPG)

function formatearFechaLarga(fechaISO) {
    // fechaISO viene como "2026-08-07" (columna date de Postgres)
    const [y, m, d] = fechaISO.split("-").map(Number);
    const fecha = new Date(y, m - 1, d);
    return fecha.toLocaleDateString("es-PA", { year: "numeric", month: "long", day: "numeric" });
}

// =========================================================
// 1) VERIFICAR SESIÓN Y QUE SEA ADMINISTRADOR
// =========================================================
// ⚠️ AJUSTA ESTO a como tu proyecto identifica administradores hoy
// (por ejemplo una tabla "admins", o un campo "rol" en "usuarios").
// Aquí solo se valida que haya sesión iniciada; el resto queda como
// punto explícito para que lo conectes con tu lógica real de roles.

let correoAdmin = "";

async function verificarSesionAdmin() {
    const { data: { user }, error: errUser } = await supabase.auth.getUser();

    if (errUser || !user) {
        window.location.href = "login.html";
        return false;
    }

    correoAdmin = (user.email || "").trim().toLowerCase();

    // TODO: reemplazar por tu verificación real de rol admin, ej.:
    // const { data: perfil } = await supabase.from("usuarios").select("rol").eq("correo", correoAdmin).maybeSingle();
    // if (perfil?.rol !== "admin") { window.location.href = "login.html"; return false; }

    return true;
}

// =========================================================
// 2) ELEMENTOS DE LA PÁGINA
// =========================================================

const filtroFecha = document.getElementById("filtroFecha");
const filtroSalon = document.getElementById("filtroSalon");
const filtroMateria = document.getElementById("filtroMateria");
const filtroProfesor = document.getElementById("filtroProfesor");
const btnLimpiarFiltros = document.getElementById("btnLimpiarFiltros");

const estadoHistorial = document.getElementById("estadoHistorial");
const cuerpoTablaHistorial = document.getElementById("cuerpoTablaHistorial");

const panelDetalle = document.getElementById("panelDetalle");
const detalleFecha = document.getElementById("detalleFecha");
const detalleMateria = document.getElementById("detalleMateria");
const detalleSalon = document.getElementById("detalleSalon");
const detalleProfesor = document.getElementById("detalleProfesor");
const cuerpoTablaDetalle = document.getElementById("cuerpoTablaDetalle");
const btnCerrarDetalle = document.getElementById("btnCerrarDetalle");

const btnExportar = document.getElementById("btnExportar");
const opcionesExportar = document.getElementById("opcionesExportar");
const btnExportarPDF = document.getElementById("btnExportarPDF");
const btnExportarExcel = document.getElementById("btnExportarExcel");
const btnExportarCSV = document.getElementById("btnExportarCSV");

// =========================================================
// 3) DATOS EN MEMORIA
// =========================================================

let todasAsistencias = [];       // filas de "asistencias" (cabeceras), sin filtrar
let mapaNombresProfesor = {};    // correo_profesor -> nombre_profesor

let asistenciaActual = null;     // cabecera de la asistencia con el detalle abierto
let detalleActual = [];          // filas de asistencia_detalle de esa asistencia

// =========================================================
// 4) CARGA INICIAL
// =========================================================

async function cargarTodo() {
    estadoHistorial.textContent = "Cargando historial...";

    const [{ data: asistencias, error: errAsistencias }, { data: profesores, error: errProfesores }] =
        await Promise.all([
            supabase
                .from("asistencias")
                .select("id, correo_profesor, materia, salon, fecha")
                .order("fecha", { ascending: false }),
            supabase
                .from("profesores")
                .select("correo_profesor, nombre_profesor"),
        ]);

    if (errAsistencias) {
        console.error("❌ Error al cargar historial:", errAsistencias);
        estadoHistorial.textContent = "Error al cargar el historial.";
        return;
    }

    if (!errProfesores && profesores) {
        mapaNombresProfesor = Object.fromEntries(
            profesores.map((p) => [p.correo_profesor, p.nombre_profesor])
        );
    }

    todasAsistencias = asistencias || [];

    construirOpcionesFiltros();
    aplicarFiltros();
}

function nombreProfesorDe(correo) {
    return mapaNombresProfesor[correo] || correo;
}

// =========================================================
// 5) FILTROS
// =========================================================

function valoresUnicos(lista, campo) {
    return [...new Set(lista.map((a) => a[campo]).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "es")
    );
}

function construirOpcionesFiltros() {
    const salones = valoresUnicos(todasAsistencias, "salon");
    const materias = valoresUnicos(todasAsistencias, "materia");
    const correosProfesor = valoresUnicos(todasAsistencias, "correo_profesor");

    filtroSalon.innerHTML =
        `<option value="">Todos los salones</option>` +
        salones.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");

    filtroMateria.innerHTML =
        `<option value="">Todas las materias</option>` +
        materias.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");

    filtroProfesor.innerHTML =
        `<option value="">Todos los profesores</option>` +
        correosProfesor
            .map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(nombreProfesorDe(c))}</option>`)
            .join("");
}

function aplicarFiltros() {
    const fecha = filtroFecha.value;       // "" o "2026-08-07"
    const salon = filtroSalon.value;
    const materia = filtroMateria.value;
    const correoProfesor = filtroProfesor.value;

    const filtradas = todasAsistencias.filter((a) => {
        if (fecha && a.fecha !== fecha) return false;
        if (salon && a.salon !== salon) return false;
        if (materia && a.materia !== materia) return false;
        if (correoProfesor && a.correo_profesor !== correoProfesor) return false;
        return true;
    });

    renderTablaHistorial(filtradas);
}

btnLimpiarFiltros.addEventListener("click", () => {
    filtroFecha.value = "";
    filtroSalon.value = "";
    filtroMateria.value = "";
    filtroProfesor.value = "";
    aplicarFiltros();
});

[filtroFecha, filtroSalon, filtroMateria, filtroProfesor].forEach((el) =>
    el.addEventListener("change", aplicarFiltros)
);

// =========================================================
// 6) TABLA DE RESULTADOS
// =========================================================

function renderTablaHistorial(lista) {
    if (lista.length === 0) {
        cuerpoTablaHistorial.innerHTML = `<tr><td colspan="5">No hay asistencias con estos filtros.</td></tr>`;
        estadoHistorial.textContent = "";
        return;
    }

    cuerpoTablaHistorial.innerHTML = lista.map((a) => `
        <tr>
            <td>${escapeHtml(formatearFechaLarga(a.fecha))}</td>
            <td>${escapeHtml(a.materia)}</td>
            <td>${escapeHtml(a.salon)}</td>
            <td>${escapeHtml(nombreProfesorDe(a.correo_profesor))}</td>
            <td>
                <button type="button" class="btn-tomar-asistencia btn-ver-detalle" data-id="${escapeHtml(a.id)}">
                    👁️ Ver detalle
                </button>
            </td>
        </tr>
    `).join("");

    estadoHistorial.textContent = `${lista.length} registro(s).`;

    cuerpoTablaHistorial.querySelectorAll(".btn-ver-detalle").forEach((btn) => {
        btn.addEventListener("click", () => abrirDetalleAsistencia(btn.dataset.id));
    });
}

// =========================================================
// 7) DETALLE DE UNA ASISTENCIA (carga EXACTA de ese día)
// =========================================================
// Consulta filtrada estrictamente por asistencia_id, y el resultado
// REEMPLAZA por completo el contenido anterior del panel (nunca se
// agrega a lo que ya había), así que no hay riesgo de arrastrar datos
// de una fecha anterior ni de duplicar filas.

async function abrirDetalleAsistencia(asistenciaId) {
    // Limpio primero cualquier detalle previo.
    cuerpoTablaDetalle.innerHTML = `<tr><td colspan="4">Cargando...</td></tr>`;
    panelDetalle.style.display = "block";

    const cabecera = todasAsistencias.find((a) => a.id === asistenciaId);
    if (cabecera) {
        detalleFecha.textContent = formatearFechaLarga(cabecera.fecha);
        detalleMateria.textContent = cabecera.materia;
        detalleSalon.textContent = cabecera.salon;
        detalleProfesor.textContent = nombreProfesorDe(cabecera.correo_profesor);
    }

    const { data: detalle, error } = await supabase
        .from("asistencia_detalle")
        .select("id, estado, observacion, justificacion, adjunto_url, estudiantes ( nombre, codigo )")
        .eq("asistencia_id", asistenciaId);

    if (error) {
        console.error("❌ Error al cargar detalle de asistencia:", error);
        cuerpoTablaDetalle.innerHTML = `<tr><td colspan="4" style="color:#dc3545;">Error al cargar el detalle.</td></tr>`;
        return;
    }

    const filas = (detalle || []).sort((a, b) =>
        (a.estudiantes?.nombre || "").localeCompare(b.estudiantes?.nombre || "", "es")
    );

    // Se guardan para que exportarPDF/exportarExcel/exportarCSV trabajen
    // exactamente sobre lo que está mostrado en pantalla.
    asistenciaActual = cabecera || null;
    detalleActual = filas;

    if (filas.length === 0) {
        cuerpoTablaDetalle.innerHTML = `<tr><td colspan="4">No hay estudiantes registrados en esta asistencia.</td></tr>`;
        return;
    }

    cuerpoTablaDetalle.innerHTML = filas.map((f) => `
        <tr>
            <td>${escapeHtml(f.estudiantes?.nombre || "—")}</td>
            <td>${escapeHtml(TEXTO_ESTADO[f.estado] || f.estado)}</td>
            <td>${escapeHtml(f.observacion || "")}${f.justificacion ? `<br><em>${escapeHtml(f.justificacion)}</em>` : ""}</td>
            <td>${f.adjunto_url ? `<a href="${escapeHtml(f.adjunto_url)}" target="_blank" rel="noopener">Ver adjunto</a>` : "—"}</td>
        </tr>
    `).join("");
}

btnCerrarDetalle.addEventListener("click", () => {
    panelDetalle.style.display = "none";
    cuerpoTablaDetalle.innerHTML = "";
    opcionesExportar.style.display = "none";
    asistenciaActual = null;
    detalleActual = [];
});

// =========================================================
// 8) EXPORTAR (PDF / Excel / CSV)
// =========================================================
// Exporta exactamente la asistencia abierta en el panel de detalle
// (asistenciaActual + detalleActual). Las librerías se cargan solo
// cuando el profesor realmente exporta (no en cada carga de página).

function calcularResumen(filas) {
    const resumen = { presente: 0, ausente: 0, tardanza: 0, permiso: 0, total: filas.length };
    filas.forEach((f) => {
        if (resumen[f.estado] !== undefined) resumen[f.estado]++;
    });
    return resumen;
}

function nombreBaseArchivo(extension) {
    return `asistencia_${asistenciaActual.salon}_${asistenciaActual.materia}_${asistenciaActual.fecha}.${extension}`
        .replace(/\s+/g, "_");
}

async function cargarImagenBase64(url) {
    const respuesta = await fetch(url);
    if (!respuesta.ok) throw new Error(`No se pudo cargar el logo (${respuesta.status})`);
    const blob = await respuesta.blob();
    return await new Promise((resolve, reject) => {
        const lector = new FileReader();
        lector.onload = () => resolve(lector.result);
        lector.onerror = reject;
        lector.readAsDataURL(blob);
    });
}

async function exportarPDF() {
    if (!asistenciaActual) return;

    const { jsPDF } = await import("https://cdn.jsdelivr.net/npm/jspdf@2.5.2/+esm");
    const autoTable = (await import("https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/+esm")).default;

    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const margenIzq = 40;
    let y = 40;

    // Logo (si no se puede cargar, se sigue sin él para no bloquear el PDF)
    try {
        const logoBase64 = await cargarImagenBase64(LOGO_URL);
        doc.addImage(logoBase64, "PNG", margenIzq, y, 55, 55);
    } catch (e) {
        console.warn("⚠️ No se pudo incluir el logo en el PDF:", e);
    }

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(NOMBRE_COLEGIO, margenIzq + 70, y + 18);

    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text("Reporte de asistencia", margenIzq + 70, y + 36);

    y += 75;

    doc.setFontSize(11);
    const info = [
        ["Profesor:", nombreProfesorDe(asistenciaActual.correo_profesor)],
        ["Materia:", asistenciaActual.materia],
        ["Fecha:", formatearFechaLarga(asistenciaActual.fecha)],
        ["Salón:", asistenciaActual.salon],
    ];
    info.forEach(([etiqueta, valor]) => {
        doc.setFont("helvetica", "bold");
        doc.text(etiqueta, margenIzq, y);
        doc.setFont("helvetica", "normal");
        doc.text(String(valor), margenIzq + 70, y);
        y += 16;
    });

    y += 8;

    const resumen = calcularResumen(detalleActual);
    doc.setFont("helvetica", "bold");
    doc.text("Resumen", margenIzq, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    [
        `Total estudiantes: ${resumen.total}`,
        `Presentes: ${resumen.presente}`,
        `Ausentes: ${resumen.ausente}`,
        `Tardanzas: ${resumen.tardanza}`,
        `Permisos: ${resumen.permiso}`,
    ].forEach((linea) => {
        doc.text(linea, margenIzq, y);
        y += 14;
    });

    y += 10;
    doc.setFont("helvetica", "bold");
    doc.text("Lista completa", margenIzq, y);
    y += 8;

    autoTable(doc, {
        startY: y,
        margin: { left: margenIzq, right: margenIzq },
        head: [["Estudiante", "Estado", "Observación / Justificación"]],
        body: detalleActual.map((f) => [
            f.estudiantes?.nombre || "—",
            TEXTO_ESTADO_PLANO[f.estado] || f.estado,
            [f.observacion, f.justificacion].filter(Boolean).join(" — ") || "—",
        ]),
        styles: { fontSize: 10 },
        headStyles: { fillColor: [40, 40, 40] },
    });

    doc.save(nombreBaseArchivo("pdf"));
}

async function exportarExcel() {
    if (!asistenciaActual) return;

    const XLSX = await import("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm");
    const resumen = calcularResumen(detalleActual);

    const filas = [
        [NOMBRE_COLEGIO],
        ["Reporte de asistencia"],
        [],
        ["Profesor", nombreProfesorDe(asistenciaActual.correo_profesor)],
        ["Materia", asistenciaActual.materia],
        ["Fecha", formatearFechaLarga(asistenciaActual.fecha)],
        ["Salón", asistenciaActual.salon],
        [],
        ["Resumen"],
        ["Total estudiantes", resumen.total],
        ["Presentes", resumen.presente],
        ["Ausentes", resumen.ausente],
        ["Tardanzas", resumen.tardanza],
        ["Permisos", resumen.permiso],
        [],
        ["Lista completa"],
        ["Estudiante", "Estado", "Observación", "Justificación"],
        ...detalleActual.map((f) => [
            f.estudiantes?.nombre || "—",
            TEXTO_ESTADO_PLANO[f.estado] || f.estado,
            f.observacion || "",
            f.justificacion || "",
        ]),
    ];

    const hoja = XLSX.utils.aoa_to_sheet(filas);
    hoja["!cols"] = [{ wch: 28 }, { wch: 14 }, { wch: 30 }, { wch: 30 }];

    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Asistencia");
    XLSX.writeFile(libro, nombreBaseArchivo("xlsx"));
}

function exportarCSV() {
    if (!asistenciaActual) return;

    const resumen = calcularResumen(detalleActual);

    const filas = [
        [NOMBRE_COLEGIO],
        ["Reporte de asistencia"],
        [],
        ["Profesor", nombreProfesorDe(asistenciaActual.correo_profesor)],
        ["Materia", asistenciaActual.materia],
        ["Fecha", formatearFechaLarga(asistenciaActual.fecha)],
        ["Salón", asistenciaActual.salon],
        [],
        ["Resumen"],
        ["Total estudiantes", resumen.total],
        ["Presentes", resumen.presente],
        ["Ausentes", resumen.ausente],
        ["Tardanzas", resumen.tardanza],
        ["Permisos", resumen.permiso],
        [],
        ["Lista completa"],
        ["Estudiante", "Estado", "Observación", "Justificación"],
        ...detalleActual.map((f) => [
            f.estudiantes?.nombre || "—",
            TEXTO_ESTADO_PLANO[f.estado] || f.estado,
            f.observacion || "",
            f.justificacion || "",
        ]),
    ];

    const escaparCeldaCSV = (valor) => {
        const texto = String(valor ?? "");
        return /[",\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
    };

    const contenidoCSV = filas.map((fila) => fila.map(escaparCeldaCSV).join(",")).join("\n");

    // BOM al inicio para que Excel abra bien los acentos en UTF-8.
    const blob = new Blob(["\uFEFF" + contenidoCSV], { type: "text/csv;charset=utf-8;" });
    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(blob);
    enlace.download = nombreBaseArchivo("csv");
    enlace.click();
    URL.revokeObjectURL(enlace.href);
}

btnExportar.addEventListener("click", () => {
    if (!asistenciaActual) return;
    opcionesExportar.style.display = opcionesExportar.style.display === "none" ? "block" : "none";
});

btnExportarPDF.addEventListener("click", async () => {
    opcionesExportar.style.display = "none";
    try {
        await exportarPDF();
    } catch (e) {
        console.error("❌ Error al exportar PDF:", e);
        alert("Ocurrió un error al generar el PDF.");
    }
});

btnExportarExcel.addEventListener("click", async () => {
    opcionesExportar.style.display = "none";
    try {
        await exportarExcel();
    } catch (e) {
        console.error("❌ Error al exportar Excel:", e);
        alert("Ocurrió un error al generar el Excel.");
    }
});

btnExportarCSV.addEventListener("click", () => {
    opcionesExportar.style.display = "none";
    try {
        exportarCSV();
    } catch (e) {
        console.error("❌ Error al exportar CSV:", e);
        alert("Ocurrió un error al generar el CSV.");
    }
});

// =========================================================
// INICIO
// =========================================================

(async function init() {
    const ok = await verificarSesionAdmin();
    if (!ok) return;

    pintarCambiarPanel("admin", "oscuro-sobre-claro");
    await cargarTodo();
})();
