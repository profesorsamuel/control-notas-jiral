import { supabase } from "./supabase.js";

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
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

const formAsignacion = document.getElementById("formAsignacion");
const estadoAsignacion = document.getElementById("estadoAsignacion");
const listadoProfesores = document.getElementById("listadoProfesores");
const inputCorreo = document.getElementById("inputCorreoProfesor");
const inputNombre = document.getElementById("inputNombreProfesor");
const inputTelefono = document.getElementById("inputTelefonoProfesor");
const checkWhatsapp = document.getElementById("checkWhatsapp");
const selectDiaAsignacion = document.getElementById("selectDiaAsignacion");
const inputHoraAsignacion = document.getElementById("inputHoraAsignacion");

function formatearHora12(horaTexto) {
    if (!horaTexto) return "";
    const [h, m] = horaTexto.split(":");
    const fecha = new Date();
    fecha.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0);
    return fecha.toLocaleTimeString("es-PA", { hour: "numeric", minute: "2-digit" });
}

let correoOriginalEnEdicion = null;

function limpiarModoEdicion() {
    correoOriginalEnEdicion = null;
    formAsignacion.reset();
    if (selectDiaAsignacion) selectDiaAsignacion.value = "";
    const aviso = document.getElementById("avisoEdicion");
    if (aviso) aviso.remove();
}

function entrarModoEdicion(prof) {
    correoOriginalEnEdicion = prof.correo;
    inputCorreo.value = prof.correo;
    inputNombre.value = prof.nombre;
    if (prof.telefono) inputTelefono.value = prof.telefono;

    document.querySelectorAll(".check-materia").forEach((c) => (c.checked = false));
    document.querySelectorAll(".check-salon").forEach((c) => (c.checked = false));

    let aviso = document.getElementById("avisoEdicion");
    if (!aviso) {
        aviso = document.createElement("div");
        aviso.id = "avisoEdicion";
        aviso.className = "small ms-2 text-primary mt-2";
        formAsignacion.appendChild(aviso);
    }
    aviso.innerHTML = `✎ Editando a <strong>${escapeHtml(prof.nombre)}</strong>. <a href="#" id="cancelarEdicion">Cancelar edición</a>`;

    document.getElementById("cancelarEdicion")?.addEventListener("click", (e) => {
        e.preventDefault();
        limpiarModoEdicion();
    });

    formAsignacion.scrollIntoView({ behavior: "smooth" });
}

async function cargarListado() {
    if (!listadoProfesores) return;
    listadoProfesores.innerHTML = "Cargando...";

    const { data, error } = await supabase
        .from("profesor_materias")
        .select("id, correo_profesor, nombre_profesor, materia, salon, dia, hora")
        .order("nombre_profesor", { ascending: true });

    if (error) {
        listadoProfesores.innerHTML = `<p class="text-danger">Error al cargar: ${escapeHtml(error.message)}</p>`;
        return;
    }

    const { data: dataProfesores } = await supabase
        .from("profesores")
        .select("correo_profesor, telefono, whatsapp_activo");

    const telefonosPorCorreo = {};
    (dataProfesores || []).forEach((p) => { telefonosPorCorreo[p.correo_profesor] = p; });

    if (!data || data.length === 0) {
        listadoProfesores.innerHTML = `<p class="text-muted">Todavía no hay asignaciones registradas.</p>`;
        return;
    }

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

    listadoProfesores.querySelectorAll(".btn-eliminar-asignacion").forEach((btn) => {
        btn.addEventListener("click", async () => {
            if (!confirm("¿Quitar esta asignación?")) return;
            const { error: errDel } = await supabase.from("profesor_materias").delete().eq("id", btn.dataset.id);
            if (errDel) { alert("Error al eliminar: " + errDel.message); return; }
            cargarListado();
        });
    });

    listadoProfesores.querySelectorAll(".btn-editar-profesor").forEach((btn) => {
        btn.addEventListener("click", () => {
            const correo = btn.closest(".tarjeta-profesor").dataset.correo;
            const prof = porProfesor[correo];
            entrarModoEdicion(prof);
        });
    });

    listadoProfesores.querySelectorAll(".btn-eliminar-profesor").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const correo = btn.closest(".tarjeta-profesor").dataset.correo;
            const prof = porProfesor[correo];
            if (!confirm(`¿Eliminar por completo a "${prof.nombre}" (${correo})?`)) return;

            await supabase.from("profesor_materias").delete().eq("correo_profesor", correo);
            await supabase.from("profesores").delete().eq("correo_profesor", correo);

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

    const materiasMarcadas = Array.from(document.querySelectorAll(".check-materia:checked")).map((c) => c.value);
    const otraMateria = document.getElementById("inputOtraMateria")?.value.trim();
    if (otraMateria) {
        otraMateria.split(",").map((m) => m.trim()).filter(Boolean).forEach((m) => materiasMarcadas.push(m));
    }

    const salonesMarcados = Array.from(document.querySelectorAll(".check-salon:checked")).map((c) => c.value);
    const diaSeleccionado = selectDiaAsignacion ? selectDiaAsignacion.value : "";
    const horaSeleccionada = inputHoraAsignacion ? inputHoraAsignacion.value : "";

    const editando = !!correoOriginalEnEdicion;
    const soloCorrigiendoDatos = editando && materiasMarcadas.length === 0 && salonesMarcados.length === 0;

    if (!soloCorrigiendoDatos) {
        if (materiasMarcadas.length === 0) { estadoAsignacion.textContent = "⚠️ Marca al menos una materia."; return; }
        if (salonesMarcados.length === 0) { estadoAsignacion.textContent = "⚠️ Marca al menos un salón."; return; }
        if (!diaSeleccionado) { estadoAsignacion.textContent = "⚠️ Selecciona el día de clase."; return; }
        if (!horaSeleccionada) { estadoAsignacion.textContent = "⚠️ Selecciona la hora de clase."; return; }
    }

    estadoAsignacion.textContent = "Guardando...";

    await supabase.from("profesores").upsert(
        [{ correo_profesor, nombre_profesor, telefono, whatsapp_activo, actualizado_en: new Date().toISOString() }],
        { onConflict: "correo_profesor" }
    );

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

        await supabase.from("profesor_materias").upsert(filasAInsertar, { onConflict: "correo_profesor,materia,salon,dia,hora" });
    }

    estadoAsignacion.textContent = "✅ Guardado exitosamente.";
    limpiarModoEdicion();
    cargarListado();
});

