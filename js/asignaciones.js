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

async function cargarListado() {
    listadoProfesores.innerHTML = "Cargando...";

    const { data, error } = await supabase
        .from("profesor_materias")
        .select("id, correo_profesor, nombre_profesor, materia, salon")
        .order("nombre_profesor", { ascending: true });

    if (error) {
        listadoProfesores.innerHTML = `<p class="text-danger">Error al cargar: ${escapeHtml(error.message)}</p>`;
        return;
    }

    if (!data || data.length === 0) {
        listadoProfesores.innerHTML = `<p class="text-muted">Todavía no hay asignaciones registradas.</p>`;
        return;
    }

    // Agrupar por profesor -> materia -> [salones]
    const porProfesor = {};
    data.forEach((fila) => {
        const clave = fila.correo_profesor;
        if (!porProfesor[clave]) {
            porProfesor[clave] = { nombre: fila.nombre_profesor, correo: fila.correo_profesor, materias: {} };
        }
        if (!porProfesor[clave].materias[fila.materia]) porProfesor[clave].materias[fila.materia] = [];
        porProfesor[clave].materias[fila.materia].push({ salon: fila.salon, id: fila.id });
    });

    listadoProfesores.innerHTML = Object.values(porProfesor).map((prof) => {
        const filasMaterias = Object.entries(prof.materias).map(([materia, salones]) => `
            <div class="fila-materia">
                <div>
                    <strong>${escapeHtml(materia)}:</strong>
                    ${salones.map((s) => escapeHtml(s.salon)).join(", ")}
                </div>
                <div>
                    ${salones.map((s) => `<button class="btn btn-sm btn-outline-danger btn-eliminar-asignacion" data-id="${s.id}" title="Quitar ${escapeHtml(s.salon)}">✕ ${escapeHtml(s.salon)}</button>`).join(" ")}
                </div>
            </div>
        `).join("");

        return `
            <div class="tarjeta-profesor">
                <h3>${escapeHtml(prof.nombre)} <span class="text-muted small">(${escapeHtml(prof.correo)})</span></h3>
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
}

formAsignacion?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const correo_profesor = document.getElementById("inputCorreoProfesor").value.trim().toLowerCase();
    const nombre_profesor = document.getElementById("inputNombreProfesor").value.trim();
    const materia = document.getElementById("inputMateria").value.trim();
    const salon = document.getElementById("selectSalonAsignacion").value;

    estadoAsignacion.textContent = "Guardando...";
    estadoAsignacion.className = "small mt-2 d-block text-primary";

    const { error } = await supabase.from("profesor_materias").insert([{ correo_profesor, nombre_profesor, materia, salon }]);

    if (error) {
        estadoAsignacion.textContent = `❌ Error: ${error.message}`;
        estadoAsignacion.className = "small mt-2 d-block text-danger";
        return;
    }

    estadoAsignacion.textContent = "✅ Asignación agregada.";
    estadoAsignacion.className = "small mt-2 d-block text-success";
    formAsignacion.reset();
    cargarListado();
});

(async function init() {
    const ok = await verificarAdmin();
    if (!ok) return;
    cargarListado();
})();