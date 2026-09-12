// =========================================================
// DETALLE DE APRECIACIONES DE CIENCIAS NATURALES (vista del estudiante)
// =========================================================
// Este módulo es de SOLO LECTURA: nunca inserta, actualiza ni borra
// nada. Arma, para un estudiante puntual, el mismo desglose que ve el
// docente en el modal de "Apreciación N" (asistencia, comportamiento,
// actividades en clase, actividades en casa y nota final), reusando
// las funciones de lectura ya existentes en apreciaciones.js para no
// duplicar la lógica de cálculo.
//
// Para Ciencias Naturales, cada "Apreciación N" corresponde
// exactamente a la "Clase N" del portal de clase (Apreciación 1 =
// Clase 1, etc.) — no es una semana suelta.

import { supabase } from "./supabase.js";
import {
    obtenerEstadoApreciaciones,
    obtenerRangoFechas,
    obtenerAsistenciaPorRango,
    obtenerComportamientoTabla,
    obtenerActividades,
    obtenerConfigPesos,
    VALOR_ASISTENCIA_DEFECTO,
    ESTADO_ASISTENCIA_DEFECTO,
    VALOR_COMPORTAMIENTO_BUENO,
    VALOR_COMPORTAMIENTO_MALO,
} from "./apreciaciones.js";

const NOMBRES_CLASE_CIENCIAS = {
    1: "Clase 1 · El origen del universo y del sistema solar",
    2: "Clase 2 · La vida en la Tierra y la exploración del universo",
    3: "Clase 3 · El movimiento ondulatorio",
    4: "Clase 4",
};

