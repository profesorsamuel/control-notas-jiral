import { supabase } from "./supabase.js";
import { cedulaAEmail } from "./utils.js";

// =====================================================
// LISTA BASE DE MATERIAS (igual que en el panel del estudiante)
// =====================================================

const MATERIAS_BASE = [
    "Español",
    "Matemática",
    "Ciencias Naturales",
    "Inglés",
    "Expresión Artística",
    "Música",
    "Educación Física",
    "Familia y Desarrollo Comunitario",
    "Historia",
    "Educación Agropecuaria",
    "Contabilidad",
    "Geografía",
    "Orientación",
    "Cívica",
    "Religión, Moral y Valores"
];

// Nota mínima para aprobar (igual que en el panel del estudiante)
const NOTA_MINIMA_APROBAR = 3;

// Frases de felicitación para materias que van bien (promedio >= 3).
// Se elige una al azar cada vez que se genera el PDF, así que si se
// imprime varias veces no siempre sale la misma frase.
const FRASES_FELICITACION = [
    "¡Excelente trabajo, sigue así!",
    "¡Vas muy bien, felicidades!",
    "¡Gran desempeño en esta materia!",
    "¡Sigue esforzándote, vas por buen camino!",
    "¡Felicidades por tu buen rendimiento!",
    "¡Muy bien! Tu esfuerzo se nota.",
    "¡Excelente, continúa con esa dedicación!",
    "¡Buen trabajo, mantén ese ritmo!",
    "¡Felicitaciones, tus notas lo reflejan!",
    "¡Vas superando las expectativas, sigue así!",
    "¡Tu dedicación está dando frutos!",
    "¡Increíble desempeño, felicidades!",
    "¡Sigue brillando en esta materia!",
    "¡Un aplauso por tu esfuerzo constante!",
    "¡Vas muy bien encaminado(a)!",
    "¡Excelente progreso, no bajes el ritmo!",
    "¡Tu constancia está dando resultados!",
    "¡Felicidades, estás demostrando gran compromiso!",
    "¡Sigue así, tu esfuerzo vale la pena!",
    "¡Muy buen trabajo, continúa esforzándote!"
];

function fraseFelicitacionAleatoria() {
    return FRASES_FELICITACION[Math.floor(Math.random() * FRASES_FELICITACION.length)];
}

// =====================================================
// ELEMENTOS DEL DOM
// =====================================================

const inputCedula = document.getElementById("cedula");
const btnOjo = document.getElementById("btnOjo");
const btnBuscar = document.getElementById("btnBuscar");
const mensaje = document.getElementById("mensaje");
const resultado = document.getElementById("resultado");
const nombreEstudianteEl = document.getElementById("nombreEstudiante");
const salonEstudianteEl = document.getElementById("salonEstudiante");
const filtroTrimestre = document.getElementById("filtroTrimestre");
const contenedorMaterias = document.getElementById("materias");
const btnPdf = document.getElementById("btnPdf");
const bloqueNoRegistrado = document.getElementById("bloqueNoRegistrado");
const btnRegistrarNotas = document.getElementById("btnRegistrarNotas");
const bloqueRegistrado = document.getElementById("bloqueRegistrado");
const btnDatosEstudianteRegistrado = document.getElementById("btnDatosEstudianteRegistrado");
const btnEditarNotas = document.getElementById("btnEditarNotas");

// =====================================================
// ESTADO
// =====================================================

let estudianteActual = null;   // { nombre, salon }
let notasCrudas = [];          // todas las filas que devuelve la función
let cedulaConsultada = "";
let trimestreActivo = "Trimestre 1"; // se actualiza con el que haya puesto el administrador
let idConsultaActual = null;   // id del registro de estadísticas de esta búsqueda

// =====================================================
// TRIMESTRE ACTIVO (el que el administrador tiene configurado)
// =====================================================
// Así, cuando el estudiante/padre entra a ver las notas, por defecto
// le aparece el trimestre que se está cursando en este momento,
// no siempre "Trimestre 1".

