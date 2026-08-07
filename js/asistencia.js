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

// Nombres de día en español, en el mismo formato que se guarda en
// profesor_materias.dia ('Lunes'...'Viernes'), armados manualmente
// (sin depender del locale del navegador) para que siempre calcen
// exactamente con los valores permitidos por la base de datos.
const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function obtenerDiaHoy() {
    return DIAS_SEMANA[new Date().getDay()];
}

// "09:00:00" (formato que devuelve Supabase para columnas time) -> "9:00 AM"
function formatearHora12(horaTexto) {
    if (!horaTexto) return "";
    const [h, m] = horaTexto.split(":");
    const fecha = new Date();
    fecha.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0);
    return fecha.toLocaleTimeString("es-PA", { hour: "numeric", minute: "2-digit" });
}

// =========================================================
// 1) VERIFICAR SESIÓN Y QUE SEA PROFESOR
// =========================================================
// Misma lógica que en profesor.js: el acceso se decide por tener
// filas en "profesor_materias", no por el campo "rol" de "usuarios".

let correoProfesor = "";
let nombreProfesor = "";
let misAsignaciones = []; // [{materia, salon, dia, hora}, ...] -- solo lo que este profesor da

async function verificarSesion() {
    const { data: { user }, error: errUser } = await supabase.auth.getUser();

    if (errUser || !user) {
        window.location.href = "login.html";
        return false;
    }

    correoProfesor = (user.email || "").trim().toLowerCase();

    // Mismo query que usa profesor.js para "profesor_materias", solo que
    // ahora también pedimos dia y hora (las columnas nuevas) para poder
    // armar el horario del día.
    const { data: materias, error: errMaterias } = await supabase
        .from("profesor_materias")
        .select("materia, salon, dia, hora")
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
const avisoSinHorarioHoy = document.getElementById("avisoSinHorarioHoy");
const listaClasesHoy = document.getElementById("listaClasesHoy");

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
// 4) HORARIO DEL DÍA (tarjetas)
// =========================================================
// Filtra, sobre los datos que YA trajo verificarSesion(), únicamente las
// asignaciones cuyo "dia" coincide con el día de hoy, y las ordena por hora.

function pintarClasesDeHoy() {
    if (misAsignaciones.length === 0) {
        avisoSinAsignaciones.style.display = "block";
        listaClasesHoy.innerHTML = "";
        return;
    }

    const diaHoy = obtenerDiaHoy();

    const clasesHoy = misAsignaciones
        .filter((a) => a.dia === diaHoy && a.hora)
        .sort((a, b) => (a.hora || "").localeCompare(b.hora || ""));

    if (clasesHoy.length === 0) {
        avisoSinHorarioHoy.style.display = "block";
        listaClasesHoy.innerHTML = "";
        return;
    }

    avisoSinHorarioHoy.style.display = "none";

    listaClasesHoy.innerHTML = clasesHoy.map((c) => `
        <div class="tarjeta-clase">
            <span class="hora-clase">🕒 ${escapeHtml(formatearHora12(c.hora))}</span>
            <span class="materia-clase">${escapeHtml(c.salon)} ${escapeHtml(c.materia)}</span>
            <span class="salon-clase">Salón: ${escapeHtml(c.salon)}</span>
            <button type="button" class="btn-tomar-asistencia" data-materia="${escapeHtml(c.materia)}" data-salon="${escapeHtml(c.salon)}">
                📋 Tomar asistencia
            </button>
        </div>
    `).join("");

    // Todavía no existe tabla de asistencia en Supabase, así que por ahora
    // el botón solo avisa; la funcionalidad real se agrega en otra etapa.
    listaClasesHoy.querySelectorAll(".btn-tomar-asistencia").forEach((btn) => {
        btn.addEventListener("click", () => {
            const materia = btn.dataset.materia;
            const salon = btn.dataset.salon;
            alert(`Este módulo está en construcción. Próximamente podrás pasar asistencia de ${materia} - ${salon} aquí.`);
        });
    });
}

// =========================================================
// INICIO
// =========================================================

(async function init() {
    const ok = await verificarSesion();
    if (!ok) return;

    pintarCambiarPanel("profesor", "oscuro-sobre-claro");
    pintarFechaYProfesor();
    pintarClasesDeHoy();
})();
