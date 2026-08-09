import { supabase } from "./supabase.js";
import { obtenerRolesDeCuenta } from "./roles.js";

// =========================================================
// Monitor del administrador: permite ver, para CUALQUIER
// salón (sin importar qué profesor lo dicta), el horario
// completo y el avance de las tareas asignadas — con
// actualización automática cada 30s para que el admin siempre
// vea el estado más reciente sin tener que refrescar la página.
// =========================================================

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function formatearFecha(fechaTexto) {
    if (!fechaTexto) return "sin fecha";
    const [anio, mes, dia] = fechaTexto.split("-");
    return `${dia}/${mes}/${anio}`;
}

const selectSalon = document.getElementById("selectSalon");
const btnActualizar = document.getElementById("btnActualizar");
const textoActualizado = document.getElementById("textoActualizado");
const iframeHorario = document.getElementById("iframeHorario");
const listaTareas = document.getElementById("listaTareas");

const overlayDetalle = document.getElementById("overlayDetalle");
const btnCerrarDetalle = document.getElementById("btnCerrarDetalle");
const detalleTitulo = document.getElementById("detalleTitulo");
const detalleSubt = document.getElementById("detalleSubt");
const detalleLista = document.getElementById("detalleLista");
const estadoDetalle = document.getElementById("estadoDetalle");

let salonActual = "";
let intervaloActualizacion = null;
let tareaDetalleActual = null;

// =========================================================
// 1) VERIFICAR QUE LA CUENTA SEA ADMIN
// =========================================================

async function verificarAdmin() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
        window.location.href = "login.html";
        return false;
    }

    const { esAdmin } = await obtenerRolesDeCuenta(user.id, user.email);
    if (!esAdmin) {
        alert("⛔ Esta página es solo para administradores.");
        window.location.href = "login.html";
        return false;
    }
    return true;
}

// =========================================================
// 2) CARGAR LISTA DE SALONES
// =========================================================

async function cargarSalones() {
    const { data, error } = await supabase
        .from("estudiantes")
        .select("salon")
        .eq("es_prueba", false);

    if (error) {
        console.error("❌ Error al cargar salones:", error);
        selectSalon.innerHTML = `<option value="">Error al cargar salones</option>`;
        return;
    }

    const salones = [...new Set((data || []).map(e => e.salon).filter(Boolean))].sort();

    if (salones.length === 0) {
        selectSalon.innerHTML = `<option value="">No hay salones</option>`;
        return;
    }

    selectSalon.innerHTML = `<option value="">Selecciona un salón</option>` +
        salones.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
}

// =========================================================
// 3) HORARIO (reutiliza horario_semanal.html en un iframe)
// =========================================================

function cargarHorario(salon) {
    iframeHorario.src = `horario_semanal.html?salon=${encodeURIComponent(salon)}`;
}

// =========================================================
// 4) TAREAS DEL SALÓN
// =========================================================

async function cargarTareas(salon) {
    const { data: tareas, error: errTareas } = await supabase
        .from("tasks")
        .select("*")
        .eq("salon", salon)
        .order("created_at", { ascending: false });

    if (errTareas) {
        console.error("❌ Error al cargar tareas:", errTareas);
        listaTareas.innerHTML = `<p class="text-center text-danger py-4">Error al cargar tareas.</p>`;
        return;
    }

    if (!tareas || tareas.length === 0) {
        listaTareas.innerHTML = `<p class="text-center text-muted py-4">Este salón no tiene tareas asignadas todavía.</p>`;
        return;
    }

    const idsTareas = tareas.map(t => t.id);
    const { data: asignaciones, error: errAsig } = await supabase
        .from("task_assignments")
        .select("task_id, estado")
        .in("task_id", idsTareas);

    if (errAsig) {
        console.error("❌ Error al cargar asignaciones:", errAsig);
    }

    listaTareas.innerHTML = tareas.map(tarea => {
        const propias = (asignaciones || []).filter(a => a.task_id === tarea.id);
        const total = propias.length;
        const terminadas = propias.filter(a => a.estado === "terminada").length;
        const porcentaje = total > 0 ? Math.round((terminadas / total) * 100) : 0;

        return `
        <div class="tarjeta-tarea" data-detalle="${tarea.id}" data-titulo="${escapeHtml(tarea.titulo)}">
            <h3>${escapeHtml(tarea.titulo)}</h3>
            <div class="meta">
                📘 ${escapeHtml(tarea.materia || "sin materia")} ·
                👤 ${escapeHtml(tarea.correo_profesor || "sin profesor")} ·
                📅 Entrega: ${formatearFecha(tarea.fecha_entrega)}${tarea.hora_entrega ? " " + tarea.hora_entrega.slice(0, 5) : ""}
            </div>
            <div class="meta">👥 ${total} estudiante(s) · ✅ ${terminadas} terminada(s) (${porcentaje}%)</div>
            <div class="barra-progreso"><div class="relleno" style="width:${porcentaje}%"></div></div>
        </div>`;
    }).join("");

    listaTareas.querySelectorAll("[data-detalle]").forEach(tarjeta => {
        tarjeta.addEventListener("click", () => {
            abrirDetalle(tarjeta.dataset.detalle, tarjeta.dataset.titulo);
        });
    });
}

