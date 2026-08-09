// =========================================================
// SISTEMA DE APRECIACIONES 4+ (asistencia + comportamiento +
// actividades en clase + actividades para la casa)
// =========================================================
// Este archivo es independiente de profesor.js a propósito: así el
// motor original de la tabla (Aprec. 1, 2, 3 y todo lo demás) queda
// intacto, y este módulo solo se "engancha" en un par de puntos.
//
// Regla de oro de este archivo: nunca se lee ni se escribe nada de
// Aprec. 1, 2 o 3. Todo lo de aquí trabaja desde el número 4 en
// adelante.

import { supabase } from "./supabase.js";

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// Mismas reglas que usa la tabla principal (Aprec. 1, 2, 3) para que
// las notas de las actividades se comporten igual: mientras se
// escribe, solo deja pasar dígitos y un único punto decimal, máximo
// 1 dígito entero + 1 decimal (nunca letras, nunca "33").
function sanitizarEntradaNota(valor) {
    let v = valor.replace(",", ".").replace(/[^0-9.]/g, "");
    const partes = v.split(".");
    if (partes.length > 2) v = partes[0] + "." + partes.slice(1).join("");
    let [entero, decimal] = v.split(".");
    entero = (entero || "").slice(0, 1);
    if (decimal !== undefined) {
        decimal = decimal.slice(0, 1);
        return `${entero}.${decimal}`;
    }
    return entero;
}

// Al salir de la casilla: "3" -> "3.0", ".6" -> "0.6", y siempre
// dentro de 1.0–5.0 (nunca 0.5, nunca vacío de más de un decimal).
function formatearNotaFinal(valor) {
    const texto = (valor ?? "").trim();
    if (texto === "" || texto === ".") return "";
    let num = parseFloat(texto);
    if (isNaN(num)) return "";
    if (num < 1) num = 1;
    if (num > 5) num = 5;
    return num.toFixed(1);
}

// Valores fijos pedidos explícitamente en el punto 6 (Comportamiento):
// buen comportamiento = 5, mal comportamiento = 1.
const VALOR_COMPORTAMIENTO_BUENO = 5;
const VALOR_COMPORTAMIENTO_MALO = 1;

// Valores de asistencia (traducen el estado que ya existe en el
// sistema de asistencia -presente/tardanza/ausente/permiso- a una
// nota 1-5). Viven en config_pesos_apreciacion junto a los pesos, así
// quedan igual de centralizados y editables desde la base de datos.
const VALOR_ASISTENCIA_DEFECTO = { presente: 5, tardanza: 3, ausente: 1, permiso: 5 };

// =========================================================
// 1) ESTADO DE LAS APRECIACIONES (activa / completada / bloqueada)
// =========================================================

export async function obtenerEstadoApreciaciones(materia, trimestre) {
    const { data, error } = await supabase
        .from("apreciaciones_estado")
        .select("numero, estado, modo")
        .eq("materia", materia)
        .eq("trimestre", trimestre)
        .order("numero", { ascending: true });

    if (error) {
        console.error("Error al leer apreciaciones_estado:", error);
        return [];
    }
    return data || [];
}

// Si esta materia/trimestre todavía no tiene ninguna fila de estado,
// significa que nunca se usó el sistema nuevo aquí: activamos Aprec. 4
// automáticamente (punto 2). No hace nada si ya existía.
export async function asegurarApreciacion4Activa(materia, trimestre) {
    const { error } = await supabase.rpc("activar_primera_apreciacion_nueva", {
        p_materia: materia,
        p_trimestre: trimestre,
    });
    if (error) console.error("No se pudo activar Apreciación 4:", error);
}

// Devuelve la lista de columnas "nuevas" (numero >= 4) que hay que
// dibujar en la tabla: todas las que tengan fila en apreciaciones_estado,
// más una columna extra bloqueada como vista previa de "lo que viene".
export async function calcularColumnasApreciacionesNuevas(materia, trimestre) {
    let estados = await obtenerEstadoApreciaciones(materia, trimestre);

    if (estados.length === 0) {
        await asegurarApreciacion4Activa(materia, trimestre);
        estados = await obtenerEstadoApreciaciones(materia, trimestre);
    }

    if (estados.length === 0) return [];

    const maximo = Math.max(...estados.map((e) => e.numero));
    const yaHayPreview = estados.some((e) => e.numero === maximo + 1);
    if (!yaHayPreview) {
        estados = [...estados, { numero: maximo + 1, estado: "bloqueada", modo: null }];
    }
    return estados; // [{numero, estado, modo}, ...] ordenado
}

export async function elegirModoApreciacion(materia, trimestre, numeroApreciacion, modo) {
    const { error } = await supabase.from("apreciaciones_estado")
        .update({ modo, updated_at: new Date().toISOString() })
        .eq("materia", materia).eq("trimestre", trimestre).eq("numero", numeroApreciacion);
    if (error) console.error("No se pudo guardar el modo de la apreciación:", error);
    return !error;
}

// Cuando el profesor eligió "modo directo", la nota se guarda como una
// casilla normal (igual que Aprec. 1, 2, 3) usando el mismo flujo de
// guardarNotas() de profesor.js. Esta función solo se encarga de la
// parte que ese flujo NO sabe hacer: revisar si con esas notas la
// apreciación quedó completa, y si es así, activar la siguiente.
export async function revisarAvanceApreciacionesDirectas(materia, trimestre, numerosGuardados) {
    let avanzoAlguna = false;
    for (const numero of numerosGuardados) {
        const { data: completada, error } = await supabase.rpc("completar_y_avanzar_apreciacion", {
            p_materia: materia, p_trimestre: trimestre, p_numero: numero,
        });
        if (error) { console.error(error); continue; }
        if (completada) avanzoAlguna = true;
    }
    return avanzoAlguna;
}

