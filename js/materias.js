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

const listaMaterias = document.getElementById("listaMaterias");
const columnasNivel = {
    7: document.getElementById("columnaNivel7"),
    8: document.getElementById("columnaNivel8"),
    9: document.getElementById("columnaNivel9"),
};
const inputNuevaMateria = document.getElementById("inputNuevaMateria");
const btnAgregarMateria = document.getElementById("btnAgregarMateria");
const estadoMaterias = document.getElementById("estadoMaterias");

let materiasCache = [];

// =====================================================
// CARGAR
// =====================================================
async function cargarMaterias() {
    listaMaterias.innerHTML = "Cargando...";

    const { data, error } = await supabase
        .from("materias")
        .select("id, nombre, nivel_7, nivel_8, nivel_9, orden, activo")
        .order("orden", { ascending: true });

    if (error) {
        listaMaterias.innerHTML = `<p class="text-danger">No se pudieron cargar las materias: ${escapeHtml(error.message)}</p>`;
        return;
    }

    materiasCache = data || [];
    pintarLista();
    pintarHojaPorNivel();
}

// =====================================================
// PINTAR LISTA EDITABLE
// =====================================================
function pintarLista() {
    if (materiasCache.length === 0) {
        listaMaterias.innerHTML = `<p class="text-muted">Todavía no hay materias. Agrega la primera abajo.</p>`;
        return;
    }

    listaMaterias.innerHTML = materiasCache.map((m) => `
        <div class="fila-materia-admin" data-id="${m.id}">
            <div class="nombre-materia">
                ${escapeHtml(m.nombre)}
                ${!m.activo ? '<span class="badge bg-secondary ms-1">Inactiva</span>' : ""}
            </div>
            <div class="checks-nivel">
                <label><input type="checkbox" class="check-nivel" data-nivel="nivel_7" ${m.nivel_7 ? "checked" : ""}> 7°</label>
                <label><input type="checkbox" class="check-nivel" data-nivel="nivel_8" ${m.nivel_8 ? "checked" : ""}> 8°</label>
                <label><input type="checkbox" class="check-nivel" data-nivel="nivel_9" ${m.nivel_9 ? "checked" : ""}> 9°</label>
            </div>
            <div class="acciones-materia">
                <button type="button" class="btn-icono btn-toggle-activo" title="${m.activo ? "Desactivar" : "Activar"}">
                    <i class="fa-solid ${m.activo ? "fa-eye" : "fa-eye-slash"}"></i>
                </button>
                <button type="button" class="btn-icono btn-eliminar-materia" title="Eliminar">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        </div>
    `).join("");

    listaMaterias.querySelectorAll(".fila-materia-admin").forEach((fila) => {
        const id = fila.dataset.id;
        const materia = materiasCache.find((m) => String(m.id) === String(id));
        if (!materia) return;

        fila.querySelectorAll(".check-nivel").forEach((chk) => {
            chk.addEventListener("change", async () => {
                const campo = chk.dataset.nivel;
                const { error } = await supabase.from("materias").update({ [campo]: chk.checked }).eq("id", id);
                if (error) {
                    alert("No se pudo actualizar: " + error.message);
                    chk.checked = !chk.checked;
                    return;
                }
                materia[campo] = chk.checked;
                pintarHojaPorNivel();
            });
        });

        fila.querySelector(".btn-toggle-activo").addEventListener("click", async () => {
            const { error } = await supabase.from("materias").update({ activo: !materia.activo }).eq("id", id);
            if (error) { alert("No se pudo actualizar: " + error.message); return; }
            materia.activo = !materia.activo;
            pintarLista();
            pintarHojaPorNivel();
        });

        fila.querySelector(".btn-eliminar-materia").addEventListener("click", async () => {
            const confirmar = confirm(
                `¿Eliminar la materia "${materia.nombre}" del catálogo?\n\n` +
                `Esto no borra notas ni asignaciones ya guardadas con este nombre, pero ya no aparecerá para asignar a futuro. ` +
                `Si solo quieres dejar de mostrarla sin borrar el historial, usa mejor "Desactivar" (el ícono del ojo).`
            );
            if (!confirmar) return;

            const { error } = await supabase.from("materias").delete().eq("id", id);
            if (error) { alert("No se pudo eliminar: " + error.message); return; }
            cargarMaterias();
        });
    });
}

// =====================================================
// PINTAR HOJA DE RESUMEN POR NIVEL (solo lectura)
// =====================================================
function pintarHojaPorNivel() {
    [7, 8, 9].forEach((nivel) => {
        const columna = columnasNivel[nivel];
        if (!columna) return;

        const lista = materiasCache.filter((m) => m.activo && m[`nivel_${nivel}`]);
        columna.innerHTML = lista.length
            ? lista.map((m) => `<li>${escapeHtml(m.nombre)}</li>`).join("")
            : `<li class="text-muted">Sin materias asignadas a este nivel.</li>`;
    });
}

// =====================================================
// AGREGAR MATERIA NUEVA
// =====================================================
btnAgregarMateria?.addEventListener("click", async () => {
    const nombre = inputNuevaMateria.value.trim();
    if (!nombre) return;

    estadoMaterias.textContent = "Guardando...";
    estadoMaterias.className = "small text-primary";

    const siguienteOrden = materiasCache.length
        ? Math.max(...materiasCache.map((m) => m.orden || 0)) + 1
        : 1;

    const { error } = await supabase.from("materias").insert([{
        nombre,
        orden: siguienteOrden,
        nivel_7: true,
        nivel_8: true,
        nivel_9: true,
        activo: true,
    }]);

    if (error) {
        estadoMaterias.textContent = error.code === "23505"
            ? "⚠️ Ya existe una materia con ese nombre."
            : "❌ No se pudo guardar: " + error.message;
        estadoMaterias.className = "small text-danger";
        return;
    }

    inputNuevaMateria.value = "";
    estadoMaterias.textContent = "✅ Materia agregada.";
    estadoMaterias.className = "small text-success";
    cargarMaterias();
});

inputNuevaMateria?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); btnAgregarMateria.click(); }
});

// =====================================================
// INICIO
// =====================================================
(async function init() {
    const ok = await verificarAdmin();
    if (!ok) return;
    cargarMaterias();
})();