async function cargarTrimestreActivo() {
    try {
        const { data, error } = await supabase
            .from("configuracion")
            .select("trimestre_activo")
            .limit(1)
            .single();

        if (!error && data?.trimestre_activo) {
            trimestreActivo = data.trimestre_activo;
        }
    } catch (err) {
        console.warn("⚠️ No se pudo obtener el trimestre activo, se usará Trimestre 1.", err);
    }

    // Preselecciona el trimestre activo en el filtro (si existe como opción)
    const opcionExiste = Array.from(filtroTrimestre.options).some((o) => o.value === trimestreActivo);
    if (opcionExiste) {
        filtroTrimestre.value = trimestreActivo;
    }
}

cargarTrimestreActivo();

// =====================================================
// MOSTRAR / OCULTAR CÉDULA
// =====================================================

btnOjo.addEventListener("click", () => {
    const oculto = inputCedula.type === "password";
    inputCedula.type = oculto ? "text" : "password";
    btnOjo.textContent = oculto ? "🙈" : "👁️";
});

// Enter también busca
inputCedula.addEventListener("keydown", (e) => {
    if (e.key === "Enter") buscar();
});

// Si la página llega con ?cedula=... (por ejemplo desde inicio.html),
// se precarga y se busca automáticamente.
const cedulaDesdeURL = new URLSearchParams(window.location.search).get("cedula");
if (cedulaDesdeURL) {
    inputCedula.value = cedulaDesdeURL;
    buscar();
}

btnBuscar.addEventListener("click", buscar);
filtroTrimestre.addEventListener("change", () => render());

// =====================================================
// MENSAJES
// =====================================================

function mostrarMensaje(texto, tipo) {
    mensaje.textContent = texto;
    mensaje.className = `mensaje ${tipo}`;
}

function ocultarMensaje() {
    mensaje.className = "mensaje";
    mensaje.textContent = "";
}

// =====================================================
// BUSCAR
// =====================================================

