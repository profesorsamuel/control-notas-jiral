import { supabase } from "./supabase.js";

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// =========================================================
// SESIÓN Y MATERIAS/SALONES DEL PROFESOR
// (combina profesor_materias + horario_profesor)
// =========================================================

let correoProfesor = "";
let nombreProfesor = "";
let misMateriasSalones = []; // [{materia, salon}, ...] sin duplicados

async function verificarSesion() {
    const { data: { user }, error: errUser } = await supabase.auth.getUser();
    if (errUser || !user) { window.location.href = "login.html"; return false; }

    correoProfesor = (user.email || "").trim().toLowerCase();

    const [{ data: materias }, { data: bloques }, { data: perfilProfesor }] = await Promise.all([
        supabase.from("profesor_materias").select("materia, salon").eq("correo_profesor", correoProfesor),
        supabase.from("horario_profesor").select("materia, salon").eq("correo_profesor", correoProfesor).eq("tipo", "clase"),
        supabase.from("profesores").select("nombre_profesor").eq("correo_profesor", correoProfesor).maybeSingle(),
    ]);

    nombreProfesor = perfilProfesor?.nombre_profesor || correoProfesor;

    const nodoNombreProfesor = document.getElementById("nombreProfesorTop");
    if (nodoNombreProfesor) nodoNombreProfesor.textContent = nombreProfesor;

    const combinadas = [...(materias || []), ...(bloques || [])].filter((m) => m.materia && m.salon);
    const vistos = new Set();
    misMateriasSalones = combinadas.filter((m) => {
        const clave = `${m.materia}|${m.salon}`;
        if (vistos.has(clave)) return false;
        vistos.add(clave);
        return true;
    });

    if (misMateriasSalones.length === 0) {
        alert("⛔ Esta cuenta no tiene materias asignadas como docente. Contacta al administrador.");
        window.location.href = "login.html";
        return false;
    }

    return true;
}

// =========================================================
// ELEMENTOS
// =========================================================

const filtroFechaDesde = document.getElementById("filtroFechaDesde");
const filtroFechaHasta = document.getElementById("filtroFechaHasta");
const botonSalon = document.getElementById("botonSalon");
const panelSalon = document.getElementById("panelSalon");
const botonMateria = document.getElementById("botonMateria");
const panelMateria = document.getElementById("panelMateria");
const filtroProfesor = document.getElementById("filtroProfesor");
const btnLimpiarFiltros = document.getElementById("btnLimpiarFiltros");
const estadoHistorial = document.getElementById("estadoHistorial");
const cuerpoTablaHistorial = document.getElementById("cuerpoTablaHistorial");

const panelDetalle = document.getElementById("panelDetalle");
const detalleFecha = document.getElementById("detalleFecha");
const detalleMateria = document.getElementById("detalleMateria");
const detalleSalon = document.getElementById("detalleSalon");
const detalleProfesor = document.getElementById("detalleProfesor");
const avisoEdicion = document.getElementById("avisoEdicion");
const cuerpoTablaDetalle = document.getElementById("cuerpoTablaDetalle");
const btnExportar = document.getElementById("btnExportar");
const opcionesExportar = document.getElementById("opcionesExportar");
const btnExportarPDF = document.getElementById("btnExportarPDF");
const btnExportarExcel = document.getElementById("btnExportarExcel");
const btnExportarCSV = document.getElementById("btnExportarCSV");
const btnCerrarDetalle = document.getElementById("btnCerrarDetalle");
const btnCorregir = document.getElementById("btnCorregir");
const btnGuardarCambios = document.getElementById("btnGuardarCambios");
const btnCancelarEdicion = document.getElementById("btnCancelarEdicion");

// El filtro de "Profesor" no aplica aquí: el profesor solo ve lo suyo.
const bloqueFiltroProfesor = filtroProfesor?.closest("div");
if (bloqueFiltroProfesor) bloqueFiltroProfesor.style.display = "none";

// =========================================================
// POBLAR FILTROS DE SALÓN / MATERIA (solo lo que da este profesor)
// Selectores de casillas múltiples (checkboxes) desplegables
// =========================================================

let salonesSeleccionados = [];
let materiasSeleccionadas = [];

