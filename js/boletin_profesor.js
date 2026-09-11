import { supabase } from "./supabase.js";

// =====================================================
// PLANILLA DE NOTAS FINALES (ESTILO "CALIFICACIÓN POR MATERIA")
// =====================================================
// El docente elige Salón + Asignatura y ve, para todos los estudiantes
// de ese salón, el promedio de I Trimestre, II Trimestre, III Trimestre
// y la Calificación Final, en una sola planilla (igual estructura que
// el sistema anterior de la escuela). Cada fila también tiene un enlace
// para abrir el boletín completo (todas las materias) de ese estudiante.

const TRIMESTRES = ["Trimestre 1", "Trimestre 2", "Trimestre 3"];
const NOTA_MINIMA_APROBAR = 3;

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

const selectSalon = document.getElementById("selectSalon");
const selectMateria = document.getElementById("selectMateria");
const inputBuscar = document.getElementById("inputBuscar");
const estadoCarga = document.getElementById("estadoCarga");
const panelPlanilla = document.getElementById("panelPlanilla");
const cuerpoPlanilla = document.getElementById("cuerpoPlanilla");
const nombreProfesorHeader = document.getElementById("nombreProfesorHeader");
const btnImprimirPlanilla = document.getElementById("btnImprimirPlanilla");
const btnPdfPlanilla = document.getElementById("btnPdfPlanilla");

let misAsignaciones = []; // [{materia, salon}]
let mapaSalones = {};     // codigo -> {nivel, letra, nombre_visible, orden}
let filasPlanillaActual = []; // resultado calculado para la materia/salón actuales
let salonActual = "";
let materiaActual = "";
let nombreDocenteActual = "";

// =====================================================
// SESIÓN
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

    nombreDocenteActual = perfilProfesor?.nombre_profesor || correoProfesor;
    if (nombreProfesorHeader) nombreProfesorHeader.textContent = nombreDocenteActual;

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
// POBLAR SELECTS
// =====================================================

