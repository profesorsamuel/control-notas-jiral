import { supabase } from "./supabase.js";

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// =========================================================
// SESIÓN Y MATERIAS/SALONES DEL PROFESOR
// (combina profesor_materias + horario_profesor)
// =========================================================

let correoProfesor = "";
let nombreProfesor = "";
let misMateriasSalones = []; // [{materia, salon}, ...] sin duplicados

async function verificarSesion() {
    const { data: { user }, error: errUser } = await supabase.auth.getUser();
    if (errUser || !user) { window.location.href = "login.html"; return false; }

    correoProfesor = (user.email || "").trim().toLowerCase();

    const [{ data: materias }, { data: bloques }, { data: perfilProfesor }] = await Promise.all([
        supabase.from("profesor_materias").select("materia, salon").eq("correo_profesor", correoProfesor),
        supabase.from("horario_profesor").select("materia, salon").eq("correo_profesor", correoProfesor).eq("tipo", "clase"),
        supabase.from("profesores").select("nombre_profesor").eq("correo_profesor", correoProfesor).maybeSingle(),
    ]);

    nombreProfesor = perfilProfesor?.nombre_profesor || correoProfesor;

    const combinadas = [...(materias || []), ...(bloques || [])].filter((m) => m.materia && m.salon);
    const vistos = new Set();
    misMateriasSalones = combinadas.filter((m) => {
        const clave = `${m.materia}|${m.salon}`;
        if (vistos.has(clave)) return false;
        vistos.add(clave);
        return true;
    });

    if (misMateriasSalones.length === 0) {
        alert("⛔ Esta cuenta no tiene materias asignadas como docente. Contacta al administrador.");
        window.location.href = "login.html";
        return false;
    }

    return true;
}

// =========================================================
// ELEMENTOS
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
const btnExportar = document.getElementById("btnExportar");
const opcionesExportar = document.getElementById("opcionesExportar");
const btnExportarPDF = document.getElementById("btnExportarPDF");
const btnExportarExcel = document.getElementById("btnExportarExcel");
const btnExportarCSV = document.getElementById("btnExportarCSV");
const btnCerrarDetalle = document.getElementById("btnCerrarDetalle");

// El filtro de "Profesor" no aplica aquí: el profesor solo ve lo suyo.
const bloqueFiltroProfesor = filtroProfesor?.closest("div");
if (bloqueFiltroProfesor) bloqueFiltroProfesor.style.display = "none";

// =========================================================
// POBLAR FILTROS DE SALÓN / MATERIA (solo lo que da este profesor)
// =========================================================

function poblarFiltros() {
    const salones = [...new Set(misMateriasSalones.map((m) => m.salon))].sort();
    filtroSalon.innerHTML = `<option value="">Todos los salones</option>` +
        salones.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");

    const materias = [...new Set(misMateriasSalones.map((m) => m.materia))].sort();
    filtroMateria.innerHTML = `<option value="">Todas las materias</option>` +
        materias.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
}

// =========================================================
// BUSCAR Y PINTAR LA LISTA
// =========================================================

let cabecerasCache = []; // resultado de la última búsqueda, para abrir detalle sin reconsultar

async function buscarHistorial() {
    estadoHistorial.textContent = "Buscando...";
    cuerpoTablaHistorial.innerHTML = "";
    panelDetalle.style.display = "none";

    let consulta = supabase
        .from("asistencias")
        .select("id, fecha, materia, salon, notas_profesor")
        .eq("correo_profesor", correoProfesor)
        .order("fecha", { ascending: false })
        .limit(100);

    if (filtroFecha.value) consulta = consulta.eq("fecha", filtroFecha.value);
    if (filtroSalon.value) consulta = consulta.eq("salon", filtroSalon.value);
    if (filtroMateria.value) consulta = consulta.eq("materia", filtroMateria.value);

    const { data, error } = await consulta;

    if (error) {
        estadoHistorial.textContent = "❌ Error al buscar: " + error.message;
        return;
    }

    cabecerasCache = data || [];

    if (cabecerasCache.length === 0) {
        estadoHistorial.textContent = "No hay asistencias que coincidan con estos filtros.";
        return;
    }

    estadoHistorial.textContent = `${cabecerasCache.length} resultado(s).`;

    cuerpoTablaHistorial.innerHTML = cabecerasCache.map((fila) => {
        const fechaTexto = new Date(fila.fecha + "T00:00:00").toLocaleDateString("es-PA", { year: "numeric", month: "short", day: "numeric" });
        return `
        <tr>
            <td>${escapeHtml(fechaTexto)}</td>
            <td>${escapeHtml(fila.materia)}</td>
            <td>${escapeHtml(fila.salon)}</td>
            <td>${escapeHtml(nombreProfesor)}</td>
            <td><button type="button" class="btn-tomar-asistencia btn-ver-detalle" data-id="${fila.id}">Ver detalle</button></td>
        </tr>`;
    }).join("");

    cuerpoTablaHistorial.querySelectorAll(".btn-ver-detalle").forEach((btn) => {
        btn.addEventListener("click", () => abrirDetalle(btn.dataset.id));
    });
}

