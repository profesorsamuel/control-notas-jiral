import { supabase } from "./supabase.js";

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function iniciales(nombre) {
    const partes = String(nombre ?? "").trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return "?";
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return (partes[0][0] + partes[1][0]).toUpperCase();
}

async function verificarAdmin() {
    const { data: { user }, error: errUser } = await supabase.auth.getUser();
    if (errUser || !user) { window.location.href = "login.html"; return false; }

    const { data: perfil, error: errPerfil } = await supabase
        .from("usuarios")
        .select("rol")
        .eq("auth_user_id", user.id)
        .single();

    if (errPerfil || !perfil || perfil.rol !== "admin") {
        alert("⛔ No tienes permisos de administrador.");
        window.location.href = "login.html";
        return false;
    }
    return true;
}

// =====================================================
// El profesor a editar llega por la URL (?correo=...), no se elige
// de una lista aquí. El punto de entrada es el directorio de
// profesores → botón "Editar materias/salones en Asignaciones".
// =====================================================
const parametros = new URLSearchParams(window.location.search);
const correoActivo = (parametros.get("correo") || "").trim().toLowerCase();

const bloqueSinProfesor = document.getElementById("bloqueSinProfesor");
const bloqueFormulario = document.getElementById("bloqueFormulario");
const avatarProfesorActivo = document.getElementById("avatarProfesorActivo");
const nombreProfesorActivo = document.getElementById("nombreProfesorActivo");
const correoProfesorActivo = document.getElementById("correoProfesorActivo");

const inputTelefono = document.getElementById("inputTelefonoProfesor");
const checkWhatsapp = document.getElementById("checkWhatsapp");
const formAsignacion = document.getElementById("formAsignacion");
const estadoAsignacion = document.getElementById("estadoAsignacion");
const listadoAsignacionesActivo = document.getElementById("listadoAsignacionesActivo");

let nombreActivoCache = "";

// =====================================================
// MATERIAS: igual que los salones, se cargan desde la tabla
// "materias" (administrable en materias.html) en vez de venir
// fijas en el HTML. Cada materia indica en qué nivel (7°/8°/9°)
// se dicta, para llevar el control por nivel desde ahí.
// =====================================================
const grupoMateriasCheckboxes = document.getElementById("grupoMaterias");

async function cargarMateriasDisponibles() {
    if (!grupoMateriasCheckboxes) return;

    const { data: materias, error } = await supabase
        .from("materias")
        .select("id, nombre, nivel_7, nivel_8, nivel_9")
        .eq("activo", true)
        .order("orden", { ascending: true });

    if (error) {
        grupoMateriasCheckboxes.innerHTML = `<span class="text-danger small">No se pudieron cargar las materias: ${escapeHtml(error.message)}</span>`;
        return;
    }

    if (!materias || materias.length === 0) {
        grupoMateriasCheckboxes.innerHTML = `<span class="text-muted small">Todavía no hay materias creadas. <a href="materias.html">Crear la primera</a>.</span>`;
        return;
    }

    grupoMateriasCheckboxes.innerHTML = materias.map((m) => {
        const niveles = [m.nivel_7 && "7°", m.nivel_8 && "8°", m.nivel_9 && "9°"].filter(Boolean).join("/");
        const etiqueta = niveles ? `${escapeHtml(m.nombre)} <span class="text-muted" style="font-size:.78em;">(${niveles})</span>` : escapeHtml(m.nombre);
        return `
            <span class="chip-materia">
                <input class="chip-check check-materia" type="checkbox" value="${escapeHtml(m.nombre)}" id="mat-${m.id}">
                <label for="mat-${m.id}">${etiqueta}</label>
            </span>`;
    }).join("");
}

// =====================================================
// SALONES: se cargan desde la tabla "salones" (administrable
// en salones.html) en vez de venir fijos en el HTML.
// =====================================================
const grupoSalonesCheckboxes = document.getElementById("grupoSalones");

