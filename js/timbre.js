// =========================================================
// CONTROL DE TIMBRE — vista pública + edición con Supabase
// =========================================================

import { supabase } from "./supabase.js";

const CEDULA_VALIDA = "1-111-11";
const CLAVE_VALIDA = "000000";

const CLAVE_SESION = "timbre_sesion_jiral";
const CLAVE_SONIDO = "timbre_sonido_jiral";
const CLAVE_MODO_BUCLE = "timbre_modo_bucle_jiral";
const CLAVE_PASS_GUARDADA = "timbre_clave_actual_jiral"; // contraseña vigente (si se cambió)
const CLAVE_PREGUNTAS = "timbre_preguntas_seguridad_jiral"; // preguntas/respuestas de recuperación
const TABLA = "timbre_horario";

const PREGUNTAS_POR_DEFECTO = [
    "¿Cuál es el nombre del director o directora del colegio?",
    "¿En qué año se fundó el colegio (aproximado)?",
    "¿Cuál es una palabra secreta que usted eligió?",
];

// =========================================================
// CONTRASEÑA Y PREGUNTAS DE SEGURIDAD (guardadas en este dispositivo)
// =========================================================

function obtenerClaveActual() {
    return localStorage.getItem(CLAVE_PASS_GUARDADA) || CLAVE_VALIDA;
}

function guardarClaveActual(nuevaClave) {
    localStorage.setItem(CLAVE_PASS_GUARDADA, nuevaClave);
}

function obtenerPreguntasGuardadas() {
    const crudo = localStorage.getItem(CLAVE_PREGUNTAS);
    if (!crudo) return null;
    try {
        return JSON.parse(crudo);
    } catch {
        return null;
    }
}

function guardarPreguntas(lista) {
    // lista: [{ pregunta, respuesta }] — la respuesta se guarda normalizada
    const normalizada = lista.map((p) => ({
        pregunta: p.pregunta.trim(),
        respuesta: normalizarTexto(p.respuesta),
    }));
    localStorage.setItem(CLAVE_PREGUNTAS, JSON.stringify(normalizada));
}

function normalizarTexto(txt) {
    return (txt || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, ""); // quita tildes para comparar más flexible
}

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
const btnConfigSeguridad = document.getElementById("btnConfigSeguridad");

// Recuperación de contraseña
const linkOlvideClave = document.getElementById("linkOlvideClave");
const panelRecuperarClave = document.getElementById("panelRecuperarClave");
const zonaPreguntasRecuperar = document.getElementById("zonaPreguntasRecuperar");
const avisoSinPreguntas = document.getElementById("avisoSinPreguntas");
const zonaNuevaClave = document.getElementById("zonaNuevaClave");
const nuevaClaveRecuperar = document.getElementById("nuevaClaveRecuperar");
const confirmarClaveRecuperar = document.getElementById("confirmarClaveRecuperar");
const errorRecuperarClave = document.getElementById("errorRecuperarClave");
const exitoRecuperarClave = document.getElementById("exitoRecuperarClave");
const btnVerificarRespuestas = document.getElementById("btnVerificarRespuestas");
const btnGuardarNuevaClave = document.getElementById("btnGuardarNuevaClave");
const btnCancelarRecuperar = document.getElementById("btnCancelarRecuperar");

// Configuración de contraseña y preguntas (modo edición)
const panelConfigSeguridad = document.getElementById("panelConfigSeguridad");
const configNuevaClave = document.getElementById("configNuevaClave");
const zonaConfigPreguntas = document.getElementById("zonaConfigPreguntas");
const errorConfigSeguridad = document.getElementById("errorConfigSeguridad");
const exitoConfigSeguridad = document.getElementById("exitoConfigSeguridad");
const btnGuardarConfigSeguridad = document.getElementById("btnGuardarConfigSeguridad");
const btnCancelarConfigSeguridad = document.getElementById("btnCancelarConfigSeguridad");

