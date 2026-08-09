import { supabase } from "./supabase.js";
import { obtenerRolesDeCuenta } from "./roles.js";

// =========================================================
// Horario por salón (ADMIN o CONSEJERO(A) autorizado).
//
// A diferencia de "Mi horario" (que cada profesor llena poco a
// poco), aquí se carga el horario COMPLETO de un salón en un
// solo lugar, en la tabla independiente "horario_salon"
// (salon, dia, franja_id -> único).
//
// Puede entrar:
//  - El administrador: ve el selector con TODOS los salones.
//  - Un consejero(a) al que el admin le haya activado el
//    permiso "puede_editar_horario": solo ve y edita SU
//    propio salón (el que ya tiene asignado).
//
// El horario que ven estudiantes y el Monitor de estudiantes
// (horario_semanal.js) combina esta tabla con lo que los
// profesores ya hayan cargado en horario_profesor.
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

const selectSalon = document.getElementById("selectSalon");
const sinSalon = document.getElementById("sinSalon");
const contenedorTabla = document.getElementById("contenedorTabla");
const cuerpoTablaHorario = document.getElementById("cuerpoTablaHorario");
const estadoHorario = document.getElementById("estadoHorario");

const fondoModalBloque = document.getElementById("fondoModalBloque");
const tituloModalBloque = document.getElementById("tituloModalBloque");
const selectTipoBloque = document.getElementById("selectTipoBloque");
const campoMateriaSalon = document.getElementById("campoMateriaSalon");
const selectMateriaBloque = document.getElementById("selectMateriaBloque");
const selectProfesorBloque = document.getElementById("selectProfesorBloque");
const campoTextoLibre = document.getElementById("campoTextoLibre");
const inputTextoBloque = document.getElementById("inputTextoBloque");
const btnEliminarBloqueModal = document.getElementById("btnEliminarBloqueModal");
const btnCancelarBloqueModal = document.getElementById("btnCancelarBloqueModal");
const btnGuardarBloqueModal = document.getElementById("btnGuardarBloqueModal");

let salonActual = "";
let franjas = [];
let horarioPorClave = {};
let bloqueEnEdicion = null;
let esAdminActual = false;
let salonBloqueado = null; // si es consejero, aquí queda fijo su salón

let materiasCache = [];       // [{id, nombre, nivel_7, nivel_8, nivel_9}]
let profesoresCache = [];     // [{correo_profesor, nombre_profesor}]
let asignacionesCache = [];   // profesor_materias: [{correo_profesor, nombre_profesor, materia, salon}]

// =========================================================
// 1) VERIFICAR ACCESO (admin o consejero autorizado)
// =========================================================

async function verificarAcceso() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
        window.location.href = "login.html";
        return false;
    }

    const { esAdmin, consejeroInfo } = await obtenerRolesDeCuenta(user.id, user.email);

    if (esAdmin) {
        esAdminActual = true;
        return true;
    }

    if (consejeroInfo && consejeroInfo.puede_editar_horario && consejeroInfo.salon) {
        esAdminActual = false;
        salonBloqueado = String(consejeroInfo.salon).trim().toUpperCase();
        const enlaceRegresar = document.getElementById("enlaceRegresar");
        if (enlaceRegresar) {
            enlaceRegresar.href = "consejero.html";
            enlaceRegresar.innerHTML = "↩️ Regresar a Consejería";
        }
        return true;
    }

    alert("⛔ Esta página es solo para administradores o consejeros(as) autorizados(as).");
    window.location.href = "login.html";
    return false;
}

// =========================================================
// 2) CARGAR SALONES (mismos salones reales que tiene el sistema)
// =========================================================

