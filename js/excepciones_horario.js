import { supabase } from "./supabase.js";

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// =========================================================
// VERIFICAR ADMIN (mismo patrón que asignaciones.js)
// =========================================================

let correoAdmin = "";

async function verificarAdmin() {
    const { data: { user }, error: errUser } = await supabase.auth.getUser();
    if (errUser || !user) { window.location.href = "login.html"; return false; }

    correoAdmin = (user.email || "").trim().toLowerCase();

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

// =========================================================
// ELEMENTOS
// =========================================================

const formExcepcion = document.getElementById("formExcepcion");
const inputFecha = document.getElementById("inputFecha");
const selectAlcance = document.getElementById("selectAlcance");
const grupoDetalleAlcance = document.getElementById("grupoDetalleAlcance");
const labelDetalleAlcance = document.getElementById("labelDetalleAlcance");
const inputDetalleAlcance = document.getElementById("inputDetalleAlcance");
const selectTipo = document.getElementById("selectTipo");
const grupoFranja = document.getElementById("grupoFranja");
const selectFranja = document.getElementById("selectFranja");
const inputMotivo = document.getElementById("inputMotivo");
const estadoExcepcion = document.getElementById("estadoExcepcion");
const listadoExcepciones = document.getElementById("listadoExcepciones");

const NOMBRES_DIA = { lunes: "Lunes", martes: "Martes", miercoles: "Miércoles", jueves: "Jueves", viernes: "Viernes" };

function formatearHora12(horaTexto) {
    if (!horaTexto) return "";
    const [h, m] = horaTexto.split(":");
    const fecha = new Date();
    fecha.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0);
    return fecha.toLocaleTimeString("es-PA", { hour: "numeric", minute: "2-digit" });
}

// =========================================================
// MOSTRAR/OCULTAR CAMPOS SEGÚN LO SELECCIONADO
// =========================================================

selectAlcance.addEventListener("change", () => {
    const alcance = selectAlcance.value;
    if (alcance === "escuela") {
        grupoDetalleAlcance.style.display = "none";
    } else {
        grupoDetalleAlcance.style.display = "block";
        labelDetalleAlcance.textContent = alcance === "profesor" ? "Correo del profesor" : "Salón (ej: 9°C)";
        inputDetalleAlcance.placeholder = alcance === "profesor" ? "correo@ejemplo.com" : "9°C";
    }
});

selectTipo.addEventListener("change", () => {
    grupoFranja.style.display = selectTipo.value === "dia_completo" ? "none" : "block";
});

// =========================================================
// CARGAR FRANJAS PARA EL SELECT
// =========================================================

let franjasCache = [];

async function cargarFranjasParaSelect() {
    const { data, error } = await supabase
        .from("franjas_horario")
        .select("id, hora_inicio, hora_fin, orden, es_recreo")
        .eq("es_recreo", false)
        .order("orden", { ascending: true });

    if (error) {
        selectFranja.innerHTML = `<option value="">Error al cargar franjas</option>`;
        return;
    }

    franjasCache = data || [];
    selectFranja.innerHTML = franjasCache
        .map((f) => `<option value="${f.id}">${formatearHora12(f.hora_inicio)} – ${formatearHora12(f.hora_fin)}</option>`)
        .join("");
}

// =========================================================
// GUARDAR NUEVA EXCEPCIÓN
// =========================================================

