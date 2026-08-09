import { supabase } from "./supabase.js";

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

function mostrarEstado(mensaje, esError = false) {
    const el = document.getElementById("estadoTareas");
    el.textContent = mensaje;
    el.style.color = esError ? "#c0392b" : "#2e7d32";
    if (mensaje) {
        setTimeout(() => { if (el.textContent === mensaje) el.textContent = ""; }, 4000);
    }
}

function formatearFecha(fechaTexto) {
    if (!fechaTexto) return "sin fecha";
    const [anio, mes, dia] = fechaTexto.split("-");
    return `${dia}/${mes}/${anio}`;
}

// =========================================================
// ESTADO
// =========================================================

let correoProfesor = "";
let misMateriasSalones = []; // [{materia, salon}, ...]

// =========================================================
// ELEMENTOS
// =========================================================

const zonaForm = document.getElementById("zonaForm");
const btnMostrarForm = document.getElementById("btnMostrarForm");
const btnCancelarForm = document.getElementById("btnCancelarForm");
const btnGuardarTarea = document.getElementById("btnGuardarTarea");
const selectSalon = document.getElementById("selectSalon");
const listaTareas = document.getElementById("listaTareas");

const inputTitulo = document.getElementById("inputTitulo");
const inputMateria = document.getElementById("inputMateria");
const inputDescripcion = document.getElementById("inputDescripcion");
const inputFecha = document.getElementById("inputFecha");
const inputHora = document.getElementById("inputHora");

// =========================================================
// 1) VERIFICAR SESIÓN (mismo patrón que mi_horario.js)
// =========================================================

async function verificarSesion() {
    const { data: { user }, error: errUser } = await supabase.auth.getUser();

    if (errUser || !user) {
        window.location.href = "login.html";
        return false;
    }

    correoProfesor = (user.email || "").trim().toLowerCase();

    const { data: materias, error: errMaterias } = await supabase
        .from("profesor_materias")
        .select("materia")
        .eq("correo_profesor", correoProfesor)
        .limit(1);

    if (errMaterias) {
        console.error("❌ Error al verificar acceso de docente:", errMaterias);
        alert("Ocurrió un error al verificar tu acceso. Intenta de nuevo.");
        window.location.href = "login.html";
        return false;
    }

    if (!materias || materias.length === 0) {
        alert("⛔ Esta cuenta no tiene materias asignadas como docente. Contacta al administrador.");
        window.location.href = "login.html";
        return false;
    }

    return true;
}

// =========================================================
// 2) CARGAR SALONES (desde la tabla estudiantes existente)
// =========================================================

async function cargarSalones() {
    const { data, error } = await supabase
        .from("estudiantes")
        .select("salon")
        .not("salon", "is", null);

    if (error) {
        console.error("❌ Error al cargar salones:", error);
        selectSalon.innerHTML = `<option value="">Error al cargar</option>`;
        return;
    }

    const salonesUnicos = [...new Set((data || []).map(f => f.salon).filter(Boolean))].sort();

    selectSalon.innerHTML = `<option value="">Selecciona un salón</option>` +
        salonesUnicos.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
}

// =========================================================
// 2b) CARGAR MIS MATERIAS (desde profesor_materias existente)
// =========================================================

async function cargarMisMaterias() {
    const { data, error } = await supabase
        .from("profesor_materias")
        .select("materia, salon")
        .eq("correo_profesor", correoProfesor);

    if (error) {
        console.error("❌ Error al cargar materias:", error);
        inputMateria.innerHTML = `<option value="">Error al cargar</option>`;
        return;
    }

    const vistos = new Set();
    misMateriasSalones = (data || []).filter(m => {
        if (!m.materia || vistos.has(m.materia)) return false;
        vistos.add(m.materia);
        return true;
    });

    if (misMateriasSalones.length === 0) {
        inputMateria.innerHTML = `<option value="">No tienes materias asignadas</option>`;
        return;
    }

    inputMateria.innerHTML = `<option value="">Selecciona una materia</option>` +
        misMateriasSalones.map(m => `<option value="${escapeHtml(m.materia)}">${escapeHtml(m.materia)}</option>`).join("");
}

// Al elegir la materia, sugiere automáticamente el salón asociado (si existe)
inputMateria.addEventListener("change", () => {
    const encontrada = misMateriasSalones.find(m => m.materia === inputMateria.value);
    if (encontrada && encontrada.salon) {
        const existeOpcion = [...selectSalon.options].some(o => o.value === encontrada.salon);
        if (existeOpcion) selectSalon.value = encontrada.salon;
    }
});

// =========================================================
// 3) CARGAR Y PINTAR TAREAS
// =========================================================

