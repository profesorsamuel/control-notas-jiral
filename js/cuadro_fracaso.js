import { supabase } from "./supabase.js";

// =========================================================
// 0) UTILIDADES
// =========================================================

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// Mismo umbral que usa profesor.js / cuadro_aprobados.js para decidir aprobado/reprobado.
const PROMEDIO_MINIMO_APROBAR = 3.0;
// La app limita cada casilla de nota a un máximo de 5 (ver formatearNotaFinal en profesor.js).
const NOTA_MAXIMA_ESCALA = 5;

function calcularPct(numerador, denominador) {
    if (!denominador) return 0;
    return (numerador / denominador) * 100;
}

function formatearPct(valor) {
    return `${valor.toFixed(2)}%`;
}

// =========================================================
// 1) SESIÓN (mismo patrón que cuadro_aprobados.js)
// =========================================================

let correoProfesor = "";
let nombreProfesor = "";
let misAsignaciones = []; // [{materia, salon}]
let mapaSalones = {}; // codigo -> {nivel, letra, nombre_visible, orden}

async function verificarSesion() {
    const { data: { user }, error: errUser } = await supabase.auth.getUser();
    if (errUser || !user) {
        window.location.href = "login.html";
        return false;
    }
    correoProfesor = (user.email || "").trim().toLowerCase();

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
    nombreProfesor = perfilProfesor?.nombre_profesor || correoProfesor;

    const elNombre = document.getElementById("nombreProfesorHeader");
    if (elNombre) elNombre.textContent = nombreProfesor;

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

// =========================================================
// 2) ELEMENTOS Y POBLADO DE SELECTORES
// =========================================================

const selectMateria = document.getElementById("selectMateria");
const selectTrimestre = document.getElementById("selectTrimestre");
const inputAnio = document.getElementById("inputAnio");
const selectJornada = document.getElementById("selectJornada");
const inputMeta = document.getElementById("inputMeta");
const contenedorSalones = document.getElementById("contenedorSalones");
const btnGenerar = document.getElementById("btnGenerar");
const estadoGeneracion = document.getElementById("estadoGeneracion");
const bloqueReporte = document.getElementById("bloqueReporte");
const contenidoReporte = document.getElementById("contenidoReporte");
const btnPdf = document.getElementById("btnPdf");
const btnImprimir = document.getElementById("btnImprimir");

function poblarSelectMateria() {
    const materias = [...new Set(misAsignaciones.map((a) => a.materia))].sort();
    selectMateria.innerHTML = `<option value="">Selecciona una asignatura</option>` +
        materias.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
}

function poblarSalones() {
    const materia = selectMateria.value;
    if (!materia) {
        contenedorSalones.innerHTML = `<span class="small text-muted">Elige primero una asignatura.</span>`;
        return;
    }
    const salones = [...new Set(misAsignaciones.filter((a) => a.materia === materia).map((a) => a.salon))];
    salones.sort((a, b) => {
        const oa = mapaSalones[a]?.orden ?? 999;
        const ob = mapaSalones[b]?.orden ?? 999;
        return oa !== ob ? oa - ob : String(a).localeCompare(String(b));
    });

    if (salones.length === 0) {
        contenedorSalones.innerHTML = `<span class="small text-muted">No tienes salones asignados en esta asignatura.</span>`;
        return;
    }

    contenedorSalones.innerHTML = salones.map((s) => {
        const label = mapaSalones[s]?.nombre_visible || s;
        return `<label class="chip-check">
            <input type="checkbox" value="${escapeHtml(s)}" class="chkSalon" checked>
            ${escapeHtml(label)}
        </label>`;
    }).join("");
}

selectMateria.addEventListener("change", () => { poblarSalones(); ocultarReporte(); });

function ocultarReporte() {
    bloqueReporte.style.display = "none";
    contenidoReporte.innerHTML = "";
}

// =========================================================
// 3) CÁLCULO POR SALÓN (misma lógica de promedios que cuadro_aprobados.js:
//    promedio de apreciaciones, promedio de ejercicios, promedio de
//    exámenes, y promedio final = promedio de esos tres promedios)
// =========================================================

async function calcularDatosSalon(salon, materia, trimestre) {
    async function consultarEstudiantes() {
        return supabase
            .from("estudiantes")
            .select(`id, nombre, correo, es_prueba`)
            .eq("salon", salon)
            .order("nombre", { ascending: true });
    }
    let { data: estudiantesSalon, error: errEst } = await consultarEstudiantes();
    if (errEst) throw new Error(`Estudiantes de ${salon}: ${errEst.message}`);

    const lista = (estudiantesSalon || []).filter((e) => !e.es_prueba);
    const ids = lista.map((e) => e.id);

    const gruposPorEstudiante = {};
    function registrarNota(estudianteId, tipo, nota) {
        if (nota === null || nota === undefined || nota === "") return;
        const val = parseFloat(nota);
        if (Number.isNaN(val)) return;
        const g = (gruposPorEstudiante[estudianteId] ??= { apr: [], eje: [], exa: [] });
        if (tipo === "apreciacion") g.apr.push(val);
        else if (tipo === "examen") g.exa.push(val);
        else g.eje.push(val);
    }

    if (ids.length > 0) {
        const { data: notas, error: errNotas } = await supabase
            .from("notas")
            .select("estudiante_id, tipo, nota")
            .eq("materia", materia)
            .eq("trimestre", trimestre)
            .in("estudiante_id", ids)
            .is("eliminado_en", null);
        if (errNotas) throw new Error(`Notas de ${salon}: ${errNotas.message}`);
        (notas || []).forEach((n) => registrarNota(n.estudiante_id, n.tipo, n.nota));

        // Fuente de respaldo: notas antiguas que todavía solo tienen "correo".
        const correoAId = {};
        lista.forEach((e) => { if (e.correo) correoAId[e.correo] = e.id; });
        const correosActuales = Object.keys(correoAId);
        if (correosActuales.length > 0) {
            const { data: notasPorCorreo, error: errNotasCorreo } = await supabase
                .from("notas")
                .select("estudiante_id, correo, tipo, nota")
                .eq("materia", materia)
                .eq("trimestre", trimestre)
                .in("correo", correosActuales)
                .is("eliminado_en", null);
            if (errNotasCorreo) throw new Error(`Notas (por correo) de ${salon}: ${errNotasCorreo.message}`);
            (notasPorCorreo || []).forEach((n) => {
                if (n.estudiante_id) return;
                const idEst = correoAId[n.correo];
                if (idEst) registrarNota(idEst, n.tipo, n.nota);
            });
        }
    }

    const resumen = {
        salon,
        etiqueta: mapaSalones[salon]?.nombre_visible || salon,
        matricula: lista.length,
        aprobados: 0,
        reprobados: 0,
        sinCalif: 0,
        detalleEstudiantes: [],
    };

    lista.forEach((est) => {
        const grupos = gruposPorEstudiante[est.id];
        const promApr = grupos && grupos.apr.length ? grupos.apr.reduce((a, b) => a + b, 0) / grupos.apr.length : null;
        const promEje = grupos && grupos.eje.length ? grupos.eje.reduce((a, b) => a + b, 0) / grupos.eje.length : null;
        const promExa = grupos && grupos.exa.length ? grupos.exa.reduce((a, b) => a + b, 0) / grupos.exa.length : null;
        const promedios = [promApr, promEje, promExa].filter((v) => v !== null);

        if (!promedios.length) {
            resumen.sinCalif++;
            return;
        }
        const promFinal = promedios.reduce((a, b) => a + b, 0) / promedios.length;
        const aprobado = promFinal >= PROMEDIO_MINIMO_APROBAR;
        if (aprobado) {
            resumen.aprobados++;
        } else {
            resumen.reprobados++;
        }

        // Para el cuadro de "en riesgo de entrar en fracaso": solo tiene
        // sentido para estudiantes que hoy están aprobados con base en
        // Apreciación y Ejercicios, pero que todavía no tienen nota de
        // Examen — su promedio puede bajar cuando esa nota se registre.
        resumen.detalleEstudiantes.push({
            nombre: est.nombre && est.nombre.trim() ? est.nombre : "(Sin nombre registrado)",
            salonEtiqueta: resumen.etiqueta,
            promApr,
            promEje,
            promExa,
            promFinal,
            aprobado,
            tieneExamen: promExa !== null,
        });
    });

    return resumen;
}

// =========================================================
// 4) NIVELES (para el encabezado, ej. "9° A, B, C")
// =========================================================

function construirTextoNiveles(salonesSeleccionados) {
    const porNivel = {};
    salonesSeleccionados.forEach((s) => {
        const info = mapaSalones[s];
        const nivel = info?.nivel ?? "?";
        const letra = info?.letra ?? s;
        (porNivel[nivel] ??= []).push(letra);
    });
    return Object.keys(porNivel)
        .sort((a, b) => a - b)
        .map((n) => `${n}° ${porNivel[n].sort().join(", ")}`)
        .join("  /  ");
}

// =========================================================
// 5) RENDER DEL CUADRO IMPRIMIBLE
// =========================================================

function construirEncabezadoHtml(filas) {
    const materia = selectMateria.value;
    const trimestre = selectTrimestre.value;
    const anio = inputAnio.value || new Date().getFullYear();
    const jornada = selectJornada.value || "—";
    const niveles = construirTextoNiveles(filas.map((f) => f.salon));

    return `
    <div class="encabezado-institucion" contenteditable="true">MINISTERIO DE EDUCACIÓN – DIRECCIÓN REGIONAL DE COLÓN – C.E.B.G. EL JIRAL</div>
    <div class="encabezado-titulo">CUADRO DE FRACASO ESCOLAR POR SALÓN</div>
    <div class="encabezado-subtitulo">NOMBRE DEL PROFESOR: <span>${escapeHtml(nombreProfesor)}</span></div>

    <div class="grid-datos">
        <div><strong>ASIGNATURA:</strong> ${escapeHtml(materia)}</div>
        <div><strong>NIVELES:</strong> ${escapeHtml(niveles)}</div>
        <div><strong>TRIMESTRE:</strong> ${escapeHtml(trimestre)}</div>
        <div><strong>AÑO ELECTIVO:</strong> ${escapeHtml(String(anio))}</div>
        <div><strong>JORNADA:</strong> ${escapeHtml(jornada)}</div>
    </div>
    `;
}

function construirResumenMeta(totalMatricula, totalReprobados, meta) {
    const pctFracasoTotal = calcularPct(totalReprobados, totalMatricula);
    const cumple = pctFracasoTotal <= meta;
    const diferencia = Math.abs(pctFracasoTotal - meta);

    return `
    <div class="resumen-meta">
        <div class="tarjeta-meta neutro">
            <div class="etiqueta">Meta de fracaso permitida</div>
            <div class="valor">${meta.toFixed(2)}%</div>
        </div>
        <div class="tarjeta-meta ${cumple ? 'ok' : 'mal'}">
            <div class="etiqueta">Fracaso general actual</div>
            <div class="valor">${formatearPct(pctFracasoTotal)}</div>
        </div>
        <div class="tarjeta-meta ${cumple ? 'ok' : 'mal'}">
            <div class="etiqueta">${cumple ? 'Estás dentro de la meta por' : 'Estás sobre la meta por'}</div>
            <div class="valor">${diferencia.toFixed(2)} pts</div>
        </div>
        <div class="tarjeta-meta neutro">
            <div class="etiqueta">Reprobados / matrícula total</div>
            <div class="valor">${totalReprobados} / ${totalMatricula}</div>
        </div>
    </div>`;
}

function construirTablaHtml(filas, meta) {
    let totalMatricula = 0;
    let totalReprobados = 0;
    let totalAprobados = 0;
    let totalSinCalif = 0;

    const filasHtml = filas.map((f) => {
        totalMatricula += f.matricula;
        totalReprobados += f.reprobados;
        totalAprobados += f.aprobados;
        totalSinCalif += f.sinCalif;

        const pct = calcularPct(f.reprobados, f.matricula);
        const cumple = pct <= meta;
        const tope = Math.floor(f.matricula * meta / 100 + 1e-9);
        const faltan = Math.max(0, f.reprobados - tope);

        return `<tr>
            <td><strong>${escapeHtml(f.etiqueta)}</strong></td>
            <td>${f.matricula}</td>
            <td>${f.aprobados}</td>
            <td>${f.reprobados}</td>
            <td>${f.sinCalif}</td>
            <td><span class="pct-badge ${cumple ? 'ok' : 'mal'}">${formatearPct(pct)}</span></td>
            <td><span class="estado-badge ${cumple ? 'ok' : 'mal'}">${cumple ? '✅ Dentro de meta' : '⚠️ Sobre la meta'}</span></td>
            <td>${tope}</td>
            <td>${faltan > 0 ? `<strong>${faltan}</strong>` : '—'}</td>
        </tr>`;
    }).join("");

    const pctTotal = calcularPct(totalReprobados, totalMatricula);
    const cumpleTotal = pctTotal <= meta;
    const topeTotal = Math.floor(totalMatricula * meta / 100 + 1e-9);
    const faltanTotal = Math.max(0, totalReprobados - topeTotal);

    const filaTotales = `<tr class="fila-totales">
        <td><strong>TOTAL GENERAL</strong></td>
        <td>${totalMatricula}</td>
        <td>${totalAprobados}</td>
        <td>${totalReprobados}</td>
        <td>${totalSinCalif}</td>
        <td><span class="pct-badge ${cumpleTotal ? 'ok' : 'mal'}">${formatearPct(pctTotal)}</span></td>
        <td><span class="estado-badge ${cumpleTotal ? 'ok' : 'mal'}">${cumpleTotal ? '✅ Dentro de meta' : '⚠️ Sobre la meta'}</span></td>
        <td>${topeTotal}</td>
        <td>${faltanTotal > 0 ? `<strong>${faltanTotal}</strong>` : '—'}</td>
    </tr>`;

    return {
        totalMatricula,
        totalReprobados,
        html: `<table class="tabla-cuadro">
            <thead>
                <tr>
                    <th>GRADO</th>
                    <th>MATRÍCULA</th>
                    <th>APROBADOS</th>
                    <th>REPROBADOS</th>
                    <th>SIN CALIF.</th>
                    <th>% FRACASO</th>
                    <th>ESTADO vs META</th>
                    <th>TOPE PERMITIDO</th>
                    <th>FALTAN POR APROBAR</th>
                </tr>
            </thead>
            <tbody>
                ${filasHtml}
                ${filaTotales}
            </tbody>
        </table>`,
    };
}

function construirNotasHtml() {
    return `
    <div class="nota-pie">
        <strong>NOTA:</strong> El % de fracaso se calcula sobre la matrícula total del salón
        (reprobados ÷ matrícula). Un estudiante "reprobado" es aquel cuyo promedio final
        (apreciación, ejercicios y examen) está por debajo de ${PROMEDIO_MINIMO_APROBAR.toFixed(1)}.
        "Tope permitido" es la cantidad máxima de reprobados que puede tener ese grado sin pasarse
        de la meta. "Faltan por aprobar" es cuántos de los reprobados actuales deben subir a
        ${PROMEDIO_MINIMO_APROBAR.toFixed(1)} o más para llegar exactamente a la meta.
    </div>
    <div class="fila-firmas">
        <div class="firma"><div class="linea-firma"></div>FIRMA DEL PROFESOR</div>
        <div class="firma"><div class="linea-firma"></div>FIRMA DEL DIRECTOR</div>
    </div>`;
}

// =========================================================
// 5.1) ESTUDIANTES QUE PUEDEN ENTRAR EN RIESGO (aprobados hoy,
//      pero todavía sin nota de Examen): nota mínima que necesitan
//      en el Examen para no caer por debajo del promedio mínimo.
// =========================================================

function construirTablaRiesgoHtml(filas, meta) {
    const candidatos = [];
    filas.forEach((f) => {
        (f.detalleEstudiantes || []).forEach((est) => {
            if (!est.aprobado) return;          // ya está en riesgo/reprobado, no aplica aquí
            if (est.tieneExamen) return;         // ya tiene nota de examen registrada
            if (est.promApr === null || est.promEje === null) return;

            const notaMinima = 3 * meta - est.promApr - est.promEje;
            let estadoNota, notaMostrar;
            if (notaMinima <= 0) {
                estadoNota = "ok";
                notaMostrar = "0.0";
            } else if (notaMinima > NOTA_MAXIMA_ESCALA) {
                estadoNota = "mal";
                notaMostrar = `${NOTA_MAXIMA_ESCALA.toFixed(1)} (no le alcanza)`;
            } else {
                estadoNota = notaMinima >= 3.5 ? "mal" : "ok";
                notaMostrar = notaMinima.toFixed(1);
            }

            candidatos.push({
                salon: est.salonEtiqueta,
                nombre: est.nombre,
                promApr: est.promApr,
                promEje: est.promEje,
                notaMinima,
                notaMostrar,
                estadoNota,
            });
        });
    });

    if (!candidatos.length) {
        return `
        <h3 class="titulo-seccion-riesgo">Estudiantes que deben cuidar su nota de Examen</h3>
        <div class="nota-pie">No hay estudiantes aprobados a la espera de nota de Examen en los grados seleccionados.</div>`;
    }

    candidatos.sort((a, b) => b.notaMinima - a.notaMinima || a.nombre.localeCompare(b.nombre));

    const filasHtml = candidatos.map((c) => `
        <tr>
            <td style="text-align:left;"><strong>${escapeHtml(c.nombre)}</strong></td>
            <td>${escapeHtml(c.salon)}</td>
            <td>${c.promApr.toFixed(1)}</td>
            <td>${c.promEje.toFixed(1)}</td>
            <td><span class="pct-badge ${c.estadoNota === 'ok' ? 'ok' : 'mal'}">${c.notaMostrar}</span></td>
        </tr>`).join("");

    return `
    <h3 class="titulo-seccion-riesgo">⚠️ Estudiantes que deben cuidar su nota de Examen</h3>
    <div class="nota-pie" style="margin-bottom:10px;">
        Estos estudiantes <strong>no están en riesgo actualmente</strong>, pero todavía no tienen nota
        de Examen registrada en Ciencias Naturales. Si sacan una nota más baja de la indicada,
        podrían pasar a estar en riesgo. La columna "Nota mínima en el Examen" es lo que necesitan
        sacar para mantener su promedio final en ${meta.toFixed(1)} o más.
    </div>
    <table class="tabla-cuadro">
        <thead>
            <tr>
                <th>ESTUDIANTE</th>
                <th>SALÓN</th>
                <th>PROM. APREC.</th>
                <th>PROM. EJER.</th>
                <th>NOTA MÍNIMA EN EL EXAMEN</th>
            </tr>
        </thead>
        <tbody>
            ${filasHtml}
        </tbody>
    </table>`;
}

// =========================================================
// 6) GENERAR CUADRO
// =========================================================

btnGenerar.addEventListener("click", async () => {
    const materia = selectMateria.value;
    const trimestre = selectTrimestre.value;
    const meta = parseFloat(inputMeta.value);
    const salonesSeleccionados = Array.from(document.querySelectorAll(".chkSalon:checked")).map((c) => c.value);

    if (!materia) return alert("Selecciona una asignatura.");
    if (!salonesSeleccionados.length) return alert("Selecciona al menos un grado/salón.");
    if (Number.isNaN(meta)) return alert("Escribe una meta de fracaso válida.");

    btnGenerar.disabled = true;
    estadoGeneracion.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Calculando...`;

    try {
        const filas = [];
        for (const salon of salonesSeleccionados) {
            const datos = await calcularDatosSalon(salon, materia, trimestre);
            filas.push(datos);
        }

        const { totalMatricula, totalReprobados, html: tablaHtml } = construirTablaHtml(filas, meta);

        contenidoReporte.innerHTML = `
            ${construirEncabezadoHtml(filas)}
            ${construirResumenMeta(totalMatricula, totalReprobados, meta)}
            ${tablaHtml}
            ${construirTablaRiesgoHtml(filas, PROMEDIO_MINIMO_APROBAR)}
            ${construirNotasHtml()}
        `;
        bloqueReporte.style.display = "block";
        bloqueReporte.scrollIntoView({ behavior: "smooth", block: "start" });
        estadoGeneracion.textContent = "";
    } catch (err) {
        console.error(err);
        alert("No se pudo generar el cuadro: " + err.message);
        estadoGeneracion.textContent = "";
    } finally {
        btnGenerar.disabled = false;
    }
});

// =========================================================
// 7) EXPORTAR A PDF / IMPRIMIR (mismo método que cuadro_aprobados.js)
// =========================================================

btnPdf.addEventListener("click", async () => {
    if (!contenidoReporte.innerHTML.trim()) return alert("Primero genera el cuadro.");
    btnPdf.disabled = true;
    const textoOriginal = btnPdf.innerHTML;
    btnPdf.innerHTML = "⏳ Generando PDF...";
    try {
        if (document.fonts && document.fonts.ready) await document.fonts.ready;
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

        const canvas = await html2canvas(contenidoReporte, { scale: 2.5, backgroundColor: "#ffffff" });
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const ratio = Math.min((pageWidth - 24) / canvas.width, (pageHeight - 24) / canvas.height);
        const w = canvas.width * ratio;
        const h = canvas.height * ratio;
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", (pageWidth - w) / 2, (pageHeight - h) / 2, w, h);
        const materia = selectMateria.value.replace(/\s+/g, "_");
        pdf.save(`Cuadro_Fracaso_${materia}_${selectTrimestre.value.replace(/\s+/g, "_")}.pdf`);
    } catch (err) {
        console.error(err);
        alert("No se pudo generar el PDF: " + err.message);
    } finally {
        btnPdf.disabled = false;
        btnPdf.innerHTML = textoOriginal;
    }
});

btnImprimir.addEventListener("click", () => {
    if (!contenidoReporte.innerHTML.trim()) return alert("Primero genera el cuadro.");
    window.print();
});

// =========================================================
// 8) INICIO
// =========================================================

(async function init() {
    const ok = await verificarSesion();
    if (!ok) return;
    await cargarCatalogoSalones();
    poblarSelectMateria();
    if (inputAnio) inputAnio.value = new Date().getFullYear();
})();
