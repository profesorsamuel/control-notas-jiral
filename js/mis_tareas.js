import { supabase } from "./supabase.js";

// =========================================================
// El estudiante ve las tareas asignadas a SU salón y marca su
// propio avance (pendiente / en progreso / terminada) en su
// fila de "task_assignments". No puede ver ni tocar el estado
// de sus compañeros — esa vista es solo del profesor y del
// administrador (tareas.html / monitor_estudiantes.html).
//
// Además:
//  - Muestra un aviso arriba con las tareas vencidas y las que
//    vencen pronto (según la fecha de entrega).
//  - Si el profesor autorizó a este estudiante
//    (estudiantes.puede_agregar_tareas = true), aparece un botón
//    "➕ Agregar tarea" para crear una tarea que se asigna a todo
//    su salón (igual que cuando la crea el profesor).
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

// Cuántos días antes de la fecha de entrega se considera "próxima a vencer".
const DIAS_AVISO_PROXIMA = 2;

// =========================================================
// ELEMENTOS
// =========================================================

const listaTareas = document.getElementById("listaTareas");
const avisoPendientes = document.getElementById("avisoPendientes");

const btnMostrarFormEstudiante = document.getElementById("btnMostrarFormEstudiante");
const zonaFormEstudiante = document.getElementById("zonaFormEstudiante");
const btnCancelarFormEst = document.getElementById("btnCancelarFormEst");
const btnGuardarTareaEst = document.getElementById("btnGuardarTareaEst");
const inputTituloEst = document.getElementById("inputTituloEst");
const inputMateriaEst = document.getElementById("inputMateriaEst");
const inputDescripcionEst = document.getElementById("inputDescripcionEst");
const inputFechaEst = document.getElementById("inputFechaEst");
const inputHoraEst = document.getElementById("inputHoraEst");

// =========================================================
// ESTADO
// =========================================================

let miEstudianteId = null;
let miSalon = "";
let puedeAgregarTareas = false;
let materiasCache = []; // [{id, nombre, nivel_7, nivel_8, nivel_9}]

// =========================================================
// 1) VERIFICAR SESIÓN Y PERMISOS
// =========================================================

async function verificarSesionYEstudiante() {
    const { data: { user }, error: errUser } = await supabase.auth.getUser();

    if (errUser || !user) {
        window.location.href = "login.html";
        return false;
    }

    const correo = (user.email || "").trim().toLowerCase();
    const { data: estudiante, error: errEst } = await supabase
        .from("estudiantes")
        .select("id, salon, puede_agregar_tareas")
        .eq("correo", correo)
        .maybeSingle();

    if (errEst || !estudiante?.id) {
        listaTareas.innerHTML = `<p class="text-center text-danger py-4">⛔ Esta cuenta no tiene un perfil de estudiante.</p>`;
        return false;
    }

    miEstudianteId = estudiante.id;
    miSalon = estudiante.salon || "";
    puedeAgregarTareas = !!estudiante.puede_agregar_tareas;
    return true;
}

// Deduce el grado (7, 8 o 9) a partir del código del salón (ej: "9C" -> 9).
function nivelDelSalon(salon) {
    const match = String(salon || "").match(/\d+/);
    return match ? parseInt(match[0], 10) : null;
}

function materiasParaMiSalon() {
    const nivel = nivelDelSalon(miSalon);
    const campoNivel = nivel ? `nivel_${nivel}` : null;
    if (!campoNivel) return materiasCache;
    const filtradas = materiasCache.filter((m) => m[campoNivel]);
    return filtradas.length > 0 ? filtradas : materiasCache;
}

async function cargarMateriasParaFormulario() {
    const { data, error } = await supabase
        .from("materias")
        .select("id, nombre, nivel_7, nivel_8, nivel_9, activo, orden")
        .eq("activo", true)
        .order("orden", { ascending: true });

    if (error) {
        console.error("❌ Error al cargar materias:", error);
        inputMateriaEst.innerHTML = `<option value="">Error al cargar</option>`;
        return;
    }

    materiasCache = data || [];
    const disponibles = materiasParaMiSalon();

    inputMateriaEst.innerHTML = disponibles.length > 0
        ? `<option value="">Selecciona una materia</option>` +
          disponibles.map(m => `<option value="${escapeHtml(m.nombre)}">${escapeHtml(m.nombre)}</option>`).join("")
        : `<option value="">No hay materias configuradas</option>`;
}

// =========================================================
// 2) AVISO DE TAREAS PENDIENTES SEGÚN LA FECHA
// =========================================================

function mostrarAvisoPendientes(filas) {
    const hoy = new Date().toISOString().slice(0, 10);
    const limiteProxima = new Date();
    limiteProxima.setDate(limiteProxima.getDate() + DIAS_AVISO_PROXIMA);
    const fechaLimiteProxima = limiteProxima.toISOString().slice(0, 10);

    const vencidas = filas.filter(f =>
        f.estado !== "terminada" && f.tarea.fecha_entrega && f.tarea.fecha_entrega < hoy
    );
    const proximas = filas.filter(f =>
        f.estado !== "terminada" && f.tarea.fecha_entrega &&
        f.tarea.fecha_entrega >= hoy && f.tarea.fecha_entrega <= fechaLimiteProxima
    );

    if (vencidas.length === 0 && proximas.length === 0) {
        avisoPendientes.classList.remove("mostrar", "nivel-vencida", "nivel-proxima");
        avisoPendientes.innerHTML = "";
        return;
    }

    // Si hay vencidas, ese es el aviso más urgente.
    const nivel = vencidas.length > 0 ? "nivel-vencida" : "nivel-proxima";
    avisoPendientes.classList.add("mostrar", nivel);
    avisoPendientes.classList.remove(nivel === "nivel-vencida" ? "nivel-proxima" : "nivel-vencida");

    const partes = [];
    if (vencidas.length > 0) {
        partes.push(`<div>🔴 <strong>${vencidas.length}</strong> tarea(s) vencida(s): ${vencidas.map(f => escapeHtml(f.tarea.titulo)).join(", ")}</div>`);
    }
    if (proximas.length > 0) {
        partes.push(`<div>🟡 <strong>${proximas.length}</strong> tarea(s) por vencer pronto: ${proximas.map(f => `${escapeHtml(f.tarea.titulo)} (${formatearFecha(f.tarea.fecha_entrega)})`).join(", ")}</div>`);
    }
    avisoPendientes.innerHTML = partes.join("");
}

