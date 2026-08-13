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
import { cedulaAEmail } from "./utils.js";

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
// Orden por columna (clic en el encabezado)
// ---------------------------------------------------------------
let ordenColumna = null; // clave de la columna por la que se está ordenando
let ordenDireccion = "asc"; // "asc" | "desc"

function compararValores(a, b) {
    const va = a ?? "";
    const vb = b ?? "";
    // Si ambos valores parecen números, comparar numéricamente.
    const na = parseFloat(va);
    const nb = parseFloat(vb);
    if (va !== "" && vb !== "" && !isNaN(na) && !isNaN(nb) && String(na) === String(va).trim() && String(nb) === String(vb).trim()) {
        return na - nb;
    }
    return String(va).localeCompare(String(vb), "es", { sensitivity: "base", numeric: true });
}

function ordenarFilas(filas) {
    if (!ordenColumna) return filas;
    const copia = [...filas];
    copia.sort((a, b) => {
        const cmp = compararValores(a[ordenColumna], b[ordenColumna]);
        return ordenDireccion === "asc" ? cmp : -cmp;
    });
    return copia;
}

function actualizarIconosOrden() {
    document.querySelectorAll(".th-ordenable").forEach((th) => {
        th.classList.remove("orden-asc", "orden-desc");
        const icono = th.querySelector(".icono-orden");
        if (th.dataset.sort === ordenColumna) {
            th.classList.add(ordenDireccion === "asc" ? "orden-asc" : "orden-desc");
            if (icono) icono.className = `fa-solid ${ordenDireccion === "asc" ? "fa-sort-up" : "fa-sort-down"} icono-orden`;
        } else if (icono) {
            icono.className = "fa-solid fa-sort icono-orden";
        }
    });
}