function poblarSalones() {
    const salones = [...new Set(misAsignaciones.map((a) => a.salon))]
        .sort((a, b) => (mapaSalones[a]?.orden ?? 0) - (mapaSalones[b]?.orden ?? 0));

    selectSalon.innerHTML = `<option value="">Selecciona un salón</option>` +
        salones.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(nombreVisibleSalon(s))}</option>`).join("");
}

function poblarMaterias() {
    const salon = selectSalon.value;

    if (!salon) {
        selectMateria.innerHTML = `<option value="">Selecciona primero un salón</option>`;
        selectMateria.disabled = true;
        panelPlanilla.style.display = "none";
        return;
    }

    const materias = misAsignaciones.filter((a) => a.salon === salon).map((a) => a.materia);
    selectMateria.disabled = false;

    if (materias.length === 1) {
        selectMateria.innerHTML = `<option value="${escapeHtml(materias[0])}" selected>${escapeHtml(materias[0])}</option>`;
        cargarPlanilla();
        return;
    }

    selectMateria.innerHTML = `<option value="">Selecciona una asignatura</option>` +
        materias.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
    panelPlanilla.style.display = "none";
}

// =====================================================
// CARGAR NOTAS DE TODO EL SALÓN PARA LA MATERIA ELEGIDA
// (mismo patrón de estudiante_id + respaldo por correo que usa
// profesor.js, para no perder notas antiguas).
// =====================================================

async function cargarPlanilla() {
    const salon = selectSalon.value;
    const materia = selectMateria.value;
    if (!salon || !materia) return;

    salonActual = salon;
    materiaActual = materia;

    estadoCarga.textContent = "Cargando notas...";
    panelPlanilla.style.display = "none";

    const { data: estudiantesSalon, error: errEst } = await supabase
        .from("estudiantes")
        .select("id, codigo, nombre, cedula, correo, es_prueba")
        .eq("salon", salon)
        .order("nombre", { ascending: true });

    if (errEst) {
        estadoCarga.textContent = "";
        alert("No se pudieron cargar los estudiantes: " + errEst.message);
        return;
    }

    const estudiantes = (estudiantesSalon || []).filter((e) => !e.es_prueba);
    const todosLosIds = estudiantes.map((e) => e.id);
    const correoAId = {};
    estudiantes.forEach((e) => { if (e.correo) correoAId[e.correo] = e.id; });
    const correosActuales = Object.keys(correoAId);

    // notas_por_estudiante[estudianteId][trimestre] = [ {tipo, nota, estado}, ... ]
    const notasPorEstudiante = {};
    function registrar(estudianteId, n) {
        if (!notasPorEstudiante[estudianteId]) notasPorEstudiante[estudianteId] = {};
        if (!notasPorEstudiante[estudianteId][n.trimestre]) notasPorEstudiante[estudianteId][n.trimestre] = [];
        notasPorEstudiante[estudianteId][n.trimestre].push(n);
    }

    if (todosLosIds.length > 0) {
        const { data } = await supabase.from("notas")
            .select("estudiante_id, correo, trimestre, tipo, nota, estado")
            .eq("materia", materia).in("estudiante_id", todosLosIds)
            .is("eliminado_en", null);
        (data || []).forEach((n) => registrar(n.estudiante_id, n));
    }
    if (correosActuales.length > 0) {
        const { data } = await supabase.from("notas")
            .select("estudiante_id, correo, trimestre, tipo, nota, estado")
            .eq("materia", materia).in("correo", correosActuales)
            .is("eliminado_en", null);
        (data || []).forEach((n) => {
            if (n.estudiante_id) return; // ya se registró arriba
            const idEst = correoAId[n.correo];
            if (idEst) registrar(idEst, n);
        });
    }

    function calcularPromedio(valores) {
        if (valores.length === 0) return null;
        return valores.reduce((a, b) => a + b, 0) / valores.length;
    }

    function promedioTrimestre(notasTrimestre) {
        if (!notasTrimestre || notasTrimestre.length === 0) return null;
        const porTipo = { apreciacion: [], ejercicio: [], examen: [] };
        notasTrimestre.forEach((n) => {
            const tipoNorm = (n.tipo || "").toLowerCase();
            if (tipoNorm !== "apreciacion" && tipoNorm !== "ejercicio" && tipoNorm !== "examen") return;
            const valor = n.estado === "Intencional" ? 0 : Number(n.nota);
            porTipo[tipoNorm].push(valor);
        });
        const promApr = calcularPromedio(porTipo.apreciacion);
        const promEje = calcularPromedio(porTipo.ejercicio);
        const promExa = calcularPromedio(porTipo.examen);
        const presentes = [promApr, promEje, promExa].filter((v) => v !== null);
        return presentes.length ? presentes.reduce((a, b) => a + b, 0) / presentes.length : null;
    }

    filasPlanillaActual = estudiantes.map((e) => {
        const notasEst = notasPorEstudiante[e.id] || {};
        const porTrimestre = TRIMESTRES.map((t) => promedioTrimestre(notasEst[t]));
        const presentes = porTrimestre.filter((v) => v !== null);
        const promFinal = presentes.length ? presentes.reduce((a, b) => a + b, 0) / presentes.length : null;

        return {
            codigo: e.codigo,
            nombre: e.nombre,
            cedula: e.cedula,
            t1: porTrimestre[0],
            t2: porTrimestre[1],
            t3: porTrimestre[2],
            final: promFinal,
            fracaso: promFinal !== null && promFinal < NOTA_MINIMA_APROBAR
        };
    });

    estadoCarga.textContent = "";
    renderPlanilla();
}

// =====================================================
// RENDER
// =====================================================

function renderPlanilla() {
    const filtro = inputBuscar.value.trim().toLowerCase();
    const filas = filtro
        ? filasPlanillaActual.filter((f) => (f.nombre || "").toLowerCase().includes(filtro))
        : filasPlanillaActual;

    panelPlanilla.style.display = "block";

    if (filas.length === 0) {
        cuerpoPlanilla.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#64748b; padding:14px;">No hay estudiantes que coincidan.</td></tr>`;
        return;
    }

    const celda = (valor, trimestreNombre) => {
        const url = `profesor.html?salon=${encodeURIComponent(salonActual)}&materia=${encodeURIComponent(materiaActual)}&trimestre=${encodeURIComponent(trimestreNombre)}`;
        const titulo = valor === null
            ? `Agregar notas de ${trimestreNombre}`
            : `Editar notas de ${trimestreNombre}`;
        const texto = valor === null ? "-" : valor.toFixed(2);
        const fallo = valor !== null && valor < NOTA_MINIMA_APROBAR;
        return `<td${fallo ? ' class="nota-fallo"' : ""}><a class="celda-editar" href="${url}" target="_blank" title="${titulo}">${texto}</a></td>`;
    };

    cuerpoPlanilla.innerHTML = filas.map((f) => {
        const finalTexto = f.final !== null ? f.final.toFixed(2) : "-";
        const boton = f.cedula
            ? `<a class="btn-mini-boletin" href="boletin_trimestral.html?cedula=${encodeURIComponent(f.cedula)}" target="_blank">Ver boletín</a>`
            : `<span style="color:#b91c1c; font-size:11px;">Sin cédula</span>`;

        return `
            <tr>
                <td>${escapeHtml(f.codigo || "-")}</td>
                <td class="col-cedula">${escapeHtml(f.cedula || "-")}</td>
                <td class="col-nombre">${escapeHtml(f.nombre || "-")}</td>
                ${celda(f.t1, "Trimestre 1")}
                ${celda(f.t2, "Trimestre 2")}
                ${celda(f.t3, "Trimestre 3")}
                <td class="col-final${f.fracaso ? " fallo" : ""}">${finalTexto}</td>
                <td>${boton}</td>
            </tr>
        `;
    }).join("");
}

