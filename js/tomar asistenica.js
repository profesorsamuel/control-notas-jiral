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
        avisoSinAcceso.textContent = "⛔ No tienes acceso a esta materia/salón, o el enlace es inválido.";
        avisoSinAcceso.style.display = "block";
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
    fechaActual.textContent = fechaHoyTexto;
    nombreProfesorTexto.textContent = nombreProfesor;
    materiaTexto.textContent = materiaSeleccionada;
    salonTexto.textContent = salonSeleccionado;
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
// Cuando el estado queda en Ausente, Tardanza o Permiso, se muestra
// automáticamente el panel de Observación/Justificación/Adjuntar
// archivo debajo de ese estudiante. En Presente ese panel queda oculto.

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
// INICIO
// =========================================================

(async function init() {
    const ok = await verificarSesion();
    if (!ok) return;

    pintarEncabezado();
    await cargarEstudiantes();
})();