async function buscar() {
    const cedula = inputCedula.value.trim();

    if (!cedula) {
        mostrarMensaje("⚠️ Por favor escribe tu cédula.", "error");
        return;
    }

    btnBuscar.disabled = true;
    btnBuscar.textContent = "Buscando...";
    ocultarMensaje();
    resultado.style.display = "none";

    // Por si todavía no había terminado de cargar el trimestre activo
    await cargarTrimestreActivo();

    const [{ data: est, error: errEst }, { data: notas, error: errNotas }] = await Promise.all([
        supabase.rpc("obtener_estudiante_por_cedula", { p_cedula: cedula }),
        supabase.rpc("obtener_notas_por_cedula", { p_cedula: cedula })
    ]);

    btnBuscar.disabled = false;
    btnBuscar.textContent = "Ver mis notas";

    if (errEst || errNotas) {
        console.error("❌ Error al consultar:", errEst || errNotas);
        mostrarMensaje("❌ Ocurrió un error al consultar. Intenta de nuevo.", "error");
        return;
    }

    // Registra la búsqueda para las estadísticas (no bloquea la
    // pantalla si falla, solo se anota en la consola).
    idConsultaActual = null;
    supabase.rpc("registrar_consulta_cedula", { p_cedula: cedula })
        .then(({ data, error }) => {
            if (error) {
                console.warn("⚠️ No se pudo registrar la consulta para estadísticas:", error);
                return;
            }
            idConsultaActual = data;
        });

    const estudiante = Array.isArray(est) ? est[0] : est;

    if (!estudiante) {
        mostrarMensaje("⚠️ No se encontró ningún estudiante con esa cédula. Verifica que esté bien escrita, o que ya te hayas registrado.", "error");
        return;
    }

    estudianteActual = estudiante;
    notasCrudas = notas || [];
    cedulaConsultada = cedula;

    nombreEstudianteEl.textContent = estudiante.nombre || "Estudiante";
    salonEstudianteEl.textContent = estudiante.salon ? `Salón: ${estudiante.salon}` : "";

    let estaRegistrado = estudiante.registrado;

    if (estaRegistrado) {
        // -------------------------------------------------
        // ¿Esta cuenta se registró alguna vez pero nunca se
        // llegó a usar de verdad? (nunca configuró sus 3
        // preguntas de seguridad, que se piden en el primer
        // inicio de sesión real). Si es así, se libera
        // automáticamente para que la persona pueda registrarse
        // de cero, en vez de quedar atascada intentando iniciar
        // sesión con una contraseña que nadie conoce.
        // -------------------------------------------------
        const correoInterno = cedulaAEmail(cedula);

        const { data: tienePreguntas, error: errPreguntas } =
            await supabase.rpc("tiene_preguntas_seguridad", { p_correo: correoInterno });

        if (!errPreguntas && !tienePreguntas) {
            const { data: liberada, error: errLiberar } =
                await supabase.rpc("liberar_cuenta_sin_usar", { p_correo: correoInterno });

            if (!errLiberar && liberada) {
                estaRegistrado = false;
            }
        }
    }

    if (estaRegistrado) {
        bloqueNoRegistrado.style.display = "none";
        bloqueRegistrado.style.display = "block";
        btnEditarNotas.href = `login.html?cedula=${encodeURIComponent(cedula)}`;
        btnDatosEstudianteRegistrado.href = `login.html?cedula=${encodeURIComponent(cedula)}&next=datos.html`;
        btnDatosEstudianteRegistrado.style.display = estudiante.datos_completos ? "none" : "inline-block";
    } else {
        bloqueRegistrado.style.display = "none";
        bloqueNoRegistrado.style.display = "block";
        btnRegistrarNotas.href = `registro.html?tipo=estudiante&cedula=${encodeURIComponent(cedula)}`;
    }

    resultado.style.display = "block";
    render();
}

// =====================================================
// AGRUPAR NOTAS
// =====================================================

function calcularPromedio(valores) {
    if (valores.length === 0) return null;
    return valores.reduce((a, b) => a + b, 0) / valores.length;
}

function filasParaTrimestre(trimestre) {
    return trimestre === "todos"
        ? notasCrudas
        : notasCrudas.filter((n) => n.trimestre === trimestre);
}

function agruparPorMateria(filas) {
    const porMateria = {};

    filas.forEach((n) => {
        if (!porMateria[n.materia]) {
            porMateria[n.materia] = { apreciacion: [], ejercicio: [] };
        }
        const tipoNorm = (n.tipo || "").toLowerCase();
        if (tipoNorm !== "apreciacion" && tipoNorm !== "ejercicio") return;

        const valor = n.estado === "Intencional" ? 0 : Number(n.nota);
        porMateria[n.materia][tipoNorm].push({ numero: n.numero, valor, tema: n.tema });
    });

    return porMateria;
}

function materiasParaMostrar(porMateria) {
    const extras = Object.keys(porMateria)
        .filter((m) => !MATERIAS_BASE.includes(m) && m !== "Informática")
        .sort();

    const base = estudianteActual?.salon === "8A"
        ? MATERIAS_BASE.map((m) => (m === "Contabilidad" ? "Informática" : m))
        : MATERIAS_BASE;

    return [...base, ...extras];
}

