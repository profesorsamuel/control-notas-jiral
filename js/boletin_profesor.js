import { supabase } from "./supabase.js";

// =====================================================
// BOLETÍN DE NOTAS FINALES — ACCESO DESDE EL DOCENTE
// =====================================================
// El docente elige un salón (de entre los que tiene asignados)
// y ve la lista de estudiantes de ese salón. Cada fila tiene un
// botón que abre, en una pestaña nueva, el boletín completo del
// estudiante (Trimestre 1, 2, 3 y promedio final) usando la misma
// página que ya usan los estudiantes/padres (boletin_trimestral.html),
// pasándole la cédula por la URL.

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

const selectSalon = document.getElementById("selectSalon");
const inputBuscar = document.getElementById("inputBuscar");
const estadoCarga = document.getElementById("estadoCarga");
const panelRoster = document.getElementById("panelRoster");
const cuerpoRoster = document.getElementById("cuerpoRoster");
const nombreProfesorHeader = document.getElementById("nombreProfesorHeader");

let misAsignaciones = []; // [{materia, salon}]
let mapaSalones = {};     // codigo -> {nivel, letra, nombre_visible, orden}
let estudiantesSalonActual = [];

// =====================================================
// SESIÓN (mismo patrón que cuadro_aprobados.js / consejero.js)
// =====================================================

async function verificarSesion() {
    const { data: { user }, error: errUser } = await supabase.auth.getUser();
    if (errUser || !user) {
        window.location.href = "login.html";
        return false;
    }
    const correoProfesor = (user.email || "").trim().toLowerCase();

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

    if (nombreProfesorHeader) {
        nombreProfesorHeader.textContent = perfilProfesor?.nombre_profesor || correoProfesor;
    }

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

function nombreVisibleSalon(codigo) {
    return mapaSalones[codigo]?.nombre_visible || codigo;
}

// =====================================================
// POBLAR SELECT DE SALONES (solo los del docente)
// =====================================================

function poblarSalones() {
    const salones = [...new Set(misAsignaciones.map((a) => a.salon))]
        .sort((a, b) => (mapaSalones[a]?.orden ?? 0) - (mapaSalones[b]?.orden ?? 0));

    selectSalon.innerHTML = `<option value="">Selecciona un salón</option>` +
        salones.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(nombreVisibleSalon(s))}</option>`).join("");
}

// =====================================================
// CARGAR ESTUDIANTES DE UN SALÓN
// =====================================================

async function cargarEstudiantes(salon) {
    if (!salon) {
        panelRoster.style.display = "none";
        estudiantesSalonActual = [];
        return;
    }

    estadoCarga.textContent = "Cargando estudiantes...";
    panelRoster.style.display = "none";

    const { data, error } = await supabase
        .from("estudiantes")
        .select("id, codigo, nombre, cedula, es_prueba")
        .eq("salon", salon)
        .order("nombre", { ascending: true });

    estadoCarga.textContent = "";

    if (error) {
        alert("No se pudieron cargar los estudiantes: " + error.message);
        return;
    }

    estudiantesSalonActual = (data || []).filter((e) => !e.es_prueba);
    renderRoster();
}

function renderRoster() {
    const filtro = inputBuscar.value.trim().toLowerCase();
    const filtrados = filtro
        ? estudiantesSalonActual.filter((e) => (e.nombre || "").toLowerCase().includes(filtro))
        : estudiantesSalonActual;

    if (filtrados.length === 0) {
        panelRoster.style.display = "block";
        cuerpoRoster.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#64748b;">No se encontraron estudiantes.</td></tr>`;
        return;
    }

    panelRoster.style.display = "block";
    cuerpoRoster.innerHTML = filtrados.map((e) => {
        const tieneCedula = !!e.cedula;
        const boton = tieneCedula
            ? `<a class="btn-ver-boletin" href="boletin_trimestral.html?cedula=${encodeURIComponent(e.cedula)}" target="_blank">📊 Ver boletín</a>`
            : `<span style="color:#b91c1c; font-size:12px;">Sin cédula registrada</span>`;

        return `
            <tr>
                <td>${escapeHtml(e.codigo || "-")}</td>
                <td>${escapeHtml(e.nombre || "-")}</td>
                <td>${escapeHtml(e.cedula || "-")}</td>
                <td>${boton}</td>
            </tr>
        `;
    }).join("");
}

// =====================================================
// EVENTOS
// =====================================================

selectSalon.addEventListener("change", () => cargarEstudiantes(selectSalon.value));
inputBuscar.addEventListener("input", renderRoster);

// =====================================================
// INICIO
// =====================================================

(async function init() {
    const ok = await verificarSesion();
    if (!ok) return;
    await cargarCatalogoSalones();
    poblarSalones();
})();
