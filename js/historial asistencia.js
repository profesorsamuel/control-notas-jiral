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

// =========================================================
// 3) DATOS EN MEMORIA
// =========================================================

let todasAsistencias = [];       // filas de "asistencias" (cabeceras), sin filtrar
let mapaNombresProfesor = {};    // correo_profesor -> nombre_profesor

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
