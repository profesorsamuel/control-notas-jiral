import { supabase } from "./supabase.js";
import { pintarCambiarPanel } from "./roles.js";

// =========================================================
// 0) MAPA DE codigo_examen -> nombre legible de la clase
// Si en el futuro se agrega una Clase 4 con ejercicio de
// práctica (quiz/pareo/fotos), o un nuevo salón (ej. 8°A),
// solo hay que sumar una línea aquí.
// =========================================================
const NOMBRES_CLASE = {
    "cn9-clase1-universo-2026": "Clase 1 · El origen del universo y del sistema solar",
    "cn9-clase2-vida-tierra-2026": "Clase 2 · La vida en la Tierra y la exploración del universo",
    "cn9-clase3-ondas-2026": "Clase 3 · El movimiento ondulatorio",
    "cn8a-recuperacion-2026": "Recuperación 8°A",
};

const NOMBRES_TIPO = {
    quiz: "Opción múltiple",
    pareo: "Pareo de términos",
    fotos: "Pareo de fotos",
};

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

function fechaDe(r) {
    return r.finalizado_at || r.registrado_at || null;
}

// =========================================================
// 1) VERIFICAR SESIÓN (mismo criterio que profesor.js:
// debe existir en profesor_materias, o ser admin/consejero)
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
// 2) CARGAR INTENTOS DE PRÁCTICA
// Para poder mostrar "la mejor nota de cada uno" (aunque el
// estudiante haya repetido el ejercicio) leemos el HISTORIAL
// completo (historial_intentos_practica), que guarda TODOS los
// intentos. Si esa tabla todavía no existe (no se ha corrido
// panel_tareas_practica.sql), usamos prueba_intentos_practica,
// que solo tiene el último intento — en ese caso "mejor nota"
// coincide con "último intento" y se avisa en pantalla.
// =========================================================
let TODOS = [];            // filas crudas (todos los intentos si hay historial)
let GRUPOS = [];           // una entrada por estudiante+clase+tipo, con {ultimo, mejor, veces}
let SIN_HISTORIAL = false;

let vistaActual = "ultimo"; // "ultimo" | "mejor"
let filtroClase = "todas";
let filtroTipo = "todos";
let filtroSalon = "todos";
let ordenActual = { campo: "finalizado_at", asc: false };

async function cargarIntentos() {
    const cargando = document.getElementById("pcp-cargando");
    const error = document.getElementById("pcp-error");
    const vacio = document.getElementById("pcp-vacio");
    const resultados = document.getElementById("pcp-resultados");

    cargando.hidden = false;
    error.hidden = true;
    vacio.hidden = true;
    resultados.hidden = true;

    // 1º intento: historial completo (todos los intentos).
    let { data, error: errConsulta } = await supabase
        .from("historial_intentos_practica")
        .select("*")
        .order("registrado_at", { ascending: true });

    // Si la tabla de historial no existe, caemos a la de siempre.
    if (errConsulta) {
        SIN_HISTORIAL = true;
        const fallback = await supabase
            .from("prueba_intentos_practica")
            .select("*")
            .order("finalizado_at", { ascending: true });
        data = fallback.data;
        errConsulta = fallback.error;
    }

    cargando.hidden = true;

    if (errConsulta) {
        console.error("No se pudieron cargar los intentos de práctica:", errConsulta);
        error.textContent = "Ocurrió un error al cargar los resultados. Intenta recargar la página.";
        error.hidden = false;
        return;
    }

    TODOS = data || [];
    construirGrupos();
    pintarAvisoHistorial();
    pintarFiltros();
    aplicarFiltrosYPintar();
}

// Agrupa todos los intentos por estudiante + clase + tipo, y para
// cada grupo calcula: el último intento, el de mejor nota, y cuántas
// veces lo hizo.
function construirGrupos() {
    const mapa = new Map();
    const claveDe = (r) => `${normalizarCedula(r.cedula)}|${r.codigo_examen}|${r.tipo_ejercicio || "quiz"}`;

    for (const r of TODOS) {
        const clave = claveDe(r);
        if (!mapa.has(clave)) mapa.set(clave, []);
        mapa.get(clave).push(r);
    }

    GRUPOS = Array.from(mapa.values()).map((intentos) => {
        // Último por fecha.
        const ultimo = intentos.reduce((a, b) =>
            (new Date(fechaDe(b)) >= new Date(fechaDe(a)) ? b : a));
        // Mejor por nota; si empatan en nota, el más reciente.
        const mejor = intentos.reduce((a, b) => {
            const na = Number(a.nota_meduca ?? -1);
            const nb = Number(b.nota_meduca ?? -1);
            if (nb > na) return b;
            if (nb < na) return a;
            return (new Date(fechaDe(b)) >= new Date(fechaDe(a)) ? b : a);
        });
        return { intentos, ultimo, mejor, veces: intentos.length };
    });
}

