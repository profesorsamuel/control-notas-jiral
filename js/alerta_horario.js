import { supabase } from "./supabase.js";

// =========================================================
// UTILIDADES
// =========================================================

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function quitarAcentos(str) {
    return String(str ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizarDia(dia) {
    const d = quitarAcentos(String(dia ?? "").trim().toLowerCase());
    const validos = ["lunes", "martes", "miercoles", "jueves", "viernes"];
    return validos.includes(d) ? d : null;
}

function diaDeHoy() {
    const mapa = { 1: "lunes", 2: "martes", 3: "miercoles", 4: "jueves", 5: "viernes" };
    return mapa[new Date().getDay()] || null;
}

function formatearHora12(horaTexto) {
    if (!horaTexto) return "";
    const [h, m] = horaTexto.split(":");
    const fecha = new Date();
    fecha.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0);
    return fecha.toLocaleTimeString("es-PA", { hour: "numeric", minute: "2-digit" });
}

function horaASegundos(horaTexto) {
    if (!horaTexto) return null;
    const partes = String(horaTexto).split(":").map(n => parseInt(n, 10));
    return (partes[0] || 0) * 3600 + (partes[1] || 0) * 60 + (partes[2] || 0);
}

function segundosAhora() {
    const n = new Date();
    return n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds();
}

function mostrarEstado(mensaje, esError = false) {
    const el = document.getElementById("estadoHorario");
    el.textContent = mensaje;
    el.style.color = esError ? "#c0392b" : "#2e7d32";
}

// =========================================================
// ESTADO
// =========================================================

let correoUsuario = "";
let esProfesor = false;
let esEstudiante = false;
let salonEstudiante = "";
let clasesHoy = [];
let alertasDisparadas = new Set();
let alertasActivas = false;
let audioCtx = null;
let intervaloMonitor = null;
let intervaloRelojUI = null;

// =========================================================
// ELEMENTOS
// =========================================================

const subtituloHorario = document.getElementById("subtituloHorario");
const listaClases = document.getElementById("listaClases");
const zonaActivar = document.getElementById("zonaActivar");
const avisoActivo = document.getElementById("avisoActivo");
const btnActivarAlertas = document.getElementById("btnActivarAlertas");
const bannerAlerta = document.getElementById("bannerAlerta");
const enlaceVolverProfesor = document.getElementById("enlaceVolverProfesor");
const enlaceVolverEstudiante = document.getElementById("enlaceVolverEstudiante");

// =========================================================
// 1) VERIFICAR SESIÓN Y DETECTAR ROL
// =========================================================

async function verificarSesionYRol() {
    const { data: { user }, error: errUser } = await supabase.auth.getUser();

    if (errUser || !user) {
        window.location.href = "login.html";
        return false;
    }

    correoUsuario = (user.email || "").trim().toLowerCase();

    const { data: materias } = await supabase
        .from("profesor_materias")
        .select("materia")
        .eq("correo_profesor", correoUsuario)
        .limit(1);

    esProfesor = Array.isArray(materias) && materias.length > 0;

    if (esProfesor) {
        enlaceVolverProfesor.style.display = "inline-block";
        return true;
    }

    const { data: estudiante } = await supabase
        .from("estudiantes")
        .select("salon")
        .eq("correo", correoUsuario)
        .maybeSingle();

    if (estudiante && estudiante.salon) {
        esEstudiante = true;
        salonEstudiante = estudiante.salon;
        enlaceVolverEstudiante.style.display = "inline-block";
        return true;
    }

    subtituloHorario.textContent = "";
    listaClases.innerHTML = `<p class="text-center text-danger py-4">⛔ Esta cuenta no tiene un perfil de profesor ni de estudiante.</p>`;
    return false;
}

// =========================================================
// 2) CARGAR FRANJAS Y CLASES DE HOY
// =========================================================

async function cargarClasesHoy() {
    const dia = diaDeHoy();

    if (!dia) {
        subtituloHorario.textContent = "Hoy no hay clases (fin de semana)";
        listaClases.innerHTML = `<p class="text-center text-muted py-4">No hay clases programadas para hoy.</p>`;
        return;
    }

    const { data: franjas, error: errFranjas } = await supabase
        .from("franjas_horario")
        .select("id, hora_inicio, hora_fin, orden, es_recreo")
        .order("orden", { ascending: true });

    if (errFranjas) {
        console.error("❌ Error al cargar franjas:", errFranjas);
        listaClases.innerHTML = `<p class="text-center text-danger py-4">Error al cargar las franjas horarias.</p>`;
        return;
    }

    const franjaPorId = new Map((franjas || []).map(f => [f.id, f]));

    let consulta = supabase
        .from("horario_profesor")
        .select("franja_id, texto, tipo, materia, salon, correo_profesor")
        .eq("dia", dia)
        .eq("tipo", "clase");

    if (esProfesor) {
        consulta = consulta.eq("correo_profesor", correoUsuario);
        subtituloHorario.textContent = `Tu horario de hoy (${normalizarDia(dia)})`;
    } else {
        consulta = consulta.eq("salon", salonEstudiante);
        subtituloHorario.textContent = `Horario de ${salonEstudiante} — hoy`;
    }

    const { data: bloques, error: errBloques } = await consulta;

    if (errBloques) {
        console.error("❌ Error al cargar el horario de hoy:", errBloques);
        listaClases.innerHTML = `<p class="text-center text-danger py-4">Error al cargar el horario.</p>`;
        return;
    }

    clasesHoy = (bloques || [])
        .map(b => {
            const franja = franjaPorId.get(b.franja_id);
            if (!franja) return null;
            return {
                titulo: b.materia || b.texto || "Clase",
                meta: esProfesor ? (b.salon || "") : "",
                inicioSeg: horaASegundos(franja.hora_inicio),
                finSeg: horaASegundos(franja.hora_fin),
                horaInicioTexto: franja.hora_inicio,
                horaFinTexto: franja.hora_fin,
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.inicioSeg - b.inicioSeg);

    if (clasesHoy.length === 0) {
        listaClases.innerHTML = `<p class="text-center text-muted py-4">No hay clases registradas para hoy.</p>`;
        return;
    }

    pintarClases();
}

// =========================================================
// 3) PINTAR LISTA CON CUENTA REGRESIVA
// =========================================================

function textoCuenta(diffSeg, enCurso) {
    if (enCurso) return "🟢 En curso";
    if (diffSeg <= 0) return "✅ Terminada";
    const min = Math.ceil(diffSeg / 60);
    if (min < 60) return `en ${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `en ${h}h ${m}min`;
}

function pintarClases() {
    const ahora = segundosAhora();

    listaClases.innerHTML = clasesHoy.map(c => {
        const enCurso = ahora >= c.inicioSeg && ahora < c.finSeg;
        const terminada = ahora >= c.finSeg;
        const diff = c.inicioSeg - ahora;
        const clase = enCurso ? "en-curso" : (terminada ? "terminada" : "");

        return `
        <div class="tarjeta-clase ${clase}">
            <div class="info">
                <h3>${escapeHtml(c.titulo)}</h3>
                <div class="meta">${formatearHora12(c.horaInicioTexto)} – ${formatearHora12(c.horaFinTexto)}${c.meta ? " · " + escapeHtml(c.meta) : ""}</div>
            </div>
            <div class="cuenta">${textoCuenta(diff, enCurso)}</div>
        </div>`;
    }).join("");
}

// =========================================================
// 4) SONIDO (Web Audio API, sin archivos externos)
// =========================================================

function pitido(vecesRestantes = 3) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.25;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    setTimeout(() => osc.stop(), 300);

    if (vecesRestantes > 1) {
        setTimeout(() => pitido(vecesRestantes - 1), 450);
    }
}

function vibrar() {
    if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]);
}

function mostrarBanner(texto) {
    bannerAlerta.textContent = texto;
    bannerAlerta.classList.add("mostrar");
    setTimeout(() => bannerAlerta.classList.remove("mostrar"), 8000);
}

function notificarNavegador(texto) {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") {
        try {
            new Notification("🔔 Horario", { body: texto });
        } catch (e) {
            console.warn("No se pudo mostrar la notificación:", e);
        }
    }
}

function dispararAlerta(texto) {
    pitido(3);
    vibrar();
    mostrarBanner(texto);
    notificarNavegador(texto);
}

// =========================================================
// 5) ACTIVAR ALERTAS (requiere toque del usuario)
// =========================================================

async function activarAlertas() {
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === "suspended") await audioCtx.resume();
        pitido(1);
    } catch (e) {
        console.warn("No se pudo iniciar el audio:", e);
    }

    if (typeof Notification !== "undefined" && Notification.permission === "default") {
        try { await Notification.requestPermission(); } catch (e) { /* ignorar */ }
    }

    alertasActivas = true;
    zonaActivar.classList.add("oculta");
    avisoActivo.classList.add("mostrar");

    if (intervaloMonitor) clearInterval(intervaloMonitor);
    intervaloMonitor = setInterval(revisarUmbrales, 10000);
    revisarUmbrales();
}

function revisarUmbrales() {
    const ahora = segundosAhora();
    const umbrales = [300, 120, 0];

    clasesHoy.forEach((c, indice) => {
        const diff = c.inicioSeg - ahora;

        umbrales.forEach(umbral => {
            const clave = `${indice}-${umbral}`;
            if (alertasDisparadas.has(clave)) return;
            if (diff <= umbral && diff > umbral - 10) {
                alertasDisparadas.add(clave);
                const texto = umbral === 0
                    ? `🔔 ${c.titulo} está comenzando ahora`
                    : `⏰ ${c.titulo} empieza en ${umbral / 60} minuto(s)`;
                dispararAlerta(texto);
            }
        });
    });
}

btnActivarAlertas.addEventListener("click", activarAlertas);

// =========================================================
// 6) INICIO
// =========================================================

(async function iniciar() {
    const ok = await verificarSesionYRol();
    if (!ok) return;

    await cargarClasesHoy();

    intervaloRelojUI = setInterval(pintarClases, 15000);
})();
