import { supabase } from "./supabase.js";

// =====================================================
// ESTUDIANTES EN RIESGO — TODOS LOS SALONES
// =====================================================
// Recorre TODAS las combinaciones de salón + materia que tiene
// asignadas el docente, calcula el promedio de Trimestre 1 y
// Trimestre 2 de cada estudiante, y para los que van mal, calcula qué
// nota necesitarían sacar en Trimestre 3 para terminar con la nota
// mínima de aprobación (por defecto 3.0). Todo en una sola lista.

const TRIMESTRES = ["Trimestre 1", "Trimestre 2", "Trimestre 3"];

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// Redondeo matemático estándar a 1 decimal.
function redondear1(valor) {
    if (valor === null || valor === undefined || Number.isNaN(valor)) return null;
    return Math.round((valor + Number.EPSILON) * 10) / 10;
}

// Mismo límite que usa formatearNotaFinal() en profesor.js: ninguna
// nota individual cuenta por debajo de 1 ni por encima de 5, aunque
// haya quedado mal escrita en la base de datos.
function limitarNota(valor) {
    if (valor < 1) return 1;
    if (valor > 5) return 5;
    return valor;
}

const selectMateriaFiltro = document.getElementById("selectMateriaFiltro");
const inputMetaAprobar = document.getElementById("inputMetaAprobar");
const inputBuscarRiesgo = document.getElementById("inputBuscarRiesgo");
const estadoCargaRiesgo = document.getElementById("estadoCargaRiesgo");
const panelResultados = document.getElementById("panelResultados");
const cuerpoRiesgo = document.getElementById("cuerpoRiesgo");
const numEnRiesgo = document.getElementById("numEnRiesgo");
const numImposible = document.getElementById("numImposible");
const numRevisados = document.getElementById("numRevisados");
const nombreProfesorHeader = document.getElementById("nombreProfesorHeader");
const btnImprimirRiesgo = document.getElementById("btnImprimirRiesgo");
const btnPdfRiesgo = document.getElementById("btnPdfRiesgo");

let misAsignaciones = []; // [{materia, salon}]
let mapaSalones = {};
let nombreDocenteActual = "";
let filasRiesgoTodas = []; // resultado de TODOS los salones/materias, ya calculado una vez

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

function poblarSelectMateria() {
    const materias = [...new Set(misAsignaciones.map((a) => a.materia))].sort();
    selectMateriaFiltro.innerHTML = `<option value="">Todas mis asignaturas</option>` +
        materias.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
}

// =====================================================
// CARGAR Y CALCULAR — UNA COMBINACIÓN salón + materia
// =====================================================

