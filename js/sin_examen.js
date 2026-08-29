// =========================================================
// sin_examen.js — Página aparte: "Estudiantes sin examen"
// =========================================================
// Para el docente logueado: elige una materia (de las que dicta) y un
// trimestre, y muestra, agrupados por salón, a TODOS los estudiantes de
// TODOS sus salones para esa materia que todavía no tienen ninguna nota
// guardada en las columnas de tipo "Examen" de ese trimestre. Pensada
// para avisarles (a ellos o a su acudiente) que deben presentar el
// examen final antes de que cierre el trimestre.
// =========================================================

import { supabase } from "./supabase.js";

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
const selectMateriaSinExamen = document.getElementById("selectMateriaSinExamen");
const selectTrimestreSinExamen = document.getElementById("selectTrimestreSinExamen");
const btnGenerarReporte = document.getElementById("btnGenerarReporte");
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
// Mensajes predeterminados
// ---------------------------------------------------------------
const MENSAJE_WHATSAPP_PREDETERMINADO =
    "Buenos días/tardes, saludos. Soy el profesor(a) de {MATERIA} del salón {SALON}. " +
    "Le informo que su acudido(a) {ESTUDIANTE} todavía NO ha presentado el examen final de la materia " +
    "correspondiente al {TRIMESTRE}. Por favor recuérdele que debe presentarlo lo antes posible, ya que " +
    "esto afecta su promedio del trimestre. ¡Gracias por su atención!";

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

function mensajeParaBoton(boton) {
    const plantilla = textareaMensajeWhatsapp.value.trim() || MENSAJE_WHATSAPP_PREDETERMINADO;
    return plantilla
        .replaceAll("{ESTUDIANTE}", boton.dataset.estudiante || "")
        .replaceAll("{MATERIA}", boton.dataset.materia || "")
        .replaceAll("{SALON}", boton.dataset.salon || "")
        .replaceAll("{PROFESOR}", boton.dataset.profesor || "")
        .replaceAll("{TRIMESTRE}", boton.dataset.trimestre || "")
        .replaceAll("{PADRE}", boton.dataset.padre || "");
}

// Un solo listener delegado en zonaReporte (su contenido se reemplaza
// entero cada vez que se genera el reporte, pero el contenedor no).
zonaReporte.addEventListener("click", (ev) => {
    const botonWa = ev.target.closest(".btn-whatsapp-fila");
    if (botonWa && !botonWa.disabled) {
        const mensaje = mensajeParaBoton(botonWa);
        const url = `https://wa.me/${botonWa.dataset.telefono}?text=${encodeURIComponent(mensaje)}`;
        window.open(url, "_blank", "noopener");
        return;
    }

    const botonCorreo = ev.target.closest(".btn-correo-fila");
    if (botonCorreo && !botonCorreo.disabled) {
        const mensaje = mensajeParaBoton(botonCorreo);
        const asunto = `Debes presentar tu examen final de ${botonCorreo.dataset.materia}`;
        const url = `mailto:${encodeURIComponent(botonCorreo.dataset.correo)}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(mensaje)}`;
        window.open(url, "_blank");
    }
});

// ---------------------------------------------------------------
// 1) Sesión y materias del docente
// ---------------------------------------------------------------
let correoCuenta = "";
let nombreProfesor = "";
// { materia: [salon1, salon2, ...] }
let salonesPorMateria = {};

async function iniciar() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
        window.location.href = "login.html";
        return;
    }
    correoCuenta = (user.email || "").trim().toLowerCase();

    const { data: profe } = await supabase
        .from("profesores")
        .select("nombre_profesor")
        .eq("correo_profesor", correoCuenta)
        .maybeSingle();
    nombreProfesor = profe?.nombre_profesor || correoCuenta;

    const { data: materias, error: errM } = await supabase
        .from("profesor_materias")
        .select("materia, salon")
        .eq("correo_profesor", correoCuenta);

    if (errM || !materias || materias.length === 0) {
        alert("No se encontraron materias asignadas a esta cuenta.");
        window.location.href = "profesor.html";
        return;
    }

    salonesPorMateria = {};
    materias.forEach((m) => {
        (salonesPorMateria[m.materia] ??= new Set()).add(m.salon);
    });

    const listaMaterias = Object.keys(salonesPorMateria).sort();
    selectMateriaSinExamen.innerHTML = listaMaterias
        .map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");

    // Si el docente dicta Ciencias Naturales, la dejamos preseleccionada
    // (es el caso de uso más común de este reporte).
    if (listaMaterias.includes("Ciencias Naturales")) {
        selectMateriaSinExamen.value = "Ciencias Naturales";
    }

    await precargarTrimestreActivo();
}

// Preselecciona el trimestre que el admin tiene marcado como "activo"
// ahora mismo, para no obligar al docente a elegirlo a mano cada vez.
async function precargarTrimestreActivo() {
    try {
        const { data, error } = await supabase
            .from("configuracion")
            .select("trimestre_activo")
            .limit(1)
            .single();
        if (!error && data?.trimestre_activo) {
            const existe = Array.from(selectTrimestreSinExamen.options).some((o) => o.value === data.trimestre_activo);
            if (existe) selectTrimestreSinExamen.value = data.trimestre_activo;
        }
    } catch (err) {
        console.warn("⚠️ No se pudo obtener el trimestre activo, se usará Trimestre 1.", err);
    }
}

