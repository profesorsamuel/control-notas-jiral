// =========================================================
// riesgo.js — Página aparte: "Estudiantes en riesgo"
// =========================================================
// El "modo" (quién puede ver qué) llega por la URL, según desde
// dónde se entró:
//   riesgo.html?modo=profesor   -> solo sus propios salones/materias
//   riesgo.html?modo=consejero  -> su salón asignado, TODAS las materias
//   riesgo.html?modo=admin      -> cualquier salón (o varios a la vez),
//                                   TODAS las materias
// Si no llega el parámetro (o la cuenta no tiene ese rol), se elige
// automáticamente el mejor rol disponible: admin > consejero > profesor.
//
// "En riesgo" = promedio final por debajo de 3.0 (o sea, 2.9 y menos),
// con la misma fórmula que la columna "Prom. Final" del panel del
// docente: promedio de Apreciación, Ejercicio y Examen, cada categoría
// con el mismo peso, ignorando las que todavía no tengan notas.
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
const chipsSalonesRiesgo = document.getElementById("chipsSalonesRiesgo");
const btnSalonesTodos = document.getElementById("btnSalonesTodos");
const btnSalonesNinguno = document.getElementById("btnSalonesNinguno");
const textoSalonFijo = document.getElementById("textoSalonFijo");
const selectTrimestreRiesgo = document.getElementById("selectTrimestreRiesgo");
const btnGenerarReporte = document.getElementById("btnGenerarReporte");
const textoAyudaScope = document.getElementById("textoAyudaScope");
const tarjetaReporte = document.getElementById("tarjetaReporte");
const tarjetaVacia = document.getElementById("tarjetaVacia");
const textoGenerado = document.getElementById("textoGenerado");
const fechaMembrete = document.getElementById("fechaMembrete");
const resumenTop = document.getElementById("resumenTop");
const zonaReporte = document.getElementById("zonaReporte");
const contenidoImprimible = document.getElementById("contenidoImprimible");
const btnImprimir = document.getElementById("btnImprimir");
const btnDescargarPdf = document.getElementById("btnDescargarPdf");
const cajaMensajeWhatsapp = document.getElementById("cajaMensajeWhatsapp");
const textareaMensajeWhatsapp = document.getElementById("textareaMensajeWhatsapp");
const btnRestaurarMensajeWa = document.getElementById("btnRestaurarMensajeWa");

// ---------------------------------------------------------------
// Mensaje de WhatsApp: una sola plantilla editable que se usa para
// todos los estudiantes en riesgo. Los { } se reemplazan con los
// datos de cada estudiante al momento de enviar.
// ---------------------------------------------------------------
const MENSAJE_WHATSAPP_PREDETERMINADO =
    "Buenos días/tardes, saludos. Soy el profesor(a) de {MATERIA} del salón {SALON}. " +
    "Le informo que su acudido(a) {ESTUDIANTE} está presentando bajo rendimiento en las notas " +
    "de la materia durante el {TRIMESTRE}. De seguir así, esto le traerá fracaso este trimestre. " +
    "Le recomendamos que mejore en la materia. ¡Gracias por su atención!";

textareaMensajeWhatsapp.value = MENSAJE_WHATSAPP_PREDETERMINADO;

btnRestaurarMensajeWa.addEventListener("click", () => {
    textareaMensajeWhatsapp.value = MENSAJE_WHATSAPP_PREDETERMINADO;
});

function soloDigitos(str) {
    return String(str ?? "").replace(/\D/g, "");
}

// Arma el número para wa.me: si ya trae el 507 lo deja, si no se lo
// agrega (los celulares en Panamá se guardan sin código de país).
function numeroWhatsapp(telefonoCrudo) {
    const digitos = soloDigitos(telefonoCrudo);
    if (!digitos) return "";
    if (digitos.startsWith("507") && digitos.length >= 11) return digitos;
    return `507${digitos}`;
}

