import { supabase } from "./supabase.js";
import { pintarCambiarPanel } from "./roles.js";

// =========================================================
// Este panel es NUEVO y no toca "practica_ciencias_profesor.js"
// (el panel viejo sigue funcionando exactamente igual). Lee de dos
// tablas nuevas (historial_intentos_practica y presencia_practica)
// creadas por supabase/panel_tareas_practica.sql — si ese script
// no se ha corrido todavía, este panel lo avisa con un mensaje claro
// en vez de fallar en silencio.
// =========================================================

// 0) Nombres legibles de cada clase (cubre 8° y 9°; si en el futuro
// se agrega una clase o salón nuevo, solo hay que sumar una línea).
const NOMBRES_CLASE = {
    "cn9-clase1-universo-2026": "9° · Clase 1 · Origen del universo y sistema solar",
    "cn9-clase2-vida-tierra-2026": "9° · Clase 2 · La vida en la Tierra y la exploración del universo",
    "cn9-clase3-ondas-2026": "9° · Clase 3 · El movimiento ondulatorio",
    "cn8a-clase1-2026": "8° · Clase 1 · Transformaciones y reacciones químicas",
    "cn8a-clase2-2026": "8° · Clase 2 · Leyes de Kepler y movimientos de la Tierra",
    "cn8a-clase3-2026": "8° · Clase 3 · Inclinación terrestre, vida y exploración del universo",
    "cn8a-clase4-2026": "8° · Clase 4 · Tecnología e historia de la exploración espacial",
    "cn8a-recuperacion-2026": "8° · Recuperación (versión anterior)",
};

const NOMBRES_TIPO = {
    quiz: "Opción múltiple",
    pareo: "Pareo de términos",
    fotos: "Pareo de fotos",
};

const SEGUNDOS_PARA_CONSIDERARSE_VIVO = 90; // debe ser mayor al intervalo de aviso (20 s) de los ejercicios