const estadoGuardadoHorario = document.getElementById("estadoGuardadoHorario");
const relojActual = document.getElementById("relojActual");
const zonaActivarTimbre = document.getElementById("zonaActivarTimbre");
const btnActivarTimbre = document.getElementById("btnActivarTimbre");
const avisoActivoTimbre = document.getElementById("avisoActivoTimbre");
const cuerpoHorarioTimbre = document.getElementById("cuerpoHorarioTimbre");
const estadoTimbre = document.getElementById("estadoTimbre");
const estadoSincronizacion = document.getElementById("estadoSincronizacion");

const bannerAlerta = document.getElementById("bannerAlerta");
const bannerIcono = document.getElementById("bannerIcono");
const bannerTexto = document.getElementById("bannerTexto");
const bannerCerrar = document.getElementById("bannerCerrar");
const bannerDetener = document.getElementById("bannerDetener");
const switchModoBucle = document.getElementById("switchModoBucle");

let horario = [];
let modoEdicion = false;
let modoEdicionRenderizado = null; // controla si hace falta redibujar toda la tabla
let sonidoActivo = false;
let audioCtx = null;
let yaTocados = new Set(); // se reinicia cada día

// Guardado automático mientras se escribe (sin esperar a salir del campo)
const temporizadoresGuardado = new Map(); // id-campo -> timeoutId
let guardadosPendientes = 0;

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
    if (cedula === CEDULA_VALIDA && clave === obtenerClaveActual()) {
        errorLoginTimbre.classList.add("oculto");
        cedulaTimbre.value = "";
        claveTimbre.value = "";
        entrarModoEdicion();
    } else {
        errorLoginTimbre.classList.remove("oculto");
    }
});

btnSalirEdicion.addEventListener("click", salirModoEdicion);

// =========================================================
// RECUPERAR CONTRASEÑA CON 3 PREGUNTAS DE SEGURIDAD
// =========================================================

let respuestasCorrectasVerificadas = false;

function abrirPanelRecuperar() {
    panelLoginEdicion.classList.add("oculto");
    panelRecuperarClave.classList.remove("oculto");
    errorRecuperarClave.classList.add("oculto");
    exitoRecuperarClave.classList.add("oculto");
    zonaNuevaClave.classList.add("oculto");
    btnGuardarNuevaClave.classList.add("oculto");
    nuevaClaveRecuperar.value = "";
    confirmarClaveRecuperar.value = "";
    respuestasCorrectasVerificadas = false;

    const preguntas = obtenerPreguntasGuardadas();

    if (!preguntas || preguntas.length < 3) {
        avisoSinPreguntas.classList.remove("oculto");
        zonaPreguntasRecuperar.innerHTML = "";
        btnVerificarRespuestas.classList.add("oculto");
        return;
    }

    avisoSinPreguntas.classList.add("oculto");
    btnVerificarRespuestas.classList.remove("oculto");
    zonaPreguntasRecuperar.innerHTML = preguntas
        .map(
            (p, i) => `
        <div class="mb-2">
            <label class="form-label small">${p.pregunta}</label>
            <input type="text" class="form-control respuesta-recuperar" data-indice="${i}" autocomplete="off">
        </div>`
        )
        .join("");
}

linkOlvideClave.addEventListener("click", (e) => {
    e.preventDefault();
    abrirPanelRecuperar();
});

btnCancelarRecuperar.addEventListener("click", () => {
    panelRecuperarClave.classList.add("oculto");
});

btnVerificarRespuestas.addEventListener("click", () => {
    const preguntas = obtenerPreguntasGuardadas();
    if (!preguntas) return;

    const inputs = zonaPreguntasRecuperar.querySelectorAll(".respuesta-recuperar");
    let todasCorrectas = true;
    inputs.forEach((input) => {
        const i = Number(input.dataset.indice);
        if (normalizarTexto(input.value) !== preguntas[i].respuesta) {
            todasCorrectas = false;
        }
    });

    if (!todasCorrectas) {
        errorRecuperarClave.textContent = "Una o más respuestas son incorrectas.";
        errorRecuperarClave.classList.remove("oculto");
        return;
    }

    errorRecuperarClave.classList.add("oculto");
    respuestasCorrectasVerificadas = true;
    zonaPreguntasRecuperar.classList.add("oculto");
    btnVerificarRespuestas.classList.add("oculto");
    zonaNuevaClave.classList.remove("oculto");
    btnGuardarNuevaClave.classList.remove("oculto");
});

