import { supabase } from "./supabase.js";

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// Deja solo dígitos en el teléfono, para armar el enlace de wa.me.
// Ajusta el prefijo "507" si tu colegio no está en Panamá.
function telefonoAWhatsapp(telefono) {
    const soloDigitos = String(telefono || "").replace(/\D/g, "");
    if (!soloDigitos) return null;
    const conCodigoPais = soloDigitos.length <= 8 ? `507${soloDigitos}` : soloDigitos;
    return `https://wa.me/${conCodigoPais}`;
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

const contenedor = document.getElementById("listaProfesores");
const buscador = document.getElementById("buscarProfesor");

let profesoresCompleto = [];

function renderizar(lista) {
    if (lista.length === 0) {
        contenedor.innerHTML = `<p class="text-muted">No se encontraron profesores.</p>`;
        return;
    }

    contenedor.innerHTML = lista.map((prof) => {
        const linkWhatsapp = prof.whatsapp_activo ? telefonoAWhatsapp(prof.telefono) : null;

        const botonWhatsapp = linkWhatsapp
            ? `<a href="${linkWhatsapp}" target="_blank" rel="noopener" class="btn btn-sm btn-success">
                   <i class="fa-brands fa-whatsapp"></i> Escribir por WhatsApp
               </a>`
            : "";

        const materiasHtml = prof.materias.length
            ? prof.materias.map((m) => `<span class="badge badge-materia me-1">${escapeHtml(m)}</span>`).join("")
            : `<span class="text-muted small">Sin materias asignadas</span>`;

        const salonesHtml = prof.salones.length
            ? prof.salones.map((s) => `<span class="badge badge-salon me-1">${escapeHtml(s)}</span>`).join("")
            : `<span class="text-muted small">Sin salones asignados</span>`;

        return `
            <div class="tarjeta-profesor">
                <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
                    <div>
                        <h3>${escapeHtml(prof.nombre_profesor)}</h3>
                        <p class="mb-1 text-muted small">
                            <i class="fa-solid fa-envelope"></i> ${escapeHtml(prof.correo_profesor)}
                            ${prof.telefono ? ` &nbsp;·&nbsp; <i class="fa-solid fa-phone"></i> ${escapeHtml(prof.telefono)}` : ""}
                        </p>
                    </div>
                    ${botonWhatsapp}
                </div>
                <div class="mt-2"><strong class="small">Materias:</strong> ${materiasHtml}</div>
                <div class="mt-1"><strong class="small">Salones:</strong> ${salonesHtml}</div>
            </div>
        `;
    }).join("");
}

async function cargarProfesores() {
    contenedor.innerHTML = "Cargando...";

    const [{ data: profesores, error: errProfesores }, { data: materias, error: errMaterias }] = await Promise.all([
        supabase.from("profesores").select("correo_profesor, nombre_profesor, telefono, whatsapp_activo").order("nombre_profesor", { ascending: true }),
        supabase.from("profesor_materias").select("correo_profesor, nombre_profesor, materia, salon")
    ]);

    if (errProfesores) {
        contenedor.innerHTML = `<p class="text-danger">Error al cargar profesores: ${escapeHtml(errProfesores.message)}</p>`;
        return;
    }
    if (errMaterias) {
        contenedor.innerHTML = `<p class="text-danger">Error al cargar materias: ${escapeHtml(errMaterias.message)}</p>`;
        return;
    }

    // Mapa correo -> { materias:Set, salones:Set }
    const infoPorCorreo = {};
    (materias || []).forEach((fila) => {
        const clave = fila.correo_profesor;
        if (!infoPorCorreo[clave]) infoPorCorreo[clave] = { materias: new Set(), salones: new Set(), nombre: fila.nombre_profesor };
        infoPorCorreo[clave].materias.add(fila.materia);
        infoPorCorreo[clave].salones.add(fila.salon);
    });

    // Empieza con los que están en la tabla "profesores" (tienen teléfono/whatsapp)
    const listaFinal = (profesores || []).map((p) => {
        const info = infoPorCorreo[p.correo_profesor];
        return {
            ...p,
            materias: info ? Array.from(info.materias) : [],
            salones: info ? Array.from(info.salones) : []
        };
    });

    // Agrega profesores que tienen materias asignadas pero todavía no
    // tienen fila en "profesores" (por ejemplo, datos creados antes de
    // este cambio, sin teléfono guardado)
    const correosYaListados = new Set(listaFinal.map((p) => p.correo_profesor));
    Object.entries(infoPorCorreo).forEach(([correo, info]) => {
        if (!correosYaListados.has(correo)) {
            listaFinal.push({
                correo_profesor: correo,
                nombre_profesor: info.nombre,
                telefono: null,
                whatsapp_activo: false,
                materias: Array.from(info.materias),
                salones: Array.from(info.salones)
            });
        }
    });

    listaFinal.sort((a, b) => (a.nombre_profesor || "").localeCompare(b.nombre_profesor || ""));

    profesoresCompleto = listaFinal;
    renderizar(profesoresCompleto);
}

buscador?.addEventListener("input", () => {
    const texto = buscador.value.trim().toLowerCase();
    if (!texto) { renderizar(profesoresCompleto); return; }

    const filtrado = profesoresCompleto.filter((p) =>
        (p.nombre_profesor || "").toLowerCase().includes(texto) ||
        (p.correo_profesor || "").toLowerCase().includes(texto) ||
        p.materias.some((m) => m.toLowerCase().includes(texto)) ||
        p.salones.some((s) => s.toLowerCase().includes(texto))
    );
    renderizar(filtrado);
});

(async function init() {
    const ok = await verificarAdmin();
    if (!ok) return;
    cargarProfesores();
})();