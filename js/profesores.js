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
const contadorProfesores = document.getElementById("contadorProfesores");

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

// Si se llega desde otra pantalla con ?correo=..., (ej. la tabla
// "Gestionar profesores" del panel de admin), usamos ese correo para
// llevar directo a esa tarjeta: filtramos la búsqueda por él y, una
// vez pintada la lista, le damos scroll y un resalte temporal.
const correoDesdeUrl = (new URLSearchParams(window.location.search).get("correo") || "").trim().toLowerCase();

function resaltarTarjeta(correo) {
    if (!correo) return;
    const tarjeta = listaProfesores.querySelector(`.tarjeta-profesor[data-correo="${CSS.escape(correo)}"]`);
    if (!tarjeta) return;
    tarjeta.scrollIntoView({ behavior: "smooth", block: "center" });
    tarjeta.classList.add("tarjeta-resaltada");
    setTimeout(() => tarjeta.classList.remove("tarjeta-resaltada"), 2500);
}

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
    contadorProfesores.textContent = `${profesoresCache.length} profesor${profesoresCache.length === 1 ? "" : "es"} en total`;

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
            <div class="tarjeta-profesor" data-correo="${escapeHtml(p.correo_profesor)}">
                <div class="tarjeta-encabezado">
                    <div class="avatar-profesor">${escapeHtml(iniciales(p.nombre_profesor))}</div>
                    <div>
                        <h3>${escapeHtml(p.nombre_profesor || "(sin nombre)")}</h3>
                        <div class="small text-muted">
                            Cédula: ${escapeHtml(p.cedula || "—")}
                            &nbsp;·&nbsp;
                            ${p.registrado ? `<span class="text-success">Cuenta activa</span>` : `<span class="text-warning">Sin registrar</span>`}
                        </div>
                        <div class="small text-muted">Usuario: ${escapeHtml(p.correo_profesor || "—")}</div>
                    </div>
                    <div class="tarjeta-acciones">
                        <button type="button" class="btn-icono btn-eliminar-profesor" title="Eliminar profesor">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>

                <div class="mb-2">${camposHtml}</div>

                <div class="mt-2">
                    ${badgesMaterias}
                    ${badgesSalones}
                </div>
                <div class="small mt-1">
                    <a href="asignaciones.html?correo=${encodeURIComponent(p.correo_profesor)}">Editar materias/salones en Asignaciones</a>
                </div>
            </div>
        `;
    }).join("");

    activarEdicionDeCampos();
    activarEliminarProfesor();
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
// 3.5) ELIMINAR PROFESOR
// =====================================================
function activarEliminarProfesor() {
    listaProfesores.querySelectorAll(".btn-eliminar-profesor").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const tarjeta = btn.closest(".tarjeta-profesor");
            const correo = tarjeta.dataset.correo;
            const prof = profesoresCache.find((p) => p.correo_profesor === correo);
            const nombre = prof?.nombre_profesor || correo;

            const confirmar = confirm(
                `¿Eliminar a "${nombre}" (${correo})?\n\n` +
                `Esto borra su ficha de contacto y todas sus materias/salones asignados. ` +
                `NO borra las notas que ya haya puesto, ni su cuenta de acceso (login) si ya se registró — ` +
                `eso hay que revisarlo aparte con el administrador del sistema (Supabase).`
            );
            if (!confirmar) return;

            btn.disabled = true;

            const { error: errAsignaciones } = await supabase
                .from("profesor_materias")
                .delete()
                .eq("correo_profesor", correo);

            if (errAsignaciones) {
                alert("No se pudieron quitar sus asignaciones: " + errAsignaciones.message);
                btn.disabled = false;
                return;
            }

            const { error: errProfesor } = await supabase
                .from("profesores")
                .delete()
                .eq("correo_profesor", correo);

            if (errProfesor) {
                alert("No se pudo eliminar al profesor: " + errProfesor.message);
                btn.disabled = false;
                return;
            }

            cargarProfesores();
        });
    });
}

// =====================================================
// 4) AGREGAR PROFESOR NUEVO (modal)
// =====================================================
const fondoModalProfesor = document.getElementById("fondoModalProfesor");
const btnAbrirModalProfesor = document.getElementById("btnAbrirModalProfesor");
const btnCancelarModalProfesor = document.getElementById("btnCancelarModalProfesor");
const btnGuardarModalProfesor = document.getElementById("btnGuardarModalProfesor");
const estadoModalProfesor = document.getElementById("estadoModalProfesor");

const inputNuevoCorreo = document.getElementById("inputNuevoCorreo");
const inputNuevoNombre = document.getElementById("inputNuevoNombre");
const inputNuevoCedula = document.getElementById("inputNuevoCedula");
const inputNuevoTelefono = document.getElementById("inputNuevoTelefono");
const inputNuevoCorreoMeduca = document.getElementById("inputNuevoCorreoMeduca");
const inputNuevoCorreoPersonal = document.getElementById("inputNuevoCorreoPersonal");

function mostrarEstadoModal(texto, tipo = "danger") {
    estadoModalProfesor.textContent = texto;
    estadoModalProfesor.className = `small text-${tipo}`;
}

function abrirModalProfesor() {
    [inputNuevoCorreo, inputNuevoNombre, inputNuevoCedula, inputNuevoTelefono, inputNuevoCorreoMeduca, inputNuevoCorreoPersonal]
        .forEach((el) => (el.value = ""));
    mostrarEstadoModal("", "muted");
    fondoModalProfesor.classList.add("mostrar");
    inputNuevoCorreo.focus();
}

function cerrarModalProfesor() {
    fondoModalProfesor.classList.remove("mostrar");
}

btnAbrirModalProfesor?.addEventListener("click", abrirModalProfesor);
btnCancelarModalProfesor?.addEventListener("click", cerrarModalProfesor);
fondoModalProfesor?.addEventListener("click", (e) => {
    if (e.target === fondoModalProfesor) cerrarModalProfesor();
});

btnGuardarModalProfesor?.addEventListener("click", async () => {
    const correo_profesor = inputNuevoCorreo.value.trim().toLowerCase();
    const nombre_profesor = inputNuevoNombre.value.trim();
    const cedula = inputNuevoCedula.value.trim() || null;
    const telefono = inputNuevoTelefono.value.trim() || null;
    const correo_meduca = inputNuevoCorreoMeduca.value.trim() || null;
    const correo_personal = inputNuevoCorreoPersonal.value.trim() || null;

    if (!correo_profesor || !nombre_profesor) {
        mostrarEstadoModal("⚠️ El correo de acceso y el nombre son obligatorios.");
        return;
    }

    if (profesoresCache.some((p) => p.correo_profesor === correo_profesor)) {
        mostrarEstadoModal("⚠️ Ya existe un profesor registrado con ese correo.");
        return;
    }

    btnGuardarModalProfesor.disabled = true;
    mostrarEstadoModal("Guardando...", "primary");

    const { error } = await supabase.from("profesores").insert([{
        correo_profesor,
        nombre_profesor,
        cedula,
        telefono,
        correo_meduca,
        correo_personal,
        actualizado_en: new Date().toISOString(),
    }]);

    btnGuardarModalProfesor.disabled = false;

    if (error) {
        mostrarEstadoModal(
            error.code === "23505"
                ? "⚠️ Ya existe un profesor con ese correo o cédula."
                : "❌ No se pudo guardar: " + error.message
        );
        return;
    }

    cerrarModalProfesor();
    cargarProfesores();
});

// =====================================================
// 5) BÚSQUEDA (nombre, correo o materia)
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
    await cargarProfesores();

    if (correoDesdeUrl) {
        // No filtramos con el buscador (así se ve el resto del directorio
        // también); solo saltamos y resaltamos la tarjeta correspondiente.
        resaltarTarjeta(correoDesdeUrl);
    }
})();
