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

// =====================================================
// PROFESORES: se cargan desde la tabla "profesores" para que el
// admin elija de una lista en vez de escribir correo/nombre a mano
// cada vez. Solo se piden los datos a mano si elige "Profesor nuevo".
// =====================================================
const selectProfesor = document.getElementById("selectProfesorAsignacion");
const avisoProfesorNuevo = document.getElementById("avisoProfesorNuevo");

let profesoresDisponibles = [];

async function cargarProfesoresDisponibles() {
    if (!selectProfesor) return;

    const { data, error } = await supabase
        .from("profesores")
        .select("correo_profesor, nombre_profesor, telefono")
        .order("nombre_profesor", { ascending: true });

    if (error) {
        selectProfesor.innerHTML = `<option value="">No se pudo cargar la lista de profesores</option>`;
        return;
    }

    profesoresDisponibles = data || [];

    selectProfesor.innerHTML =
        `<option value="">Selecciona un profesor...</option>` +
        `<option value="__nuevo__">➕ Profesor nuevo (no está en la lista)</option>` +
        profesoresDisponibles.map((p) =>
            `<option value="${escapeHtml(p.correo_profesor)}">${escapeHtml(p.nombre_profesor || p.correo_profesor)}</option>`
        ).join("");
}

function ponerCamposProfesor({ correo, nombre, telefono, editable }) {
    inputCorreo.value = correo || "";
    inputNombre.value = nombre || "";
    inputTelefono.value = telefono || "";

    inputCorreo.disabled = !editable;
    inputNombre.disabled = !editable;
    // El teléfono siempre se puede editar/actualizar aquí mismo.
    inputTelefono.disabled = false;

    avisoProfesorNuevo.classList.toggle("d-none", !editable);
}

selectProfesor?.addEventListener("change", () => {
    const valor = selectProfesor.value;

    if (!valor) {
        ponerCamposProfesor({ correo: "", nombre: "", telefono: "", editable: false });
        return;
    }

    if (valor === "__nuevo__") {
        ponerCamposProfesor({ correo: "", nombre: "", telefono: "", editable: true });
        inputCorreo.focus();
        return;
    }

    const prof = profesoresDisponibles.find((p) => p.correo_profesor === valor);
    ponerCamposProfesor({
        correo: prof?.correo_profesor,
        nombre: prof?.nombre_profesor,
        telefono: prof?.telefono,
        editable: false,
    });
});

const formAsignacion = document.getElementById("formAsignacion");
const estadoAsignacion = document.getElementById("estadoAsignacion");
const listadoProfesores = document.getElementById("listadoProfesores");
const buscarListado = document.getElementById("buscarListado");
const inputCorreo = document.getElementById("inputCorreoProfesor");
const inputNombre = document.getElementById("inputNombreProfesor");
const inputTelefono = document.getElementById("inputTelefonoProfesor");
const checkWhatsapp = document.getElementById("checkWhatsapp");

function formatearHora12(horaTexto) {
    if (!horaTexto) return "";
    const [h, m] = horaTexto.split(":");
    const fecha = new Date();
    fecha.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0);
    return fecha.toLocaleTimeString("es-PA", { hour: "numeric", minute: "2-digit" });
}

let correoOriginalEnEdicion = null;
let datosListadoActual = [];

function limpiarModoEdicion() {
    correoOriginalEnEdicion = null;
    formAsignacion.reset();
    if (selectProfesor) selectProfesor.value = "";
    ponerCamposProfesor({ correo: "", nombre: "", telefono: "", editable: false });
    const aviso = document.getElementById("avisoEdicion");
    if (aviso) aviso.remove();
}

function entrarModoEdicion(prof) {
    correoOriginalEnEdicion = prof.correo;

    // Si el profesor ya existe en la lista desplegable, lo seleccionamos ahí
    // (así se ve de dónde viene el dato); si no está, lo tratamos como "nuevo".
    const existeEnLista = profesoresDisponibles.some((p) => p.correo_profesor === prof.correo);
    if (selectProfesor) selectProfesor.value = existeEnLista ? prof.correo : "__nuevo__";

    ponerCamposProfesor({
        correo: prof.correo,
        nombre: prof.nombre,
        telefono: prof.telefono,
        editable: !existeEnLista,
    });

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

    datosListadoActual = data || [];

    if (datosListadoActual.length === 0) {
        listadoProfesores.innerHTML = `<p class="text-muted">Todavía no hay asignaciones registradas.</p>`;
        return;
    }

    pintarListado(datosListadoActual, telefonosPorCorreo);
}

