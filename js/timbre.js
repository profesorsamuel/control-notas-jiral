// =========================================================
// CONTROL DE TIMBRE — vista pública + edición con Supabase
// =========================================================

import { supabase } from "./supabase.js";

const CEDULA_VALIDA = "1-111-11";
const CLAVE_VALIDA = "000000";

const CLAVE_SESION = "timbre_sesion_jiral";
const CLAVE_SONIDO = "timbre_sonido_jiral";
const CLAVE_VOLUMEN = "timbre_volumen_jiral";
const CLAVE_MODO_BUCLE = "timbre_modo_bucle_jiral";
const CLAVE_VOZ = "timbre_anuncio_voz_jiral";
const CLAVE_AVISOS_MINUTOS = "timbre_avisos_minutos_jiral"; // minutos de anticipación elegidos (por dispositivo)
const CLAVE_PASS_GUARDADA = "timbre_clave_actual_jiral"; // contraseña vigente (si se cambió)
const CLAVE_PREGUNTAS = "timbre_preguntas_seguridad_jiral"; // preguntas/respuestas de recuperación
const TABLA = "timbre_horario";

const MINUTOS_AVISO_DISPONIBLES = [15, 10, 5, 2, 1];
const MINUTOS_AVISO_POR_DEFECTO = [5, 1]; // comportamiento original, antes de que fuera configurable

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
    { nombre: "Periodo 1", inicio: "12:30", fin: "13:10" },
    { nombre: "Periodo 2", inicio: "13:10", fin: "13:50" },
    { nombre: "Periodo 3", inicio: "13:50", fin: "14:30" },
    { nombre: "Recreo",    inicio: "14:30", fin: "14:45" },
    { nombre: "Periodo 4", inicio: "14:45", fin: "15:25" },
    { nombre: "Periodo 5", inicio: "15:25", fin: "16:05" },
    { nombre: "Periodo 6", inicio: "16:05", fin: "16:45" },
    { nombre: "Periodo 7", inicio: "16:45", fin: "17:25" },
    { nombre: "Periodo 8", inicio: "17:25", fin: "18:05" },
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
const switchAnuncioVoz = document.getElementById("switchAnuncioVoz");
const btnAvisosMinutos = document.getElementById("btnAvisosMinutos");
const panelAvisosMinutos = document.getElementById("panelAvisosMinutos");
const btnCerrarAvisosMinutos = document.getElementById("btnCerrarAvisosMinutos");
const checksAvisoMinuto = document.querySelectorAll(".check-aviso-minuto");

const cuentaRegresiva = document.getElementById("cuentaRegresiva");
const sliderVolumen = document.getElementById("sliderVolumen");
const btnActivarNotificaciones = document.getElementById("btnActivarNotificaciones");
const btnDescargarApp = document.getElementById("btnDescargarApp");
const panelInstalarIOS = document.getElementById("panelInstalarIOS");
const btnCerrarInstalarIOS = document.getElementById("btnCerrarInstalarIOS");
const avisoNotificacionesIOS = document.getElementById("avisoNotificacionesIOS");
const btnModoCartelera = document.getElementById("btnModoCartelera");
const btnSalirCartelera = document.getElementById("btnSalirCartelera");

let horario = [];
let idFilaHorario = null; // id de la única fila de la tabla timbre_horario (esquema: id, periodos jsonb, actualizado_en)
let modoEdicion = false;
let modoEdicionRenderizado = null; // controla si hace falta redibujar toda la tabla
let sonidoActivo = false;
let volumenActual = 0.8; // 0..1 — se ajusta con el slider y se guarda por dispositivo
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

// La tabla real tiene una sola fila: id, periodos (jsonb, arreglo de {nombre,inicio,fin}), actualizado_en.
// El "id" que usa la interfaz para cada período es solo la posición en el arreglo (uso local, no se guarda así en la BD).
function periodosDesdeFila(fila) {
    return (fila.periodos || []).map((p, i) => ({ ...p, id: i }));
}