// ---------------------------------------------------------------
// 2) Averiguar, para una materia+trimestre+salón, quién NO tiene
//    ninguna nota de tipo "examen" guardada.
// ---------------------------------------------------------------
async function estudiantesSinExamen(materia, trimestre, salon) {
    const { data: estudiantesSalon, error: errEst } = await supabase
        .from("estudiantes")
        .select("id, nombre, correo, es_prueba")
        .eq("salon", salon)
        .order("nombre", { ascending: true });

    if (errEst) { console.error(errEst); return []; }
    const estudiantes = (estudiantesSalon || []).filter((e) => !e.es_prueba);
    if (estudiantes.length === 0) return [];

    const ids = estudiantes.map((e) => e.id);
    const conExamen = new Set();

    function registrar(estudianteId, nota) {
        if (!estudianteId) return;
        if (nota === null || nota === undefined || nota === "") return;
        conExamen.add(estudianteId);
    }

    const { data: notas, error } = await supabase
        .from("notas")
        .select("estudiante_id, correo, nota")
        .eq("materia", materia).eq("trimestre", trimestre).eq("tipo", "examen")
        .in("estudiante_id", ids)
        .is("eliminado_en", null);
    if (error) { console.error(error); return []; }
    (notas || []).forEach((n) => registrar(n.estudiante_id, n.nota));

    // Igual que en el resto del sistema: respaldo por correo, para
    // notas antiguas que todavía no tienen estudiante_id enlazado.
    const correoAId = {};
    estudiantes.forEach((e) => { if (e.correo) correoAId[e.correo] = e.id; });
    const correosActuales = Object.keys(correoAId);
    if (correosActuales.length > 0) {
        const { data: notasPorCorreo, error: errCorreo } = await supabase
            .from("notas")
            .select("estudiante_id, correo, nota")
            .eq("materia", materia).eq("trimestre", trimestre).eq("tipo", "examen")
            .in("correo", correosActuales)
            .is("eliminado_en", null);
        if (errCorreo) { console.error(errCorreo); }
        else {
            (notasPorCorreo || []).forEach((n) => {
                if (n.estudiante_id) return; // ya se contó arriba
                const idEst = correoAId[n.correo];
                if (idEst) registrar(idEst, n.nota);
            });
        }
    }

    const sinExamen = estudiantes.filter((e) => !conExamen.has(e.id));
    if (sinExamen.length === 0) return [];

    // Si NADIE en este salón tiene todavía una nota de Examen, es que el
    // docente sencillamente no ha empezado a calificarlo aquí (salón que
    // todavía no le toca, examen no aplicado, etc.) — no marcar a todo
    // el salón como "sin examen", solo mostrar los que de verdad ya
    // deberían tenerlo y les falta.
    if (conExamen.size === 0) return [];

    // Teléfono/nombre del acudiente, para el botón de WhatsApp.
    const correosSinExamen = sinExamen.map((e) => e.correo).filter(Boolean);
    if (correosSinExamen.length > 0) {
        const { data: datosContacto, error: errContacto } = await supabase
            .from("datos_estudiante")
            .select("correo, celular_acudiente1, telefono_acudiente2, nombre_padre_acudiente")
            .in("correo", correosSinExamen);
        if (errContacto) console.error(errContacto);
        const contactoPorCorreo = {};
        (datosContacto || []).forEach((d) => { contactoPorCorreo[d.correo] = d; });
        sinExamen.forEach((e) => {
            const c = contactoPorCorreo[e.correo];
            e.telefonoAcudiente = c ? (c.celular_acudiente1 || c.telefono_acudiente2 || "") : "";
            e.nombrePadre = c ? (c.nombre_padre_acudiente || "") : "";
        });
    }

    sinExamen.sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
    return sinExamen;
}

// ---------------------------------------------------------------
// 3) Generar el reporte en pantalla
// ---------------------------------------------------------------
let generandoReporte = false;