// =====================================================
// EVENTOS
// =====================================================

selectSalon.addEventListener("change", poblarMaterias);
selectMateria.addEventListener("change", cargarPlanilla);
inputBuscar.addEventListener("input", renderPlanilla);

btnImprimirPlanilla.addEventListener("click", () => window.print());

btnPdfPlanilla.addEventListener("click", () => {
    if (filasPlanillaActual.length === 0) return;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "landscape" });

    doc.setFontSize(13);
    doc.text("C.E.B.G. EL JIRAL - Planilla de Notas Finales", 14, 15);
    doc.setFontSize(10);
    doc.text(`Salón: ${nombreVisibleSalon(salonActual)}   |   Asignatura: ${materiaActual}   |   Docente: ${nombreDocenteActual}`, 14, 22);

    const filtro = inputBuscar.value.trim().toLowerCase();
    const filas = filtro
        ? filasPlanillaActual.filter((f) => (f.nombre || "").toLowerCase().includes(filtro))
        : filasPlanillaActual;

    const cuerpo = filas.map((f) => [
        f.codigo || "-",
        f.cedula || "-",
        f.nombre || "-",
        f.t1 !== null ? f.t1.toFixed(2) : "-",
        f.t2 !== null ? f.t2.toFixed(2) : "-",
        f.t3 !== null ? f.t3.toFixed(2) : "-",
        f.final !== null ? f.final.toFixed(2) : "-"
    ]);

    doc.autoTable({
        head: [["Código", "Cédula", "Nombre", "I Tri.", "II Tri.", "III Tri.", "Cal. Final"]],
        body: cuerpo,
        startY: 28,
        styles: { fontSize: 9, halign: "center" },
        headStyles: { fillColor: [30, 58, 138], textColor: 255 },
        columnStyles: { 2: { halign: "left", fontStyle: "bold" } },
        didParseCell: (data) => {
            if (data.section !== "body") return;
            const fila = filas[data.row.index];
            const valor = [null, null, null, fila.t1, fila.t2, fila.t3, fila.final][data.column.index];
            if (data.column.index >= 3 && valor !== null && valor < NOTA_MINIMA_APROBAR) {
                data.cell.styles.fillColor = [254, 226, 226];
                data.cell.styles.textColor = [185, 28, 28];
                data.cell.styles.fontStyle = "bold";
            }
        }
    });

    doc.save(`Planilla_${salonActual}_${materiaActual}.pdf`.replace(/\s+/g, "_"));
});

// =====================================================
// INICIO
// =====================================================

(async function init() {
    const ok = await verificarSesion();
    if (!ok) return;
    await cargarCatalogoSalones();
    poblarSalones();
})();