export async function reiniciarApreciacionActiva(materia, trimestre, numeroApreciacion) {
    const { data: seReinicio, error } = await supabase.rpc("reiniciar_apreciacion_activa", {
        p_materia: materia, p_trimestre: trimestre, p_numero: numeroApreciacion,
    });
    if (error) { console.error(error); return false; }
    return !!seReinicio;
}

const ICONO_ESTADO = { completada: "✓", activa: "🟢", bloqueada: "🔒" };

export function iconoApreciacion(estado) {
    return ICONO_ESTADO[estado] || "";
}

// =========================================================
// 2) PESOS Y VALORES (leídos de config_pesos_apreciacion)
// =========================================================

async function obtenerConfigPesos() {
    const { data, error } = await supabase
        .from("config_pesos_apreciacion")
        .select("*")
        .eq("id", 1)
        .maybeSingle();

    if (error || !data) {
        console.error("No se pudo leer config_pesos_apreciacion, usando valores por defecto.", error);
        return {
            peso_asistencia: 10, peso_comportamiento: 10,
            peso_actividades_clase: 50, peso_actividades_casa: 30,
        };
    }
    return data;
}

// =========================================================
// 3) ASISTENCIA — reutiliza el sistema de asistencia existente.
// =========================================================
// "Clase N" = la N-ésima vez (en orden de fecha) que se tomó
// asistencia para esta materia/salón. Así no se le pide nada nuevo al
// profesor: usamos lo que ya registró en la pantalla de Asistencia.

// =========================================================
// 3) RANGO DE FECHAS DE LA APRECIACIÓN + ASISTENCIA DENTRO DE ESE RANGO
// =========================================================
// Reutiliza el sistema de asistencia existente: no se le pide nada
// nuevo al profesor, solo se le muestran (en columnas, una por fecha)
// las asistencias que ya tomó dentro del rango que él mismo define
// para esta apreciación.

export async function obtenerRangoFechas(materia, trimestre, numeroApreciacion) {
    const { data, error } = await supabase
        .from("apreciaciones_estado")
        .select("fecha_inicio, fecha_fin")
        .eq("materia", materia).eq("trimestre", trimestre).eq("numero", numeroApreciacion)
        .maybeSingle();
    if (error) { console.error(error); return { fecha_inicio: null, fecha_fin: null }; }
    return data || { fecha_inicio: null, fecha_fin: null };
}

export async function guardarRangoFechas(materia, trimestre, numeroApreciacion, fechaInicio, fechaFin) {
    const { error } = await supabase.from("apreciaciones_estado")
        .update({ fecha_inicio: fechaInicio, fecha_fin: fechaFin, updated_at: new Date().toISOString() })
        .eq("materia", materia).eq("trimestre", trimestre).eq("numero", numeroApreciacion);
    if (error) console.error("No se pudo guardar el rango de fechas:", error);
    return { ok: !error, error };
}

export async function obtenerAsistenciaPorRango(materia, salon, fechaInicio, fechaFin) {
    if (!fechaInicio || !fechaFin) return { fechas: [], porFecha: {} };

    const { data: sesiones, error } = await supabase
        .from("asistencias")
        .select("id, fecha")
        .eq("materia", materia).eq("salon", salon)
        .gte("fecha", fechaInicio).lte("fecha", fechaFin)
        .order("fecha", { ascending: true });

    if (error) { console.error(error); return { fechas: [], porFecha: {} }; }
    if (!sesiones || sesiones.length === 0) return { fechas: [], porFecha: {} };

    const { data: detalles, error: errDet } = await supabase
        .from("asistencia_detalle")
        .select("asistencia_id, estudiante_id, estado")
        .in("asistencia_id", sesiones.map((s) => s.id));
    if (errDet) { console.error(errDet); return { fechas: [], porFecha: {} }; }

    const fechaPorSesion = Object.fromEntries(sesiones.map((s) => [s.id, s.fecha]));
    const fechas = sesiones.map((s) => s.fecha);
    const porFecha = {};
    (detalles || []).forEach((d) => {
        const fecha = fechaPorSesion[d.asistencia_id];
        (porFecha[fecha] ??= {})[d.estudiante_id] = d.estado;
    });
    return { fechas, porFecha };
}

// =========================================================
// 4) COMPORTAMIENTO — una columna por cada fecha que el docente agregue
// =========================================================

async function obtenerComportamientoTabla(materia, trimestre, numeroApreciacion) {
    const { data, error } = await supabase
        .from("comportamiento_detalle")
        .select("estudiante_id, fecha, valor")
        .eq("materia", materia).eq("trimestre", trimestre).eq("numero_apreciacion", numeroApreciacion)
        .order("fecha", { ascending: true });

    if (error) { console.error(error); return { fechas: [], porFecha: {} }; }

    const fechas = [...new Set((data || []).map((d) => d.fecha))];
    const porFecha = {};
    (data || []).forEach((d) => { (porFecha[d.fecha] ??= {})[d.estudiante_id] = d.valor; });
    return { fechas, porFecha };
}

