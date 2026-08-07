import { supabase } from "./supabase.js";

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// --- Verificar que quien entra es admin ---
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

const formAsignacion = document.getElementById("formAsignacion");
const estadoAsignacion = document.getElementById("estadoAsignacion");
const listadoProfesores = document.getElementById("listadoProfesores");
const inputCorreo = document.getElementById("inputCorreoProfesor");
const inputNombre = document.getElementById("inputNombreProfesor");
const inputTelefono = document.getElementById("inputTelefonoProfesor");
const checkWhatsapp = document.getElementById("checkWhatsapp");
const selectDiaAsignacion = document.getElementById("selectDiaAsignacion");
const inputHoraAsignacion = document.getElementById("inputHoraAsignacion");

// Formatea "09:00" (o "09:00:00" que devuelve Supabase) a "9:00 AM"
function formatearHora12(horaTexto) {
    if (!horaTexto) return "";
    const [h, m] = horaTexto.split(":");
    const fecha = new Date();
    fecha.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0);
    return fecha.toLocaleTimeString("es-PA", { hour: "numeric", minute: "2-digit" });
}

// Guarda el correo ORIGINAL cuando estamos editando un profesor existente,
// para poder actualizar sus filas viejas si el correo cambia.
let correoOriginalEnEdicion = null;

function limpiarModoEdicion() {
    correoOriginalEnEdicion = null;
    formAsignacion.reset();
    selectDiaAsignacion.value = "";
    const aviso = document.getElementById("avisoEdicion");
    if (aviso) aviso.remove();
}

function entrarModoEdicion(prof) {
    correoOriginalEnEdicion = prof.correo;
    inputCorreo.value = prof.correo;
    inputNombre.value = prof.nombre;
    if (prof.telefono) inputTelefono.value = prof.telefono;

    // Marcar materias y salones que ya tiene (útil para corregir, no obligatorio)
    document.querySelectorAll(".check-materia").forEach((c) => (c.checked = false));
    document.querySelectorAll(".check-salon").forEach((c) => (c.checked = false));

    let aviso = document.getElementById("avisoEdicion");
    if (!aviso) {
        aviso = document.createElement("div");
        aviso.id = "avisoEdicion";
        aviso.className = "small ms-2 text-primary mt-2";
        formAsignacion.appendChild(aviso);
    }
    aviso.innerHTML = `✎ Editando a <strong>${escapeHtml(prof.nombre)}</strong>. Corrige los datos y marca materia(s)/salón(es) para agregar, o solo corrige el nombre/correo/teléfono y guarda. <a href="#" id="cancelarEdicion">Cancelar edición</a>`;

    document.getElementById("cancelarEdicion")?.addEventListener("click", (e) => {
        e.preventDefault();
        limpiarModoEdicion();
    });

    formAsignacion.scrollIntoView({ behavior: "smooth" });
}