async function cargarSalonesDisponibles() {
    if (!grupoSalonesCheckboxes) return;

    const { data: salones, error } = await supabase
        .from("salones")
        .select("codigo, nombre_visible")
        .eq("activo", true)
        .order("orden", { ascending: true });

    if (error) {
        grupoSalonesCheckboxes.innerHTML = `<span class="text-danger small">No se pudieron cargar los salones: ${escapeHtml(error.message)}</span>`;
        return;
    }

    if (!salones || salones.length === 0) {
        grupoSalonesCheckboxes.innerHTML = `<span class="text-muted small">Todavía no hay salones creados. <a href="salones.html">Crear el primero</a>.</span>`;
        return;
    }

    grupoSalonesCheckboxes.innerHTML = salones.map((s) => `
        <input class="chip-check check-salon" type="checkbox" value="${escapeHtml(s.codigo)}" id="sal-${escapeHtml(s.codigo)}">
        <label for="sal-${escapeHtml(s.codigo)}">${escapeHtml(s.nombre_visible)}</label>
    `).join("");
}

function formatearHora12(horaTexto) {
    if (!horaTexto) return "";
    const [h, m] = horaTexto.split(":");
    const fecha = new Date();
    fecha.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0);
    return fecha.toLocaleTimeString("es-PA", { hour: "numeric", minute: "2-digit" });
}

// =====================================================
// CARGAR AL PROFESOR ACTIVO (tarjeta de arriba del formulario)
// =====================================================
async function cargarProfesorActivo() {
    const { data: prof, error } = await supabase
        .from("profesores")
        .select("correo_profesor, nombre_profesor, telefono, whatsapp_activo")
        .eq("correo_profesor", correoActivo)
        .maybeSingle();

    if (error || !prof) {
        listadoAsignacionesActivo.innerHTML = "";
        bloqueSinProfesor.innerHTML = `
            <div class="icono-vacio">⚠️</div>
            <p><strong>No se encontró ningún profesor con ese correo.</strong></p>
            <p class="small">Puede que el enlace esté roto o que lo hayan eliminado.</p>
            <a href="profesores.html" class="btn btn-primary btn-sm mt-2">
                <i class="fa-solid fa-address-book me-1"></i> Ir al directorio de profesores
            </a>
        `;
        bloqueSinProfesor.style.display = "block";
        bloqueFormulario.style.display = "none";
        return;
    }

    nombreActivoCache = prof.nombre_profesor || correoActivo;
    avatarProfesorActivo.textContent = iniciales(prof.nombre_profesor);
    nombreProfesorActivo.textContent = prof.nombre_profesor || "(sin nombre)";
    correoProfesorActivo.textContent = prof.correo_profesor;
    inputTelefono.value = prof.telefono || "";
    checkWhatsapp.checked = !!prof.whatsapp_activo;

    bloqueSinProfesor.style.display = "none";
    bloqueFormulario.style.display = "block";
}

// =====================================================
// LISTADO DE LO YA ASIGNADO A ESTE PROFESOR
// =====================================================
async function cargarListadoActivo() {
    listadoAsignacionesActivo.innerHTML = "Cargando...";

    const { data, error } = await supabase
        .from("profesor_materias")
        .select("id, materia, salon, dia, hora")
        .eq("correo_profesor", correoActivo)
        .order("materia", { ascending: true });

    if (error) {
        listadoAsignacionesActivo.innerHTML = `<p class="text-danger">Error al cargar: ${escapeHtml(error.message)}</p>`;
        return;
    }

    if (!data || data.length === 0) {
        listadoAsignacionesActivo.innerHTML = `<p class="text-muted">Todavía no tiene materias ni salones asignados.</p>`;
        return;
    }

    const porMateria = {};
    data.forEach((fila) => {
        if (!porMateria[fila.materia]) porMateria[fila.materia] = [];
        porMateria[fila.materia].push(fila);
    });

    listadoAsignacionesActivo.innerHTML = Object.entries(porMateria).map(([materia, salones]) => `
        <div class="fila-materia">
            <div>
                <span class="etiqueta-materia">${escapeHtml(materia)}</span>
                ${salones.map((s) => {
                    const horario = s.dia ? ` <span class="text-muted">(${escapeHtml(s.dia)}${s.hora ? " · " + escapeHtml(formatearHora12(s.hora)) : ""})</span>` : "";
                    return `${escapeHtml(s.salon)}${horario}`;
                }).join(", ")}
            </div>
            <div>
                ${salones.map((s) => `<button class="btn btn-sm btn-outline-danger btn-eliminar-asignacion" data-id="${s.id}" title="Quitar ${escapeHtml(s.salon)}">✕ ${escapeHtml(s.salon)}</button>`).join(" ")}
            </div>
        </div>
    `).join("");

    listadoAsignacionesActivo.querySelectorAll(".btn-eliminar-asignacion").forEach((btn) => {
        btn.addEventListener("click", async () => {
            if (!confirm("¿Quitar esta asignación?")) return;
            const { error: errDel } = await supabase.from("profesor_materias").delete().eq("id", btn.dataset.id);
            if (errDel) { alert("Error al eliminar: " + errDel.message); return; }
            cargarListadoActivo();
        });
    });
}

