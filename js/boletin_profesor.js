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

// Redondeo matemático estándar a 1 decimal (ej. 4.66 -> 4.7, 4.64 -> 4.6),
// no truncamiento. Se usa siempre que se muestra o exporta una nota
// calculada, para que la planilla coincida con la "ley del redondeo".
function redondear1(valor) {
    if (valor === null || valor === undefined || Number.isNaN(valor)) return null;
    return Math.round((valor + Number.EPSILON) * 10) / 10;
}

function formatearNota(valor) {
    const redondeado = redondear1(valor);
    return redondeado === null ? "-" : redondeado.toFixed(1);
}

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
const selectColumnaLeer = document.getElementById("selectColumnaLeer");
const inputPausaSegundos = document.getElementById("inputPausaSegundos");
const inputVelocidadLectura = document.getElementById("inputVelocidadLectura");
const valorVelocidadLectura = document.getElementById("valorVelocidadLectura");
const btnLeer = document.getElementById("btnLeer");
const btnDetenerLectura = document.getElementById("btnDetenerLectura");
const estadoLectura = document.getElementById("estadoLectura");

let misAsignaciones = []; // [{materia, salon}]
let mapaSalones = {};     // codigo -> {nivel, letra, nombre_visible, orden}
let filasPlanillaActual = []; // resultado calculado para la materia/salón actuales
let salonActual = "";
let materiaActual = "";
let nombreDocenteActual = "";
let nombreConsejeroActual = "";

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
// ASISTENCIA (AUSENCIAS Y TARDANZAS) POR TRIMESTRE
// =====================================================
// Reutiliza las tablas ya existentes del módulo de Asistencia
// ("asistencias" + "asistencia_detalle") y las fechas de cada
// trimestre que el admin configura en "configuracion" (t1_inicio,
// t1_fin, t2_inicio, t2_fin, t3_inicio, t3_fin) para contar, por
// estudiante y por trimestre, cuántas veces quedó "ausente" o
// "tardanza" en esta materia/salón. No se le pide nada nuevo al
// docente: se calcula solo, a partir de la asistencia que ya tomó.

let rangosTrimestreCache = null;

async function obtenerRangosTrimestre() {
    if (rangosTrimestreCache) return rangosTrimestreCache;
    const { data } = await supabase
        .from("configuracion")
        .select("t1_inicio, t1_fin, t2_inicio, t2_fin, t3_inicio, t3_fin")
        .eq("id", 1)
        .maybeSingle();

    rangosTrimestreCache = {
        t1: [data?.t1_inicio || null, data?.t1_fin || null],
        t2: [data?.t2_inicio || null, data?.t2_fin || null],
        t3: [data?.t3_inicio || null, data?.t3_fin || null],
    };
    return rangosTrimestreCache;
}

function trimestreDeFecha(fecha, rangos) {
    if (!fecha) return null;
    for (const clave of ["t1", "t2", "t3"]) {
        const [inicio, fin] = rangos[clave];
        if (inicio && fin && fecha >= inicio && fecha <= fin) return clave;
    }
    return null;
}

function asistenciaVacia() {
    return {
        t1: { ausente: 0, tardanza: 0 },
        t2: { ausente: 0, tardanza: 0 },
        t3: { ausente: 0, tardanza: 0 },
    };
}