async function cargarListado() {
    listadoProfesores.innerHTML = "Cargando...";

    const { data, error } = await supabase
        .from("profesor_materias")
        .select("id, correo_profesor, nombre_profesor, materia, salon, dia, hora")
        .order("nombre_profesor", { ascending: true });

    if (error) {
        listadoProfesores.innerHTML = `<p class="text-danger">Error al cargar: ${escapeHtml(error.message)}</p>`;
        return;
    }

    // También traemos teléfono/whatsapp desde "profesores" para poder editarlos
    const { data: dataProfesores } = await supabase
        .from("profesores")
        .select("correo_profesor, telefono, whatsapp_activo");

    const telefonosPorCorreo = {};
    (dataProfesores || []).forEach((p) => { telefonosPorCorreo[p.correo_profesor] = p; });

    if (!data || data.length === 0) {
        listadoProfesores.innerHTML = `<p class="text-muted">Todavía no hay asignaciones registradas.</p>`;
        return;
    }

    // Agrupar por profesor -> materia -> [salones]
    const porProfesor = {};
    data.forEach((fila) => {
        const clave = fila.correo_profesor;
        if (!porProfesor[clave]) {
            porProfesor[clave] = {
                nombre: fila.nombre_profesor,
                correo: fila.correo_profesor,
                telefono: telefonosPorCorreo[clave]?.telefono || "",
                materias: {},
            };
        }
        if (!porProfesor[clave].materias[fila.materia]) porProfesor[clave].materias[fila.materia] = [];
        porProfesor[clave].materias[fila.materia].push({ salon: fila.salon, id: fila.id, dia: fila.dia, hora: fila.hora });
    });

    listadoProfesores.innerHTML = Object.values(porProfesor).map((prof) => {
        const filasMaterias = Object.entries(prof.materias).map(([materia, salones]) => `
            <div class="fila-materia">
                <div>
                    <strong>${escapeHtml(materia)}:</strong>
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

        return `
            <div class="tarjeta-profesor" data-correo="${escapeHtml(prof.correo)}">
                <div class="d-flex justify-content-between align-items-start flex-wrap">
                    <h3>${escapeHtml(prof.nombre)} <span class="text-muted small">(${escapeHtml(prof.correo)})</span></h3>
                    <div>
                        <button class="btn btn-sm btn-outline-primary btn-editar-profesor">✎ Editar</button>
                        <button class="btn btn-sm btn-outline-danger btn-eliminar-profesor">🗑 Eliminar profesor</button>
                    </div>
                </div>
                ${filasMaterias}
            </div>
        `;
    }).join("");

    // Eliminar una sola combinación materia+salón
    listadoProfesores.querySelectorAll(".btn-eliminar-asignacion").forEach((btn) => {
        btn.addEventListener("click", async () => {
            if (!confirm("¿Quitar esta asignación?")) return;
            const { error: errDel } = await supabase.from("profesor_materias").delete().eq("id", btn.dataset.id);
            if (errDel) { alert("Error al eliminar: " + errDel.message); return; }
            cargarListado();
        });
    });

    // Editar profesor (rellena el formulario de arriba)
    listadoProfesores.querySelectorAll(".btn-editar-profesor").forEach((btn) => {
        btn.addEventListener("click", () => {
            const correo = btn.closest(".tarjeta-profesor").dataset.correo;
            const prof = porProfesor[correo];
            entrarModoEdicion(prof);
        });
    });

    // Eliminar profesor completo (todas sus materias/salones + su ficha)
    listadoProfesores.querySelectorAll(".btn-eliminar-profesor").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const correo = btn.closest(".tarjeta-profesor").dataset.correo;
            const prof = porProfesor[correo];
            if (!confirm(`¿Eliminar por completo a "${prof.nombre}" (${correo}) y todas sus asignaciones? Esta acción no se puede deshacer.`)) return;

            const { error: errDelMaterias } = await supabase
                .from("profesor_materias")
                .delete()
                .eq("correo_profesor", correo);

            if (errDelMaterias) { alert("Error al eliminar sus asignaciones: " + errDelMaterias.message); return; }

            const { error: errDelProfesor } = await supabase
                .from("profesores")
                .delete()
                .eq("correo_profesor", correo);

            if (errDelProfesor) { alert("Error al eliminar su ficha: " + errDelProfesor.message); return; }

            if (correoOriginalEnEdicion === correo) limpiarModoEdicion();
            cargarListado();
        });
    });
}

formAsignacion?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const correo_profesor = inputCorreo.value.trim().toLowerCase();
    const nombre_profesor = inputNombre.value.trim();
    const telefono = inputTelefono.value.trim();
    const whatsapp_activo = checkWhatsapp.checked;

    // --- Materias marcadas + "otra materia" escrita a mano ---
    const materiasMarcadas = Array.from(document.querySelectorAll(".check-materia:checked")).map((c) => c.value);
    const otraMateria = document.getElementById("inputOtraMateria").value.trim();
    if (otraMateria) {
        otraMateria.split(",").map((m) => m.trim()).filter(Boolean).forEach((m) => materiasMarcadas.push(m));
    }

    // --- Salones marcados ---
    const salonesMarcados = Array.from(document.querySelectorAll(".check-salon:checked")).map((c) => c.value);

    // --- Día y hora (se aplican a todas las combinaciones de este envío) ---
    const diaSeleccionado = selectDiaAsignacion.value;
    const horaSeleccionada = inputHoraAsignacion.value; // "HH:MM" o ""

    const editando = !!correoOriginalEnEdicion;
    const soloCorrigiendoDatos = editando && materiasMarcadas.length === 0 && salonesMarcados.length === 0;

    if (!soloCorrigiendoDatos) {
        if (materiasMarcadas.length === 0) {
            estadoAsignacion.textContent = "⚠️ Marca al menos una materia.";
            estadoAsignacion.className = "small ms-2 text-warning";
            return;
        }
        if (salonesMarcados.length === 0) {
            estadoAsignacion.textContent = "⚠️ Marca al menos un salón.";
            estadoAsignacion.className = "small ms-2 text-warning";
            return;
        }
        if (!diaSeleccionado) {
            estadoAsignacion.textContent = "⚠️ Selecciona el día de clase.";
            estadoAsignacion.className = "small ms-2 text-warning";
            return;
        }
        if (!horaSeleccionada) {
            estadoAsignacion.textContent = "⚠️ Selecciona la hora de clase.";
            estadoAsignacion.className = "small ms-2 text-warning";
            return;
        }
    }

    estadoAsignacion.textContent = "Guardando...";
    estadoAsignacion.className = "small ms-2 text-primary";

    // Si estamos editando y el correo cambió, primero migramos las filas viejas
    // al correo nuevo (para no crear un profesor duplicado).
    if (editando && correoOriginalEnEdicion !== correo_profesor) {
        const { error: errMigrarMaterias } = await supabase
            .from("profesor_materias")
            .update({ correo_profesor, nombre_profesor })
            .eq("correo_profesor", correoOriginalEnEdicion);

        if (errMigrarMaterias) {
            estadoAsignacion.textContent = `❌ Error al migrar sus asignaciones: ${errMigrarMaterias.message}`;
            estadoAsignacion.className = "small ms-2 text-danger";
            return;
        }

        // Borramos la ficha vieja (se creará/actualizará la nueva en el upsert de abajo)
        await supabase.from("profesores").delete().eq("correo_profesor", correoOriginalEnEdicion);
    } else if (editando) {
        // Mismo correo: aseguramos que el nombre quede sincronizado en sus filas existentes
        await supabase
            .from("profesor_materias")
            .update({ nombre_profesor })
            .eq("correo_profesor", correo_profesor);
    }

    // 1) Guardar/actualizar el profesor en el directorio (nombre, teléfono, whatsapp)
    const { error: errProfesor } = await supabase
        .from("profesores")
        .upsert(
            [{ correo_profesor, nombre_profesor, telefono, whatsapp_activo, actualizado_en: new Date().toISOString() }],
            { onConflict: "correo_profesor" }
        );

    if (errProfesor) {
        estadoAsignacion.textContent = `❌ Error al guardar el profesor: ${errProfesor.message}`;
        estadoAsignacion.className = "small ms-2 text-danger";
        return;
    }

    // 2) Crear una fila por cada combinación materia x salón (si se marcó alguna)
    if (materiasMarcadas.length > 0 && salonesMarcados.length > 0) {
        const filasAInsertar = [];
        materiasMarcadas.forEach((materia) => {
            salonesMarcados.forEach((salon) => {
                filasAInsertar.push({
                    correo_profesor,
                    nombre_profesor,
                    materia,
                    salon,
                    dia: diaSeleccionado || null,
                    hora: horaSeleccionada || null,
                });
            });
        });

        // La combinación única ahora es correo+materia+salon+dia+hora (no solo
        // materia+salon), porque una misma materia en un mismo salón puede
        // repetirse varias veces por semana en días y horas distintas, e
        // incluso dos veces el mismo día (clase doble). Así cada bloque de
        // horario queda como su propia fila, sin sobrescribir a los demás.
        const { error: errMaterias } = await supabase
            .from("profesor_materias")
            .upsert(filasAInsertar, { onConflict: "correo_profesor,materia,salon,dia,hora" });

        if (errMaterias) {
            estadoAsignacion.textContent = `❌ Error al guardar las asignaciones: ${errMaterias.message}`;
            estadoAsignacion.className = "small ms-2 text-danger";
            return;
        }
    }

    estadoAsignacion.textContent = soloCorrigiendoDatos
        ? "✅ Datos del profesor actualizados."
        : `✅ Guardado: ${materiasMarcadas.length} materia(s) x ${salonesMarcados.length} salón(es).`;
    estadoAsignacion.className = "small ms-2 text-success";

    limpiarModoEdicion();
    cargarListado();
});

(async function init() {
    const ok = await verificarAdmin();
    if (!ok) return;
    cargarListado();
})();