btnGuardarNuevaClave.addEventListener("click", () => {
    if (!respuestasCorrectasVerificadas) return;

    const nueva = nuevaClaveRecuperar.value.trim();
    const confirmar = confirmarClaveRecuperar.value.trim();

    if (nueva.length < 4) {
        errorRecuperarClave.textContent = "La nueva contraseña debe tener al menos 4 caracteres.";
        errorRecuperarClave.classList.remove("oculto");
        return;
    }
    if (nueva !== confirmar) {
        errorRecuperarClave.textContent = "Las contraseñas no coinciden.";
        errorRecuperarClave.classList.remove("oculto");
        return;
    }

    guardarClaveActual(nueva);
    errorRecuperarClave.classList.add("oculto");
    exitoRecuperarClave.textContent = "Contraseña actualizada. Ya puede iniciar sesión.";
    exitoRecuperarClave.classList.remove("oculto");
    zonaNuevaClave.classList.add("oculto");
    btnGuardarNuevaClave.classList.add("oculto");

    setTimeout(() => {
        panelRecuperarClave.classList.add("oculto");
        panelLoginEdicion.classList.remove("oculto");
    }, 1500);
});

// =========================================================
// CONFIGURAR CONTRASEÑA Y PREGUNTAS (desde el modo edición)
// =========================================================

function abrirPanelConfigSeguridad() {
    errorConfigSeguridad.classList.add("oculto");
    exitoConfigSeguridad.classList.add("oculto");
    configNuevaClave.value = "";

    const guardadas = obtenerPreguntasGuardadas();
    zonaConfigPreguntas.innerHTML = PREGUNTAS_POR_DEFECTO.map((textoDefecto, i) => {
        const preguntaActual = guardadas && guardadas[i] ? guardadas[i].pregunta : textoDefecto;
        return `
        <div class="mb-2">
            <label class="form-label small">Pregunta ${i + 1}</label>
            <input type="text" class="form-control mb-1 config-pregunta" data-indice="${i}" value="${preguntaActual.replace(/"/g, "&quot;")}">
            <input type="text" class="form-control config-respuesta" data-indice="${i}" placeholder="Respuesta" autocomplete="off">
        </div>`;
    }).join("");

    panelConfigSeguridad.classList.remove("oculto");
}

btnConfigSeguridad.addEventListener("click", abrirPanelConfigSeguridad);

btnCancelarConfigSeguridad.addEventListener("click", () => {
    panelConfigSeguridad.classList.add("oculto");
});

btnGuardarConfigSeguridad.addEventListener("click", () => {
    const preguntasInputs = zonaConfigPreguntas.querySelectorAll(".config-pregunta");
    const respuestasInputs = zonaConfigPreguntas.querySelectorAll(".config-respuesta");

    const lista = [];
    let faltaAlgo = false;
    preguntasInputs.forEach((input, i) => {
        const pregunta = input.value.trim();
        const respuesta = respuestasInputs[i].value.trim();
        if (!pregunta || !respuesta) faltaAlgo = true;
        lista.push({ pregunta, respuesta });
    });

    if (faltaAlgo) {
        errorConfigSeguridad.textContent = "Complete las 3 preguntas y sus 3 respuestas.";
        errorConfigSeguridad.classList.remove("oculto");
        exitoConfigSeguridad.classList.add("oculto");
        return;
    }

    guardarPreguntas(lista);

    const nueva = configNuevaClave.value.trim();
    if (nueva) {
        if (nueva.length < 4) {
            errorConfigSeguridad.textContent = "La nueva contraseña debe tener al menos 4 caracteres.";
            errorConfigSeguridad.classList.remove("oculto");
            exitoConfigSeguridad.classList.add("oculto");
            return;
        }
        guardarClaveActual(nueva);
    }

    errorConfigSeguridad.classList.add("oculto");
    exitoConfigSeguridad.textContent = "Guardado correctamente.";
    exitoConfigSeguridad.classList.remove("oculto");
});

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