function construirPanelCasillas(panel, valores, seleccionados, alCambiar) {
    if (valores.length === 0) {
        panel.innerHTML = `<p class="multiselect-vacio">No hay opciones disponibles.</p>`;
        return;
    }
    panel.innerHTML =
        `<button type="button" class="multiselect-panel-accion" data-accion="todos">Seleccionar todos</button>` +
        `<button type="button" class="multiselect-panel-accion" data-accion="ninguno">Limpiar selección</button>` +
        valores.map((v) => `
            <label class="multiselect-item">
                <input type="checkbox" value="${escapeHtml(v)}" ${seleccionados.includes(v) ? "checked" : ""}>
                <span>${escapeHtml(v)}</span>
            </label>`).join("");

    panel.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        cb.addEventListener("change", () => alCambiar());
    });
    panel.querySelector('[data-accion="todos"]').addEventListener("click", () => {
        panel.querySelectorAll('input[type="checkbox"]').forEach((cb) => (cb.checked = true));
        alCambiar();
    });
    panel.querySelector('[data-accion="ninguno"]').addEventListener("click", () => {
        panel.querySelectorAll('input[type="checkbox"]').forEach((cb) => (cb.checked = false));
        alCambiar();
    });
}

function leerCasillasMarcadas(panel) {
    return [...panel.querySelectorAll('input[type="checkbox"]:checked')].map((cb) => cb.value);
}

function actualizarTextoBoton(boton, seleccionados, etiquetaTodos, singular) {
    if (seleccionados.length === 0) boton.textContent = etiquetaTodos;
    else if (seleccionados.length === 1) boton.textContent = seleccionados[0];
    else if (seleccionados.length <= 2) boton.textContent = seleccionados.join(", ");
    else boton.textContent = `${seleccionados.length} ${singular} seleccionados`;
}

function poblarFiltros() {
    const salonesDisponibles = [...new Set(misMateriasSalones.map((m) => m.salon))].sort();
    construirPanelCasillas(panelSalon, salonesDisponibles, salonesSeleccionados, alCambiarSalones);
    actualizarTextoBoton(botonSalon, salonesSeleccionados, "Todos los salones", "salones");
    poblarMateriasSegunSalon();
}

function alCambiarSalones() {
    salonesSeleccionados = leerCasillasMarcadas(panelSalon);
    actualizarTextoBoton(botonSalon, salonesSeleccionados, "Todos los salones", "salones");
    poblarMateriasSegunSalon();
    buscarHistorial();
}

// El profesor puede dar la misma materia en varios salones, pero con contenidos
// distintos por grado. Al elegir uno o más salones, la lista de materias se
// reduce solo a las que ese profesor dicta EN ESOS salones.
function poblarMateriasSegunSalon() {
    const combinacionesValidas = salonesSeleccionados.length > 0
        ? misMateriasSalones.filter((m) => salonesSeleccionados.includes(m.salon))
        : misMateriasSalones;

    const materiasDisponibles = [...new Set(combinacionesValidas.map((m) => m.materia))].sort();

    // Descarta materias seleccionadas que ya no aplican al salón elegido
    materiasSeleccionadas = materiasSeleccionadas.filter((m) => materiasDisponibles.includes(m));

    construirPanelCasillas(panelMateria, materiasDisponibles, materiasSeleccionadas, alCambiarMaterias);
    actualizarTextoBoton(botonMateria, materiasSeleccionadas, "Todas las materias", "materias");
}

function alCambiarMaterias() {
    materiasSeleccionadas = leerCasillasMarcadas(panelMateria);
    actualizarTextoBoton(botonMateria, materiasSeleccionadas, "Todas las materias", "materias");
    buscarHistorial();
}

// Abrir/cerrar los paneles desplegables
function alternarPanel(boton, panel, otroPanel) {
    const abierto = panel.style.display === "block";
    otroPanel.style.display = "none";
    panel.style.display = abierto ? "none" : "block";
    boton.setAttribute("aria-expanded", String(!abierto));
    boton.classList.toggle("abierto", !abierto);
}

botonSalon.addEventListener("click", (e) => {
    e.stopPropagation();
    alternarPanel(botonSalon, panelSalon, panelMateria);
});
botonMateria.addEventListener("click", (e) => {
    e.stopPropagation();
    alternarPanel(botonMateria, panelMateria, panelSalon);
});
document.addEventListener("click", () => {
    panelSalon.style.display = "none";
    panelMateria.style.display = "none";
    botonSalon.classList.remove("abierto");
    botonMateria.classList.remove("abierto");
});
panelSalon.addEventListener("click", (e) => e.stopPropagation());
panelMateria.addEventListener("click", (e) => e.stopPropagation());