// =========================================================
// 5) DETALLE POR TAREA (ver y corregir el estado de cada estudiante)
// =========================================================

async function abrirDetalle(taskId, titulo) {
    tareaDetalleActual = taskId;
    detalleTitulo.textContent = titulo;
    detalleSubt.textContent = "";
    detalleLista.innerHTML = `<p class="text-center text-muted py-3">Cargando estudiantes...</p>`;
    overlayDetalle.classList.add("mostrar");
    await cargarDetalleTarea(taskId);
}

function cerrarDetalle() {
    overlayDetalle.classList.remove("mostrar");
    tareaDetalleActual = null;
}

btnCerrarDetalle.addEventListener("click", cerrarDetalle);
overlayDetalle.addEventListener("click", (e) => {
    if (e.target === overlayDetalle) cerrarDetalle();
});

async function cargarDetalleTarea(taskId) {
    const { data: asignaciones, error: errAsig } = await supabase
        .from("task_assignments")
        .select("id, estudiante_id, estado")
        .eq("task_id", taskId);

    if (errAsig) {
        console.error("❌ Error al cargar asignaciones de la tarea:", errAsig);
        detalleLista.innerHTML = `<p class="text-center text-danger py-3">Error al cargar estudiantes.</p>`;
        return;
    }

    if (!asignaciones || asignaciones.length === 0) {
        detalleLista.innerHTML = `<p class="text-center text-muted py-3">Esta tarea no tiene estudiantes asignados.</p>`;
        return;
    }

    const idsEstudiantes = asignaciones.map(a => a.estudiante_id);
    const { data: estudiantes, error: errEst } = await supabase
        .from("estudiantes")
        .select("id, nombre")
        .in("id", idsEstudiantes);

    if (errEst) {
        console.error("❌ Error al cargar nombres de estudiantes:", errEst);
    }

    const nombrePorId = new Map((estudiantes || []).map(e => [e.id, e.nombre]));

    const filas = asignaciones
        .map(a => ({ ...a, nombre: nombrePorId.get(a.estudiante_id) || "(estudiante desconocido)" }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

    const terminadas = filas.filter(f => f.estado === "terminada").length;
    detalleSubt.textContent = `${filas.length} estudiante(s) · ${terminadas} terminada(s)`;

    detalleLista.innerHTML = filas.map(f => `
        <div class="fila-estudiante">
            <span class="nombre">${escapeHtml(f.nombre)}</span>
            <select data-asignacion="${f.id}">
                <option value="pendiente" ${f.estado === "pendiente" || !f.estado ? "selected" : ""}>⏳ Pendiente</option>
                <option value="en_progreso" ${f.estado === "en_progreso" ? "selected" : ""}>✏️ En progreso</option>
                <option value="terminada" ${f.estado === "terminada" ? "selected" : ""}>✅ Terminada</option>
            </select>
        </div>
    `).join("");

    detalleLista.querySelectorAll("[data-asignacion]").forEach(select => {
        select.addEventListener("change", () => cambiarEstadoEstudiante(select.dataset.asignacion, select.value));
    });
}

async function cambiarEstadoEstudiante(asignacionId, nuevoEstado) {
    const { error } = await supabase
        .from("task_assignments")
        .update({ estado: nuevoEstado })
        .eq("id", asignacionId);

    if (error) {
        console.error("❌ Error al actualizar estado:", error);
        estadoDetalle.textContent = "❌ No se pudo guardar.";
        estadoDetalle.style.color = "#c0392b";
        return;
    }

    estadoDetalle.textContent = "✅ Guardado.";
    estadoDetalle.style.color = "#2e7d32";
    setTimeout(() => { estadoDetalle.textContent = ""; }, 2000);

    if (salonActual) await cargarTareas(salonActual);
}

// =========================================================
// 6) ACTUALIZACIÓN AUTOMÁTICA
// =========================================================

async function actualizarTodo() {
    if (!salonActual) return;
    await cargarTareas(salonActual);
    cargarHorario(salonActual);
    textoActualizado.textContent = `Última actualización: ${new Date().toLocaleTimeString("es-PA")}`;
}

function iniciarAutoActualizacion() {
    if (intervaloActualizacion) clearInterval(intervaloActualizacion);
    intervaloActualizacion = setInterval(actualizarTodo, 30000);
}

selectSalon.addEventListener("change", async () => {
    salonActual = selectSalon.value;
    if (!salonActual) {
        listaTareas.innerHTML = `<p class="text-center text-muted py-4">Elige un salón arriba.</p>`;
        iframeHorario.src = "";
        textoActualizado.textContent = "";
        return;
    }
    await actualizarTodo();
    iniciarAutoActualizacion();
});

btnActualizar.addEventListener("click", actualizarTodo);

// =========================================================
// INICIO
// =========================================================

(async function init() {
    const ok = await verificarAdmin();
    if (!ok) return;
    await cargarSalones();
})();