async function cargarHorario() {
    estadoSincronizacion.textContent = "Cargando horario…";
    const { data, error } = await supabase
        .from(TABLA)
        .select("*")
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error(error);
        estadoSincronizacion.textContent = "⚠ No se pudo conectar. Mostrando horario por defecto.";
        horario = HORARIO_POR_DEFECTO.map((p, i) => ({ ...p, id: i }));
        renderHorario();
        return;
    }

    if (!data) {
        await sembrarHorarioPorDefecto();
        return;
    }

    idFilaHorario = data.id;
    horario = periodosDesdeFila(data);
    estadoSincronizacion.textContent = "✅ Sincronizado en tiempo real";
    renderHorario();
}

async function sembrarHorarioPorDefecto() {
    const { data, error } = await supabase
        .from(TABLA)
        .insert({ periodos: HORARIO_POR_DEFECTO })
        .select("*")
        .maybeSingle();

    if (error) {
        console.error(error);
        estadoSincronizacion.textContent = "⚠ No se pudo crear el horario inicial.";
        horario = HORARIO_POR_DEFECTO.map((p, i) => ({ ...p, id: i }));
        renderHorario();
        return;
    }
    idFilaHorario = data.id;
    horario = periodosDesdeFila(data);
    estadoSincronizacion.textContent = "✅ Sincronizado en tiempo real";
    renderHorario();
}

// Guarda TODO el arreglo de períodos de una vez en la fila única (así es como funciona
// el esquema real: no hay insert/delete de filas por período, solo update de "periodos").
async function guardarHorarioEnSupabase(elementoParaResaltar) {
    guardadosPendientes++;
    mostrarEstadoGuardado("guardando");

    const periodosParaGuardar = horario.map(({ id, ...resto }) => resto);
    const { error } = await supabase
        .from(TABLA)
        .update({ periodos: periodosParaGuardar, actualizado_en: new Date().toISOString() })
        .eq("id", idFilaHorario);

    guardadosPendientes = Math.max(0, guardadosPendientes - 1);

    if (error) {
        console.error(error);
        mostrarEstadoGuardado("error");
        return;
    }

    if (guardadosPendientes === 0) mostrarEstadoGuardado("guardado");

    if (elementoParaResaltar) {
        elementoParaResaltar.classList.add("campo-guardado");
        setTimeout(() => elementoParaResaltar.classList.remove("campo-guardado"), 700);
    }
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
    // refleja el cambio localmente al instante (sin esperar el eco de tiempo real)
    const periodoLocal = horario.find((p) => p.id === id);
    if (periodoLocal) Object.assign(periodoLocal, cambios);

    await guardarHorarioEnSupabase(elementoParaResaltar);
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
    const nuevoId = horario.length ? Math.max(...horario.map((p) => p.id)) + 1 : 0;
    horario.push({ id: nuevoId, nombre: "Nuevo periodo", inicio: "12:00", fin: "12:40" });
    renderHorario();
    await guardarHorarioEnSupabase();
}

async function borrarPeriodo(id) {
    horario = horario.filter((p) => p.id !== id);
    renderHorario();
    await guardarHorarioEnSupabase();
}

