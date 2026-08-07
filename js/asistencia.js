import { supabase } from "./supabase.js";

// =========================================================
// UTILIDADES
// =========================================================

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// =========================================================
// 1) LEER MATERIA Y SALÓN DESDE LA URL
// =========================================================
// asistencia.js manda aquí con ?materia=...&salon=... al presionar
// "Tomar asistencia" en la tarjeta de la clase correspondiente.

const parametros = new URLSearchParams(window.location.search);
const materiaSeleccionada = (parametros.get("materia") || "").trim();
const salonSeleccionado = (parametros.get("salon") || "").trim();

// =========================================================
// 2) VERIFICAR SESIÓN Y QUE SEA PROFESOR DE ESE SALÓN/MATERIA
// =========================================================
// Misma lógica que en profesor.js/asistencia.js: el acceso se decide
// por tener filas en "profesor_materias".

let correoProfesor = "";
let nombreProfesor = "";

// Caché en memoria de TODAS las filas de profesor_materias de este
// profesor (incluye día/hora). La usa tanto el chequeo de acceso a
// una materia/salón puntual como el dashboard de "Clases de hoy".
let materiasProfesor = [];

// true cuando la URL trae ?materia=...&salon=... (vista de detalle).
const esVistaDetalle = Boolean(materiaSeleccionada && salonSeleccionado);

async function verificarSesion() {
    const { data: { user }, error: errUser } = await supabase.auth.getUser();

    if (errUser || !user) {
        window.location.href = "login.html";
        return false;
    }

    correoProfesor = (user.email || "").trim().toLowerCase();

    const { data: materias, error: errMaterias } = await supabase
        .from("profesor_materias")
        .select("materia, salon, dia, hora")
        .eq("correo_profesor", correoProfesor);

    if (errMaterias) {
        console.error("❌ Error al verificar acceso de docente:", errMaterias);
        alert("Ocurrió un error al verificar tu acceso. Intenta de nuevo.");
        window.location.href = "login.html";
        return false;
    }

    materiasProfesor = materias || [];

    if (materiasProfesor.length === 0) {
        const avisoSinAsignaciones = document.getElementById("avisoSinAsignaciones");
        if (avisoSinAsignaciones) {
            avisoSinAsignaciones.style.display = "block";
        } else {
            alert("⛔ Esta cuenta no tiene materias asignadas como docente. Contacta al administrador.");
        }
        document.getElementById("panelTabla")?.remove();
        document.getElementById("vistaDetalle")?.remove?.();
        return false;
    }

    // La vista de detalle (tomar asistencia de UNA materia/salón) exige
    // que esa combinación exista entre las materias de este profesor
    // (evita que alguien entre a la asistencia de otro salón cambiando la URL).
    if (esVistaDetalle) {
        const tieneAcceso = materiasProfesor.some(
            (a) => a.materia === materiaSeleccionada && a.salon === salonSeleccionado
        );

        if (!tieneAcceso) {
            if (avisoSinAcceso) {
                avisoSinAcceso.textContent = "⛔ No tienes acceso a esta materia/salón, o el enlace es inválido.";
                avisoSinAcceso.style.display = "block";
            } else {
                console.error("❌ Falta el elemento #avisoSinAcceso en el HTML.");
                alert("⛔ No tienes acceso a esta materia/salón, o el enlace es inválido.");
            }
            document.getElementById("panelTabla")?.remove();
            return false;
        }
    }

    const { data: perfilProfesor } = await supabase
        .from("profesores")
        .select("nombre_profesor")
        .eq("correo_profesor", correoProfesor)
        .maybeSingle();
    nombreProfesor = perfilProfesor?.nombre_profesor || correoProfesor;

    return true;
}

// =========================================================
// 3) ELEMENTOS DE LA PÁGINA
// =========================================================

const fechaActual = document.getElementById("fechaActual");
const nombreProfesorTexto = document.getElementById("nombreProfesorTexto");
const materiaTexto = document.getElementById("materiaTexto");
const salonTexto = document.getElementById("salonTexto");
const avisoSinAcceso = document.getElementById("avisoSinAcceso");
const cuerpoTablaEstudiantes = document.getElementById("cuerpoTablaEstudiantes");
const estadoLista = document.getElementById("estadoLista");

function pintarEncabezado() {
    const fechaHoyTexto = new Date().toLocaleDateString("es-PA", {
        year: "numeric",
        month: "long",
        day: "numeric"
    });
    if (fechaActual) fechaActual.textContent = fechaHoyTexto;
    if (nombreProfesorTexto) nombreProfesorTexto.textContent = nombreProfesor;

    if (!fechaActual || !nombreProfesorTexto) {
        console.error("❌ Falta alguno de estos ids en el HTML: fechaActual, nombreProfesorTexto.");
    }

    if (esVistaDetalle) {
        if (materiaTexto) materiaTexto.textContent = materiaSeleccionada;
        if (salonTexto) salonTexto.textContent = salonSeleccionado;
        if (!materiaTexto || !salonTexto) {
            console.error("❌ Falta alguno de estos ids en el HTML: materiaTexto, salonTexto.");
        }
    }
}

// =========================================================
// 3.1) DASHBOARD: "CLASES DE HOY"
// =========================================================
// Se ejecuta solo cuando NO hay ?materia=&salon= en la URL.
//
// Fuente principal: horario_profesor (el horario semanal que el
// profesor arma en mi_horario.html). Si el profesor todavía no tiene
// nada ahí, usamos como respaldo profesor_materias.dia/hora (el
// sistema viejo), para no dejar a nadie sin su dashboard mientras se
// pasan al horario nuevo.

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

