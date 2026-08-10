// =========================================================
// CONTROL DE TIMBRE — vista pública + edición con Supabase
// =========================================================

import { supabase } from "./supabase.js";

const CEDULA_VALIDA = "1-111-11";
const CLAVE_VALIDA = "000000";

const CLAVE_SESION = "timbre_sesion_jiral";
const CLAVE_SONIDO = "timbre_sonido_jiral";
const TABLA = "timbre_horario";

const HORARIO_POR_DEFECTO = [
    { orden: 0, nombre: "Periodo 1", inicio: "12:30", fin: "13:10" },
    { orden: 1, nombre: "Periodo 2", inicio: "13:10", fin: "13:50" },
    { orden: 2, nombre: "Periodo 3", inicio: "13:50", fin: "14:30" },
    { orden: 3, nombre: "Recreo",    inicio: "14:30", fin: "14:45" },
    { orden: 4, nombre: "Periodo 4", inicio: "14:45", fin: "15:25" },
    { orden: 5, nombre: "Periodo 5", inicio: "15:25", fin: "16:05" },
    { orden: 6, nombre: "Periodo 6", inicio: "16:05", fin: "16:45" },
    { orden: 7, nombre: "Periodo 7", inicio: "16:45", fin: "17:25" },
    { orden: 8, nombre: "Periodo 8", inicio: "17:25", fin: "18:05" },
];

// =========================================================
// ELEMENTOS
// =========================================================

const btnProbarTimbre = document.getElementById("btnProbarTimbre");
const selectorSonido = document.getElementById("selectorSonido");
const btnEditarHorario = document.getElementById("btnEditarHorario");
const btnSalirEdicion = document.getElementById("btnSalirEdicion");

const panelLoginEdicion = document.getElementById("panelLoginEdicion");
const cedulaTimbre = document.getElementById("cedulaTimbre");
const claveTimbre = document.getElementById("claveTimbre");
const btnEntrarTimbre = document.getElementById("btnEntrarTimbre");
const btnCancelarLogin = document.getElementById("btnCancelarLogin");
const errorLoginTimbre = document.getElementById("errorLoginTimbre");

const barraEdicion = document.getElementById("barraEdicion");
const btnAgregarPeriodo = document.getElementById("btnAgregarPeriodo");
const btnRestaurarHorario = document.getElementById("btnRestaurarHorario");

const relojActual = document.getElementById("relojActual");
const zonaActivarTimbre = document.getElementById("zonaActivarTimbre");
const btnActivarTimbre = document.getElementById("btnActivarTimbre");
const avisoActivoTimbre = document.getElementById("avisoActivoTimbre");
const cuerpoHorarioTimbre = document.getElementById("cuerpoHorarioTimbre");
const estadoTimbre = document.getElementById("estadoTimbre");
const estadoSincronizacion = document.getElementById("estadoSincronizacion");

let horario = [];
let modoEdicion = false;
let sonidoActivo = false;
let audioCtx = null;
let yaTocados = new Set(); // se reinicia cada día

// =========================================================
// LOGIN DE EDICIÓN (independiente, no usa Supabase Auth)
// =========================================================

function entrarModoEdicion() {
    modoEdicion = true;
    localStorage.setItem(CLAVE_SESION, "1");
    panelLoginEdicion.classList.add("oculto");
    btnEditarHorario.classList.add("oculto");
    btnSalirEdicion.classList.remove("oculto");
    barraEdicion.classList.remove("oculto");
    renderHorario();
}

function salirModoEdicion() {
    modoEdicion = false;
    localStorage.removeItem(CLAVE_SESION);
    barraEdicion.classList.add("oculto");
    btnSalirEdicion.classList.add("oculto");
    btnEditarHorario.classList.remove("oculto");
    renderHorario();
}

btnEditarHorario.addEventListener("click", () => {
    panelLoginEdicion.classList.remove("oculto");
});

btnCancelarLogin.addEventListener("click", () => {
    panelLoginEdicion.classList.add("oculto");
    errorLoginTimbre.classList.add("oculto");
    cedulaTimbre.value = "";
    claveTimbre.value = "";
});

btnEntrarTimbre.addEventListener("click", () => {
    const cedula = cedulaTimbre.value.trim();
    const clave = claveTimbre.value.trim();
    if (cedula === CEDULA_VALIDA && clave === CLAVE_VALIDA) {
        errorLoginTimbre.classList.add("oculto");
        cedulaTimbre.value = "";
        claveTimbre.value = "";
        entrarModoEdicion();
    } else {
        errorLoginTimbre.classList.remove("oculto");
    }
});

btnSalirEdicion.addEventListener("click", salirModoEdicion);

if (localStorage.getItem(CLAVE_SESION) === "1") {
    modoEdicion = true;
    btnEditarHorario.classList.add("oculto");
    btnSalirEdicion.classList.remove("oculto");
    barraEdicion.classList.remove("oculto");
}

// =========================================================
// HORARIO — Supabase (tabla timbre_horario, sincronizado)
// =========================================================