// Devuelve { estudianteId: { t1:{ausente,tardanza}, t2:{...}, t3:{...} } }
// para todos los estudiantes de este salón, en esta materia.
async function cargarAsistenciaPorEstudiante(salon, materia, idsEstudiantes) {
    const resultado = {};
    idsEstudiantes.forEach((id) => { resultado[id] = asistenciaVacia(); });

    const rangos = await obtenerRangosTrimestre();

    const { data: sesiones, error: errSesiones } = await supabase
        .from("asistencias")
        .select("id, fecha")
        .eq("materia", materia)
        .eq("salon", salon);

    if (errSesiones || !sesiones || sesiones.length === 0) return resultado;

    const trimestrePorSesion = {};
    sesiones.forEach((s) => { trimestrePorSesion[s.id] = trimestreDeFecha(s.fecha, rangos); });

    const { data: detalles, error: errDetalle } = await supabase
        .from("asistencia_detalle")
        .select("asistencia_id, estudiante_id, estado")
        .in("asistencia_id", sesiones.map((s) => s.id));

    if (errDetalle || !detalles) return resultado;

    detalles.forEach((d) => {
        const trimestre = trimestrePorSesion[d.asistencia_id];
        if (!trimestre || !resultado[d.estudiante_id]) return;
        // "fuga" cuenta como ausencia, igual que hacen las alertas
        // de riesgo en el módulo de Asistencia.
        const estado = d.estado === "fuga" ? "ausente" : d.estado;
        if (estado === "ausente") resultado[d.estudiante_id][trimestre].ausente++;
        else if (estado === "tardanza") resultado[d.estudiante_id][trimestre].tardanza++;
    });

    return resultado;
}