function mostrarEstadoGuardado(estado) {
    estadoGuardadoHorario.classList.remove("oculto", "guardando", "guardado", "error-guardado");
    if (estado === "guardando") {
        estadoGuardadoHorario.textContent = "💾 Guardando...";
        estadoGuardadoHorario.classList.add("guardando");
    } else if (estado === "guardado") {
        estadoGuardadoHorario.textContent = "✅ Guardado para todos los dispositivos";
        estadoGuardadoHorario.classList.add("guardado");
        setTimeout(() => {
            if (guardadosPendientes === 0) estadoGuardadoHorario.classList.add("oculto");
        }, 2000);
    } else if (estado === "error") {
        estadoGuardadoHorario.textContent = "⚠ No se pudo guardar. Revisa tu conexión.";
        estadoGuardadoHorario.classList.add("error-guardado");
    }
}

async function actualizarPeriodo(id, cambios, elementoParaResaltar) {
    guardadosPendientes++;
    mostrarEstadoGuardado("guardando");

    const { error } = await supabase.from(TABLA).update(cambios).eq("id", id);

    guardadosPendientes = Math.max(0, guardadosPendientes - 1);

    if (error) {
        console.error(error);
        mostrarEstadoGuardado("error");
        return;
    }

    // refleja el cambio localmente al instante (sin esperar el eco de tiempo real)
    const periodoLocal = horario.find((p) => p.id === id);
    if (periodoLocal) Object.assign(periodoLocal, cambios);

    if (guardadosPendientes === 0) mostrarEstadoGuardado("guardado");

    if (elementoParaResaltar) {
        elementoParaResaltar.classList.add("campo-guardado");
        setTimeout(() => elementoParaResaltar.classList.remove("campo-guardado"), 700);
    }
}

// Guarda automáticamente mientras el usuario escribe/selecciona, sin esperar a que
// pierda el foco el campo. Usa un pequeño retraso (debounce) por campo para no
// mandar una petición por cada letra.
function programarGuardadoAutomatico(id, campo, valor, elemento, retrasoMs = 500) {
    const clave = `${id}-${campo}`;
    if (temporizadoresGuardado.has(clave)) {
        clearTimeout(temporizadoresGuardado.get(clave));
    }
    const idTimeout = setTimeout(() => {
        temporizadoresGuardado.delete(clave);
        actualizarPeriodo(id, { [campo]: valor }, elemento);
    }, retrasoMs);
    temporizadoresGuardado.set(clave, idTimeout);
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

function crearFilaPeriodo(periodo) {
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
        const campoNombre = fila.querySelector(".campo-nombre");
        const campoInicio = fila.querySelector(".campo-inicio");
        const campoFin = fila.querySelector(".campo-fin");

        // "input" guarda mientras escribes/seleccionas (con pequeño retraso).
        // "change" guarda de inmediato en cuanto sales del campo, por si acaso.
        campoNombre.addEventListener("input", (e) => {
            programarGuardadoAutomatico(periodo.id, "nombre", e.target.value, campoNombre);
        });
        campoNombre.addEventListener("change", (e) => {
            programarGuardadoAutomatico(periodo.id, "nombre", e.target.value, campoNombre, 0);
        });
        campoInicio.addEventListener("input", (e) => {
            programarGuardadoAutomatico(periodo.id, "inicio", e.target.value, campoInicio);
        });
        campoInicio.addEventListener("change", (e) => {
            programarGuardadoAutomatico(periodo.id, "inicio", e.target.value, campoInicio, 0);
        });
        campoFin.addEventListener("input", (e) => {
            programarGuardadoAutomatico(periodo.id, "fin", e.target.value, campoFin);
        });
        campoFin.addEventListener("change", (e) => {
            programarGuardadoAutomatico(periodo.id, "fin", e.target.value, campoFin, 0);
        });
        fila.querySelector(".btn-borrar-periodo").addEventListener("click", () => {
            borrarPeriodo(periodo.id);
        });
    }
    return fila;
}

