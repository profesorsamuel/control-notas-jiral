import { supabase } from "./supabase.js";

const contenido = document.getElementById("contenido");

const NOMBRES_ACCION = {
    foto: "Foto",
    perfil_creado: "Perfil creado",
    perfil_editado: "Perfil editado",
    portada: "Foto de portada",
};

function escaparHTML(texto) {
    const div = document.createElement("div");
    div.textContent = texto || "";
    return div.innerHTML;
}

function formatearFecha(fechaISO) {
    try {
        return new Date(fechaISO).toLocaleString("es-PA", {
            day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
        });
    } catch {
        return fechaISO;
    }
}

async function esAdmin() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data: perfil } = await supabase
        .from("usuarios")
        .select("rol")
        .eq("auth_user_id", user.id)
        .maybeSingle();
    return !!(perfil && perfil.rol === "admin");
}

function pintarTabla(filas) {
    if (!filas || filas.length === 0) {
        contenido.innerHTML = `<div class="card aviso">Todavía no hay ningún cambio registrado.</div>`;
        return;
    }

    const filasHTML = filas.map((fila) => `
        <tr>
            <td data-label="Fecha">${formatearFecha(fila.creado_en)}</td>
            <td data-label="Docente">${escaparHTML(fila.docente_nombre)}</td>
            <td data-label="Acción"><span class="accion-chip ${fila.accion}">${NOMBRES_ACCION[fila.accion] || fila.accion}</span></td>
            <td data-label="Reina">${escaparHTML(fila.reina_nombre)}</td>
            <td data-label="Detalle">${escaparHTML(fila.detalle || "—")}</td>
        </tr>
    `).join("");

    contenido.innerHTML = `
        <p class="contador">${filas.length} cambio${filas.length === 1 ? "" : "s"} registrado${filas.length === 1 ? "" : "s"}.</p>
        <table class="bitacora">
            <thead>
                <tr><th>Fecha</th><th>Docente</th><th>Acción</th><th>Reina</th><th>Detalle</th></tr>
            </thead>
            <tbody>${filasHTML}</tbody>
        </table>
    `;
}

(async function iniciar() {
    const admin = await esAdmin();
    if (!admin) {
        contenido.innerHTML = `<div class="card aviso">Esta página es solo para administradores. <a href="login.html">Inicia sesión</a> con una cuenta de administrador para verla.</div>`;
        return;
    }

    const { data, error } = await supabase
        .from("campesino_bitacora")
        .select("docente_nombre, accion, reina_slug, reina_nombre, detalle, creado_en")
        .order("creado_en", { ascending: false })
        .limit(500);

    if (error) {
        contenido.innerHTML = `<div class="card aviso">No se pudo cargar la bitácora: ${escaparHTML(error.message)}</div>`;
        return;
    }

    pintarTabla(data);
})();