formExcepcion.addEventListener("submit", async (e) => {
    e.preventDefault();

    const fecha = inputFecha.value;
    const alcance = selectAlcance.value;
    const tipo = selectTipo.value;
    const motivo = inputMotivo.value.trim();

    if (!fecha || !motivo) {
        estadoExcepcion.textContent = "⚠️ Completa fecha y motivo.";
        estadoExcepcion.className = "small ms-2 text-warning";
        return;
    }

    const fila = {
        fecha,
        alcance,
        tipo,
        motivo,
        creado_por: correoAdmin,
        correo_profesor: null,
        salon: null,
        franja_id: null,
    };

    if (alcance === "profesor") {
        const correo = inputDetalleAlcance.value.trim().toLowerCase();
        if (!correo) {
            estadoExcepcion.textContent = "⚠️ Escribe el correo del profesor.";
            estadoExcepcion.className = "small ms-2 text-warning";
            return;
        }
        fila.correo_profesor = correo;
    } else if (alcance === "salon") {
        const salon = inputDetalleAlcance.value.trim();
        if (!salon) {
            estadoExcepcion.textContent = "⚠️ Escribe el salón.";
            estadoExcepcion.className = "small ms-2 text-warning";
            return;
        }
        fila.salon = salon;
    }

    if (tipo !== "dia_completo") {
        const franjaId = parseInt(selectFranja.value, 10);
        if (!franjaId) {
            estadoExcepcion.textContent = "⚠️ Selecciona la franja.";
            estadoExcepcion.className = "small ms-2 text-warning";
            return;
        }
        fila.franja_id = franjaId;
    }

    estadoExcepcion.textContent = "Guardando...";
    estadoExcepcion.className = "small ms-2 text-primary";

    const { error } = await supabase.from("excepciones_horario").insert([fila]);

    if (error) {
        estadoExcepcion.textContent = "❌ Error: " + error.message;
        estadoExcepcion.className = "small ms-2 text-danger";
        return;
    }

    estadoExcepcion.textContent = "✅ Excepción agregada.";
    estadoExcepcion.className = "small ms-2 text-success";
    formExcepcion.reset();
    grupoDetalleAlcance.style.display = "none";
    grupoFranja.style.display = "none";
    cargarListado();
});

// =========================================================
// LISTAR EXCEPCIONES EXISTENTES (desde hoy en adelante)
// =========================================================

function descripcionAlcance(fila) {
    if (fila.alcance === "escuela") return `<span class="badge bg-danger badge-alcance">Toda la escuela</span>`;
    if (fila.alcance === "profesor") return `<span class="badge bg-warning text-dark badge-alcance">Profesor: ${escapeHtml(fila.correo_profesor)}</span>`;
    return `<span class="badge bg-info text-dark badge-alcance">Salón: ${escapeHtml(fila.salon)}</span>`;
}

function descripcionTipo(fila) {
    const franja = franjasCache.find((f) => f.id === fila.franja_id);
    const horaTexto = franja ? `${formatearHora12(franja.hora_inicio)} – ${formatearHora12(franja.hora_fin)}` : "";

    if (fila.tipo === "dia_completo") return "Todo el día";
    if (fila.tipo === "desde_franja") return `Desde ${horaTexto} hasta el final del día`;
    return `Solo ${horaTexto}`;
}

async function cargarListado() {
    listadoExcepciones.innerHTML = "Cargando...";

    const hoyISO = new Date().toISOString().slice(0, 10);

    const { data, error } = await supabase
        .from("excepciones_horario")
        .select("id, fecha, alcance, correo_profesor, salon, tipo, franja_id, motivo")
        .gte("fecha", hoyISO)
        .order("fecha", { ascending: true });

    if (error) {
        listadoExcepciones.innerHTML = `<p class="text-danger">Error al cargar: ${escapeHtml(error.message)}</p>`;
        return;
    }

    if (!data || data.length === 0) {
        listadoExcepciones.innerHTML = `<p class="text-muted">No hay excepciones próximas.</p>`;
        return;
    }

    listadoExcepciones.innerHTML = data.map((fila) => {
        const fechaTexto = new Date(fila.fecha + "T00:00:00").toLocaleDateString("es-PA", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
        return `
        <div class="fila-excepcion">
            <div>
                <strong>${escapeHtml(fechaTexto)}</strong><br>
                ${descripcionAlcance(fila)} · ${escapeHtml(descripcionTipo(fila))}<br>
                <span class="text-muted small">${escapeHtml(fila.motivo)}</span>
            </div>
            <button type="button" class="btn btn-sm btn-outline-danger btn-eliminar-excepcion" data-id="${fila.id}">🗑 Eliminar</button>
        </div>`;
    }).join("");

    listadoExcepciones.querySelectorAll(".btn-eliminar-excepcion").forEach((btn) => {
        btn.addEventListener("click", async () => {
            if (!confirm("¿Eliminar esta excepción?")) return;
            const { error: errDel } = await supabase.from("excepciones_horario").delete().eq("id", btn.dataset.id);
            if (errDel) { alert("Error al eliminar: " + errDel.message); return; }
            cargarListado();
        });
    });
}

// =========================================================
// INICIO
// =========================================================

(async function init() {
    const ok = await verificarAdmin();
    if (!ok) return;

    await cargarFranjasParaSelect();
    await cargarListado();
})();
