import { supabase } from "./supabase.js";
import { registrarSalida } from "./accesos.js";

document.addEventListener("DOMContentLoaded", async () => {

    const mensajeEstadisticas = document.getElementById("mensajeEstadisticas");
    const nombreAdmin = document.getElementById("nombreAdmin");
    const btnCerrarSesion = document.getElementById("btnCerrarSesion");

    function mostrarMensaje(texto, tipo = "danger") {
        mensajeEstadisticas.textContent = texto;
        mensajeEstadisticas.className = `alert alert-${tipo}`;
    }

    function escapeHtml(str) {
        return String(str ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function formatearDuracion(segundosTotales) {
        const segundos = Math.max(0, Math.round(segundosTotales));
        const horas = Math.floor(segundos / 3600);
        const minutos = Math.floor((segundos % 3600) / 60);
        if (horas > 0) return `${horas}h ${minutos}min`;
        if (minutos > 0) return `${minutos}min`;
        return `${segundos}seg`;
    }

    // =================================================
    // 1) VERIFICAR SESIÓN Y ROL DE ADMIN
    // =================================================

    const { data: { user }, error: errUser } = await supabase.auth.getUser();

    if (errUser || !user) {
        window.location.href = "login.html";
        return;
    }

    const { data: perfil, error: errPerfil } = await supabase
        .from("usuarios")
        .select("correo, rol")
        .eq("auth_user_id", user.id)
        .single();

    if (errPerfil || !perfil || perfil.rol !== "admin") {
        alert("⛔ No tienes permisos de administrador.");
        window.location.href = "login.html";
        return;
    }

    nombreAdmin.textContent = perfil.correo;

    btnCerrarSesion.addEventListener("click", async () => {
        await registrarSalida();
        await supabase.auth.signOut();
        window.location.href = "login.html";
    });

    // =================================================
    // 2) FILTROS
    // =================================================

    const filtroRango = document.getElementById("filtroRango");
    const filtroRol = document.getElementById("filtroRol");
    const filtroCorreo = document.getElementById("filtroCorreo");
    const btnAplicarFiltros = document.getElementById("btnAplicarFiltros");

    const UMBRAL_EN_LINEA_MS = 90 * 1000; // heartbeat cada 30s, tolerancia de 90s

    function fechaDesdeRango(rango) {
        const ahora = new Date();
        if (rango === "hoy") {
            return new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).toISOString();
        }
        if (rango === "7" || rango === "30") {
            const dias = parseInt(rango, 10);
            const fecha = new Date(ahora.getTime() - dias * 24 * 60 * 60 * 1000);
            return fecha.toISOString();
        }
        return null; // "todo"
    }

    // =================================================
    // 3) CARGAR DATOS
    // =================================================

    async function consultarAccesos() {
        const desde = fechaDesdeRango(filtroRango.value);
        const rol = filtroRol.value.trim();
        const correo = filtroCorreo.value.trim();

        let query = supabase
            .from("accesos")
            .select("correo, rol, inicio, fin")
            .order("inicio", { ascending: false });

        if (desde) query = query.gte("inicio", desde);
        if (rol) query = query.eq("rol", rol);
        if (correo) query = query.ilike("correo", `%${correo}%`);

        const { data, error } = await query.limit(1000);

        if (error) throw error;
        return data || [];
    }

    function calcularResumen(accesos) {
        const ahora = Date.now();
        const hoyStr = new Date().toISOString().slice(0, 10);

        const accesosHoy = accesos.filter((a) => (a.inicio || "").slice(0, 10) === hoyStr).length;

        const enLinea = new Set(
            accesos
                .filter((a) => a.fin && (ahora - new Date(a.fin).getTime()) < UMBRAL_EN_LINEA_MS)
                .map((a) => a.correo)
        ).size;

        const usuariosDistintos = new Set(accesos.map((a) => a.correo)).size;

        return {
            accesosHoy,
            enLinea,
            usuariosDistintos,
            totalRango: accesos.length
        };
    }

    function pintarResumen(resumen) {
        document.getElementById("resAccesosHoy").textContent = resumen.accesosHoy;
        document.getElementById("resEnLinea").textContent = resumen.enLinea;
        document.getElementById("resUsuariosDistintos").textContent = resumen.usuariosDistintos;
        document.getElementById("resTotalRango").textContent = resumen.totalRango;
    }

    function pintarMasActivos(accesos) {
        const tabla = document.getElementById("tablaMasActivos");
        const porCorreo = {};

        accesos.forEach((a) => {
            if (!porCorreo[a.correo]) {
                porCorreo[a.correo] = { correo: a.correo, rol: a.rol, cantidad: 0, tiempoSeg: 0, ultimo: null };
            }
            const r = porCorreo[a.correo];
            r.cantidad++;
            const inicio = new Date(a.inicio);
            const fin = new Date(a.fin || a.inicio);
            r.tiempoSeg += Math.max(0, (fin - inicio) / 1000);
            if (!r.ultimo || inicio > r.ultimo) r.ultimo = inicio;
            if (a.rol) r.rol = a.rol;
        });

        const filas = Object.values(porCorreo)
            .sort((a, b) => b.cantidad - a.cantidad)
            .slice(0, 15);

        if (filas.length === 0) {
            tabla.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">No hay accesos en este rango.</td></tr>`;
            return;
        }

        tabla.innerHTML = filas.map((r) => `
            <tr>
                <td>${escapeHtml(r.correo)}</td>
                <td><span class="badge bg-secondary">${escapeHtml(r.rol || "-")}</span></td>
                <td class="text-center fw-bold">${r.cantidad}</td>
                <td class="text-center">${formatearDuracion(r.tiempoSeg)}</td>
                <td class="text-center">${r.ultimo.toLocaleString("es-PA")}</td>
            </tr>
        `).join("");
    }

    function pintarHistorial(accesos) {
        const tabla = document.getElementById("tablaHistorial");
        const contador = document.getElementById("contadorHistorial");
        const ahora = Date.now();

        contador.textContent = `${accesos.length} registro(s)`;

        if (accesos.length === 0) {
            tabla.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">No hay accesos en este rango.</td></tr>`;
            return;
        }

        tabla.innerHTML = accesos.map((a) => {
            const inicio = new Date(a.inicio);
            const fin = new Date(a.fin || a.inicio);
            const duracionSeg = Math.max(0, (fin - inicio) / 1000);
            const enLinea = a.fin && (ahora - new Date(a.fin).getTime()) < UMBRAL_EN_LINEA_MS;

            return `
                <tr class="${enLinea ? "table-success" : ""}">
                    <td>${escapeHtml(a.correo)}</td>
                    <td><span class="badge bg-secondary">${escapeHtml(a.rol || "-")}</span></td>
                    <td class="text-center">${inicio.toLocaleString("es-PA")}</td>
                    <td class="text-center">${fin.toLocaleString("es-PA")}</td>
                    <td class="text-center">${formatearDuracion(duracionSeg)}</td>
                    <td class="text-center">${enLinea ? '<span class="badge bg-success">En línea</span>' : '<span class="badge bg-light text-dark border">Desconectado</span>'}</td>
                </tr>
            `;
        }).join("");
    }

    async function cargarTodo() {
        const textoOriginal = btnAplicarFiltros.innerHTML;
        btnAplicarFiltros.disabled = true;
        btnAplicarFiltros.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Cargando...`;

        try {
            const accesos = await consultarAccesos();
            pintarResumen(calcularResumen(accesos));
            pintarMasActivos(accesos);
            pintarHistorial(accesos);
        } catch (error) {
            console.error("❌ Error al cargar accesos:", error);
            mostrarMensaje(`Error al cargar los accesos: ${error.message || String(error)}`);
        } finally {
            btnAplicarFiltros.disabled = false;
            btnAplicarFiltros.innerHTML = textoOriginal;
        }
    }

    btnAplicarFiltros.addEventListener("click", cargarTodo);

    cargarTodo();

    // Refresco automático cada 60s para reflejar quién sigue en línea
    setInterval(cargarTodo, 60000);
});