function pintarAvisoHistorial() {
    const aviso = document.getElementById("pcp-aviso-historial");
    if (SIN_HISTORIAL) {
        aviso.hidden = false;
        aviso.innerHTML = `⚠️ La vista <b>"Mejor nota de cada uno"</b> necesita el historial completo de intentos. Aún no se ha ejecutado <code>supabase/panel_tareas_practica.sql</code> en Supabase, así que por ahora solo se guarda el último intento de cada quien: mientras tanto, "mejor nota" mostrará ese último intento. Corre ese script una vez para tener la mejor nota real de cada estudiante.`;
    } else {
        aviso.hidden = true;
    }
}

// =========================================================
// 3) FILTROS (chips)
// =========================================================
function pintarFiltros() {
    const clasesPresentes = [...new Set(GRUPOS.map((g) => g.ultimo.codigo_examen))];
    const tiposPresentes = [...new Set(GRUPOS.map((g) => g.ultimo.tipo_ejercicio || "quiz"))];
    const salonesPresentes = [...new Set(GRUPOS.map((g) => g.ultimo.salon))].filter(Boolean).sort();

    const contClase = document.getElementById("pcp-filtro-clase");
    contClase.innerHTML = ["todas", ...clasesPresentes].map((c) => {
        const etiqueta = c === "todas" ? "Todas" : (NOMBRES_CLASE[c] || c);
        const activa = filtroClase === c ? "chip-activa" : "";
        return `<span class="chip-opcion ${activa}" data-valor="${escapeHtml(c)}">${escapeHtml(etiqueta)}</span>`;
    }).join("");
    contClase.querySelectorAll(".chip-opcion").forEach((chip) => {
        chip.addEventListener("click", () => {
            filtroClase = chip.dataset.valor;
            pintarFiltros();
            aplicarFiltrosYPintar();
        });
    });

    const contTipo = document.getElementById("pcp-filtro-tipo");
    contTipo.innerHTML = ["todos", ...tiposPresentes].map((t) => {
        const etiqueta = t === "todos" ? "Todos" : (NOMBRES_TIPO[t] || t);
        const activa = filtroTipo === t ? "chip-activa" : "";
        return `<span class="chip-opcion ${activa}" data-valor="${escapeHtml(t)}">${escapeHtml(etiqueta)}</span>`;
    }).join("");
    contTipo.querySelectorAll(".chip-opcion").forEach((chip) => {
        chip.addEventListener("click", () => {
            filtroTipo = chip.dataset.valor;
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
            pintarFiltros();
            aplicarFiltrosYPintar();
        });
    });
}

// Selector de vista: Último intento vs Mejor nota
document.querySelectorAll("#pcp-filtro-vista .chip-opcion").forEach((chip) => {
    chip.addEventListener("click", () => {
        vistaActual = chip.dataset.vista;
        document.querySelectorAll("#pcp-filtro-vista .chip-opcion")
            .forEach((c) => c.classList.toggle("chip-activa", c.dataset.vista === vistaActual));
        // Ajusta el subtítulo y el encabezado de la última columna.
        const sub = document.getElementById("pcp-subtitulo");
        const colFecha = document.getElementById("pcp-col-fecha");
        if (vistaActual === "mejor") {
            sub.textContent = "Mejor nota de cada estudiante (aunque haya repetido) · Clases 1 a 4 · Todos los salones";
            colFecha.textContent = "Fecha de la mejor";
        } else {
            sub.textContent = "Último intento de cada estudiante · Clases 1 a 4 · Todos los salones";
            colFecha.textContent = "Último intento";
        }
        aplicarFiltrosYPintar();
    });
});