// =====================================================
// GUARDAR (agregar materias/salones nuevos al profesor activo)
// =====================================================
formAsignacion?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const telefono = inputTelefono.value.trim();
    const whatsapp_activo = checkWhatsapp.checked;

    const materiasMarcadas = Array.from(document.querySelectorAll(".check-materia:checked")).map((c) => c.value);
    const otraMateria = document.getElementById("inputOtraMateria")?.value.trim();
    if (otraMateria) {
        otraMateria.split(",").map((m) => m.trim()).filter(Boolean).forEach((m) => materiasMarcadas.push(m));
    }

    const salonesMarcados = Array.from(document.querySelectorAll(".check-salon:checked")).map((c) => c.value);

    if (materiasMarcadas.length === 0) { estadoAsignacion.textContent = "⚠️ Marca al menos una materia."; return; }
    if (salonesMarcados.length === 0) { estadoAsignacion.textContent = "⚠️ Marca al menos un salón."; return; }

    estadoAsignacion.textContent = "Guardando...";

    await supabase.from("profesores").update({
        telefono,
        whatsapp_activo,
        actualizado_en: new Date().toISOString(),
    }).eq("correo_profesor", correoActivo);

    // El día/hora ya no se piden aquí (el profesor arma su horario en
    // "Mi horario"), así que estas filas siempre quedan con dia/hora en
    // null. Como NULL contra NULL nunca cuenta como "igual" en la base de
    // datos, no podemos confiar en un upsert por conflicto para evitar
    // duplicados: primero revisamos qué combinaciones materia+salón ya
    // existen (sin día/hora) para este profesor, y solo insertamos las
    // que faltan.
    const { data: existentes } = await supabase
        .from("profesor_materias")
        .select("materia, salon")
        .eq("correo_profesor", correoActivo)
        .is("dia", null)
        .is("hora", null);

    const yaExiste = new Set((existentes || []).map((e) => `${e.materia}|||${e.salon}`));

    const filasAInsertar = [];
    materiasMarcadas.forEach((materia) => {
        salonesMarcados.forEach((salon) => {
            const clave = `${materia}|||${salon}`;
            if (!yaExiste.has(clave)) {
                filasAInsertar.push({
                    correo_profesor: correoActivo,
                    nombre_profesor: nombreActivoCache,
                    materia,
                    salon,
                    dia: null,
                    hora: null,
                });
            }
        });
    });

    if (filasAInsertar.length > 0) {
        const { error: errInsertar } = await supabase.from("profesor_materias").insert(filasAInsertar);
        if (errInsertar) {
            estadoAsignacion.textContent = "❌ Error al guardar: " + errInsertar.message;
            return;
        }
    }

    estadoAsignacion.textContent = "✅ Guardado exitosamente.";
    document.querySelectorAll(".check-materia").forEach((c) => (c.checked = false));
    document.querySelectorAll(".check-salon").forEach((c) => (c.checked = false));
    document.getElementById("inputOtraMateria").value = "";
    cargarListadoActivo();
});

(async function init() {
    const ok = await verificarAdmin();
    if (!ok) return;

    if (!correoActivo) {
        bloqueSinProfesor.style.display = "block";
        bloqueFormulario.style.display = "none";
        return;
    }

    await cargarMateriasDisponibles();
    await cargarSalonesDisponibles();
    await cargarProfesorActivo();
    if (bloqueFormulario.style.display !== "none") {
        cargarListadoActivo();
    }
})();