async function restaurarHorario() {
    if (!confirm("¿Restaurar el horario por defecto? Se perderán los cambios para todos.")) return;
    horario = HORARIO_POR_DEFECTO.map((p, i) => ({ ...p, id: i }));
    renderHorario();
    await guardarHorarioEnSupabase();
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
    const picoVolumen = Math.max(0.001, 0.3 * volumenActual);
    osc.type = tipo;
    osc.frequency.value = frecuencia;
    gain.gain.setValueAtTime(0.001, inicio);
    gain.gain.exponentialRampToValueAtTime(picoVolumen, inicio + 0.02);
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

btnProbarTimbre.addEventListener("click", () => {
    // Si el modo "sonar hasta apagar" está activado, la prueba también debe
    // sonar en bucle (para poder probar el botón "Detener"); si no, un solo toque.
    if (modoBucleActivo) {
        iniciarBucleTimbre("inicio", "Prueba de timbre");
    } else {
        reproducirTimbrePrincipal();
    }
});

selectorSonido.addEventListener("change", () => {
    localStorage.setItem(CLAVE_SONIDO, selectorSonido.value);
});
const sonidoGuardado = localStorage.getItem(CLAVE_SONIDO);
if (sonidoGuardado) selectorSonido.value = sonidoGuardado;

// --- Control de volumen (Etapa 4) — por dispositivo ---
const volumenGuardado = localStorage.getItem(CLAVE_VOLUMEN);
if (volumenGuardado !== null) volumenActual = Number(volumenGuardado) / 100;
if (sliderVolumen) {
    sliderVolumen.value = Math.round(volumenActual * 100);
    sliderVolumen.addEventListener("input", () => {
        volumenActual = Number(sliderVolumen.value) / 100;
        localStorage.setItem(CLAVE_VOLUMEN, sliderVolumen.value);
    });
}

btnActivarTimbre.addEventListener("click", () => {
    asegurarAudioCtx();
    reproducirTono(660, 200, "sine"); // confirmación
    sonidoActivo = true;
    zonaActivarTimbre.classList.add("oculto");
    avisoActivoTimbre.classList.add("mostrar");
    // Desbloquea la síntesis de voz en navegadores que la requieren dentro
    // de un toque del usuario (varios navegadores móviles).
    if ("speechSynthesis" in window) {
        const desbloqueo = new SpeechSynthesisUtterance(" ");
        desbloqueo.volume = 0;
        window.speechSynthesis.speak(desbloqueo);
    }
});

// =========================================================
// BANNER GRANDE DE ALERTA (Etapa 2)
// Aviso visual en pantalla completa de ancho, además del sonido —
// útil para quien tiene el volumen bajo o está lejos del dispositivo.
// =========================================================

const DURACION_BANNER_MS = 8000;

const ICONOS_BANNER = {
    inicio: "🔔",
    aviso: "⏳",
    "aviso-urgente": "⚠️",
    fin: "🔔",
};

let bannerTimeoutId = null;

// tipo: "inicio" | "aviso" | "aviso-urgente" | "fin"
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

// =========================================================
// ANUNCIO POR VOZ DE CADA PERIODO
// Dice en voz alta el nombre del periodo que empieza o termina
// ("Comienza el Segundo Periodo", "Terminó el Tercer Periodo"...),
// además del timbre — útil para saber de inmediato en qué periodo se está.
// =========================================================

const ORDINALES = ["", "Primer", "Segundo", "Tercer", "Cuarto", "Quinto",
    "Sexto", "Séptimo", "Octavo", "Noveno", "Décimo"];

// Convierte "Periodo 2" en "Segundo Periodo" para que se escuche más natural;
// nombres personalizados (ej. "Recreo") se anuncian tal cual.
function nombreParaVoz(nombre) {
    const coincide = /^periodo\s+(\d+)$/i.exec((nombre || "").trim());
    if (coincide) {
        const n = Number(coincide[1]);
        if (ORDINALES[n]) return `${ORDINALES[n]} Periodo`;
    }
    return nombre;
}

let anuncioVozActivo = localStorage.getItem(CLAVE_VOZ) !== "0"; // activado por defecto

if (switchAnuncioVoz) {
    switchAnuncioVoz.checked = anuncioVozActivo;
    switchAnuncioVoz.addEventListener("change", () => {
        anuncioVozActivo = switchAnuncioVoz.checked;
        localStorage.setItem(CLAVE_VOZ, anuncioVozActivo ? "1" : "0");
        if (!anuncioVozActivo && "speechSynthesis" in window) window.speechSynthesis.cancel();
    });
}

function anunciarPorVoz(texto) {
    if (!anuncioVozActivo) return;
    if (!sonidoActivo) return; // requiere que ya se haya activado el audio en este dispositivo
    if (!("speechSynthesis" in window)) return;
    try {
        window.speechSynthesis.cancel(); // corta un anuncio anterior si todavía estaba sonando
        const utterancia = new SpeechSynthesisUtterance(texto);
        utterancia.lang = "es-ES";
        utterancia.rate = 0.95;
        window.speechSynthesis.speak(utterancia);
    } catch {
        // si el navegador no soporta voz, simplemente no se anuncia
    }
}

// =========================================================
// AVISOS PREVIOS CONFIGURABLES (personal de cada dispositivo/usuario)
// Cada quien elige con cuántos minutos de anticipación quiere que
// avise antes de que termine el periodo (15, 10, 5, 2 y/o 1 minuto).
// Se guarda solo en este navegador, no se sincroniza con Supabase.
// =========================================================

function obtenerMinutosAvisoGuardados() {
    const crudo = localStorage.getItem(CLAVE_AVISOS_MINUTOS);
    if (!crudo) return [...MINUTOS_AVISO_POR_DEFECTO];
    try {
        const lista = JSON.parse(crudo);
        if (!Array.isArray(lista)) return [...MINUTOS_AVISO_POR_DEFECTO];
        return lista.filter((m) => MINUTOS_AVISO_DISPONIBLES.includes(m));
    } catch {
        return [...MINUTOS_AVISO_POR_DEFECTO];
    }
}

let minutosAvisoActivos = obtenerMinutosAvisoGuardados();

function guardarMinutosAviso() {
    localStorage.setItem(CLAVE_AVISOS_MINUTOS, JSON.stringify(minutosAvisoActivos));
}

if (checksAvisoMinuto.length) {
    checksAvisoMinuto.forEach((chk) => {
        chk.checked = minutosAvisoActivos.includes(Number(chk.value));
        chk.addEventListener("change", () => {
            const valor = Number(chk.value);
            if (chk.checked) {
                if (!minutosAvisoActivos.includes(valor)) minutosAvisoActivos.push(valor);
            } else {
                minutosAvisoActivos = minutosAvisoActivos.filter((m) => m !== valor);
            }
            guardarMinutosAviso();
        });
    });
}

if (btnAvisosMinutos && panelAvisosMinutos) {
    btnAvisosMinutos.addEventListener("click", () => {
        panelAvisosMinutos.classList.toggle("oculto");
    });
}
if (btnCerrarAvisosMinutos && panelAvisosMinutos) {
    btnCerrarAvisosMinutos.addEventListener("click", () => {
        panelAvisosMinutos.classList.add("oculto");
    });
}

// Dispara el aviso del timbre principal (inicio/fin de periodo): banner
// siempre visible; sonido en bucle si el modo está activo y ya se activó
// el sonido en este dispositivo, o un solo toque en caso contrario.
// tipo: "inicio" | "fin" — nombrePeriodo: nombre tal como está en el horario (ej. "Periodo 2")
function activarAvisoPrincipal(tipo, texto, nombrePeriodo) {
    enviarNotificacionNavegador(texto);
    if (tipo === "inicio") anunciarPorVoz(`Comienza el ${nombreParaVoz(nombrePeriodo)}`);
    else if (tipo === "fin") anunciarPorVoz(`Terminó el ${nombreParaVoz(nombrePeriodo)}`);
    if (modoBucleActivo && sonidoActivo) {
        iniciarBucleTimbre(tipo, texto);
    } else {
        mostrarBanner(tipo, texto);
        if (sonidoActivo) reproducirTimbrePrincipal();
    }
}

// =========================================================
// NOTIFICACIONES DEL NAVEGADOR (Etapa 4)
// Aviso fuera de la pestaña (con la pantalla bloqueada o en otra app),
// además del banner en pantalla — solo se envía si la pestaña NO está
// a la vista, porque si está visible ya se ve el banner.
// =========================================================

let notificacionesActivas = false;

function esIOSSinInstalar() {
    const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const enStandalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        window.navigator.standalone === true;
    return esIOS && !enStandalone;
}

if (btnActivarNotificaciones) {
    if (esIOSSinInstalar() && avisoNotificacionesIOS) {
        avisoNotificacionesIOS.classList.remove("oculto");
    }

    if (!("Notification" in window)) {
        btnActivarNotificaciones.disabled = true;
        btnActivarNotificaciones.textContent = "🔕 Notificaciones no disponibles en este navegador";
    } else {
        if (Notification.permission === "granted") {
            notificacionesActivas = true;
            btnActivarNotificaciones.textContent = "✅ Notificaciones activadas";
            btnActivarNotificaciones.disabled = true;
        } else if (Notification.permission === "denied") {
            btnActivarNotificaciones.textContent = "⚠️ Notificaciones bloqueadas — actívalas desde el navegador";
        }

        btnActivarNotificaciones.addEventListener("click", async () => {
            const permiso = await Notification.requestPermission();
            if (permiso === "granted") {
                notificacionesActivas = true;
                btnActivarNotificaciones.textContent = "✅ Notificaciones activadas";
                btnActivarNotificaciones.disabled = true;
            } else {
                btnActivarNotificaciones.textContent = "⚠️ Permiso denegado — actívalo desde el navegador";
            }
        });
    }
}

function enviarNotificacionNavegador(texto) {
    if (!notificacionesActivas) return;
    if (document.visibilityState === "visible") return; // ya se ve el banner
    try {
        const n = new Notification("🔔 Control de Timbre — El Jiral", { body: texto, tag: "timbre-jiral" });
        n.onclick = () => {
            window.focus();
            n.close();
        };
    } catch {
        // algunos navegadores móviles requieren Service Worker; se ignora en silencio
    }
}

// =========================================================
// MODO CARTELERA (Etapa 4)
// Vista a pantalla completa, con letras gigantes, pensada para dejar
// una tablet o pantalla fija en la oficina de dirección.
// =========================================================

function activarModoCartelera() {
    document.body.classList.add("modo-cartelera");
    if (btnSalirCartelera) btnSalirCartelera.classList.remove("oculto");
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
}

function salirModoCartelera() {
    document.body.classList.remove("modo-cartelera");
    if (btnSalirCartelera) btnSalirCartelera.classList.add("oculto");
    if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
    }
}