// Actualiza los valores de una fila ya existente SIN recrearla, y sin tocar
// el campo que el usuario tiene enfocado en este momento (para no perder lo
// que está escribiendo cuando llega una sincronización en tiempo real).
function actualizarFilaSiCorresponde(fila, periodo) {
    const mapa = {
        ".campo-nombre": periodo.nombre,
        ".campo-inicio": periodo.inicio,
        ".campo-fin": periodo.fin,
    };
    Object.entries(mapa).forEach(([selector, valor]) => {
        const input = fila.querySelector(selector);
        if (!input) return;
        if (document.activeElement === input) return; // el usuario está escribiendo aquí, no tocar
        if (input.value !== valor) input.value = valor;
    });
}

function renderHorario() {
    // Si cambió el modo (edición <-> solo lectura), sí hace falta reconstruir todo
    if (modoEdicionRenderizado !== modoEdicion) {
        cuerpoHorarioTimbre.innerHTML = "";
        modoEdicionRenderizado = modoEdicion;
    }

    const idsVistos = new Set();

    horario.forEach((periodo, indice) => {
        idsVistos.add(String(periodo.id));
        let fila = cuerpoHorarioTimbre.querySelector(`tr[data-id="${periodo.id}"]`);

        if (!fila) {
            fila = crearFilaPeriodo(periodo);
            const filaEnEsaPosicion = cuerpoHorarioTimbre.children[indice];
            if (filaEnEsaPosicion) cuerpoHorarioTimbre.insertBefore(fila, filaEnEsaPosicion);
            else cuerpoHorarioTimbre.appendChild(fila);
        } else {
            actualizarFilaSiCorresponde(fila, periodo);
            const filaEnEsaPosicion = cuerpoHorarioTimbre.children[indice];
            if (filaEnEsaPosicion !== fila) {
                cuerpoHorarioTimbre.insertBefore(fila, filaEnEsaPosicion || null);
            }
        }
    });

    // Elimina filas de periodos que ya no existen (borrados por este u otro dispositivo)
    Array.from(cuerpoHorarioTimbre.children).forEach((fila) => {
        if (!idsVistos.has(fila.dataset.id)) fila.remove();
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
// BANNER GRANDE DE ALERTA (Etapa 2)
// Aviso visual en pantalla completa de ancho, además del sonido —
// útil para quien tiene el volumen bajo o está lejos del dispositivo.
// =========================================================

const DURACION_BANNER_MS = 8000;

const ICONOS_BANNER = {
    inicio: "🔔",
    aviso5: "⏳",
    aviso1: "⚠️",
    fin: "🔔",
};

let bannerTimeoutId = null;

// tipo: "inicio" | "aviso5" | "aviso1" | "fin"
// persistente: true => no se oculta solo, muestra botón "Detener" en vez de "✕"
function mostrarBanner(tipo, texto, persistente = false) {
    if (!bannerAlerta) return;
    if (bannerTimeoutId) {
        clearTimeout(bannerTimeoutId);
        bannerTimeoutId = null;
    }

    bannerAlerta.className = "banner-alerta tipo-" + tipo;
    bannerIcono.textContent = ICONOS_BANNER[tipo] || "🔔";
    bannerTexto.textContent = texto;

    if (bannerDetener) bannerDetener.classList.toggle("oculto", !persistente);
    if (bannerCerrar) bannerCerrar.classList.toggle("oculto", persistente);

    // Fuerza un reflow para que la animación de entrada se note
    // incluso si ya había un banner visible (cambia de un aviso a otro).
    void bannerAlerta.offsetWidth;
    bannerAlerta.classList.add("mostrar");

    if (!persistente) {
        bannerTimeoutId = setTimeout(ocultarBanner, DURACION_BANNER_MS);
    }
}

function ocultarBanner() {
    if (!bannerAlerta) return;
    bannerAlerta.classList.remove("mostrar");
    if (bannerTimeoutId) {
        clearTimeout(bannerTimeoutId);
        bannerTimeoutId = null;
    }
}

if (bannerCerrar) bannerCerrar.addEventListener("click", ocultarBanner);

// =========================================================
// MODO "TIMBRE EN BUCLE HASTA APAGAR" (Etapa 3)
// En vez de sonar unos segundos y detenerse solo, el timbre principal
// (inicio y fin de periodo) repite hasta que alguien presione "Detener" —
// útil si nadie está cerca para reaccionar rápido.
// =========================================================

const INTERVALO_BUCLE_MS = 2000; // separación entre repeticiones del timbre

let modoBucleActivo = localStorage.getItem(CLAVE_MODO_BUCLE) === "1";
let intervaloBucleId = null;

if (switchModoBucle) {
    switchModoBucle.checked = modoBucleActivo;
    switchModoBucle.addEventListener("change", () => {
        modoBucleActivo = switchModoBucle.checked;
        localStorage.setItem(CLAVE_MODO_BUCLE, modoBucleActivo ? "1" : "0");
        // Si lo apagan mientras está sonando, detiene el bucle en curso.
        if (!modoBucleActivo && intervaloBucleId) detenerBucleTimbre();
    });
}

function iniciarBucleTimbre(tipo, texto) {
    detenerBucleTimbre(); // por si ya había uno sonando
    mostrarBanner(tipo, `${texto} — suena hasta presionar Detener`, true);
    reproducirTimbrePrincipal();
    intervaloBucleId = setInterval(() => {
        reproducirTimbrePrincipal();
    }, INTERVALO_BUCLE_MS);
}

function detenerBucleTimbre() {
    if (intervaloBucleId) {
        clearInterval(intervaloBucleId);
        intervaloBucleId = null;
    }
    ocultarBanner();
}

if (bannerDetener) bannerDetener.addEventListener("click", detenerBucleTimbre);

// Dispara el aviso del timbre principal (inicio/fin de periodo): banner
// siempre visible; sonido en bucle si el modo está activo y ya se activó
// el sonido en este dispositivo, o un solo toque en caso contrario.
function activarAvisoPrincipal(tipo, texto) {
    if (modoBucleActivo && sonidoActivo) {
        iniciarBucleTimbre(tipo, texto);
    } else {
        mostrarBanner(tipo, texto);
        if (sonidoActivo) reproducirTimbrePrincipal();
    }
}

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

    horario.forEach((periodo) => {
        const avisoHora = restarMinutos(periodo.fin, 5);
        const pitidoHora = restarMinutos(periodo.fin, 1);
        const claveInicio = `${claveDia}-${periodo.inicio}-inicio-${periodo.id}`;
        const claveAviso = `${claveDia}-${periodo.fin}-aviso-${periodo.id}`;
        const clavePitido = `${claveDia}-${periodo.fin}-pitido-${periodo.id}`;
        const claveFin = `${claveDia}-${periodo.fin}-fin-${periodo.id}`;

        // El banner visual aparece siempre (no depende de que el sonido esté
        // activado); el sonido solo se reproduce si el usuario ya lo activó.
        if (actual === periodo.inicio && !yaTocados.has(claveInicio)) {
            yaTocados.add(claveInicio);
            estadoTimbre.textContent = `🔔 ${periodo.nombre} — inicio (${periodo.inicio})`;
            activarAvisoPrincipal("inicio", `Inicia ${periodo.nombre}`);
        }
        if (actual === avisoHora && !yaTocados.has(claveAviso)) {
            yaTocados.add(claveAviso);
            estadoTimbre.textContent = `⏳ ${periodo.nombre} termina en 5 minutos`;
            mostrarBanner("aviso5", `${periodo.nombre} termina en 5 minutos`);
            if (sonidoActivo) reproducirAviso();
        }
        if (actual === pitidoHora && !yaTocados.has(clavePitido)) {
            yaTocados.add(clavePitido);
            estadoTimbre.textContent = `⏳ ${periodo.nombre} termina en 1 minuto`;
            mostrarBanner("aviso1", `${periodo.nombre} termina en 1 minuto`);
            if (sonidoActivo) reproducirPitidoLargo();
        }
        if (actual === periodo.fin && !yaTocados.has(claveFin)) {
            yaTocados.add(claveFin);
            estadoTimbre.textContent = `🔔 ${periodo.nombre} — fin (${periodo.fin})`;
            activarAvisoPrincipal("fin", `Terminó ${periodo.nombre}`);
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