async function calcularParaSalonMateria(salon, materia) {
    const { data: estudiantesSalon, error: errEst } = await supabase
        .from("estudiantes")
        .select("id, codigo, nombre, cedula, correo, es_prueba")
        .eq("salon", salon)
        .order("nombre", { ascending: true });

    if (errEst) {
        console.warn(`⚠️ No se pudieron cargar estudiantes de ${salon}:`, errEst);
        return [];
    }

    const estudiantes = (estudiantesSalon || []).filter((e) => !e.es_prueba);
    if (estudiantes.length === 0) return [];

    const todosLosIds = estudiantes.map((e) => e.id);
    const correoAId = {};
    estudiantes.forEach((e) => { if (e.correo) correoAId[e.correo] = e.id; });
    const correosActuales = Object.keys(correoAId);

    function claveCasilla(tipo, numero) {
        return `${(tipo || "").toLowerCase()}_${numero}`;
    }

    const notasPorEstudiante = {};
    function registrar(estudianteId, n) {
        if (!notasPorEstudiante[estudianteId]) notasPorEstudiante[estudianteId] = {};
        if (!notasPorEstudiante[estudianteId][n.trimestre]) notasPorEstudiante[estudianteId][n.trimestre] = {};
        notasPorEstudiante[estudianteId][n.trimestre][claveCasilla(n.tipo, n.numero)] = n;
    }

    if (todosLosIds.length > 0) {
        const { data } = await supabase.from("notas")
            .select("estudiante_id, correo, trimestre, tipo, numero, nota, estado")
            .eq("materia", materia).in("estudiante_id", todosLosIds)
            .is("eliminado_en", null);
        (data || []).forEach((n) => registrar(n.estudiante_id, n));
    }
    if (correosActuales.length > 0) {
        const { data } = await supabase.from("notas")
            .select("estudiante_id, correo, trimestre, tipo, numero, nota, estado")
            .eq("materia", materia).in("correo", correosActuales)
            .is("eliminado_en", null);
        (data || []).forEach((n) => {
            if (n.estudiante_id) return;
            const idEst = correoAId[n.correo];
            if (idEst) registrar(idEst, n);
        });
    }

    function calcularPromedio(valores) {
        if (valores.length === 0) return null;
        return valores.reduce((a, b) => a + b, 0) / valores.length;
    }

    function promedioTrimestre(notasTrimestre) {
        if (!notasTrimestre) return null;
        const porTipo = { apreciacion: [], ejercicio: [], examen: [] };
        Object.values(notasTrimestre).forEach((n) => {
            const tipoNorm = (n.tipo || "").toLowerCase();
            const valor = parseFloat(n.nota);
            if (isNaN(valor)) return;
            const valorLimitado = limitarNota(valor);
            if (tipoNorm === "apreciacion") porTipo.apreciacion.push(valorLimitado);
            else if (tipoNorm === "examen") porTipo.examen.push(valorLimitado);
            else if (tipoNorm === "ejercicio") porTipo.ejercicio.push(valorLimitado);
        });
        const promApr = calcularPromedio(porTipo.apreciacion);
        const promEje = calcularPromedio(porTipo.ejercicio);
        const promExa = calcularPromedio(porTipo.examen);
        const presentes = [promApr, promEje, promExa].filter((v) => v !== null);
        return presentes.length ? presentes.reduce((a, b) => a + b, 0) / presentes.length : null;
    }

    return estudiantes.map((e) => {
        const notasEst = notasPorEstudiante[e.id] || {};
        const t1 = promedioTrimestre(notasEst[TRIMESTRES[0]]);
        const t2 = promedioTrimestre(notasEst[TRIMESTRES[1]]);
        const t3 = promedioTrimestre(notasEst[TRIMESTRES[2]]);
        return {
            salon, materia,
            nombre: e.nombre, cedula: e.cedula,
            t1, t2, t3
        };
    });
}

// =====================================================
// CARGAR TODO (todas las combinaciones salón + materia)
// =====================================================

async function cargarTodo() {
    estadoCargaRiesgo.textContent = `Cargando 0 / ${misAsignaciones.length} salones/materias...`;
    panelResultados.style.display = "none";

    const resultados = [];
    for (let i = 0; i < misAsignaciones.length; i++) {
        const { salon, materia } = misAsignaciones[i];
        const filas = await calcularParaSalonMateria(salon, materia);
        resultados.push(...filas);
        estadoCargaRiesgo.textContent = `Cargando ${i + 1} / ${misAsignaciones.length} salones/materias...`;
    }

    filasRiesgoTodas = resultados;
    estadoCargaRiesgo.textContent = "";
    panelResultados.style.display = "block";
    render();
}

// =====================================================
// RENDER
// =====================================================