function quitarAcentos(texto) {
    return String(texto ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function diaDeHoyNormalizado() {
    return DIAS_SEMANA[new Date().getDay()];
}

function formatearHora(horaTexto) {
    if (!horaTexto) return "";
    // "hora" viene de una columna tipo TIME de Postgres: "07:30:00".
    const [h, m] = horaTexto.split(":");
    const horaNum = Number(h);
    const sufijo = horaNum >= 12 ? "pm" : "am";
    const hora12 = ((horaNum + 11) % 12) + 1;
    return `${hora12}:${m} ${sufijo}`;
}

// Caché en memoria compartida entre "Clases de hoy" y el panel del
// horario semanal completo, para no repetir las mismas consultas.
let franjasCache = null;          // [{id, hora_inicio, hora_fin, orden, es_recreo, etiqueta}]
let horarioProfesorCache = null;  // [{dia, franja_id, texto, tipo, materia, salon}]

async function cargarHorarioProfesorCompleto() {
    if (franjasCache && horarioProfesorCache) {
        return { franjas: franjasCache, bloques: horarioProfesorCache };
    }

    const [{ data: franjas, error: errFranjas }, { data: bloques, error: errBloques }] = await Promise.all([
        supabase.from("franjas_horario").select("id, hora_inicio, hora_fin, orden, es_recreo, etiqueta").order("orden", { ascending: true }),
        supabase.from("horario_profesor").select("dia, franja_id, texto, tipo, materia, salon").eq("correo_profesor", correoProfesor),
    ]);

    if (errFranjas || errBloques) {
        console.error("❌ Error al cargar horario_profesor/franjas_horario:", errFranjas || errBloques);
        return { franjas: [], bloques: [], error: errFranjas || errBloques };
    }

    franjasCache = franjas || [];
    horarioProfesorCache = bloques || [];
    return { franjas: franjasCache, bloques: horarioProfesorCache };
}

async function cargarClasesDeHoy() {
    const listaClasesHoy = document.getElementById("listaClasesHoy");
    const avisoSinHorarioHoy = document.getElementById("avisoSinHorarioHoy");
    const estadoCargaAsistencia = document.getElementById("estadoCargaAsistencia");
    if (!listaClasesHoy) return;

    const hoy = diaDeHoyNormalizado();
    const { franjas, bloques } = await cargarHorarioProfesorCompleto();

    let clasesHoy = [];

    if (bloques.length > 0) {
        // --- Fuente nueva: horario_profesor ---
        const franjasPorId = {};
        franjas.forEach((f) => { franjasPorId[f.id] = f; });

        clasesHoy = bloques
            .filter((b) => b.dia === hoy && b.tipo === "clase" && b.materia && b.salon)
            .map((b) => ({ materia: b.materia, salon: b.salon, hora: franjasPorId[b.franja_id]?.hora_inicio || "", orden: franjasPorId[b.franja_id]?.orden ?? 99 }))
            .sort((a, b) => a.orden - b.orden);
    } else {
        // --- Respaldo: profesor_materias (sistema viejo) ---
        clasesHoy = materiasProfesor
            .filter((m) => quitarAcentos((m.dia || "").trim().toLowerCase()) === hoy)
            .sort((a, b) => (a.hora || "").localeCompare(b.hora || ""));
    }

    if (clasesHoy.length === 0) {
        if (avisoSinHorarioHoy) avisoSinHorarioHoy.style.display = "block";
        if (estadoCargaAsistencia) estadoCargaAsistencia.textContent = "";
        asegurarPanelHorarioSemanal();
        return;
    }

    listaClasesHoy.innerHTML = clasesHoy.map((clase) => {
        const url = `asistencia.html?materia=${encodeURIComponent(clase.materia)}&salon=${encodeURIComponent(clase.salon)}`;
        return `
        <div class="tarjeta-clase">
            ${clase.hora ? `<div class="hora-clase">🕐 ${escapeHtml(formatearHora(clase.hora))}</div>` : ""}
            <div class="materia-clase">${escapeHtml(clase.materia)}</div>
            <div class="salon-clase">Salón: ${escapeHtml(clase.salon)}</div>
            <a href="${url}"><button type="button" class="btn-tomar-asistencia">✅ Tomar asistencia</button></a>
        </div>
        `;
    }).join("");

    if (estadoCargaAsistencia) estadoCargaAsistencia.textContent = `${clasesHoy.length} clase(s) hoy.`;

    asegurarPanelHorarioSemanal();
}

// =========================================================
// 3.2) HORARIO SEMANAL COMPLETO (solo lectura)
// =========================================================
// Se muestra debajo de "Clases de hoy". Combina lo que ya está en
// profesor_materias (vía horario_profesor, importado desde
// mi_horario.html) con los bloques libres del profesor (ej.
// Consejería). Es de solo lectura acá; para editar, el profesor va a
// mi_horario.html.

const DIAS_ORDEN_HORARIO = ["lunes", "martes", "miercoles", "jueves", "viernes"];
const NOMBRES_DIA_HORARIO = { lunes: "Lunes", martes: "Martes", miercoles: "Miércoles", jueves: "Jueves", viernes: "Viernes" };

let horarioSemanalPintado = false;

function inyectarEstilosHorarioSemanal() {
    if (document.getElementById("estilosHorarioSemanal")) return;
    const estilo = document.createElement("style");
    estilo.id = "estilosHorarioSemanal";
    estilo.textContent = `
        #panelHorarioSemanal { margin-top: 18px; }
        #panelHorarioSemanal table { width: 100%; border-collapse: collapse; min-width: 640px; }
        #panelHorarioSemanal th {
            background: #5a4fcf; color: #fff; padding: 8px 6px; font-size: .8rem; text-align: center;
        }
        #panelHorarioSemanal td {
            border: 1px solid #eee; padding: 5px; vertical-align: middle; text-align: center;
            font-size: .78rem; min-width: 100px; height: 46px;
        }
        #panelHorarioSemanal td.col-hora-hs { background: #f3f4fb; color: #444; font-weight: 600; white-space: nowrap; }
        #panelHorarioSemanal tr.fila-recreo-hs td { background: #f5a623; color: #fff; font-weight: 700; }
        #panelHorarioSemanal .bloque-hs { border-radius: 6px; padding: 4px; display: block; }
        #panelHorarioSemanal .bloque-hs.tipo-clase-hs { background: #e8ecfb; color: #2f3ea3; }
        #panelHorarioSemanal .bloque-hs.tipo-otro-hs { background: #fdeee0; color: #c0530a; }
        #panelHorarioSemanal .contenedor-tabla-hs { overflow-x: auto; }
    `;
    document.head.appendChild(estilo);
}

function asegurarPanelHorarioSemanal() {
    if (document.getElementById("panelHorarioSemanal")) return;

    inyectarEstilosHorarioSemanal();

    const contenedor = document.getElementById("listaClasesHoy")?.parentElement || document.body;

    const envoltorio = document.createElement("div");
    envoltorio.id = "panelHorarioSemanal";
    envoltorio.innerHTML = `
        <div style="text-align:center; margin: 14px 0 8px;">
            <button type="button" id="btnToggleHorarioSemanal" class="btn-tomar-asistencia">📅 Ver horario completo de la semana</button>
        </div>
        <div id="contenidoHorarioSemanal" style="display:none;">
            <div class="contenedor-tabla-hs">
                <p class="text-center">Cargando tu horario...</p>
            </div>
            <p class="small text-center" style="margin-top:6px;">
                ¿Falta algo o está mal? Corrígelo en <a href="mi_horario.html">Mi horario</a>.
            </p>
        </div>
    `;
    contenedor.appendChild(envoltorio);

    const btnToggle = document.getElementById("btnToggleHorarioSemanal");
    const contenido = document.getElementById("contenidoHorarioSemanal");

    btnToggle.addEventListener("click", async () => {
        const mostrando = contenido.style.display !== "none";
        if (mostrando) {
            contenido.style.display = "none";
            btnToggle.textContent = "📅 Ver horario completo de la semana";
            return;
        }

        contenido.style.display = "block";
        btnToggle.textContent = "🔼 Ocultar horario de la semana";

        if (!horarioSemanalPintado) {
            await cargarYPintarHorarioSemanal();
            horarioSemanalPintado = true;
        }
    });
}

async function cargarYPintarHorarioSemanal() {
    const contenedorTabla = document.querySelector("#panelHorarioSemanal .contenedor-tabla-hs");
    if (!contenedorTabla) return;

    const { franjas, bloques, error } = await cargarHorarioProfesorCompleto();

    if (error) {
        contenedorTabla.innerHTML = `<p class="text-danger text-center">Error al cargar tu horario: ${escapeHtml(error.message)}</p>`;
        return;
    }

    if (!franjas || franjas.length === 0) {
        contenedorTabla.innerHTML = `<p class="text-muted text-center">Todavía no hay franjas horarias configuradas.</p>`;
        return;
    }

    const mapaBloques = {};
    (bloques || []).forEach((b) => { mapaBloques[`${b.dia}-${b.franja_id}`] = b; });

    if (!bloques || bloques.length === 0) {
        contenedorTabla.innerHTML = `
            <p class="text-muted text-center">
                Todavía no tienes tu horario cargado.
                <a href="mi_horario.html">Ve a "Mi horario" para armarlo</a> (puedes importar tus materias con un clic).
            </p>`;
        return;
    }

    const filasHtml = franjas.map((franja) => {
        const horaTexto = `${formatearHora(franja.hora_inicio)} – ${formatearHora(franja.hora_fin)}`;

        if (franja.es_recreo) {
            return `<tr class="fila-recreo-hs"><td colspan="6">🍎 ${escapeHtml(franja.etiqueta || "RECREO")} 🍎</td></tr>`;
        }

        const celdas = DIAS_ORDEN_HORARIO.map((dia) => {
            const b = mapaBloques[`${dia}-${franja.id}`];
            if (!b) return `<td>—</td>`;
            const claseTipo = b.tipo === "otro" ? "tipo-otro-hs" : "tipo-clase-hs";
            return `<td><span class="bloque-hs ${claseTipo}">${escapeHtml(b.texto)}</span></td>`;
        }).join("");

        return `<tr><td class="col-hora-hs">${horaTexto}</td>${celdas}</tr>`;
    }).join("");

    contenedorTabla.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Hora</th>
                    ${DIAS_ORDEN_HORARIO.map((d) => `<th>${NOMBRES_DIA_HORARIO[d]}</th>`).join("")}
                </tr>
            </thead>
            <tbody>${filasHtml}</tbody>
        </table>
    `;
}

// =========================================================
// 4) CARGAR ESTUDIANTES DEL SALÓN
// =========================================================
// EXACTAMENTE la misma consulta que usa profesor.js para traer el
// listado de estudiantes de un salón (misma tabla, mismas columnas,
// mismo eq y mismo order):
//
//   supabase.from("estudiantes")
//       .select("id, codigo, nombre, correo, es_prueba")
//       .eq("salon", salon)
//       .order("nombre", { ascending: true });

// Caché en memoria del listado de estudiantes ya cargado. Lo usan las
// alertas de ausencias/tardanzas y el export a PDF/Excel.
let estudiantesCache = [];

async function cargarEstudiantes() {
    if (estadoLista) estadoLista.textContent = "Cargando...";

    const { data: estudiantesSalon, error: errEst } = await supabase
        .from("estudiantes")
        .select("id, codigo, nombre, correo, es_prueba")
        .eq("salon", salonSeleccionado)
        .order("nombre", { ascending: true });

    if (errEst) {
        cuerpoTablaEstudiantes.innerHTML = `<tr><td colspan="4" style="color:#dc3545;">Error al cargar estudiantes: ${escapeHtml(errEst.message)}</td></tr>`;
        if (estadoLista) estadoLista.textContent = "";
        return;
    }

    if (!estudiantesSalon || estudiantesSalon.length === 0) {
        cuerpoTablaEstudiantes.innerHTML = `<tr><td colspan="4">No hay estudiantes registrados en este salón.</td></tr>`;
        if (estadoLista) estadoLista.textContent = "";
        return;
    }

    estudiantesCache = estudiantesSalon;

    const colspanDetalle = 3 + columnasDinamicas.length;

    cuerpoTablaEstudiantes.innerHTML = estudiantesSalon.map((est, i) => {
        const idDetalle = `detalle-${est.id}`;
        const celdasExtra = columnasDinamicas.map((col) => `
            <td>
                <input type="text" class="input-columna-extra" data-columna-id="${col.id}" data-estudiante-id="${est.id}">
            </td>
        `).join("");
        return `
        <tr>
            <td>${i + 1}</td>
            <td class="col-nombre">${escapeHtml(est.nombre)}</td>
            <td>
                <button type="button" class="btn-estado estado-presente" data-estado="presente" data-detalle="${idDetalle}">🟢 Presente</button>
            </td>
            ${celdasExtra}
        </tr>
        <tr class="fila-detalle" id="${idDetalle}">
            <td colspan="${colspanDetalle}">
                <div class="panel-detalle">
                    <div>
                        <label>Observación</label>
                        <input type="text" class="input-observacion" placeholder="Ej: llegó 15 min tarde">
                    </div>
                    <div>
                        <label>Justificación</label>
                        <textarea class="input-justificacion" rows="2" placeholder="Motivo de la ausencia/tardanza/permiso"></textarea>
                    </div>
                    <div>
                        <label>Adjuntar archivo</label>
                        <input type="file" class="input-adjunto">
                    </div>
                </div>
            </td>
        </tr>
    `;
    }).join("");

    activarBotonesEstado();
    pintarEncabezadosColumnasDinamicas();
    await precargarValoresGuardadosHoy();
    if (estadoLista) estadoLista.textContent = `${estudiantesSalon.length} estudiante(s) cargado(s).`;

    // No bloquea el pintado de la tabla: las alertas se calculan aparte.
    detectarAlertas();
}

// =========================================================
// 5) BOTÓN DE ESTADO: UN TOQUE/CLIC = SIGUIENTE ESTADO
// =========================================================
// Ciclo fijo: Presente -> Ausente -> Tardanza -> Permiso -> Presente -> ...
// "click" funciona igual con mouse y con pantalla táctil (un tap
// dispara "click"), así que no hace falta manejar touch por separado.
// No usa <select> ni abre ningún popup/confirm.
//
// Nota importante para el guardado: btn.dataset.estado SIEMPRE refleja
// el estado que está VISIBLE en ese momento (no el siguiente), porque
// se actualiza justo después de pintar el texto/clase nuevos. Por eso
// guardarAsistencia() puede leerlo directamente.

const CICLO_ESTADOS = {
    presente: { siguiente: "ausente", clase: "estado-ausente", texto: "🔴 Ausente" },
    ausente: { siguiente: "tardanza", clase: "estado-tardanza", texto: "🟡 Tardanza" },
    tardanza: { siguiente: "permiso", clase: "estado-permiso", texto: "🔵 Permiso" },
    permiso: { siguiente: "presente", clase: "estado-presente", texto: "🟢 Presente" },
};

// Igual que CICLO_ESTADOS pero para "pintar" un estado directamente
// (usado al copiar el día anterior o precargar lo ya guardado hoy),
// sin pasar por el ciclo de un clic.
const ESTADOS_INFO = {
    presente: { clase: "estado-presente", texto: "🟢 Presente" },
    ausente: { clase: "estado-ausente", texto: "🔴 Ausente" },
    tardanza: { clase: "estado-tardanza", texto: "🟡 Tardanza" },
    permiso: { clase: "estado-permiso", texto: "🔵 Permiso" },
};

function activarBotonesEstado() {
    cuerpoTablaEstudiantes.querySelectorAll(".btn-estado").forEach((btn) => {
        btn.addEventListener("click", () => {
            const actual = btn.dataset.estado;
            const paso = CICLO_ESTADOS[actual];
            if (!paso) return;

            btn.classList.remove("estado-presente", "estado-ausente", "estado-tardanza", "estado-permiso");
            btn.classList.add(paso.clase);
            btn.textContent = paso.texto;
            btn.dataset.estado = paso.siguiente;

            const filaDetalle = document.getElementById(btn.dataset.detalle);
            if (filaDetalle) {
                filaDetalle.classList.toggle("mostrar", paso.siguiente !== "presente");
            }
        });
    });
}

// =========================================================
// 6) GUARDAR ASISTENCIA (cabecera + detalle + adjuntos)
// =========================================================
// Requiere las tablas "asistencias" y "asistencia_detalle"
// (ver 01_crear_tablas_asistencia.sql).
//
// Usa upsert en ambas tablas: si el profesor ya tomó asistencia de esta
// materia/salón HOY y vuelve a guardar, se ACTUALIZA en vez de duplicar.

const BUCKET_ADJUNTOS = "asistencia-adjuntos"; // ⚠️ crear este bucket en Supabase Storage

function obtenerFechaHoyISO() {
    const hoy = new Date();
    const y = hoy.getFullYear();
    const m = String(hoy.getMonth() + 1).padStart(2, "0");
    const d = String(hoy.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

// Sube el adjunto (si el profesor eligió uno) y devuelve su URL pública.
// Si no hay archivo nuevo, devuelve null (no se toca lo que hubiera antes).
async function subirAdjuntoSiHay(inputArchivo, estudianteId) {
    const archivo = inputArchivo?.files?.[0];
    if (!archivo) return null;

    const rutaArchivo = `${salonSeleccionado}/${obtenerFechaHoyISO()}/${estudianteId}-${Date.now()}-${archivo.name}`;

    const { error: errSubida } = await supabase
        .storage
        .from(BUCKET_ADJUNTOS)
        .upload(rutaArchivo, archivo, { upsert: true });

    if (errSubida) {
        console.error("❌ Error al subir adjunto:", errSubida);
        return null;
    }

    const { data: urlPublica } = supabase
        .storage
        .from(BUCKET_ADJUNTOS)
        .getPublicUrl(rutaArchivo);

    return urlPublica?.publicUrl || null;
}

async function guardarAsistencia() {
    const btnGuardar = document.getElementById("btnGuardarAsistencia");
    const estadoGuardado = document.getElementById("estadoGuardado");

    if (btnGuardar) {
        btnGuardar.disabled = true;
        btnGuardar.textContent = "Guardando...";
    }
    if (estadoGuardado) estadoGuardado.textContent = "Guardando asistencia...";

    try {
        const inputNotas = document.getElementById("notasProfesor");

        // 1) Cabecera: 1 fila por materia+salon+fecha.
        const { data: cabecera, error: errCabecera } = await supabase
            .from("asistencias")
            .upsert(
                {
                    correo_profesor: correoProfesor,
                    materia: materiaSeleccionada,
                    salon: salonSeleccionado,
                    fecha: obtenerFechaHoyISO(),
                    notas_profesor: inputNotas?.value?.trim() || null,
                },
                { onConflict: "materia,salon,fecha" }
            )
            .select("id")
            .single();

        if (errCabecera) throw errCabecera;

        const asistenciaId = cabecera.id;

        // 2) Detalle: recorrer cada fila de estudiante ya pintada en la tabla.
        const botonesEstado = cuerpoTablaEstudiantes.querySelectorAll(".btn-estado");
        const detalles = [];

        for (const btn of botonesEstado) {
            const idDetalle = btn.dataset.detalle; // "detalle-<uuid>"
            const estudianteId = idDetalle.replace("detalle-", "");
            const filaDetalle = document.getElementById(idDetalle);

            const inputObservacion = filaDetalle?.querySelector(".input-observacion");
            const inputJustificacion = filaDetalle?.querySelector(".input-justificacion");
            const inputAdjunto = filaDetalle?.querySelector(".input-adjunto");

            const adjuntoUrl = await subirAdjuntoSiHay(inputAdjunto, estudianteId);

            // Valores de las columnas dinámicas para este estudiante.
            const valoresExtra = {};
            cuerpoTablaEstudiantes
                .querySelectorAll(`.input-columna-extra[data-estudiante-id="${estudianteId}"]`)
                .forEach((inputExtra) => {
                    valoresExtra[inputExtra.dataset.columnaId] = inputExtra.value?.trim() || "";
                });

            const fila = {
                asistencia_id: asistenciaId,
                estudiante_id: estudianteId,
                estado: btn.dataset.estado,
                observacion: inputObservacion?.value?.trim() || null,
                justificacion: inputJustificacion?.value?.trim() || null,
                valores_extra: valoresExtra,
            };
            // Solo se envía adjunto_url si hay uno nuevo, para no borrar
            // uno que ya existiera de un guardado anterior.
            if (adjuntoUrl) fila.adjunto_url = adjuntoUrl;

            detalles.push(fila);
        }

        const { error: errDetalle } = await supabase
            .from("asistencia_detalle")
            .upsert(detalles, { onConflict: "asistencia_id,estudiante_id" });

        if (errDetalle) throw errDetalle;

        if (estadoGuardado) {
            estadoGuardado.textContent = `✅ Asistencia guardada (${detalles.length} estudiante(s)).`;
        }

        // Las ausencias/tardanzas de hoy recién se guardaron: recalcular alertas.
        detectarAlertas();
    } catch (error) {
        console.error("❌ Error al guardar asistencia:", error);
        if (estadoGuardado) estadoGuardado.textContent = "❌ Error al guardar. Intenta de nuevo.";
        alert("Ocurrió un error al guardar la asistencia. Intenta de nuevo.");
    } finally {
        if (btnGuardar) {
            btnGuardar.disabled = false;
            btnGuardar.textContent = "💾 Guardar asistencia";
        }
    }
}

// =========================================================
// 7) NOTAS DEL PROFESOR
// =========================================================
// Una nota general de texto libre por materia+salon+fecha, guardada
// junto con la cabecera en "asistencias.notas_profesor".
// Requiere la columna agregada en 02_funciones_adicionales.sql.

function asegurarControlesNotas() {
    if (document.getElementById("notasProfesor")) return;

    const contenedor = document.getElementById("panelTabla") || document.body;

    const envoltorio = document.createElement("div");
    envoltorio.style.marginTop = "16px";
    envoltorio.innerHTML = `
        <label for="notasProfesor" style="display:block; font-weight:600; margin-bottom:4px;">
            📝 Notas del profesor (para esta clase de hoy)
        </label>
        <textarea id="notasProfesor" rows="3" style="width:100%;"
            placeholder="Ej: repasar tarea la próxima clase, avisar a coordinación sobre..."></textarea>
    `;
    contenedor.appendChild(envoltorio);
}

// =========================================================
// 8) COPIAR ASISTENCIA DEL DÍA ANTERIOR
// =========================================================
// Busca la última clase guardada de esta materia/salón ANTES de hoy y
// copia sus estados/observaciones/justificaciones/columnas dinámicas
// a la tabla actual. No guarda nada todavía: el profesor revisa y
// corrige antes de presionar "Guardar asistencia".

async function copiarAsistenciaDiaAnterior() {
    const estadoCopiado = document.getElementById("estadoCopiado");
    if (estadoCopiado) estadoCopiado.textContent = "Buscando la clase anterior...";

    try {
        const { data: cabeceraAnterior, error: errCabecera } = await supabase
            .from("asistencias")
            .select("id, fecha")
            .eq("materia", materiaSeleccionada)
            .eq("salon", salonSeleccionado)
            .lt("fecha", obtenerFechaHoyISO())
            .order("fecha", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (errCabecera) throw errCabecera;

        if (!cabeceraAnterior) {
            if (estadoCopiado) estadoCopiado.textContent = "No hay ninguna clase anterior guardada para copiar.";
            return;
        }

        const { data: detalleAnterior, error: errDetalle } = await supabase
            .from("asistencia_detalle")
            .select("estudiante_id, estado, observacion, justificacion, valores_extra")
            .eq("asistencia_id", cabeceraAnterior.id);

        if (errDetalle) throw errDetalle;

        (detalleAnterior || []).forEach((fila) => {
            const idDetalle = `detalle-${fila.estudiante_id}`;
            const btn = cuerpoTablaEstudiantes.querySelector(`.btn-estado[data-detalle="${idDetalle}"]`);
            const filaDetalle = document.getElementById(idDetalle);
            if (!btn || !fila.estado || !ESTADOS_INFO[fila.estado]) return;

            const info = ESTADOS_INFO[fila.estado];
            btn.classList.remove("estado-presente", "estado-ausente", "estado-tardanza", "estado-permiso");
            btn.classList.add(info.clase);
            btn.textContent = info.texto;
            btn.dataset.estado = fila.estado;

            if (filaDetalle) {
                filaDetalle.classList.toggle("mostrar", fila.estado !== "presente");
                const inputObservacion = filaDetalle.querySelector(".input-observacion");
                const inputJustificacion = filaDetalle.querySelector(".input-justificacion");
                if (inputObservacion) inputObservacion.value = fila.observacion || "";
                if (inputJustificacion) inputJustificacion.value = fila.justificacion || "";
            }

            if (fila.valores_extra && typeof fila.valores_extra === "object") {
                Object.entries(fila.valores_extra).forEach(([columnaId, valor]) => {
                    const inputExtra = cuerpoTablaEstudiantes.querySelector(
                        `.input-columna-extra[data-columna-id="${columnaId}"][data-estudiante-id="${fila.estudiante_id}"]`
                    );
                    if (inputExtra) inputExtra.value = valor ?? "";
                });
            }
        });

        if (estadoCopiado) {
            estadoCopiado.textContent = `✅ Copiado desde la clase del ${cabeceraAnterior.fecha}. Revisa y presiona "Guardar asistencia".`;
        }
    } catch (error) {
        console.error("❌ Error al copiar asistencia anterior:", error);
        if (estadoCopiado) estadoCopiado.textContent = "❌ No se pudo copiar la clase anterior.";
        alert("Ocurrió un error al copiar la asistencia del día anterior.");
    }
}

function asegurarBotonCopiar() {
    if (document.getElementById("btnCopiarAyer")) return;

    const contenedor = document.getElementById("panelTabla") || document.body;

    const envoltorio = document.createElement("div");
    envoltorio.style.margin = "16px 0";
    envoltorio.innerHTML = `
        <button type="button" id="btnCopiarAyer" class="btn-tomar-asistencia">
            📋 Copiar asistencia del día anterior
        </button>
        <span id="estadoCopiado" style="margin-left:10px;"></span>
    `;
    contenedor.appendChild(envoltorio);

    document.getElementById("btnCopiarAyer").addEventListener("click", copiarAsistenciaDiaAnterior);
}

// =========================================================
// 9) ALERTAS: MÁS DE 5 AUSENCIAS / MÁS DE 3 TARDANZAS
// =========================================================
// Cuenta, para TODO el historial de esta materia/salón, cuántas veces
// cada estudiante quedó "ausente" o "tardanza" y muestra un aviso con
// los que superan el límite. Los límites se pueden ajustar aquí abajo.

const LIMITE_AUSENCIAS = 5;
const LIMITE_TARDANZAS = 3;

async function detectarAlertas() {
    const contenedorAlertas = document.getElementById("alertasAsistencia");
    if (!contenedorAlertas) return;

    contenedorAlertas.innerHTML = "";
    contenedorAlertas.style.display = "none";

    // Se apoya en la relación asistencia_detalle.asistencia_id -> asistencias.id
    // (definida en 01_crear_tablas_asistencia.sql) para filtrar por
    // materia/salon sin tener que consultar todas las cabeceras aparte.
    const { data: historico, error } = await supabase
        .from("asistencia_detalle")
        .select("estudiante_id, estado, asistencias!inner(materia, salon)")
        .eq("asistencias.materia", materiaSeleccionada)
        .eq("asistencias.salon", salonSeleccionado);

    if (error) {
        console.error("❌ Error al calcular alertas de asistencia:", error);
        return;
    }

    const conteos = {}; // estudiante_id -> { ausente: n, tardanza: n }
    (historico || []).forEach((fila) => {
        if (fila.estado !== "ausente" && fila.estado !== "tardanza") return;
        if (!conteos[fila.estudiante_id]) conteos[fila.estudiante_id] = { ausente: 0, tardanza: 0 };
        conteos[fila.estudiante_id][fila.estado] += 1;
    });

    const nombrePorId = Object.fromEntries(estudiantesCache.map((e) => [e.id, e.nombre]));

    const alertas = [];
    Object.entries(conteos).forEach(([estudianteId, c]) => {
        const nombre = nombrePorId[estudianteId] || estudianteId;
        if (c.ausente > LIMITE_AUSENCIAS) {
            alertas.push(`🔴 ${escapeHtml(nombre)}: ${c.ausente} ausencias`);
        }
        if (c.tardanza > LIMITE_TARDANZAS) {
            alertas.push(`🟡 ${escapeHtml(nombre)}: ${c.tardanza} tardanzas`);
        }
    });

    if (alertas.length === 0) return;

    contenedorAlertas.style.display = "block";
    contenedorAlertas.innerHTML = `
        <strong>⚠️ Estudiantes que requieren atención:</strong>
        <ul style="margin:8px 0 0 20px;">
            ${alertas.map((a) => `<li>${a}</li>`).join("")}
        </ul>
    `;
}

function asegurarContenedorAlertas() {
    if (document.getElementById("alertasAsistencia")) return;

    const contenedor = document.getElementById("panelTabla") || document.body;

    const caja = document.createElement("div");
    caja.id = "alertasAsistencia";
    caja.style.cssText = "display:none; margin:16px 0; padding:12px; border:1px solid #ffc107; background:#fff8e1; border-radius:6px;";
    contenedor.insertBefore(caja, contenedor.firstChild);
}

// =========================================================
// 10) COLUMNAS DINÁMICAS
// =========================================================
// El profesor puede agregar/quitar columnas propias (ej. "Uniforme",
// "Trajo materiales"). Se guardan en "asistencia_columnas" (definición)
// y sus valores por estudiante/día van dentro de
// "asistencia_detalle.valores_extra" (jsonb). Ver 02_funciones_adicionales.sql.

let columnasDinamicas = []; // [{ id, nombre }]

async function cargarColumnasDinamicas() {
    const { data, error } = await supabase
        .from("asistencia_columnas")
        .select("id, nombre")
        .eq("materia", materiaSeleccionada)
        .eq("salon", salonSeleccionado)
        .order("creado_en", { ascending: true });

    if (error) {
        console.error("❌ Error al cargar columnas dinámicas:", error);
        columnasDinamicas = [];
        return;
    }

    columnasDinamicas = data || [];
}

// Agrega/actualiza los <th> de las columnas dinámicas en el <thead> de
// la misma tabla donde vive cuerpoTablaEstudiantes, y les pone un
// botón "✕" para eliminarlas.
function pintarEncabezadosColumnasDinamicas() {
    const tabla = cuerpoTablaEstudiantes.closest("table");
    const filaEncabezado = tabla?.querySelector("thead tr");
    if (!filaEncabezado) {
        console.warn("⚠️ No se encontró <thead><tr> en la tabla; no se pueden pintar las columnas dinámicas.");
        return;
    }

    filaEncabezado.querySelectorAll(".th-columna-extra").forEach((th) => th.remove());

    columnasDinamicas.forEach((col) => {
        const th = document.createElement("th");
        th.className = "th-columna-extra";
        th.innerHTML = `
            ${escapeHtml(col.nombre)}
            <button type="button" class="btn-eliminar-columna" data-columna-id="${col.id}" title="Eliminar columna" style="margin-left:6px;">✕</button>
        `;
        filaEncabezado.appendChild(th);
    });

    filaEncabezado.querySelectorAll(".btn-eliminar-columna").forEach((btn) => {
        btn.addEventListener("click", () => eliminarColumnaDinamica(btn.dataset.columnaId));
    });
}

async function agregarColumnaDinamica() {
    const nombre = (prompt("Nombre de la nueva columna (ej: Uniforme, Tarea, Participación):") || "").trim();
    if (!nombre) return;

    const { error } = await supabase
        .from("asistencia_columnas")
        .insert({ materia: materiaSeleccionada, salon: salonSeleccionado, nombre });

    if (error) {
        console.error("❌ Error al agregar columna dinámica:", error);
        alert("No se pudo agregar la columna (¿ya existe una con ese nombre?).");
        return;
    }

    await cargarColumnasDinamicas();
    await cargarEstudiantes(); // repinta la tabla completa con la nueva columna
}

async function eliminarColumnaDinamica(columnaId) {
    if (!confirm("¿Eliminar esta columna? Se perderán los valores guardados en ella.")) return;

    const { error } = await supabase
        .from("asistencia_columnas")
        .delete()
        .eq("id", columnaId);

    if (error) {
        console.error("❌ Error al eliminar columna dinámica:", error);
        alert("No se pudo eliminar la columna.");
        return;
    }

    await cargarColumnasDinamicas();
    await cargarEstudiantes();
}

function asegurarBotonAgregarColumna() {
    if (document.getElementById("btnAgregarColumna")) return;

    const contenedor = document.getElementById("panelTabla") || document.body;

    const envoltorio = document.createElement("div");
    envoltorio.style.margin = "16px 0";
    envoltorio.innerHTML = `
        <button type="button" id="btnAgregarColumna" class="btn-tomar-asistencia">
            ➕ Agregar columna
        </button>
    `;
    contenedor.appendChild(envoltorio);

    document.getElementById("btnAgregarColumna").addEventListener("click", agregarColumnaDinamica);
}

// =========================================================
// 11) EXPORTAR A PDF Y EXCEL
// =========================================================
// Exporta lo que está actualmente pintado en la tabla (estados,
// observación/justificación, columnas dinámicas). Las librerías se
// cargan bajo demanda desde CDN, así no hace falta instalarlas.

function recolectarFilasParaExportar() {
    const botonesEstado = cuerpoTablaEstudiantes.querySelectorAll(".btn-estado");
    const encabezadosExtra = columnasDinamicas.map((c) => c.nombre);

    const filas = [];
    botonesEstado.forEach((btn) => {
        const idDetalle = btn.dataset.detalle;
        const estudianteId = idDetalle.replace("detalle-", "");
        const estudiante = estudiantesCache.find((e) => e.id === estudianteId);
        const filaDetalle = document.getElementById(idDetalle);

        const observacion = filaDetalle?.querySelector(".input-observacion")?.value?.trim() || "";
        const justificacion = filaDetalle?.querySelector(".input-justificacion")?.value?.trim() || "";

        const valoresExtra = columnasDinamicas.map((col) => {
            const inputExtra = cuerpoTablaEstudiantes.querySelector(
                `.input-columna-extra[data-columna-id="${col.id}"][data-estudiante-id="${estudianteId}"]`
            );
            return inputExtra?.value?.trim() || "";
        });

        filas.push([
            estudiante?.nombre || estudianteId,
            btn.dataset.estado,
            observacion,
            justificacion,
            ...valoresExtra,
        ]);
    });

    const encabezados = ["Estudiante", "Estado", "Observación", "Justificación", ...encabezadosExtra];
    return { encabezados, filas };
}

async function exportarPDF() {
    try {
        const { jsPDF } = await import("https://esm.sh/jspdf@2.5.1");
        await import("https://esm.sh/jspdf-autotable@3.8.2");

        const { encabezados, filas } = recolectarFilasParaExportar();
        const doc = new jsPDF();

        doc.setFontSize(14);
        doc.text(`Asistencia — ${materiaSeleccionada} / ${salonSeleccionado}`, 14, 15);
        doc.setFontSize(10);
        doc.text(`Fecha: ${obtenerFechaHoyISO()}   Profesor: ${nombreProfesor}`, 14, 22);

        doc.autoTable({
            head: [encabezados],
            body: filas,
            startY: 28,
            styles: { fontSize: 8 },
        });

        doc.save(`asistencia_${materiaSeleccionada}_${salonSeleccionado}_${obtenerFechaHoyISO()}.pdf`);
    } catch (error) {
        console.error("❌ Error al exportar PDF:", error);
        alert("No se pudo generar el PDF. Revisa tu conexión e intenta de nuevo.");
    }
}

async function exportarExcel() {
    try {
        const XLSX = await import("https://esm.sh/xlsx@0.18.5");

        const { encabezados, filas } = recolectarFilasParaExportar();
        const hoja = XLSX.utils.aoa_to_sheet([encabezados, ...filas]);
        const libro = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(libro, hoja, "Asistencia");

        XLSX.writeFile(libro, `asistencia_${materiaSeleccionada}_${salonSeleccionado}_${obtenerFechaHoyISO()}.xlsx`);
    } catch (error) {
        console.error("❌ Error al exportar Excel:", error);
        alert("No se pudo generar el Excel. Revisa tu conexión e intenta de nuevo.");
    }
}

function asegurarBotonesExportar() {
    if (document.getElementById("btnExportarPDF")) return;

    const contenedor = document.getElementById("panelTabla") || document.body;

    const envoltorio = document.createElement("div");
    envoltorio.style.margin = "16px 0";
    envoltorio.innerHTML = `
        <button type="button" id="btnExportarPDF" class="btn-tomar-asistencia">📄 Exportar PDF</button>
        <button type="button" id="btnExportarExcel" class="btn-tomar-asistencia" style="margin-left:8px;">📊 Exportar Excel</button>
    `;
    contenedor.appendChild(envoltorio);

    document.getElementById("btnExportarPDF").addEventListener("click", exportarPDF);
    document.getElementById("btnExportarExcel").addEventListener("click", exportarExcel);
}

// Precarga en la tabla lo que ya se hubiera guardado HOY (notas,
// estados, columnas dinámicas), por si el profesor recarga la página.
async function precargarValoresGuardadosHoy() {
    const { data: cabeceraHoy } = await supabase
        .from("asistencias")
        .select("id, notas_profesor")
        .eq("materia", materiaSeleccionada)
        .eq("salon", salonSeleccionado)
        .eq("fecha", obtenerFechaHoyISO())
        .maybeSingle();

    if (!cabeceraHoy) return;

    const inputNotas = document.getElementById("notasProfesor");
    if (inputNotas && cabeceraHoy.notas_profesor) inputNotas.value = cabeceraHoy.notas_profesor;

    const { data: detalleHoy, error } = await supabase
        .from("asistencia_detalle")
        .select("estudiante_id, estado, observacion, justificacion, valores_extra")
        .eq("asistencia_id", cabeceraHoy.id);

    if (error || !detalleHoy) return;

    detalleHoy.forEach((fila) => {
        const idDetalle = `detalle-${fila.estudiante_id}`;
        const filaDetalle = document.getElementById(idDetalle);
        const btn = cuerpoTablaEstudiantes.querySelector(`.btn-estado[data-detalle="${idDetalle}"]`);

        if (btn && fila.estado && ESTADOS_INFO[fila.estado]) {
            const info = ESTADOS_INFO[fila.estado];
            btn.classList.remove("estado-presente", "estado-ausente", "estado-tardanza", "estado-permiso");
            btn.classList.add(info.clase);
            btn.textContent = info.texto;
            btn.dataset.estado = fila.estado;
        }

        if (filaDetalle) {
            filaDetalle.classList.toggle("mostrar", fila.estado !== "presente");
            const inputObservacion = filaDetalle.querySelector(".input-observacion");
            const inputJustificacion = filaDetalle.querySelector(".input-justificacion");
            if (inputObservacion && fila.observacion) inputObservacion.value = fila.observacion;
            if (inputJustificacion && fila.justificacion) inputJustificacion.value = fila.justificacion;
        }

        if (fila.valores_extra && typeof fila.valores_extra === "object") {
            Object.entries(fila.valores_extra).forEach(([columnaId, valor]) => {
                const inputExtra = cuerpoTablaEstudiantes.querySelector(
                    `.input-columna-extra[data-columna-id="${columnaId}"][data-estudiante-id="${fila.estudiante_id}"]`
                );
                if (inputExtra) inputExtra.value = valor ?? "";
            });
        }
    });
}

// Si tomar-asistencia.html todavía no tiene el botón de guardar, lo
// agregamos aquí para que funcione sin tener que tocar el HTML.
// Si ya tienes un botón con id="btnGuardarAsistencia" en tu HTML, esta
// función no hace nada (no lo duplica).
function asegurarBotonGuardar() {
    if (document.getElementById("btnGuardarAsistencia")) return;

    const contenedor = document.getElementById("panelTabla") || document.body;

    const envoltorio = document.createElement("div");
    envoltorio.style.marginTop = "16px";
    envoltorio.innerHTML = `
        <button type="button" id="btnGuardarAsistencia" class="btn-tomar-asistencia">
            💾 Guardar asistencia
        </button>
        <span id="estadoGuardado" style="margin-left:10px;"></span>
    `;
    contenedor.appendChild(envoltorio);
}

// =========================================================
// INICIO
// =========================================================

(async function init() {
    const ok = await verificarSesion();
    if (!ok) return;

    pintarEncabezado();

    if (!esVistaDetalle) {
        // Dashboard: solo mostrar las clases de hoy, nada más.
        await cargarClasesDeHoy();
        return;
    }

    asegurarContenedorAlertas();
    asegurarControlesNotas();
    asegurarBotonCopiar();
    asegurarBotonAgregarColumna();
    asegurarBotonesExportar();

    await cargarColumnasDinamicas(); // deben existir antes de pintar la tabla
    await cargarEstudiantes();

    asegurarBotonGuardar();
    document.getElementById("btnGuardarAsistencia").addEventListener("click", guardarAsistencia);
})();
