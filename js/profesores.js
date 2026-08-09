import { supabase } from "./supabase.js";

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// =====================================================
// 0) VERIFICAR ADMIN (mismo patrón que asignaciones.js)
// =====================================================
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

const listaProfesores = document.getElementById("listaProfesores");
const buscarProfesor = document.getElementById("buscarProfesor");

// Campos de contacto que el admin puede editar aquí. correo_profesor
// (el usuario de acceso) NO está en esta lista a propósito: ese se
// genera solo a partir de la cédula al registrarse y no debe tocarse
// desde esta pantalla o se le rompe el login al profesor(a).
const CAMPOS_EDITABLES = [
    { clave: "telefono", etiqueta: "📞 Teléfono", tipo: "tel", placeholder: "6000-0000" },
    { clave: "correo_meduca", etiqueta: "📧 Correo Meduca", tipo: "email", placeholder: "nombre@meduca.gob.pa" },
    { clave: "correo_personal", etiqueta: "📧 Correo personal", tipo: "email", placeholder: "nombre@correo.com" },
    { clave: "fecha_nacimiento", etiqueta: "🎂 Fecha de nacimiento", tipo: "date", placeholder: "" },
];

function formatearFecha(fechaISO) {
    if (!fechaISO) return "";
    const [anio, mes, dia] = fechaISO.split("-");
    if (!anio || !mes || !dia) return fechaISO;
    return `${dia}/${mes}/${anio}`;
}

let profesoresCache = [];
let asignacionesPorCorreo = {};

// =====================================================
// 1) CARGAR PROFESORES + SUS ASIGNACIONES (materia/salón)
// =====================================================
async function cargarProfesores() {
    listaProfesores.innerHTML = "Cargando...";

    const { data: profesores, error } = await supabase
        .from("profesores")
        .select("correo_profesor, nombre_profesor, cedula, telefono, correo_meduca, correo_personal, fecha_nacimiento, registrado")
        .order("nombre_profesor", { ascending: true });

    if (error) {
        listaProfesores.innerHTML = `<p class="text-danger">No se pudieron cargar los profesores: ${escapeHtml(error.message)}</p>`;
        return;
    }

    const { data: materias } = await supabase
        .from("profesor_materias")
        .select("correo_profesor, materia, salon");

    asignacionesPorCorreo = {};
    (materias || []).forEach((m) => {
        if (!asignacionesPorCorreo[m.correo_profesor]) asignacionesPorCorreo[m.correo_profesor] = [];
        asignacionesPorCorreo[m.correo_profesor].push(m);
    });

    profesoresCache = profesores || [];
    pintarLista(profesoresCache);
}

// =====================================================
// 2) PINTAR TARJETAS
// =====================================================
function pintarLista(lista) {
    if (!lista || lista.length === 0) {
        listaProfesores.innerHTML = `<p class="text-muted">No hay profesores que coincidan con la búsqueda.</p>`;
        return;
    }

    listaProfesores.innerHTML = lista.map((p) => {
        const asignaciones = asignacionesPorCorreo[p.correo_profesor] || [];

        const salonesUnicos = [...new Set(asignaciones.map((a) => a.salon))];
        const materiasUnicas = [...new Set(asignaciones.map((a) => a.materia))];

        const badgesMaterias = materiasUnicas.length
            ? materiasUnicas.map((m) => `<span class="badge badge-materia me-1 mb-1">${escapeHtml(m)}</span>`).join("")
            : `<span class="text-muted small">Sin materias asignadas todavía</span>`;

        const badgesSalones = salonesUnicos.length
            ? salonesUnicos.map((s) => `<span class="badge badge-salon me-1 mb-1">${escapeHtml(s)}</span>`).join("")
            : "";

        const camposHtml = CAMPOS_EDITABLES.map((campo) => {
            const valorCrudo = p[campo.clave] || "";
            const valorMostrado = campo.tipo === "date" ? (formatearFecha(valorCrudo) || "—") : (valorCrudo || "—");

            return `
                <div class="campo-editable d-flex align-items-center gap-2 mb-1" data-campo="${campo.clave}" data-correo="${escapeHtml(p.correo_profesor)}">
                    <span class="small text-muted" style="min-width:150px;">${campo.etiqueta}:</span>
                    <span class="valor-campo small">${escapeHtml(valorMostrado)}</span>
                    <input
                        type="${campo.tipo}"
                        class="form-control form-control-sm input-campo d-none"
                        style="max-width:220px;"
                        value="${escapeHtml(valorCrudo)}"
                        placeholder="${campo.placeholder}"
                    >
                    <button type="button" class="btn btn-link btn-sm p-0 btn-editar-campo" title="Editar">✎</button>
                    <button type="button" class="btn btn-link btn-sm p-0 text-success btn-guardar-campo d-none" title="Guardar">✓</button>
                    <button type="button" class="btn btn-link btn-sm p-0 text-danger btn-cancelar-campo d-none" title="Cancelar">✕</button>
                </div>
            `;
        }).join("");

        return `
            <div class="tarjeta-profesor">
                <h3>${escapeHtml(p.nombre_profesor || "(sin nombre)")}</h3>
                <div class="small text-muted mb-2">
                    Cédula: ${escapeHtml(p.cedula || "—")}
                    &nbsp;·&nbsp;
                    Usuario de acceso: ${escapeHtml(p.correo_profesor || "—")}
                    &nbsp;·&nbsp;
                    ${p.registrado ? `<span class="text-success">Cuenta activa</span>` : `<span class="text-warning">Todavía no se ha registrado</span>`}
                </div>

                <div class="mb-2">${camposHtml}</div>

                <div class="mt-2">
                    ${badgesMaterias}
                    ${badgesSalones}
                </div>
                <div class="small mt-1">
                    <a href="asignaciones.html">Editar materias/salones en Asignaciones</a>
                </div>
            </div>
        `;
    }).join("");

    activarEdicionDeCampos();
}

