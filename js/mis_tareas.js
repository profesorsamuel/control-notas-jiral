import { supabase } from "./supabase.js";

// =========================================================
// El estudiante ve las tareas asignadas a SU salón y marca su
// propio avance (pendiente / en progreso / terminada) en su
// fila de "task_assignments". No puede ver ni tocar el estado
// de sus compañeros — esa vista es solo del profesor y del
// administrador (tareas.html / monitor_estudiantes.html).
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

function mostrarEstado(mensaje, esError = false) {
    const el = document.getElementById("estadoTareas");
    el.textContent = mensaje;
    el.style.color = esError ? "#c0392b" : "#2e7d32";
    if (mensaje) {
        setTimeout(() => { if (el.textContent === mensaje) el.textContent = ""; }, 3000);
    }
}

const listaTareas = document.getElementById("listaTareas");

let miEstudianteId = null;

async function verificarSesionYEstudiante() {
    const { data: { user }, error: errUser } = await supabase.auth.getUser();

    if (errUser || !user) {
        window.location.href = "login.html";
        return false;
    }

    const correo = (user.email || "").trim().toLowerCase();
    const { data: estudiante, error: errEst } = await supabase
        .from("estudiantes")
        .select("id, salon")
        .eq("correo", correo)
        .maybeSingle();

    if (errEst || !estudiante?.id) {
        listaTareas.innerHTML = `<p class="text-center text-danger py-4">⛔ Esta cuenta no tiene un perfil de estudiante.</p>`;
        return false;
    }

    miEstudianteId = estudiante.id;
    return true;
}

async function cargarMisTareas() {
    const { data: asignaciones, error: errAsig } = await supabase
        .from("task_assignments")
        .select("id, task_id, estado")
        .eq("estudiante_id", miEstudianteId);

    if (errAsig) {
        console.error("❌ Error al cargar tus tareas:", errAsig);
        listaTareas.innerHTML = `<p class="text-center text-danger py-4">Error al cargar tus tareas.</p>`;
        return;
    }

    if (!asignaciones || asignaciones.length === 0) {
        listaTareas.innerHTML = `<p class="text-center text-muted py-4">No tienes tareas asignadas por ahora.</p>`;
        return;
    }

    const idsTareas = asignaciones.map(a => a.task_id);
    const { data: tareas, error: errTareas } = await supabase
        .from("tasks")
        .select("*")
        .in("id", idsTareas);

    if (errTareas) {
        console.error("❌ Error al cargar el detalle de las tareas:", errTareas);
        listaTareas.innerHTML = `<p class="text-center text-danger py-4">Error al cargar tus tareas.</p>`;
        return;
    }

    const tareaPorId = new Map((tareas || []).map(t => [t.id, t]));
    const hoy = new Date().toISOString().slice(0, 10);

    const filas = asignaciones
        .map(a => ({ ...a, tarea: tareaPorId.get(a.task_id) }))
        .filter(f => f.tarea)
        .sort((a, b) => (a.tarea.fecha_entrega || "").localeCompare(b.tarea.fecha_entrega || ""));

    listaTareas.innerHTML = filas.map(f => {
        const t = f.tarea;
        const vencida = t.fecha_entrega && t.fecha_entrega < hoy && f.estado !== "terminada";
        const clase = f.estado === "terminada" ? "terminada" : (vencida ? "vencida" : "");

        return `
        <div class="tarjeta-tarea ${clase}">
            <h3>${escapeHtml(t.titulo)} ${vencida ? `<span class="etiqueta-vencida">Vencida</span>` : ""}</h3>
            <div class="meta">
                📘 ${escapeHtml(t.materia || "sin materia")} ·
                📅 Entrega: ${formatearFecha(t.fecha_entrega)}${t.hora_entrega ? " " + t.hora_entrega.slice(0, 5) : ""}
            </div>
            ${t.descripcion ? `<div class="meta">${escapeHtml(t.descripcion)}</div>` : ""}
            <div class="fila-estado">
                <label class="meta" style="margin:0;">Mi estado:</label>
                <select data-asignacion="${f.id}">
                    <option value="pendiente" ${f.estado === "pendiente" || !f.estado ? "selected" : ""}>⏳ Pendiente</option>
                    <option value="en_progreso" ${f.estado === "en_progreso" ? "selected" : ""}>✏️ En progreso</option>
                    <option value="terminada" ${f.estado === "terminada" ? "selected" : ""}>✅ Terminada</option>
                </select>
            </div>
        </div>`;
    }).join("");

    listaTareas.querySelectorAll("[data-asignacion]").forEach(select => {
        select.addEventListener("change", () => cambiarMiEstado(select.dataset.asignacion, select.value));
    });
}

async function cambiarMiEstado(asignacionId, nuevoEstado) {
    const { error } = await supabase
        .from("task_assignments")
        .update({ estado: nuevoEstado })
        .eq("id", asignacionId)
        .eq("estudiante_id", miEstudianteId);

    if (error) {
        console.error("❌ Error al actualizar tu estado:", error);
        mostrarEstado("❌ No se pudo guardar. Intenta de nuevo.", true);
        return;
    }

    mostrarEstado("✅ Guardado.");
    await cargarMisTareas();
}

(async function init() {
    const ok = await verificarSesionYEstudiante();
    if (!ok) return;
    await cargarMisTareas();
})();