filtroFecha.addEventListener("change", buscarHistorial);
filtroSalon.addEventListener("change", buscarHistorial);
filtroMateria.addEventListener("change", buscarHistorial);

btnLimpiarFiltros.addEventListener("click", () => {
    filtroFecha.value = "";
    filtroSalon.value = "";
    filtroMateria.value = "";
    buscarHistorial();
});

// =========================================================
// ABRIR EL DETALLE DE UNA ASISTENCIA
// =========================================================

const ETIQUETAS_ESTADO = {
    presente: "🟢 Presente",
    ausente: "🔴 Ausente",
    tardanza: "🟡 Tardanza",
    permiso: "🔵 Permiso",
};

let detalleActualCache = { fila: null, estudiantes: [] }; // para exportar sin reconsultar

async function abrirDetalle(asistenciaId) {
    const fila = cabecerasCache.find((c) => c.id === asistenciaId);
    if (!fila) return;

    const { data: detalle, error } = await supabase
        .from("asistencia_detalle")
        .select("estudiante_id, estado, observacion, justificacion, adjunto_url")
        .eq("asistencia_id", asistenciaId);

    if (error) {
        alert("❌ Error al cargar el detalle: " + error.message);
        return;
    }

    const idsEstudiantes = (detalle || []).map((d) => d.estudiante_id);
    const { data: estudiantes } = await supabase
        .from("estudiantes")
        .select("id, nombre")
        .in("id", idsEstudiantes.length > 0 ? idsEstudiantes : ["00000000-0000-0000-0000-000000000000"]);

    const nombrePorId = Object.fromEntries((estudiantes || []).map((e) => [e.id, e.nombre]));

    const filasOrdenadas = [...(detalle || [])].sort((a, b) =>
        (nombrePorId[a.estudiante_id] || "").localeCompare(nombrePorId[b.estudiante_id] || "")
    );

    detalleActualCache = { fila, filasOrdenadas, nombrePorId };

    const fechaTexto = new Date(fila.fecha + "T00:00:00").toLocaleDateString("es-PA", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    detalleFecha.textContent = fechaTexto;
    detalleMateria.textContent = fila.materia;
    detalleSalon.textContent = fila.salon;
    detalleProfesor.textContent = nombreProfesor;

    cuerpoTablaDetalle.innerHTML = filasOrdenadas.map((d) => {
        const obsJust = [d.observacion, d.justificacion].filter(Boolean).join(" — ");
        return `
        <tr>
            <td>${escapeHtml(nombrePorId[d.estudiante_id] || d.estudiante_id)}</td>
            <td>${ETIQUETAS_ESTADO[d.estado] || escapeHtml(d.estado)}</td>
            <td>${escapeHtml(obsJust || "—")}</td>
            <td>${d.adjunto_url ? `<a href="${d.adjunto_url}" target="_blank" rel="noopener">Ver</a>` : "—"}</td>
        </tr>`;
    }).join("");

    panelDetalle.style.display = "block";
    panelDetalle.scrollIntoView({ behavior: "smooth" });
}

btnCerrarDetalle.addEventListener("click", () => {
    panelDetalle.style.display = "none";
    opcionesExportar.style.display = "none";
});

// =========================================================
// EXPORTAR (PDF / Excel / CSV) — del detalle abierto actualmente
// =========================================================

btnExportar.addEventListener("click", () => {
    opcionesExportar.style.display = opcionesExportar.style.display === "none" ? "block" : "none";
});

function nombreArchivoBase() {
    const { fila } = detalleActualCache;
    return `asistencia_${fila.materia}_${fila.salon}_${fila.fecha}`.replace(/\s+/g, "_");
}

btnExportarCSV.addEventListener("click", () => {
    const { filasOrdenadas, nombrePorId } = detalleActualCache;
    if (!filasOrdenadas) return;

    const encabezados = ["Estudiante", "Estado", "Observación", "Justificación"];
    const filasCsv = filasOrdenadas.map((d) => [
        nombrePorId[d.estudiante_id] || d.estudiante_id,
        d.estado,
        d.observacion || "",
        d.justificacion || "",
    ]);

    const csv = [encabezados, ...filasCsv]
        .map((fila) => fila.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(","))
        .join("\n");

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(blob);
    enlace.download = `${nombreArchivoBase()}.csv`;
    enlace.click();
    URL.revokeObjectURL(enlace.href);
    opcionesExportar.style.display = "none";
});

btnExportarPDF.addEventListener("click", async () => {
    const { fila, filasOrdenadas, nombrePorId } = detalleActualCache;
    if (!filasOrdenadas) return;

    try {
        const { jsPDF } = await import("https://esm.sh/jspdf@2.5.1");
        await import("https://esm.sh/jspdf-autotable@3.8.2");

        const doc = new jsPDF();
        doc.setFontSize(14);
        doc.text(`Asistencia — ${fila.materia} / ${fila.salon}`, 14, 15);
        doc.setFontSize(10);
        doc.text(`Fecha: ${fila.fecha}   Profesor: ${nombreProfesor}`, 14, 22);

        doc.autoTable({
            head: [["Estudiante", "Estado", "Observación", "Justificación"]],
            body: filasOrdenadas.map((d) => [
                nombrePorId[d.estudiante_id] || d.estudiante_id,
                d.estado,
                d.observacion || "",
                d.justificacion || "",
            ]),
            startY: 28,
            styles: { fontSize: 8 },
        });

        doc.save(`${nombreArchivoBase()}.pdf`);
    } catch (error) {
        console.error("❌ Error al exportar PDF:", error);
        alert("No se pudo generar el PDF. Revisa tu conexión e intenta de nuevo.");
    }
    opcionesExportar.style.display = "none";
});

btnExportarExcel.addEventListener("click", async () => {
    const { filasOrdenadas, nombrePorId } = detalleActualCache;
    if (!filasOrdenadas) return;

    try {
        const XLSX = await import("https://esm.sh/xlsx@0.18.5");

        const encabezados = ["Estudiante", "Estado", "Observación", "Justificación"];
        const filas = filasOrdenadas.map((d) => [
            nombrePorId[d.estudiante_id] || d.estudiante_id,
            d.estado,
            d.observacion || "",
            d.justificacion || "",
        ]);

        const hoja = XLSX.utils.aoa_to_sheet([encabezados, ...filas]);
        const libro = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(libro, hoja, "Asistencia");
        XLSX.writeFile(libro, `${nombreArchivoBase()}.xlsx`);
    } catch (error) {
        console.error("❌ Error al exportar Excel:", error);
        alert("No se pudo generar el Excel. Revisa tu conexión e intenta de nuevo.");
    }
    opcionesExportar.style.display = "none";
});

// =========================================================
// INICIO
// =========================================================

(async function init() {
    const ok = await verificarSesion();
    if (!ok) return;

    poblarFiltros();

    // Si vienen desde un enlace con fecha/salon/materia en la URL, precargar.
    const parametros = new URLSearchParams(window.location.search);
    if (parametros.get("fecha")) filtroFecha.value = parametros.get("fecha");
    if (parametros.get("salon")) filtroSalon.value = parametros.get("salon");
    if (parametros.get("materia")) filtroMateria.value = parametros.get("materia");

    await buscarHistorial();
})();