// Nombre del/la consejero(a) de este salón, para el encabezado del PDF
// (campo "PROF. CONSEJERO"). Si hay varias filas para el mismo salón,
// se prefiere la que tenga rol "consejero" explícito.
async function obtenerNombreConsejero(salon) {
    const { data } = await supabase
        .from("consejeros")
        .select("nombre, rol")
        .eq("salon", salon);

    if (!data || data.length === 0) return "";
    const preferido = data.find((c) => (c.rol || "").trim().toLowerCase() === "consejero");
    return (preferido || data[0]).nombre || "";
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

    // Misma clave que usa profesor.js para identificar una casilla exacta
    // (tipo + número). Es importante para no contar dos veces una misma
    // casilla si por alguna razón quedó más de una fila en la base de
    // datos para el mismo tipo+número (la última que llegue "gana",
    // igual que hace la tabla de notas real).
    function claveCasilla(tipo, numero) {
        return `${(tipo || "").toLowerCase()}_${numero}`;
    }

    // notasPorEstudiante[estudianteId][trimestre] = { "apreciacion_1": {...}, "ejercicio_2": {...}, ... }
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
            if (n.estudiante_id) return; // ya se registró arriba
            const idEst = correoAId[n.correo];
            if (idEst) registrar(idEst, n);
        });
    }

    function calcularPromedio(valores) {
        if (valores.length === 0) return null;
        return valores.reduce((a, b) => a + b, 0) / valores.length;
    }

    // Igual fórmula que recalcularPromedios() en profesor.js: usa el
    // valor de "nota" agrupado por tipo de casilla, y aplica el MISMO
    // límite (mínimo 1, máximo 5) que usa formatearNotaFinal() en la
    // tabla real de edición. Así, si alguna nota quedó mal escrita en la
    // base de datos (ej. "37" en vez de "3.7"), la planilla muestra
    // exactamente lo mismo que ve el docente en su tabla, en vez de
    // inflarse con el valor crudo sin corregir.
    function limitarNota(valor) {
        if (valor < 1) return 1;
        if (valor > 5) return 5;
        return valor;
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

    const [asistenciaPorEstudiante, nombreConsejero] = await Promise.all([
        cargarAsistenciaPorEstudiante(salon, materia, todosLosIds),
        obtenerNombreConsejero(salon)
    ]);
    nombreConsejeroActual = nombreConsejero;

    filasPlanillaActual = estudiantes.map((e) => {
        const notasEst = notasPorEstudiante[e.id] || {};
        const porTrimestre = TRIMESTRES.map((t) => promedioTrimestre(notasEst[t]));
        const presentes = porTrimestre.filter((v) => v !== null);
        const promFinal = presentes.length ? presentes.reduce((a, b) => a + b, 0) / presentes.length : null;

        const asis = asistenciaPorEstudiante[e.id] || asistenciaVacia();
        const totalAusencias = asis.t1.ausente + asis.t2.ausente + asis.t3.ausente;
        const totalTardanzas = asis.t1.tardanza + asis.t2.tardanza + asis.t3.tardanza;

        return {
            codigo: e.codigo,
            nombre: e.nombre,
            cedula: e.cedula,
            t1: porTrimestre[0],
            t2: porTrimestre[1],
            t3: porTrimestre[2],
            final: promFinal,
            fracaso: promFinal !== null && promFinal < NOTA_MINIMA_APROBAR,
            asistencia: asis,
            totalAusencias,
            totalTardanzas
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
        const texto = formatearNota(valor);
        const fallo = valor !== null && valor < NOTA_MINIMA_APROBAR;
        return `<td${fallo ? ' class="nota-fallo"' : ""}><a class="celda-editar" href="${url}" target="_blank" title="${titulo}">${texto}</a></td>`;
    };

    cuerpoPlanilla.innerHTML = filas.map((f) => {
        const finalTexto = formatearNota(f.final);
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
// LEER NOTAS EN VOZ ALTA (con pausa entre estudiante y estudiante,
// para dar tiempo de escribirlas en otro sistema)
// =====================================================

const hablaDisponible = "speechSynthesis" in window;

let colaLectura = [];
let indiceLectura = 0;
let temporizadorLectura = null;
let lecturaActiva = false;
let lecturaPausada = false;

function limpiarTemporizadorLectura() {
    if (temporizadorLectura) {
        clearTimeout(temporizadorLectura);
        temporizadorLectura = null;
    }
}

function actualizarBotonesLectura() {
    if (!hablaDisponible) {
        btnLeer.disabled = true;
        btnLeer.textContent = "🔊 No disponible en este navegador";
        btnDetenerLectura.disabled = true;
        return;
    }

    if (!lecturaActiva) {
        btnLeer.textContent = "▶️ Iniciar lectura";
        btnDetenerLectura.disabled = true;
    } else if (lecturaPausada) {
        btnLeer.textContent = "▶️ Reanudar";
        btnDetenerLectura.disabled = false;
    } else {
        btnLeer.textContent = "⏸️ Pausar";
        btnDetenerLectura.disabled = false;
    }
}

function construirColaLectura() {
    const columna = selectColumnaLeer.value; // "t1" | "t2" | "t3" | "final"
    const filtro = inputBuscar.value.trim().toLowerCase();
    const filas = filtro
        ? filasPlanillaActual.filter((f) => (f.nombre || "").toLowerCase().includes(filtro))
        : filasPlanillaActual;

    return filas.map((f) => {
        const valor = f[columna];
        const notaHablada = valor === null ? "sin nota registrada" : formatearNota(valor).replace(".", " punto ");
        return {
            nombre: f.nombre || "Estudiante",
            texto: `${f.nombre}. Nota: ${notaHablada}.`
        };
    });
}

function leerSiguiente() {
    if (!lecturaActiva || lecturaPausada) return;

    if (indiceLectura >= colaLectura.length) {
        estadoLectura.textContent = "✅ Lectura terminada.";
        lecturaActiva = false;
        lecturaPausada = false;
        actualizarBotonesLectura();
        return;
    }

    const item = colaLectura[indiceLectura];
    estadoLectura.textContent = `🔊 Leyendo ${indiceLectura + 1} de ${colaLectura.length}: ${item.nombre}`;

    const utterance = new SpeechSynthesisUtterance(item.texto);
    utterance.lang = "es-ES";
    utterance.rate = parseFloat(inputVelocidadLectura?.value) || 0.82; // más rápido o más lento, según el control
    utterance.pitch = 1;

    utterance.onend = () => {
        if (!lecturaActiva || lecturaPausada) return;
        indiceLectura++;
        const segundos = Math.max(3, parseInt(inputPausaSegundos.value, 10) || 15);
        estadoLectura.textContent = `⏳ Esperando ${segundos}s antes de leer a la siguiente persona...`;
        temporizadorLectura = setTimeout(() => {
            if (lecturaActiva && !lecturaPausada) leerSiguiente();
        }, segundos * 1000);
    };

    utterance.onerror = () => {
        if (!lecturaActiva || lecturaPausada) return;
        indiceLectura++;
        leerSiguiente();
    };

    speechSynthesis.speak(utterance);
}

function iniciarLectura() {
    colaLectura = construirColaLectura();
    if (colaLectura.length === 0) {
        alert("No hay notas para leer con el filtro actual.");
        return;
    }

    speechSynthesis.cancel();
    limpiarTemporizadorLectura();
    indiceLectura = 0;
    lecturaActiva = true;
    lecturaPausada = false;
    actualizarBotonesLectura();
    leerSiguiente();
}

function pausarLectura() {
    if (!lecturaActiva || lecturaPausada) return;
    lecturaPausada = true;
    limpiarTemporizadorLectura();
    if (speechSynthesis.speaking) speechSynthesis.pause();
    estadoLectura.textContent += " (pausado)";
    actualizarBotonesLectura();
}

function reanudarLectura() {
    if (!lecturaActiva || !lecturaPausada) return;
    lecturaPausada = false;
    actualizarBotonesLectura();

    if (speechSynthesis.paused || speechSynthesis.speaking) {
        speechSynthesis.resume();
    } else {
        // Estábamos en la pausa de espera entre un estudiante y otro:
        // seguimos desde ahí, sin repetir al mismo estudiante.
        leerSiguiente();
    }
}

function detenerLectura() {
    lecturaActiva = false;
    lecturaPausada = false;
    limpiarTemporizadorLectura();
    speechSynthesis.cancel();
    estadoLectura.textContent = "";
    actualizarBotonesLectura();
}

btnLeer?.addEventListener("click", () => {
    if (!lecturaActiva) {
        iniciarLectura();
    } else if (lecturaPausada) {
        reanudarLectura();
    } else {
        pausarLectura();
    }
});

btnDetenerLectura?.addEventListener("click", detenerLectura);

// Actualiza el número al lado del control de velocidad (ej. "1.20x")
// cada vez que se mueve el deslizador. No hace falta reiniciar la
// lectura: el nuevo valor se usa automáticamente desde la próxima
// persona que toque leer.
inputVelocidadLectura?.addEventListener("input", () => {
    if (valorVelocidadLectura) valorVelocidadLectura.textContent = `${parseFloat(inputVelocidadLectura.value).toFixed(2)}x`;
});

actualizarBotonesLectura();

// =====================================================
// EVENTOS
// =====================================================

selectSalon.addEventListener("change", () => { detenerLectura(); poblarMaterias(); });
selectMateria.addEventListener("change", () => { detenerLectura(); cargarPlanilla(); });
inputBuscar.addEventListener("input", renderPlanilla);

// =====================================================
// PDF — FORMATO OFICIAL "MINISTERIO DE EDUCACIÓN":
// NOTAS TRIMESTRALES, AUSENCIAS Y TARDANZAS
// (misma estructura que la planilla en papel/Excel que ya
// usaba la escuela: N°, Nombre, Trimestres 1-2-3, Notas
// Finales, Ausencias/Tardanzas por trimestre y Totales
// Anuales de Ausencias/Tardanzas).
// =====================================================

function construirPdfPlanilla() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait", format: "letter" });
    const anchoPagina = doc.internal.pageSize.getWidth();
    const anioLectivo = new Date().getFullYear();

    const filtro = inputBuscar.value.trim().toLowerCase();
    const filas = filtro
        ? filasPlanillaActual.filter((f) => (f.nombre || "").toLowerCase().includes(filtro))
        : filasPlanillaActual;

    // ---------- Encabezado institucional ----------
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("MINISTERIO DE EDUCACIÓN", anchoPagina / 2, 14, { align: "center" });
    doc.text("NOTAS TRIMESTRALES, AUSENCIAS Y TARDANZAS", anchoPagina / 2, 20, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`PLANTEL: C.E.B.G. EL JIRAL`, 14, 28);
    doc.text(`ASIGNATURA: ${materiaActual.toUpperCase()}`, anchoPagina / 2 + 10, 28);
    doc.text(
        `AÑO LEC. ${anioLectivo}    GRUPO ${nombreVisibleSalon(salonActual)}    PROF. CONSEJERO: ${nombreConsejeroActual || "____________________"}`,
        14, 34
    );

    // ---------- Encabezados de la tabla (3 niveles) ----------
    const head = [
        [
            { content: "N°", rowSpan: 3 },
            { content: "Nombre de los Alumnos", rowSpan: 3 },
            { content: "Trimestres", colSpan: 3 },
            { content: "Notas\nFinales", rowSpan: 3 },
            { content: "Trimestres", colSpan: 6 },
            { content: "Totales\nAnuales", colSpan: 2, rowSpan: 2 }
        ],
        [
            { content: "1", rowSpan: 2 },
            { content: "2", rowSpan: 2 },
            { content: "3", rowSpan: 2 },
            { content: "1", colSpan: 2 },
            { content: "2", colSpan: 2 },
            { content: "3", colSpan: 2 }
        ],
        ["A", "T", "A", "T", "A", "T", "A", "T"]
    ];

    const cuerpo = filas.map((f, indice) => [
        String(indice + 1),
        (f.nombre || "-").toUpperCase(),
        f.t1 !== null ? formatearNota(f.t1) : "",
        f.t2 !== null ? formatearNota(f.t2) : "",
        f.t3 !== null ? formatearNota(f.t3) : "",
        f.final !== null ? formatearNota(f.final) : "",
        String(f.asistencia.t1.ausente || ""),
        String(f.asistencia.t1.tardanza || ""),
        String(f.asistencia.t2.ausente || ""),
        String(f.asistencia.t2.tardanza || ""),
        String(f.asistencia.t3.ausente || ""),
        String(f.asistencia.t3.tardanza || ""),
        String(f.totalAusencias || ""),
        String(f.totalTardanzas || "")
    ]);

    doc.autoTable({
        head,
        body: cuerpo,
        startY: 39,
        theme: "grid",
        tableWidth: "wrap",
        margin: { left: 10, right: 10 },
        styles: { fontSize: 6.5, halign: "center", valign: "middle", cellPadding: 1.3, lineColor: [30, 58, 138], lineWidth: 0.2 },
        headStyles: { fillColor: [219, 234, 254], textColor: [30, 58, 138], fontStyle: "bold", halign: "center", valign: "middle", fontSize: 6.5 },
        columnStyles: {
            0: { cellWidth: 7 },
            1: { halign: "left", fontStyle: "bold", cellWidth: 42 },
            2: { cellWidth: 10 },
            3: { cellWidth: 10 },
            4: { cellWidth: 10 },
            5: { cellWidth: 12 },
            6: { cellWidth: 8 }, 7: { cellWidth: 8 },
            8: { cellWidth: 8 }, 9: { cellWidth: 8 },
            10: { cellWidth: 8 }, 11: { cellWidth: 8 },
            12: { cellWidth: 9 }, 13: { cellWidth: 9 }
        },
        didParseCell: (data) => {
            if (data.section !== "body") return;
            const fila = filas[data.row.index];
            // Columnas 2,3,4,5 = I,II,III Trimestre y Nota Final: resaltar si reprueba
            if (data.column.index >= 2 && data.column.index <= 5) {
                const valor = [null, null, fila.t1, fila.t2, fila.t3, fila.final][data.column.index];
                if (valor !== null && valor < NOTA_MINIMA_APROBAR) {
                    data.cell.styles.fillColor = [254, 226, 226];
                    data.cell.styles.textColor = [185, 28, 28];
                    data.cell.styles.fontStyle = "bold";
                }
            }
        }
    });

    // ---------- Pie de página con la firma del docente ----------
    const finalY = doc.lastAutoTable.finalY + 18;
    doc.setFontSize(10);
    doc.text("PROFESOR: ________________________________________", anchoPagina / 2, finalY, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.text(nombreDocenteActual || "", anchoPagina / 2, finalY + 6, { align: "center" });

    return doc;
}

btnImprimirPlanilla.addEventListener("click", () => {
    if (filasPlanillaActual.length === 0) { window.print(); return; }
    const doc = construirPdfPlanilla();
    doc.autoPrint();
    window.open(doc.output("bloburl"), "_blank");
});

btnPdfPlanilla.addEventListener("click", () => {
    if (filasPlanillaActual.length === 0) return;
    const doc = construirPdfPlanilla();
    doc.save(`Notas_Trimestrales_${salonActual}_${materiaActual}.pdf`.replace(/\s+/g, "_"));
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
