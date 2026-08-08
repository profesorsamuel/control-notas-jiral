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
    if (document.getElementById("panelCuadricula")?.style.display !== "none") cargarCuadricula();
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
    if (document.getElementById("panelCuadricula")?.style.display !== "none") cargarCuadricula();
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
    suspendida: "⬜ Suspendida",
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
    ["suspendida", "⬜ Suspendida"],
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
    // Este reporte exporta la CUADRÍCULA (estudiante × fecha × estado) tal
    // cual está en pantalla, para que el PDF siempre coincida con lo que el
    // profesor ve y ya corrigió. Por eso exige que la cuadrícula esté abierta
    // y cargada con exactamente una materia y un salón (los mismos requisitos
    // que ya tiene el botón "Ver cuadrícula del trimestre").
    if (materiasSeleccionadas.length !== 1 || salonesSeleccionados.length !== 1) {
        alert("⬆️ Arriba en los filtros, elige exactamente UNA materia y UN salón antes de imprimir.");
        return;
    }

    if (panelCuadricula.style.display === "none" || !cuerpoCuadricula.children.length) {
        alert('Primero haz clic en "📊 Ver cuadrícula del trimestre" para cargar la asistencia, y luego imprime.');
        return;
    }

    const textoOriginal = btnExportarTrimestre.textContent;
    btnExportarTrimestre.disabled = true;
    btnExportarTrimestre.textContent = "Generando PDF...";

    try {
        const { jsPDF } = await import("https://esm.sh/jspdf@2.5.1");
        const { default: autoTable } = await import("https://esm.sh/jspdf-autotable@3.8.2");

        const doc = new jsPDF({ orientation: "landscape" });
        const fechaGeneracion = new Date().toLocaleDateString("es-PA", { year: "numeric", month: "long", day: "numeric" });
        const materia = materiasSeleccionadas[0];
        const salon = salonesSeleccionados[0];

        doc.setFontSize(15);
        doc.text("Reporte de asistencia del trimestre", 14, 15);
        doc.setFontSize(10);
        doc.setTextColor(90);
        doc.text(`Profesor: ${nombreProfesor}`, 14, 22);
        doc.text(`Materia: ${materia} — Salón: ${salon}`, 14, 27);
        doc.text(`Generado el: ${fechaGeneracion}`, 14, 32);
        doc.setTextColor(0);

        // Toma la cuadrícula tal cual está renderizada en la página (incluye
        // los encabezados de SEMANA/fecha y la columna de Nota al final).
        autoTable(doc, {
            html: "#tablaCuadricula",
            startY: 37,
            styles: { fontSize: 7, cellPadding: 2, halign: "center", valign: "middle" },
            headStyles: { fillColor: [24, 40, 73], fontSize: 7 },
            columnStyles: { 0: { halign: "left", cellWidth: 38 } },
            // El botón 🔔 dentro de cada encabezado de fecha es un enlace;
            // autoTable ya extrae solo el texto de la celda, así que no
            // aparece en el PDF, pero por si acaso lo limpiamos también.
            didParseCell: (data) => {
                data.cell.text = data.cell.text.map((t) => t.replace("🔔", "").trim());
            },
        });

        doc.save(`asistencia_trimestre_${materia}_${salon}_${nombreProfesor}.pdf`.replace(/\s+/g, "_"));
    } catch (err) {
        console.error("❌ Error al exportar el trimestre:", err);
        alert("No se pudo generar el PDF. Revisa tu conexión e intenta de nuevo.");
    } finally {
        btnExportarTrimestre.disabled = false;
        btnExportarTrimestre.textContent = textoOriginal;
    }
});

// =========================================================
// CUADRÍCULA DEL TRIMESTRE: estudiantes (filas) x fechas (columnas)
// =========================================================
// Muestra TODA la asistencia de una materia/salón en una sola tabla,
// con una fecha por columna (solo los días de la semana en que esa
// clase tiene horario, para no llenar de columnas vacías de fin de
// semana ni de días que no le tocan). Cada celda se puede corregir
// con un clic, sin salir de la cuadrícula.

const btnVerCuadricula = document.getElementById("btnVerCuadricula");
const btnCerrarCuadricula = document.getElementById("btnCerrarCuadricula");
const panelCuadricula = document.getElementById("panelCuadricula");
const avisoCuadricula = document.getElementById("avisoCuadricula");
const subtituloCuadricula = document.getElementById("subtituloCuadricula");
const envolturaCuadricula = document.getElementById("envolturaCuadricula");
const cabezaCuadricula = document.getElementById("cabezaCuadricula");
const cuerpoCuadricula = document.getElementById("cuerpoCuadricula");

