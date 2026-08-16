// =========================================================
// LEYENDA EXPLICATIVA POR SALÓN + MATERIA
// =========================================================
// Texto libre que el/la docente escribe para explicar qué es cada
// número de nota (ej. "Nota 1 es de la clase 1..."). Se guarda una
// vez por CADA COMBINACIÓN de salón y materia (aplica a todos los
// trimestres de esa materia en ese salón, pero es independiente de
// los demás salones) y se muestra automáticamente en la pantalla de
// Consulta de notas del estudiante, debajo de la tabla de esa materia.

import { supabase } from "./supabase.js";

// Devuelve el texto guardado para ese salón+materia, o "" si nunca
// se guardó nada (para no romper el textarea con null/undefined).
export async function obtenerLeyendaMateria(salon, materia) {
    if (!salon || !materia) return "";
    const { data, error } = await supabase
        .from("leyendas_materia")
        .select("texto")
        .eq("salon", salon)
        .eq("materia", materia)
        .maybeSingle();

    if (error) {
        console.error("No se pudo leer la leyenda de la materia:", error);
        return "";
    }
    return data?.texto || "";
}

// Guarda (o borra, si texto queda vacío) la leyenda de un salón+materia.
// upsert por ("salon", "materia") (clave única de la tabla), así que
// sirve tanto para crearla la primera vez como para editarla después.
export async function guardarLeyendaMateria(salon, materia, texto) {
    const limpio = (texto || "").trim();

    if (!limpio) {
        const { error } = await supabase.from("leyendas_materia").delete().eq("salon", salon).eq("materia", materia);
        if (error) { console.error("No se pudo borrar la leyenda:", error); return { ok: false, error }; }
        return { ok: true };
    }

    const { error } = await supabase.from("leyendas_materia").upsert(
        { salon, materia, texto: limpio, updated_at: new Date().toISOString() },
        { onConflict: "salon,materia" }
    );
    if (error) { console.error("No se pudo guardar la leyenda:", error); return { ok: false, error }; }
    return { ok: true };
}

// Trae TODAS las leyendas guardadas de una vez, como
// { "salon|materia": texto }, pensado para la pantalla de Consulta
// (que muestra varias materias juntas y no quiere hacer una consulta
// por cada una).
export async function obtenerTodasLasLeyendas() {
    const { data, error } = await supabase.from("leyendas_materia").select("salon, materia, texto");
    if (error) { console.error("No se pudo leer las leyendas:", error); return {}; }
    const mapa = {};
    (data || []).forEach((fila) => { mapa[`${fila.salon}|${fila.materia}`] = fila.texto; });
    return mapa;
}