// =========================================================
// BUSCAR Y PINTAR LA LISTA
// =========================================================

let cabecerasCache = []; // resultado de la última búsqueda, para abrir detalle sin reconsultar

async function buscarHistorial() {
    estadoHistorial.textContent = "Buscando...";
    cuerpoTablaHistorial.innerHTML = "";
    panelDetalle.style.display = "none";

    let consulta = supabase
        .from("asistencias")
        .select("id, fecha, materia, salon, notas_profesor")
        .eq("correo_profesor", correoProfesor)
        .order("fecha", { ascending: false })
        .limit(100);

    if (filtroFechaDesde.value) consulta = consulta.gte("fecha", filtroFechaDesde.value);
    if (filtroFechaHasta.value) consulta = consulta.lte("fecha", filtroFechaHasta.value);
    if (salonesSeleccionados.length > 0) consulta = consulta.in("salon", salonesSeleccionados);
    if (materiasSeleccionadas.length > 0) consulta = consulta.in("materia", materiasSeleccionadas);

    const { data, error } = await consulta;

    if (error) {
        estadoHistorial.textContent = "❌ Error al buscar: " + error.message;
        return;
    }

    cabecerasCache = data || [];

    if (cabecerasCache.length === 0) {
        estadoHistorial.textContent = "No hay asistencias que coincidan con estos filtros.";
        document.getElementById("panelAlertas").style.display = "none";
        return;
    }

    estadoHistorial.textContent = `${cabecerasCache.length} resultado(s).`;

    cuerpoTablaHistorial.innerHTML = cabecerasCache.map((fila) => {
        const fechaTexto = new Date(fila.fecha + "T00:00:00").toLocaleDateString("es-PA", { year: "numeric", month: "short", day: "numeric" });
        return `
        <tr>
            <td>${escapeHtml(fechaTexto)}</td>
            <td>${escapeHtml(fila.materia)}</td>
            <td>${escapeHtml(fila.salon)}</td>
            <td>${escapeHtml(nombreProfesor)}</td>
            <td><button type="button" class="btn-tomar-asistencia btn-ver-detalle" data-id="${fila.id}">Ver detalle</button></td>
        </tr>`;
    }).join("");

    cuerpoTablaHistorial.querySelectorAll(".btn-ver-detalle").forEach((btn) => {
        btn.addEventListener("click", () => abrirDetalle(btn.dataset.id));
    });

    calcularAlertas(cabecerasCache);
}

filtroFechaDesde.addEventListener("change", buscarHistorial);
filtroFechaHasta.addEventListener("change", buscarHistorial);

btnLimpiarFiltros.addEventListener("click", () => {
    filtroFechaDesde.value = "";
    filtroFechaHasta.value = "";
    salonesSeleccionados = [];
    materiasSeleccionadas = [];
    poblarFiltros();
    buscarHistorial();
});

// =========================================================
// ALERTAS: estudiantes con tardanzas frecuentes o ausencias sin justificar
// (se recalcula sobre los mismos registros que se ven arriba, según filtros)
// =========================================================

const UMBRAL_TARDANZAS = 3;
const UMBRAL_AUSENCIAS_SIN_EXCUSA = 3;

