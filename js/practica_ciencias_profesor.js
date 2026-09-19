import { supabase } from "./supabase.js";
import { pintarCambiarPanel } from "./roles.js";

// =========================================================
// Panel "Tareas en clase": muestra los resultados guardados por las
// actividades grupales que se hacen EN CLASE (crucigrama + pareo +
// completar), es decir:
//   - pages/practica_ciencias_8.html          (8°, Clases 1 a 4)
//   - pages/ejercicios-ciencias-origen-universo.html (9°, Clase 1)
// Todos guardan en la tabla actividades_clase_intentos (ver
// supabase/panel_actividades_clase.sql — hay que correr ese script
// una vez en Supabase antes de que este panel tenga datos).
//
// Es el compañero del panel "Tareas en casa" (tareas_practica_profesor
// .html), que muestra los ejercicios individuales (opción múltiple,
// pareo de términos, pareo de fotos). Aquí NO se mezclan: este panel
// es SOLO para las tareas hechas en clase.
//
// Cada fila de la tabla es UN GRUPO (no un estudiante), porque estas
// actividades se hacen en equipo y no piden cédula ni inicio de
// sesión individual. Si un grupo repite la actividad, se conserva la
// NOTA MÁS ALTA (igual criterio que pediste para las prácticas).
// =========================================================