if (btnModoCartelera) btnModoCartelera.addEventListener("click", activarModoCartelera);
if (btnSalirCartelera) btnSalirCartelera.addEventListener("click", salirModoCartelera);

// Si el usuario sale de pantalla completa (ej. con Esc), también salimos
// visualmente del modo cartelera para no dejarlo "a medias".
document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && document.body.classList.contains("modo-cartelera")) {
        salirModoCartelera();
    }
});

// =========================================================
// RELOJ Y REVISIÓN DEL HORARIO
// =========================================================

function horaTexto(fecha) {
    return fecha.toLocaleTimeString("es-PA", { hour12: true });
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

// =========================================================
// CUENTA REGRESIVA DEL PERIODO ACTUAL / SIGUIENTE (Etapa 4)
// =========================================================

function aSegundosDelDia(hhmmTexto) {
    const [h, m] = hhmmTexto.split(":").map(Number);
    return h * 3600 + m * 60;
}

function formatoRestante(segundos) {
    const s = Math.max(0, Math.round(segundos));
    const m = Math.floor(s / 60);
    const ss = s % 60;
    return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function actualizarCuentaRegresiva() {
    if (!cuentaRegresiva) return;
    if (!horario.length) {
        cuentaRegresiva.textContent = "";
        cuentaRegresiva.classList.remove("cuenta-aviso5", "cuenta-aviso1");
        return;
    }

    const ahora = new Date();
    const actual = hhmm(ahora);
    const segundosHoy = ahora.getHours() * 3600 + ahora.getMinutes() * 60 + ahora.getSeconds();

    const enCurso = horario.find((p) => actual >= p.inicio && actual < p.fin);
    let texto;
    let restanteSeg = null;

    if (enCurso) {
        restanteSeg = aSegundosDelDia(enCurso.fin) - segundosHoy;
        texto = `${enCurso.nombre} — termina en ${formatoRestante(restanteSeg)}`;
    } else {
        const siguiente = horario
            .filter((p) => p.inicio > actual)
            .sort((a, b) => a.inicio.localeCompare(b.inicio))[0];
        if (siguiente) {
            restanteSeg = aSegundosDelDia(siguiente.inicio) - segundosHoy;
            texto = `Siguiente: ${siguiente.nombre} — empieza en ${formatoRestante(restanteSeg)}`;
        } else {
            texto = "Fuera de horario";
        }
    }

    cuentaRegresiva.textContent = texto;
    cuentaRegresiva.classList.remove("cuenta-aviso5", "cuenta-aviso1");
    if (restanteSeg !== null) {
        if (restanteSeg <= 60) cuentaRegresiva.classList.add("cuenta-aviso1");
        else if (restanteSeg <= 300) cuentaRegresiva.classList.add("cuenta-aviso5");
    }
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
        const claveInicio = `${claveDia}-${periodo.inicio}-inicio-${periodo.id}`;
        const claveFin = `${claveDia}-${periodo.fin}-fin-${periodo.id}`;

        // El banner visual aparece siempre (no depende de que el sonido esté
        // activado); el sonido solo se reproduce si el usuario ya lo activó.
        if (actual === periodo.inicio && !yaTocados.has(claveInicio)) {
            yaTocados.add(claveInicio);
            estadoTimbre.textContent = `🔔 ${periodo.nombre} — inicio (${periodo.inicio})`;
            activarAvisoPrincipal("inicio", `Inicia ${periodo.nombre}`, periodo.nombre);
        }

        // Avisos previos configurables (personal de cada dispositivo): 15, 10, 5, 2 y/o 1 minuto antes del fin.
        minutosAvisoActivos.forEach((minutos) => {
            const horaAviso = restarMinutos(periodo.fin, minutos);
            const claveAviso = `${claveDia}-${periodo.fin}-aviso${minutos}-${periodo.id}`;
            if (actual !== horaAviso || yaTocados.has(claveAviso)) return;
            yaTocados.add(claveAviso);

            const urgente = minutos <= 1;
            const textoMinutos = minutos === 1 ? "1 minuto" : `${minutos} minutos`;
            const texto = `${periodo.nombre} termina en ${textoMinutos}`;

            estadoTimbre.textContent = `⏳ ${texto}`;
            mostrarBanner(urgente ? "aviso-urgente" : "aviso", texto);
            enviarNotificacionNavegador(texto);
            if (sonidoActivo) {
                if (urgente) reproducirPitidoLargo();
                else reproducirAviso();
            }
        });

        if (actual === periodo.fin && !yaTocados.has(claveFin)) {
            yaTocados.add(claveFin);
            estadoTimbre.textContent = `🔔 ${periodo.nombre} — fin (${periodo.fin})`;
            activarAvisoPrincipal("fin", `Terminó ${periodo.nombre}`, periodo.nombre);
        }
    });
}

