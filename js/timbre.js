// =========================================================
// CONTROL DE TIMBRE — acceso independiente (no usa Supabase)
// =========================================================

const CEDULA_VALIDA = "1-111-11";
const CLAVE_VALIDA = "000000";

const CLAVE_SESION = "timbre_sesion_jiral";
const CLAVE_HORARIO = "timbre_horario_jiral";

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

const pantallaLogin = document.getElementById("pantallaLogin");
const panelTimbre = document.getElementById("panelTimbre");
const cedulaTimbre = document.getElementById("cedulaTimbre");
const claveTimbre = document.getElementById("claveTimbre");
const btnEntrarTimbre = document.getElementById("btnEntrarTimbre");
const errorLoginTimbre = document.getElementById("errorLoginTimbre");
const btnSalirTimbre = document.getElementById("btnSalirTimbre");

const relojActual = document.getElementById("relojActual");
const zonaActivarTimbre = document.getElementById("zonaActivarTimbre");
const btnActivarTimbre = document.getElementById("btnActivarTimbre");
const avisoActivoTimbre = document.getElementById("avisoActivoTimbre");
const btnProbarTimbre = document.getElementById("btnProbarTimbre");
const btnAgregarPeriodo = document.getElementById("btnAgregarPeriodo");
const btnRestaurarHorario = document.getElementById("btnRestaurarHorario");
const cuerpoHorarioTimbre = document.getElementById("cuerpoHorarioTimbre");
const estadoTimbre = document.getElementById("estadoTimbre");

let horario = [];
let sonidoActivo = false;
let audioCtx = null;
let yaTocados = new Set(); // se reinicia cada día

// =========================================================
// LOGIN
// =========================================================

function mostrarPanel() {
    pantallaLogin.classList.add("oculto");
    panelTimbre.classList.remove("oculto");
    cargarHorario();
    renderHorario();
}

function mostrarLogin() {
    panelTimbre.classList.add("oculto");
    pantallaLogin.classList.remove("oculto");
}

btnEntrarTimbre.addEventListener("click", () => {
    const cedula = cedulaTimbre.value.trim();
    const clave = claveTimbre.value.trim();
    if (cedula === CEDULA_VALIDA && clave === CLAVE_VALIDA) {
        localStorage.setItem(CLAVE_SESION, "1");
        errorLoginTimbre.classList.add("oculto");
        mostrarPanel();
    } else {
        errorLoginTimbre.classList.remove("oculto");
    }
});

btnSalirTimbre.addEventListener("click", () => {
    localStorage.removeItem(CLAVE_SESION);
    mostrarLogin();
});

if (localStorage.getItem(CLAVE_SESION) === "1") {
    mostrarPanel();
}

// =========================================================
// HORARIO (se guarda en este navegador/computadora)
// =========================================================

function cargarHorario() {
    const guardado = localStorage.getItem(CLAVE_HORARIO);
    if (guardado) {
        try {
            horario = JSON.parse(guardado);
        } catch {
            horario = [...HORARIO_POR_DEFECTO];
        }
    } else {
        horario = [...HORARIO_POR_DEFECTO];
    }
}

function guardarHorario() {
    localStorage.setItem(CLAVE_HORARIO, JSON.stringify(horario));
}

function renderHorario() {
    cuerpoHorarioTimbre.innerHTML = "";
    horario.forEach((periodo, i) => {
        const fila = document.createElement("tr");
        fila.className = "fila-periodo";
        fila.innerHTML = `
            <td><input type="text" class="form-control form-control-sm campo-nombre" value="${periodo.nombre}"></td>
            <td><input type="time" class="form-control form-control-sm campo-inicio" value="${periodo.inicio}"></td>
            <td><input type="time" class="form-control form-control-sm campo-fin" value="${periodo.fin}"></td>
            <td><button type="button" class="btn btn-outline-danger btn-sm btn-borrar-periodo">✕</button></td>
        `;
        fila.querySelector(".campo-nombre").addEventListener("input", (e) => {
            horario[i].nombre = e.target.value;
            guardarHorario();
        });
        fila.querySelector(".campo-inicio").addEventListener("change", (e) => {
            horario[i].inicio = e.target.value;
            guardarHorario();
        });
        fila.querySelector(".campo-fin").addEventListener("change", (e) => {
            horario[i].fin = e.target.value;
            guardarHorario();
        });
        fila.querySelector(".btn-borrar-periodo").addEventListener("click", () => {
            horario.splice(i, 1);
            guardarHorario();
            renderHorario();
        });
        cuerpoHorarioTimbre.appendChild(fila);
    });
}