// =========================================================
// 4) APLICAR FILTROS + ORDEN + PINTAR TABLA
// =========================================================
// Devuelve, para cada grupo que pasa los filtros, la fila que
// corresponde a la vista elegida (el último intento, o el de mejor
// nota), más el número de veces que repitió.
function filasParaVista() {
    return GRUPOS
        .filter((g) => {
            const r = g.ultimo; // los filtros de clase/tipo/salón son iguales en todos los intentos del grupo
            if (filtroClase !== "todas" && r.codigo_examen !== filtroClase) return false;
            if (filtroTipo !== "todos" && (r.tipo_ejercicio || "quiz") !== filtroTipo) return false;
            if (filtroSalon !== "todos" && r.salon !== filtroSalon) return false;
            return true;
        })
        .map((g) => {
            const base = vistaActual === "mejor" ? g.mejor : g.ultimo;
            return { ...base, veces: g.veces, _fecha: fechaDe(base) };
        });
}

function aplicarFiltrosYPintar() {
    let filas = filasParaVista();

    filas.sort((a, b) => {
        const campo = ordenActual.campo;
        let va = a[campo];
        let vb = b[campo];
        if (campo === "clase") { va = NOMBRES_CLASE[a.codigo_examen] || a.codigo_examen; vb = NOMBRES_CLASE[b.codigo_examen] || b.codigo_examen; }
        if (campo === "tipo") { va = a.tipo_ejercicio || "quiz"; vb = b.tipo_ejercicio || "quiz"; }
        if (campo === "finalizado_at") { va = a._fecha; vb = b._fecha; }
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

    const tbody = document.getElementById("pcp-tbody");
    tbody.innerHTML = filas.map((r) => {
        const tipo = r.tipo_ejercicio || "quiz";
        const claseBadge = `badge-tipo-${tipo}`;
        const nota = r.nota_meduca !== null && r.nota_meduca !== undefined ? Number(r.nota_meduca).toFixed(1) : "—";
        const claseNota = (r.nota_meduca !== null && r.nota_meduca < 3) ? "nota-baja" : "nota-alta";
        const veces = r.veces > 1
            ? `<b title="Repitió el ejercicio ${r.veces} veces">${r.veces}×</b>`
            : `${r.veces}`;
        return `
            <tr>
                <td>${escapeHtml(r.nombre)}</td>
                <td>${escapeHtml(r.salon)}</td>
                <td>${escapeHtml(NOMBRES_CLASE[r.codigo_examen] || r.codigo_examen)}</td>
                <td><span class="badge ${claseBadge}">${escapeHtml(NOMBRES_TIPO[tipo] || tipo)}</span></td>
                <td class="${claseNota}">${nota}</td>
                <td>${r.porcentaje ?? "—"}%</td>
                <td>${r.correctas ?? "—"}</td>
                <td>${r.incorrectas ?? "—"}</td>
                <td>${veces}</td>
                <td>${formatearFecha(r._fecha)}</td>
            </tr>
        `;
    }).join("");
}

function pintarResumen(filas) {
    const total = filas.length;
    const conNota = filas.filter((r) => r.nota_meduca !== null && r.nota_meduca !== undefined);
    const promedio = conNota.length
        ? (conNota.reduce((s, r) => s + Number(r.nota_meduca), 0) / conNota.length).toFixed(1)
        : "—";
    const bajoTres = conNota.filter((r) => Number(r.nota_meduca) < 3).length;
    const repitieron = filas.filter((r) => r.veces > 1).length;

    const etiquetaPromedio = vistaActual === "mejor" ? "Promedio (mejores)" : "Promedio";
    document.getElementById("pcp-resumen").innerHTML = `
        <div class="pcp-resumen-item">Estudiantes<b>${total}</b></div>
        <div class="pcp-resumen-item">${etiquetaPromedio}<b>${promedio}</b></div>
        <div class="pcp-resumen-item">Con nota &lt; 3.0<b>${bajoTres}</b></div>
        <div class="pcp-resumen-item">Repitieron<b>${repitieron}</b></div>
    `;
}

// =========================================================
// 5) ORDEN AL HACER CLIC EN ENCABEZADOS
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
// 6) ARRANQUE
// =========================================================
(async function init() {
    const ok = await verificarSesion();
    if (!ok) return;
    pintarCambiarPanel("profesor", "claro-sobre-oscuro");
    cargarIntentos();
})();
