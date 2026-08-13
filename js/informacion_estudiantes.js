// =========================================================
// informacion_estudiantes.js
// Página para ver, por salón (o todos los salones a la vez),
// toda la información que cada estudiante llenó en "Mis datos"
// (cédula, fecha de nacimiento, género, teléfonos, nombre del
// padre/acudiente, etc.), cruzando:
//   - "estudiantes"      -> id, nombre, salon, correo, genero
//   - "datos_estudiante" -> el resto de los datos, por correo
//
// Acceso: admin (ve cualquier salón o todos) y consejero
// (ve solo su propio salón, con las demás materias/página que
// ya usa). Si la cuenta no tiene ninguno de los dos roles, se
// manda de vuelta al login.
// =========================================================

import { supabase } from "./supabase.js";
import { pintarCambiarPanel, obtenerRolesDeCuenta } from "./roles.js";

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function formatearFecha(fechaTexto) {
    if (!fechaTexto) return "–";
    const [anio, mes, dia] = fechaTexto.split("-");
    if (!anio || !mes || !dia) return "–";
    return `${dia}/${mes}/${anio}`;
}

function pastillaGenero(g) {
    const valor = String(g ?? "").trim().toUpperCase();
    if (valor === "M" || valor === "MASCULINO") return `<span class="pastilla-genero M">M</span>`;
    if (valor === "F" || valor === "FEMENINO") return `<span class="pastilla-genero F">F</span>`;
    return `<span class="pastilla-genero sin">–</span>`;
}

const selectSalon = document.getElementById("selectSalonInfo");
const inputBuscar = document.getElementById("buscarEstudianteInfo");
const btnImprimir = document.getElementById("btnImprimirInfo");
const textoResumen = document.getElementById("textoResumen");
const tabla = document.getElementById("tablaInfoEstudiantes");

let modo = null; // "admin" | "consejero"
let salonConsejero = "";
let filasActuales = []; // último set cargado, para poder filtrar por texto sin volver a consultar

// ---------------------------------------------------------------
// 1) Verificar sesión y rol
// ---------------------------------------------------------------
async function iniciar() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
        window.location.href = "login.html";
        return;
    }

    const { esAdmin, consejeroInfo } = await obtenerRolesDeCuenta(user.id, user.email);

    if (esAdmin) modo = "admin";
    else if (consejeroInfo) { modo = "consejero"; salonConsejero = consejeroInfo.salon || ""; }

    if (!modo) {
        alert("⛔ Esta página es solo para administradores o consejeros(as).");
        window.location.href = "login.html";
        return;
    }

    pintarCambiarPanel(modo, "claro-sobre-oscuro");

    if (modo === "consejero") {
        // El consejero solo ve su salón: no tiene sentido mostrarle el selector.
        selectSalon.innerHTML = `<option value="${escapeHtml(salonConsejero)}">${escapeHtml(salonConsejero)}</option>`;
        selectSalon.disabled = true;
        await cargarInformacion(salonConsejero);
        return;
    }

    await cargarSalonesAdmin();
}

// ---------------------------------------------------------------
// 2) Cargar lista de salones (solo para admin)
// ---------------------------------------------------------------
async function cargarSalonesAdmin() {
    const { data, error } = await supabase
        .from("estudiantes")
        .select("salon")
        .eq("es_prueba", false);

    if (error) {
        console.error("❌ Error al cargar salones:", error);
        selectSalon.innerHTML = `<option value="">Error al cargar salones</option>`;
        return;
    }

    const salones = [...new Set((data || []).map((e) => e.salon).filter(Boolean))].sort();

    selectSalon.innerHTML =
        `<option value="__todos__">Todos los salones</option>` +
        salones.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");

    selectSalon.addEventListener("change", () => cargarInformacion(selectSalon.value));

    // Por defecto, arranca mostrando todos los salones.
    await cargarInformacion("__todos__");
}