const NOMBRES_ACTIVIDAD = {
    "cn9-clase1-actividad-origen-universo-2026": "9° · Clase 1 · Origen del universo y sistema solar",
    "cn9-clase1-actividad-2026": "9° · Clase 1 · Origen del universo y sistema solar",
    "cn8a-clase1-actividad-2026": "8° · Clase 1 · Transformaciones y reacciones químicas",
    "cn8a-clase2-actividad-2026": "8° · Clase 2 · Leyes de Kepler y movimientos de la Tierra",
    "cn8a-clase3-actividad-2026": "8° · Clase 3 · Inclinación terrestre, vida y exploración del universo",
    "cn8a-clase4-actividad-2026": "8° · Clase 4 · Tecnología e historia de la exploración espacial",
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

function fechaDe(r) {
    return r.finalizado_at || r.registrado_at || null;
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
let GRUPOS = [];       // una fila por grupo (con su mejor intento)
let ESTUDIANTES = [];  // roster de 8A/9A/9B/9C, para "quién falta"
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
    const cargando = document.getElementById("pcp-cargando");
    const error = document.getElementById("pcp-error");
    const vacio = document.getElementById("pcp-vacio");
    const resultados = document.getElementById("pcp-resultados");

    cargando.hidden = false;
    error.hidden = true;
    vacio.hidden = true;
    resultados.hidden = true;

    const [intentosRes, estudiantesRes] = await Promise.all([
        supabase.from("actividades_clase_intentos").select("*").order("registrado_at", { ascending: false }),
        supabase.from("estudiantes").select("id,nombre,salon,cedula").in("salon", ["8A", "9A", "9B", "9C"]).order("nombre"),
    ]);

    cargando.hidden = true;
    ESTUDIANTES = estudiantesRes.data || [];

    if (intentosRes.error) {
        SIN_TABLA = true;
        error.hidden = false;
        error.innerHTML = `⚠️ <b>Aún no aparece nada porque falta un paso en Supabase.</b><br>
            Hay que ejecutar <b>una sola vez</b> el archivo <code>supabase/panel_actividades_clase.sql</code>
            en Supabase (Project &gt; SQL Editor). Ese script crea la tabla donde se guardan las prácticas en
            clase. Después de correrlo, recarga esta página. <br>
            <span style="opacity:.8; font-size:11.5px;">(Detalle técnico: ${escapeHtml(intentosRes.error.message || "la tabla actividades_clase_intentos no existe o no es accesible todavía")}.)</span>`;
        vacio.hidden = true;
        return;
    }

    construirGrupos(intentosRes.data || []);
    pintarFiltros();
    aplicarFiltrosYPintar();
}

// Agrupa por actividad + salón + integrantes + FECHA. Cada día conserva
// su propia nota. Si el mismo grupo repite el mismo día, se conserva la
// nota más alta de ese día (si empatan, el intento más reciente).
function construirGrupos(filas) {
    const mapa = new Map();
    const claveDe = (r) =>
        `${r.codigo_examen}|${r.salon || ""}|${normalizarTexto((r.integrantes || []).join(","))}|${fechaSoloDia(fechaDe(r)) || ""}`;

    for (const r of filas) {
        const clave = claveDe(r);
        if (!mapa.has(clave)) mapa.set(clave, []);
        mapa.get(clave).push(r);
    }

    GRUPOS = Array.from(mapa.values()).map((intentos) => {
        const mejor = intentos.reduce((a, b) => {
            const na = Number(a.nota_meduca ?? -1);
            const nb = Number(b.nota_meduca ?? -1);
            if (nb > na) return b;
            if (nb < na) return a;
            return (new Date(fechaDe(b)) >= new Date(fechaDe(a)) ? b : a);
        });
        const r = mejor;
        return {
            codigo_examen: r.codigo_examen,
            salon: r.salon,
            integrantes: Array.isArray(r.integrantes) ? r.integrantes : [],
            nombre: r.nombre,
            cw: (r.crucigrama_total ?? 0) > 0 ? `${r.crucigrama_correctas}/${r.crucigrama_total}` : "—",
            pareo: (r.pareo_total ?? 0) > 0 ? `${r.pareo_correctas}/${r.pareo_total}` : "—",
            completar: (r.completar_total ?? 0) > 0 ? `${r.completar_correctas}/${r.completar_total}` : "—",
            nota: r.nota_meduca,
            fecha: fechaDe(r),
            veces: intentos.length,
        };
    });
}

// =========================================================
// 4) FILTROS (chips + fechas + texto)
// =========================================================
function pintarFiltros() {
    const actividadesPresentes = [...new Set(GRUPOS.map((g) => g.codigo_examen))];
    const salonesPresentes = [...new Set(GRUPOS.map((g) => g.salon))].filter(Boolean).sort();

    const contActividad = document.getElementById("pcp-filtro-actividad");
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

    const contSalon = document.getElementById("pcp-filtro-salon");
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

document.getElementById("pcp-buscar").addEventListener("input", (e) => {
    textoBusqueda = normalizarTexto(e.target.value);
    aplicarFiltrosYPintar();
});
document.getElementById("pcp-fecha-desde").addEventListener("change", (e) => {
    fechaDesde = e.target.value;
    aplicarFiltrosYPintar();
});
document.getElementById("pcp-fecha-hasta").addEventListener("change", (e) => {
    fechaHasta = e.target.value;
    aplicarFiltrosYPintar();
});
document.getElementById("pcp-fecha-limpiar").addEventListener("click", () => {
    fechaDesde = ""; fechaHasta = "";
    document.getElementById("pcp-fecha-desde").value = "";
    document.getElementById("pcp-fecha-hasta").value = "";
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

    const vacio = document.getElementById("pcp-vacio");
    const resultados = document.getElementById("pcp-resultados");

    if (filas.length === 0) {
        vacio.hidden = false;
        resultados.hidden = true;
        return;
    }

    vacio.hidden = true;
    resultados.hidden = false;

    pintarResumen(filas);
    pintarFaltan(filas);

    // Vista tipo libreta: una fila por estudiante y una columna por fecha.
    // Las fechas van de la más antigua a la más reciente.
    const fechas = [...new Set(filas.map(g => fechaSoloDia(g.fecha)).filter(Boolean))].sort();
    const porEstudiante = new Map();
    for (const g of filas) {
        for (const nombre of (g.integrantes || [])) {
            const key = `${g.salon || ""}|${normalizarTexto(nombre)}`;
            if (!porEstudiante.has(key)) porEstudiante.set(key, { nombre, salon:g.salon || "—", celdas:new Map() });
            const est = porEstudiante.get(key);
            const dia = fechaSoloDia(g.fecha);
            if (!dia) continue;
            if (!est.celdas.has(dia)) est.celdas.set(dia, []);
            est.celdas.get(dia).push(g);
        }
    }

    const thead = document.querySelector("table.pcp-tabla thead");
    thead.innerHTML = `<tr><th class="pcp-sticky-col">Estudiante</th><th>Salón</th>${fechas.map(f=>{
        const [y,m,d]=f.split("-"); return `<th title="${d}/${m}/${y}">${d}/${m}</th>`;
    }).join("")}</tr>`;

    const tbody = document.getElementById("pcp-tbody");
    const estudiantes = [...porEstudiante.values()].sort((a,b)=>
        a.salon.localeCompare(b.salon, "es") || a.nombre.localeCompare(b.nombre, "es")
    );
    tbody.innerHTML = estudiantes.map(est => `
        <tr>
            <td class="pcp-sticky-col"><b>${escapeHtml(est.nombre)}</b></td>
            <td>${escapeHtml(est.salon)}</td>
            ${fechas.map(dia => {
                const regs = est.celdas.get(dia) || [];
                if (!regs.length) return `<td class="pcp-sin-nota">—</td>`;
                return `<td>${regs.map(g=>{
                    const nota = g.nota != null ? Number(g.nota).toFixed(1) : "—";
                    const cls = g.nota != null && Number(g.nota) < 3 ? "nota-baja" : "nota-alta";
                    return `<span class="pcp-nota-fecha ${cls}" title="${escapeHtml(tituloActividad(g.codigo_examen))} · ${formatearFecha(g.fecha)} · ${g.veces} intento(s)">${nota}</span>`;
                }).join(" ")}</td>`;
            }).join("")}
        </tr>`
    ).join("");
}

function pintarResumen(filas) {
    const totalGrupos = filas.length;
    const totalEstudiantes = filas.reduce((s, g) => s + (g.integrantes?.length || 0), 0);
    const conNota = filas.filter((g) => g.nota !== null && g.nota !== undefined);
    const promedio = conNota.length
        ? (conNota.reduce((s, g) => s + Number(g.nota), 0) / conNota.length).toFixed(1)
        : "—";
    const bajoTres = conNota.filter((g) => Number(g.nota) < 3).length;

    document.getElementById("pcp-resumen").innerHTML = `
        <div class="pcp-resumen-item">Grupos registrados<b>${totalGrupos}</b></div>
        <div class="pcp-resumen-item">Estudiantes cubiertos<b>${totalEstudiantes}</b></div>
        <div class="pcp-resumen-item">Promedio (mejor de cada grupo)<b>${promedio}</b></div>
        <div class="pcp-resumen-item">Grupos con nota &lt; 3.0<b>${bajoTres}</b></div>
    `;
}

// =========================================================
// 6) QUIÉN FALTA (aproximado por nombre — solo con una actividad elegida)
// =========================================================
function pintarFaltan(filasVisibles) {
    const cont = document.getElementById("pcp-faltan-cont");
    const toggle = document.getElementById("pcp-faltan-toggle");
    const lista = document.getElementById("pcp-faltan-lista");
    const aviso = document.getElementById("pcp-faltan-aviso");

    if (filtroActividad === "todas") {
        cont.hidden = true;
        return;
    }

    const roster = ESTUDIANTES.filter((e) => filtroSalon === "todos" || e.salon === filtroSalon);

    const haystack = normalizarTexto(
        filasVisibles.flatMap((g) => g.integrantes || []).join(" ")
    );

    const faltan = roster.filter((e) => {
        const tokens = tokensSignificativos(e.nombre);
        if (tokens.length === 0) return false;
        const coincidencias = tokens.filter((t) => haystack.includes(t)).length;
        const necesarias = tokens.length === 1 ? 1 : 2;
        return coincidencias < necesarias;
    });

    cont.hidden = false;
    toggle.textContent = mostrarFaltan
        ? `🙈 Ocultar (${faltan.length})`
        : `👀 Mostrar quién no aparece en ningún grupo todavía (${faltan.length})`;
    lista.hidden = !mostrarFaltan;
    aviso.hidden = !mostrarFaltan;
    lista.innerHTML = faltan.map((e) => `<span class="pcp-faltan-chip">${escapeHtml(e.nombre)} · ${escapeHtml(e.salon)}</span>`).join("")
        || `<span class="pcp-faltan-chip">🎉 Todos en este salón aparecen en algún grupo.</span>`;

    toggle.onclick = () => {
        mostrarFaltan = !mostrarFaltan;
        pintarFaltan(filasVisibles);
    };
}

// =========================================================
// 7) ORDEN AL HACER CLIC EN ENCABEZADOS
// =========================================================
document.querySelectorAll("table.pcp-tabla th[data-orden]").forEach((th) => {
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