async function eliminarFechaComportamiento(materia, trimestre, numeroApreciacion, fecha) {
    return supabase.from("comportamiento_detalle").delete()
        .eq("materia", materia).eq("trimestre", trimestre).eq("numero_apreciacion", numeroApreciacion).eq("fecha", fecha);
}

async function guardarComportamiento(materia, trimestre, numeroApreciacion, fecha, estudianteId, valor) {
    return supabase.from("comportamiento_detalle").upsert(
        { materia, trimestre, numero_apreciacion: numeroApreciacion, estudiante_id: estudianteId, fecha, valor },
        { onConflict: "materia,trimestre,numero_apreciacion,estudiante_id,fecha" }
    );
}

// =========================================================
// 5) ACTIVIDADES (en clase / para la casa)
// =========================================================

async function obtenerActividades(materia, trimestre, numeroApreciacion, tipoActividad) {
    const { data: actividades, error } = await supabase
        .from("actividades_apreciacion")
        .select("id, nombre, orden")
        .eq("materia", materia).eq("trimestre", trimestre)
        .eq("numero_apreciacion", numeroApreciacion).eq("tipo_actividad", tipoActividad)
        .order("orden", { ascending: true });

    if (error) { console.error(error); return []; }
    if (!actividades || actividades.length === 0) return [];

    const { data: calificaciones } = await supabase
        .from("actividades_calificaciones")
        .select("actividad_id, estudiante_id, nota")
        .in("actividad_id", actividades.map((a) => a.id));

    const notasPorActividad = {};
    (calificaciones || []).forEach((c) => {
        (notasPorActividad[c.actividad_id] ??= {})[c.estudiante_id] = c.nota;
    });

    return actividades.map((a) => ({ ...a, notas: notasPorActividad[a.id] || {} }));
}

async function crearActividad(materia, trimestre, numeroApreciacion, tipoActividad, nombre, orden) {
    const { data, error } = await supabase.from("actividades_apreciacion")
        .insert([{ materia, trimestre, numero_apreciacion: numeroApreciacion, tipo_actividad: tipoActividad, nombre, orden }])
        .select("id, nombre, orden").single();
    if (error) { console.error(error); return null; }
    return { ...data, notas: {} };
}

async function guardarCalificacionActividad(actividadId, estudianteId, nota) {
    return supabase.from("actividades_calificaciones").upsert(
        { actividad_id: actividadId, estudiante_id: estudianteId, nota },
        { onConflict: "actividad_id,estudiante_id" }
    );
}

async function renombrarActividad(actividadId, nombre) {
    return supabase.from("actividades_apreciacion").update({ nombre }).eq("id", actividadId);
}

async function eliminarActividad(actividadId) {
    return supabase.from("actividades_apreciacion").delete().eq("id", actividadId);
}

// =========================================================
// 6) NOTA FINAL — fórmula centralizada (punto 7)
// =========================================================

