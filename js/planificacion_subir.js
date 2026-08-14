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
    const el = document.getElementById("estadoPlanificacion");
    el.textContent = mensaje;
    el.style.color = esError ? "#c0392b" : "#2e7d32";
}

const TAMANO_MAXIMO_MB = 50;

// =========================================================
// ESTADO
// =========================================================

let correoProfesor = "";
let misMaterias = []; // [{materia, salon}, ...]

let archivoLibro = null;
let archivoPrograma = null;

// =========================================================
// ELEMENTOS
// =========================================================

const selectMateria = document.getElementById("selectMateriaPlanificacion");
const btnAnalizarPdfs = document.getElementById("btnAnalizarPdfs");

const zonas = {
    libro: {
        zona: document.getElementById("zonaLibro"),
        input: document.getElementById("inputLibro"),
        btnElegir: document.getElementById("btnElegirLibro"),
        btnQuitar: document.getElementById("btnQuitarLibro"),
        nombreEl: document.getElementById("nombreArchivoLibro"),
    },
    programa: {
        zona: document.getElementById("zonaPrograma"),
        input: document.getElementById("inputPrograma"),
        btnElegir: document.getElementById("btnElegirPrograma"),
        btnQuitar: document.getElementById("btnQuitarPrograma"),
        nombreEl: document.getElementById("nombreArchivoPrograma"),
    },
};

// =========================================================
// 1) VERIFICAR SESIÓN (mismo patrón que tareas.js / mi_horario.js)
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
// 2) CARGAR MIS MATERIAS (desde profesor_materias existente)
// =========================================================

async function cargarMisMaterias() {
    const { data, error } = await supabase
        .from("profesor_materias")
        .select("materia, salon")
        .eq("correo_profesor", correoProfesor);

    if (error) {
        console.error("❌ Error al cargar materias:", error);
        selectMateria.innerHTML = `<option value="">Error al cargar</option>`;
        return;
    }

    const vistos = new Set();
    misMaterias = (data || []).filter((m) => {
        if (!m.materia || vistos.has(m.materia)) return false;
        vistos.add(m.materia);
        return true;
    });

    if (misMaterias.length === 0) {
        selectMateria.innerHTML = `<option value="">No tienes materias asignadas</option>`;
        return;
    }

    selectMateria.innerHTML = `<option value="">Selecciona una materia</option>` +
        misMaterias.map((m) => `<option value="${escapeHtml(m.materia)}">${escapeHtml(m.materia)}</option>`).join("");
}

// =========================================================
// 3) ZONAS DE SUBIDA (libro / programa)
// =========================================================

function validarPdf(archivo) {
    if (!archivo) return "No se seleccionó ningún archivo.";
    const esPdfPorTipo = archivo.type === "application/pdf";
    const esPdfPorNombre = /\.pdf$/i.test(archivo.name || "");
    if (!esPdfPorTipo && !esPdfPorNombre) return "El archivo debe ser un PDF.";
    const tamanoMb = archivo.size / (1024 * 1024);
    if (tamanoMb > TAMANO_MAXIMO_MB) return `El archivo pesa ${tamanoMb.toFixed(1)} MB; el máximo permitido es ${TAMANO_MAXIMO_MB} MB.`;
    return null;
}

function pintarZona(tipo, archivo, errorTexto) {
    const { zona, nombreEl, btnElegir, btnQuitar } = zonas[tipo];

    zona.classList.remove("tiene-archivo", "error");

    if (errorTexto) {
        zona.classList.add("error");
        nombreEl.textContent = `⚠️ ${errorTexto}`;
        btnElegir.classList.remove("d-none");
        btnQuitar.classList.add("d-none");
        return;
    }

    if (archivo) {
        zona.classList.add("tiene-archivo");
        const tamanoMb = (archivo.size / (1024 * 1024)).toFixed(1);
        nombreEl.textContent = `✅ ${archivo.name} (${tamanoMb} MB)`;
        btnElegir.classList.add("d-none");
        btnQuitar.classList.remove("d-none");
        return;
    }

    nombreEl.textContent = "";
    btnElegir.classList.remove("d-none");
    btnQuitar.classList.add("d-none");
}

function manejarSeleccion(tipo, archivo) {
    const error = validarPdf(archivo);

    if (error) {
        pintarZona(tipo, null, error);
        if (tipo === "libro") archivoLibro = null; else archivoPrograma = null;
        actualizarBotonAnalizar();
        return;
    }

    pintarZona(tipo, archivo, null);
    if (tipo === "libro") archivoLibro = archivo; else archivoPrograma = archivo;
    actualizarBotonAnalizar();
}

function quitarArchivo(tipo) {
    zonas[tipo].input.value = "";
    if (tipo === "libro") archivoLibro = null; else archivoPrograma = null;
    pintarZona(tipo, null, null);
    actualizarBotonAnalizar();
}

zonas.libro.btnElegir.addEventListener("click", () => zonas.libro.input.click());
zonas.libro.btnQuitar.addEventListener("click", () => quitarArchivo("libro"));
zonas.libro.input.addEventListener("change", (e) => manejarSeleccion("libro", e.target.files[0] || null));

zonas.programa.btnElegir.addEventListener("click", () => zonas.programa.input.click());
zonas.programa.btnQuitar.addEventListener("click", () => quitarArchivo("programa"));
zonas.programa.input.addEventListener("change", (e) => manejarSeleccion("programa", e.target.files[0] || null));

// =========================================================
// 4) HABILITAR BOTÓN "ANALIZAR PDFS"
// =========================================================

function actualizarBotonAnalizar() {
    const listo = !!selectMateria.value && !!archivoLibro && !!archivoPrograma;
    btnAnalizarPdfs.disabled = !listo;
}

selectMateria.addEventListener("change", actualizarBotonAnalizar);

// =========================================================
// 5) ANALIZAR PDFS
// -----------------------------------------------------------
// Paso pequeño 1 (este archivo): valida materia + 2 PDFs y los
// deja listos en memoria (archivoLibro / archivoPrograma).
// Paso pequeño 2 (siguiente entrega): esta función llamará a la
// Edge Function "parsear-libro" con supabase.functions.invoke(),
// mostrará la tabla de temas detectados para revisar/corregir, y
// al confirmar hará el insert en "temas_programa".
// =========================================================

async function analizarPdfs() {
    if (!selectMateria.value || !archivoLibro || !archivoPrograma) return;

    btnAnalizarPdfs.disabled = true;
    mostrarEstado("Archivos listos. La conexión con el analizador (Edge Function) se agrega en el siguiente paso.");

    console.log("📖 Materia seleccionada:", selectMateria.value);
    console.log("📖 Libro:", archivoLibro.name, archivoLibro.size, "bytes");
    console.log("📖 Programa:", archivoPrograma.name, archivoPrograma.size, "bytes");

    btnAnalizarPdfs.disabled = false;
}

btnAnalizarPdfs.addEventListener("click", analizarPdfs);

// =========================================================
// INICIO
// =========================================================

(async function init() {
    const ok = await verificarSesion();
    if (!ok) return;
    await cargarMisMaterias();
    actualizarBotonAnalizar();
})();