function render() {
    const meta = parseFloat(inputMetaAprobar.value) || 3.0;
    const materiaFiltro = selectMateriaFiltro.value;
    const filtroNombre = inputBuscarRiesgo.value.trim().toLowerCase();

    // Solo se evalúan estudiantes que YA tienen Trimestre 1 Y
    // Trimestre 2 (para poder calcular qué necesitan en el III).
    let revisados = filasRiesgoTodas.filter((f) => f.t1 !== null && f.t2 !== null);

    if (materiaFiltro) revisados = revisados.filter((f) => f.materia === materiaFiltro);
    if (filtroNombre) revisados = revisados.filter((f) => (f.nombre || "").toLowerCase().includes(filtroNombre));

    const conCalculo = revisados.map((f) => {
        const promedioActual = (f.t1 + f.t2) / 2;
        // Final = (T1 + T2 + T3) / 3 >= meta  =>  T3 >= 3*meta - T1 - T2
        const necesitaT3 = redondear1(3 * meta - f.t1 - f.t2);
        // Solo se considera "en riesgo" al que YA está en fracaso ahora
        // mismo, sumando/promediando lo que lleva de Trimestre 1 y 2
        // (no a cualquiera que simplemente necesite algo más en el III).
        const enRiesgo = promedioActual < meta;
        const imposible = necesitaT3 !== null && necesitaT3 > 5;
        return { ...f, promedioActual, necesitaT3, enRiesgo, imposible };
    }).filter((f) => f.enRiesgo);

    conCalculo.sort((a, b) => {
        if (a.salon !== b.salon) return a.salon.localeCompare(b.salon);
        if (a.materia !== b.materia) return a.materia.localeCompare(b.materia);
        return (a.nombre || "").localeCompare(b.nombre || "");
    });

    numEnRiesgo.textContent = conCalculo.length;
    numImposible.textContent = conCalculo.filter((f) => f.imposible).length;
    numRevisados.textContent = revisados.length;

    if (conCalculo.length === 0) {
        cuerpoRiesgo.innerHTML = `<tr><td colspan="8" style="text-align:center; color:#64748b; padding:16px;">🎉 No hay estudiantes en riesgo con estos filtros.</td></tr>`;
        return;
    }

    cuerpoRiesgo.innerHTML = conCalculo.map((f) => {
        let claseNecesita = "necesita-ok";
        let textoNecesita;
        if (f.imposible) {
            claseNecesita = "necesita-imposible";
            textoNecesita = "Ya no puede (>5.0)";
        } else {
            const valorMostrar = Math.max(1, f.necesitaT3).toFixed(1);
            textoNecesita = valorMostrar;
            claseNecesita = f.necesitaT3 > 4 ? "necesita-alto" : "necesita-ok";
        }

        const boton = f.cedula
            ? `<a class="btn-mini-boletin" href="boletin_trimestral.html?cedula=${encodeURIComponent(f.cedula)}" target="_blank">Ver boletín</a>`
            : `<span style="color:#b91c1c; font-size:11px;">Sin cédula</span>`;

        return `
            <tr>
                <td>${escapeHtml(nombreVisibleSalon(f.salon))}</td>
                <td>${escapeHtml(f.materia)}</td>
                <td class="col-nombre">${escapeHtml(f.nombre)}</td>
                <td>${f.t1.toFixed(1)}</td>
                <td>${f.t2.toFixed(1)}</td>
                <td>${f.promedioActual.toFixed(1)}</td>
                <td class="${claseNecesita}">${textoNecesita}</td>
                <td>${boton}</td>
            </tr>
        `;
    }).join("");
}

selectMateriaFiltro.addEventListener("change", render);
inputMetaAprobar.addEventListener("input", render);
inputBuscarRiesgo.addEventListener("input", render);

// =====================================================
// IMPRIMIR / PDF
// =====================================================

btnImprimirRiesgo.addEventListener("click", () => window.print());

btnPdfRiesgo.addEventListener("click", () => {
    const filas = Array.from(cuerpoRiesgo.querySelectorAll("tr")).map((tr) =>
        Array.from(tr.querySelectorAll("td")).slice(0, 7).map((td) => td.textContent.trim())
    );
    if (filas.length === 0 || filas[0].length < 7) { alert("No hay datos para exportar."); return; }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "landscape" });

    doc.setFontSize(13);
    doc.text("C.E.B.G. EL JIRAL - Estudiantes en Riesgo (todos los salones)", 14, 15);
    doc.setFontSize(10);
    doc.text(`Docente: ${nombreDocenteActual}   |   Nota para aprobar: ${(parseFloat(inputMetaAprobar.value) || 3).toFixed(1)}`, 14, 22);

    doc.autoTable({
        head: [["Salón", "Asignatura", "Estudiante", "I Tri.", "II Tri.", "Promedio", "Necesita en III Tri."]],
        body: filas,
        startY: 28,
        styles: { fontSize: 8.5, halign: "center" },
        headStyles: { fillColor: [185, 28, 28], textColor: 255 },
        columnStyles: { 2: { halign: "left", fontStyle: "bold" } }
    });

    doc.save(`Estudiantes_en_riesgo_${nombreDocenteActual}.pdf`.replace(/\s+/g, "_"));
});

// =====================================================
// INICIO
// =====================================================

(async function init() {
    const ok = await verificarSesion();
    if (!ok) return;
    await cargarCatalogoSalones();
    poblarSelectMateria();
    await cargarTodo();
})();