function pintarListado(filas, telefonosPorCorreo) {
    if (!filas || filas.length === 0) {
        listadoProfesores.innerHTML = `<p class="text-muted">No hay asignaciones que coincidan con la búsqueda.</p>`;
        return;
    }

    const porProfesor = {};
    filas.forEach((fila) => {
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

buscarListado?.addEventListener("input", () => {
    const texto = buscarListado.value.trim().toLowerCase();

    if (!texto) {
        pintarListado(datosListadoActual, {});
        return;
    }

    const filtradas = datosListadoActual.filter((fila) =>
        (fila.nombre_profesor || "").toLowerCase().includes(texto) ||
        (fila.correo_profesor || "").toLowerCase().includes(texto) ||
        (fila.materia || "").toLowerCase().includes(texto) ||
        (fila.salon || "").toLowerCase().includes(texto)
    );

    pintarListado(filtradas, {});
});

formAsignacion?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const correo_profesor = inputCorreo.value.trim().toLowerCase();
    const nombre_profesor = inputNombre.value.trim();
    const telefono = inputTelefono.value.trim();
    const whatsapp_activo = checkWhatsapp.checked;

    if (!correo_profesor || !nombre_profesor) {
        estadoAsignacion.textContent = "⚠️ Elige un profesor de la lista o completa correo y nombre del profesor nuevo.";
        return;
    }

    const materiasMarcadas = Array.from(document.querySelectorAll(".check-materia:checked")).map((c) => c.value);
    const otraMateria = document.getElementById("inputOtraMateria")?.value.trim();
    if (otraMateria) {
        otraMateria.split(",").map((m) => m.trim()).filter(Boolean).forEach((m) => materiasMarcadas.push(m));
    }

    const salonesMarcados = Array.from(document.querySelectorAll(".check-salon:checked")).map((c) => c.value);

    const editando = !!correoOriginalEnEdicion;
    const soloCorrigiendoDatos = editando && materiasMarcadas.length === 0 && salonesMarcados.length === 0;

    if (!soloCorrigiendoDatos) {
        if (materiasMarcadas.length === 0) { estadoAsignacion.textContent = "⚠️ Marca al menos una materia."; return; }
        if (salonesMarcados.length === 0) { estadoAsignacion.textContent = "⚠️ Marca al menos un salón."; return; }
    }

    estadoAsignacion.textContent = "Guardando...";

    await supabase.from("profesores").upsert(
        [{ correo_profesor, nombre_profesor, telefono, whatsapp_activo, actualizado_en: new Date().toISOString() }],
        { onConflict: "correo_profesor" }
    );

    if (materiasMarcadas.length > 0 && salonesMarcados.length > 0) {
        // El día/hora ya no se piden aquí (el profesor arma su horario en
        // "Mi horario"), así que estas filas siempre quedan con dia/hora en
        // null. Como una comparación de NULL contra NULL en la base de
        // datos nunca cuenta como "igual", no podemos confiar en el upsert
        // por conflicto para evitar duplicados: primero revisamos qué
        // combinaciones materia+salón ya existen (sin día/hora) para este
        // profesor, y solo insertamos las que faltan.
        const { data: existentes } = await supabase
            .from("profesor_materias")
            .select("materia, salon")
            .eq("correo_profesor", correo_profesor)
            .is("dia", null)
            .is("hora", null);

        const yaExiste = new Set((existentes || []).map((e) => `${e.materia}|||${e.salon}`));

        const filasAInsertar = [];
        materiasMarcadas.forEach((materia) => {
            salonesMarcados.forEach((salon) => {
                const clave = `${materia}|||${salon}`;
                if (!yaExiste.has(clave)) {
                    filasAInsertar.push({ correo_profesor, nombre_profesor, materia, salon, dia: null, hora: null });
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
    }

    estadoAsignacion.textContent = "✅ Guardado exitosamente.";
    limpiarModoEdicion();
    cargarListado();
});

// BOTÓN PARA CARGAR EL HORARIO MASIVO DE SAMUEL ORTEGA
// (esta carga sí trae día/hora reales porque viene de un horario ya fijo)
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
    await cargarSalonesDisponibles();
    await cargarProfesoresDisponibles();
    cargarListado();
})();
