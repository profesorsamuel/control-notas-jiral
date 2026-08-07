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
        console.error("❌ Error al verificar acceso de docente:", errMaterias);
        alert("Ocurrió un error al verificar tu acceso. Intenta de nuevo.");
        window.location.href = "login.html";
        return false;
    }

    if (!materias || materias.length === 0) {
        alert("⛔ Esta cuenta no tiene materias asignadas como docente. Contacta al administrador.");
        window.location.href = "login.html";
        return false;
    }

    // Que la materia/salón de la URL realmente sea de este profesor
    // (evita que alguien entre a la asistencia de otro salón cambiando la URL).
    const tieneAcceso = materias.some(
        (a) => a.materia === materiaSeleccionada && a.salon === salonSeleccionado
    );

    if (!materiaSeleccionada || !salonSeleccionado || !tieneAcceso) {
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
    if (materiaTexto) materiaTexto.textContent = materiaSeleccionada;
    if (salonTexto) salonTexto.textContent = salonSeleccionado;

    if (!fechaActual || !nombreProfesorTexto || !materiaTexto || !salonTexto) {
        console.error("❌ Falta alguno de estos ids en el HTML: fechaActual, nombreProfesorTexto, materiaTexto, salonTexto.");
    }
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

async function cargarEstudiantes() {
    estadoLista.textContent = "Cargando...";

    const { data: estudiantesSalon, error: errEst } = await supabase
        .from("estudiantes")
        .select("id, codigo, nombre, correo, es_prueba")
        .eq("salon", salonSeleccionado)
        .order("nombre", { ascending: true });

    if (errEst) {
        cuerpoTablaEstudiantes.innerHTML = `<tr><td colspan="4" style="color:#dc3545;">Error al cargar estudiantes: ${escapeHtml(errEst.message)}</td></tr>`;
        estadoLista.textContent = "";
        return;
    }

    if (!estudiantesSalon || estudiantesSalon.length === 0) {
        cuerpoTablaEstudiantes.innerHTML = `<tr><td colspan="4">No hay estudiantes registrados en este salón.</td></tr>`;
        estadoLista.textContent = "";
        return;
    }

    cuerpoTablaEstudiantes.innerHTML = estudiantesSalon.map((est, i) => {
        const idDetalle = `detalle-${est.id}`;
        return `
        <tr>
            <td>${i + 1}</td>
            <td class="col-nombre">${escapeHtml(est.nombre)}</td>
            <td>
                <button type="button" class="btn-estado estado-presente" data-estado="presente" data-detalle="${idDetalle}">🟢 Presente</button>
            </td>
        </tr>
        <tr class="fila-detalle" id="${idDetalle}">
            <td colspan="3">
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
    estadoLista.textContent = `${estudiantesSalon.length} estudiante(s) cargado(s).`;
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
        // 1) Cabecera: 1 fila por materia+salon+fecha.
        const { data: cabecera, error: errCabecera } = await supabase
            .from("asistencias")
            .upsert(
                {
                    correo_profesor: correoProfesor,
                    materia: materiaSeleccionada,
                    salon: salonSeleccionado,
                    fecha: obtenerFechaHoyISO(),
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

            const fila = {
                asistencia_id: asistenciaId,
                estudiante_id: estudianteId,
                estado: btn.dataset.estado,
                observacion: inputObservacion?.value?.trim() || null,
                justificacion: inputJustificacion?.value?.trim() || null,
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
    await cargarEstudiantes();

    asegurarBotonGuardar();
    document.getElementById("btnGuardarAsistencia").addEventListener("click", guardarAsistencia);
})();
