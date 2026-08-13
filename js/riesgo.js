// =========================================================
// riesgo.js — Página aparte: "Estudiantes en riesgo"
// =========================================================
// Antes esto era un botón escondido dentro de "Registrar notas" en
// profesor.html, que solo abría una ventana de impresión con las
// materias del docente logueado. Ahora es una página propia,
// enlazada desde el menú de arriba en profesor.html, consejero.html
// y admin.html, que además se puede descargar en PDF (no solo
// imprimir) para enviarla a los padres o al consejero(a) del salón.
//
// El "modo" (quién puede ver qué) llega por la URL, según desde
// dónde se entró:
//   riesgo.html?modo=profesor   -> solo sus propios salones/materias
//   riesgo.html?modo=consejero  -> su salón asignado, TODAS las materias
//   riesgo.html?modo=admin      -> cualquier salón, TODAS las materias
// Si no llega el parámetro (o la cuenta no tiene ese rol), se elige
// automáticamente el mejor rol disponible: admin > consejero > profesor.
// =========================================================

import { supabase } from "./supabase.js";
import { pintarCambiarPanel, obtenerRolesDeCuenta } from "./roles.js";

const PROMEDIO_MINIMO_APROBAR = 3.0;

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------
// Elementos
// ---------------------------------------------------------------
const enlaceVolver = document.getElementById("enlaceVolver");
const bloqueSalonSelect = document.getElementById("bloqueSalonSelect");
const bloqueSalonFijo = document.getElementById("bloqueSalonFijo");
const selectSalonRiesgo = document.getElementById("selectSalonRiesgo");
const textoSalonFijo = document.getElementById("textoSalonFijo");
const selectTrimestreRiesgo = document.getElementById("selectTrimestreRiesgo");
const btnGenerarReporte = document.getElementById("btnGenerarReporte");
const textoAyudaScope = document.getElementById("textoAyudaScope");
const tarjetaReporte = document.getElementById("tarjetaReporte");
const tarjetaVacia = document.getElementById("tarjetaVacia");
const textoGenerado = document.getElementById("textoGenerado");
const tituloReporte = document.getElementById("tituloReporte");
const subtituloReporte = document.getElementById("subtituloReporte");
const resumenTop = document.getElementById("resumenTop");
const zonaReporte = document.getElementById("zonaReporte");
const contenidoImprimible = document.getElementById("contenidoImprimible");
const btnImprimir = document.getElementById("btnImprimir");
const btnDescargarPdf = document.getElementById("btnDescargarPdf");

// ---------------------------------------------------------------
// 1) Sesión y modo
// ---------------------------------------------------------------
let modo = null; // "profesor" | "consejero" | "admin"
let correoCuenta = "";
let salonesProfesor = []; // [{salon, materias:[...]}]
let salonConsejero = "";
let salonesTodos = []; // [{codigo, nombre_visible}] para admin