async function cargarHorario() {
    estadoSincronizacion.textContent = "Cargando horario…";
    const { data, error } = await supabase
        .from(TABLA)
        .select("*")
        .order("orden", { ascending: true });

    if (error) {
        console.error(error);
        estadoSincronizacion.textContent = "⚠ No se pudo conectar. Mostrando horario por defecto.";
        horario = [...HORARIO_POR_DEFECTO];
        renderHorario();
        return;
    }

    if (!data || data.length === 0) {
        await sembrarHorarioPorDefecto();
        return;
    }

    horario = data;
    estadoSincronizacion.textContent = "✅ Sincronizado en tiempo real";
    renderHorario();
}

async function sembrarHorarioPorDefecto() {
    const { data, error } = await supabase
        .from(TABLA)
        .insert(HORARIO_POR_DEFECTO)
        .select("*")
        .order("orden", { ascending: true });

    if (error) {
        console.error(error);
        estadoSincronizacion.textContent = "⚠ No se pudo crear el horario inicial.";
        horario = [...HORARIO_POR_DEFECTO];
        renderHorario();
        return;
    }
    horario = data;
    estadoSincronizacion.textContent = "✅ Sincronizado en tiempo real";
    renderHorario();
}

async function actualizarPeriodo(id, cambios) {
    const { error } = await supabase.from(TABLA).update(cambios).eq("id", id);
    if (error) console.error(error);
}

async function agregarPeriodo() {
    const nuevoOrden = horario.length;
    const { error } = await supabase.from(TABLA).insert({
        orden: nuevoOrden,
        nombre: "Nuevo periodo",
        inicio: "12:00",
        fin: "12:40",
    });
    if (error) console.error(error);
}

async function borrarPeriodo(id) {
    const { error } = await supabase.from(TABLA).delete().eq("id", id);
    if (error) console.error(error);
}

async function restaurarHorario() {
    if (!confirm("¿Restaurar el horario por defecto? Se perderán los cambios para todos.")) return;
    const idsActuales = horario.map((p) => p.id);
    if (idsActuales.length > 0) {
        const { error: errBorrar } = await supabase.from(TABLA).delete().in("id", idsActuales);
        if (errBorrar) console.error(errBorrar);
    }
    const { error: errInsertar } = await supabase.from(TABLA).insert(HORARIO_POR_DEFECTO);
    if (errInsertar) console.error(errInsertar);
}

function renderHorario() {
    cuerpoHorarioTimbre.innerHTML = "";
    horario.forEach((periodo) => {
        const fila = document.createElement("tr");
        fila.className = "fila-periodo";
        fila.dataset.id = periodo.id;
        const soloLectura = modoEdicion ? "" : "disabled";
        fila.innerHTML = `
            <td><input type="text" class="form-control form-control-sm campo-nombre" value="${periodo.nombre}" ${soloLectura}></td>
            <td><input type="time" class="form-control form-control-sm campo-inicio" value="${periodo.inicio}" ${soloLectura}></td>
            <td><input type="time" class="form-control form-control-sm campo-fin" value="${periodo.fin}" ${soloLectura}></td>
            <td>${modoEdicion ? '<button type="button" class="btn btn-outline-danger btn-sm btn-borrar-periodo">✕</button>' : ""}</td>
        `;
        if (modoEdicion) {
            fila.querySelector(".campo-nombre").addEventListener("change", (e) => {
                actualizarPeriodo(periodo.id, { nombre: e.target.value });
            });
            fila.querySelector(".campo-inicio").addEventListener("change", (e) => {
                actualizarPeriodo(periodo.id, { inicio: e.target.value });
            });
            fila.querySelector(".campo-fin").addEventListener("change", (e) => {
                actualizarPeriodo(periodo.id, { fin: e.target.value });
            });
            fila.querySelector(".btn-borrar-periodo").addEventListener("click", () => {
                borrarPeriodo(periodo.id);
            });
        }
        cuerpoHorarioTimbre.appendChild(fila);
    });
}

btnAgregarPeriodo.addEventListener("click", agregarPeriodo);
btnRestaurarHorario.addEventListener("click", restaurarHorario);

// Sincronización en tiempo real: cualquier cambio en la tabla se refleja para todos
supabase
    .channel("timbre_horario_canal")
    .on("postgres_changes", { event: "*", schema: "public", table: TABLA }, () => {
        cargarHorario();
    })
    .subscribe();

// =========================================================
// SONIDO
// =========================================================

function asegurarAudioCtx() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
}

function reproducirTono(frecuencia, duracionMs, tipo = "sine", inicioMs = 0) {
    const ctx = asegurarAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const inicio = ctx.currentTime + inicioMs / 1000;
    osc.type = tipo;
    osc.frequency.value = frecuencia;
    gain.gain.setValueAtTime(0.001, inicio);
    gain.gain.exponentialRampToValueAtTime(0.3, inicio + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, inicio + duracionMs / 1000);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(inicio);
    osc.stop(inicio + duracionMs / 1000 + 0.05);
}

// --- 4 sonidos de timbre principal, elegibles por dispositivo ---

