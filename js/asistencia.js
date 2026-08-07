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

// =========================================================
// 1) VERIFICAR SESIÓN Y QUE SEA PROFESOR
// =========================================================
// Misma lógica que en profesor.js: el acceso se decide por tener
// filas en "profesor_materias", no por el campo "rol" de "usuarios".

let correoProfesor = "";
let nombreProfesor = "";
let misAsignaciones = []; // [{materia, salon}, ...] -- solo lo que este profesor da

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

    misAsignaciones = materias;

    const { data: perfilProfesor } = await supabase
        .from("profesores")
        .select("nombre_profesor")
        .eq("correo_profesor", correoProfesor)
        .maybeSingle();
    nombreProfesor = perfilProfesor?.nombre_profesor || correoProfesor;

    return true;
}

// =========================================================
// 2) ELEMENTOS DE LA PÁGINA
// =========================================================

const fechaActual = document.getElementById("fechaActual");
const nombreProfesorTexto = document.getElementById("nombreProfesorTexto");
const avisoSinAsignaciones = document.getElementById("avisoSinAsignaciones");
const selectSalonAsistencia = document.getElementById("selectSalonAsistencia");
const selectMateriaAsistencia = document.getElementById("selectMateriaAsistencia");
const btnAbrirAsistencia = document.getElementById("btnAbrirAsistencia");
const estadoCargaAsistencia = document.getElementById("estadoCargaAsistencia");

// =========================================================
// 3) FECHA Y PROFESOR
// =========================================================
// Mismo formato de fecha usado en profesor.js (construirReporteHtml).

function pintarFechaYProfesor() {
    const fechaHoyTexto = new Date().toLocaleDateString("es-PA", {
        year: "numeric",
        month: "long",
        day: "numeric"
    });
    fechaActual.textContent = fechaHoyTexto;
    nombreProfesorTexto.textContent = nombreProfesor;
}

// =========================================================
// 4) SELECTORES DE SALÓN / MATERIA
// =========================================================
// Misma lógica de poblarSelectSalon / poblarSelectMateria de profesor.js.

function poblarSelectSalon() {
    const salones = [...new Set(misAsignaciones.map((a) => a.salon))].sort();

    if (salones.length === 0) {
        selectSalonAsistencia.innerHTML = `<option value="">No tienes salones asignados</option>`;
        selectSalonAsistencia.disabled = true;
        avisoSinAsignaciones.style.display = "block";
        return;
    }

    avisoSinAsignaciones.style.display = "none";
    selectSalonAsistencia.innerHTML =
        `<option value="">Seleccione un salón</option>` +
        salones.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
    selectSalonAsistencia.disabled = false;
}

function poblarSelectMateria() {
    const salon = selectSalonAsistencia.value;

    if (!salon) {
        selectMateriaAsistencia.innerHTML = `<option value="">Seleccione primero un salón</option>`;
        selectMateriaAsistencia.disabled = true;
        actualizarEstadoBoton();
        return;
    }

    const materias = misAsignaciones
        .filter((a) => a.salon === salon)
        .map((a) => a.materia);

    if (materias.length === 1) {
        selectMateriaAsistencia.innerHTML =
            `<option value="${escapeHtml(materias[0])}" selected>${escapeHtml(materias[0])}</option>`;
        selectMateriaAsistencia.disabled = false;
        actualizarEstadoBoton();
        return;
    }

    selectMateriaAsistencia.innerHTML =
        `<option value="">Seleccione una materia</option>` +
        materias.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
    selectMateriaAsistencia.disabled = false;
    actualizarEstadoBoton();
}

function actualizarEstadoBoton() {
    const listo = !!selectSalonAsistencia.value && !!selectMateriaAsistencia.value;
    btnAbrirAsistencia.disabled = !listo;
}

selectSalonAsistencia?.addEventListener("change", poblarSelectMateria);
selectMateriaAsistencia?.addEventListener("change", actualizarEstadoBoton);

// =========================================================
// 5) BOTÓN "ABRIR ASISTENCIA"
// =========================================================
// Todavía no existe tabla de asistencia en Supabase, así que por
// ahora solo se muestra un mensaje. La funcionalidad real se
// agregará en una siguiente etapa.

btnAbrirAsistencia?.addEventListener("click", () => {
    const salon = selectSalonAsistencia.value;
    const materia = selectMateriaAsistencia.value;

    if (!salon || !materia) {
        estadoCargaAsistencia.textContent = "Selecciona un salón y una materia primero.";
        return;
    }

    estadoCargaAsistencia.textContent =
        `Este módulo está en construcción. Próximamente podrás pasar asistencia de ${materia} - ${salon} aquí.`;
});

// =========================================================
// INICIO
// =========================================================

(async function init() {
    const ok = await verificarSesion();
    if (!ok) return;

    pintarCambiarPanel("profesor", "oscuro-sobre-claro");
    pintarFechaYProfesor();
    poblarSelectSalon();
})();