// Un solo listener para todos los botones de WhatsApp de la tabla
// (delegado en zonaReporte, que no se reemplaza como elemento, solo
// su contenido cada vez que se genera el reporte de nuevo).
zonaReporte.addEventListener("click", (ev) => {
    const boton = ev.target.closest(".btn-whatsapp-fila");
    if (!boton || boton.disabled) return;

    const plantilla = textareaMensajeWhatsapp.value.trim() || MENSAJE_WHATSAPP_PREDETERMINADO;
    const mensaje = plantilla
        .replaceAll("{ESTUDIANTE}", boton.dataset.estudiante || "")
        .replaceAll("{MATERIA}", boton.dataset.materia || "")
        .replaceAll("{SALON}", boton.dataset.salon || "")
        .replaceAll("{PROFESOR}", boton.dataset.profesor || "")
        .replaceAll("{TRIMESTRE}", boton.dataset.trimestre || "")
        .replaceAll("{PADRE}", boton.dataset.padre || "");

    const url = `https://wa.me/${boton.dataset.telefono}?text=${encodeURIComponent(mensaje)}`;
    window.open(url, "_blank", "noopener");
});

// ---------------------------------------------------------------
// 1) Sesión y modo
// ---------------------------------------------------------------
let modo = null; // "profesor" | "consejero" | "admin"
let correoCuenta = "";
let salonesProfesor = []; // [{salon, materias:[...]}] -- solo lo del docente
let salonConsejero = "";
let salonesTodos = []; // [{codigo, nombre_visible}] -- para admin
let salonesSeleccionados = new Set();

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

    pintarCambiarPanel("riesgo", "claro-sobre-oscuro");

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

        pintarChipsSalones(salonesProfesor.map((s) => ({ valor: s.salon, etiqueta: s.salon })));
        textoAyudaScope.textContent = "Se revisan solo las materias que tú dictas en cada salón elegido.";
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

        pintarChipsSalones(salonesTodos.map((s) => ({ valor: s.codigo, etiqueta: s.nombre_visible || s.codigo })));
        textoAyudaScope.textContent = "Se revisan todas las materias registradas en cada salón elegido.";
    }
}

// ---------------------------------------------------------------
// Chips de salón (multi-selección) para profesor / admin
// ---------------------------------------------------------------
function pintarChipsSalones(opciones) {
    bloqueSalonSelect.style.display = "";
    if (opciones.length === 0) {
        chipsSalonesRiesgo.innerHTML = `<span class="small text-muted">No hay salones disponibles.</span>`;
        return;
    }
    chipsSalonesRiesgo.innerHTML = opciones.map((o) => `
        <span class="chip-salon" data-valor="${escapeHtml(o.valor)}">${escapeHtml(o.etiqueta)}</span>
    `).join("");

    chipsSalonesRiesgo.querySelectorAll(".chip-salon").forEach((chip) => {
        chip.addEventListener("click", () => {
            const valor = chip.dataset.valor;
            if (salonesSeleccionados.has(valor)) {
                salonesSeleccionados.delete(valor);
                chip.classList.remove("activo");
            } else {
                salonesSeleccionados.add(valor);
                chip.classList.add("activo");
            }
            dispararAutoGenerar();
        });
    });
}

btnSalonesTodos.addEventListener("click", () => {
    chipsSalonesRiesgo.querySelectorAll(".chip-salon").forEach((chip) => {
        salonesSeleccionados.add(chip.dataset.valor);
        chip.classList.add("activo");
    });
    dispararAutoGenerar();
});

btnSalonesNinguno.addEventListener("click", () => {
    salonesSeleccionados.clear();
    chipsSalonesRiesgo.querySelectorAll(".chip-salon").forEach((chip) => chip.classList.remove("activo"));
    dispararAutoGenerar();
});

// ---------------------------------------------------------------
// Auto-generar el reporte al tocar un chip de salón (con un pequeño
// "debounce": si el usuario toca varios salones seguidos, espera a
// que se detenga un momento antes de generar, para no lanzar una
// búsqueda por cada clic individual).
// ---------------------------------------------------------------
let timerAutoGenerar = null;
function dispararAutoGenerar() {
    clearTimeout(timerAutoGenerar);
    timerAutoGenerar = setTimeout(() => generarReporte({ avisarSiVacio: false }), 250);
}

