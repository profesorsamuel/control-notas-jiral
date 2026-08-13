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
const menuColumnas = document.getElementById("menuColumnas");

// Columnas que se pueden ocultar/mostrar (# y Estudiante siempre se ven).
const COLUMNAS = [
    { key: "salon", label: "Salón" },
    { key: "genero", label: "Género" },
    { key: "cedula", label: "Cédula" },
    { key: "fechaNacimiento", label: "F. Nacimiento" },
    { key: "celularEstudiante", label: "Celular estudiante" },
    { key: "nombrePadreAcudiente", label: "Padre / Acudiente" },
    { key: "celularAcudiente1", label: "Celular acudiente 1" },
    { key: "telefonoAcudiente2", label: "Teléfono acudiente 2" },
    { key: "correoContacto", label: "Correo de contacto" },
];
const CLAVE_COLUMNAS_OCULTAS = "infoEstudiantes_columnasOcultas";

function cargarColumnasOcultas() {
    try {
        const guardado = JSON.parse(localStorage.getItem(CLAVE_COLUMNAS_OCULTAS) || "[]");
        return new Set(Array.isArray(guardado) ? guardado : []);
    } catch {
        return new Set();
    }
}
let columnasOcultas = cargarColumnasOcultas();

function guardarColumnasOcultas() {
    localStorage.setItem(CLAVE_COLUMNAS_OCULTAS, JSON.stringify([...columnasOcultas]));
}

function aplicarColumnasVisibles() {
    COLUMNAS.forEach(({ key }) => {
        const oculta = columnasOcultas.has(key);
        document.querySelectorAll(`[data-col="${key}"]`).forEach((el) => {
            el.style.display = oculta ? "none" : "";
        });
    });
}

function pintarMenuColumnas() {
    menuColumnas.innerHTML = COLUMNAS.map(({ key, label }) => `
        <div class="form-check">
            <input class="form-check-input" type="checkbox" id="col_${key}" data-col-checkbox="${key}" ${columnasOcultas.has(key) ? "" : "checked"}>
            <label class="form-check-label" for="col_${key}">${escapeHtml(label)}</label>
        </div>`).join("");

    menuColumnas.querySelectorAll("[data-col-checkbox]").forEach((chk) => {
        chk.addEventListener("click", (e) => e.stopPropagation());
        chk.addEventListener("change", () => {
            const key = chk.dataset.colCheckbox;
            if (chk.checked) columnasOcultas.delete(key);
            else columnasOcultas.add(key);
            guardarColumnasOcultas();
            aplicarColumnasVisibles();
        });
    });
}

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

    function construirConsulta(camposExtra) {
        let q = supabase
            .from("estudiantes")
            .select(`id, nombre, salon, correo, genero${camposExtra}`)
            .eq("es_prueba", false)
            .order("salon", { ascending: true })
            .order("nombre", { ascending: true });
        if (salon && salon !== "__todos__") q = q.eq("salon", salon);
        return q;
    }

    // Algunos estudiantes ya tienen su cédula guardada desde que se
    // registraron (columna "cedula" en "estudiantes"), aunque nunca
    // hayan llenado el formulario de "Mis datos". Se intenta traer
    // esa columna; si no existe en tu base, se sigue sin ella.
    let estudiantes, errEst;
    ({ data: estudiantes, error: errEst } = await construirConsulta(", cedula"));
    if (errEst) {
        ({ data: estudiantes, error: errEst } = await construirConsulta(""));
    }

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
            cedula: extra?.cedula || est.cedula || null,
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
            <td data-col="salon">${escapeHtml(f.salon)}</td>
            <td data-col="genero">${pastillaGenero(f.genero)}</td>
            <td data-col="cedula">${escapeHtml(f.cedula) || "–"}</td>
            <td data-col="fechaNacimiento">${formatearFecha(f.fechaNacimiento)}</td>
            <td data-col="celularEstudiante">${escapeHtml(f.celularEstudiante) || "–"}</td>
            <td data-col="nombrePadreAcudiente">${escapeHtml(f.nombrePadreAcudiente) || "–"}</td>
            <td data-col="celularAcudiente1">${escapeHtml(f.celularAcudiente1) || "–"}</td>
            <td data-col="telefonoAcudiente2">${escapeHtml(f.telefonoAcudiente2) || "–"}</td>
            <td data-col="correoContacto">${escapeHtml(f.correoContacto) || "–"}</td>
        </tr>`).join("");

    aplicarColumnasVisibles();

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
pintarMenuColumnas();