// BOTÓN PARA CARGAR EL HORARIO MASIVO DE SAMUEL ORTEGA
document.getElementById("btnCargarHorarioSamuel")?.addEventListener("click", async () => {
    const correoMasivo = document.getElementById("inputCorreoMasivo")?.value.trim().toLowerCase();
    const estadoMasivo = document.getElementById("estadoMasivo");

    if (!correoMasivo) {
        alert("Escribe primero el correo del profesor Samuel Ortega.");
        return;
    }

    if (!confirm(`¿Cargar todo el horario de la imagen para el correo ${correoMasivo}?`)) return;

    estadoMasivo.textContent = "Cargando horario completo...";
    estadoMasivo.className = "small text-primary";

    const nombre_profesor = "Samuel Ortega";

    await supabase.from("profesores").upsert(
        [{ correo_profesor: correoMasivo, nombre_profesor, actualizado_en: new Date().toISOString() }],
        { onConflict: "correo_profesor" }
    );

    const horarioSamuel = [
        // Lunes
        { materia: "Formación Ciudadana", salon: "9C", dia: "Lunes", hora: "12:20" },
        { materia: "Ciencias Naturales", salon: "9C", dia: "Lunes", hora: "12:55" },
        { materia: "Ciencias Naturales", salon: "8A", dia: "Lunes", hora: "14:05" },
        { materia: "Ciencias Naturales", salon: "9B", dia: "Lunes", hora: "15:35" },
        // Martes
        { materia: "Ciencias Naturales", salon: "9C", dia: "Martes", hora: "12:20" },
        { materia: "Ciencias Naturales", salon: "8A", dia: "Martes", hora: "13:30" },
        { materia: "Ciencias Naturales", salon: "8A", dia: "Martes", hora: "14:05" },
        { materia: "Ciencias Naturales", salon: "9A", dia: "Martes", hora: "15:35" },
        { materia: "Ciencias Naturales", salon: "9A", dia: "Martes", hora: "16:10" },
        // Miércoles
        { materia: "Ciencias Naturales", salon: "9C", dia: "Miércoles", hora: "12:20" },
        { materia: "Ciencias Naturales", salon: "9C", dia: "Miércoles", hora: "12:55" },
        { materia: "Ciencias Naturales", salon: "9B", dia: "Miércoles", hora: "14:05" },
        { materia: "Ciencias Naturales", salon: "8A", dia: "Miércoles", hora: "15:00" },
        { materia: "Ciencias Naturales", salon: "9A", dia: "Miércoles", hora: "16:45" },
        // Jueves
        { materia: "Ciencias Naturales", salon: "9A", dia: "Jueves", hora: "12:20" },
        { materia: "Informática", salon: "8A", dia: "Jueves", hora: "13:30" },
        { materia: "Informática", salon: "8A", dia: "Jueves", hora: "14:05" },
        { materia: "Ciencias Naturales", salon: "9B", dia: "Jueves", hora: "16:10" },
        { materia: "Ciencias Naturales", salon: "9B", dia: "Jueves", hora: "16:45" },
        // Viernes
        { materia: "Ciencias Naturales", salon: "9A", dia: "Viernes", hora: "12:55" },
        { materia: "Informática", salon: "8B", dia: "Viernes", hora: "13:30" },
        { materia: "Informática", salon: "8B", dia: "Viernes", hora: "14:05" },
        { materia: "Ciencias Naturales", salon: "9B", dia: "Viernes", hora: "15:35" },
        { materia: "Ciencias Naturales", salon: "8A", dia: "Viernes", hora: "16:10" },
        { materia: "Ciencias Naturales", salon: "9C", dia: "Viernes", hora: "16:45" }
    ];

    const filasAInsertar = horarioSamuel.map(b => ({
        correo_profesor: correoMasivo,
        nombre_profesor,
        materia: b.materia,
        salon: b.salon,
        dia: b.dia,
        hora: b.hora
    }));

    const { error } = await supabase
        .from("profesor_materias")
        .upsert(filasAInsertar, { onConflict: "correo_profesor,materia,salon,dia,hora" });

    if (error) {
        estadoMasivo.textContent = "❌ Error: " + error.message;
        estadoMasivo.className = "small text-danger";
    } else {
        estadoMasivo.textContent = "✅ ¡Horario completo de Samuel Ortega cargado con éxito!";
        estadoMasivo.className = "small text-success";
        cargarListado();
    }
});

(async function init() {
    const ok = await verificarAdmin();
    if (!ok) return;
    cargarListado();
})();