// ---------------------------------------------------------------
// 2) Cálculo de riesgo por materia (promedio final < 3.0)
// ---------------------------------------------------------------
async function calcularRiesgoPorMateria(materia, trimestre, estudiantes) {
    const ids = estudiantes.map((e) => e.id);
    if (ids.length === 0) return [];

    const porEstudiante = {};
    function registrarNota(estudianteId, tipo, nota) {
        if (nota === null || nota === undefined) return;
        const num = Number(nota);
        if (isNaN(num)) return;
        const grupo = (porEstudiante[estudianteId] ??= { apr: [], eje: [], exa: [] });
        if (tipo === "apreciacion") grupo.apr.push(num);
        else if (tipo === "examen") grupo.exa.push(num);
        else grupo.eje.push(num);
    }

    // Fuente principal: notas ya conectadas por estudiante_id.
    const { data: notas, error } = await supabase
        .from("notas")
        .select("estudiante_id, tipo, nota")
        .eq("materia", materia).eq("trimestre", trimestre)
        .in("estudiante_id", ids)
        .is("eliminado_en", null);

    if (error) { console.error(error); return []; }
    (notas || []).forEach((n) => registrarNota(n.estudiante_id, n.tipo, n.nota));

    // Fuente de respaldo: notas antiguas que todavía solo tienen "correo"
    // (sin estudiante_id), igual que hace profesor.js y cuadro_aprobados.js.
    // Sin esto, un estudiante con notas viejas aparecía como "sin
    // calificaciones" y quedaba fuera del reporte de riesgo aunque su
    // promedio real estuviera por debajo del mínimo.
    const correoAId = {};
    estudiantes.forEach((e) => { if (e.correo) correoAId[e.correo] = e.id; });
    const correosActuales = Object.keys(correoAId);
    if (correosActuales.length > 0) {
        const { data: notasPorCorreo, error: errCorreo } = await supabase
            .from("notas")
            .select("estudiante_id, correo, tipo, nota")
            .eq("materia", materia).eq("trimestre", trimestre)
            .in("correo", correosActuales)
            .is("eliminado_en", null);
        if (errCorreo) { console.error(errCorreo); }
        else {
            (notasPorCorreo || []).forEach((n) => {
                if (n.estudiante_id) return; // ya se registró arriba
                const idEst = correoAId[n.correo];
                if (idEst) registrarNota(idEst, n.tipo, n.nota);
            });
        }
    }

    const prom = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

    const resultado = [];
    estudiantes.forEach((est) => {
        const g = porEstudiante[est.id];
        if (!g) return;
        const promApr = prom(g.apr), promEje = prom(g.eje), promExa = prom(g.exa);
        const presentes = [promApr, promEje, promExa].filter((v) => v !== null);
        const promFinalCrudo = presentes.length ? presentes.reduce((a, b) => a + b, 0) / presentes.length : null;
        // Redondeamos a 1 decimal ANTES de comparar, para que un promedio
        // que se muestra como "3.0" (ej. 2.96) no aparezca como en riesgo.
        const promFinal = promFinalCrudo !== null ? Math.round(promFinalCrudo * 10) / 10 : null;
        // "En riesgo" = por debajo de 3.0, usando el valor ya redondeado.
        if (promFinal !== null && promFinal < PROMEDIO_MINIMO_APROBAR) {
            resultado.push({
                nombre: est.nombre,
                telefonoAcudiente: est.telefonoAcudiente || "",
                nombrePadre: est.nombrePadre || "",
                promApr, promEje, promExa, promFinal,
            });
        }
    });

    resultado.sort((a, b) => a.promFinal - b.promFinal);
    return resultado;
}

// Materias a revisar en un salón, y (si aplica) el nombre del/de la
// docente de cada una, para el membrete del reporte.
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
let generandoReporte = false;