// =========================================================
// 3) CARGAR Y PINTAR MIS TAREAS
// =========================================================

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
        avisoPendientes.classList.remove("mostrar");
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

    mostrarAvisoPendientes(filas);

    listaTareas.innerHTML = filas.map(f => {
        const t = f.tarea;
        const vencida = t.fecha_entrega && t.fecha_entrega < hoy && f.estado !== "terminada";
        const clase = f.estado === "terminada" ? "terminada" : (vencida ? "vencida" : "");
        const esMia = t.creado_por === "estudiante" && t.estudiante_creador_id === miEstudianteId;

        return `
        <div class="tarjeta-tarea ${clase}">
            <h3>${escapeHtml(t.titulo)} ${vencida ? `<span class="etiqueta-vencida">Vencida</span>` : ""} ${esMia ? `<span class="etiqueta-mia">Agregada por mí</span>` : ""}</h3>
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

// =========================================================
// 4) AGREGAR TAREA (solo si el profesor lo autorizó)
// =========================================================

function abrirFormEstudiante() {
    zonaFormEstudiante.classList.add("mostrar");
    inputTituloEst.value = "";
    inputMateriaEst.value = "";
    inputDescripcionEst.value = "";
    inputFechaEst.value = "";
    inputHoraEst.value = "";
    inputTituloEst.focus();
}

function cerrarFormEstudiante() {
    zonaFormEstudiante.classList.remove("mostrar");
}

async function guardarTareaEstudiante() {
    const titulo = inputTituloEst.value.trim();
    const materia = inputMateriaEst.value;
    const descripcion = inputDescripcionEst.value.trim();
    const fecha = inputFechaEst.value;
    const hora = inputHoraEst.value;

    if (!titulo) { mostrarEstado("⚠️ El título es obligatorio.", true); return; }
    if (!materia) { mostrarEstado("⚠️ Selecciona una materia.", true); return; }
    if (!miSalon) { mostrarEstado("⚠️ No se encontró tu salón.", true); return; }

    btnGuardarTareaEst.disabled = true;
    mostrarEstado("Guardando...");

    // Se busca automáticamente quién dicta esa materia en el salón,
    // para que la tarea también le aparezca al profesor en su lista.
    const { data: asignacion } = await supabase
        .from("profesor_materias")
        .select("correo_profesor")
        .eq("salon", miSalon)
        .eq("materia", materia)
        .limit(1)
        .maybeSingle();

    const { data: nuevaTarea, error: errTarea } = await supabase
        .from("tasks")
        .insert({
            correo_profesor: asignacion?.correo_profesor || null,
            titulo,
            materia: materia || null,
            salon: miSalon,
            descripcion: descripcion || null,
            fecha_entrega: fecha || null,
            hora_entrega: hora || null,
            creado_por: "estudiante",
            estudiante_creador_id: miEstudianteId,
        })
        .select()
        .single();

    if (errTarea || !nuevaTarea) {
        console.error("❌ Error al crear tarea:", errTarea);
        mostrarEstado("❌ No se pudo crear la tarea.", true);
        btnGuardarTareaEst.disabled = false;
        return;
    }

    const { data: estudiantesDelSalon, error: errEst } = await supabase
        .from("estudiantes")
        .select("id")
        .eq("salon", miSalon);

    if (!errEst && estudiantesDelSalon && estudiantesDelSalon.length > 0) {
        const filas = estudiantesDelSalon.map(e => ({
            task_id: nuevaTarea.id,
            estudiante_id: e.id,
        }));
        const { error: errAsignar } = await supabase.from("task_assignments").insert(filas);
        if (errAsignar) {
            console.error("❌ Error al asignar estudiantes:", errAsignar);
            mostrarEstado("⚠️ Tarea creada, pero hubo un error al asignarla al salón.", true);
            btnGuardarTareaEst.disabled = false;
            cerrarFormEstudiante();
            await cargarMisTareas();
            return;
        }
    }

    mostrarEstado("✅ Tarea creada y asignada a tu salón.");
    btnGuardarTareaEst.disabled = false;
    cerrarFormEstudiante();
    await cargarMisTareas();
}

btnMostrarFormEstudiante.addEventListener("click", abrirFormEstudiante);
btnCancelarFormEst.addEventListener("click", cerrarFormEstudiante);
btnGuardarTareaEst.addEventListener("click", guardarTareaEstudiante);

// =========================================================
// 5) INICIO
// =========================================================

(async function init() {
    const ok = await verificarSesionYEstudiante();
    if (!ok) return;

    if (puedeAgregarTareas) {
        btnMostrarFormEstudiante.style.display = "inline-block";
        await cargarMateriasParaFormulario();
    }

    await cargarMisTareas();
})();