// Reúne, para un conjunto de filas ya filtradas por trimestre, el
// promedio de apreciación/ejercicio/final de cada materia con notas.
// Se usa tanto para pintar la pantalla como para armar el PDF.
function calcularResumenMaterias(filas) {
    const porMateria = agruparPorMateria(filas);
    const materias = materiasParaMostrar(porMateria);
    const resumen = [];

    materias.forEach((materia) => {
        const datos = porMateria[materia] || { apreciacion: [], ejercicio: [] };
        if (datos.apreciacion.length === 0 && datos.ejercicio.length === 0) return;

        const promApr = calcularPromedio(datos.apreciacion.map((x) => x.valor));
        const promEje = calcularPromedio(datos.ejercicio.map((x) => x.valor));
        const promFinal = promApr !== null && promEje !== null
            ? (promApr + promEje) / 2
            : (promApr ?? promEje);

        resumen.push({
            materia,
            datos,
            promApr,
            promEje,
            promFinal,
            fracaso: promFinal !== null && promFinal < NOTA_MINIMA_APROBAR
        });
    });

    return resumen;
}

// =====================================================
// RENDER (pantalla)
// =====================================================

function render() {
    const trimestre = filtroTrimestre.value;
    const filas = filasParaTrimestre(trimestre);
    const resumen = calcularResumenMaterias(filas);

    let html = "";

    resumen.forEach(({ materia, datos, promApr, promEje, promFinal, fracaso }) => {
        const notasApr = datos.apreciacion.slice().sort((a, b) => a.numero - b.numero);
        const notasEje = datos.ejercicio.slice().sort((a, b) => a.numero - b.numero);
        const maxCols = Math.max(notasApr.length, notasEje.length, 1);

        const celdasNota = (lista) => {
            const celdas = lista.map((n) => `<td>${n.valor.toFixed(1)}</td>`);
            while (celdas.length < maxCols) celdas.push(`<td>-</td>`);
            return celdas.join("");
        };

        const filasApr = celdasNota(notasApr);
        const filasEje = celdasNota(notasEje);

        const claseAprFallo = promApr !== null && promApr < NOTA_MINIMA_APROBAR ? "promedio promedio-fracaso" : "promedio";
        const claseEjeFallo = promEje !== null && promEje < NOTA_MINIMA_APROBAR ? "promedio promedio-fracaso" : "promedio";
        const claseFinal = fracaso ? "promedio-final-linea fracaso" : "promedio-final-linea";
        const claseTarjeta = fracaso ? "materia-card materia-fracaso" : "materia-card";

        html += `
            <div class="${claseTarjeta}">
                <h3>${escapeHtml(materia)} ${fracaso ? `<span class="etiqueta-fracaso">EN RIESGO</span>` : ""}</h3>
                <div style="overflow-x:auto;">
                    <table class="tabla-notas">
                        <thead>
                            <tr>
                                <th>Tipo</th>
                                <th colspan="${maxCols}" style="text-align:left; padding-left:10px;">Notas</th>
                                <th>Promedio</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><strong>Apreciación</strong></td>
                                ${filasApr}
                                <td class="${claseAprFallo}">${promApr !== null ? promApr.toFixed(1) : "-"}</td>
                            </tr>
                            <tr>
                                <td><strong>Ejercicio</strong></td>
                                ${filasEje}
                                <td class="${claseEjeFallo}">${promEje !== null ? promEje.toFixed(1) : "-"}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <p class="${claseFinal}">
                    Promedio final: ${promFinal !== null ? promFinal.toFixed(1) : "-"}
                </p>
                ${fracaso ? `
                    <p class="aviso-fracaso-card">
                        ⚠️ Esta materia está actualmente por debajo de la nota mínima para aprobar (${NOTA_MINIMA_APROBAR.toFixed(1)}).
                        Recuerda que todavía pueden faltar notas de este trimestre y el examen final, así que este
                        promedio puede cambiar.
                    </p>
                ` : ""}
                ${materia === "Ciencias Naturales" ? `
                    <p class="aviso-leyenda-card">
                        ℹ️ Nota 1 es de la clase 1. Nota 2 es de la clase 2. Nota 3 es el proyecto científico.
                        Nota 4 es de la clase 3. Nota 5 es la feria científica.<br>
                        Falta un ejercicio de la clase 3 y el examen final.
                    </p>
                ` : ""}
            </div>
        `;
    });

    if (!html) {
        html = `<p style="text-align:center; color:#64748b;">Todavía no hay notas registradas para este trimestre.</p>`;
    }

    contenedorMaterias.innerHTML = html;
}

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// =====================================================
// DESCARGAR PDF
// =====================================================