async function cargarSalones() {
    if (salonBloqueado) {
        // Consejero(a): solo su propio salón, ya seleccionado y fijo.
        selectSalon.innerHTML = `<option value="${escapeHtml(salonBloqueado)}">${escapeHtml(salonBloqueado)}</option>`;
        selectSalon.disabled = true;
        return;
    }

    const { data, error } = await supabase
        .from("estudiantes")
        .select("salon")
        .eq("es_prueba", false);

    if (error) {
        console.error("❌ Error al cargar salones:", error);
        selectSalon.innerHTML = `<option value="">Error al cargar salones</option>`;
        return;
    }

    const salones = [...new Set((data || []).map(e => e.salon).filter(Boolean))].sort();

    selectSalon.innerHTML = `<option value="">Selecciona un salón</option>` +
        salones.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
}

// =========================================================
// 3) FRANJAS Y HORARIO GUARDADO DEL SALÓN
// =========================================================

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

// Catálogo de materias reales (el mismo que se administra en
// materias.html), para no tener que escribirlas a mano cada vez.
async function cargarMaterias() {
    const { data, error } = await supabase
        .from("materias")
        .select("id, nombre, nivel_7, nivel_8, nivel_9, activo, orden")
        .eq("activo", true)
        .order("orden", { ascending: true });

    if (error) {
        console.error("❌ Error al cargar materias:", error);
        return [];
    }
    return data || [];
}

// Directorio de profesores (el mismo que aparece en Asignaciones),
// para elegir quién dicta el bloque sin tener que escribir el nombre.
async function cargarProfesores() {
    const { data, error } = await supabase
        .from("profesores")
        .select("correo_profesor, nombre_profesor")
        .order("nombre_profesor", { ascending: true });

    if (error) {
        console.error("❌ Error al cargar profesores:", error);
        return [];
    }
    return data || [];
}

// Quién ya está asignado a cada materia/salón (tabla profesor_materias,
// la misma que llena el admin en "Asignaciones"). Se usa para sugerir
// automáticamente el profesor cuando se elige una materia.
async function cargarAsignaciones() {
    const { data, error } = await supabase
        .from("profesor_materias")
        .select("correo_profesor, nombre_profesor, materia, salon");

    if (error) {
        console.error("❌ Error al cargar asignaciones de profesores:", error);
        return [];
    }
    return data || [];
}

// Deduce el grado (7, 8 o 9) a partir del código del salón (ej: "9C" -> 9),
// para no mostrar materias de otro nivel en el desplegable.
function nivelDelSalon(salon) {
    const match = String(salon || "").match(/\d+/);
    return match ? parseInt(match[0], 10) : null;
}

function materiasParaSalon(salon) {
    const nivel = nivelDelSalon(salon);
    const campoNivel = nivel ? `nivel_${nivel}` : null;
    if (!campoNivel) return materiasCache;
    const filtradas = materiasCache.filter((m) => m[campoNivel]);
    // Si ninguna materia tiene marcado ese nivel (catálogo sin configurar
    // todavía), se muestran todas para no dejar el desplegable vacío.
    return filtradas.length > 0 ? filtradas : materiasCache;
}

function poblarSelectsMateriaProfesor() {
    const materiasDisponibles = materiasParaSalon(salonActual);

    selectMateriaBloque.innerHTML = materiasDisponibles.length > 0
        ? materiasDisponibles.map((m) => `<option value="${escapeHtml(m.nombre)}">${escapeHtml(m.nombre)}</option>`).join("")
        : `<option value="">No hay materias configuradas — agrégalas en "Materias"</option>`;

    selectProfesorBloque.innerHTML = `<option value="">— Sin profesor —</option>` +
        profesoresCache.map((p) =>
            `<option value="${escapeHtml(p.correo_profesor)}" data-nombre="${escapeHtml(p.nombre_profesor || p.correo_profesor)}">${escapeHtml(p.nombre_profesor || p.correo_profesor)}</option>`
        ).join("");
}

// Si esa materia ya tiene un profesor asignado a este salón (según
// "Asignaciones"), lo preselecciona automáticamente.
function sugerirProfesorParaMateria(materia) {
    const asignacion = asignacionesCache.find(
        (a) => a.salon === salonActual && a.materia === materia
    );
    selectProfesorBloque.value = asignacion ? (asignacion.correo_profesor || "") : "";
}

selectMateriaBloque?.addEventListener("change", () => {
    sugerirProfesorParaMateria(selectMateriaBloque.value);
});

