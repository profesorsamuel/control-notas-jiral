import { supabase } from "./supabase.js";
import { pintarCambiarPanel } from "./roles.js";

// =========================================================
// Panel "Tarea en clase": muestra los resultados guardados por
// pages/ejercicios-ciencias-origen-universo.html (y cualquier otra
// actividad grupal que se agregue después con el mismo mecanismo)
// en la tabla actividades_clase_intentos (ver
// supabase/panel_actividades_clase.sql — hay que correr ese script
// una vez en Supabase antes de que este panel tenga datos).
//
// Cada fila de la tabla es UN GRUPO (no un estudiante), porque estas
// actividades se hacen en equipo y no piden cédula ni inicio de
// sesión individual. Por eso "quién falta" aquí es aproximado: se
// compara el nombre de cada estudiante del salón contra los nombres
// que el grupo escribió a mano — se avisa esto en la propia pantalla.
// =========================================================

const NOMBRES_ACTIVIDAD = {
    "cn9-clase1-actividad-origen-universo-2026": "9° · Clase 1 · Origen del universo y sistema solar",
};

function tituloActividad(codigo) {
    return NOMBRES_ACTIVIDAD[codigo] || codigo;
}

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function formatearFecha(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleString("es-PA", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    });
}

function fechaSoloDia(iso) {
    if (!iso) return null;
    return new Date(iso).toISOString().slice(0, 10);
}

