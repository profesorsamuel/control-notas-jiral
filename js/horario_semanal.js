import { supabase } from "./supabase.js";

// =========================================================
// Horario semanal, SOLO LECTURA.
//
// Se usa de dos formas:
//   1) El estudiante entra desde estudiante.html -> se busca
//      su propio salón (tabla "estudiantes" por su correo).
//   2) El administrador entra con ?salon=9A desde el monitor
//      -> se usa ese salón directamente, sin buscar estudiante.
// =========================================================

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function formatearHora12(horaTexto) {
    if (!horaTexto) return "";
    const [h, m] = horaTexto.split(":");
    const fecha = new Date();
    fecha.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0);
    return fecha.toLocaleTimeString("es-PA", { hour: "numeric", minute: "2-digit" });
}

const DIAS_ORDEN = ["lunes", "martes", "miercoles", "jueves", "viernes"];

function claveDiaFranja(dia, franjaId) {
    return `${dia}-${franjaId}`;
}

const textoSalon = document.getElementById("textoSalon");
const cuerpoTablaHorario = document.getElementById("cuerpoTablaHorario");
const estadoHorario = document.getElementById("estadoHorario");

let salon = "";
let franjas = [];
let horarioPorClave = {};

async function verificarSesionYSalon() {
    const { data: { user }, error: errUser } = await supabase.auth.getUser();

    if (errUser || !user) {
        window.location.href = "login.html";
        return false;
    }

    const parametros = new URLSearchParams(window.location.search);
    const salonDesdeUrl = parametros.get("salon");

    if (salonDesdeUrl) {
        // Vista abierta por el administrador para un salón puntual.
        salon = salonDesdeUrl.toUpperCase();
        return true;
    }

    const correo = (user.email || "").trim().toLowerCase();
    const { data: estudiante, error: errEst } = await supabase
        .from("estudiantes")
        .select("salon")
        .eq("correo", correo)
        .maybeSingle();

    if (errEst || !estudiante?.salon) {
        estadoHorario.textContent = "⛔ No se encontró un salón para esta cuenta.";
        estadoHorario.className = "text-danger";
        return false;
    }

    salon = estudiante.salon;
    return true;
}

async function cargarFranjas() {
    const { data, error } = await supabase
        .from("franjas_horario")
        .select("id, hora_inicio, hora_fin, orden, es_recreo, etiqueta")
        .order("orden", { ascending: true });

    if (error) {
        estadoHorario.textContent = "❌ Error al cargar las franjas: " + error.message;
        estadoHorario.className = "text-danger";
        return [];
    }
    return data || [];
}

async function cargarHorarioDelSalon() {
    // Se combinan dos fuentes:
    // 1) horario_profesor: lo que cada profesor va llenando en "Mi horario".
    // 2) horario_salon: lo que el administrador carga directamente para
    //    ese salón completo (pantalla "Horario por salón").
    // Si ambas tienen algo para el mismo día/franja, gana lo cargado
    // directamente por el administrador (horario_salon).
    const [resProfesor, resSalon] = await Promise.all([
        supabase
            .from("horario_profesor")
            .select("dia, franja_id, texto, tipo, materia, salon, correo_profesor")
            .eq("salon", salon),
        supabase
            .from("horario_salon")
            .select("dia, franja_id, texto, tipo, materia, salon, correo_profesor")
            .eq("salon", salon),
    ]);

    if (resProfesor.error && resSalon.error) {
        estadoHorario.textContent = "❌ Error al cargar el horario: " + (resSalon.error.message || resProfesor.error.message);
        estadoHorario.className = "text-danger";
        return {};
    }

    const mapa = {};
    (resProfesor.data || []).forEach((fila) => {
        mapa[claveDiaFranja(fila.dia, fila.franja_id)] = fila;
    });
    // horario_salon pisa lo anterior si hay choque en el mismo bloque.
    (resSalon.data || []).forEach((fila) => {
        mapa[claveDiaFranja(fila.dia, fila.franja_id)] = fila;
    });
    return mapa;
}

function dibujarTabla() {
    if (franjas.length === 0) {
        cuerpoTablaHorario.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">No hay franjas horarias configuradas todavía.</td></tr>`;
        return;
    }

    cuerpoTablaHorario.innerHTML = franjas.map((franja) => {
        const horaTexto = `${formatearHora12(franja.hora_inicio)} – ${formatearHora12(franja.hora_fin)}`;

        if (franja.es_recreo) {
            return `<tr class="fila-recreo"><td colspan="6">🍎 ${escapeHtml(franja.etiqueta || "RECREO")} 🍎</td></tr>`;
        }

        const celdasDias = DIAS_ORDEN.map((dia) => {
            const fila = horarioPorClave[claveDiaFranja(dia, franja.id)];
            if (fila) {
                const claseTipo = fila.tipo === "otro" ? "tipo-otro" : "tipo-clase";
                return `
                    <td>
                        <div class="celda-bloque ${claseTipo}">
                            <span>${escapeHtml(fila.texto)}</span>
                        </div>
                    </td>`;
            }
            return `<td><div class="celda-vacia"></div></td>`;
        }).join("");

        return `<tr><td class="col-hora">${horaTexto}</td>${celdasDias}</tr>`;
    }).join("");
}

(async function init() {
    const ok = await verificarSesionYSalon();
    if (!ok) return;

    textoSalon.textContent = salon;

    franjas = await cargarFranjas();
    horarioPorClave = await cargarHorarioDelSalon();

    dibujarTabla();
})();