async function generarReporte({ avisarSiVacio = true } = {}) {
    const salones = modo === "consejero"
        ? (salonConsejero ? [salonConsejero] : [])
        : [...salonesSeleccionados];

    if (salones.length === 0) {
        if (avisarSiVacio) alert("Elige al menos un salón.");
        // Si se vació la selección desde los chips (sin querer avisar),
        // simplemente ocultamos el reporte y volvemos al estado vacío.
        tarjetaReporte.style.display = "none";
        tarjetaVacia.style.display = "";
        return;
    }

    // Evita solapar dos generaciones si el usuario toca chips muy rápido
    // mientras la anterior todavía está buscando en la base de datos.
    if (generandoReporte) return;
    generandoReporte = true;

    const trimestre = selectTrimestreRiesgo.value;

    btnGenerarReporte.disabled = true;
    const textoOriginal = btnGenerarReporte.innerHTML;
    btnGenerarReporte.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Buscando...`;

    try {
        const reportePorSalon = [];

        for (const salon of salones.sort()) {
            const materiasInfo = await obtenerMateriasYDocentes(salon);
            if (materiasInfo.length === 0) continue;

            const { data: estudiantesSalon, error: errEst } = await supabase
                .from("estudiantes")
                .select("id, nombre, correo, es_prueba")
                .eq("salon", salon)
                .order("nombre", { ascending: true });

            if (errEst) { console.error(errEst); continue; }
            const estudiantes = (estudiantesSalon || []).filter((e) => !e.es_prueba);

            // Traer el teléfono/nombre del acudiente de cada estudiante de
            // este salón, para poder armar el botón de WhatsApp por fila.
            const correosSalon = estudiantes.map((e) => e.correo).filter(Boolean);
            if (correosSalon.length > 0) {
                const { data: datosContacto, error: errContacto } = await supabase
                    .from("datos_estudiante")
                    .select("correo, celular_acudiente1, telefono_acudiente2, nombre_padre_acudiente")
                    .in("correo", correosSalon);
                if (errContacto) console.error(errContacto);
                const contactoPorCorreo = {};
                (datosContacto || []).forEach((d) => { contactoPorCorreo[d.correo] = d; });
                estudiantes.forEach((e) => {
                    const c = contactoPorCorreo[e.correo];
                    e.telefonoAcudiente = c ? (c.celular_acudiente1 || c.telefono_acudiente2 || "") : "";
                    e.nombrePadre = c ? (c.nombre_padre_acudiente || "") : "";
                });
            }

            const porMateria = [];
            for (const { materia, docentes } of materiasInfo) {
                const enRiesgo = await calcularRiesgoPorMateria(materia, trimestre, estudiantes);
                porMateria.push({ materia, docentes, enRiesgo });
            }
            reportePorSalon.push({ salon, porMateria });
        }

        renderizarReporte(trimestre, reportePorSalon);
    } catch (err) {
        console.error(err);
        alert("No se pudo generar el reporte: " + err.message);
    } finally {
        btnGenerarReporte.disabled = false;
        btnGenerarReporte.innerHTML = textoOriginal;
        generandoReporte = false;
    }
}

btnGenerarReporte.addEventListener("click", () => generarReporte({ avisarSiVacio: true }));

function renderizarReporte(trimestre, reportePorSalon) {
    // Solo las materias que sí tienen estudiantes en riesgo.
    const salonesConRiesgo = reportePorSalon
        .map((s) => ({ salon: s.salon, materias: s.porMateria.filter((m) => m.enRiesgo.length > 0) }))
        .filter((s) => s.materias.length > 0);

    const totalEnRiesgo = salonesConRiesgo.reduce(
        (a, s) => a + s.materias.reduce((b, m) => b + m.enRiesgo.length, 0), 0
    );
    const estudiantesUnicos = new Set(
        salonesConRiesgo.flatMap((s) => s.materias.flatMap((m) => m.enRiesgo.map((e) => `${s.salon}-${e.nombre}`)))
    ).size;

    tarjetaVacia.style.display = "none";
    tarjetaReporte.style.display = "";

    const fechaGeneracion = new Date().toLocaleString("es-PA", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
    textoGenerado.textContent = `Generado el ${fechaGeneracion}`;
    fechaMembrete.textContent = `${trimestre} · Fecha de impresión: ${fechaGeneracion}`;

    if (totalEnRiesgo === 0) {
        resumenTop.innerHTML = "";
        zonaReporte.innerHTML = `<p class="text-success text-center py-3">✅ Ningún estudiante de los salones elegidos está por debajo de ${PROMEDIO_MINIMO_APROBAR.toFixed(1)} en ${escapeHtml(trimestre)}.</p>`;
        btnImprimir.style.display = "none";
        btnDescargarPdf.style.display = "none";
        cajaMensajeWhatsapp.style.display = "none";
        return;
    }

    btnImprimir.style.display = "";
    btnDescargarPdf.style.display = "";
    cajaMensajeWhatsapp.style.display = "";

    resumenTop.innerHTML = `
        <span class="pastilla-resumen">${estudiantesUnicos} estudiante${estudiantesUnicos === 1 ? "" : "s"} en riesgo</span>
        <span class="pastilla-resumen">${salonesConRiesgo.length} salón${salonesConRiesgo.length === 1 ? "" : "es"} afectado${salonesConRiesgo.length === 1 ? "" : "s"}</span>`;

    zonaReporte.innerHTML = salonesConRiesgo.map(({ salon, materias }) => {
        const fichas = materias.map(({ materia, docentes, enRiesgo }) => {
            const nombreDocente = docentes.length ? docentes.join(", ") : "—";

            const filas = enRiesgo.map((e, i) => {
                const numeroWa = numeroWhatsapp(e.telefonoAcudiente);
                const botonWa = numeroWa
                    ? `<button type="button" class="btn-whatsapp-fila"
                            data-estudiante="${escapeHtml(e.nombre)}"
                            data-materia="${escapeHtml(materia)}"
                            data-salon="${escapeHtml(salon)}"
                            data-profesor="${escapeHtml(nombreDocente)}"
                            data-trimestre="${escapeHtml(trimestre)}"
                            data-padre="${escapeHtml(e.nombrePadre || "")}"
                            data-telefono="${numeroWa}"
                            title="Enviar mensaje por WhatsApp al acudiente">
                            <i class="fa-brands fa-whatsapp"></i>
                        </button>`
                    : `<button type="button" class="btn-whatsapp-fila" disabled
                            title="Este estudiante no tiene número de WhatsApp del acudiente registrado (se agrega en 'Información de estudiantes')">
                            <i class="fa-brands fa-whatsapp"></i>
                        </button>`;

                return `
                <tr>
                    <td>${i + 1}</td>
                    <td class="nombre">${escapeHtml(e.nombre)}</td>
                    <td>${e.promApr !== null ? e.promApr.toFixed(1) : "–"}</td>
                    <td>${e.promEje !== null ? e.promEje.toFixed(1) : "–"}</td>
                    <td>${e.promExa !== null ? e.promExa.toFixed(1) : "–"}</td>
                    <td class="final">${e.promFinal.toFixed(1)}</td>
                    <td class="no-imprimir">${botonWa}</td>
                </tr>`;
            }).join("");

            return `
                <div class="ficha-materia">
                    <h2 class="conteo-materia">${escapeHtml(materia)} <span class="conteo">(${enRiesgo.length} en riesgo)</span></h2>
                    <div class="datos-ficha">
                        <span><b>Profesor:</b> ${escapeHtml(nombreDocente)}</span>
                        <span><b>Materia:</b> ${escapeHtml(materia)}</span>
                        <span><b>Salón:</b> ${escapeHtml(salon)}</span>
                    </div>
                    <table>
                        <thead>
                            <tr><th>#</th><th>Estudiante</th><th>Prom. Aprec.</th><th>Prom. Ejer.</th><th>Prom. Examen</th><th>Prom. Final</th><th class="no-imprimir">WhatsApp</th></tr>
                        </thead>
                        <tbody>${filas}</tbody>
                    </table>
                    <div class="linea-envio">
                        Enviado a consejero(a) del salón:
                        <span class="casilla"></span> Sí
                        <span class="casilla"></span> No
                    </div>
                </div>`;
        }).join("");

        return `<h2 class="titulo-salon">Salón ${escapeHtml(salon)}</h2>${fichas}`;
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

        const nombreSalones = modo === "consejero"
            ? salonConsejero
            : [...salonesSeleccionados].sort().join("-");
        pdf.save(`Estudiantes_en_riesgo_${nombreSalones || "reporte"}.pdf`);
    } catch (err) {
        console.error(err);
        alert("No se pudo generar el PDF: " + err.message);
    } finally {
        btnDescargarPdf.disabled = false;
        btnDescargarPdf.innerHTML = textoOriginal;
    }
});

iniciar();
