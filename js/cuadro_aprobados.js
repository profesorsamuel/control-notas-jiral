import { supabase } from "./supabase.js";
import { cedulaAEmail } from "./utils.js";

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

// Mismo umbral que usa profesor.js para decidir aprobado/reprobado.
const PROMEDIO_MINIMO_APROBAR = 3.0;

function normalizarGenero(valor) {
    const v = String(valor ?? "").trim().toUpperCase();
    if (v === "M" || v === "MASCULINO") return "M";
    if (v === "F" || v === "FEMENINO") return "F";
    return "";
}

function formatearPct(numerador, denominador) {
    if (!denominador) return "0.00%";
    return `${((numerador / denominador) * 100).toFixed(2)}%`;
}

// =========================================================
// 1) SESIÓN (mismo patrón que profesor.js / consejero.js)
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
    const elCampoProfesor = document.getElementById("campoNombreProfesor");
    if (elCampoProfesor) elCampoProfesor.textContent = nombreProfesor;

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
// 3) CÁLCULO POR SALÓN (misma lógica de promedios que profesor.js:
//    promedio de apreciaciones, promedio de ejercicios, promedio de
//    exámenes, y promedio final = promedio de esos tres promedios)
// =========================================================

async function calcularDatosSalon(salon, materia, trimestre) {
    async function consultarEstudiantes(conCedula) {
        return supabase
            .from("estudiantes")
            .select(`id, nombre, correo, genero, es_prueba${conCedula ? ", cedula" : ""}`)
            .eq("salon", salon)
            .order("nombre", { ascending: true });
    }
    let { data: estudiantesSalon, error: errEst } = await consultarEstudiantes(true);
    if (errEst) ({ data: estudiantesSalon, error: errEst } = await consultarEstudiantes(false));
    if (errEst) throw new Error(`Estudiantes de ${salon}: ${errEst.message}`);

    const lista = (estudiantesSalon || []).filter((e) => !e.es_prueba);
    const ids = lista.map((e) => e.id);

    // El género "de verdad" muchas veces vive en "datos_estudiante" (lo
    // llena el propio estudiante en "Mis datos"), identificado por correo,
    // igual que hace informacion_estudiantes.js. El campo genero directo en
    // "estudiantes" es solo un respaldo si el admin lo puso a mano ahí.
    function correoDe(est) {
        if (est.correo) return est.correo;
        if (est.cedula) return cedulaAEmail(est.cedula);
        return null;
    }
    const correos = lista.map((e) => correoDe(e)).filter(Boolean);
    let generoPorCorreo = {};
    if (correos.length) {
        const { data: datosExtra } = await supabase
            .from("datos_estudiante")
            .select("correo, genero")
            .in("correo", correos);
        (datosExtra || []).forEach((d) => {
            if (d.correo) generoPorCorreo[d.correo.toLowerCase()] = d.genero;
        });
    }
    function generoDe(est) {
        const correo = correoDe(est);
        const deExtra = correo ? generoPorCorreo[correo.toLowerCase()] : null;
        return deExtra || est.genero || null;
    }

    const gruposPorEstudiante = {};
    if (ids.length > 0) {
        const { data: notas, error: errNotas } = await supabase
            .from("notas")
            .select("estudiante_id, tipo, nota")
            .eq("materia", materia)
            .eq("trimestre", trimestre)
            .in("estudiante_id", ids)
            .is("eliminado_en", null);
        if (errNotas) throw new Error(`Notas de ${salon}: ${errNotas.message}`);

        (notas || []).forEach((n) => {
            if (n.nota === null || n.nota === undefined || n.nota === "") return;
            const val = parseFloat(n.nota);
            if (Number.isNaN(val)) return;
            const g = (gruposPorEstudiante[n.estudiante_id] ??= { apr: [], eje: [], exa: [] });
            if (n.tipo === "apreciacion") g.apr.push(val);
            else if (n.tipo === "examen") g.exa.push(val);
            else g.eje.push(val);
        });
    }

    const resumen = {
        salon,
        etiqueta: mapaSalones[salon]?.nombre_visible || salon,
        matricula: lista.length,
        // total = cuenta real de estudiantes en esa categoría (siempre correcta,
        // tenga o no género registrado). M/F = desglose, solo cuando el
        // género sí está registrado (por eso M+F puede ser menor que total).
        aprobados: { M: 0, F: 0, total: 0 },
        reprobados: { M: 0, F: 0, total: 0 },
        sinCalif: { M: 0, F: 0, total: 0 },
        reprobadosNombres: [],
        sinGeneroCantidad: 0,
        sinGeneroNombres: [],
    };

    lista.forEach((est) => {
        const g = normalizarGenero(generoDe(est));
        if (!g) {
            resumen.sinGeneroCantidad++;
            resumen.sinGeneroNombres.push(est.nombre);
        }

        const grupos = gruposPorEstudiante[est.id];
        const promedios = grupos
            ? [grupos.apr, grupos.eje, grupos.exa].filter((l) => l.length).map((l) => l.reduce((a, b) => a + b, 0) / l.length)
            : [];

        if (!promedios.length) {
            resumen.sinCalif.total++;
            if (g) resumen.sinCalif[g]++;
            return;
        }
        const promFinal = promedios.reduce((a, b) => a + b, 0) / promedios.length;
        if (promFinal < PROMEDIO_MINIMO_APROBAR) {
            resumen.reprobados.total++;
            if (g) resumen.reprobados[g]++;
            resumen.reprobadosNombres.push(est.nombre);
        } else {
            resumen.aprobados.total++;
            if (g) resumen.aprobados[g]++;
        }
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

function celda(valor) {
    return `<td>${valor}</td>`;
}

function celdaEditable(valor) {
    return `<td class="celda-editable" contenteditable="true">${valor}</td>`;
}

function construirTablaHtml(filas) {
    const totales = {
        matricula: 0,
        aprobados: { M: 0, F: 0, total: 0 },
        reprobados: { M: 0, F: 0, total: 0 },
        sinCalif: { M: 0, F: 0, total: 0 },
    };
    filas.forEach((f) => {
        totales.matricula += f.matricula;
        totales.aprobados.M += f.aprobados.M; totales.aprobados.F += f.aprobados.F; totales.aprobados.total += f.aprobados.total;
        totales.reprobados.M += f.reprobados.M; totales.reprobados.F += f.reprobados.F; totales.reprobados.total += f.reprobados.total;
        totales.sinCalif.M += f.sinCalif.M; totales.sinCalif.F += f.sinCalif.F; totales.sinCalif.total += f.sinCalif.total;
    });

    const filasHtml = filas.map((f) => {
        return `<tr>
            ${celda(`<strong>${escapeHtml(f.etiqueta)}</strong>`)}
            ${celda(f.matricula)}
            ${celda(f.aprobados.M)}${celda(f.aprobados.F)}${celda(`<strong>${f.aprobados.total}</strong>`)}${celda(formatearPct(f.aprobados.total, f.matricula))}
            ${celda(f.reprobados.M)}${celda(f.reprobados.F)}${celda(`<strong>${f.reprobados.total}</strong>`)}${celda(formatearPct(f.reprobados.total, f.matricula))}
            ${celda(f.sinCalif.M)}${celda(f.sinCalif.F)}${celda(`<strong>${f.sinCalif.total}</strong>`)}${celda(formatearPct(f.sinCalif.total, f.matricula))}
            ${celdaEditable(0)}${celdaEditable(0)}
        </tr>`;
    }).join("");

    const filaTotales = `<tr class="fila-totales">
        ${celda("<strong>TOTALES</strong>")}
        ${celda(`<strong>${totales.matricula}</strong>`)}
        ${celda(`<strong>${totales.aprobados.M}</strong>`)}${celda(`<strong>${totales.aprobados.F}</strong>`)}${celda(`<strong>${totales.aprobados.total}</strong>`)}${celda(`<strong>${formatearPct(totales.aprobados.total, totales.matricula)}</strong>`)}
        ${celda(`<strong>${totales.reprobados.M}</strong>`)}${celda(`<strong>${totales.reprobados.F}</strong>`)}${celda(`<strong>${totales.reprobados.total}</strong>`)}${celda(`<strong>${formatearPct(totales.reprobados.total, totales.matricula)}</strong>`)}
        ${celda(`<strong>${totales.sinCalif.M}</strong>`)}${celda(`<strong>${totales.sinCalif.F}</strong>`)}${celda(`<strong>${totales.sinCalif.total}</strong>`)}${celda(`<strong>${formatearPct(totales.sinCalif.total, totales.matricula)}</strong>`)}
        ${celdaEditable(0)}${celdaEditable(0)}
    </tr>`;

    return `<table class="tabla-cuadro">
        <thead>
            <tr>
                <th rowspan="2">GRADO</th>
                <th rowspan="2">MATRÍCULA<br>POR GRADO</th>
                <th colspan="4">APROBADOS</th>
                <th colspan="4">REPROBADOS HASTA LA FECHA</th>
                <th colspan="4">SIN CALIFICACIONES</th>
                <th colspan="2">RETIRADOS</th>
            </tr>
            <tr>
                <th>M</th><th>F</th><th>TOTAL</th><th>%</th>
                <th>M</th><th>F</th><th>TOTAL</th><th>%</th>
                <th>H</th><th>M</th><th>TOTAL</th><th>%</th>
                <th>H</th><th>M</th>
            </tr>
        </thead>
        <tbody>
            ${filasHtml}
            ${filaTotales}
        </tbody>
    </table>`;
}

function construirNombresReprobados(filas) {
    const conNombres = filas.filter((f) => f.reprobadosNombres.length > 0);
    if (!conNombres.length) return `<span class="small text-muted">No hay estudiantes reprobados en los grados seleccionados.</span>`;
    return conNombres.map((f) => `
        <div style="margin-bottom:6px;">
            <strong>${escapeHtml(f.etiqueta)}:</strong>
            ${f.reprobadosNombres.map(escapeHtml).join(", ")}
        </div>
    `).join("");
}

function construirEncabezadoHtml(filas) {
    const materia = selectMateria.value;
    const trimestre = selectTrimestre.value;
    const anio = inputAnio.value || new Date().getFullYear();
    const jornada = selectJornada.value || "—";
    const niveles = construirTextoNiveles(filas.map((f) => f.salon));

    // El aviso de género (con nombres) ya no va dentro del cuadro imprimible:
    // se muestra aparte, en pantalla, como ayuda de trabajo (ver mostrarAvisoGenero()).

    return `
    <div class="encabezado-institucion" contenteditable="true">MINISTERIO DE EDUCACIÓN – DIRECCIÓN REGIONAL DE COLÓN – C.E.B.G. EL JIRAL</div>
    <div class="encabezado-titulo">CUADRO DE ESTUDIANTES APROBADOS Y REPROBADOS</div>
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

// Aviso de trabajo (NO se imprime ni sale en el PDF): lista, por grado,
// los nombres de los estudiantes sin género registrado, para que el
// profesor sepa exactamente a quién completarle el dato.
function mostrarAvisoGenero(filas) {
    const contenedor = document.getElementById("avisoGeneroFaltante");
    const conFaltantes = filas.filter((f) => f.sinGeneroNombres.length > 0);
    if (!conFaltantes.length) {
        contenedor.style.display = "none";
        contenedor.innerHTML = "";
        return;
    }
    const total = conFaltantes.reduce((a, f) => a + f.sinGeneroNombres.length, 0);
    contenedor.innerHTML = `
        <div class="aviso-genero">
            ⚠️ <strong>${total} estudiante(s)</strong> no tienen el campo "Género" lleno en "Información de estudiantes".
            Los totales de APROBADOS/REPROBADOS/SIN CALIFICACIONES ya son correctos, pero el desglose M/F de ellos
            no aparece hasta que les completes el género (Panel Admin → Información de estudiantes → columna "Género").
            Este aviso no sale en el cuadro impreso ni en el PDF.
            ${conFaltantes.map((f) => `
                <div style="margin-top:8px;">
                    <strong>${escapeHtml(f.etiqueta)}:</strong> ${f.sinGeneroNombres.map(escapeHtml).join(", ")}
                </div>
            `).join("")}
        </div>`;
    contenedor.style.display = "block";
}

function construirNotasHtml() {
    return `
    <div class="bloque-notas">
        <div class="fila-causas">
            <strong>CAUSAS DEL RETIRO DEL ALUMNO SIN CALIFICACIONES:</strong>
            <div class="celda-editable linea-editable" contenteditable="true">&nbsp;</div>
        </div>
        <div class="fila-reprobados">
            <strong>Nombre de los estudiantes reprobados en su asignatura:</strong>
            <div id="listaReprobados">${construirNombresReprobados(window.__ultimasFilasCuadro || [])}</div>
        </div>
        <div class="nota-pie">
            <strong>NOTA:</strong>
            1- Haga el % de cada nivel y por asignatura.<br>
            2- Deberá remitir a la Dirección 1 original y 1 copia.<br>
            3- El/la profesor(a) de la asignatura y la dirección deberán conservar una copia.<br>
            4- En la columna de reprobados anotar la cantidad hasta la fecha.
        </div>
        <div class="fila-firmas">
            <div class="firma"><div class="linea-firma"></div>FIRMA DEL PROFESOR</div>
            <div class="firma"><div class="linea-firma"></div>FIRMA DEL DIRECTOR</div>
        </div>
    </div>`;
}

// =========================================================
// 6) GENERAR CUADRO
// =========================================================

btnGenerar.addEventListener("click", async () => {
    const materia = selectMateria.value;
    const trimestre = selectTrimestre.value;
    const salonesSeleccionados = Array.from(document.querySelectorAll(".chkSalon:checked")).map((c) => c.value);

    if (!materia) return alert("Selecciona una asignatura.");
    if (!salonesSeleccionados.length) return alert("Selecciona al menos un grado/salón.");

    btnGenerar.disabled = true;
    estadoGeneracion.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Calculando...`;

    try {
        const filas = [];
        for (const salon of salonesSeleccionados) {
            const datos = await calcularDatosSalon(salon, materia, trimestre);
            filas.push(datos);
        }
        window.__ultimasFilasCuadro = filas;

        contenidoReporte.innerHTML = `
            ${construirEncabezadoHtml(filas)}
            ${construirTablaHtml(filas)}
            ${construirNotasHtml()}
        `;
        mostrarAvisoGenero(filas);
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
// 7) EXPORTAR A PDF (mismo método que profesor.js: html2canvas + jsPDF,
//    A4 horizontal, para que quede idéntico a lo que se ve en pantalla)
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
        pdf.addImage(canvas.toDataURL("image/jpeg", 1.0), "JPEG", (pageWidth - w) / 2, (pageHeight - h) / 2, w, h);
        const materia = selectMateria.value.replace(/\s+/g, "_");
        pdf.save(`Cuadro_Aprobados_${materia}_${selectTrimestre.value.replace(/\s+/g, "_")}.pdf`);
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