btnAgregarPeriodo.addEventListener("click", () => {
    horario.push({ nombre: "Nuevo periodo", inicio: "12:00", fin: "12:40" });
    guardarHorario();
    renderHorario();
});

btnRestaurarHorario.addEventListener("click", () => {
    if (!confirm("¿Restaurar el horario por defecto? Se perderán tus cambios.")) return;
    horario = [...HORARIO_POR_DEFECTO];
    guardarHorario();
    renderHorario();
});

// =========================================================
// SONIDO
// =========================================================

function reproducirTono(frecuencia, duracionMs, tipo = "sine") {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = tipo;
    osc.frequency.value = frecuencia;
    gain.gain.setValueAtTime(0.001, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, audioCtx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duracionMs / 1000);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duracionMs / 1000);
}

function reproducirCampana() {
    // campana: tres tonos graves seguidos
    reproducirTono(660, 350, "sine");
    setTimeout(() => reproducirTono(660, 350, "sine"), 420);
    setTimeout(() => reproducirTono(660, 500, "sine"), 840);
}

function reproducirAviso() {
    // aviso 5 min antes: dos tonos agudos cortos
    reproducirTono(1200, 200, "square");
    setTimeout(() => reproducirTono(1200, 200, "square"), 260);
}

btnActivarTimbre.addEventListener("click", () => {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    reproducirTono(660, 200, "sine"); // sonido corto de confirmación
    sonidoActivo = true;
    zonaActivarTimbre.classList.add("oculta");
    avisoActivoTimbre.classList.add("mostrar");
});

btnProbarTimbre.addEventListener("click", () => {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    reproducirCampana();
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
    const claveDia = ahora.toISOString().slice(0, 10); // reinicia yaTocados cada día

    if (!revisarHorario._dia || revisarHorario._dia !== claveDia) {
        revisarHorario._dia = claveDia;
        yaTocados = new Set();
    }

    // marcar fila en curso visualmente
    const filas = cuerpoHorarioTimbre.querySelectorAll(".fila-periodo");
    horario.forEach((periodo, i) => {
        const enCurso = actual >= periodo.inicio && actual < periodo.fin;
        if (filas[i]) filas[i].classList.toggle("en-curso", enCurso);
    });

    if (!sonidoActivo) return;

    horario.forEach((periodo) => {
        const avisoHora = restarMinutos(periodo.fin, 5);
        const claveInicio = `${claveDia}-${periodo.inicio}-inicio`;
        const claveAviso = `${claveDia}-${periodo.fin}-aviso`;
        const claveFin = `${claveDia}-${periodo.fin}-fin`;

        if (actual === periodo.inicio && !yaTocados.has(claveInicio)) {
            reproducirCampana();
            yaTocados.add(claveInicio);
            estadoTimbre.textContent = `🔔 ${periodo.nombre} — inicio (${periodo.inicio})`;
        }
        if (actual === avisoHora && !yaTocados.has(claveAviso)) {
            reproducirAviso();
            yaTocados.add(claveAviso);
            estadoTimbre.textContent = `⏳ ${periodo.nombre} termina en 5 minutos`;
        }
        if (actual === periodo.fin && !yaTocados.has(claveFin)) {
            reproducirCampana();
            yaTocados.add(claveFin);
            estadoTimbre.textContent = `🔔 ${periodo.nombre} — fin (${periodo.fin})`;
        }
    });
}

setInterval(() => {
    relojActual.textContent = horaTexto(new Date());
    if (!panelTimbre.classList.contains("oculto")) {
        revisarHorario();
    }
}, 1000);