function promedio(valores) {
    const nums = valores.filter((v) => v !== null && v !== undefined && !isNaN(v));
    if (nums.length === 0) return null;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// El correo del profesor hace falta para saber qué días de la semana
// son "días de clase" de esta materia/salón (viene del horario). Se
// toma el primer profesor asignado a esta materia+salón — en la
// inmensa mayoría de los casos hay uno solo.
async function obtenerCorreoProfesor(materia, salon) {
    const { data, error } = await supabase
        .from("profesor_materias")
        .select("correo_profesor")
        .eq("materia", materia)
        .eq("salon", salon)
        .limit(1)
        .maybeSingle();
    if (error) { console.error("No se pudo hallar el/la docente de esta materia/salón:", error); return null; }
    return data?.correo_profesor || null;
}

/**
 * Devuelve el detalle de cada Apreciación (= Clase) de Ciencias
 * Naturales para un estudiante, en el trimestre indicado. Solo
 * incluye Apreciaciones que ya existen (tienen fila en
 * apreciaciones_estado) — nunca inventa clases que no han empezado.
 *
 * @param {{id:string, correo:string|null}} estudiante
 * @param {string} salon
 * @param {string} trimestre
 */
export async function obtenerDetalleApreciacionesCiencias(estudiante, salon, trimestre) {
    const materia = "Ciencias Naturales";

    const [estadoApreciaciones, correoProfesor, pesos] = await Promise.all([
        obtenerEstadoApreciaciones(materia, salon, trimestre),
        obtenerCorreoProfesor(materia, salon),
        obtenerConfigPesos(materia, salon, trimestre),
    ]);

    if (!estadoApreciaciones || estadoApreciaciones.length === 0) return [];

    // Notas finales YA guardadas para este estudiante (tabla "notas",
    // tipo="apreciacion") — es el mismo valor que ya se le muestra en
    // su tabla de notas de siempre; aquí solo se reutiliza para no
    // tener que recalcularlo con una fórmula aparte.
    const filtroId = estudiante.id ? { estudiante_id: estudiante.id } : { correo: estudiante.correo };
    const { data: notasFinales, error: errNotas } = await supabase
        .from("notas")
        .select("numero, nota")
        .eq("materia", materia).eq("trimestre", trimestre).eq("tipo", "apreciacion")
        .match(filtroId)
        .is("eliminado_en", null);
    if (errNotas) console.error("No se pudieron leer las notas finales de Ciencias:", errNotas);
    const notaFinalPorNumero = {};
    (notasFinales || []).forEach((n) => { notaFinalPorNumero[n.numero] = n.nota; });

    const resultado = [];

    for (const { numero: numeroApreciacion } of estadoApreciaciones) {
        const rango = await obtenerRangoFechas(materia, salon, trimestre, numeroApreciacion);

        const [asistenciaTabla, comportamientoTabla, actividadesClase, actividadesCasa] = await Promise.all([
            obtenerAsistenciaPorRango(materia, salon, rango.fecha_inicio, rango.fecha_fin, correoProfesor),
            obtenerComportamientoTabla(materia, trimestre, numeroApreciacion),
            obtenerActividades(materia, salon, trimestre, numeroApreciacion, "clase"),
            obtenerActividades(materia, salon, trimestre, numeroApreciacion, "casa"),
        ]);

        const excluidas = new Set(rango.fechas_asistencia_excluidas || []);
        const fechasAsistenciaValidas = asistenciaTabla.fechas.filter((f) => !excluidas.has(f));

        // --- Asistencia: cuenta cuántos días de cada estado tuvo ESTE
        // estudiante, y el promedio 1–5 igual que en el panel del docente. ---
        const estadosPorDia = fechasAsistenciaValidas.map(
            (f) => asistenciaTabla.porFecha[f]?.[estudiante.id] || ESTADO_ASISTENCIA_DEFECTO
        );
        const conteoAsistencia = { presente: 0, tardanza: 0, ausente: 0, permiso: 0, fuga: 0 };
        estadosPorDia.forEach((e) => { if (conteoAsistencia[e] !== undefined) conteoAsistencia[e]++; });
        const notaAsistencia = promedio(estadosPorDia.map((e) => VALOR_ASISTENCIA_DEFECTO[e]));

        // --- Comportamiento: días de clase + los que el docente haya
        // agregado a mano, 5 (bueno) por defecto si no se tocó nada. ---
        const fechasComportamiento = [...new Set([...comportamientoTabla.fechas, ...fechasAsistenciaValidas])];
        const valoresComportamiento = fechasComportamiento.map((f) => {
            const guardado = comportamientoTabla.porFecha[f]?.[estudiante.id];
            if (guardado !== undefined) return guardado;
            return fechasAsistenciaValidas.includes(f) ? VALOR_COMPORTAMIENTO_BUENO : undefined;
        }).filter((v) => v !== undefined);
        const buenComportamiento = valoresComportamiento.filter((v) => v === VALOR_COMPORTAMIENTO_BUENO).length;
        const malComportamiento = valoresComportamiento.filter((v) => v === VALOR_COMPORTAMIENTO_MALO).length;
        const notaComportamiento = promedio(valoresComportamiento);

        // --- Actividades en clase: promedio simple de lo que tenga
        // registrado este estudiante. ---
        const notasActClase = actividadesClase.map((a) => a.notas[estudiante.id]).filter((v) => v !== null && v !== undefined);
        const notaActClase = promedio(notasActClase);

        // --- Actividades en casa: para Ciencias Naturales esto trae
        // directo los 3 ejercicios de práctica (Opción múltiple, Pareo
        // de términos, Pareo de fotos) con la nota de cada uno. ---
        const detalleActCasa = actividadesCasa.map((a) => ({
            nombre: a.nombre,
            nota: (a.notas[estudiante.id] === null || a.notas[estudiante.id] === undefined) ? null : Number(a.notas[estudiante.id]),
        }));
        const notaActCasa = promedio(detalleActCasa.map((a) => a.nota).filter((v) => v !== null));

        resultado.push({
            numero: numeroApreciacion,
            claseNombre: NOMBRES_CLASE_CIENCIAS[numeroApreciacion] || `Apreciación ${numeroApreciacion}`,
            estado: estadoApreciaciones.find((e) => e.numero === numeroApreciacion)?.estado || "activa",
            fechaInicio: rango.fecha_inicio,
            fechaFin: rango.fecha_fin,
            asistencia: {
                clasesDadas: fechasAsistenciaValidas.length,
                presentes: conteoAsistencia.presente,
                ausencias: conteoAsistencia.ausente + conteoAsistencia.fuga,
                tardanzas: conteoAsistencia.tardanza,
                permisos: conteoAsistencia.permiso,
                promedio: notaAsistencia,
            },
            comportamiento: {
                dias: valoresComportamiento.length,
                buenos: buenComportamiento,
                malos: malComportamiento,
                promedio: notaComportamiento,
            },
            actClase: { promedio: notaActClase, cantidad: notasActClase.length },
            actCasa: { promedio: notaActCasa, detalle: detalleActCasa },
            notaFinal: notaFinalPorNumero[numeroApreciacion] ?? null,
            pesos,
        });
    }

    return resultado.sort((a, b) => a.numero - b.numero);
}
