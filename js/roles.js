// =====================================================
// roles.js
// Detecta con qué rol(es) cuenta una cuenta ya autenticada.
// Una misma cuenta puede tener varios roles a la vez (por
// ejemplo: admin + consejero + profesor). Cada rol se define
// por pertenecer a una tabla distinta, igual que ya hacía
// consejero.js con la tabla "consejeros":
//   - admin      -> fila en "usuarios" con rol = "admin"
//   - consejero  -> fila en "consejeros" con ese correo
//   - profesor   -> al menos una fila en "profesor_materias"
// =====================================================
import { supabase } from "./supabase.js";
/**
 * @param {string} authUserId  user.id de supabase.auth
 * @param {string} correo      correo con el que inició sesión
 * @returns {Promise<{esAdmin:boolean, consejeroInfo:object|null, esProfesor:boolean}>}
 */
export async function obtenerRolesDeCuenta(authUserId, correo) {
    const correoNormalizado = (correo || "").trim().toLowerCase();
    const [{ data: perfil }, { data: consejeros }, { data: materias }] = await Promise.all([
        supabase.from("usuarios").select("rol").eq("auth_user_id", authUserId).maybeSingle(),
        supabase.from("consejeros").select("correo, salon, nombre, rol, puede_editar_horario"),
        supabase.from("profesor_materias").select("id").eq("correo_profesor", correoNormalizado)
    ]);
    const esAdmin = !!(perfil && perfil.rol === "admin");
    const consejeroInfo = Array.isArray(consejeros)
        ? consejeros.find((c) => (c.correo || "").trim().toLowerCase() === correoNormalizado) || null
        : null;
    const esProfesor = Array.isArray(materias) && materias.length > 0;
    return { esAdmin, consejeroInfo, esProfesor };
}
/**
 * Pinta, dentro del elemento con id="navCambiarPanel", los enlaces
 * a los otros paneles a los que esta cuenta también tiene acceso.
 * "paginaActual" es "admin" | "consejero" | "profesor", para no
 * mostrarse un enlace hacia la página en la que ya está.
 *
 * "Mi horario" (mi_horario.html) no es un panel más, es una
 * herramienta del rol profesor, así que se muestra siempre que
 * esProfesor sea true, sin importar en qué página esté parado
 * (incluida profesor.html).
 */
export async function pintarCambiarPanel(paginaActual, estilo = "claro-sobre-oscuro") {
    const contenedor = document.getElementById("navCambiarPanel");
    if (!contenedor) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { esAdmin, consejeroInfo, esProfesor } = await obtenerRolesDeCuenta(user.id, user.email);
    // admin.html y consejero.html tienen navbar oscura (bg-primary) -> texto/botón claro.
    // profesor.html tiene fondo claro -> botón con borde de color, no blanco invisible.
    const claseBoton = estilo === "claro-sobre-oscuro"
        ? "btn btn-outline-light btn-sm me-2"
        : "btn btn-outline-primary btn-sm me-2";
    const enlaces = [];
    if (esAdmin && paginaActual !== "admin") {
        enlaces.push(`<a href="admin.html" class="${claseBoton}"><i class="fa-solid fa-user-shield me-1"></i>Admin</a>`);
    }
    if (consejeroInfo && paginaActual !== "consejero") {
        enlaces.push(`<a href="consejero.html" class="${claseBoton}"><i class="fa-solid fa-chalkboard-user me-1"></i>Consejería</a>`);
    }
    if (esProfesor && paginaActual !== "profesor") {
        enlaces.push(`<a href="profesor.html" class="${claseBoton}"><i class="fa-solid fa-chalkboard me-1"></i>Docente</a>`);
    }
    if (esProfesor) {
        enlaces.push(`<a href="mi_horario.html" class="${claseBoton}"><i class="fa-solid fa-calendar-days me-1"></i>Mi horario</a>`);
    }
    contenedor.innerHTML = enlaces.join("");
}
