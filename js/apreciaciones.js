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

// Fecha de hoy en formato YYYY-MM-DD (hora local, no UTC), para
// marcar automáticamente la fecha de una nueva "Actividad en clase".
function obtenerFechaHoyISOApreciacion() {
    const hoy = new Date();
    const y = hoy.getFullYear();
    const m = String(hoy.getMonth() + 1).padStart(2, "0");
    const d = String(hoy.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
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

// Formatea el promedio de UNA sección (Asistencia, Comportamiento,
// Actividades en clase o en casa) para mostrarlo al final de la fila
// de cada estudiante dentro del detalle de una Apreciación 4+.
function formatearPromedioSeccion(valor) {
    return valor === null || valor === undefined || isNaN(valor) ? "–" : valor.toFixed(1);
}

// Valores fijos pedidos explícitamente en el punto 6 (Comportamiento):
// buen comportamiento = 5, mal comportamiento = 1.
const VALOR_COMPORTAMIENTO_BUENO = 5;
const VALOR_COMPORTAMIENTO_MALO = 1;

// Valores de asistencia (traducen el estado que ya existe en el
// sistema de asistencia -presente/tardanza/ausente/permiso/fuga- a una
// nota 1-5). Viven en config_pesos_apreciacion junto a los pesos, así
// quedan igual de centralizados y editables desde la base de datos.
// "fuga" vale igual que "ausente" (1).
const VALOR_ASISTENCIA_DEFECTO = { presente: 5, tardanza: 3, ausente: 1, permiso: 5, fuga: 1 };

// Igual que en la cuadrícula del trimestre (historial-asistencia.js): si
// un día NO tiene fila guardada en asistencia_detalle para un estudiante,
// se asume "presente" por defecto (más rápido de revisar: el profesor
// solo corrige las excepciones). Antes esta pantalla mostraba esos días
// como "—" (vacío) y los excluía del promedio, lo que hacía que la nota
// y las casillas NO coincidieran con lo que se ve en la cuadrícula de
// Asistencia. Se deja centralizado aquí para no repetir el criterio.
const ESTADO_ASISTENCIA_DEFECTO = "presente";

// Ciclo de estados al hacer clic sobre una casilla de asistencia dentro
// de la Apreciación (igual orden que en la pantalla de Asistencia).
const CICLO_ASISTENCIA_APR = ["presente", "ausente", "tardanza", "permiso", "fuga"];
const ETIQUETAS_ASISTENCIA_APR = { presente: "Presente", ausente: "Ausente", tardanza: "Tardanza", permiso: "Permiso", fuga: "Fuga" };

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
// dibujar en la tabla: solo las que YA tienen fila real en
// apreciaciones_estado (activa, completada o bloqueada a mano). Ya NO
// se agrega ninguna columna de "vista previa" automática — para abrir
// la siguiente Apreciación el profesor usa el botón "➕" en la tabla
// (ver profesor.js).
export async function calcularColumnasApreciacionesNuevas(materia, trimestre) {
    let estados = await obtenerEstadoApreciaciones(materia, trimestre);

    if (estados.length === 0) {
        await asegurarApreciacion4Activa(materia, trimestre);
        estados = await obtenerEstadoApreciaciones(materia, trimestre);
    }

    return estados; // [{numero, estado, modo}, ...] ordenado
}

// Crea (o reactiva) la siguiente Apreciación 4+ cuando el profesor le
// da clic al "➕" de esa columna en la tabla principal. Si por
// cualquier razón ya existiera una fila con ese número, no la pisa
// (ignoreDuplicates) para no borrar una que ya estuviera en curso.
export async function activarApreciacionSiguiente(materia, trimestre, numero) {
    const { error } = await supabase.from("apreciaciones_estado").upsert(
        { materia, trimestre, numero, estado: "activa", modo: null },
        { onConflict: "materia,trimestre,numero", ignoreDuplicates: true }
    );
    if (error) { console.error("No se pudo activar la siguiente Apreciación:", error); return false; }
    return true;
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
export async function revisarAvanceApreciacionesDirectas(materia, salon, trimestre, numerosGuardados) {
    let avanzoAlguna = false;
    for (const numero of numerosGuardados) {
        const { data: completada, error } = await supabase.rpc("completar_y_avanzar_apreciacion", {
            p_materia: materia, p_trimestre: trimestre, p_numero: numero, p_salon: salon,
        });
        if (error) { console.error(error); continue; }
        if (completada) avanzoAlguna = true;
    }
    return avanzoAlguna;
}

// Marca la apreciación como completada aunque falten estudiantes por
// registrar: el profesor decide, sin depender del conteo automático.
export async function completarApreciacionManual(materia, trimestre, numeroApreciacion) {
    const { error } = await supabase.rpc("completar_apreciacion_manual", {
        p_materia: materia, p_trimestre: trimestre, p_numero: numeroApreciacion,
    });
    if (error) { console.error(error); return false; }
    return true;
}

export async function reiniciarApreciacionActiva(materia, trimestre, numeroApreciacion) {
    const { data: seReinicio, error } = await supabase.rpc("reiniciar_apreciacion_activa", {
        p_materia: materia, p_trimestre: trimestre, p_numero: numeroApreciacion,
    });
    if (error) { console.error(error); return false; }
    return !!seReinicio;
}

// Elimina POR COMPLETO una Apreciación 4+: a diferencia de
// reiniciarApreciacionActiva (que borra el contenido pero deja la
// columna activa esperando que se vuelva a usar), esta función borra
// también la fila de estado, así que la columna desaparece de la
// tabla como si nunca hubiera existido. Útil cuando se agregó una
// columna de más por error (ej. "+" tocado sin querer).
export async function eliminarApreciacionColumna(materia, trimestre, numeroApreciacion) {
    const { error: errNotas } = await supabase.from("notas").delete()
        .eq("materia", materia).eq("trimestre", trimestre).eq("tipo", "apreciacion").eq("numero", numeroApreciacion);
    if (errNotas) { console.error("No se pudo borrar las notas de la apreciación:", errNotas); return { ok: false, error: errNotas }; }

    const { data: actividades, error: errBuscarAct } = await supabase.from("actividades_apreciacion")
        .select("id").eq("materia", materia).eq("trimestre", trimestre).eq("numero_apreciacion", numeroApreciacion);
    if (errBuscarAct) { console.error("No se pudo buscar las actividades de la apreciación:", errBuscarAct); return { ok: false, error: errBuscarAct }; }

    const idsActividades = (actividades || []).map((a) => a.id);
    if (idsActividades.length > 0) {
        const { error: errCalif } = await supabase.from("actividades_calificaciones").delete().in("actividad_id", idsActividades);
        if (errCalif) { console.error("No se pudo borrar las calificaciones de actividades:", errCalif); return { ok: false, error: errCalif }; }

        const { error: errAct } = await supabase.from("actividades_apreciacion").delete().in("id", idsActividades);
        if (errAct) { console.error("No se pudo borrar las actividades:", errAct); return { ok: false, error: errAct }; }
    }

    const { error: errComportamiento } = await supabase.from("comportamiento_detalle").delete()
        .eq("materia", materia).eq("trimestre", trimestre).eq("numero_apreciacion", numeroApreciacion);
    if (errComportamiento) { console.error("No se pudo borrar el comportamiento de la apreciación:", errComportamiento); return { ok: false, error: errComportamiento }; }

    const { error: errEstado } = await supabase.from("apreciaciones_estado").delete()
        .eq("materia", materia).eq("trimestre", trimestre).eq("numero", numeroApreciacion);
    if (errEstado) { console.error("No se pudo borrar el estado de la apreciación:", errEstado); return { ok: false, error: errEstado }; }

    return { ok: true };
}

const ICONO_ESTADO = { completada: "✓", activa: "🟢", bloqueada: "🔒" };

export function iconoApreciacion(estado) {
    return ICONO_ESTADO[estado] || "";
}

// =========================================================
// 2) PESOS Y VALORES (leídos de config_pesos_apreciacion)
// =========================================================

export async function obtenerConfigPesos() {
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

export async function guardarConfigPesos({ peso_asistencia, peso_comportamiento, peso_actividades_clase, peso_actividades_casa }) {
    const suma = Number(peso_asistencia) + Number(peso_comportamiento) + Number(peso_actividades_clase) + Number(peso_actividades_casa);
    if (Math.round(suma) !== 100) {
        return { ok: false, error: { message: `Los 4 porcentajes deben sumar 100. Ahora mismo suman ${suma}.` } };
    }
    const { error } = await supabase.from("config_pesos_apreciacion").update({
        peso_asistencia, peso_comportamiento, peso_actividades_clase, peso_actividades_casa,
        updated_at: new Date().toISOString(),
    }).eq("id", 1);
    return { ok: !error, error };
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
        .select("fecha_inicio, fecha_fin, fechas_asistencia_excluidas")
        .eq("materia", materia).eq("trimestre", trimestre).eq("numero", numeroApreciacion)
        .maybeSingle();
    if (error) { console.error(error); return { fecha_inicio: null, fecha_fin: null, fechas_asistencia_excluidas: [] }; }
    return data || { fecha_inicio: null, fecha_fin: null, fechas_asistencia_excluidas: [] };
}

// Fechas de asistencia que el docente marcó como "no contar en el
// promedio de esta Apreciación" (ej. una fecha mal tomada). No borra
// la asistencia real -solo la excluye de este cálculo-, y queda
// guardado en la base de datos (no se pierde al recargar la página).
export async function guardarFechasAsistenciaExcluidas(materia, trimestre, numeroApreciacion, fechas) {
    const { error } = await supabase.from("apreciaciones_estado")
        .update({ fechas_asistencia_excluidas: fechas, updated_at: new Date().toISOString() })
        .eq("materia", materia).eq("trimestre", trimestre).eq("numero", numeroApreciacion);
    if (error) console.error("No se pudo guardar las fechas de asistencia excluidas:", error);
    return !error;
}

export async function guardarRangoFechas(materia, trimestre, numeroApreciacion, fechaInicio, fechaFin) {
    const { error } = await supabase.from("apreciaciones_estado")
        .update({ fecha_inicio: fechaInicio, fecha_fin: fechaFin, updated_at: new Date().toISOString() })
        .eq("materia", materia).eq("trimestre", trimestre).eq("numero", numeroApreciacion);
    if (error) console.error("No se pudo guardar el rango de fechas:", error);
    return { ok: !error, error };
}

export async function obtenerAsistenciaPorRango(materia, salon, fechaInicio, fechaFin, correoProfesor) {
    if (!fechaInicio || !fechaFin) return { fechas: [], porFecha: {}, idPorFecha: {} };

    const { data: sesiones, error } = await supabase
        .from("asistencias")
        .select("id, fecha")
        .eq("materia", materia).eq("salon", salon)
        .gte("fecha", fechaInicio).lte("fecha", fechaFin)
        .order("fecha", { ascending: true });

    if (error) { console.error(error); return { fechas: [], porFecha: {}, idPorFecha: {} }; }

    const fechaPorSesion = Object.fromEntries((sesiones || []).map((s) => [s.id, s.fecha]));
    const idPorFecha = Object.fromEntries((sesiones || []).map((s) => [s.fecha, s.id]));
    const porFecha = {};

    if (sesiones && sesiones.length > 0) {
        const { data: detalles, error: errDet } = await supabase
            .from("asistencia_detalle")
            .select("asistencia_id, estudiante_id, estado")
            .in("asistencia_id", sesiones.map((s) => s.id));
        if (errDet) { console.error(errDet); return { fechas: [], porFecha: {}, idPorFecha: {} }; }
        (detalles || []).forEach((d) => {
            const fecha = fechaPorSesion[d.asistencia_id];
            (porFecha[fecha] ??= {})[d.estudiante_id] = d.estado;
        });
    }

    // Días de clase reales de esta materia/salón (según el horario del
    // profesor) dentro del rango, AUNQUE todavía no se haya pasado lista
    // ese día. Así la Apreciación muestra el día desde ya (con "Presente"
    // por defecto, corregible con un clic) en vez de esperar a que se
    // tome asistencia primero en la otra pantalla.
    const diasHorario = await averiguarDiasDeClaseApr(materia, salon, correoProfesor);
    const fechasHorario = diasHorario.size > 0
        ? generarFechasRangoApr(fechaInicio, fechaFin, diasHorario)
        : [];

    // Unimos: fechas con sesión real ya creada + fechas de horario sin
    // sesión todavía, sin repetir, en orden.
    const fechas = [...new Set([...(sesiones || []).map((s) => s.fecha), ...fechasHorario])].sort();

    return { fechas, porFecha, idPorFecha };
}

const DIAS_SEMANA_APR = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

function quitarAcentosApr(texto) {
    return String(texto ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Qué días de la semana (lunes, martes...) tiene clase esta materia en
// este salón, según profesor_materias (sistema viejo) + horario_profesor
// (sistema nuevo). Igual criterio que la cuadrícula del trimestre en
// Asistencia, para que ambas pantallas muestren los mismos días.
async function averiguarDiasDeClaseApr(materia, salon, correoProfesor) {
    if (!correoProfesor) return new Set();

    const [{ data: filasViejas }, { data: filasHorario }] = await Promise.all([
        supabase.from("profesor_materias").select("dia").eq("correo_profesor", correoProfesor).eq("materia", materia).eq("salon", salon),
        supabase.from("horario_profesor").select("dia").eq("correo_profesor", correoProfesor).eq("materia", materia).eq("salon", salon).eq("tipo", "clase"),
    ]);

    const dias = new Set();
    [...(filasViejas || []), ...(filasHorario || [])].forEach((f) => {
        const dia = quitarAcentosApr((f.dia || "").trim().toLowerCase());
        if (dia) dias.add(dia);
    });
    return dias;
}

// Fechas ISO (ascendente) entre desde/hasta cuyo día de la semana esté
// en diasPermitidos (Set de strings sin acentos, ej. {"lunes","miercoles"}).
function generarFechasRangoApr(desdeISO, hastaISO, diasPermitidos) {
    const fechas = [];
    const cursor = new Date(desdeISO + "T00:00:00");
    const limite = new Date(hastaISO + "T00:00:00");

    while (cursor <= limite && fechas.length < 200) {
        const diaTexto = DIAS_SEMANA_APR[cursor.getDay()];
        if (diasPermitidos.has(diaTexto)) {
            const y = cursor.getFullYear();
            const m = String(cursor.getMonth() + 1).padStart(2, "0");
            const d = String(cursor.getDate()).padStart(2, "0");
            fechas.push(`${y}-${m}-${d}`);
        }
        cursor.setDate(cursor.getDate() + 1);
    }
    return fechas;
}

// Asegura que exista la cabecera ("asistencias") de materia/salon/fecha,
// creándola si hace falta (ej. un día de horario que nunca se abrió en
// la pantalla de Asistencia), y guarda (upsert) el estado de un
// estudiante para esa fecha. Devuelve el id de la cabecera para poder
// reusarlo sin volver a crearla en el siguiente clic.
export async function guardarCorreccionAsistenciaConCabecera({ asistenciaId, materia, salon, fecha, correoProfesor, estudianteId, estado }) {
    let idFinal = asistenciaId;

    if (!idFinal) {
        const { data: cabecera, error: errCabecera } = await supabase
            .from("asistencias")
            .upsert(
                { correo_profesor: correoProfesor, materia, salon, fecha },
                { onConflict: "materia,salon,fecha" }
            )
            .select("id")
            .single();
        if (errCabecera) { console.error("No se pudo crear la clase de ese día:", errCabecera); return { ok: false }; }
        idFinal = cabecera.id;
    }

    const ok = await guardarCorreccionAsistencia(idFinal, estudianteId, estado);
    return { ok, asistenciaId: idFinal };
}

// Guarda (upsert) la corrección de UN estudiante en UNA fecha, dentro del
// panel de Apreciación. Usa la misma tabla/llave que el resto del
// sistema de asistencia (asistencia_id + estudiante_id), así que la
// corrección queda reflejada también en la pantalla de Asistencia y en
// la cuadrícula del trimestre — es la MISMA asistencia real, solo que
// aquí se puede corregir sin salir de la Apreciación.
export async function guardarCorreccionAsistencia(asistenciaId, estudianteId, estado) {
    const { error } = await supabase
        .from("asistencia_detalle")
        .upsert({ asistencia_id: asistenciaId, estudiante_id: estudianteId, estado }, { onConflict: "asistencia_id,estudiante_id" });
    if (error) { console.error("No se pudo corregir la asistencia:", error); return false; }
    return true;
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
        .select("id, nombre, orden, fecha")
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

// tipoActividad "clase": fecha se pone automáticamente (hoy) al crear
// la actividad, para poder tener varias el mismo día (varias preguntas
// al mismo estudiante) y para bloquear la nota si ese día el estudiante
// estuvo Ausente/Fuga/Permiso. tipoActividad "casa" no usa fecha.
async function crearActividad(materia, trimestre, numeroApreciacion, tipoActividad, nombre, orden, fecha = null) {
    const { data, error } = await supabase.from("actividades_apreciacion")
        .insert([{ materia, trimestre, numero_apreciacion: numeroApreciacion, tipo_actividad: tipoActividad, nombre, orden, fecha }])
        .select("id, nombre, orden, fecha").single();
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
    materia, salon, trimestre, numeroApreciacion, correoProfesor, estudiantes, notasFinalesPorEstudiante,
}) {
    const hoy = new Date().toISOString().slice(0, 10);

    for (const est of estudiantes) {
        const nota = notasFinalesPorEstudiante[est.id];
        if (nota === null || nota === undefined) continue; // ese estudiante aún no tiene todo listo

        const notaRedondeada = Math.min(5, Math.max(1, Math.round(nota * 10) / 10));

        const { data: existente } = await supabase.from("notas").select("id")
            .eq("materia", materia).eq("trimestre", trimestre).eq("tipo", "apreciacion").eq("numero", numeroApreciacion)
            .eq(est.id ? "estudiante_id" : "correo", est.id || est.correo)
            .is("eliminado_en", null).maybeSingle();

        const payload = {
            correo: est.correo || null,
            estudiante_id: est.id || null,
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
        p_materia: materia, p_trimestre: trimestre, p_numero: numeroApreciacion, p_salon: salon,
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
        btnCompletarManual: document.getElementById("btnCompletarApreciacionManual"),
        estadoGuardado: document.getElementById("apreciacionModalEstadoGuardado"),
    };
    return elementosModal;
}

export async function abrirSelectorModo({ materia, salon, trimestre, numeroApreciacion, correoProfesor, estudiantes, etiquetaPersonalizada, onModoElegido }) {
    const el = obtenerElementosModal();
    if (!el.modalEl) { alert("Falta el HTML del modal de Apreciación en la página."); return; }

    const nombreMostrado = etiquetaPersonalizada || `Apreciación ${numeroApreciacion}`;
    el.titulo.textContent = `${nombreMostrado} — ¿Cómo la vas a registrar?`;
    el.btnGuardar && (el.btnGuardar.style.display = "none");
    el.btnCompletarManual && (el.btnCompletarManual.style.display = "none");
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
        el.btnGuardar && (el.btnGuardar.style.display = "inline-block");
        onModoElegido?.("detallado");
        await abrirDetalleApreciacion({ materia, salon, trimestre, numeroApreciacion, estado: "activa", estudiantes, correoProfesor, etiquetaPersonalizada });
    };
}

export async function abrirDetalleApreciacion({ materia, salon, trimestre, numeroApreciacion, estado, estudiantes, correoProfesor, etiquetaPersonalizada }) {
    const el = obtenerElementosModal();
    if (!el.modalEl) { alert("Falta el HTML del modal de Apreciación en la página."); return; }

    if (estado === "bloqueada") {
        alert(`La Apreciación ${numeroApreciacion} todavía está bloqueada. Primero hay que completar la anterior.`);
        return;
    }

    el.titulo.textContent = etiquetaPersonalizada || `Apreciación ${numeroApreciacion}`;
    el.cuerpo.innerHTML = `<div class="text-center py-4"><span class="spinner-border"></span> Cargando...</div>`;
    const modalBootstrap = new bootstrap.Modal(el.modalEl);
    modalBootstrap.show();

    const soloLectura = estado === "completada";

    const rango = await obtenerRangoFechas(materia, trimestre, numeroApreciacion);

    const [pesos, asistenciaTabla, comportamientoTabla, actividadesClase, actividadesCasa] = await Promise.all([
        obtenerConfigPesos(),
        obtenerAsistenciaPorRango(materia, salon, rango.fecha_inicio, rango.fecha_fin, correoProfesor),
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
        fechasAsistenciaExcluidas: new Set(rango.fechas_asistencia_excluidas || []),
        asistenciaFechas: [...asistenciaTabla.fechas], asistenciaPorFecha: { ...asistenciaTabla.porFecha },
        asistenciaIdPorFecha: { ...asistenciaTabla.idPorFecha },
        comportamientoFechas: [...comportamientoTabla.fechas], comportamientoPorFecha: { ...comportamientoTabla.porFecha },
        actividadesClase, actividadesCasa,
        valoresAsistencia: VALOR_ASISTENCIA_DEFECTO,
        // Qué columnas (fechas o actividades) NO quiere ver el docente
        // ahora mismo en cada una de las 4 secciones. Es solo de
        // pantalla — no borra nada, y empieza vacío (todo visible)
        // hasta que el docente desmarque algo. Se guarda en estado_
        // para que sobreviva a los re-pintados del modal.
        columnasOcultas: { asistencia: new Set(), comportamiento: new Set(), clase: new Set(), casa: new Set() },
        // Qué pestaña está activa en el modal (asistencia / comportamiento /
        // clase / casa / final). Se guarda en estado_ para que no se pierda
        // cada vez que el modal se vuelve a pintar tras una acción.
        tabApreciacionActiva: "asistencia",
    };

    pintarModal(estado_);
    calcularYPintarNotasFinales(estado_);

    el.btnGuardar && (el.btnGuardar.style.display = soloLectura ? "none" : "inline-block");
    el.btnCompletarManual && (el.btnCompletarManual.style.display = soloLectura ? "none" : "inline-block");
    el.estadoGuardado.textContent = soloLectura
        ? "Esta apreciación ya está completada. Solo lectura."
        : "";

    if (el.btnGuardar) el.btnGuardar.onclick = async () => {
        el.btnGuardar.disabled = true;
        el.estadoGuardado.textContent = "Guardando...";

        const notasFinalesPorEstudiante = {};
        estudiantes.forEach((est) => {
            notasFinalesPorEstudiante[est.id] = calcularNotaFinalEstudiante(estado_, est.id);
        });

        const resultado = await guardarApreciacionCompleta({
            materia, salon, trimestre, numeroApreciacion, correoProfesor, estudiantes, notasFinalesPorEstudiante,
        });

        el.btnGuardar.disabled = false;
        if (!resultado.ok) {
            el.estadoGuardado.textContent = "❌ Error al guardar: " + (resultado.error?.message || "desconocido");
            el.estadoGuardado.className = "small text-danger ms-2";
            return;
        }

        el.estadoGuardado.textContent = resultado.completada
            ? `✅ Guardado. Apreciación ${numeroApreciacion} completada — Apreciación ${numeroApreciacion + 1} ya está activa.`
            : "✅ Notas guardadas. Toca \"Marcar como completada\" cuando quieras cerrar esta apreciación.";
        el.estadoGuardado.className = "small text-success ms-2";

        if (resultado.completada && typeof window.__recargarSalonProfesor === "function") {
            await window.__recargarSalonProfesor();
            setTimeout(() => modalBootstrap.hide(), 1200);
        }
    };

    if (el.btnCompletarManual) el.btnCompletarManual.onclick = async () => {
        const ok = window.confirm(
            `¿Marcar la Apreciación ${numeroApreciacion} como completada? Esto activa la Apreciación ${numeroApreciacion + 1}, sin importar si a algún estudiante le falta nota. Antes de esto, asegúrate de haber presionado "💾 Guardar apreciación" para que las notas ya calculadas queden guardadas.`
        );
        if (!ok) return;

        el.btnCompletarManual.disabled = true;
        const seCompleto = await completarApreciacionManual(materia, trimestre, numeroApreciacion);
        el.btnCompletarManual.disabled = false;

        if (!seCompleto) {
            alert("No se pudo completar la apreciación.");
            return;
        }

        el.estadoGuardado.textContent = `✅ Apreciación ${numeroApreciacion} marcada como completada — Apreciación ${numeroApreciacion + 1} ya está activa.`;
        el.estadoGuardado.className = "small text-success ms-2";

        if (typeof window.__recargarSalonProfesor === "function") {
            await window.__recargarSalonProfesor();
        }
        setTimeout(() => modalBootstrap.hide(), 1200);
    };
}

// Valor de comportamiento "efectivo" para un estudiante en una fecha:
// - si hay un valor guardado explícitamente (5 o 1), se usa ese.
// - si NO hay valor guardado pero esa fecha es un día de clase real
//   (aparece en asistenciaFechas), se asume 5 (buen comportamiento por
//   defecto) — el docente solo tiene que marcar 😕 a quien se portó mal.
// - si la fecha no es día de clase (la agregó el docente a mano y
//   todavía no le puso nada), no se asume nada: cuenta como vacío.
function valorComportamientoEfectivo(estado_, fecha, estudianteId) {
    const explicito = estado_.comportamientoPorFecha[fecha]?.[estudianteId];
    if (explicito !== undefined && explicito !== null) return explicito;
    if (estado_.asistenciaFechas.includes(fecha)) return VALOR_COMPORTAMIENTO_BUENO;
    return undefined;
}

// Una actividad "de clase" queda bloqueada (no cuenta, se ve "—") para
// un estudiante si ese día (a.fecha) estuvo Ausente o con Permiso
// según la asistencia ya registrada. Las actividades "para la casa"
// no tienen fecha (a.fecha es null) y nunca se bloquean.
function actividadBloqueadaParaEstudiante(a, estudianteId, asistenciaPorFecha) {
    if (!a.fecha) return false;
    const estadoEseDia = asistenciaPorFecha[a.fecha]?.[estudianteId];
    return estadoEseDia === "ausente" || estadoEseDia === "permiso";
}

// Si el estudiante estuvo en "Fuga" ese día, la actividad de ese día
// NO se bloquea: en cambio se fuerza automáticamente a 1.0 (a
// diferencia de Ausente/Permiso, que se excluyen del promedio). La
// casilla queda de solo lectura para que no se pueda "arreglar" a mano.
function actividadForzadaFugaParaEstudiante(a, estudianteId, asistenciaPorFecha) {
    if (!a.fecha) return false;
    return asistenciaPorFecha[a.fecha]?.[estudianteId] === "fuga";
}

// Valor efectivo de una actividad "de clase" para el promedio: 1.0
// fijo si ese día fue Fuga, o la nota que el docente puso.
function valorActividadClaseEfectivo(a, estudianteId, asistenciaPorFecha) {
    if (actividadForzadaFugaParaEstudiante(a, estudianteId, asistenciaPorFecha)) return 1;
    return a.notas[estudianteId];
}

function calcularNotasParcialesEstudiante(estado_, estudianteId) {
    const { asistenciaFechas, asistenciaPorFecha, comportamientoFechas, actividadesClase, actividadesCasa, valoresAsistencia } = estado_;

    // Las fechas que el docente marcó como "excluir" (ej. una asistencia
    // mal tomada) NO cuentan en el promedio de Asistencia ni en el
    // Comportamiento automático de ese día -aunque la asistencia real
    // siga existiendo en el sistema general de Asistencia-.
    const excluidas = estado_.fechasAsistenciaExcluidas || new Set();
    const fechasAsistenciaValidas = asistenciaFechas.filter((f) => !excluidas.has(f));

    // Si un día real de clase no tiene fila guardada para este
    // estudiante, se asume "presente" (igual que la cuadrícula del
    // trimestre en Asistencia) en vez de excluirlo del promedio, para
    // que la nota de Asistencia coincida con lo que se ve ahí.
    const valoresAsist = fechasAsistenciaValidas
        .map((f) => asistenciaPorFecha[f]?.[estudianteId] || ESTADO_ASISTENCIA_DEFECTO)
        .map((estadoDia) => valoresAsistencia[estadoDia])
        .filter((v) => v !== undefined);
    const notaAsistencia = promedio(valoresAsist);

    // Unimos las fechas de comportamiento agregadas a mano con las de
    // asistencia válidas (excluyendo las marcadas), así los días de
    // clase cuentan aunque no se haya tocado nada ahí todavía, pero una
    // fecha excluida no vuelve a colarse por este lado.
    const fechasComportamiento = [...new Set([...comportamientoFechas, ...fechasAsistenciaValidas])];
    const valoresComportamiento = fechasComportamiento
        .map((f) => valorComportamientoEfectivo(estado_, f, estudianteId))
        .filter((v) => v !== undefined);
    const notaComportamiento = promedio(valoresComportamiento);

    const notaActClase = promedio(
        actividadesClase
            .filter((a) => !actividadBloqueadaParaEstudiante(a, estudianteId, asistenciaPorFecha))
            .map((a) => valorActividadClaseEfectivo(a, estudianteId, asistenciaPorFecha))
            .filter((v) => v !== undefined)
    );
    const notaActCasa = promedio(actividadesCasa.map((a) => a.notas[estudianteId]).filter((v) => v !== undefined));

    return { notaAsistencia, notaComportamiento, notaActClase, notaActCasa };
}

function calcularNotaFinalEstudiante(estado_, estudianteId) {
    const partes = calcularNotasParcialesEstudiante(estado_, estudianteId);
    return calcularNotaFinalApreciacion(partes, estado_.pesos);
}

function calcularYPintarNotasFinales(estado_) {
    estado_.estudiantes.forEach((est) => {
        const nota = calcularNotaFinalEstudiante(estado_, est.id);
        const celda = document.getElementById(`aprNotaFinal-${est.id}`);
        if (celda) celda.textContent = nota !== null ? nota.toFixed(2) : "–";
    });
}

// =========================================================
// 9) IMPRIMIR / PDF — reporte de la apreciación completa
// =========================================================
// Abre una ventana nueva con Asistencia + Comportamiento + Actividades
// + Nota final, ya formateados para imprimir. Desde el diálogo de
// impresión del navegador, el docente elige "Guardar como PDF".

export function imprimirApreciacion(estado_) {
    const {
        materia, salon, trimestre, numeroApreciacion, estudiantes,
        fechaInicio, fechaFin, asistenciaFechas, asistenciaPorFecha,
        comportamientoFechas, actividadesClase, actividadesCasa,
    } = estado_;

    const fechasComportamientoReporte = [...new Set([...comportamientoFechas, ...asistenciaFechas])].sort();

    const filaAsistencia = (est) => asistenciaFechas.map((f) => {
        const v = asistenciaPorFecha[f]?.[est.id] || ESTADO_ASISTENCIA_DEFECTO;
        return `<td>${escapeHtml(v)}</td>`;
    }).join("");

    const filaComportamiento = (est) => fechasComportamientoReporte.map((f) => {
        const v = valorComportamientoEfectivo(estado_, f, est.id);
        return `<td>${v === 5 ? "Bueno" : v === 1 ? "Malo" : "—"}</td>`;
    }).join("");

    const filaActividades = (lista, est) => lista.map((a) => {
        if (actividadBloqueadaParaEstudiante(a, est.id, asistenciaPorFecha)) {
            return `<td class="text-muted">—</td>`;
        }
        const v = valorActividadClaseEfectivo(a, est.id, asistenciaPorFecha);
        return `<td>${(v === null || v === undefined) ? "—" : formatearNotaFinal(String(v))}</td>`;
    }).join("");

    const filasEstudiantes = estudiantes.map((est) => `
        <tr>
            <td class="nombre">${escapeHtml(est.nombre)}</td>
            ${filaAsistencia(est)}
            ${filaComportamiento(est)}
            ${filaActividades(actividadesClase, est)}
            ${filaActividades(actividadesCasa, est)}
            <td class="final">${(() => { const n = calcularNotaFinalEstudiante(estado_, est.id); return n !== null ? n.toFixed(2) : "–"; })()}</td>
        </tr>`).join("");

    const colspanAsistencia = Math.max(asistenciaFechas.length, 1);
    const colspanComportamiento = Math.max(fechasComportamientoReporte.length, 1);
    const colspanActClase = Math.max(actividadesClase.length, 1);
    const colspanActCasa = Math.max(actividadesCasa.length, 1);

    const th = (n) => `<th>${escapeHtml(n)}</th>`;

    const html = `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>Apreciación ${numeroApreciacion} — ${escapeHtml(materia)} — ${escapeHtml(salon)}</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; color: #1e293b; }
                h1 { font-size: 18px; margin-bottom: 2px; }
                p.sub { color: #555; margin-top: 0; font-size: 13px; }
                table { border-collapse: collapse; width: 100%; margin-top: 14px; font-size: 11px; }
                th, td { border: 1px solid #94a3b8; padding: 4px 6px; text-align: center; }
                th.grupo { background: #4f46e5; color: #fff; }
                td.nombre { text-align: left; font-weight: bold; white-space: nowrap; }
                td.final { font-weight: bold; background: #ecfdf5; }
                @media print { body { padding: 0; } }
            </style>
        </head>
        <body>
            <h1>Apreciación ${numeroApreciacion} — ${escapeHtml(materia)} — Salón ${escapeHtml(salon)} — ${escapeHtml(trimestre)}</h1>
            <p class="sub">Rango de fechas: ${fechaInicio || "–"} al ${fechaFin || "–"}</p>
            <table>
                <thead>
                    <tr>
                        <th rowspan="2">Estudiante</th>
                        <th class="grupo" colspan="${colspanAsistencia}">Asistencia</th>
                        <th class="grupo" colspan="${colspanComportamiento}">Comportamiento</th>
                        <th class="grupo" colspan="${colspanActClase}">Actividades en clase</th>
                        <th class="grupo" colspan="${colspanActCasa}">Actividades para la casa</th>
                        <th rowspan="2">Nota final</th>
                    </tr>
                    <tr>
                        ${asistenciaFechas.length ? asistenciaFechas.map(th).join("") : "<th>—</th>"}
                        ${fechasComportamientoReporte.length ? fechasComportamientoReporte.map(th).join("") : "<th>—</th>"}
                        ${actividadesClase.length ? actividadesClase.map((a) => th(a.nombre)).join("") : "<th>—</th>"}
                        ${actividadesCasa.length ? actividadesCasa.map((a) => th(a.nombre)).join("") : "<th>—</th>"}
                    </tr>
                </thead>
                <tbody>${filasEstudiantes}</tbody>
            </table>
        </body>
        </html>`;

    const ventana = window.open("", "_blank");
    if (!ventana) { alert("El navegador bloqueó la ventana de impresión. Permite ventanas emergentes para este sitio."); return; }
    ventana.document.write(html);
    ventana.document.close();
    ventana.focus();
    setTimeout(() => ventana.print(), 400);
}

function pintarModal(estado_) {
    const el = obtenerElementosModal();
    const {
        estudiantes, fechaInicio, fechaFin,
        asistenciaFechas, asistenciaPorFecha,
        comportamientoFechas, comportamientoPorFecha,
        actividadesClase, actividadesCasa, soloLectura, numeroApreciacion, pesos,
    } = estado_;

    const rangoDefinido = !!(fechaInicio && fechaFin);
    const columnasOcultas = estado_.columnasOcultas;
    // Para Asistencia, "ocultar" y "excluir del cálculo" son la misma
    // cosa (a diferencia de Comportamiento/Actividades, que sí tienen
    // su propio botón de eliminar real). Se mantienen sincronizadas.
    columnasOcultas.asistencia = new Set(estado_.fechasAsistenciaExcluidas);

    // --- Selector de columnas reutilizable: "Seleccionar todas / Ninguna"
    // + un checkbox por columna (fecha o actividad), igual que en la
    // tabla principal de notas. `seccion` es la clave dentro de
    // columnasOcultas (asistencia / comportamiento / clase / casa). ---
    const bloqueSelectorColumnas = (seccion, items) => {
        if (soloLectura || items.length === 0) return "";
        const ocultas = columnasOcultas[seccion];
        const checks = items.map(({ clave, etiqueta }) => {
            const marcado = !ocultas.has(clave);
            return `
                <label class="form-check" style="display:flex; align-items:center; gap:4px; margin:0;">
                    <input type="checkbox" class="form-check-input check-columna-apreciacion" data-seccion="${seccion}" data-clave="${escapeHtml(clave)}" ${marcado ? "checked" : ""} style="margin:0;">
                    <span class="small">${escapeHtml(etiqueta)}</span>
                </label>`;
        }).join("");
        return `
            <div class="mb-2">
                <button type="button" class="btn btn-link btn-sm p-0 me-3 btn-columnas-todas" data-seccion="${seccion}" style="text-decoration:none;">Ver todas</button>
                <button type="button" class="btn btn-link btn-sm p-0 btn-columnas-ninguna" data-seccion="${seccion}" style="text-decoration:none;">Ninguna</button>
                <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:6px; padding:8px; background:#f8fafc; border-radius:6px;">${checks}</div>
            </div>`;
    };

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
            return `<p class="text-muted small">No hay días de clase de esta materia (${escapeHtml(estado_.materia)} — ${escapeHtml(estado_.salon)}) entre ${fechaInicio} y ${fechaFin}. Revisa que el horario de esta materia/salón esté configurado (día de la semana), o que ya se haya tomado asistencia manualmente para alguna fecha de este rango.</p>`;
        }

        const selector = bloqueSelectorColumnas("asistencia", asistenciaFechas.map((f) => ({ clave: f, etiqueta: f })));
        const fechasVisibles = asistenciaFechas.filter((f) => !columnasOcultas.asistencia.has(f));
        const nota = soloLectura
            ? `<p class="small text-muted mb-2">Viene directo de tu pantalla de Asistencia. Los días sin registro individual se cuentan como "Presente" por defecto.</p>`
            : `<p class="small text-muted mb-2">Viene directo de tu pantalla de Asistencia — <strong>haz clic en una casilla para corregirla</strong> (queda guardado también en Asistencia y en la cuadrícula del trimestre, es la misma asistencia real). Los días sin registro individual se muestran como "Presente" atenuado, hasta que los toques. Desmarca una fecha arriba para <strong>excluirla del promedio</strong> de esta Apreciación (por ejemplo, una asistencia mal tomada) sin borrar nada.</p>`;

        if (fechasVisibles.length === 0) {
            return `${nota}${selector}<p class="text-muted small">Excluiste todas las fechas. Marca "Ver todas" arriba para volver a contarlas.</p>`;
        }

        const encabezado = fechasVisibles.map((f) => `<th class="text-center small" style="min-width:90px;">${escapeHtml(f)}</th>`).join("");
        const filas = estudiantes.map((est) => {
            const celdas = fechasVisibles.map((f) => {
                const guardado = asistenciaPorFecha[f]?.[est.id];
                const est_ = guardado || ESTADO_ASISTENCIA_DEFECTO;
                const sinRegistrar = !guardado;
                const badge = { presente: "success", tardanza: "warning", ausente: "danger", permiso: "secondary", fuga: "dark" }[est_] || "secondary";
                const asistenciaId = estado_.asistenciaIdPorFecha?.[f];
                const titulo = sinRegistrar
                    ? "Sin registrar (mostrando Presente por defecto) — clic para corregir"
                    : "Clic para cambiar el estado";
                if (soloLectura) {
                    return `<td class="text-center"><span class="badge bg-${badge} ${sinRegistrar ? "opacity-50" : ""}">${escapeHtml(ETIQUETAS_ASISTENCIA_APR[est_] || est_)}</span></td>`;
                }
                return `<td class="text-center">
                    <button type="button" class="btn btn-sm badge bg-${badge} btn-asistencia-apr ${sinRegistrar ? "opacity-50" : ""}"
                        data-fecha="${f}" data-estudiante-id="${est.id}" data-estado="${est_}" data-asistencia-id="${asistenciaId || ""}"
                        title="${titulo}" style="border:none;">${escapeHtml(ETIQUETAS_ASISTENCIA_APR[est_] || est_)}</button>
                </td>`;
            }).join("");
            const notaSeccion = calcularNotasParcialesEstudiante(estado_, est.id).notaAsistencia;
            return `<tr><td class="small">${escapeHtml(est.nombre)}</td>${celdas}<td class="text-center fw-bold">${formatearPromedioSeccion(notaSeccion)}</td></tr>`;
        }).join("");

        return `
            ${nota}
            ${selector}
            <table class="table table-sm table-bordered align-middle mb-2">
                <thead><tr><th class="small">Estudiante</th>${encabezado}<th class="text-center small">Prom.</th></tr></thead>
                <tbody>${filas}</tbody>
            </table>`;
    };

    // --- 2) Comportamiento: una columna por fecha, con botones 😀/😕
    // en vez de un select (más rápido de tocar). ---
    const bloqueComportamiento = () => {
        // Columnas a mostrar: las que el docente agregó a mano + los
        // días reales de clase (asistencia), sin repetir, en orden.
        const fechasTotales = [...new Set([...comportamientoFechas, ...asistenciaFechas])].sort();
        const selector = bloqueSelectorColumnas("comportamiento", fechasTotales.map((f) => ({ clave: f, etiqueta: f })));
        const fechasAMostrar = fechasTotales.filter((f) => !columnasOcultas.comportamiento.has(f));

        const encabezadoFechas = fechasAMostrar.map((f) => {
            const esDiaDeClase = asistenciaFechas.includes(f);
            return `
            <th class="text-center small" style="min-width:110px;">
                ${escapeHtml(f)}
                ${esDiaDeClase ? `<div class="text-muted" style="font-weight:normal; font-size:10px;">Día de clase</div>` : ""}
                ${soloLectura ? "" : `<button type="button" class="btn btn-link btn-sm p-0 text-danger btn-eliminar-fecha-comportamiento" data-fecha="${f}" title="Eliminar esta fecha">🗑️</button>`}
            </th>`;
        }).join("");

        const columnaAgregar = soloLectura ? "" : `
            <th class="text-center" style="min-width:150px;">
                <input type="date" class="form-control form-control-sm d-inline-block" id="inputNuevaFechaComportamiento"
                    value="${fechaInicio || new Date().toISOString().slice(0, 10)}" style="width:130px;">
                <button type="button" class="btn btn-link btn-sm p-0 text-success" id="btnAgregarFechaComportamiento" title="Agregar esta fecha como columna">➕</button>
            </th>`;

        const filas = estudiantes.map((est) => {
            const celdas = fechasAMostrar.map((f) => {
                // Si es un día de clase y no se ha tocado nada todavía,
                // se asume 5 (buen comportamiento) por defecto.
                const valor = valorComportamientoEfectivo(estado_, f, est.id);
                if (soloLectura) return `<td class="text-center">${valor === 5 ? "😀" : valor === 1 ? "😕" : "–"}</td>`;
                return `<td class="text-center">
                    <div class="btn-group btn-group-sm" role="group">
                        <button type="button" class="btn ${valor === 5 ? "btn-success" : "btn-outline-success"} btn-comportamiento" data-fecha="${f}" data-estudiante-id="${est.id}" data-valor="5" title="Buen comportamiento">😀</button>
                        <button type="button" class="btn ${valor === 1 ? "btn-danger" : "btn-outline-danger"} btn-comportamiento" data-fecha="${f}" data-estudiante-id="${est.id}" data-valor="1" title="Mal comportamiento">😕</button>
                    </div>
                </td>`;
            }).join("");
            const notaSeccion = calcularNotasParcialesEstudiante(estado_, est.id).notaComportamiento;
            return `<tr><td class="small">${escapeHtml(est.nombre)}</td>${celdas}${soloLectura ? "" : "<td></td>"}<td class="text-center fw-bold">${formatearPromedioSeccion(notaSeccion)}</td></tr>`;
        }).join("");

        return `
            ${selector}
            <table class="table table-sm table-bordered align-middle mb-2">
                <thead><tr><th class="small">Estudiante</th>${encabezadoFechas}${columnaAgregar}<th class="text-center small">Prom.</th></tr></thead>
                <tbody>${filas || `<tr><td colspan="99" class="text-muted small">Todavía no hay fechas de comportamiento. Define el rango de Asistencia arriba, o agrega una fecha a mano.</td></tr>`}</tbody>
            </table>
            <p class="small text-muted mb-2">Los días marcados "Día de clase" empiezan en 😀 (bueno) por defecto — solo toca 😕 en quien se portó mal ese día.</p>`;
    };

    // --- 3/4) Actividades: una columna por actividad, nombre editable
    // en el encabezado y "➕" al final para agregar otra. Las
    // actividades "de clase" llevan fecha automática (se puede repetir
    // el mismo día varias veces) y su casilla se bloquea si ese día el
    // estudiante estuvo Ausente/Fuga/Permiso. ---
    const bloqueActividades = (lista, tipoActividad) => {
        const selector = bloqueSelectorColumnas(tipoActividad, lista.map((a) => ({ clave: a.id, etiqueta: a.nombre })));
        const listaVisible = lista.filter((a) => !columnasOcultas[tipoActividad].has(a.id));

        const encabezado = listaVisible.map((a) => `
            <th style="min-width:120px;">
                ${soloLectura
                    ? `<div class="text-center small fw-bold">${escapeHtml(a.nombre)}</div>`
                    : `<input type="text" class="form-control form-control-sm input-nombre-actividad text-center fw-bold"
                        data-actividad-id="${a.id}" value="${escapeHtml(a.nombre)}" style="font-size:12px;">`}
                ${a.fecha ? `<div class="text-muted text-center" style="font-weight:normal; font-size:10px;">${escapeHtml(a.fecha)}</div>` : ""}
                ${soloLectura ? "" : `<button type="button" class="btn btn-link btn-sm p-0 text-danger btn-eliminar-actividad" data-actividad-id="${a.id}" title="Eliminar esta actividad">🗑️</button>`}
            </th>`).join("");

        const columnaAgregar = soloLectura ? "" : `
            <th class="text-center" style="width:44px;">
                <button type="button" class="btn btn-link btn-sm p-0 text-success btn-agregar-actividad" data-tipo="${tipoActividad}" title="Agregar otra actividad">➕</button>
            </th>`;

        const filas = estudiantes.map((est) => {
            const celdas = listaVisible.map((a) => {
                if (actividadBloqueadaParaEstudiante(a, est.id, asistenciaPorFecha)) {
                    return `<td class="text-center text-muted bg-light" title="Este día el estudiante estuvo Ausente o con Permiso: no aplica nota.">—</td>`;
                }
                if (actividadForzadaFugaParaEstudiante(a, est.id, asistenciaPorFecha)) {
                    return `<td class="text-center fw-bold text-danger bg-light" title="Este día el estudiante estuvo en Fuga: nota automática 1.0.">1.0</td>`;
                }
                const crudo = a.notas[est.id];
                const valor = (crudo === null || crudo === undefined) ? "" : formatearNotaFinal(String(crudo));
                if (soloLectura) return `<td class="text-center">${valor === "" ? "–" : valor}</td>`;
                return `<td>
                    <input type="text" inputmode="decimal" class="form-control form-control-sm input-nota-actividad"
                        data-actividad-id="${a.id}" data-estudiante-id="${est.id}" value="${valor}" style="width:60px; margin:auto;">
                </td>`;
            }).join("");
            const partes = calcularNotasParcialesEstudiante(estado_, est.id);
            const notaSeccion = tipoActividad === "clase" ? partes.notaActClase : partes.notaActCasa;
            return `<tr><td class="small">${escapeHtml(est.nombre)}</td>${celdas}${soloLectura ? "" : "<td></td>"}<td class="text-center fw-bold" id="aprPromActividad-${tipoActividad}-${est.id}">${formatearPromedioSeccion(notaSeccion)}</td></tr>`;
        }).join("");

        const mensajeVacio = lista.length === 0
            ? "Todavía no hay actividades. Usa el ➕ de arriba para agregar la primera."
            : "Ocultaste todas las actividades. Marca \"Ver todas\" arriba para volver a verlas.";

        return `
            ${selector}
            <table class="table table-sm table-bordered align-middle mb-3">
                <thead><tr><th class="small">Estudiante</th>${encabezado}${columnaAgregar}<th class="text-center small">Prom.</th></tr></thead>
                <tbody>${filas && listaVisible.length ? filas : `<tr><td colspan="99" class="text-muted small">${mensajeVacio}</td></tr>`}</tbody>
            </table>`;
    };

    // --- Pestañas: cada sección vive en su propio panel, y solo se
    // muestra la que esté activa (estado_.tabApreciacionActiva). Así el
    // docente ve una cosa a la vez en vez de tener que hacer scroll por
    // las 5 secciones apiladas. ---
    const tabsInfo = [
        { clave: "asistencia", icono: "📋", etiqueta: "Asistencia" },
        { clave: "comportamiento", icono: "🙂", etiqueta: "Comportamiento" },
        { clave: "clase", icono: "✏️", etiqueta: "Act. en clase" },
        { clave: "casa", icono: "🏠", etiqueta: "Act. en casa" },
        { clave: "final", icono: "🏁", etiqueta: "Nota final" },
    ];
    if (!tabsInfo.some((t) => t.clave === estado_.tabApreciacionActiva)) {
        estado_.tabApreciacionActiva = "asistencia";
    }
    const tabActiva = estado_.tabApreciacionActiva;

    const botonesTabs = tabsInfo.map((t) => `
        <button type="button" class="apr-tab-btn ${t.clave === tabActiva ? "activo" : ""}" data-tab-btn="${t.clave}">
            <span class="apr-tab-icono">${t.icono}</span>${t.etiqueta}
        </button>`).join("");

    const panel = (clave, tituloInterno, contenidoHtml, claseExtra = "") => `
        <div class="apr-tab-pane ${clave === tabActiva ? "activo" : ""}" data-tab-pane="${clave}">
            <div class="apr-panel-seccion ${claseExtra}">
                ${tituloInterno ? `<h6 class="fw-bold" style="color:var(--color-primario, #4f46e5);">${tituloInterno}</h6>` : ""}
                ${contenidoHtml}
            </div>
        </div>`;

    // --- Fórmula de esta Apreciación (asistencia, comportamiento,
    // actividades): antes vivía fuera del modal, arriba de "Registrar
    // notas". Ahora vive aquí porque es lo que regula cómo sale la
    // nota final de esta apreciación. Sigue siendo una sola
    // configuración global (aplica a todas las Apreciaciones 4+, en
    // todas las materias y salones), solo cambió dónde se edita. ---
    const bloqueFormulaPesos = () => {
        if (soloLectura) {
            return `
                <p class="small text-muted mb-0">
                    Fórmula usada: Asistencia ${pesos.peso_asistencia}% · Comportamiento ${pesos.peso_comportamiento}% ·
                    Act. en clase ${pesos.peso_actividades_clase}% · Act. en casa ${pesos.peso_actividades_casa}%
                </p>`;
        }
        return `
            <details id="detallePesosModal">
                <summary style="font-weight:bold; color:var(--color-primario, #4f46e5); cursor:pointer; font-size:.9rem;">
                    ⚙️ Fórmula de esta Apreciación (asistencia, comportamiento, actividades)
                </summary>
                <p class="small text-muted" style="margin:8px 0;">
                    Estos 4 porcentajes deben sumar 100% y aplican para todas las Apreciaciones 4 en adelante, en todas las materias y salones.
                </p>
                <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:end;">
                    <div>
                        <label class="small text-muted d-block">Asistencia %</label>
                        <input type="number" min="0" max="100" class="form-control form-control-sm input-peso-modal" id="pesoAsistenciaModal" value="${pesos.peso_asistencia}" style="width:90px;">
                    </div>
                    <div>
                        <label class="small text-muted d-block">Comportamiento %</label>
                        <input type="number" min="0" max="100" class="form-control form-control-sm input-peso-modal" id="pesoComportamientoModal" value="${pesos.peso_comportamiento}" style="width:90px;">
                    </div>
                    <div>
                        <label class="small text-muted d-block">Act. en clase %</label>
                        <input type="number" min="0" max="100" class="form-control form-control-sm input-peso-modal" id="pesoActClaseModal" value="${pesos.peso_actividades_clase}" style="width:90px;">
                    </div>
                    <div>
                        <label class="small text-muted d-block">Act. en casa %</label>
                        <input type="number" min="0" max="100" class="form-control form-control-sm input-peso-modal" id="pesoActCasaModal" value="${pesos.peso_actividades_casa}" style="width:90px;">
                    </div>
                    <button type="button" class="btn btn-sm btn-primary" id="btnGuardarPesosModal">Guardar porcentajes</button>
                    <span class="small" id="sumaPesosIndicadorModal"></span>
                </div>
            </details>`;
    };

    el.cuerpo.innerHTML = `
        <div class="apr-cabecera">
            <div class="apr-cabecera-fila">
                <div>
                    <h6 class="fw-bold mb-1" style="color:var(--color-primario, #4f46e5);">🗓️ Rango de fechas de esta Apreciación</h6>
                    ${bloqueRango()}
                </div>
                <div class="d-flex flex-column gap-2 align-items-end">
                    <button type="button" class="btn btn-sm btn-outline-primary" id="btnImprimirApreciacion">🖨️ Imprimir / PDF</button>
                    ${soloLectura ? "" : `<button type="button" class="btn btn-sm btn-outline-secondary" id="btnVolverModoDirecto">↩️ Usar casilla directa</button>`}
                </div>
            </div>
            <div class="mt-2">${bloqueFormulaPesos()}</div>
        </div>

        <div class="apr-tabs">${botonesTabs}</div>

        ${panel("asistencia", "📋 Asistencia", bloqueAsistencia())}
        ${panel("comportamiento", `🙂 Comportamiento <span class="small text-muted fw-normal">(agrega una columna por cada día)</span>`, bloqueComportamiento())}
        ${panel("clase", "✏️ Actividades en clase", bloqueActividades(actividadesClase, "clase"))}
        ${panel("casa", "🏠 Actividades para la casa", bloqueActividades(actividadesCasa, "casa"))}
        ${panel("final", `🏁 Nota final de Apreciación ${numeroApreciacion}`, `
            <table class="table table-sm table-bordered mb-0">
                <thead><tr><th class="small">Estudiante</th><th class="small text-center">Nota final</th></tr></thead>
                <tbody>${estudiantes.map((est) => `<tr><td class="small">${escapeHtml(est.nombre)}</td><td class="text-center fw-bold" id="aprNotaFinal-${est.id}">–</td></tr>`).join("")}</tbody>
            </table>`, "apr-nota-final-panel")}
    `;

    document.getElementById("btnImprimirApreciacion")?.addEventListener("click", () => {
        imprimirApreciacion(estado_);
    });

    if (!soloLectura) {
        const idsPesoModal = {
            asistencia: "pesoAsistenciaModal",
            comportamiento: "pesoComportamientoModal",
            actClase: "pesoActClaseModal",
            actCasa: "pesoActCasaModal",
        };
        const actualizarSumaPesosModal = () => {
            const suma = Object.values(idsPesoModal).reduce(
                (acc, id) => acc + (parseFloat(document.getElementById(id)?.value) || 0), 0
            );
            const indicador = document.getElementById("sumaPesosIndicadorModal");
            if (!indicador) return;
            indicador.textContent = `Suma actual: ${suma}%`;
            indicador.className = "small " + (suma === 100 ? "text-success" : "text-danger");
        };
        el.cuerpo.querySelectorAll(".input-peso-modal").forEach((input) => {
            input.addEventListener("input", actualizarSumaPesosModal);
        });
        actualizarSumaPesosModal();

        document.getElementById("btnGuardarPesosModal")?.addEventListener("click", async () => {
            const nuevosPesos = {
                peso_asistencia: parseFloat(document.getElementById(idsPesoModal.asistencia).value) || 0,
                peso_comportamiento: parseFloat(document.getElementById(idsPesoModal.comportamiento).value) || 0,
                peso_actividades_clase: parseFloat(document.getElementById(idsPesoModal.actClase).value) || 0,
                peso_actividades_casa: parseFloat(document.getElementById(idsPesoModal.actCasa).value) || 0,
            };
            const resultado = await guardarConfigPesos(nuevosPesos);
            if (!resultado.ok) { alert("❌ " + resultado.error.message); return; }

            // Se guardan en el estado en memoria y se vuelve a dibujar el
            // modal para que la pestaña "Nota final" recalcule ya mismo
            // con los porcentajes nuevos, sin tener que cerrar y reabrir.
            estado_.pesos = nuevosPesos;
            pintarModal(estado_);
            calcularYPintarNotasFinales(estado_);
            alert("✅ Porcentajes guardados. Se van a usar de aquí en adelante para todas las Apreciaciones 4+.");
        });
    }

    el.cuerpo.querySelectorAll(".apr-tab-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            estado_.tabApreciacionActiva = btn.dataset.tabBtn;
            el.cuerpo.querySelectorAll(".apr-tab-btn").forEach((b) => b.classList.toggle("activo", b === btn));
            el.cuerpo.querySelectorAll(".apr-tab-pane").forEach((p) => p.classList.toggle("activo", p.dataset.tabPane === btn.dataset.tabBtn));
        });
    });

    if (soloLectura) return;

    // --- Listeners: selector de columnas (Asistencia / Comportamiento /
    // Actividades en clase / Actividades para la casa) ---
    // Para "asistencia", además de actualizar la vista hay que guardar
    // en la base de datos qué fechas quedaron excluidas, para que el
    // cálculo del promedio las respete de verdad y no se pierda al
    // recargar la página.
    function sincronizarExclusionAsistencia() {
        estado_.fechasAsistenciaExcluidas = new Set(columnasOcultas.asistencia);
        guardarFechasAsistenciaExcluidas(
            estado_.materia, estado_.trimestre, estado_.numeroApreciacion,
            [...estado_.fechasAsistenciaExcluidas]
        );
    }

    el.cuerpo.querySelectorAll(".check-columna-apreciacion").forEach((chk) => {
        chk.addEventListener("change", () => {
            const seccion = chk.dataset.seccion;
            const clave = chk.dataset.clave;
            if (chk.checked) columnasOcultas[seccion].delete(clave);
            else columnasOcultas[seccion].add(clave);
            if (seccion === "asistencia") sincronizarExclusionAsistencia();
            pintarModal(estado_);
            calcularYPintarNotasFinales(estado_);
        });
    });

    el.cuerpo.querySelectorAll(".btn-columnas-todas").forEach((btn) => {
        btn.addEventListener("click", () => {
            const seccion = btn.dataset.seccion;
            columnasOcultas[seccion].clear();
            if (seccion === "asistencia") sincronizarExclusionAsistencia();
            pintarModal(estado_);
            calcularYPintarNotasFinales(estado_);
        });
    });

    el.cuerpo.querySelectorAll(".btn-columnas-ninguna").forEach((btn) => {
        btn.addEventListener("click", () => {
            const seccion = btn.dataset.seccion;
            const items = { asistencia: asistenciaFechas, comportamiento: [...new Set([...comportamientoFechas, ...asistenciaFechas])], clase: actividadesClase, casa: actividadesCasa }[seccion];
            const claves = seccion === "clase" || seccion === "casa" ? items.map((a) => a.id) : items;
            claves.forEach((c) => columnasOcultas[seccion].add(c));
            if (seccion === "asistencia") sincronizarExclusionAsistencia();
            pintarModal(estado_);
            calcularYPintarNotasFinales(estado_);
        });
    });

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

        const asistenciaTabla = await obtenerAsistenciaPorRango(estado_.materia, estado_.salon, inicio, fin, estado_.correoProfesor);
        estado_.asistenciaFechas = [...asistenciaTabla.fechas];
        estado_.asistenciaPorFecha = { ...asistenciaTabla.porFecha };
        estado_.asistenciaIdPorFecha = { ...asistenciaTabla.idPorFecha };

        pintarModal(estado_);
        calcularYPintarNotasFinales(estado_);
    });

    // --- Listeners: Asistencia (corrección directa desde la Apreciación) ---
    // Al hacer clic se avanza al siguiente estado del ciclo (igual que en
    // la pantalla de Asistencia) y se guarda de una vez en la base de
    // datos — misma tabla que usa Asistencia y la cuadrícula del
    // trimestre, así que ambos lados quedan sincronizados. Si ese día
    // todavía no existe como clase en Asistencia (nunca se pasó lista),
    // se crea aquí mismo al primer clic.
    el.cuerpo.querySelectorAll(".btn-asistencia-apr").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const fecha = btn.dataset.fecha;
            const estudianteId = btn.dataset.estudianteId;
            const asistenciaId = btn.dataset.asistenciaId || estado_.asistenciaIdPorFecha?.[fecha] || null;

            const actual = btn.dataset.estado;
            const indice = CICLO_ASISTENCIA_APR.indexOf(actual);
            const nuevoEstado = CICLO_ASISTENCIA_APR[(indice + 1) % CICLO_ASISTENCIA_APR.length];

            btn.disabled = true;
            const resultado = await guardarCorreccionAsistenciaConCabecera({
                asistenciaId, materia: estado_.materia, salon: estado_.salon, fecha,
                correoProfesor: estado_.correoProfesor, estudianteId, estado: nuevoEstado,
            });
            btn.disabled = false;
            if (!resultado.ok) { alert("No se pudo guardar la corrección. Revisa tu conexión e intenta de nuevo."); return; }

            estado_.asistenciaIdPorFecha[fecha] = resultado.asistenciaId;
            (estado_.asistenciaPorFecha[fecha] ??= {})[estudianteId] = nuevoEstado;
            pintarModal(estado_);
            calcularYPintarNotasFinales(estado_);
        });
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

            // Repintar el promedio de ESTA sección (clase/casa) para este
            // estudiante sin repintar todo el modal, para no perder el
            // foco de la casilla mientras se sigue escribiendo.
            const tipoActividad = listaClase ? "clase" : "casa";
            const partes = calcularNotasParcialesEstudiante(estado_, estudianteId);
            const notaSeccion = tipoActividad === "clase" ? partes.notaActClase : partes.notaActCasa;
            const celdaProm = document.getElementById(`aprPromActividad-${tipoActividad}-${estudianteId}`);
            if (celdaProm) celdaProm.textContent = formatearPromedioSeccion(notaSeccion);

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
            // Las actividades "de clase" llevan la fecha de hoy puesta
            // automáticamente (se pueden crear varias el mismo día);
            // las "para la casa" no usan fecha.
            const fecha = tipoActividad === "clase" ? obtenerFechaHoyISOApreciacion() : null;
            const nueva = await crearActividad(estado_.materia, estado_.trimestre, estado_.numeroApreciacion, tipoActividad, nombre, lista.length, fecha);
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