async function cargarHorarioGuardado(salon) {
    const { data, error } = await supabase
        .from("horario_salon")
        .select("id, dia, franja_id, texto, tipo, materia, correo_profesor, nombre_profesor")
        .eq("salon", salon);
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
// 4) DIBUJAR LA CUADRÍCULA
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
// 5) MODAL: AGREGAR / EDITAR / ELIMINAR UN BLOQUE
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

    tituloModalBloque.textContent = `${NOMBRES_DIA[dia]} · ${horaTexto} · ${salonActual}`;
    selectTipoBloque.value = filaExistente?.tipo || "clase";
    alternarCamposModal();

    poblarSelectsMateriaProfesor();

    if (filaExistente?.tipo !== "otro") {
        const materiaGuardada = filaExistente?.materia || "";
        const opcionesMateria = [...selectMateriaBloque.options].map((o) => o.value);
        selectMateriaBloque.value = opcionesMateria.includes(materiaGuardada)
            ? materiaGuardada
            : (opcionesMateria[0] || "");

        if (filaExistente?.correo_profesor) {
            selectProfesorBloque.value = filaExistente.correo_profesor;
        } else {
            sugerirProfesorParaMateria(selectMateriaBloque.value);
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
    if (!bloqueEnEdicion || !salonActual) return;

    const { dia, franjaId } = bloqueEnEdicion;
    const tipo = selectTipoBloque.value;

    let texto = "";
    let materia = null;
    let nombreProfesor = null;
    let correoProfesor = null;

    if (tipo === "clase") {
        materia = selectMateriaBloque.value.trim();
        if (!materia) {
            alert("Elige una materia de la lista. Si no aparece, agrégala primero en \"Materias\".");
            return;
        }
        correoProfesor = selectProfesorBloque.value || null;
        nombreProfesor = correoProfesor
            ? (selectProfesorBloque.selectedOptions[0]?.dataset.nombre || null)
            : null;
        texto = nombreProfesor ? `${materia} — ${nombreProfesor}` : materia;
    } else {
        texto = inputTextoBloque.value.trim();
        if (!texto) {
            alert("Escribe qué va en este bloque.");
            return;
        }
    }

    const { data, error } = await supabase
        .from("horario_salon")
        .upsert(
            [{
                salon: salonActual,
                dia,
                franja_id: franjaId,
                texto,
                tipo,
                materia,
                nombre_profesor: nombreProfesor,
                correo_profesor: correoProfesor,
                actualizado_en: new Date().toISOString(),
            }],
            { onConflict: "salon,dia,franja_id" }
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
    const { error } = await supabase.from("horario_salon").delete().eq("id", id);
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
// 6) CAMBIO DE SALÓN
// =========================================================

selectSalon.addEventListener("change", async () => {
    salonActual = selectSalon.value;

    if (!salonActual) {
        sinSalon.classList.remove("d-none");
        contenedorTabla.classList.add("d-none");
        return;
    }

    sinSalon.classList.add("d-none");
    contenedorTabla.classList.remove("d-none");
    cuerpoTablaHorario.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">Cargando...</td></tr>`;

    horarioPorClave = await cargarHorarioGuardado(salonActual);
    dibujarTabla();
});

// =========================================================
// INICIO
// =========================================================

(async function init() {
    const ok = await verificarAcceso();
    if (!ok) return;

    franjas = await cargarFranjas();
    materiasCache = await cargarMaterias();
    profesoresCache = await cargarProfesores();
    asignacionesCache = await cargarAsignaciones();
    await cargarSalones();

    if (salonBloqueado) {
        // Consejero(a): cargar directo su salón, sin esperar a que
        // elija algo en el <select> (que ya está fijo y deshabilitado).
        selectSalon.value = salonBloqueado;
        salonActual = salonBloqueado;
        sinSalon.classList.add("d-none");
        contenedorTabla.classList.remove("d-none");
        horarioPorClave = await cargarHorarioGuardado(salonActual);
        dibujarTabla();
    }
})();