btnPdf.addEventListener("click", () => {
    if (!estudianteActual) return;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(14);
    doc.text("C.E.B.G. EL JIRAL - Notas de Evaluación", 20, 20);
    doc.setFontSize(11);
    doc.text(`Estudiante: ${estudianteActual.nombre || "-"}`, 20, 30);
    doc.text(`Salón: ${estudianteActual.salon || "-"}`, 20, 37);

    const trimestre = filtroTrimestre.value;
    doc.text(`Trimestre: ${trimestre === "todos" ? "Todos" : trimestre}`, 20, 44);

    const fechaGeneracion = new Date().toLocaleString("es-PA", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit"
    });
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generado el: ${fechaGeneracion}`, 20, 50);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);

    const filas = filasParaTrimestre(trimestre);
    const resumen = calcularResumenMaterias(filas);

    let y = 58;

    // ---------------------------------------------------
    // UNA TABLA POR MATERIA, CON TODAS LAS NOTAS INDIVIDUALES
    // (igual que se ve en pantalla, no solo el promedio)
    // ---------------------------------------------------
    resumen.forEach((r) => {
        if (y > 255) { doc.addPage(); y = 20; }

        const colorMateria = r.fracaso ? [180, 0, 0] : [31, 78, 121];

        doc.setFontSize(11);
        doc.setFont(undefined, "bold");
        doc.setTextColor(...colorMateria);
        doc.text(r.materia + (r.fracaso ? "  (EN FRACASO)" : ""), 20, y);
        doc.setFont(undefined, "normal");
        doc.setTextColor(0, 0, 0);
        y += 4;

        const notasApr = r.datos.apreciacion.slice().sort((a, b) => a.numero - b.numero).map((n) => n.valor.toFixed(1));
        const notasEje = r.datos.ejercicio.slice().sort((a, b) => a.numero - b.numero).map((n) => n.valor.toFixed(1));
        const maxCols = Math.max(notasApr.length, notasEje.length, 1);

        const rellenar = (arr) => {
            const copia = arr.slice();
            while (copia.length < maxCols) copia.push("-");
            return copia;
        };

        const encabezado = ["Tipo", ...Array.from({ length: maxCols }, (_, i) => `N°${i + 1}`), "Promedio"];
        const filaApr = ["Apreciación", ...rellenar(notasApr), r.promApr !== null ? r.promApr.toFixed(1) : "-"];
        const filaEje = ["Ejercicio", ...rellenar(notasEje), r.promEje !== null ? r.promEje.toFixed(1) : "-"];

        doc.autoTable({
            head: [encabezado],
            body: [filaApr, filaEje],
            startY: y,
            styles: {
                fontSize: 8,
                halign: "center",
                textColor: r.fracaso ? [180, 0, 0] : [30, 30, 30]
            },
            headStyles: {
                fillColor: r.fracaso ? [180, 0, 0] : [31, 78, 121],
                textColor: 255
            },
            columnStyles: { 0: { halign: "left", fontStyle: "bold" } },
            margin: { left: 20, right: 20 }
        });

        y = doc.lastAutoTable.finalY + 6;

        if (y > 270) { doc.addPage(); y = 20; }

        doc.setFontSize(10);
        doc.setFont(undefined, "bold");
        doc.setTextColor(...colorMateria);
        doc.text(`Promedio final: ${r.promFinal !== null ? r.promFinal.toFixed(1) : "-"}`, 20, y);
        doc.setFont(undefined, "normal");
        y += 6;

        if (r.fracaso) {
            doc.setFontSize(8.5);
            doc.setTextColor(180, 0, 0);
            const texto = "Nota por debajo del mínimo para aprobar. Recuerda que todavía pueden faltar notas de este trimestre y el examen final.";
            const lineas = doc.splitTextToSize(texto, 170);
            doc.text(lineas, 20, y);
            y += lineas.length * 4 + 5;
        } else if (r.promFinal !== null) {
            doc.setFontSize(8.5);
            doc.setFont(undefined, "italic");
            doc.setTextColor(21, 128, 61);
            doc.text(fraseFelicitacionAleatoria(), 20, y);
            doc.setFont(undefined, "normal");
            y += 8;
        } else {
            y += 3;
        }

        doc.setTextColor(0, 0, 0);
    });

    // ---------------------------------------------------
    // PROMEDIO GENERAL Y ALERTA RESUMEN (si hay fracasos)
    // ---------------------------------------------------
    const materiasConPromedio = resumen.filter((r) => r.promFinal !== null);
    const promedioGeneral = materiasConPromedio.length > 0
        ? materiasConPromedio.reduce((a, r) => a + r.promFinal, 0) / materiasConPromedio.length
        : null;

    const materiasEnFracaso = resumen.filter((r) => r.fracaso);

    if (y > 250) { doc.addPage(); y = 20; }

    if (promedioGeneral !== null) {
        const enFracasoGeneral = promedioGeneral < NOTA_MINIMA_APROBAR;
        doc.setDrawColor(150, 150, 150);
        doc.setLineWidth(0.3);
        doc.line(20, y, 190, y);
        y += 8;

        doc.setFontSize(12);
        doc.setFont(undefined, "bold");
        if (enFracasoGeneral) doc.setTextColor(200, 0, 0);
        doc.text(`Promedio General: ${promedioGeneral.toFixed(1)}${enFracasoGeneral ? "  (EN FRACASO)" : ""}`, 20, y);
        doc.setTextColor(0, 0, 0);
        doc.setFont(undefined, "normal");
        doc.setFontSize(10);
        y += 10;
    }

    if (materiasEnFracaso.length > 0) {
        if (y > 240) { doc.addPage(); y = 25; }

        doc.setDrawColor(200, 0, 0);
        doc.setLineWidth(0.5);
        doc.line(20, y, 190, y);
        y += 8;

        doc.setFont(undefined, "bold");
        doc.setFontSize(11);
        doc.setTextColor(180, 0, 0);
        doc.text("NOTA PARA EL ESTUDIANTE Y LOS PADRES / ACUDIENTES", 20, y);
        y += 7;

        doc.setFont(undefined, "normal");
        doc.setFontSize(9);
        doc.setTextColor(0, 0, 0);

        const materiasTexto = materiasEnFracaso.map((r) => r.materia).join(", ");
        const textoAlerta =
            `El promedio final actual está por debajo de la nota mínima para aprobar (${NOTA_MINIMA_APROBAR.toFixed(1)}) en: ` +
            `${materiasTexto}. Recuerda que todavia pueden faltar notas por registrar de este trimestre, ademas del examen ` +
            `final, por lo que este resultado puede cambiar. Se recomienda dar seguimiento con el consejero(a) o el/la ` +
            `docente correspondiente.`;

        const lineas = doc.splitTextToSize(textoAlerta, 170);
        doc.text(lineas, 20, y);
        y += lineas.length * 4.5 + 4;
    }

    doc.setTextColor(0, 0, 0);

    const nombreArchivo = (estudianteActual.nombre || "Boletin").replace(/[,\s]+/g, "_");
    doc.save(`Notas_${nombreArchivo}.pdf`);

    // Marca en las estadísticas que esta consulta terminó en descarga de PDF
    if (idConsultaActual) {
        supabase.rpc("marcar_pdf_descargado", { p_id: idConsultaActual })
            .then(({ error }) => {
                if (error) console.warn("⚠️ No se pudo marcar la descarga del PDF:", error);
            });
    }
});