document.querySelectorAll(".th-ordenable").forEach((th) => {
    th.addEventListener("click", () => {
        const clave = th.dataset.sort;
        if (ordenColumna === clave) {
            ordenDireccion = ordenDireccion === "asc" ? "desc" : "asc";
        } else {
            ordenColumna = clave;
            ordenDireccion = "asc";
        }
        actualizarIconosOrden();
        // Re-aplica también el filtro de búsqueda actual, si hay texto escrito.
        const texto = inputBuscar.value.trim().toLowerCase();
        const base = texto
            ? filasActuales.filter((f) => (f.nombre || "").toLowerCase().includes(texto) || (f.cedula || "").toLowerCase().includes(texto))
            : filasActuales;
        renderizarTabla(ordenarFilas(base));
    });
});

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

    // Un estudiante puede no tener "correo" todavía en "estudiantes"
    // porque no se ha registrado (no ha creado su cuenta de acceso).
    // Mientras tanto, si ya tenemos su cédula (columna "cedula" en
    // "estudiantes"), se calcula el mismo correo "interno" que usará
    // registro.js al crear su cuenta (cedulaAEmail), para poder
    // guardar sus datos desde ya. Cuando el estudiante se registre,
    // registro.js hace upsert con onConflict "correo", así que va a
    // caer en esta misma fila y los datos se fusionan sin duplicarse.
    function correoDe(est) {
        if (est.correo) return est.correo;
        if (est.cedula) return cedulaAEmail(est.cedula);
        return null;
    }

    const correos = estudiantes.map((e) => correoDe(e)).filter(Boolean);

    const { data: datosExtra, error: errDatos } = correos.length
        ? await supabase.from("datos_estudiante").select("*").in("correo", correos)
        : { data: [], error: null };

    if (errDatos) console.error("❌ Error al cargar datos_estudiante:", errDatos);

    const datosPorCorreo = {};
    (datosExtra || []).forEach((d) => { datosPorCorreo[(d.correo || "").toLowerCase()] = d; });

    ordenColumna = null;
    ordenDireccion = "asc";
    actualizarIconosOrden();

    filasActuales = estudiantes.map((est) => {
        const correoCalculado = correoDe(est);
        const extra = datosPorCorreo[(correoCalculado || "").toLowerCase()] || null;
        return {
            correo: correoCalculado,
            // true cuando el estudiante todavía no se ha registrado y el
            // correo se calculó a partir de su cédula (no viene de "estudiantes").
            correoGenerado: !est.correo && !!correoCalculado,
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

    renderizarTabla(ordenarFilas(filasActuales));
}

// Columnas de "datos_estudiante" que se pueden editar desde aquí,
// y qué tipo de casilla usar para cada una.
const CAMPOS_EDITABLES = {
    genero: { columnaBD: "genero", tipo: "select" },
    cedula: { columnaBD: "cedula", tipo: "text" },
    fechaNacimiento: { columnaBD: "fecha_nacimiento", tipo: "date" },
    celularEstudiante: { columnaBD: "celular_estudiante", tipo: "tel" },
    nombrePadreAcudiente: { columnaBD: "nombre_padre_acudiente", tipo: "text" },
    celularAcudiente1: { columnaBD: "celular_acudiente1", tipo: "tel" },
    telefonoAcudiente2: { columnaBD: "telefono_acudiente2", tipo: "tel" },
    correoContacto: { columnaBD: "correo_contacto", tipo: "email" },
};

function celdaEditable(fila, campo) {
    const { tipo } = CAMPOS_EDITABLES[campo];
    const valor = fila[campo] ?? "";

    if (tipo === "select") {
        const v = String(valor).trim().toUpperCase();
        const sel = v === "M" || v === "MASCULINO" ? "M" : (v === "F" || v === "FEMENINO" ? "F" : "");
        return `
            <select class="celda-editable" data-correo="${escapeHtml(fila.correo || "")}" data-campo="${campo}">
                <option value="">–</option>
                <option value="M" ${sel === "M" ? "selected" : ""}>M</option>
                <option value="F" ${sel === "F" ? "selected" : ""}>F</option>
            </select>`;
    }

    const valorInput = tipo === "date" ? escapeHtml(valor) : escapeHtml(valor);
    return `<input class="celda-editable" type="${tipo}" data-correo="${escapeHtml(fila.correo || "")}" data-campo="${campo}" value="${valorInput}">`;
}

async function guardarCampo(input) {
    const correo = input.dataset.correo;
    const campo = input.dataset.campo;
    if (!correo || !campo || !CAMPOS_EDITABLES[campo]) return;

    const { columnaBD } = CAMPOS_EDITABLES[campo];
    const valorCrudo = input.value.trim();
    const valor = valorCrudo === "" ? null : valorCrudo;

    input.classList.remove("guardado", "error");

    const fila = filasActuales.find((f) => f.correo === correo);
    const yaTeniaFila = fila ? fila.tieneDatos : false;

    let error;
    if (yaTeniaFila) {
        ({ error } = await supabase.from("datos_estudiante").update({ [columnaBD]: valor }).eq("correo", correo));
    } else {
        // Primera vez que se guarda algo de este estudiante desde aquí:
        // se manda también su nombre (ya lo tenemos del listado), por si
        // esa columna es obligatoria en tu base de datos.
        const payload = { correo, [columnaBD]: valor };
        if (fila?.nombre) payload.nombre_apellido = fila.nombre;
        ({ error } = await supabase.from("datos_estudiante").insert([payload]));
    }

    if (error) {
        console.error("❌ Error al guardar:", error);
        input.classList.add("error");
        input.title = "No se pudo guardar: " + error.message;
        const detalle = [error.message, error.details, error.hint].filter(Boolean).join("\n");
        alert(
            "No se pudo guardar el cambio.\n\n" + detalle +
            "\n\nSi el mensaje habla de una columna que 'no puede ser nula' (NOT NULL), " +
            "hay que quitarle esa restricción en Supabase a las columnas de \"datos_estudiante\" " +
            "para poder editarlas una por una desde aquí."
        );
        return;
    }

    input.title = "";
    input.classList.add("guardado");
    setTimeout(() => input.classList.remove("guardado"), 1500);

    if (fila) {
        fila[campo] = valor;
        if (!yaTeniaFila) {
            fila.tieneDatos = true;
            const tr = input.closest("tr");
            if (tr) tr.classList.remove("fila-incompleta");
            const incompletos = filasActuales.filter((f) => !f.tieneDatos).length;
            textoResumen.textContent =
                `${filasActuales.length} estudiante${filasActuales.length === 1 ? "" : "s"}` +
                (incompletos > 0 ? ` · ${incompletos} sin datos llenados todavía` : "");
        }
    }
}

tabla.addEventListener("change", (e) => {
    if (e.target.classList.contains("celda-editable")) guardarCampo(e.target);
});
tabla.addEventListener("blur", (e) => {
    if (e.target.classList.contains("celda-editable") && e.target.tagName === "INPUT") guardarCampo(e.target);
}, true);

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
            <td data-col="genero">${celdaEditable(f, "genero")}</td>
            <td data-col="cedula">${celdaEditable(f, "cedula")}</td>
            <td data-col="fechaNacimiento">${celdaEditable(f, "fechaNacimiento")}</td>
            <td data-col="celularEstudiante">${celdaEditable(f, "celularEstudiante")}</td>
            <td data-col="nombrePadreAcudiente">${celdaEditable(f, "nombrePadreAcudiente")}</td>
            <td data-col="celularAcudiente1">${celdaEditable(f, "celularAcudiente1")}</td>
            <td data-col="telefonoAcudiente2">${celdaEditable(f, "telefonoAcudiente2")}</td>
            <td data-col="correoContacto">${celdaEditable(f, "correoContacto")}</td>
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
    if (!texto) { renderizarTabla(ordenarFilas(filasActuales)); return; }

    const filtradas = filasActuales.filter((f) =>
        (f.nombre || "").toLowerCase().includes(texto) ||
        (f.cedula || "").toLowerCase().includes(texto)
    );
    renderizarTabla(ordenarFilas(filtradas));
});

// ---------------------------------------------------------------
// 6) Imprimir / PDF (usa el diálogo de impresión del navegador,
//    que también permite "Guardar como PDF")
// ---------------------------------------------------------------
btnImprimir.addEventListener("click", () => window.print());

iniciar();
pintarMenuColumnas();