// =========================================================
// DESCARGAR / INSTALAR LA APP EN EL CELULAR
// =========================================================

let eventoInstalacionPWA = null;

function appYaInstalada() {
    return window.matchMedia("(display-mode: standalone)").matches
        || window.navigator.standalone === true; // Safari en iOS
}

function esIOS() {
    return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

// Chrome/Android/escritorio: el navegador avisa cuando la app se puede instalar.
window.addEventListener("beforeinstallprompt", (evento) => {
    evento.preventDefault();
    eventoInstalacionPWA = evento;
    if (!appYaInstalada() && btnDescargarApp) btnDescargarApp.classList.remove("oculto");
});

// iOS no dispara "beforeinstallprompt": mostramos el botón igual y,
// al tocarlo, explicamos el paso manual de Safari.
if (esIOS() && !appYaInstalada() && btnDescargarApp) {
    btnDescargarApp.classList.remove("oculto");
}

if (btnDescargarApp) {
    btnDescargarApp.addEventListener("click", async () => {
        if (eventoInstalacionPWA) {
            eventoInstalacionPWA.prompt();
            await eventoInstalacionPWA.userChoice;
            eventoInstalacionPWA = null;
            btnDescargarApp.classList.add("oculto");
        } else if (esIOS()) {
            if (panelInstalarIOS) panelInstalarIOS.classList.remove("oculto");
        }
    });
}

if (btnCerrarInstalarIOS) {
    btnCerrarInstalarIOS.addEventListener("click", () => {
        panelInstalarIOS.classList.add("oculto");
    });
}

window.addEventListener("appinstalled", () => {
    if (btnDescargarApp) btnDescargarApp.classList.add("oculto");
});

setInterval(() => {
    relojActual.textContent = horaTexto(new Date());
    revisarHorario();
    actualizarCuentaRegresiva();
}, 1000);

// =========================================================
// INICIO
// =========================================================

cargarHorario();