async function iniciar() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
        window.location.href = "login.html";
        return;
    }
    correoCuenta = (user.email || "").trim().toLowerCase();

    const { esAdmin, consejeroInfo, esProfesor } = await obtenerRolesDeCuenta(user.id, correoCuenta);

    const params = new URLSearchParams(window.location.search);
    const modoPedido = params.get("modo");

    if (modoPedido === "profesor" && esProfesor) modo = "profesor";
    else if (modoPedido === "consejero" && consejeroInfo) modo = "consejero";
    else if (modoPedido === "admin" && esAdmin) modo = "admin";
    else if (esAdmin) modo = "admin";
    else if (consejeroInfo) modo = "consejero";
    else if (esProfesor) modo = "profesor";

    if (!modo) {
        alert("Esta cuenta no tiene un panel (docente, consejería o admin) para ver este reporte.");
        window.location.href = "login.html";
        return;
    }

    pintarCambiarPanel("riesgo", "oscuro-sobre-claro");

    if (modo === "profesor") {
        enlaceVolver.href = "profesor.html";
        const { data: materias, error: errM } = await supabase
            .from("profesor_materias")
            .select("materia, salon")
            .eq("correo_profesor", correoCuenta);
        if (errM || !materias || materias.length === 0) {
            alert("No se encontraron materias asignadas a esta cuenta.");
            window.location.href = "profesor.html";
            return;
        }
        const porSalon = {};
        materias.forEach((m) => {
            (porSalon[m.salon] ??= new Set()).add(m.materia);
        });
        salonesProfesor = Object.entries(porSalon).map(([salon, mats]) => ({ salon, materias: [...mats] }));
        salonesProfesor.sort((a, b) => a.salon.localeCompare(b.salon));

        bloqueSalonSelect.style.display = "";
        selectSalonRiesgo.innerHTML = salonesProfesor
            .map((s) => `<option value="${escapeHtml(s.salon)}">${escapeHtml(s.salon)}</option>`)
            .join("");
        textoAyudaScope.textContent = "Se revisan solo las materias que tú dictas en el salón elegido.";
    } else if (modo === "consejero") {
        enlaceVolver.href = "consejero.html";
        salonConsejero = (consejeroInfo.salon || "").trim().toUpperCase();
        bloqueSalonFijo.style.display = "";
        textoSalonFijo.textContent = salonConsejero || "—";
        textoAyudaScope.textContent = "Se revisan todas las materias registradas en tu salón asignado.";
    } else if (modo === "admin") {
        enlaceVolver.href = "admin.html";
        const { data: salones, error: errS } = await supabase
            .from("salones")
            .select("codigo, nombre_visible")
            .eq("activo", true)
            .order("orden", { ascending: true });
        salonesTodos = salones || [];
        bloqueSalonSelect.style.display = "";
        selectSalonRiesgo.innerHTML = salonesTodos
            .map((s) => `<option value="${escapeHtml(s.codigo)}">${escapeHtml(s.nombre_visible || s.codigo)}</option>`)
            .join("");
        textoAyudaScope.textContent = "Se revisan todas las materias registradas en el salón elegido.";
    }
}

// ---------------------------------------------------------------
// 2) Cálculo de riesgo por materia (misma fórmula que la columna
//    "Prom. Final" del panel del docente: promedio de Apreciación,
//    Ejercicio y Examen, cada categoría con el mismo peso, ignorando
//    las que todavía no tengan notas).
// ---------------------------------------------------------------
async function calcularRiesgoPorMateria(materia, trimestre, estudiantes) {
    const ids = estudiantes.map((e) => e.id);
    if (ids.length === 0) return [];

    const { data: notas, error } = await supabase
        .from("notas")
        .select("estudiante_id, tipo, nota")
        .eq("materia", materia).eq("trimestre", trimestre)
        .in("estudiante_id", ids)
        .is("eliminado_en", null);

    if (error) { console.error(error); return []; }

    const porEstudiante = {};
    (notas || []).forEach((n) => {
        if (n.nota === null || n.nota === undefined) return;
        const num = Number(n.nota);
        if (isNaN(num)) return;
        const grupo = (porEstudiante[n.estudiante_id] ??= { apr: [], eje: [], exa: [] });
        if (n.tipo === "apreciacion") grupo.apr.push(num);
        else if (n.tipo === "examen") grupo.exa.push(num);
        else grupo.eje.push(num);
    });

    const prom = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

    const resultado = [];
    estudiantes.forEach((est) => {
        const g = porEstudiante[est.id];
        if (!g) return;
        const promApr = prom(g.apr), promEje = prom(g.eje), promExa = prom(g.exa);
        const presentes = [promApr, promEje, promExa].filter((v) => v !== null);
        const promFinal = presentes.length ? presentes.reduce((a, b) => a + b, 0) / presentes.length : null;
        if (promFinal !== null && promFinal < PROMEDIO_MINIMO_APROBAR) {
            resultado.push({ nombre: est.nombre, promApr, promEje, promExa, promFinal });
        }
    });

    resultado.sort((a, b) => a.promFinal - b.promFinal);
    return resultado;
}