async function cargarTareas() {
    listaTareas.innerHTML = `<p class="text-center text-muted py-4">Cargando tareas...</p>`;

    const { data: tareas, error: errTareas } = await supabase
        .from("tasks")
        .select("*")
        .eq("correo_profesor", correoProfesor)
        .order("created_at", { ascending: false });

    if (errTareas) {
        console.error("❌ Error al cargar tareas:", errTareas);
        listaTareas.innerHTML = `<p class="text-center text-danger py-4">Error al cargar tareas.</p>`;
        return;
    }

    if (!tareas || tareas.length === 0) {
        listaTareas.innerHTML = `<p class="text-center text-muted py-4">Todavía no tienes tareas creadas. Usa "➕ Nueva tarea" para crear la primera.</p>`;
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
        <div class="tarjeta-tarea">
            <h3>${escapeHtml(tarea.titulo)}</h3>
            <div class="meta">
                📘 ${escapeHtml(tarea.materia || "sin materia")} ·
                🏫 ${escapeHtml(tarea.salon || "sin salón")} ·
                📅 Entrega: ${formatearFecha(tarea.fecha_entrega)}${tarea.hora_entrega ? " " + tarea.hora_entrega.slice(0,5) : ""}
            </div>
            ${tarea.descripcion ? `<div class="meta">${escapeHtml(tarea.descripcion)}</div>` : ""}
            <div class="meta">👥 ${total} estudiante(s) · ✅ ${terminadas} terminada(s) (${porcentaje}%)</div>
            <div class="barra-progreso"><div class="relleno" style="width:${porcentaje}%"></div></div>
            <div class="fila-acciones-tarea">
                <button class="btn btn-sm btn-outline-danger" data-eliminar="${tarea.id}">🗑 Eliminar</button>
            </div>
        </div>`;
    }).join("");

    listaTareas.querySelectorAll("[data-eliminar]").forEach(btn => {
        btn.addEventListener("click", () => eliminarTarea(btn.dataset.eliminar));
    });
}

// =========================================================
// 4) CREAR TAREA + ASIGNAR A TODO EL SALÓN
// =========================================================

async function guardarTarea() {
    const titulo = inputTitulo.value.trim();
    const materia = inputMateria.value;
    const salon = selectSalon.value;
    const descripcion = inputDescripcion.value.trim();
    const fecha = inputFecha.value;
    const hora = inputHora.value;

    if (!titulo) { mostrarEstado("⚠️ El título es obligatorio.", true); return; }
    if (!salon) { mostrarEstado("⚠️ Selecciona un salón.", true); return; }

    btnGuardarTarea.disabled = true;
    mostrarEstado("Guardando...");

    const { data: nuevaTarea, error: errTarea } = await supabase
        .from("tasks")
        .insert({
            correo_profesor: correoProfesor,
            titulo,
            materia: materia || null,
            salon,
            descripcion: descripcion || null,
            fecha_entrega: fecha || null,
            hora_entrega: hora || null,
        })
        .select()
        .single();

    if (errTarea || !nuevaTarea) {
        console.error("❌ Error al crear tarea:", errTarea);
        mostrarEstado("❌ No se pudo crear la tarea.", true);
        btnGuardarTarea.disabled = false;
        return;
    }

    const { data: estudiantesDelSalon, error: errEst } = await supabase
        .from("estudiantes")
        .select("id")
        .eq("salon", salon);

    if (errEst) {
        console.error("❌ Error al buscar estudiantes del salón:", errEst);
        mostrarEstado("⚠️ Tarea creada, pero no se pudo asignar a los estudiantes.", true);
        btnGuardarTarea.disabled = false;
        cerrarForm();
        cargarTareas();
        return;
    }

    if (estudiantesDelSalon && estudiantesDelSalon.length > 0) {
        const filas = estudiantesDelSalon.map(e => ({
            task_id: nuevaTarea.id,
            estudiante_id: e.id,
        }));

        const { error: errAsignar } = await supabase.from("task_assignments").insert(filas);

        if (errAsignar) {
            console.error("❌ Error al asignar estudiantes:", errAsignar);
            mostrarEstado("⚠️ Tarea creada, pero hubo un error al asignarla a los estudiantes.", true);
            btnGuardarTarea.disabled = false;
            cerrarForm();
            cargarTareas();
            return;
        }
    }

    mostrarEstado("✅ Tarea creada y asignada correctamente.");
    btnGuardarTarea.disabled = false;
    cerrarForm();
    cargarTareas();
}

async function eliminarTarea(id) {
    if (!confirm("¿Eliminar esta tarea? Se eliminarán también las asignaciones de los estudiantes.")) return;

    const { error } = await supabase.from("tasks").delete().eq("id", id);

    if (error) {
        console.error("❌ Error al eliminar tarea:", error);
        mostrarEstado("❌ No se pudo eliminar la tarea.", true);
        return;
    }

    mostrarEstado("🗑 Tarea eliminada.");
    cargarTareas();
}

// =========================================================
// 5) FORMULARIO
// =========================================================

function abrirForm() {
    zonaForm.classList.add("mostrar");
    inputTitulo.value = "";
    inputMateria.value = "";
    selectSalon.value = "";
    inputDescripcion.value = "";
    inputFecha.value = "";
    inputHora.value = "";
    inputTitulo.focus();
}

function cerrarForm() {
    zonaForm.classList.remove("mostrar");
}

btnMostrarForm.addEventListener("click", abrirForm);
btnCancelarForm.addEventListener("click", cerrarForm);
btnGuardarTarea.addEventListener("click", guardarTarea);

// =========================================================
// 6) INICIO
// =========================================================

(async function iniciar() {
    const ok = await verificarSesion();
    if (!ok) return;

    await cargarSalones();
    await cargarMisMaterias();
    await cargarTareas();
})();
