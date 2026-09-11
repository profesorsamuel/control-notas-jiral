import { supabase } from "./supabase.js";
import { cedulaAEmail } from "./utils.js";

// =========================================================
// LÓGICA REUTILIZABLE DEL "CUADRO DE APROBADOS Y REPROBADOS"
// =========================================================
// Este archivo NO toca el DOM ni depende de selects de ninguna página:
// solo calcula datos (contra Supabase) y arma trozos de HTML a partir
// de los parámetros que se le pasen. Así, tanto cuadro_aprobados.js
// (la página normal, con sus propios selects) como boletin_profesor.js
// (el botón "📦 Descargar TODO", que genera muchos cuadros de golpe sin
// que el usuario tenga que tocar nada) pueden usar exactamente el mismo
// cálculo y el mismo formato de reporte, sin duplicar código.

export function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// Mismo umbral que usa profesor.js para decidir aprobado/reprobado.
export const PROMEDIO_MINIMO_APROBAR = 3.0;
// La app limita cada casilla de nota a un máximo de 5 (ver formatearNotaFinal en profesor.js).
export const NOTA_MAXIMA_ESCALA = 5;

export function normalizarGenero(valor) {
    const v = String(valor ?? "").trim().toUpperCase();
    if (v === "M" || v === "MASCULINO") return "M";
    if (v === "F" || v === "FEMENINO") return "F";
    return "";
}

export function formatearPct(numerador, denominador) {
    if (!denominador) return "0.00%";
    return `${((numerador / denominador) * 100).toFixed(2)}%`;
}

// Compara sin importar tildes/mayúsculas (por si en la base de datos la
// materia quedó guardada como "Informatica" sin tilde, o en otra
// capitalización).
export function esMismaMateria(materia, nombreBuscado) {
    const normalizar = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
    return normalizar(materia) === normalizar(nombreBuscado);
}

// =========================================================
// CÁLCULO POR SALÓN (misma lógica de promedios que profesor.js:
// promedio de apreciaciones, promedio de ejercicios, promedio de
// exámenes, y promedio final = promedio de esos tres promedios).
//
// "mapaSalones" (codigo -> {nivel, letra, nombre_visible, orden}) se
// recibe como parámetro en vez de ser una variable global del módulo,
// para que cualquier página que ya tenga su propio catálogo de salones
// cargado lo pueda reutilizar sin volver a consultarlo.
// =========================================================