async function calcularAlertas(cabeceras) {
    const panelAlertas = document.getElementById("panelAlertas");
    const metaAlertas = document.getElementById("metaAlertas");
    const listaAlertas = document.getElementById("listaAlertas");
    if (!panelAlertas) return;

    if (!cabeceras || cabeceras.length === 0) {
        panelAlertas.style.display = "none";
        return;
    }

    const ids = cabeceras.map((c) => c.id);
    const { data: detalles, error } = await supabase
        .from("asistencia_detalle")
        .select("estudiante_id, estado, justificacion")
        .in("asistencia_id", ids);

    if (error || !detalles || detalles.length === 0) {
        panelAlertas.style.display = "none";
        return;
    }

    const conteos = {}; // estudiante_id -> { tardanzas, ausenciasSinExcusa }
    detalles.forEach((d) => {
        if (!conteos[d.estudiante_id]) conteos[d.estudiante_id] = { tardanzas: 0, ausenciasSinExcusa: 0 };
        if (d.estado === "tardanza") conteos[d.estudiante_id].tardanzas++;
        if (d.estado === "ausente" && !d.justificacion) conteos[d.estudiante_id].ausenciasSinExcusa++;
    });

    const entradasAlerta = Object.entries(conteos)
        .filter(([, c]) => c.tardanzas >= UMBRAL_TARDANZAS || c.ausenciasSinExcusa >= UMBRAL_AUSENCIAS_SIN_EXCUSA)
        .sort((a, b) => (b[1].tardanzas + b[1].ausenciasSinExcusa) - (a[1].tardanzas + a[1].ausenciasSinExcusa));

    if (entradasAlerta.length === 0) {
        panelAlertas.style.display = "none";
        return;
    }

    const { data: estudiantes } = await supabase
        .from("estudiantes")
        .select("id, nombre")
        .in("id", entradasAlerta.map(([id]) => id));

    const nombrePorId = Object.fromEntries((estudiantes || []).map((e) => [e.id, e.nombre]));

    metaAlertas.textContent = `Según los ${cabeceras.length} registro(s) mostrados abajo · umbral: ${UMBRAL_TARDANZAS}+ tardanzas o ${UMBRAL_AUSENCIAS_SIN_EXCUSA}+ ausencias sin justificar`;

    listaAlertas.innerHTML = entradasAlerta.map(([id, c]) => {
        const badges = [];
        if (c.tardanzas > 0) {
            const fuerte = c.tardanzas >= UMBRAL_TARDANZAS ? " badge-fuerte" : "";
            badges.push(`<span class="badge-alerta badge-tardanza${fuerte}">🕒 ${c.tardanzas} tardanza${c.tardanzas === 1 ? "" : "s"}</span>`);
        }
        if (c.ausenciasSinExcusa > 0) {
            const fuerte = c.ausenciasSinExcusa >= UMBRAL_AUSENCIAS_SIN_EXCUSA ? " badge-fuerte" : "";
            badges.push(`<span class="badge-alerta badge-ausencia${fuerte}">🚫 ${c.ausenciasSinExcusa} ausencia${c.ausenciasSinExcusa === 1 ? "" : "s"} sin justificar</span>`);
        }
        return `<li><span class="nombre-alerta">${escapeHtml(nombrePorId[id] || id)}</span><span class="badges-alerta">${badges.join("")}</span></li>`;
    }).join("");

    panelAlertas.style.display = "block";
}

// =========================================================
// ABRIR EL DETALLE DE UNA ASISTENCIA
// =========================================================

const ETIQUETAS_ESTADO = {
    presente: "🟢 Presente",
    ausente: "🔴 Ausente",
    tardanza: "🟡 Tardanza",
    permiso: "🔵 Permiso",
};

let detalleActualCache = { fila: null, estudiantes: [] }; // para exportar sin reconsultar