function sonidoCampana() {
    reproducirTono(660, 350, "sine", 0);
    reproducirTono(660, 350, "sine", 420);
    reproducirTono(660, 500, "sine", 840);
}

function sonidoAgudo() {
    reproducirTono(1400, 250, "square", 0);
    reproducirTono(1400, 250, "square", 300);
    reproducirTono(1400, 250, "square", 600);
}

function sonidoDoble() {
    reproducirTono(880, 300, "triangle", 0);
    reproducirTono(660, 400, "triangle", 350);
}

function sonidoSuave() {
    reproducirTono(523, 500, "sine", 0);
    reproducirTono(659, 600, "sine", 300);
}

function reproducirTimbrePrincipal() {
    const sonido = selectorSonido.value;
    if (sonido === "agudo") sonidoAgudo();
    else if (sonido === "doble") sonidoDoble();
    else if (sonido === "suave") sonidoSuave();
    else sonidoCampana();
}

function reproducirAviso() {
    // aviso 5 min antes del fin: dos tonos agudos cortos
    reproducirTono(1200, 200, "square", 0);
    reproducirTono(1200, 200, "square", 260);
}

function reproducirPitidoLargo() {
    // pitido largo 1 minuto antes del fin
    reproducirTono(950, 1000, "sawtooth", 0);
}

btnProbarTimbre.addEventListener("click", reproducirTimbrePrincipal);

selectorSonido.addEventListener("change", () => {
    localStorage.setItem(CLAVE_SONIDO, selectorSonido.value);
});
const sonidoGuardado = localStorage.getItem(CLAVE_SONIDO);
if (sonidoGuardado) selectorSonido.value = sonidoGuardado;

btnActivarTimbre.addEventListener("click", () => {
    asegurarAudioCtx();
    reproducirTono(660, 200, "sine"); // confirmación
    sonidoActivo = true;
    zonaActivarTimbre.classList.add("oculto");
    avisoActivoTimbre.classList.add("mostrar");
});

// =========================================================
// RELOJ Y REVISIÓN DEL HORARIO
// =========================================================

function horaTexto(fecha) {
    return fecha.toLocaleTimeString("es-PA", { hour12: false });
}

function hhmm(fecha) {
    return fecha.toTimeString().slice(0, 5); // "HH:MM"
}

function restarMinutos(hhmmTexto, minutos) {
    const [h, m] = hhmmTexto.split(":").map(Number);
    const total = h * 60 + m - minutos;
    const hh = Math.floor(((total % 1440) + 1440) / 60) % 24;
    const mm = ((total % 60) + 60) % 60;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function revisarHorario() {
    const ahora = new Date();
    const actual = hhmm(ahora);
    const claveDia = ahora.toISOString().slice(0, 10);

    if (!revisarHorario._dia || revisarHorario._dia !== claveDia) {
        revisarHorario._dia = claveDia;
        yaTocados = new Set();
    }

    const filas = cuerpoHorarioTimbre.querySelectorAll(".fila-periodo");
    horario.forEach((periodo, i) => {
        const enCurso = actual >= periodo.inicio && actual < periodo.fin;
        if (filas[i]) filas[i].classList.toggle("en-curso", enCurso);
    });

    if (!sonidoActivo) return;

    horario.forEach((periodo) => {
        const avisoHora = restarMinutos(periodo.fin, 5);
        const pitidoHora = restarMinutos(periodo.fin, 1);
        const claveInicio = `${claveDia}-${periodo.inicio}-inicio-${periodo.id}`;
        const claveAviso = `${claveDia}-${periodo.fin}-aviso-${periodo.id}`;
        const clavePitido = `${claveDia}-${periodo.fin}-pitido-${periodo.id}`;
        const claveFin = `${claveDia}-${periodo.fin}-fin-${periodo.id}`;

        if (actual === periodo.inicio && !yaTocados.has(claveInicio)) {
            reproducirTimbrePrincipal();
            yaTocados.add(claveInicio);
            estadoTimbre.textContent = `🔔 ${periodo.nombre} — inicio (${periodo.inicio})`;
        }
        if (actual === avisoHora && !yaTocados.has(claveAviso)) {
            reproducirAviso();
            yaTocados.add(claveAviso);
            estadoTimbre.textContent = `⏳ ${periodo.nombre} termina en 5 minutos`;
        }
        if (actual === pitidoHora && !yaTocados.has(clavePitido)) {
            reproducirPitidoLargo();
            yaTocados.add(clavePitido);
            estadoTimbre.textContent = `⏳ ${periodo.nombre} termina en 1 minuto`;
        }
        if (actual === periodo.fin && !yaTocados.has(claveFin)) {
            reproducirTimbrePrincipal();
            yaTocados.add(claveFin);
            estadoTimbre.textContent = `🔔 ${periodo.nombre} — fin (${periodo.fin})`;
        }
    });
}

setInterval(() => {
    relojActual.textContent = horaTexto(new Date());
    revisarHorario();
}, 1000);

// =========================================================
// INICIO
// =========================================================

cargarHorario();