// =====================================================
// 3) EDICIÓN "EN LÍNEA" DE CADA CAMPO (lápiz -> guardar/cancelar)
// =====================================================
function activarEdicionDeCampos() {
    listaProfesores.querySelectorAll(".campo-editable").forEach((contenedor) => {
        const valorSpan = contenedor.querySelector(".valor-campo");
        const input = contenedor.querySelector(".input-campo");
        const btnEditar = contenedor.querySelector(".btn-editar-campo");
        const btnGuardar = contenedor.querySelector(".btn-guardar-campo");
        const btnCancelar = contenedor.querySelector(".btn-cancelar-campo");
        const valorOriginal = input.value;

        function entrarEdicion() {
            valorSpan.classList.add("d-none");
            input.classList.remove("d-none");
            btnEditar.classList.add("d-none");
            btnGuardar.classList.remove("d-none");
            btnCancelar.classList.remove("d-none");
            input.focus();
        }

        function salirEdicion() {
            valorSpan.classList.remove("d-none");
            input.classList.add("d-none");
            btnEditar.classList.remove("d-none");
            btnGuardar.classList.add("d-none");
            btnCancelar.classList.add("d-none");
        }

        btnEditar.addEventListener("click", entrarEdicion);

        btnCancelar.addEventListener("click", () => {
            input.value = valorOriginal;
            salirEdicion();
        });

        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") { e.preventDefault(); btnGuardar.click(); }
            if (e.key === "Escape") { btnCancelar.click(); }
        });

        btnGuardar.addEventListener("click", async () => {
            const correo = contenedor.dataset.correo;
            const campo = contenedor.dataset.campo;
            const nuevoValor = input.value.trim() || null;

            btnGuardar.disabled = true;

            const { error } = await supabase
                .from("profesores")
                .update({ [campo]: nuevoValor, actualizado_en: new Date().toISOString() })
                .eq("correo_profesor", correo);

            btnGuardar.disabled = false;

            if (error) {
                alert("No se pudo guardar: " + error.message);
                return;
            }

            const mostrarComoFecha = campo === "fecha_nacimiento";
            valorSpan.textContent = nuevoValor ? (mostrarComoFecha ? formatearFecha(nuevoValor) : nuevoValor) : "—";

            // Actualiza también la copia en memoria para que la búsqueda
            // no pierda este cambio si se vuelve a filtrar sin recargar.
            const prof = profesoresCache.find((p) => p.correo_profesor === correo);
            if (prof) prof[campo] = nuevoValor;

            salirEdicion();
        });
    });
}

// =====================================================
// 4) BÚSQUEDA (nombre, correo o materia)
// =====================================================
buscarProfesor?.addEventListener("input", () => {
    const texto = buscarProfesor.value.trim().toLowerCase();

    if (!texto) {
        pintarLista(profesoresCache);
        return;
    }

    const filtrados = profesoresCache.filter((p) => {
        const asignaciones = asignacionesPorCorreo[p.correo_profesor] || [];
        const materias = asignaciones.map((a) => a.materia).join(" ").toLowerCase();

        return (
            (p.nombre_profesor || "").toLowerCase().includes(texto) ||
            (p.correo_profesor || "").toLowerCase().includes(texto) ||
            (p.correo_meduca || "").toLowerCase().includes(texto) ||
            (p.correo_personal || "").toLowerCase().includes(texto) ||
            materias.includes(texto)
        );
    });

    pintarLista(filtrados);
});

// =====================================================
// INICIO
// =====================================================
(async function init() {
    const ok = await verificarAdmin();
    if (!ok) return;
    cargarProfesores();
})();