function gradoDeClase(codigo) {
    if (!codigo) return "—";
    if (codigo.startsWith("cn8")) return "8°";
    if (codigo.startsWith("cn9")) return "9°";
    return "—";
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

function normalizarCedula(c) {
    return String(c ?? "").trim().toLowerCase().replace(/[\s-]/g, "");
}

// =========================================================
// 1) VERIFICAR SESIÓN (mismo criterio que profesor.js y que el
// panel viejo de prácticas)
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
let FILAS = [];               // una fila por estudiante + clase + tipo de ejercicio
let ESTUDIANTES = [];         // roster completo (para "quién falta")
let SIN_TABLAS_NUEVAS = false; // true si el script SQL aún no se ha corrido

let filtroGrado = "todos";
let filtroClase = "todas";
let filtroTipo = "todos";
let filtroSalon = "todos";
let filtroEstado = "todos";
let textoBusqueda = "";
let ordenActual = { campo: "fecha", asc: false };
let filaExpandidaId = null;
let mostrarFaltan = false;

// =========================================================
// 3) CARGA DE DATOS
// =========================================================
async function cargarDatos() {
    const cargando = document.getElementById("tp-cargando");
    const error = document.getElementById("tp-error");
    const vacio = document.getElementById("tp-vacio");
    const resultados = document.getElementById("tp-resultados");

    cargando.hidden = false;
    error.hidden = true;
    vacio.hidden = true;
    resultados.hidden = true;

    const [historialRes, presenciaRes, estudiantesRes] = await Promise.all([
        supabase.from("historial_intentos_practica").select("*").order("registrado_at", { ascending: true }),
        supabase.from("presencia_practica").select("*"),
        supabase.from("estudiantes").select("id,nombre,salon,cedula").order("nombre"),
    ]);

    cargando.hidden = true;

    ESTUDIANTES = estudiantesRes.data || [];

    let historial = historialRes.data;
    if (historialRes.error) {
        // La tabla nueva de historial todavía no existe: avisamos con
        // claridad en vez de dejar el panel en blanco, y seguimos
        // funcionando con la tabla vieja (solo último intento de cada
        // quien) para que el panel no quede totalmente vacío.
        SIN_TABLAS_NUEVAS = true;
        const fallback = await supabase.from("prueba_intentos_practica").select("*");
        historial = (fallback.data || []).map((r) => ({ ...r, registrado_at: r.finalizado_at }));
    }

    const presencia = presenciaRes.error ? [] : (presenciaRes.data || []);

    construirFilas(historial || [], presencia);
    pintarFiltros();
    aplicarFiltrosYPintar();
    pintarEnVivo();

    if (SIN_TABLAS_NUEVAS) {
        error.hidden = false;
        error.innerHTML = `⚠️ Aún no se ha ejecutado <code>supabase/panel_tareas_practica.sql</code> en Supabase, así que este panel solo puede mostrar el último intento de cada quien (sin historial completo ni "en vivo"). Corre ese script una vez y recarga esta página.`;
    }
}

function construirFilas(historial, presencia) {
    const mapa = new Map(); // clave: cedula|codigo_examen|tipo_ejercicio

    const claveDe = (r) => `${normalizarCedula(r.cedula)}|${r.codigo_examen}|${r.tipo_ejercicio || "quiz"}`;

    for (const intento of historial) {
        const clave = claveDe(intento);
        if (!mapa.has(clave)) {
            mapa.set(clave, {
                cedula: intento.cedula, nombre: intento.nombre, salon: intento.salon,
                codigo_examen: intento.codigo_examen, tipo_ejercicio: intento.tipo_ejercicio || "quiz",
                intentos: [], presencia: null,
            });
        }
        mapa.get(clave).intentos.push(intento);
    }

    for (const p of presencia) {
        const clave = claveDe(p);
        if (!mapa.has(clave)) {
            mapa.set(clave, {
                cedula: p.cedula, nombre: p.nombre, salon: p.salon,
                codigo_examen: p.codigo_examen, tipo_ejercicio: p.tipo_ejercicio || "quiz",
                intentos: [], presencia: null,
            });
        }
        mapa.get(clave).presencia = p;
    }

    const ahora = Date.now();
    FILAS = Array.from(mapa.values()).map((f) => {
        const ultimo = f.intentos.length ? f.intentos[f.intentos.length - 1] : null;
        let estado = "completo";
        if (f.presencia && f.presencia.estado === "en_progreso") {
            const segundos = (ahora - new Date(f.presencia.ultima_actividad_at).getTime()) / 1000;
            estado = segundos <= SEGUNDOS_PARA_CONSIDERARSE_VIVO ? "vivo" : "abandonado";
        } else if (!ultimo) {
            estado = "sin_datos";
        }
        return {
            ...f,
            nombre: ultimo?.nombre || f.presencia?.nombre || f.nombre,
            salon: ultimo?.salon || f.presencia?.salon || f.salon,
            veces: f.intentos.length,
            nota_meduca: ultimo ? ultimo.nota_meduca : null,
            fecha: ultimo ? (ultimo.finalizado_at || ultimo.registrado_at) : (f.presencia?.ultima_actividad_at || null),
            estado,
        };
    });
}

// =========================================================
// 4) FILTROS (chips)
// =========================================================
function pintarFiltros() {
    const clasesPresentes = [...new Set(FILAS.map((f) => f.codigo_examen))];
    const tiposPresentes = [...new Set(FILAS.map((f) => f.tipo_ejercicio))];
    const salonesPresentes = [...new Set(FILAS.map((f) => f.salon))].filter(Boolean).sort();

    const gradosPresentes = [...new Set(clasesPresentes.map(gradoDeClase))].sort();
    const contGrado = document.getElementById("tp-filtro-grado");
    contGrado.innerHTML = ["todos", ...gradosPresentes].map((g) => {
        const etiqueta = g === "todos" ? "Todos" : g;
        const activa = filtroGrado === g ? "chip-activa" : "";
        return `<span class="chip-opcion ${activa}" data-valor="${escapeHtml(g)}">${escapeHtml(etiqueta)}</span>`;
    }).join("");
    contGrado.querySelectorAll(".chip-opcion").forEach((chip) => {
        chip.addEventListener("click", () => {
            filtroGrado = chip.dataset.valor;
            filtroClase = "todas";
            pintarFiltros();
            aplicarFiltrosYPintar();
        });
    });

    const clasesFiltradasPorGrado = filtroGrado === "todos"
        ? clasesPresentes
        : clasesPresentes.filter((c) => gradoDeClase(c) === filtroGrado);

    const contClase = document.getElementById("tp-filtro-clase");
    contClase.innerHTML = ["todas", ...clasesFiltradasPorGrado].map((c) => {
        const etiqueta = c === "todas" ? "Todas" : (NOMBRES_CLASE[c] || c);
        const activa = filtroClase === c ? "chip-activa" : "";
        return `<span class="chip-opcion ${activa}" data-valor="${escapeHtml(c)}">${escapeHtml(etiqueta)}</span>`;
    }).join("");
    contClase.querySelectorAll(".chip-opcion").forEach((chip) => {
        chip.addEventListener("click", () => {
            filtroClase = chip.dataset.valor;
            mostrarFaltan = false;
            pintarFiltros();
            aplicarFiltrosYPintar();
        });
    });

    const contTipo = document.getElementById("tp-filtro-tipo");
    contTipo.innerHTML = ["todos", ...tiposPresentes].map((t) => {
        const etiqueta = t === "todos" ? "Todos" : (NOMBRES_TIPO[t] || t);
        const activa = filtroTipo === t ? "chip-activa" : "";
        return `<span class="chip-opcion ${activa}" data-valor="${escapeHtml(t)}">${escapeHtml(etiqueta)}</span>`;
    }).join("");
    contTipo.querySelectorAll(".chip-opcion").forEach((chip) => {
        chip.addEventListener("click", () => {
            filtroTipo = chip.dataset.valor;
            mostrarFaltan = false;
            pintarFiltros();
            aplicarFiltrosYPintar();
        });
    });

    const contSalon = document.getElementById("tp-filtro-salon");
    contSalon.innerHTML = ["todos", ...salonesPresentes].map((s) => {
        const etiqueta = s === "todos" ? "Todos" : s;
        const activa = filtroSalon === s ? "chip-activa" : "";
        return `<span class="chip-opcion ${activa}" data-valor="${escapeHtml(s)}">${escapeHtml(etiqueta)}</span>`;
    }).join("");
    contSalon.querySelectorAll(".chip-opcion").forEach((chip) => {
        chip.addEventListener("click", () => {
            filtroSalon = chip.dataset.valor;
            pintarFiltros();
            aplicarFiltrosYPintar();
        });
    });

    const ESTADOS = [
        ["todos", "Todos"],
        ["vivo", "🟢 En vivo ahora"],
        ["abandonado", "⏳ Empezó sin terminar"],
        ["completo", "✅ Completado"],
    ];
    const contEstado = document.getElementById("tp-filtro-estado");
    contEstado.innerHTML = ESTADOS.map(([valor, etiqueta]) => {
        const activa = filtroEstado === valor ? "chip-activa" : "";
        return `<span class="chip-opcion ${activa}" data-valor="${escapeHtml(valor)}">${escapeHtml(etiqueta)}</span>`;
    }).join("");
    contEstado.querySelectorAll(".chip-opcion").forEach((chip) => {
        chip.addEventListener("click", () => {
            filtroEstado = chip.dataset.valor;
            pintarFiltros();
            aplicarFiltrosYPintar();
        });
    });
}

document.getElementById("tp-buscar").addEventListener("input", (e) => {
    textoBusqueda = e.target.value.trim().toLowerCase();
    aplicarFiltrosYPintar();
});

// =========================================================
// 5) APLICAR FILTROS + ORDEN + PINTAR TABLA
// =========================================================
function filasFiltradas() {
    return FILAS.filter((f) => {
        if (filtroGrado !== "todos" && gradoDeClase(f.codigo_examen) !== filtroGrado) return false;
        if (filtroClase !== "todas" && f.codigo_examen !== filtroClase) return false;
        if (filtroTipo !== "todos" && f.tipo_ejercicio !== filtroTipo) return false;
        if (filtroSalon !== "todos" && f.salon !== filtroSalon) return false;
        if (filtroEstado !== "todos" && f.estado !== filtroEstado) return false;
        if (textoBusqueda && !String(f.nombre || "").toLowerCase().includes(textoBusqueda)) return false;
        return true;
    });
}

function aplicarFiltrosYPintar() {
    let filas = filasFiltradas();

    filas.sort((a, b) => {
        const campo = ordenActual.campo;
        let va = a[campo];
        let vb = b[campo];
        if (campo === "grado") { va = gradoDeClase(a.codigo_examen); vb = gradoDeClase(b.codigo_examen); }
        if (campo === "clase") { va = NOMBRES_CLASE[a.codigo_examen] || a.codigo_examen; vb = NOMBRES_CLASE[b.codigo_examen] || b.codigo_examen; }
        if (campo === "tipo") { va = NOMBRES_TIPO[a.tipo_ejercicio] || a.tipo_ejercicio; vb = NOMBRES_TIPO[b.tipo_ejercicio] || b.tipo_ejercicio; }
        if (va === null || va === undefined) va = "";
        if (vb === null || vb === undefined) vb = "";
        if (typeof va === "string") va = va.toLowerCase();
        if (typeof vb === "string") vb = vb.toLowerCase();
        if (va < vb) return ordenActual.asc ? -1 : 1;
        if (va > vb) return ordenActual.asc ? 1 : -1;
        return 0;
    });

    const vacio = document.getElementById("tp-vacio");
    const resultados = document.getElementById("tp-resultados");

    if (filas.length === 0) {
        vacio.hidden = false;
        resultados.hidden = true;
        return;
    }

    vacio.hidden = true;
    resultados.hidden = false;

    pintarResumen(filas);
    pintarFaltan();

    const tbody = document.getElementById("tp-tbody");
    tbody.innerHTML = filas.map((f, i) => {
        const claveFila = `${f.cedula}|${f.codigo_examen}|${f.tipo_ejercicio}`;
        const claseBadgeTipo = `badge-tipo-${f.tipo_ejercicio}`;
        const nota = f.nota_meduca !== null && f.nota_meduca !== undefined ? Number(f.nota_meduca).toFixed(1) : "—";
        const claseNota = (f.nota_meduca !== null && f.nota_meduca < 3) ? "nota-baja" : "nota-alta";
        const ESTADO_LABEL = {
            vivo: `<span class="badge badge-estado-vivo">🟢 En vivo ahora</span>`,
            abandonado: `<span class="badge badge-estado-abandonado">⏳ Empezó sin terminar</span>`,
            completo: `<span class="badge badge-estado-completo">✅ Completado</span>`,
            sin_datos: `<span class="badge badge-estado-sin">—</span>`,
        };
        const filaHtml = `
            <tr data-clave="${escapeHtml(claveFila)}" class="tp-fila-clic ${filaExpandidaId === claveFila ? "tp-fila-expandida" : ""}">
                <td>${escapeHtml(f.nombre)}</td>
                <td>${escapeHtml(f.salon)}</td>
                <td>${escapeHtml(gradoDeClase(f.codigo_examen))}</td>
                <td>${escapeHtml(NOMBRES_CLASE[f.codigo_examen] || f.codigo_examen)}</td>
                <td><span class="badge ${claseBadgeTipo}">${escapeHtml(NOMBRES_TIPO[f.tipo_ejercicio] || f.tipo_ejercicio)}</span></td>
                <td class="${claseNota}">${nota}</td>
                <td>${f.veces}</td>
                <td>${ESTADO_LABEL[f.estado] || "—"}</td>
                <td>${formatearFecha(f.fecha)}</td>
            </tr>
        `;
        if (filaExpandidaId !== claveFila) return filaHtml;
        return filaHtml + pintarDetalleHistorial(f);
    }).join("");

    tbody.querySelectorAll("tr.tp-fila-clic").forEach((tr) => {
        tr.addEventListener("click", () => {
            const clave = tr.dataset.clave;
            filaExpandidaId = filaExpandidaId === clave ? null : clave;
            aplicarFiltrosYPintar();
        });
    });
}

function pintarDetalleHistorial(f) {
    if (!f.intentos.length) {
        return `
            <tr class="tp-detalle-historial"><td colspan="9">
                <b>${escapeHtml(f.nombre)}</b> todavía no ha terminado ningún intento de este ejercicio
                ${f.presencia ? ` — última actividad: ${formatearFecha(f.presencia.ultima_actividad_at)}.` : "."}
            </td></tr>
        `;
    }
    const filasIntentos = [...f.intentos].reverse().map((it, idx) => {
        const numero = f.intentos.length - idx;
        const nota = it.nota_meduca !== null && it.nota_meduca !== undefined ? Number(it.nota_meduca).toFixed(1) : "—";
        return `<div>#${numero} — Nota ${nota} · ${it.correctas ?? "—"} correctas / ${it.incorrectas ?? "—"} incorrectas · ${it.porcentaje ?? "—"}% · ${formatearFecha(it.finalizado_at || it.registrado_at)}</div>`;
    }).join("");
    return `
        <tr class="tp-detalle-historial"><td colspan="9">
            <b>Historial completo de ${escapeHtml(f.nombre)} (${f.intentos.length} ${f.intentos.length === 1 ? "intento" : "intentos"}):</b>
            <div style="margin-top:6px; display:flex; flex-direction:column; gap:2px;">${filasIntentos}</div>
        </td></tr>
    `;
}

function pintarResumen(filas) {
    const total = filas.length;
    const conNota = filas.filter((f) => f.nota_meduca !== null && f.nota_meduca !== undefined);
    const promedio = conNota.length
        ? (conNota.reduce((s, f) => s + Number(f.nota_meduca), 0) / conNota.length).toFixed(1)
        : "—";
    const bajoTres = conNota.filter((f) => Number(f.nota_meduca) < 3).length;
    const enVivo = filas.filter((f) => f.estado === "vivo").length;
    const abandonados = filas.filter((f) => f.estado === "abandonado").length;

    document.getElementById("tp-resumen").innerHTML = `
        <div class="tp-resumen-item">Registros<b>${total}</b></div>
        <div class="tp-resumen-item">Promedio<b>${promedio}</b></div>
        <div class="tp-resumen-item">Con nota &lt; 3.0<b>${bajoTres}</b></div>
        <div class="tp-resumen-item">En vivo ahora<b>${enVivo}</b></div>
        <div class="tp-resumen-item">Empezaron sin terminar<b>${abandonados}</b></div>
    `;
}

// =========================================================
// 6) QUIÉN FALTA (solo con una clase + tipo específicos elegidos)
// =========================================================
function pintarFaltan() {
    const cont = document.getElementById("tp-faltan-cont");
    const toggle = document.getElementById("tp-faltan-toggle");
    const lista = document.getElementById("tp-faltan-lista");

    if (filtroClase === "todas" || filtroTipo === "todos") {
        cont.hidden = true;
        return;
    }

    const yaHicieron = new Set(
        FILAS.filter((f) => f.codigo_examen === filtroClase && f.tipo_ejercicio === filtroTipo)
            .map((f) => normalizarCedula(f.cedula))
    );

    const salonesDeLaClase = filtroClase.startsWith("cn8") ? ["8A"] : ["9A", "9B", "9C"];
    const roster = ESTUDIANTES.filter((e) => {
        if (filtroSalon !== "todos") return e.salon === filtroSalon;
        return salonesDeLaClase.includes(e.salon);
    });

    const faltan = roster.filter((e) => !yaHicieron.has(normalizarCedula(e.cedula)));

    cont.hidden = false;
    toggle.textContent = mostrarFaltan
        ? `🙈 Ocultar quién falta (${faltan.length})`
        : `👀 Mostrar quién no ha hecho este ejercicio todavía (${faltan.length})`;
    lista.hidden = !mostrarFaltan;
    lista.innerHTML = faltan.map((e) => `<span class="tp-faltan-chip">${escapeHtml(e.nombre)} · ${escapeHtml(e.salon)}</span>`).join("")
        || `<span class="tp-faltan-chip">🎉 Todos en este salón ya lo hicieron.</span>`;

    toggle.onclick = () => {
        mostrarFaltan = !mostrarFaltan;
        pintarFaltan();
    };
}

// =========================================================
// 7) BANDA "EN VIVO AHORA" (arriba de todo, se refresca sola)
// =========================================================
function pintarEnVivo() {
    const cont = document.getElementById("tp-en-vivo");
    const lista = document.getElementById("tp-en-vivo-lista");
    const enVivo = FILAS.filter((f) => f.estado === "vivo");

    if (!enVivo.length) {
        cont.hidden = true;
        return;
    }

    cont.hidden = false;
    lista.innerHTML = enVivo.map((f) => `
        <span class="tp-en-vivo-item">
            <span class="tp-punto-vivo"></span>
            ${escapeHtml(f.nombre)} · ${escapeHtml(f.salon)} · ${escapeHtml(NOMBRES_CLASE[f.codigo_examen] || f.codigo_examen)} · ${escapeHtml(NOMBRES_TIPO[f.tipo_ejercicio] || f.tipo_ejercicio)}
        </span>
    `).join("");
}

let REFRESCANDO = false;
async function refrescarPanel() {
    if (REFRESCANDO) return;
    REFRESCANDO = true;
    try {
        const [historialRes, presenciaRes] = await Promise.all([
            supabase.from("historial_intentos_practica").select("*").order("registrado_at", { ascending: true }),
            supabase.from("presencia_practica").select("*"),
        ]);

        let historial = historialRes.data || [];
        if (historialRes.error) {
            const fallback = await supabase.from("prueba_intentos_practica").select("*");
            historial = (fallback.data || []).map((r) => ({ ...r, registrado_at: r.finalizado_at }));
        }

        construirFilas(historial, presenciaRes.error ? [] : (presenciaRes.data || []));
        pintarFiltros();
        pintarEnVivo();
        aplicarFiltrosYPintar();
    } finally {
        REFRESCANDO = false;
    }
}

// =========================================================
// 8) ORDEN AL HACER CLIC EN ENCABEZADOS
// =========================================================
document.querySelectorAll("table.tp-tabla th[data-orden]").forEach((th) => {
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
// 9) ARRANQUE
// =========================================================
(async function init() {
    const ok = await verificarSesion();
    if (!ok) return;
    pintarCambiarPanel("profesor", "claro-sobre-oscuro");
    await cargarDatos();
    setInterval(refrescarPanel, 20000);
})();