// ---------------------------------------------------------------
// 3) Cargar estudiantes + sus datos, para un salón o para todos
// ---------------------------------------------------------------
async function cargarInformacion(salon) {
    tabla.innerHTML = `<tr><td colspan="11" class="text-center text-muted py-4">Cargando...</td></tr>`;
    textoResumen.textContent = "";

    let consultaEstudiantes = supabase
        .from("estudiantes")
        .select("id, nombre, salon, correo, genero")
        .eq("es_prueba", false)
        .order("salon", { ascending: true })
        .order("nombre", { ascending: true });

    if (salon && salon !== "__todos__") {
        consultaEstudiantes = consultaEstudiantes.eq("salon", salon);
    }

    const { data: estudiantes, error: errEst } = await consultaEstudiantes;

    if (errEst) {
        console.error("❌ Error al cargar estudiantes:", errEst);
        tabla.innerHTML = `<tr><td colspan="11" class="text-center text-danger py-4">No se pudo cargar la información.</td></tr>`;
        return;
    }

    if (!estudiantes || estudiantes.length === 0) {
        tabla.innerHTML = `<tr><td colspan="11" class="text-center text-muted py-4">No hay estudiantes registrados en este salón.</td></tr>`;
        return;
    }

    const correos = estudiantes.map((e) => e.correo).filter(Boolean);

    const { data: datosExtra, error: errDatos } = correos.length
        ? await supabase.from("datos_estudiante").select("*").in("correo", correos)
        : { data: [], error: null };

    if (errDatos) console.error("❌ Error al cargar datos_estudiante:", errDatos);

    const datosPorCorreo = {};
    (datosExtra || []).forEach((d) => { datosPorCorreo[(d.correo || "").toLowerCase()] = d; });

    filasActuales = estudiantes.map((est) => {
        const extra = datosPorCorreo[(est.correo || "").toLowerCase()] || null;
        return {
            nombre: est.nombre,
            salon: est.salon,
            // Si el estudiante ya definió su género en "Mis datos", ese manda;
            // si no, se usa el que se le haya puesto directo en el listado.
            genero: extra?.genero || est.genero || null,
            cedula: extra?.cedula || null,
            fechaNacimiento: extra?.fecha_nacimiento || null,
            celularEstudiante: extra?.celular_estudiante || null,
            nombrePadreAcudiente: extra?.nombre_padre_acudiente || null,
            celularAcudiente1: extra?.celular_acudiente1 || null,
            telefonoAcudiente2: extra?.telefono_acudiente2 || null,
            correoContacto: extra?.correo_contacto || null,
            tieneDatos: !!extra,
        };
    });

    renderizarTabla(filasActuales);
}

// ---------------------------------------------------------------
// 4) Pintar la tabla (según lo cargado + el texto de búsqueda)
// ---------------------------------------------------------------
function renderizarTabla(filas) {
    if (filas.length === 0) {
        tabla.innerHTML = `<tr><td colspan="11" class="text-center text-muted py-4">Sin resultados.</td></tr>`;
        textoResumen.textContent = "";
        return;
    }

    tabla.innerHTML = filas.map((f, i) => `
        <tr class="${f.tieneDatos ? "" : "fila-incompleta"}">
            <td>${i + 1}</td>
            <td class="nombre">${escapeHtml(f.nombre)}</td>
            <td>${escapeHtml(f.salon)}</td>
            <td>${pastillaGenero(f.genero)}</td>
            <td>${escapeHtml(f.cedula) || "–"}</td>
            <td>${formatearFecha(f.fechaNacimiento)}</td>
            <td>${escapeHtml(f.celularEstudiante) || "–"}</td>
            <td>${escapeHtml(f.nombrePadreAcudiente) || "–"}</td>
            <td>${escapeHtml(f.celularAcudiente1) || "–"}</td>
            <td>${escapeHtml(f.telefonoAcudiente2) || "–"}</td>
            <td>${escapeHtml(f.correoContacto) || "–"}</td>
        </tr>`).join("");

    const incompletos = filas.filter((f) => !f.tieneDatos).length;
    textoResumen.textContent =
        `${filas.length} estudiante${filas.length === 1 ? "" : "s"}` +
        (incompletos > 0 ? ` · ${incompletos} sin datos llenados todavía` : "");
}

// ---------------------------------------------------------------
// 5) Buscador (filtra en memoria lo ya cargado, por nombre o cédula)
// ---------------------------------------------------------------
inputBuscar.addEventListener("input", () => {
    const texto = inputBuscar.value.trim().toLowerCase();
    if (!texto) { renderizarTabla(filasActuales); return; }

    const filtradas = filasActuales.filter((f) =>
        (f.nombre || "").toLowerCase().includes(texto) ||
        (f.cedula || "").toLowerCase().includes(texto)
    );
    renderizarTabla(filtradas);
});

// ---------------------------------------------------------------
// 6) Imprimir / PDF (usa el diálogo de impresión del navegador,
//    que también permite "Guardar como PDF")
// ---------------------------------------------------------------
btnImprimir.addEventListener("click", () => window.print());

iniciar();