// Materias a revisar según el modo + salón elegido, y (si aplica) el
// nombre del/de la docente de cada una, para que el reporte diga a
// quién más se le puede escribir además del padre de familia.
async function obtenerMateriasYDocentes(salon) {
    if (modo === "profesor") {
        const entrada = salonesProfesor.find((s) => s.salon === salon);
        return (entrada?.materias || []).map((materia) => ({ materia, docentes: [] }));
    }

    const { data: filas, error } = await supabase
        .from("profesor_materias")
        .select("materia, correo_profesor")
        .eq("salon", salon);
    if (error || !filas || filas.length === 0) return [];

    const porMateria = {};
    filas.forEach((f) => (porMateria[f.materia] ??= new Set()).add(f.correo_profesor));

    const correos = [...new Set(filas.map((f) => f.correo_profesor))];
    const { data: profes } = await supabase
        .from("profesores")
        .select("correo_profesor, nombre_profesor")
        .in("correo_profesor", correos);
    const nombrePorCorreo = {};
    (profes || []).forEach((p) => (nombrePorCorreo[p.correo_profesor] = p.nombre_profesor));

    return Object.entries(porMateria).map(([materia, correosSet]) => ({
        materia,
        docentes: [...correosSet].map((c) => nombrePorCorreo[c] || c),
    }));
}