const DIAS_SEMANA_CUAD = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

function quitarAcentosCuad(texto) {
    return String(texto ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const CICLO_ESTADOS_CUAD = ["presente", "ausente", "tardanza", "permiso", "suspendida"];
const ETIQUETAS_CORTAS_CUAD = { presente: "P", ausente: "A", tardanza: "T", permiso: "Pe", suspendida: "Susp" };

// =========================================================
// NOTA DE ASISTENCIA (columna final de la cuadrícula)
// =========================================================
// Empieza en NOTA_MAXIMA y se resta por cada ausencia/tardanza. Presente,
// Permiso y días sin registrar (el "P" por defecto) no restan. Los días
// suspendidos (columna completa o celda individual) no cuentan para nada.
// Ajusta estos 3 números si cambia el criterio de calificación.
const NOTA_MAXIMA = 5;
const PUNTOS_POR_AUSENCIA = 1;
const PUNTOS_POR_TARDANZA = 0.5;

function calcularNotaAsistencia(estadosDelEstudiante) {
    let nota = NOTA_MAXIMA;
    estadosDelEstudiante.forEach((estado) => {
        if (estado === "ausente") nota -= PUNTOS_POR_AUSENCIA;
        else if (estado === "tardanza") nota -= PUNTOS_POR_TARDANZA;
        // presente, permiso, suspendida (o sin registrar) no restan.
    });
    return Math.max(0, Math.round(nota * 10) / 10);
}

// Fechas ISO (ascendente) entre desde/hasta cuyo día de la semana esté
// en diasPermitidos (Set de strings sin acentos, ej. {"lunes","miercoles"}).
// Si diasPermitidos viene vacío, se usa de lunes a viernes por defecto.
function generarFechasCuadricula(desdeISO, hastaISO, diasPermitidos) {
    const permitidos = diasPermitidos && diasPermitidos.size > 0
        ? diasPermitidos
        : new Set(["lunes", "martes", "miercoles", "jueves", "viernes"]);

    const fechas = [];
    const cursor = new Date(desdeISO + "T00:00:00");
    const limite = new Date(hastaISO + "T00:00:00");

    while (cursor <= limite && fechas.length < 200) {
        const diaTexto = DIAS_SEMANA_CUAD[cursor.getDay()];
        if (permitidos.has(diaTexto)) {
            const y = cursor.getFullYear();
            const m = String(cursor.getMonth() + 1).padStart(2, "0");
            const d = String(cursor.getDate()).padStart(2, "0");
            fechas.push(`${y}-${m}-${d}`);
        }
        cursor.setDate(cursor.getDate() + 1);
    }
    return fechas;
}

// asistencia_id por fecha (para no volver a hacer upsert de la
// cabecera si ya se creó al hacer clic en otra celda de esa columna).
let cabeceraIdPorFechaCuad = {};

async function averiguarDiasDeClase(materia, salon) {
    const [{ data: filasViejas }, { data: filasHorario }] = await Promise.all([
        supabase.from("profesor_materias").select("dia").eq("correo_profesor", correoProfesor).eq("materia", materia).eq("salon", salon),
        supabase.from("horario_profesor").select("dia").eq("correo_profesor", correoProfesor).eq("materia", materia).eq("salon", salon).eq("tipo", "clase"),
    ]);

    const dias = new Set();
    [...(filasViejas || []), ...(filasHorario || [])].forEach((f) => {
        const dia = quitarAcentosCuad((f.dia || "").trim().toLowerCase());
        if (dia) dias.add(dia);
    });
    return dias;
}

async function cargarCuadricula() {
    avisoCuadricula.className = "aviso-cuadricula";
    envolturaCuadricula.style.display = "none";
    cabezaCuadricula.innerHTML = "";
    cuerpoCuadricula.innerHTML = "";
    cabeceraIdPorFechaCuad = {};

    if (materiasSeleccionadas.length !== 1 || salonesSeleccionados.length !== 1) {
        avisoCuadricula.textContent = "⬆️ Arriba en los filtros, elige exactamente UNA materia y UN salón para ver su cuadrícula del trimestre.";
        avisoCuadricula.classList.add("error");
        return;
    }

    const materia = materiasSeleccionadas[0];
    const salon = salonesSeleccionados[0];

    // Si no hay rango de fechas puesto en los filtros, usa por defecto
    // los últimos ~90 días (aprox. un trimestre) hasta hoy.
    if (!filtroFechaHasta.value) filtroFechaHasta.value = obtenerFechaHoyISOCuad();
    if (!filtroFechaDesde.value) {
        const hace90 = new Date();
        hace90.setDate(hace90.getDate() - 90);
        filtroFechaDesde.value = hace90.toISOString().slice(0, 10);
    }
    const desde = filtroFechaDesde.value;
    const hasta = filtroFechaHasta.value;

    avisoCuadricula.textContent = "Cargando cuadrícula...";

    // Todos los días de lunes a viernes del rango (nunca fines de semana),
    // sin importar si ese día en particular tenía clase programada — así
    // se ven también los huecos donde falta tomar/registrar asistencia.
    const fechas = generarFechasCuadricula(desde, hasta, null);

    if (fechas.length === 0) {
        avisoCuadricula.textContent = "Revisa el rango de fechas: no generó ningún día de lunes a viernes.";
        avisoCuadricula.classList.add("error");
        return;
    }

    const { data: estudiantes, error: errEstudiantes } = await supabase
        .from("estudiantes")
        .select("id, nombre")
        .eq("salon", salon)
        .order("nombre", { ascending: true });

    if (errEstudiantes) {
        avisoCuadricula.textContent = "❌ Error al cargar estudiantes: " + errEstudiantes.message;
        avisoCuadricula.classList.add("error");
        return;
    }

    if (!estudiantes || estudiantes.length === 0) {
        avisoCuadricula.textContent = "Ese salón todavía no tiene estudiantes registrados.";
        avisoCuadricula.classList.add("error");
        return;
    }

    const { data: cabeceras, error: errCabeceras } = await supabase
        .from("asistencias")
        .select("id, fecha")
        .eq("correo_profesor", correoProfesor)
        .eq("materia", materia)
        .eq("salon", salon)
        .gte("fecha", desde)
        .lte("fecha", hasta);

    if (errCabeceras) {
        avisoCuadricula.textContent = "❌ Error al cargar asistencias: " + errCabeceras.message;
        avisoCuadricula.classList.add("error");
        return;
    }

    (cabeceras || []).forEach((c) => { cabeceraIdPorFechaCuad[c.fecha] = c.id; });

    const idsCabeceras = (cabeceras || []).map((c) => c.id);
    let detalles = [];
    if (idsCabeceras.length > 0) {
        const { data: filasDetalle, error: errDetalle } = await supabase
            .from("asistencia_detalle")
            .select("asistencia_id, estudiante_id, estado")
            .in("asistencia_id", idsCabeceras);
        if (errDetalle) {
            avisoCuadricula.textContent = "❌ Error al cargar el detalle: " + errDetalle.message;
            avisoCuadricula.classList.add("error");
            return;
        }
        detalles = filasDetalle || [];
    }

    const idAFecha = Object.fromEntries((cabeceras || []).map((c) => [c.id, c.fecha]));
    const estadoPorEstudianteFecha = {}; // "estudianteId|||fecha" -> estado
    detalles.forEach((d) => {
        const fecha = idAFecha[d.asistencia_id];
        if (fecha) estadoPorEstudianteFecha[`${d.estudiante_id}|||${fecha}`] = d.estado;
    });

    // --- Días suspendidos (excepciones_horario) dentro del rango ---
    // "escuela": aplica a todos. "profesor": aplica a todas tus clases ese
    // día. "salon": aplica a este salón puntual. Solo se toman en cuenta
    // las suspensiones de "dia_completo" (no franjas específicas), porque
    // aquí no sabemos en qué franja cae cada materia.
    const { data: excepciones, error: errExcepciones } = await supabase
        .from("excepciones_horario")
        .select("fecha, alcance, correo_profesor, salon, tipo, motivo")
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .eq("tipo", "dia_completo");

    const motivoSuspensionPorFecha = {};
    if (!errExcepciones) {
        (excepciones || []).forEach((exc) => {
            const aplica =
                exc.alcance === "escuela" ||
                (exc.alcance === "profesor" && exc.correo_profesor === correoProfesor) ||
                (exc.alcance === "salon" && exc.salon === salon);
            if (aplica) motivoSuspensionPorFecha[exc.fecha] = exc.motivo || "Suspendida";
        });
    }

    // --- Pintar encabezado, agrupado por semana (como tu hoja de cálculo) ---
    const LETRA_DIA = { lunes: "L", martes: "M", miercoles: "M", jueves: "J", viernes: "V", sabado: "S", domingo: "D" };

    // Lunes de la semana de cada fecha, para agrupar columnas de la misma semana.
    function lunesDeLaSemana(fechaISO) {
        const d = new Date(fechaISO + "T00:00:00");
        const diaSemana = d.getDay(); // 0=domingo..6=sabado
        const desplazamiento = diaSemana === 0 ? -6 : 1 - diaSemana; // retrocede hasta el lunes
        d.setDate(d.getDate() + desplazamiento);
        return d.toISOString().slice(0, 10);
    }

    const gruposSemana = []; // [{ inicio, fechas: [...] }]
    fechas.forEach((f) => {
        const inicio = lunesDeLaSemana(f);
        let grupo = gruposSemana[gruposSemana.length - 1];
        if (!grupo || grupo.inicio !== inicio) {
            grupo = { inicio, fechas: [] };
            gruposSemana.push(grupo);
        }
        grupo.fechas.push(f);
    });

    const filaSemanas = gruposSemana.map((g, i) =>
        `<th colspan="${g.fechas.length}">SEMANA ${i + 1}</th>`
    ).join("");

    const filaDias = fechas.map((f) => {
        const d = new Date(f + "T00:00:00");
        const dia = DIAS_SEMANA_CUAD[d.getDay()];
        const dd = String(d.getDate()).padStart(2, "0");
        const suspendida = Boolean(motivoSuspensionPorFecha[f]);
        const claseSuspendida = suspendida ? " th-suspendida" : "";
        const tituloTh = suspendida ? `${f} — Suspendida: ${motivoSuspensionPorFecha[f]}` : f;
        // El icono 🔔 abre (en pestaña nueva) el panel donde ya se marcan
        // suspensiones/cambios de horario, con la fecha y el salón listos.
        return `
            <th class="${claseSuspendida}" title="${escapeHtml(tituloTh)}">
                ${LETRA_DIA[dia] || "?"}<br>${dd}
                <a href="excepciones_horario.html?fecha=${f}&salon=${encodeURIComponent(salon)}" target="_blank" rel="noopener" class="link-suspender" title="Marcar/gestionar suspensión de este día">🔔</a>
            </th>`;
    }).join("");

    cabezaCuadricula.innerHTML = `
        <tr>
            <th class="col-estudiante-cuadricula" rowspan="2">Estudiante</th>
            ${filaSemanas}
            <th class="col-nota-cuadricula" rowspan="2" title="Nota de asistencia: empieza en ${NOTA_MAXIMA}, −${PUNTOS_POR_AUSENCIA} por ausencia, −${PUNTOS_POR_TARDANZA} por tardanza. Permiso y días suspendidos no afectan.">Nota</th>
        </tr>
        <tr>${filaDias}</tr>
    `;

    // --- Pintar filas de estudiantes ---
    // Si un día no tiene asistencia registrada todavía, se muestra como
    // "Presente" por defecto (más rápido de revisar) — salvo que ese día
    // esté marcado como suspendido en excepciones_horario, en cuyo caso
    // se muestra "Susp" en gris. Ambos casos siguen siendo editables con
    // un clic por si hace falta corregir a un estudiante en particular
    // (salvo el "Susp" bloqueado del día completo).
    cuerpoCuadricula.innerHTML = estudiantes.map((est) => {
        const estadosParaNota = []; // solo lo que SÍ cuenta para la nota

        const celdasHtml = fechas.map((f) => {
            const estadoGuardado = estadoPorEstudianteFecha[`${est.id}|||${f}`] || "";
            const suspendida = Boolean(motivoSuspensionPorFecha[f]);

            if (suspendida && !estadoGuardado) {
                // Día suspendido y sin registro individual: se deja fija en
                // "Susp" (no editable, no cuenta para la nota) hasta que se
                // quite/corrija la excepción con el 🔔.
                return `<td class="celda-suspendida celda-bloqueada" data-estudiante="${est.id}" data-fecha="${f}" title="Día suspendido: ${escapeHtml(motivoSuspensionPorFecha[f])}. Para cambiar esta celda, primero corrige/quita la suspensión con 🔔.">Susp</td>`;
            }

            const sinRegistrar = !estadoGuardado;
            const estadoMostrado = estadoGuardado || "presente";
            estadosParaNota.push(estadoMostrado);

            const clase = `celda-${estadoMostrado}${sinRegistrar ? " celda-sin-registrar" : ""}`;
            const texto = ETIQUETAS_CORTAS_CUAD[estadoMostrado];
            return `<td class="celda-clic ${clase}" data-estudiante="${est.id}" data-fecha="${f}" data-estado="${estadoGuardado}" title="${sinRegistrar ? "Sin registrar (mostrando Presente por defecto) — haz clic para corregir" : ""}">${texto}</td>`;
        }).join("");

        const nota = calcularNotaAsistencia(estadosParaNota);

        return `
        <tr>
            <td class="col-estudiante-cuadricula">${escapeHtml(est.nombre)}</td>
            ${celdasHtml}
            <td class="col-nota-cuadricula">${nota.toFixed(1)}</td>
        </tr>`;
    }).join("");

    envolturaCuadricula.style.display = "block";
    subtituloCuadricula.textContent = `${materia} — ${salon} · ${estudiantes.length} estudiante(s) · ${fechas.length} día(s) hábil(es), del ${desde} al ${hasta}. Las celdas con "—" son días sin asistencia registrada todavía.`;
    avisoCuadricula.textContent = "";

    cuerpoCuadricula.querySelectorAll("td.celda-clic").forEach((celda) => {
        celda.addEventListener("click", () => alHacerClicCelda(celda, materia, salon));
    });
}

function obtenerFechaHoyISOCuad() {
    const hoy = new Date();
    const y = hoy.getFullYear();
    const m = String(hoy.getMonth() + 1).padStart(2, "0");
    const d = String(hoy.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

// Después de guardar un clic, recalcula solo la nota de esa fila (sin
// tener que volver a consultar toda la cuadrícula).
function recalcularNotaDeFila(celda) {
    const fila = celda.closest("tr");
    if (!fila) return;

    const estadosParaNota = [];
    fila.querySelectorAll("td.celda-clic[data-estado]").forEach((c) => {
        estadosParaNota.push(c.dataset.estado || "presente");
    });

    const celdaNota = fila.querySelector(".col-nota-cuadricula");
    if (celdaNota) celdaNota.textContent = calcularNotaAsistencia(estadosParaNota).toFixed(1);
}

async function alHacerClicCelda(celda, materia, salon) {
    const estudianteId = celda.dataset.estudiante;
    const fecha = celda.dataset.fecha;
    const estadoActual = celda.dataset.estado;

    const indiceActual = CICLO_ESTADOS_CUAD.indexOf(estadoActual);
    const nuevoEstado = CICLO_ESTADOS_CUAD[(indiceActual + 1) % CICLO_ESTADOS_CUAD.length];

    const estadoAnterior = estadoActual;
    const textoAnterior = celda.textContent;
    const claseAnterior = celda.className;

    // Cambio optimista en pantalla mientras se guarda.
    celda.className = `celda-clic celda-guardando celda-${nuevoEstado}`;
    celda.textContent = ETIQUETAS_CORTAS_CUAD[nuevoEstado];

    try {
        let asistenciaId = cabeceraIdPorFechaCuad[fecha];

        if (!asistenciaId) {
            const { data: cabecera, error: errCabecera } = await supabase
                .from("asistencias")
                .upsert(
                    { correo_profesor: correoProfesor, materia, salon, fecha },
                    { onConflict: "materia,salon,fecha" }
                )
                .select("id")
                .single();
            if (errCabecera) throw errCabecera;
            asistenciaId = cabecera.id;
            cabeceraIdPorFechaCuad[fecha] = asistenciaId;
        }

        const { error: errDetalle } = await supabase
            .from("asistencia_detalle")
            .upsert(
                { asistencia_id: asistenciaId, estudiante_id: estudianteId, estado: nuevoEstado },
                { onConflict: "asistencia_id,estudiante_id" }
            );
        if (errDetalle) throw errDetalle;

        celda.dataset.estado = nuevoEstado;
        celda.className = `celda-clic celda-${nuevoEstado}`;
        recalcularNotaDeFila(celda);
    } catch (error) {
        console.error("❌ Error al guardar la celda:", error);
        celda.dataset.estado = estadoAnterior;
        celda.className = claseAnterior;
        celda.textContent = textoAnterior;
        alert("No se pudo guardar ese cambio. Revisa tu conexión e intenta de nuevo.");
    }
}

btnVerCuadricula?.addEventListener("click", async () => {
    panelCuadricula.style.display = "block";
    panelCuadricula.scrollIntoView({ behavior: "smooth" });
    await cargarCuadricula();
});

btnCerrarCuadricula?.addEventListener("click", () => {
    panelCuadricula.style.display = "none";
});

// Si abriste el 🔔 en pestaña nueva para marcar una suspensión y vuelves
// aquí, refresca sola para que se vea reflejada sin tener que recargar.
window.addEventListener("focus", () => {
    if (panelCuadricula.style.display !== "none") cargarCuadricula();
});

// Si la cuadrícula está abierta y el profesor cambia los filtros
// (fechas, materia o salón), la recarga automáticamente.
[filtroFechaDesde, filtroFechaHasta].forEach((input) => {
    input.addEventListener("change", () => {
        if (panelCuadricula.style.display !== "none") cargarCuadricula();
    });
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