async function abrirDetalle(asistenciaId) {
    const fila = cabecerasCache.find((c) => c.id === asistenciaId);
    if (!fila) return;

    const { data: detalle, error } = await supabase
        .from("asistencia_detalle")
        .select("estudiante_id, estado, observacion, justificacion, adjunto_url")
        .eq("asistencia_id", asistenciaId);

    if (error) {
        alert("❌ Error al cargar el detalle: " + error.message);
        return;
    }

    const idsEstudiantes = (detalle || []).map((d) => d.estudiante_id);
    const { data: estudiantes } = await supabase
        .from("estudiantes")
        .select("id, nombre")
        .in("id", idsEstudiantes.length > 0 ? idsEstudiantes : ["00000000-0000-0000-0000-000000000000"]);

    const nombrePorId = Object.fromEntries((estudiantes || []).map((e) => [e.id, e.nombre]));

    const filasOrdenadas = [...(detalle || [])].sort((a, b) =>
        (nombrePorId[a.estudiante_id] || "").localeCompare(nombrePorId[b.estudiante_id] || "")
    );

    detalleActualCache = { fila, filasOrdenadas, nombrePorId };

    const fechaTexto = new Date(fila.fecha + "T00:00:00").toLocaleDateString("es-PA", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    detalleFecha.textContent = fechaTexto;
    detalleMateria.textContent = fila.materia;
    detalleSalon.textContent = fila.salon;
    detalleProfesor.textContent = nombreProfesor;

    salirModoEdicion();
    renderTablaDetalle(filasOrdenadas, nombrePorId, false);

    panelDetalle.style.display = "block";
    panelDetalle.scrollIntoView({ behavior: "smooth" });
}

// =========================================================
// RENDERIZAR EL DETALLE (modo lectura o modo edición)
// =========================================================

const OPCIONES_ESTADO = [
    ["presente", "🟢 Presente"],
    ["ausente", "🔴 Ausente"],
    ["tardanza", "🟡 Tardanza"],
    ["permiso", "🔵 Permiso"],
];

function renderTablaDetalle(filasOrdenadas, nombrePorId, editable) {
    if (!editable) {
        cuerpoTablaDetalle.innerHTML = filasOrdenadas.map((d) => {
            const obsJust = [d.observacion, d.justificacion].filter(Boolean).join(" — ");
            return `
            <tr>
                <td>${escapeHtml(nombrePorId[d.estudiante_id] || d.estudiante_id)}</td>
                <td>${ETIQUETAS_ESTADO[d.estado] || escapeHtml(d.estado)}</td>
                <td>${escapeHtml(obsJust || "—")}</td>
                <td>${d.adjunto_url ? `<a href="${d.adjunto_url}" target="_blank" rel="noopener">Ver</a>` : "—"}</td>
            </tr>`;
        }).join("");
        return;
    }

    cuerpoTablaDetalle.innerHTML = filasOrdenadas.map((d) => {
        const opciones = OPCIONES_ESTADO.map(([valor, etiqueta]) =>
            `<option value="${valor}" ${d.estado === valor ? "selected" : ""}>${etiqueta}</option>`
        ).join("");
        return `
        <tr class="fila-editable" data-estudiante="${escapeHtml(d.estudiante_id)}">
            <td>${escapeHtml(nombrePorId[d.estudiante_id] || d.estudiante_id)}</td>
            <td><select class="editor-estado">${opciones}</select></td>
            <td>
                <div class="campos-editables">
                    <input type="text" class="editor-observacion" placeholder="Observación" value="${escapeHtml(d.observacion || "")}">
                    <input type="text" class="editor-justificacion" placeholder="Justificación" value="${escapeHtml(d.justificacion || "")}">
                </div>
            </td>
            <td>${d.adjunto_url ? `<a href="${d.adjunto_url}" target="_blank" rel="noopener">Ver</a>` : "—"}</td>
        </tr>`;
    }).join("");
}

function salirModoEdicion() {
    avisoEdicion.classList.remove("activo");
    btnCorregir.style.display = "";
    btnGuardarCambios.style.display = "none";
    btnCancelarEdicion.style.display = "none";
}

btnCorregir.addEventListener("click", () => {
    const { filasOrdenadas, nombrePorId } = detalleActualCache;
    if (!filasOrdenadas) return;
    renderTablaDetalle(filasOrdenadas, nombrePorId, true);
    avisoEdicion.classList.add("activo");
    btnCorregir.style.display = "none";
    btnGuardarCambios.style.display = "";
    btnCancelarEdicion.style.display = "";
});

btnCancelarEdicion.addEventListener("click", () => {
    const { filasOrdenadas, nombrePorId } = detalleActualCache;
    if (!filasOrdenadas) return;
    renderTablaDetalle(filasOrdenadas, nombrePorId, false);
    salirModoEdicion();
});

btnGuardarCambios.addEventListener("click", async () => {
    const { fila } = detalleActualCache;
    if (!fila) return;

    const filasEditadas = [...cuerpoTablaDetalle.querySelectorAll(".fila-editable")];
    if (filasEditadas.length === 0) return;

    const textoOriginal = btnGuardarCambios.textContent;
    btnGuardarCambios.disabled = true;
    btnGuardarCambios.textContent = "Guardando...";

    try {
        const actualizaciones = filasEditadas.map((tr) => {
            const estudianteId = tr.dataset.estudiante;
            const estado = tr.querySelector(".editor-estado").value;
            const observacion = tr.querySelector(".editor-observacion").value.trim();
            const justificacion = tr.querySelector(".editor-justificacion").value.trim();

            return supabase
                .from("asistencia_detalle")
                .update({ estado, observacion: observacion || null, justificacion: justificacion || null })
                .eq("asistencia_id", fila.id)
                .eq("estudiante_id", estudianteId);
        });

        const resultados = await Promise.all(actualizaciones);
        const conError = resultados.find((r) => r.error);

        if (conError) {
            alert("❌ Algunos cambios no se pudieron guardar: " + conError.error.message);
        } else {
            estadoHistorial.textContent = "✅ Asistencia corregida correctamente.";
        }

        await abrirDetalle(fila.id); // recarga desde la base de datos y sale de edición
        calcularAlertas(cabecerasCache); // los contadores de alerta pueden haber cambiado
    } catch (err) {
        console.error("❌ Error al guardar los cambios:", err);
        alert("No se pudieron guardar los cambios. Revisa tu conexión e intenta de nuevo.");
    } finally {
        btnGuardarCambios.disabled = false;
        btnGuardarCambios.textContent = textoOriginal;
    }
});

btnCerrarDetalle.addEventListener("click", () => {
    panelDetalle.style.display = "none";
    opcionesExportar.style.display = "none";
});

// =========================================================
// EXPORTAR (PDF / Excel / CSV) — del detalle abierto actualmente
// =========================================================

btnExportar.addEventListener("click", () => {
    opcionesExportar.style.display = opcionesExportar.style.display === "none" ? "block" : "none";
});

function nombreArchivoBase() {
    const { fila } = detalleActualCache;
    return `asistencia_${fila.materia}_${fila.salon}_${fila.fecha}`.replace(/\s+/g, "_");
}

btnExportarCSV.addEventListener("click", () => {
    const { filasOrdenadas, nombrePorId } = detalleActualCache;
    if (!filasOrdenadas) return;

    const encabezados = ["Estudiante", "Estado", "Observación", "Justificación"];
    const filasCsv = filasOrdenadas.map((d) => [
        nombrePorId[d.estudiante_id] || d.estudiante_id,
        d.estado,
        d.observacion || "",
        d.justificacion || "",
    ]);

    const csv = [encabezados, ...filasCsv]
        .map((fila) => fila.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(","))
        .join("\n");

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(blob);
    enlace.download = `${nombreArchivoBase()}.csv`;
    enlace.click();
    URL.revokeObjectURL(enlace.href);
    opcionesExportar.style.display = "none";
});

btnExportarPDF.addEventListener("click", async () => {
    const { fila, filasOrdenadas, nombrePorId } = detalleActualCache;
    if (!filasOrdenadas) return;

    try {
        const { jsPDF } = await import("https://esm.sh/jspdf@2.5.1");
        const { default: autoTable } = await import("https://esm.sh/jspdf-autotable@3.8.2");

        const doc = new jsPDF();
        doc.setFontSize(14);
        doc.text(`Asistencia — ${fila.materia} / ${fila.salon}`, 14, 15);
        doc.setFontSize(10);
        doc.text(`Fecha: ${fila.fecha}   Profesor: ${nombreProfesor}`, 14, 22);

        autoTable(doc, {
            head: [["Estudiante", "Estado", "Observación", "Justificación"]],
            body: filasOrdenadas.map((d) => [
                nombrePorId[d.estudiante_id] || d.estudiante_id,
                d.estado,
                d.observacion || "",
                d.justificacion || "",
            ]),
            startY: 28,
            styles: { fontSize: 8 },
        });

        doc.save(`${nombreArchivoBase()}.pdf`);
    } catch (error) {
        console.error("❌ Error al exportar PDF:", error);
        alert("No se pudo generar el PDF. Revisa tu conexión e intenta de nuevo.");
    }
    opcionesExportar.style.display = "none";
});

btnExportarExcel.addEventListener("click", async () => {
    const { filasOrdenadas, nombrePorId } = detalleActualCache;
    if (!filasOrdenadas) return;

    try {
        const XLSX = await import("https://esm.sh/xlsx@0.18.5");

        const encabezados = ["Estudiante", "Estado", "Observación", "Justificación"];
        const filas = filasOrdenadas.map((d) => [
            nombrePorId[d.estudiante_id] || d.estudiante_id,
            d.estado,
            d.observacion || "",
            d.justificacion || "",
        ]);

        const hoja = XLSX.utils.aoa_to_sheet([encabezados, ...filas]);
        const libro = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(libro, hoja, "Asistencia");
        XLSX.writeFile(libro, `${nombreArchivoBase()}.xlsx`);
    } catch (error) {
        console.error("❌ Error al exportar Excel:", error);
        alert("No se pudo generar el Excel. Revisa tu conexión e intenta de nuevo.");
    }
    opcionesExportar.style.display = "none";
});

// =========================================================
// EXPORTAR PDF DEL TRIMESTRE COMPLETO
// (todas las clases registradas por este profesor, sin filtrar por fecha)
// =========================================================

const btnExportarTrimestre = document.getElementById("btnExportarTrimestre");

btnExportarTrimestre?.addEventListener("click", async () => {
    const textoOriginal = btnExportarTrimestre.textContent;
    btnExportarTrimestre.disabled = true;
    btnExportarTrimestre.textContent = "Generando PDF...";

    try {
        let consulta = supabase
            .from("asistencias")
            .select("fecha, materia, salon, notas_profesor")
            .eq("correo_profesor", correoProfesor)
            .order("materia", { ascending: true })
            .order("fecha", { ascending: true })
            .limit(1000);

        // Respeta los filtros de salón/materia activos, si el profesor ya filtró algo
        if (salonesSeleccionados.length > 0) consulta = consulta.in("salon", salonesSeleccionados);
        if (materiasSeleccionadas.length > 0) consulta = consulta.in("materia", materiasSeleccionadas);

        const { data, error } = await consulta;

        if (error) {
            alert("❌ Error al generar el reporte: " + error.message);
            return;
        }

        if (!data || data.length === 0) {
            alert("No hay registros de asistencia para generar el reporte.");
            return;
        }

        const { jsPDF } = await import("https://esm.sh/jspdf@2.5.1");
        const { default: autoTable } = await import("https://esm.sh/jspdf-autotable@3.8.2");

        const doc = new jsPDF();
        const fechaGeneracion = new Date().toLocaleDateString("es-PA", { year: "numeric", month: "long", day: "numeric" });

        doc.setFontSize(15);
        doc.text("Reporte de asistencia del trimestre", 14, 16);
        doc.setFontSize(10);
        doc.setTextColor(90);
        doc.text(`Profesor: ${nombreProfesor}`, 14, 24);
        doc.text(`Generado el: ${fechaGeneracion}`, 14, 29);
        doc.setTextColor(0);

        autoTable(doc, {
            head: [["Fecha", "Materia", "Salón", "Observaciones"]],
            body: data.map((fila) => [
                new Date(fila.fecha + "T00:00:00").toLocaleDateString("es-PA", { year: "numeric", month: "short", day: "numeric" }),
                fila.materia,
                fila.salon,
                fila.notas_profesor || "—",
            ]),
            startY: 35,
            styles: { fontSize: 8, cellPadding: 3 },
            headStyles: { fillColor: [24, 40, 73] },
            columnStyles: { 3: { cellWidth: 70 } },
        });

        doc.save(`asistencia_trimestre_${nombreProfesor}.pdf`.replace(/\s+/g, "_"));
    } catch (err) {
        console.error("❌ Error al exportar el trimestre:", err);
        alert("No se pudo generar el PDF. Revisa tu conexión e intenta de nuevo.");
    } finally {
        btnExportarTrimestre.disabled = false;
        btnExportarTrimestre.textContent = textoOriginal;
    }
});

// =========================================================
// INICIO
// =========================================================

(async function init() {
    const ok = await verificarSesion();
    if (!ok) return;

    // Si vienen desde un enlace con fecha/salon/materia en la URL, precargar.
    const parametros = new URLSearchParams(window.location.search);
    if (parametros.get("fecha")) {
        filtroFechaDesde.value = parametros.get("fecha");
        filtroFechaHasta.value = parametros.get("fecha");
    }
    if (parametros.get("desde")) filtroFechaDesde.value = parametros.get("desde");
    if (parametros.get("hasta")) filtroFechaHasta.value = parametros.get("hasta");
    if (parametros.get("salon")) salonesSeleccionados = [parametros.get("salon")];
    if (parametros.get("materia")) materiasSeleccionadas = [parametros.get("materia")];
    poblarFiltros();

    await buscarHistorial();
})();