// Quita tildes, pasa a minúsculas y deja solo letras/espacios —
// para poder comparar "Peñuel" con "penuel" o "María" con "maria".
function normalizarTexto(s) {
    return String(s ?? "")
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function tokensSignificativos(nombre) {
    return normalizarTexto(nombre).split(" ").filter((t) => t.length >= 3);
}

// =========================================================
// 1) VERIFICAR SESIÓN (mismo criterio que el resto del panel del docente)
// =========================================================
async function verificarSesion() {
    const { data: { user }, error: errUser } = await supabase.auth.getUser();

    if (errUser || !user) {
        window.location.href = "login.html";
        return false;
    }

    const correo = (user.email || "").trim().toLowerCase();

    const [{ data: perfil }, { data: consejeros }, { data: materias }] = await Promise.all([
        supabase.from("usuarios").select("rol").eq("auth_user_id", user.id).maybeSingle(),
        supabase.from("consejeros").select("correo").eq("correo", correo).maybeSingle(),
        supabase.from("profesor_materias").select("id").eq("correo_profesor", correo),
    ]);

    const esAdmin = !!(perfil && perfil.rol === "admin");
    const esConsejero = !!consejeros;
    const esProfesor = Array.isArray(materias) && materias.length > 0;

    if (!esAdmin && !esConsejero && !esProfesor) {
        alert("⛔ Esta cuenta no tiene acceso a este panel.");
        window.location.href = "login.html";
        return false;
    }

    return true;
}

// =========================================================
// 2) ESTADO GLOBAL
// =========================================================
let GRUPOS = [];       // una fila por grupo/intento
let ESTUDIANTES = [];  // roster de 9A/9B/9C, para "quién falta"
let SIN_TABLA = false;

let filtroActividad = "todas";
let filtroSalon = "todos";
let fechaDesde = "";
let fechaHasta = "";
let textoBusqueda = "";
let ordenActual = { campo: "fecha", asc: false };
let mostrarFaltan = false;

// =========================================================
// 3) CARGA DE DATOS
// =========================================================
async function cargarDatos() {
    const cargando = document.getElementById("tc-cargando");
    const error = document.getElementById("tc-error");
    const vacio = document.getElementById("tc-vacio");
    const resultados = document.getElementById("tc-resultados");

    cargando.hidden = false;
    error.hidden = true;
    vacio.hidden = true;
    resultados.hidden = true;

    const [intentosRes, estudiantesRes] = await Promise.all([
        supabase.from("actividades_clase_intentos").select("*").order("registrado_at", { ascending: false }),
        supabase.from("estudiantes").select("id,nombre,salon,cedula").in("salon", ["9A", "9B", "9C"]).order("nombre"),
    ]);

    cargando.hidden = true;
    ESTUDIANTES = estudiantesRes.data || [];

    if (intentosRes.error) {
        SIN_TABLA = true;
        error.hidden = false;
        error.innerHTML = `⚠️ Todavía no se ha ejecutado <code>supabase/panel_actividades_clase.sql</code> en Supabase (Project &gt; SQL Editor), así que esta tabla no existe aún y el panel no tiene nada que mostrar. Corre ese script una vez y recarga esta página.`;
        vacio.hidden = false;
        vacio.textContent = "Sin datos todavía.";
        return;
    }

    GRUPOS = (intentosRes.data || []).map((r) => ({
        id: r.id,
        codigo_examen: r.codigo_examen,
        salon: r.salon,
        integrantes: Array.isArray(r.integrantes) ? r.integrantes : [],
        nombre: r.nombre,
        cw: (r.crucigrama_total ?? 0) > 0 ? `${r.crucigrama_correctas}/${r.crucigrama_total}` : "—",
        pareo: (r.pareo_total ?? 0) > 0 ? `${r.pareo_correctas}/${r.pareo_total}` : "—",
        completar: (r.completar_total ?? 0) > 0 ? `${r.completar_correctas}/${r.completar_total}` : "—",
        nota: r.nota_meduca,
        fecha: r.finalizado_at || r.registrado_at,
    }));

    pintarFiltros();
    aplicarFiltrosYPintar();
}

// =========================================================
// 4) FILTROS (chips + fechas + texto)
// =========================================================
function pintarFiltros() {
    const actividadesPresentes = [...new Set(GRUPOS.map((g) => g.codigo_examen))];
    const salonesPresentes = [...new Set(GRUPOS.map((g) => g.salon))].filter(Boolean).sort();

    const contActividad = document.getElementById("tc-filtro-actividad");
    contActividad.innerHTML = ["todas", ...actividadesPresentes].map((c) => {
        const etiqueta = c === "todas" ? "Todas" : tituloActividad(c);
        const activa = filtroActividad === c ? "chip-activa" : "";
        return `<span class="chip-opcion ${activa}" data-valor="${escapeHtml(c)}">${escapeHtml(etiqueta)}</span>`;
    }).join("");
    contActividad.querySelectorAll(".chip-opcion").forEach((chip) => {
        chip.addEventListener("click", () => {
            filtroActividad = chip.dataset.valor;
            mostrarFaltan = false;
            pintarFiltros();
            aplicarFiltrosYPintar();
        });
    });

    const contSalon = document.getElementById("tc-filtro-salon");
    contSalon.innerHTML = ["todos", ...salonesPresentes].map((s) => {
        const etiqueta = s === "todos" ? "Todos" : s;
        const activa = filtroSalon === s ? "chip-activa" : "";
        return `<span class="chip-opcion ${activa}" data-valor="${escapeHtml(s)}">${escapeHtml(etiqueta)}</span>`;
    }).join("");
    contSalon.querySelectorAll(".chip-opcion").forEach((chip) => {
        chip.addEventListener("click", () => {
            filtroSalon = chip.dataset.valor;
            mostrarFaltan = false;
            pintarFiltros();
            aplicarFiltrosYPintar();
        });
    });
}

document.getElementById("tc-buscar").addEventListener("input", (e) => {
    textoBusqueda = normalizarTexto(e.target.value);
    aplicarFiltrosYPintar();
});
document.getElementById("tc-fecha-desde").addEventListener("change", (e) => {
    fechaDesde = e.target.value;
    aplicarFiltrosYPintar();
});
document.getElementById("tc-fecha-hasta").addEventListener("change", (e) => {
    fechaHasta = e.target.value;
    aplicarFiltrosYPintar();
});
document.getElementById("tc-fecha-limpiar").addEventListener("click", () => {
    fechaDesde = ""; fechaHasta = "";
    document.getElementById("tc-fecha-desde").value = "";
    document.getElementById("tc-fecha-hasta").value = "";
    aplicarFiltrosYPintar();
});

// =========================================================
// 5) APLICAR FILTROS + ORDEN + PINTAR TABLA
// =========================================================
function gruposFiltrados() {
    return GRUPOS.filter((g) => {
        if (filtroActividad !== "todas" && g.codigo_examen !== filtroActividad) return false;
        if (filtroSalon !== "todos" && g.salon !== filtroSalon) return false;
        if (fechaDesde && fechaSoloDia(g.fecha) < fechaDesde) return false;
        if (fechaHasta && fechaSoloDia(g.fecha) > fechaHasta) return false;
        if (textoBusqueda) {
            const haystack = normalizarTexto((g.integrantes || []).join(" ") + " " + (g.nombre || ""));
            if (!haystack.includes(textoBusqueda)) return false;
        }
        return true;
    });
}

function aplicarFiltrosYPintar() {
    let filas = gruposFiltrados();

    filas.sort((a, b) => {
        const campo = ordenActual.campo;
        let va = a[campo]; let vb = b[campo];
        if (campo === "actividad") { va = tituloActividad(a.codigo_examen); vb = tituloActividad(b.codigo_examen); }
        if (va === null || va === undefined) va = "";
        if (vb === null || vb === undefined) vb = "";
        if (typeof va === "string") va = va.toLowerCase();
        if (typeof vb === "string") vb = vb.toLowerCase();
        if (va < vb) return ordenActual.asc ? -1 : 1;
        if (va > vb) return ordenActual.asc ? 1 : -1;
        return 0;
    });

    const vacio = document.getElementById("tc-vacio");
    const resultados = document.getElementById("tc-resultados");

    if (filas.length === 0) {
        vacio.hidden = false;
        resultados.hidden = true;
        return;
    }

    vacio.hidden = true;
    resultados.hidden = false;

    pintarResumen(filas);
    pintarFaltan(filas);

    const tbody = document.getElementById("tc-tbody");
    tbody.innerHTML = filas.map((g) => {
        const nota = g.nota !== null && g.nota !== undefined ? Number(g.nota).toFixed(1) : "—";
        const claseNota = (g.nota !== null && g.nota !== undefined && Number(g.nota) < 3) ? "nota-baja" : "nota-alta";
        const chipsIntegrantes = (g.integrantes || []).map((n) => `<span class="tc-integrante-chip">${escapeHtml(n)}</span>`).join("") || "—";
        return `
            <tr>
                <td>${formatearFecha(g.fecha)}</td>
                <td>${escapeHtml(g.salon || "—")}</td>
                <td>${escapeHtml(tituloActividad(g.codigo_examen))}</td>
                <td><div class="tc-integrantes-lista">${chipsIntegrantes}</div></td>
                <td>${escapeHtml(g.cw)}</td>
                <td>${escapeHtml(g.pareo)}</td>
                <td>${escapeHtml(g.completar)}</td>
                <td class="${claseNota}">${nota}</td>
            </tr>
        `;
    }).join("");
}

function pintarResumen(filas) {
    const totalGrupos = filas.length;
    const totalEstudiantes = filas.reduce((s, g) => s + (g.integrantes?.length || 0), 0);
    const conNota = filas.filter((g) => g.nota !== null && g.nota !== undefined);
    const promedio = conNota.length
        ? (conNota.reduce((s, g) => s + Number(g.nota), 0) / conNota.length).toFixed(1)
        : "—";
    const bajoTres = conNota.filter((g) => Number(g.nota) < 3).length;

    document.getElementById("tc-resumen").innerHTML = `
        <div class="tc-resumen-item">Grupos registrados<b>${totalGrupos}</b></div>
        <div class="tc-resumen-item">Estudiantes cubiertos<b>${totalEstudiantes}</b></div>
        <div class="tc-resumen-item">Promedio<b>${promedio}</b></div>
        <div class="tc-resumen-item">Grupos con nota &lt; 3.0<b>${bajoTres}</b></div>
    `;
}

// =========================================================
// 6) QUIÉN FALTA (aproximado por nombre — solo con una actividad elegida)
// =========================================================
function pintarFaltan(filasVisibles) {
    const cont = document.getElementById("tc-faltan-cont");
    const toggle = document.getElementById("tc-faltan-toggle");
    const lista = document.getElementById("tc-faltan-lista");
    const aviso = document.getElementById("tc-faltan-aviso");

    if (filtroActividad === "todas") {
        cont.hidden = true;
        return;
    }

    const roster = ESTUDIANTES.filter((e) => filtroSalon === "todos" || e.salon === filtroSalon);

    // "Pajar" de nombres escritos a mano en todos los grupos visibles
    // (ya filtrados por actividad/salón/fecha) de esta actividad.
    const haystack = normalizarTexto(
        filasVisibles.flatMap((g) => g.integrantes || []).join(" ")
    );

    const faltan = roster.filter((e) => {
        const tokens = tokensSignificativos(e.nombre);
        if (tokens.length === 0) return false;
        const coincidencias = tokens.filter((t) => haystack.includes(t)).length;
        const necesarias = tokens.length === 1 ? 1 : 2;
        return coincidencias < necesarias; // "falta" si no hay suficiente coincidencia
    });

    cont.hidden = false;
    toggle.textContent = mostrarFaltan
        ? `🙈 Ocultar (${faltan.length})`
        : `👀 Mostrar quién no aparece en ningún grupo todavía (${faltan.length})`;
    lista.hidden = !mostrarFaltan;
    aviso.hidden = !mostrarFaltan;
    lista.innerHTML = faltan.map((e) => `<span class="tc-faltan-chip">${escapeHtml(e.nombre)} · ${escapeHtml(e.salon)}</span>`).join("")
        || `<span class="tc-faltan-chip">🎉 Todos en este salón aparecen en algún grupo.</span>`;

    toggle.onclick = () => {
        mostrarFaltan = !mostrarFaltan;
        pintarFaltan(filasVisibles);
    };
}

// =========================================================
// 7) ORDEN AL HACER CLIC EN ENCABEZADOS
// =========================================================
document.querySelectorAll("table.tc-tabla th[data-orden]").forEach((th) => {
    th.addEventListener("click", () => {
        const campo = th.dataset.orden;
        if (ordenActual.campo === campo) {
            ordenActual.asc = !ordenActual.asc;
        } else {
            ordenActual = { campo, asc: true };
        }
        aplicarFiltrosYPintar();
    });
});

// =========================================================
// 8) ARRANQUE
// =========================================================
(async function init() {
    const ok = await verificarSesion();
    if (!ok) return;
    pintarCambiarPanel("profesor", "claro-sobre-oscuro");
    await cargarDatos();
    if (!SIN_TABLA) setInterval(cargarDatos, 30000);
})();