export async function calcularDatosSalon(salon, materia, trimestre, mapaSalones = {}) {
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
        // Fuente principal: notas ya conectadas por estudiante_id.
        const { data: notas, error: errNotas } = await supabase
            .from("notas")
            .select("estudiante_id, tipo, nota")
            .eq("materia", materia)
            .eq("trimestre", trimestre)
            .in("estudiante_id", ids)
            .is("eliminado_en", null);
        if (errNotas) throw new Error(`Notas de ${salon}: ${errNotas.message}`);

        (notas || []).forEach((n) => {
            registrarNota(n.estudiante_id, n.tipo, n.nota);
        });

        // Fuente de respaldo: notas antiguas que todavía solo tienen "correo"
        // (sin estudiante_id), igual que hace profesor.js. Sin esto, un
        // estudiante con notas viejas aparecía como "sin calificaciones".
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
                if (n.estudiante_id) return; // ya se registró arriba
                const idEst = correoAId[n.correo];
                if (idEst) registrarNota(idEst, n.tipo, n.nota);
            });
        }
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
        sinCalifNombres: [],
        sinGeneroCantidad: 0,
        sinGeneroNombres: [],
        detalleEstudiantes: [],
    };

    lista.forEach((est) => {
        const g = normalizarGenero(generoDe(est));
        if (!g) {
            resumen.sinGeneroCantidad++;
            resumen.sinGeneroNombres.push(est.nombre);
        }

        const grupos = gruposPorEstudiante[est.id];
        const promApr = grupos && grupos.apr.length ? grupos.apr.reduce((a, b) => a + b, 0) / grupos.apr.length : null;
        const promEje = grupos && grupos.eje.length ? grupos.eje.reduce((a, b) => a + b, 0) / grupos.eje.length : null;
        const promExa = grupos && grupos.exa.length ? grupos.exa.reduce((a, b) => a + b, 0) / grupos.exa.length : null;
        const promedios = [promApr, promEje, promExa].filter((v) => v !== null);

        if (!promedios.length) {
            resumen.sinCalif.total++;
            if (g) resumen.sinCalif[g]++;
            resumen.sinCalifNombres.push(est.nombre);
            return;
        }
        const promFinal = promedios.reduce((a, b) => a + b, 0) / promedios.length;
        const aprobado = promFinal >= PROMEDIO_MINIMO_APROBAR;
        if (aprobado) {
            resumen.aprobados.total++;
            if (g) resumen.aprobados[g]++;
        } else {
            resumen.reprobados.total++;
            if (g) resumen.reprobados[g]++;
            resumen.reprobadosNombres.push(est.nombre);
        }

        // Para el cuadro de "en riesgo de entrar en fracaso": solo aplica a
        // estudiantes hoy aprobados por Apreciación + Ejercicios, pero que
        // todavía no tienen nota de Examen — su promedio puede bajar cuando
        // esa nota se registre.
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
// NIVELES (para el encabezado, ej. "9° A, B, C")
// =========================================================

export function construirTextoNiveles(salonesSeleccionados, mapaSalones = {}) {
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
// RENDER DEL CUADRO IMPRIMIBLE
// =========================================================

function celda(valor) {
    return `<td>${valor}</td>`;
}

function celdaEditable(valor) {
    return `<td class="celda-editable" contenteditable="true">${valor}</td>`;
}

export function construirTablaHtml(filas) {
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

export function construirNombresReprobados(filas) {
    const conNombres = filas.filter((f) => f.reprobadosNombres.length > 0);
    if (!conNombres.length) return `<span class="small text-muted">No hay estudiantes reprobados en los grados seleccionados.</span>`;
    return conNombres.map((f) => `
        <div style="margin-bottom:6px;">
            <strong>${escapeHtml(f.etiqueta)}:</strong>
            ${f.reprobadosNombres.map(escapeHtml).join(", ")}
        </div>
    `).join("");
}

export function construirNombresSinCalificacion(filas) {
    const conNombres = filas.filter((f) => f.sinCalifNombres.length > 0);
    if (!conNombres.length) return `<span class="small text-muted">No hay estudiantes sin calificaciones en los grados seleccionados.</span>`;
    return conNombres.map((f) => `
        <div style="margin-bottom:6px;">
            <strong>${escapeHtml(f.etiqueta)}:</strong>
            ${f.sinCalifNombres.map(escapeHtml).join(", ")}
        </div>
    `).join("");
}

// "datosEncabezado" = { materia, trimestre, anio, jornada, nombreProfesor, mapaSalones }
// (antes esto se leía directamente de los <select>/<input> de cuadro_aprobados.html;
// ahora se recibe como parámetro para que cualquier página lo pueda generar).
export function construirEncabezadoHtml(filas, datosEncabezado = {}) {
    const {
        materia = "",
        trimestre = "",
        anio = new Date().getFullYear(),
        jornada = "—",
        nombreProfesor = "",
        mapaSalones = {},
    } = datosEncabezado;

    const niveles = construirTextoNiveles(filas.map((f) => f.salon), mapaSalones);

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

// =========================================================
// ESTUDIANTES QUE PUEDEN ENTRAR EN RIESGO (aprobados hoy,
// pero todavía sin nota de Examen): nota mínima que necesitan
// en el Examen para no caer por debajo del promedio mínimo.
// =========================================================

export function construirTablaRiesgoHtml(filas, meta) {
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
            <td><span class="pct-badge ${c.estadoNota}">${c.notaMostrar}</span></td>
        </tr>`).join("");

    return `
    <h3 class="titulo-seccion-riesgo">⚠️ Estudiantes que deben cuidar su nota de Examen</h3>
    <div class="nota-pie" style="margin-bottom:10px;">
        Estos estudiantes <strong>no están en riesgo actualmente</strong>, pero todavía no tienen nota
        de Examen registrada. Si sacan una nota más baja de la indicada, podrían pasar a estar en
        riesgo. La columna "Nota mínima en el Examen" es lo que necesitan sacar para mantener su
        promedio final en ${meta.toFixed(1)} o más.
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

// "filas" se recibe como parámetro (antes se leía de window.__ultimasFilasCuadro).
export function construirNotasHtml(filas = []) {
    return `
    <div class="bloque-notas">
        <div class="fila-causas">
            <strong>CAUSAS DEL RETIRO DEL ALUMNO SIN CALIFICACIONES:</strong>
            <div class="celda-editable linea-editable" contenteditable="true">&nbsp;</div>
        </div>
        <div class="fila-reprobados">
            <strong>Nombre de los estudiantes reprobados en su asignatura:</strong>
            <div id="listaReprobados">${construirNombresReprobados(filas)}</div>
        </div>
        <div class="fila-reprobados">
            <strong>Nombre de los estudiantes sin calificaciones:</strong>
            <div id="listaSinCalificacion">${construirNombresSinCalificacion(filas)}</div>
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

// Arma el reporte completo (encabezado + tabla + riesgo + notas), igual
// que lo hace btnGenerar en cuadro_aprobados.js, pero como una sola
// función reutilizable.
export function generarReporteCompletoHtml(filas, datosEncabezado = {}) {
    const materia = datosEncabezado.materia || "";
    return `
        ${construirEncabezadoHtml(filas, datosEncabezado)}
        ${construirTablaHtml(filas)}
        ${esMismaMateria(materia, "Informática") ? "" : construirTablaRiesgoHtml(filas, PROMEDIO_MINIMO_APROBAR)}
        ${construirNotasHtml(filas)}
    `;
}