// ---------------------------------------------------------------
// 3) Generar el reporte en pantalla
// ---------------------------------------------------------------
btnGenerarReporte.addEventListener("click", async () => {
    const salon = modo === "consejero" ? salonConsejero : selectSalonRiesgo.value;
    const trimestre = selectTrimestreRiesgo.value;
    if (!salon) return alert("Elige un salón.");

    btnGenerarReporte.disabled = true;
    const textoOriginal = btnGenerarReporte.innerHTML;
    btnGenerarReporte.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Buscando...`;

    try {
        const materiasInfo = await obtenerMateriasYDocentes(salon);
        if (materiasInfo.length === 0) {
            tarjetaReporte.style.display = "none";
            tarjetaVacia.style.display = "";
            tarjetaVacia.textContent = "No hay materias registradas para este salón.";
            return;
        }

        const { data: estudiantesSalon, error: errEst } = await supabase
            .from("estudiantes")
            .select("id, nombre, es_prueba")
            .eq("salon", salon)
            .order("nombre", { ascending: true });

        if (errEst) { alert("No se pudo cargar el salón: " + errEst.message); return; }

        const estudiantes = (estudiantesSalon || []).filter((e) => !e.es_prueba);

        const porMateria = [];
        for (const { materia, docentes } of materiasInfo) {
            const enRiesgo = await calcularRiesgoPorMateria(materia, trimestre, estudiantes);
            porMateria.push({ materia, docentes, enRiesgo });
        }

        renderizarReporte(salon, trimestre, porMateria);
    } catch (err) {
        console.error(err);
        alert("No se pudo generar el reporte: " + err.message);
    } finally {
        btnGenerarReporte.disabled = false;
        btnGenerarReporte.innerHTML = textoOriginal;
    }
});

function renderizarReporte(salon, trimestre, porMateria) {
    const conRiesgo = porMateria.filter((m) => m.enRiesgo.length > 0);
    const totalEnRiesgo = conRiesgo.reduce((a, m) => a + m.enRiesgo.length, 0);
    const estudiantesUnicos = new Set(conRiesgo.flatMap((m) => m.enRiesgo.map((e) => e.nombre))).size;

    tarjetaVacia.style.display = "none";
    tarjetaReporte.style.display = "";

    const fechaGeneracion = new Date().toLocaleString("es-PA", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
    textoGenerado.textContent = `Generado el ${fechaGeneracion}`;

    tituloReporte.textContent = `⚠️ Estudiantes en riesgo de fracasar el trimestre — Salón ${salon}`;
    subtituloReporte.textContent = `${trimestre} · Nota final por debajo de ${PROMEDIO_MINIMO_APROBAR.toFixed(1)} · Generado el ${fechaGeneracion}`;

    if (totalEnRiesgo === 0) {
        resumenTop.innerHTML = "";
        zonaReporte.innerHTML = `<p class="text-success text-center py-3">✅ Ningún estudiante del salón ${escapeHtml(salon)} está por debajo de ${PROMEDIO_MINIMO_APROBAR.toFixed(1)} en ${escapeHtml(trimestre)}.</p>`;
        btnImprimir.style.display = "none";
        btnDescargarPdf.style.display = "none";
        return;
    }

    btnImprimir.style.display = "";
    btnDescargarPdf.style.display = "";

    resumenTop.innerHTML = `
        <span class="pastilla-resumen">${estudiantesUnicos} estudiante${estudiantesUnicos === 1 ? "" : "s"} en riesgo</span>
        <span class="pastilla-resumen">${conRiesgo.length} materia${conRiesgo.length === 1 ? "" : "s"} afectada${conRiesgo.length === 1 ? "" : "s"}</span>`;

    zonaReporte.innerHTML = conRiesgo.map(({ materia, docentes, enRiesgo }) => {
        const filas = enRiesgo.map((e, i) => `
            <tr>
                <td>${i + 1}</td>
                <td class="nombre">${escapeHtml(e.nombre)}</td>
                <td>${e.promApr !== null ? e.promApr.toFixed(1) : "–"}</td>
                <td>${e.promEje !== null ? e.promEje.toFixed(1) : "–"}</td>
                <td>${e.promExa !== null ? e.promExa.toFixed(1) : "–"}</td>
                <td class="final">${e.promFinal.toFixed(1)}</td>
            </tr>`).join("");

        const lineaDocente = docentes.length
            ? `<p class="docente-linea">Docente: ${escapeHtml(docentes.join(", "))}</p>`
            : "";

        return `
            <h2>${escapeHtml(materia)} <span class="conteo">(${enRiesgo.length} en riesgo)</span></h2>
            ${lineaDocente}
            <table>
                <thead>
                    <tr><th>#</th><th>Estudiante</th><th>Prom. Aprec.</th><th>Prom. Ejer.</th><th>Prom. Examen</th><th>Prom. Final</th></tr>
                </thead>
                <tbody>${filas}</tbody>
            </table>`;
    }).join("");
}

// ---------------------------------------------------------------
// 4) Imprimir / Descargar en PDF
// ---------------------------------------------------------------
btnImprimir.addEventListener("click", () => window.print());

btnDescargarPdf.addEventListener("click", async () => {
    btnDescargarPdf.disabled = true;
    const textoOriginal = btnDescargarPdf.innerHTML;
    btnDescargarPdf.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Generando...`;
    try {
        if (document.fonts && document.fonts.ready) await document.fonts.ready;
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        const canvas = await html2canvas(contenidoImprimible, { scale: 2, backgroundColor: "#ffffff" });
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const imgWidth = pageWidth;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        const imgData = canvas.toDataURL("image/jpeg", 0.95);
        let alturaRestante = imgHeight;
        let posicion = 0;
        pdf.addImage(imgData, "JPEG", 0, posicion, imgWidth, imgHeight);
        alturaRestante -= pageHeight;
        while (alturaRestante > 0) {
            posicion = alturaRestante - imgHeight;
            pdf.addPage();
            pdf.addImage(imgData, "JPEG", 0, posicion, imgWidth, imgHeight);
            alturaRestante -= pageHeight;
        }

        const salon = modo === "consejero" ? salonConsejero : selectSalonRiesgo.value;
        pdf.save(`Estudiantes_en_riesgo_${salon}.pdf`);
    } catch (err) {
        console.error(err);
        alert("No se pudo generar el PDF: " + err.message);
    } finally {
        btnDescargarPdf.disabled = false;
        btnDescargarPdf.innerHTML = textoOriginal;
    }
});

iniciar();
