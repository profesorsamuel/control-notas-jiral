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

// Normaliza cualquier texto de día ("Lunes", "LUNES", "lunes ") al valor
// que usamos internamente: lunes, martes, miercoles, jueves, viernes.
function normalizarDia(dia) {
    const d = quitarAcentos(String(dia ?? "").trim().toLowerCase());
    const validos = ["lunes", "martes", "miercoles", "jueves", "viernes"];
    return validos.includes(d) ? d : null;
}

// Convierte "9:00" o "9:00 AM" o "09:00:00" a formato "HH:MM:SS" (24h)
// para poder compararlo con las franjas, que vienen así desde Postgres.
function aHoraComparable(horaTexto) {
    if (!horaTexto) return null;
    const partes = String(horaTexto).trim().split(":");
    if (partes.length < 2) return null;
    const h = String(parseInt(partes[0], 10)).padStart(2, "0");
    const m = String(parseInt(partes[1], 10)).padStart(2, "0");
    return `${h}:${m}:00`;
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

// =========================================================
// ESTADO
// =========================================================

let correoProfesor = "";
let nombreProfesor = "";
let franjas = [];               // [{id, hora_inicio, hora_fin, orden, es_recreo, etiqueta}]
let horarioPorClave = {};       // "dia-franjaId" -> fila de horario_profesor

function claveDiaFranja(dia, franjaId) {
    return `${dia}-${franjaId}`;
}

// =========================================================
// ELEMENTOS
// =========================================================

const textoNombreProfesor = document.getElementById("textoNombreProfesor");
const cuerpoTablaHorario = document.getElementById("cuerpoTablaHorario");
const estadoHorario = document.getElementById("estadoHorario");
const btnImportarMaterias = document.getElementById("btnImportarMaterias");

const fondoModalBloque = document.getElementById("fondoModalBloque");
const tituloModalBloque = document.getElementById("tituloModalBloque");
const selectTipoBloque = document.getElementById("selectTipoBloque");
const inputTextoBloque = document.getElementById("inputTextoBloque");
const btnEliminarBloqueModal = document.getElementById("btnEliminarBloqueModal");
const btnCancelarBloqueModal = document.getElementById("btnCancelarBloqueModal");
const btnGuardarBloqueModal = document.getElementById("btnGuardarBloqueModal");

let bloqueEnEdicion = null; // {dia, franjaId, filaExistente}

// =========================================================
// 1) VERIFICAR SESIÓN (mismo patrón que profesor.js / tomar_asistencia.js)
// =========================================================

async function verificarSesion() {
    const { data: { user }, error: errUser } = await supabase.auth.getUser();

    if (errUser || !user) {
        window.location.href = "login.html";
        return false;
    }

    correoProfesor = (user.email || "").trim().toLowerCase();

    const { data: materias, error: errMaterias } = await supabase
        .from("profesor_materias")
        .select("materia")
        .eq("correo_profesor", correoProfesor)
        .limit(1);

    if (errMaterias) {
        console.error("❌ Error al verificar acceso de docente:", errMaterias);
        alert("Ocurrió un error al verificar tu acceso. Intenta de nuevo.");
        window.location.href = "login.html";
        return false;
    }

    if (!materias || materias.length === 0) {
        alert("⛔ Esta cuenta no tiene materias asignadas como docente. Contacta al administrador.");
        window.location.href = "login.html";
        return false;
    }

    const { data: perfilProfesor } = await supabase
        .from("profesores")
        .select("nombre_profesor")
        .eq("correo_profesor", correoProfesor)
        .maybeSingle();
    nombreProfesor = perfilProfesor?.nombre_profesor || correoProfesor;

    return true;
}

// =========================================================
// 2) CARGAR FRANJAS Y HORARIO GUARDADO
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

async function cargarHorarioGuardado() {
    const { data, error } = await supabase
        .from("horario_profesor")
        .select("id, dia, franja_id, texto, tipo, materia, salon")
        .eq("correo_profesor", correoProfesor);

    if (error) {
        estadoHorario.textContent = "❌ Error al cargar tu horario: " + error.message;
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

    // Clic en celda con contenido -> editar
    cuerpoTablaHorario.querySelectorAll(".celda-bloque").forEach((celda) => {
        celda.addEventListener("click", (e) => {
            if (e.target.closest(".btn-borrar-bloque")) return; // el botón de borrar tiene su propio handler
            abrirModal(celda.dataset.dia, parseInt(celda.dataset.franja, 10));
        });
    });

    // Clic en celda vacía -> agregar
    cuerpoTablaHorario.querySelectorAll(".celda-vacia").forEach((celda) => {
        celda.addEventListener("click", () => {
            abrirModal(celda.dataset.dia, parseInt(celda.dataset.franja, 10));
        });
    });

    // Botón "✕" -> eliminar directo
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

function abrirModal(dia, franjaId) {
    const filaExistente = horarioPorClave[claveDiaFranja(dia, franjaId)] || null;
    bloqueEnEdicion = { dia, franjaId, filaExistente };

    const franja = franjas.find((f) => f.id === franjaId);
    const horaTexto = franja ? `${formatearHora12(franja.hora_inicio)} – ${formatearHora12(franja.hora_fin)}` : "";

    tituloModalBloque.textContent = `${NOMBRES_DIA[dia]} · ${horaTexto}`;
    selectTipoBloque.value = filaExistente?.tipo || "clase";
    inputTextoBloque.value = filaExistente?.texto || "";
    btnEliminarBloqueModal.classList.toggle("d-none", !filaExistente);

    fondoModalBloque.classList.add("mostrar");
    inputTextoBloque.focus();
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
    if (!bloqueEnEdicion) return;

    const texto = inputTextoBloque.value.trim();
    if (!texto) {
        alert("Escribe qué va en este bloque.");
        return;
    }

    const { dia, franjaId } = bloqueEnEdicion;

    const { data, error } = await supabase
        .from("horario_profesor")
        .upsert(
            [{
                correo_profesor: correoProfesor,
                nombre_profesor: nombreProfesor,
                dia,
                franja_id: franjaId,
                texto,
                tipo: selectTipoBloque.value,
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
        if (horarioPorClave[clave].id === id) delete horarioPorClave[clave];
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
// 5) IMPORTAR MIS MATERIAS ASIGNADAS (desde profesor_materias)
// =========================================================
// Toma lo que el admin ya cargó en profesor_materias (materia, salon,
// dia, hora) y crea/actualiza automáticamente los bloques de tipo
// "clase" que coincidan con una franja. No toca bloques tipo "otro"
// (como Consejería) que el profesor haya agregado a mano.

btnImportarMaterias.addEventListener("click", async () => {
    btnImportarMaterias.disabled = true;
    btnImportarMaterias.textContent = "Importando...";

    try {
        const { data: misMaterias, error } = await supabase
            .from("profesor_materias")
            .select("materia, salon, dia, hora")
            .eq("correo_profesor", correoProfesor);

        if (error) {
            alert("❌ Error al leer tus materias asignadas: " + error.message);
            return;
        }

        if (!misMaterias || misMaterias.length === 0) {
            alert("No tienes materias con día/hora asignados todavía. Pídele al administrador que te los asigne en el panel de asignaciones.");
            return;
        }

        const filasAGuardar = [];
        let sinDiaUHora = 0;
        let sinFranjaCoincidente = 0;

        misMaterias.forEach((m) => {
            const dia = normalizarDia(m.dia);
            const horaComparable = aHoraComparable(m.hora);

            if (!dia || !horaComparable) { sinDiaUHora++; return; }

            const franja = franjas.find(
                (f) => !f.es_recreo && horaComparable >= f.hora_inicio && horaComparable < f.hora_fin
            );

            if (!franja) { sinFranjaCoincidente++; return; }

            filasAGuardar.push({
                correo_profesor: correoProfesor,
                nombre_profesor: nombreProfesor,
                dia,
                franja_id: franja.id,
                texto: `${m.materia} ${m.salon}`.trim(),
                tipo: "clase",
                materia: m.materia,
                salon: m.salon,
                actualizado_en: new Date().toISOString(),
            });
        });

        if (filasAGuardar.length > 0) {
            const { error: errUpsert } = await supabase
                .from("horario_profesor")
                .upsert(filasAGuardar, { onConflict: "correo_profesor,dia,franja_id" });

            if (errUpsert) {
                alert("❌ Error al importar: " + errUpsert.message);
                return;
            }
        }

        horarioPorClave = await cargarHorarioGuardado();
        dibujarTabla();

        let resumen = `✅ Se importaron ${filasAGuardar.length} bloque(s).`;
        if (sinDiaUHora > 0) resumen += ` ${sinDiaUHora} materia(s) sin día/hora asignados (avisa al administrador).`;
        if (sinFranjaCoincidente > 0) resumen += ` ${sinFranjaCoincidente} materia(s) cuya hora no coincide con ninguna franja.`;
        mostrarEstado(resumen);
    } finally {
        btnImportarMaterias.disabled = false;
        btnImportarMaterias.textContent = "🔄 Importar mis materias asignadas";
    }
});

// =========================================================
// INICIO
// =========================================================

(async function init() {
    const ok = await verificarSesion();
    if (!ok) return;

    textoNombreProfesor.textContent = nombreProfesor;

    franjas = await cargarFranjas();
    horarioPorClave = await cargarHorarioGuardado();

    dibujarTabla();
})();
