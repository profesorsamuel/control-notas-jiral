import { supabase } from "./supabase.js";
import { obtenerRolesDeCuenta } from "./roles.js";

// =========================================================
// Horario por profesor (solo ADMIN).
//
// Igual que "Horario por salón", pero aquí el admin elige un
// profesor(a) de la lista y ve/edita SU horario completo en un
// solo lugar, sobre la misma tabla "horario_profesor" que usa
// "Mi horario" (mi_horario.js) cuando cada profesor llena el
// suyo por su cuenta. Así el admin puede armar o corregir el
// horario de cualquier docente sin depender de que él mismo
// entre a hacerlo.
//
// El horario que ven estudiantes y el Monitor de estudiantes
// (horario_semanal.js) combina esta tabla con lo que el admin
// ya haya cargado en horario_salon.
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

const NOMBRES_DIA = { lunes: "Lunes", martes: "Martes", miercoles: "Miércoles", jueves: "Jueves", viernes: "Viernes" };
const DIAS_ORDEN = ["lunes", "martes", "miercoles", "jueves", "viernes"];

function claveDiaFranja(dia, franjaId) {
    return `${dia}-${franjaId}`;
}

// =========================================================
// ELEMENTOS
// =========================================================

const selectProfesor = document.getElementById("selectProfesor");
const sinProfesor = document.getElementById("sinProfesor");
const contenedorTabla = document.getElementById("contenedorTabla");
const cuerpoTablaHorario = document.getElementById("cuerpoTablaHorario");
const estadoHorario = document.getElementById("estadoHorario");

const fondoModalBloque = document.getElementById("fondoModalBloque");
const tituloModalBloque = document.getElementById("tituloModalBloque");
const selectTipoBloque = document.getElementById("selectTipoBloque");
const campoMateriaSalon = document.getElementById("campoMateriaSalon");
const selectMateriaSalonBloque = document.getElementById("selectMateriaSalonBloque");
const campoTextoLibre = document.getElementById("campoTextoLibre");
const inputTextoBloque = document.getElementById("inputTextoBloque");
const btnEliminarBloqueModal = document.getElementById("btnEliminarBloqueModal");
const btnCancelarBloqueModal = document.getElementById("btnCancelarBloqueModal");
const btnGuardarBloqueModal = document.getElementById("btnGuardarBloqueModal");

let correoProfesorActual = "";
let nombreProfesorActual = "";
let franjas = [];
let horarioPorClave = {};
let bloqueEnEdicion = null;

let profesoresCache = [];       // [{correo_profesor, nombre_profesor}]
let misMateriasSalones = [];    // [{materia, salon}] del profesor seleccionado

// =========================================================
// 1) VERIFICAR ACCESO (solo admin)
// =========================================================

async function verificarAcceso() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
        window.location.href = "login.html";
        return false;
    }

    const { esAdmin } = await obtenerRolesDeCuenta(user.id, user.email);
    if (esAdmin) return true;

    alert("⛔ Esta página es solo para administradores.");
    window.location.href = "login.html";
    return false;
}

// =========================================================
// 2) CARGAR PROFESORES Y FRANJAS
// =========================================================

async function cargarProfesores() {
    const { data, error } = await supabase
        .from("profesores")
        .select("correo_profesor, nombre_profesor")
        .order("nombre_profesor", { ascending: true });

    if (error) {
        console.error("❌ Error al cargar profesores:", error);
        selectProfesor.innerHTML = `<option value="">Error al cargar profesores</option>`;
        return [];
    }
    return data || [];
}