async function generarReporte() {
    const materia = selectMateriaSinExamen.value;
    const trimestre = selectTrimestreSinExamen.value;
    if (!materia) return;

    if (generandoReporte) return;
    generandoReporte = true;

    btnGenerarReporte.disabled = true;
    const textoOriginal = btnGenerarReporte.innerHTML;
    btnGenerarReporte.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Buscando...`;

    try {
        const salones = [...(salonesPorMateria[materia] || [])].sort();
        const reportePorSalon = [];

        for (const salon of salones) {
            const sinExamen = await estudiantesSinExamen(materia, trimestre, salon);
            if (sinExamen.length > 0) reportePorSalon.push({ salon, sinExamen });
        }

        renderizarReporte(materia, trimestre, reportePorSalon);
    } catch (err) {
        console.error(err);
        alert("No se pudo generar el reporte: " + err.message);
    } finally {
        btnGenerarReporte.disabled = false;
        btnGenerarReporte.innerHTML = textoOriginal;
        generandoReporte = false;
    }
}

btnGenerarReporte.addEventListener("click", generarReporte);

function renderizarReporte(materia, trimestre, reportePorSalon) {
    const totalSinExamen = reportePorSalon.reduce((a, s) => a + s.sinExamen.length, 0);

    tarjetaVacia.style.display = "none";
    tarjetaReporte.style.display = "";

    const fechaGeneracion = new Date().toLocaleString("es-PA", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
    textoGenerado.textContent = `Generado el ${fechaGeneracion}`;
    fechaMembrete.textContent = `${escapeHtml(materia)} · ${escapeHtml(trimestre)} · Fecha de impresión: ${fechaGeneracion}`;

    if (totalSinExamen === 0) {
        resumenTop.innerHTML = "";
        zonaReporte.innerHTML = `<p class="text-success text-center py-3">✅ Todos los estudiantes de ${escapeHtml(materia)} ya tienen su nota de Examen en ${escapeHtml(trimestre)}.</p>`;
        btnImprimir.style.display = "none";
        btnDescargarPdf.style.display = "none";
        cajaMensajeWhatsapp.style.display = "none";
        return;
    }

    btnImprimir.style.display = "";
    btnDescargarPdf.style.display = "";
    cajaMensajeWhatsapp.style.display = "";

    resumenTop.innerHTML = `
        <span class="pastilla-resumen">${totalSinExamen} estudiante${totalSinExamen === 1 ? "" : "s"} sin examen</span>
        <span class="pastilla-resumen">${reportePorSalon.length} salón${reportePorSalon.length === 1 ? "" : "es"} afectado${reportePorSalon.length === 1 ? "" : "s"}</span>`;

    zonaReporte.innerHTML = reportePorSalon.map(({ salon, sinExamen }) => {
        const filas = sinExamen.map((e) => {
            const numeroWa = numeroWhatsapp(e.telefonoAcudiente);
            const botonWa = numeroWa
                ? `<button type="button" class="btn-whatsapp-fila"
                        data-estudiante="${escapeHtml(e.nombre)}"
                        data-materia="${escapeHtml(materia)}"
                        data-salon="${escapeHtml(salon)}"
                        data-profesor="${escapeHtml(nombreProfesor)}"
                        data-trimestre="${escapeHtml(trimestre)}"
                        data-padre="${escapeHtml(e.nombrePadre || "")}"
                        data-telefono="${numeroWa}"
                        title="Avisar por WhatsApp al acudiente"><i class="fa-brands fa-whatsapp"></i></button>`
                : `<button type="button" class="btn-whatsapp-fila" disabled title="Sin teléfono de acudiente registrado"><i class="fa-brands fa-whatsapp"></i></button>`;

            const botonCorreo = e.correo
                ? `<button type="button" class="btn-correo-fila"
                        data-estudiante="${escapeHtml(e.nombre)}"
                        data-materia="${escapeHtml(materia)}"
                        data-salon="${escapeHtml(salon)}"
                        data-profesor="${escapeHtml(nombreProfesor)}"
                        data-trimestre="${escapeHtml(trimestre)}"
                        data-padre="${escapeHtml(e.nombrePadre || "")}"
                        data-correo="${escapeHtml(e.correo)}"
                        title="Avisar por correo al estudiante"><i class="fa-solid fa-envelope"></i></button>`
                : `<button type="button" class="btn-correo-fila" disabled title="Sin correo registrado"><i class="fa-solid fa-envelope"></i></button>`;

            return `<tr>
                <td class="nombre">${escapeHtml(e.nombre)}</td>
                <td><div class="celda-acciones-fila">${botonWa}${botonCorreo}</div></td>
            </tr>`;
        }).join("");

        return `
            <h2 class="titulo-salon">Salón ${escapeHtml(salon)}</h2>
            <div class="ficha-materia">
                <h2 class="conteo-materia">Sin nota de Examen <span class="conteo">(${sinExamen.length} estudiante${sinExamen.length === 1 ? "" : "s"})</span></h2>
                <table>
                    <thead><tr><th style="text-align:left;">Estudiante</th><th style="width:100px;">Avisar</th></tr></thead>
                    <tbody>${filas}</tbody>
                </table>
            </div>`;
    }).join("");
}

// ---------------------------------------------------------------
// Imprimir / descargar PDF (misma técnica que usa el resto del sitio)
// ---------------------------------------------------------------
btnImprimir.addEventListener("click", () => window.print());

btnDescargarPdf.addEventListener("click", async () => {
    const textoOriginal = btnDescargarPdf.innerHTML;
    btnDescargarPdf.disabled = true;
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

        pdf.save(`SinExamen_${selectMateriaSinExamen.value}_${selectTrimestreSinExamen.value}.pdf`);
    } catch (err) {
        console.error(err);
        alert("No se pudo generar el PDF: " + err.message);
    } finally {
        btnDescargarPdf.disabled = false;
        btnDescargarPdf.innerHTML = textoOriginal;
    }
});

iniciar();