function promedio(valores) {
    const nums = valores.filter((v) => v !== null && v !== undefined && !isNaN(v));
    if (nums.length === 0) return null;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function calcularNotaFinalApreciacion({ notaAsistencia, notaComportamiento, notaActClase, notaActCasa }, pesos) {
    // Si a un estudiante le falta algún componente, esa parte no cuenta
    // (no se le pone 0 injustamente) y el resto se reparte el 100% del
    // peso proporcionalmente. Así la fórmula sigue siendo una sola,
    // pero no castiga huecos de datos.
    const partes = [
        { valor: notaAsistencia, peso: Number(pesos.peso_asistencia) },
        { valor: notaComportamiento, peso: Number(pesos.peso_comportamiento) },
        { valor: notaActClase, peso: Number(pesos.peso_actividades_clase) },
        { valor: notaActCasa, peso: Number(pesos.peso_actividades_casa) },
    ].filter((p) => p.valor !== null && p.valor !== undefined);

    const pesoTotal = partes.reduce((a, p) => a + p.peso, 0);
    if (pesoTotal === 0) return null;

    const suma = partes.reduce((a, p) => a + (p.valor * p.peso), 0);
    return suma / pesoTotal;
}

// =========================================================
// 7) GUARDAR LA APRECIACIÓN COMPLETA (todo el grupo a la vez)
// =========================================================
// Devuelve { ok, completada, error }. "completada" indica si al
// guardar, la apreciación quedó lista y ya se activó la siguiente.

export async function guardarApreciacionCompleta({
    materia, trimestre, numeroApreciacion, correoProfesor, estudiantes, notasFinalesPorEstudiante,
}) {
    const hoy = new Date().toISOString().slice(0, 10);

    for (const est of estudiantes) {
        const nota = notasFinalesPorEstudiante[est.id];
        if (nota === null || nota === undefined) continue; // ese estudiante aún no tiene todo listo

        const notaRedondeada = Math.min(5, Math.max(1, Math.round(nota * 10) / 10));

        const { data: existente } = await supabase.from("notas").select("id")
            .eq("materia", materia).eq("trimestre", trimestre).eq("tipo", "apreciacion").eq("numero", numeroApreciacion)
            .eq(est.correo ? "correo" : "estudiante_id", est.correo || est.id)
            .is("eliminado_en", null).maybeSingle();

        const payload = {
            correo: est.correo || null,
            estudiante_id: est.correo ? null : est.id,
            materia, trimestre,
            tipo: "apreciacion", numero: numeroApreciacion,
            nota: notaRedondeada,
            actividad: `Apreciación ${numeroApreciacion}`,
            fecha: hoy,
            observacion: `Calculada automáticamente (asistencia + comportamiento + actividades) por ${correoProfesor}`,
            estado: "Activa",
            origen: "profesor",
        };

        const { error } = existente
            ? await supabase.from("notas").update(payload).eq("id", existente.id)
            : await supabase.from("notas").insert([payload]);

        if (error) return { ok: false, error };
    }

    const { data: completada, error: errCompletar } = await supabase.rpc("completar_y_avanzar_apreciacion", {
        p_materia: materia, p_trimestre: trimestre, p_numero: numeroApreciacion,
    });

    if (errCompletar) return { ok: true, completada: false, error: errCompletar };
    return { ok: true, completada: !!completada };
}

// =========================================================
// 8) MODAL — arma y muestra el detalle completo de una apreciación
// =========================================================

let elementosModal = null;
function obtenerElementosModal() {
    if (elementosModal) return elementosModal;
    elementosModal = {
        modalEl: document.getElementById("modalApreciacionDetalle"),
        titulo: document.getElementById("apreciacionModalTitulo"),
        cuerpo: document.getElementById("apreciacionModalCuerpo"),
        btnGuardar: document.getElementById("btnGuardarApreciacionDetalle"),
        estadoGuardado: document.getElementById("apreciacionModalEstadoGuardado"),
    };
    return elementosModal;
}

export async function abrirSelectorModo({ materia, salon, trimestre, numeroApreciacion, correoProfesor, estudiantes, onModoElegido }) {
    const el = obtenerElementosModal();
    if (!el.modalEl) { alert("Falta el HTML del modal de Apreciación en la página."); return; }

    el.titulo.textContent = `Apreciación ${numeroApreciacion} — ¿Cómo la vas a registrar?`;
    el.btnGuardar.style.display = "none";
    el.estadoGuardado.textContent = "";
    el.cuerpo.innerHTML = `
        <p class="text-muted small">Elige una vez cómo quieres trabajar esta apreciación. Esta elección queda fija para la Apreciación ${numeroApreciacion}.</p>
        <div class="d-flex flex-column gap-3">
            <button type="button" class="btn btn-outline-primary text-start p-3" id="btnModoDirecto">
                <div class="fw-bold">📝 Casilla directa</div>
                <div class="small text-muted">Igual que Aprec. 1, 2 y 3: escribes la nota final tú mismo, sin desglose.</div>
            </button>
            <button type="button" class="btn btn-outline-primary text-start p-3" id="btnModoDetallado">
                <div class="fw-bold">🧩 Detalle completo</div>
                <div class="small text-muted">Asistencia + Comportamiento + Actividades en clase + Actividades para la casa. La nota se calcula sola.</div>
            </button>
        </div>`;

    const modalBootstrap = bootstrap.Modal.getOrCreateInstance(el.modalEl);
    modalBootstrap.show();

    document.getElementById("btnModoDirecto").onclick = async () => {
        await elegirModoApreciacion(materia, trimestre, numeroApreciacion, "directo");
        modalBootstrap.hide();
        onModoElegido?.("directo");
    };
    document.getElementById("btnModoDetallado").onclick = async () => {
        await elegirModoApreciacion(materia, trimestre, numeroApreciacion, "detallado");
        el.btnGuardar.style.display = "inline-block";
        onModoElegido?.("detallado");
        await abrirDetalleApreciacion({ materia, salon, trimestre, numeroApreciacion, estado: "activa", estudiantes, correoProfesor });
    };
}

export async function abrirDetalleApreciacion({ materia, salon, trimestre, numeroApreciacion, estado, estudiantes, correoProfesor }) {
    const el = obtenerElementosModal();
    if (!el.modalEl) { alert("Falta el HTML del modal de Apreciación en la página."); return; }

    if (estado === "bloqueada") {
        alert(`La Apreciación ${numeroApreciacion} todavía está bloqueada. Primero hay que completar la anterior.`);
        return;
    }

    el.titulo.textContent = `Apreciación ${numeroApreciacion}`;
    el.cuerpo.innerHTML = `<div class="text-center py-4"><span class="spinner-border"></span> Cargando...</div>`;
    const modalBootstrap = new bootstrap.Modal(el.modalEl);
    modalBootstrap.show();

    const soloLectura = estado === "completada";

    const rango = await obtenerRangoFechas(materia, trimestre, numeroApreciacion);

    const [pesos, asistenciaTabla, comportamientoTabla, actividadesClase, actividadesCasa] = await Promise.all([
        obtenerConfigPesos(),
        obtenerAsistenciaPorRango(materia, salon, rango.fecha_inicio, rango.fecha_fin),
        obtenerComportamientoTabla(materia, trimestre, numeroApreciacion),
        obtenerActividades(materia, trimestre, numeroApreciacion, "clase"),
        obtenerActividades(materia, trimestre, numeroApreciacion, "casa"),
    ]);

    // Notas ya guardadas para esta apreciación (si se está reabriendo
    // una que ya estaba completada, o si se guardó parcialmente antes).
    const idsEstudiantes = estudiantes.map((e) => e.id);
    const correos = estudiantes.filter((e) => e.correo).map((e) => e.correo);
    const notasGuardadas = {};
    if (correos.length) {
        const { data } = await supabase.from("notas").select("correo, nota")
            .eq("materia", materia).eq("trimestre", trimestre).eq("tipo", "apreciacion").eq("numero", numeroApreciacion)
            .in("correo", correos).is("eliminado_en", null);
        (data || []).forEach((n) => {
            const est = estudiantes.find((e) => e.correo === n.correo);
            if (est) notasGuardadas[est.id] = n.nota;
        });
    }
    const sinCorreo = estudiantes.filter((e) => !e.correo).map((e) => e.id);
    if (sinCorreo.length) {
        const { data } = await supabase.from("notas").select("estudiante_id, nota")
            .eq("materia", materia).eq("trimestre", trimestre).eq("tipo", "apreciacion").eq("numero", numeroApreciacion)
            .in("estudiante_id", sinCorreo).is("eliminado_en", null);
        (data || []).forEach((n) => { notasGuardadas[n.estudiante_id] = n.nota; });
    }

    const estado_ = {
        materia, salon, trimestre, numeroApreciacion, correoProfesor, estudiantes, soloLectura, pesos,
        fechaInicio: rango.fecha_inicio, fechaFin: rango.fecha_fin,
        asistenciaFechas: [...asistenciaTabla.fechas], asistenciaPorFecha: { ...asistenciaTabla.porFecha },
        comportamientoFechas: [...comportamientoTabla.fechas], comportamientoPorFecha: { ...comportamientoTabla.porFecha },
        actividadesClase, actividadesCasa,
        valoresAsistencia: VALOR_ASISTENCIA_DEFECTO,
    };

    pintarModal(estado_);
    calcularYPintarNotasFinales(estado_);

    el.btnGuardar.style.display = soloLectura ? "none" : "inline-block";
    el.estadoGuardado.textContent = soloLectura
        ? "Esta apreciación ya está completada. Solo lectura."
        : "";

    el.btnGuardar.onclick = async () => {
        el.btnGuardar.disabled = true;
        el.estadoGuardado.textContent = "Guardando...";

        const notasFinalesPorEstudiante = {};
        estudiantes.forEach((est) => {
            notasFinalesPorEstudiante[est.id] = calcularNotaFinalEstudiante(estado_, est.id);
        });

        const resultado = await guardarApreciacionCompleta({
            materia, trimestre, numeroApreciacion, correoProfesor, estudiantes, notasFinalesPorEstudiante,
        });

        el.btnGuardar.disabled = false;
        if (!resultado.ok) {
            el.estadoGuardado.textContent = "❌ Error al guardar: " + (resultado.error?.message || "desconocido");
            el.estadoGuardado.className = "small text-danger ms-2";
            return;
        }

        el.estadoGuardado.textContent = resultado.completada
            ? `✅ Guardado. Apreciación ${numeroApreciacion} completada — Apreciación ${numeroApreciacion + 1} ya está activa.`
            : "✅ Guardado. Todavía faltan estudiantes por completar para cerrar esta apreciación.";
        el.estadoGuardado.className = "small text-success ms-2";

        if (typeof window.__recargarSalonProfesor === "function") {
            await window.__recargarSalonProfesor();
        }
        setTimeout(() => modalBootstrap.hide(), 1200);
    };
}

function calcularNotaFinalEstudiante(estado_, estudianteId) {
    const { asistenciaFechas, asistenciaPorFecha, comportamientoFechas, comportamientoPorFecha, actividadesClase, actividadesCasa, valoresAsistencia, pesos } = estado_;

    const valoresAsist = asistenciaFechas
        .map((f) => asistenciaPorFecha[f]?.[estudianteId])
        .filter((v) => v !== undefined)
        .map((estadoDia) => valoresAsistencia[estadoDia])
        .filter((v) => v !== undefined);
    const notaAsistencia = promedio(valoresAsist);

    const valoresComportamiento = comportamientoFechas
        .map((f) => comportamientoPorFecha[f]?.[estudianteId])
        .filter((v) => v !== undefined && v !== null);
    const notaComportamiento = promedio(valoresComportamiento);

    const notaActClase = promedio(actividadesClase.map((a) => a.notas[estudianteId]).filter((v) => v !== undefined));
    const notaActCasa = promedio(actividadesCasa.map((a) => a.notas[estudianteId]).filter((v) => v !== undefined));

    return calcularNotaFinalApreciacion(
        { notaAsistencia, notaComportamiento, notaActClase, notaActCasa },
        pesos
    );
}

function calcularYPintarNotasFinales(estado_) {
    estado_.estudiantes.forEach((est) => {
        const nota = calcularNotaFinalEstudiante(estado_, est.id);
        const celda = document.getElementById(`aprNotaFinal-${est.id}`);
        if (celda) celda.textContent = nota !== null ? nota.toFixed(2) : "–";
    });
}

function pintarModal(estado_) {
    const el = obtenerElementosModal();
    const {
        estudiantes, fechaInicio, fechaFin,
        asistenciaFechas, asistenciaPorFecha,
        comportamientoFechas, comportamientoPorFecha,
        actividadesClase, actividadesCasa, soloLectura, numeroApreciacion,
    } = estado_;

    const rangoDefinido = !!(fechaInicio && fechaFin);

    // --- 0) Rango de fechas: de cuándo a cuándo es esta apreciación.
    // Mientras no esté definido, Asistencia no tiene de dónde sacar datos. ---
    const bloqueRango = () => {
        if (soloLectura) {
            return `<p class="small text-muted">Del ${fechaInicio || "–"} al ${fechaFin || "–"}.</p>`;
        }
        // Mientras el docente escribe una fecha pero todavía no presiona
        // "Guardar rango", ese valor se guarda en un "borrador" para que
        // no se borre si el modal se vuelve a dibujar por otra razón
        // (por ejemplo, al agregar una columna de comportamiento).
        const valorInicio = estado_.fechaInicioBorrador ?? fechaInicio ?? "";
        const valorFin = estado_.fechaFinBorrador ?? fechaFin ?? "";
        return `
            <div class="d-flex align-items-end gap-2 flex-wrap mb-2">
                <div>
                    <label class="small text-muted d-block">Desde</label>
                    <input type="date" class="form-control form-control-sm" id="inputFechaInicioApreciacion" value="${valorInicio}">
                </div>
                <div>
                    <label class="small text-muted d-block">Hasta</label>
                    <input type="date" class="form-control form-control-sm" id="inputFechaFinApreciacion" value="${valorFin}">
                </div>
                <button type="button" class="btn btn-sm btn-primary" id="btnGuardarRangoApreciacion">Guardar rango</button>
                ${rangoDefinido ? `<span class="small text-success">✓ Definido</span>` : `<span class="small text-danger">Define el rango para ver la asistencia</span>`}
            </div>`;
    };

    // --- 1) Asistencia: una columna de solo lectura por cada fecha real
    // dentro del rango (viene directo de tu pantalla de Asistencia). ---
    const bloqueAsistencia = () => {
        if (!rangoDefinido) {
            return `<p class="text-muted small">Define primero el rango de fechas de arriba.</p>`;
        }
        if (asistenciaFechas.length === 0) {
            return `<p class="text-muted small">No hay asistencia tomada todavía entre ${fechaInicio} y ${fechaFin}.</p>`;
        }
        const encabezado = asistenciaFechas.map((f) => `<th class="text-center small" style="min-width:90px;">${escapeHtml(f)}</th>`).join("");
        const filas = estudiantes.map((est) => {
            const celdas = asistenciaFechas.map((f) => {
                const est_ = asistenciaPorFecha[f]?.[est.id] || "—";
                const badge = { presente: "success", tardanza: "warning", ausente: "danger", permiso: "secondary" }[est_] || "secondary";
                return `<td class="text-center"><span class="badge bg-${badge}">${escapeHtml(est_)}</span></td>`;
            }).join("");
            return `<tr><td class="small">${escapeHtml(est.nombre)}</td>${celdas}</tr>`;
        }).join("");

        return `
            <table class="table table-sm table-bordered align-middle mb-2">
                <thead><tr><th class="small">Estudiante</th>${encabezado}</tr></thead>
                <tbody>${filas}</tbody>
            </table>`;
    };

    // --- 2) Comportamiento: una columna por fecha, con botones 😀/😕
    // en vez de un select (más rápido de tocar). ---
    const bloqueComportamiento = () => {
        const encabezadoFechas = comportamientoFechas.map((f) => `
            <th class="text-center small" style="min-width:110px;">
                ${escapeHtml(f)}
                ${soloLectura ? "" : `<button type="button" class="btn btn-link btn-sm p-0 text-danger btn-eliminar-fecha-comportamiento" data-fecha="${f}" title="Eliminar esta fecha">🗑️</button>`}
            </th>`).join("");

        const columnaAgregar = soloLectura ? "" : `
            <th class="text-center" style="min-width:150px;">
                <input type="date" class="form-control form-control-sm d-inline-block" id="inputNuevaFechaComportamiento"
                    value="${fechaInicio || new Date().toISOString().slice(0, 10)}" style="width:130px;">
                <button type="button" class="btn btn-link btn-sm p-0 text-success" id="btnAgregarFechaComportamiento" title="Agregar esta fecha como columna">➕</button>
            </th>`;

        const filas = estudiantes.map((est) => {
            const celdas = comportamientoFechas.map((f) => {
                const valor = comportamientoPorFecha[f]?.[est.id];
                if (soloLectura) return `<td class="text-center">${valor === 5 ? "😀" : valor === 1 ? "😕" : "–"}</td>`;
                return `<td class="text-center">
                    <div class="btn-group btn-group-sm" role="group">
                        <button type="button" class="btn ${valor === 5 ? "btn-success" : "btn-outline-success"} btn-comportamiento" data-fecha="${f}" data-estudiante-id="${est.id}" data-valor="5" title="Buen comportamiento">😀</button>
                        <button type="button" class="btn ${valor === 1 ? "btn-danger" : "btn-outline-danger"} btn-comportamiento" data-fecha="${f}" data-estudiante-id="${est.id}" data-valor="1" title="Mal comportamiento">😕</button>
                    </div>
                </td>`;
            }).join("");
            return `<tr><td class="small">${escapeHtml(est.nombre)}</td>${celdas}${soloLectura ? "" : "<td></td>"}</tr>`;
        }).join("");

        return `
            <table class="table table-sm table-bordered align-middle mb-2">
                <thead><tr><th class="small">Estudiante</th>${encabezadoFechas}${columnaAgregar}</tr></thead>
                <tbody>${filas || `<tr><td colspan="99" class="text-muted small">Todavía no hay fechas de comportamiento agregadas.</td></tr>`}</tbody>
            </table>`;
    };

    // --- 3/4) Actividades: una columna por actividad, nombre editable
    // en el encabezado y "➕" al final para agregar otra. ---
    const bloqueActividades = (lista, tipoActividad) => {
        const encabezado = lista.map((a) => `
            <th style="min-width:120px;">
                ${soloLectura
                    ? `<div class="text-center small fw-bold">${escapeHtml(a.nombre)}</div>`
                    : `<input type="text" class="form-control form-control-sm input-nombre-actividad text-center fw-bold"
                        data-actividad-id="${a.id}" value="${escapeHtml(a.nombre)}" style="font-size:12px;">`}
                ${soloLectura ? "" : `<button type="button" class="btn btn-link btn-sm p-0 text-danger btn-eliminar-actividad" data-actividad-id="${a.id}" title="Eliminar esta actividad">🗑️</button>`}
            </th>`).join("");

        const columnaAgregar = soloLectura ? "" : `
            <th class="text-center" style="width:44px;">
                <button type="button" class="btn btn-link btn-sm p-0 text-success btn-agregar-actividad" data-tipo="${tipoActividad}" title="Agregar otra actividad">➕</button>
            </th>`;

        const filas = estudiantes.map((est) => {
            const celdas = lista.map((a) => {
                const crudo = a.notas[est.id];
                const valor = (crudo === null || crudo === undefined) ? "" : formatearNotaFinal(String(crudo));
                if (soloLectura) return `<td class="text-center">${valor === "" ? "–" : valor}</td>`;
                return `<td>
                    <input type="text" inputmode="decimal" class="form-control form-control-sm input-nota-actividad"
                        data-actividad-id="${a.id}" data-estudiante-id="${est.id}" value="${valor}" style="width:60px; margin:auto;">
                </td>`;
            }).join("");
            return `<tr><td class="small">${escapeHtml(est.nombre)}</td>${celdas}${soloLectura ? "" : "<td></td>"}</tr>`;
        }).join("");

        return `
            <table class="table table-sm table-bordered align-middle mb-3">
                <thead><tr><th class="small">Estudiante</th>${encabezado}${columnaAgregar}</tr></thead>
                <tbody>${filas || `<tr><td colspan="99" class="text-muted small">Todavía no hay actividades. Usa el ➕ de arriba para agregar la primera.</td></tr>`}</tbody>
            </table>`;
    };

    el.cuerpo.innerHTML = `
        <h6 class="fw-bold" style="color:var(--color-primario, #4f46e5);">Rango de fechas de esta Apreciación</h6>
        ${bloqueRango()}
        ${soloLectura ? "" : `<button type="button" class="btn btn-sm btn-outline-secondary mb-3" id="btnVolverModoDirecto">↩️ Ya no quiero el detalle — usar casilla directa</button>`}

        <h6 class="fw-bold mt-3" style="color:var(--color-primario, #4f46e5);">1) Asistencia</h6>
        ${bloqueAsistencia()}

        <h6 class="fw-bold" style="color:var(--color-primario, #4f46e5);">2) Comportamiento <span class="small text-muted fw-normal">(agrega una columna por cada día)</span></h6>
        ${bloqueComportamiento()}

        <h6 class="fw-bold" style="color:var(--color-primario, #4f46e5);">3) Actividades en clase</h6>
        ${bloqueActividades(actividadesClase, "clase")}

        <h6 class="fw-bold" style="color:var(--color-primario, #4f46e5);">4) Actividades para la casa</h6>
        ${bloqueActividades(actividadesCasa, "casa")}

        <h6 class="fw-bold mt-4" style="color:var(--color-primario, #4f46e5);">Nota final de Apreciación ${numeroApreciacion}</h6>
        <table class="table table-sm table-bordered">
            <thead><tr><th class="small">Estudiante</th><th class="small text-center">Nota final</th></tr></thead>
            <tbody>${estudiantes.map((est) => `<tr><td class="small">${escapeHtml(est.nombre)}</td><td class="text-center fw-bold" id="aprNotaFinal-${est.id}">–</td></tr>`).join("")}</tbody>
        </table>
    `;

    if (soloLectura) return;

    document.getElementById("btnVolverModoDirecto")?.addEventListener("click", async () => {
        const ok = window.confirm(
            `¿Cambiar la Apreciación ${estado_.numeroApreciacion} a "casilla directa"? Vas a poder escribir la nota final tú mismo, como en Aprec. 1, 2 y 3. Lo que ya llenaste aquí (comportamiento, actividades) no se borra, solo deja de usarse para calcular la nota.`
        );
        if (!ok) return;

        await elegirModoApreciacion(estado_.materia, estado_.trimestre, estado_.numeroApreciacion, "directo");

        const modalBootstrap = bootstrap.Modal.getInstance(document.getElementById("modalApreciacionDetalle"));
        modalBootstrap?.hide();

        if (typeof window.__recargarSalonProfesor === "function") {
            await window.__recargarSalonProfesor();
        }
    });

    // --- Listeners: rango de fechas ---
    document.getElementById("inputFechaInicioApreciacion")?.addEventListener("input", (e) => {
        estado_.fechaInicioBorrador = e.target.value;
    });
    document.getElementById("inputFechaFinApreciacion")?.addEventListener("input", (e) => {
        estado_.fechaFinBorrador = e.target.value;
    });

    document.getElementById("btnGuardarRangoApreciacion")?.addEventListener("click", async () => {
        const inicio = document.getElementById("inputFechaInicioApreciacion").value;
        const fin = document.getElementById("inputFechaFinApreciacion").value;
        if (!inicio || !fin) { alert("Elige ambas fechas (revisa que el día, mes y año estén completos)."); return; }
        if (inicio > fin) { alert("La fecha 'Desde' no puede ser posterior a 'Hasta'."); return; }

        const resultado = await guardarRangoFechas(estado_.materia, estado_.trimestre, estado_.numeroApreciacion, inicio, fin);
        if (!resultado.ok) {
            alert("❌ No se pudo guardar el rango de fechas.\n\nMotivo: " + (resultado.error?.message || "desconocido"));
            return;
        }

        estado_.fechaInicio = inicio;
        estado_.fechaFin = fin;
        estado_.fechaInicioBorrador = null;
        estado_.fechaFinBorrador = null;

        const asistenciaTabla = await obtenerAsistenciaPorRango(estado_.materia, estado_.salon, inicio, fin);
        estado_.asistenciaFechas = [...asistenciaTabla.fechas];
        estado_.asistenciaPorFecha = { ...asistenciaTabla.porFecha };

        pintarModal(estado_);
        calcularYPintarNotasFinales(estado_);
    });

    // --- Listeners: Comportamiento ---
    el.cuerpo.querySelectorAll(".btn-comportamiento").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const fecha = btn.dataset.fecha;
            const estudianteId = btn.dataset.estudianteId;
            const valor = parseInt(btn.dataset.valor, 10);
            (estado_.comportamientoPorFecha[fecha] ??= {})[estudianteId] = valor;
            await guardarComportamiento(estado_.materia, estado_.trimestre, estado_.numeroApreciacion, fecha, estudianteId, valor);
            pintarModal(estado_);
            calcularYPintarNotasFinales(estado_);
        });
    });

    document.getElementById("btnAgregarFechaComportamiento")?.addEventListener("click", () => {
        const fecha = document.getElementById("inputNuevaFechaComportamiento").value;
        if (!fecha) { alert("Elige una fecha primero."); return; }
        if (!estado_.comportamientoFechas.includes(fecha)) {
            estado_.comportamientoFechas.push(fecha);
            estado_.comportamientoFechas.sort();
            estado_.comportamientoPorFecha[fecha] ??= {};
        }
        pintarModal(estado_);
        calcularYPintarNotasFinales(estado_);
    });

    el.cuerpo.querySelectorAll(".btn-eliminar-fecha-comportamiento").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const fecha = btn.dataset.fecha;
            if (!window.confirm(`¿Eliminar la columna de comportamiento del ${fecha}?`)) return;
            await eliminarFechaComportamiento(estado_.materia, estado_.trimestre, estado_.numeroApreciacion, fecha);
            estado_.comportamientoFechas = estado_.comportamientoFechas.filter((f) => f !== fecha);
            delete estado_.comportamientoPorFecha[fecha];
            pintarModal(estado_);
            calcularYPintarNotasFinales(estado_);
        });
    });

    // --- Listeners: Actividades ---
    el.cuerpo.querySelectorAll(".input-nota-actividad").forEach((input) => {
        input.addEventListener("input", () => {
            const alFinal = input.selectionEnd === input.value.length;
            input.value = sanitizarEntradaNota(input.value);
            if (alFinal) input.selectionStart = input.selectionEnd = input.value.length;
        });

        input.addEventListener("change", async () => {
            const formateado = formatearNotaFinal(input.value);
            input.value = formateado;
            const nota = formateado === "" ? null : parseFloat(formateado);
            const actividadId = input.dataset.actividadId;
            const estudianteId = input.dataset.estudianteId;

            const listaClase = estado_.actividadesClase.find((a) => a.id === actividadId);
            const listaCasa = estado_.actividadesCasa.find((a) => a.id === actividadId);
            if (listaClase) listaClase.notas[estudianteId] = nota;
            if (listaCasa) listaCasa.notas[estudianteId] = nota;

            await guardarCalificacionActividad(actividadId, estudianteId, nota);
            calcularYPintarNotasFinales(estado_);
        });
    });

    el.cuerpo.querySelectorAll(".input-nombre-actividad").forEach((input) => {
        input.addEventListener("blur", async () => {
            const nombre = input.value.trim();
            if (!nombre) return;
            const actividadId = input.dataset.actividadId;
            const listaClase = estado_.actividadesClase.find((a) => a.id === actividadId);
            const listaCasa = estado_.actividadesCasa.find((a) => a.id === actividadId);
            if (listaClase) listaClase.nombre = nombre;
            if (listaCasa) listaCasa.nombre = nombre;
            await renombrarActividad(actividadId, nombre);
        });
    });

    el.cuerpo.querySelectorAll(".btn-agregar-actividad").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const tipoActividad = btn.dataset.tipo;
            const lista = tipoActividad === "clase" ? estado_.actividadesClase : estado_.actividadesCasa;
            const nombre = `Actividad ${lista.length + 1}`;
            const nueva = await crearActividad(estado_.materia, estado_.trimestre, estado_.numeroApreciacion, tipoActividad, nombre, lista.length);
            if (!nueva) { alert("No se pudo crear la actividad."); return; }
            lista.push(nueva);
            pintarModal(estado_);
            calcularYPintarNotasFinales(estado_);
        });
    });

    el.cuerpo.querySelectorAll(".btn-eliminar-actividad").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const actividadId = btn.dataset.actividadId;
            if (!window.confirm("¿Eliminar esta actividad y todas sus calificaciones?")) return;
            await eliminarActividad(actividadId);
            estado_.actividadesClase = estado_.actividadesClase.filter((a) => a.id !== actividadId);
            estado_.actividadesCasa = estado_.actividadesCasa.filter((a) => a.id !== actividadId);
            pintarModal(estado_);
            calcularYPintarNotasFinales(estado_);
        });
    });
}