function poblarSelectProfesores() {
    selectProfesor.innerHTML = `<option value="">Selecciona un profesor(a)</option>` +
        profesoresCache.map((p) =>
            `<option value="${escapeHtml(p.correo_profesor)}" data-nombre="${escapeHtml(p.nombre_profesor || p.correo_profesor)}">${escapeHtml(p.nombre_profesor || p.correo_profesor)}</option>`
        ).join("");
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

// Materias/salones reales asignados a este profesor (tabla profesor_materias,
// la misma que llena el admin en "Asignaciones"), para no escribir nada a mano.
async function cargarMisMateriasSalones(correo) {
    const { data, error } = await supabase
        .from("profesor_materias")
        .select("materia, salon")
        .eq("correo_profesor", correo);

    if (error) {
        console.error("❌ Error al cargar materias/salones asignados:", error);
        return [];
    }

    const combos = new Map();
    (data || []).forEach((m) => {
        if (m.materia && m.salon) combos.set(`${m.materia}|||${m.salon}`, { materia: m.materia, salon: m.salon });
    });

    return [...combos.values()].sort((a, b) => a.materia.localeCompare(b.materia) || a.salon.localeCompare(b.salon));
}

function poblarSelectMateriaSalon() {
    if (misMateriasSalones.length === 0) {
        selectMateriaSalonBloque.innerHTML = `<option value="">Este profesor(a) no tiene materias asignadas — asígnaselas en "Asignaciones"</option>`;
        return;
    }
    selectMateriaSalonBloque.innerHTML = misMateriasSalones
        .map((c) => `<option value="${escapeHtml(c.materia)}|||${escapeHtml(c.salon)}">${escapeHtml(c.materia)} — ${escapeHtml(c.salon)}</option>`)
        .join("");
}

async function cargarHorarioGuardado(correo) {
    const { data, error } = await supabase
        .from("horario_profesor")
        .select("id, dia, franja_id, texto, tipo, materia, salon, correo_profesor")
        .eq("correo_profesor", correo);

    if (error) {
        estadoHorario.textContent = "❌ Error al cargar el horario: " + error.message;
        estadoHorario.className = "text-danger";
        return {};
    }

    const mapa = {};
    (data || []).forEach((fila) => {
        mapa[claveDiaFranja(fila.dia, fila.franja_id)] = fila;
    });
    return mapa;
}

// =========================================================
// 3) DIBUJAR LA CUADRÍCULA
// =========================================================

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
                        <div class="celda-bloque ${claseTipo}" data-dia="${dia}" data-franja="${franja.id}">
                            <button type="button" class="btn-borrar-bloque" data-id="${fila.id}" title="Eliminar">✕</button>
                            <span>${escapeHtml(fila.texto)}</span>
                        </div>
                    </td>`;
            }
            return `
                <td>
                    <div class="celda-vacia" data-dia="${dia}" data-franja="${franja.id}">+</div>
                </td>`;
        }).join("");

        return `<tr><td class="col-hora">${horaTexto}</td>${celdasDias}</tr>`;
    }).join("");

    cuerpoTablaHorario.querySelectorAll(".celda-bloque").forEach((celda) => {
        celda.addEventListener("click", (e) => {
            if (e.target.closest(".btn-borrar-bloque")) return;
            abrirModal(celda.dataset.dia, parseInt(celda.dataset.franja, 10));
        });
    });

    cuerpoTablaHorario.querySelectorAll(".celda-vacia").forEach((celda) => {
        celda.addEventListener("click", () => {
            abrirModal(celda.dataset.dia, parseInt(celda.dataset.franja, 10));
        });
    });

    cuerpoTablaHorario.querySelectorAll(".btn-borrar-bloque").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            if (!confirm("¿Eliminar este bloque del horario?")) return;
            await eliminarBloque(btn.dataset.id);
        });
    });
}

// =========================================================
// 4) MODAL: AGREGAR / EDITAR / ELIMINAR UN BLOQUE
// =========================================================

function alternarCamposModal() {
    const esClase = selectTipoBloque.value === "clase";
    campoMateriaSalon.classList.toggle("d-none", !esClase);
    campoTextoLibre.classList.toggle("d-none", esClase);
}

selectTipoBloque.addEventListener("change", alternarCamposModal);

function abrirModal(dia, franjaId) {
    const filaExistente = horarioPorClave[claveDiaFranja(dia, franjaId)] || null;
    bloqueEnEdicion = { dia, franjaId, filaExistente };

    const franja = franjas.find((f) => f.id === franjaId);
    const horaTexto = franja ? `${formatearHora12(franja.hora_inicio)} – ${formatearHora12(franja.hora_fin)}` : "";

    tituloModalBloque.textContent = `${NOMBRES_DIA[dia]} · ${horaTexto} · ${nombreProfesorActual}`;
    selectTipoBloque.value = filaExistente?.tipo || "clase";
    alternarCamposModal();

    poblarSelectMateriaSalon();

    if (filaExistente?.tipo !== "otro") {
        const claveExistente = filaExistente?.materia && filaExistente?.salon
            ? `${filaExistente.materia}|||${filaExistente.salon}`
            : null;

        if (claveExistente && [...selectMateriaSalonBloque.options].some((o) => o.value === claveExistente)) {
            selectMateriaSalonBloque.value = claveExistente;
        }
    }

    inputTextoBloque.value = filaExistente?.tipo === "otro" ? (filaExistente?.texto || "") : "";

    btnEliminarBloqueModal.classList.toggle("d-none", !filaExistente);

    fondoModalBloque.classList.add("mostrar");
}

function cerrarModal() {
    fondoModalBloque.classList.remove("mostrar");
    bloqueEnEdicion = null;
}

btnCancelarBloqueModal.addEventListener("click", cerrarModal);
fondoModalBloque.addEventListener("click", (e) => {
    if (e.target === fondoModalBloque) cerrarModal();
});

btnGuardarBloqueModal.addEventListener("click", async () => {
    if (!bloqueEnEdicion || !correoProfesorActual) return;

    const { dia, franjaId } = bloqueEnEdicion;
    const tipo = selectTipoBloque.value;

    let texto = "";
    let materia = null;
    let salon = null;

    if (tipo === "clase") {
        const valorCombo = selectMateriaSalonBloque.value;
        if (!valorCombo) {
            alert("Elige una materia/salón de la lista. Si no aparece la que buscas, asígnasela primero en \"Asignaciones\".");
            return;
        }
        [materia, salon] = valorCombo.split("|||");
        texto = `${materia} ${salon}`.trim();
    } else {
        texto = inputTextoBloque.value.trim();
        if (!texto) {
            alert("Escribe qué va en este bloque.");
            return;
        }
    }

    const { data, error } = await supabase
        .from("horario_profesor")
        .upsert(
            [{
                correo_profesor: correoProfesorActual,
                nombre_profesor: nombreProfesorActual,
                dia,
                franja_id: franjaId,
                texto,
                tipo,
                materia,
                salon,
                actualizado_en: new Date().toISOString(),
            }],
            { onConflict: "correo_profesor,dia,franja_id" }
        )
        .select()
        .single();

    if (error) {
        alert("❌ Error al guardar: " + error.message);
        return;
    }

    horarioPorClave[claveDiaFranja(dia, franjaId)] = data;
    dibujarTabla();
    cerrarModal();
    mostrarEstado("✅ Guardado.");
});

btnEliminarBloqueModal.addEventListener("click", async () => {
    if (!bloqueEnEdicion?.filaExistente) return;
    if (!confirm("¿Eliminar este bloque del horario?")) return;
    await eliminarBloque(bloqueEnEdicion.filaExistente.id);
    cerrarModal();
});

async function eliminarBloque(id) {
    const { error } = await supabase.from("horario_profesor").delete().eq("id", id);
    if (error) {
        alert("❌ Error al eliminar: " + error.message);
        return;
    }
    Object.keys(horarioPorClave).forEach((clave) => {
        if (horarioPorClave[clave].id == id) delete horarioPorClave[clave];
    });
    dibujarTabla();
    mostrarEstado("🗑 Bloque eliminado.");
}

function mostrarEstado(texto) {
    estadoHorario.textContent = texto;
    estadoHorario.className = "text-success";
    setTimeout(() => { estadoHorario.textContent = ""; }, 3000);
}

// =========================================================
// 5) CAMBIO DE PROFESOR
// =========================================================

selectProfesor.addEventListener("change", async () => {
    correoProfesorActual = selectProfesor.value;
    nombreProfesorActual = selectProfesor.selectedOptions[0]?.dataset.nombre || correoProfesorActual;

    if (!correoProfesorActual) {
        sinProfesor.classList.remove("d-none");
        contenedorTabla.classList.add("d-none");
        return;
    }

    sinProfesor.classList.add("d-none");
    contenedorTabla.classList.remove("d-none");
    cuerpoTablaHorario.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">Cargando...</td></tr>`;

    [horarioPorClave, misMateriasSalones] = await Promise.all([
        cargarHorarioGuardado(correoProfesorActual),
        cargarMisMateriasSalones(correoProfesorActual),
    ]);
    dibujarTabla();
});

// =========================================================
// INICIO
// =========================================================

(async function init() {
    const ok = await verificarAcceso();
    if (!ok) return;

    franjas = await cargarFranjas();
    profesoresCache = await cargarProfesores();
    poblarSelectProfesores();
})();
