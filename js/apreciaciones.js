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
        .select("numero, estado")
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
        estados = [...estados, { numero: maximo + 1, estado: "bloqueada" }];
    }
    return estados; // [{numero, estado}, ...] ordenado
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

async function obtenerClaseDeAsistencia(materia, salon, numeroApreciacion) {
    const { data: sesiones, error } = await supabase
        .from("asistencias")
        .select("id, fecha")
        .eq("materia", materia)
        .eq("salon", salon)
        .order("fecha", { ascending: true });

    if (error) { console.error(error); return null; }
    if (!sesiones || sesiones.length < numeroApreciacion) return null; // esa clase aún no se ha dado

    const sesion = sesiones[numeroApreciacion - 1]; // Aprec. 4 = clase #4 = índice 3
    const { data: detalle, error: errDet } = await supabase
        .from("asistencia_detalle")
        .select("estudiante_id, estado")
        .eq("asistencia_id", sesion.id);

    if (errDet) { console.error(errDet); return null; }

    return { fecha: sesion.fecha, porEstudiante: Object.fromEntries((detalle || []).map((d) => [d.estudiante_id, d.estado])) };
}

// =========================================================
// 4) COMPORTAMIENTO
// =========================================================

async function obtenerComportamiento(materia, trimestre, numeroApreciacion) {
    const { data, error } = await supabase
        .from("comportamiento_detalle")
        .select("estudiante_id, valor")
        .eq("materia", materia).eq("trimestre", trimestre).eq("numero_apreciacion", numeroApreciacion);

    if (error) { console.error(error); return {}; }
    const porEstudiante = {};
    (data || []).forEach((f) => { porEstudiante[f.estudiante_id] = f.valor; });
    return porEstudiante;
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

export async function abrirDetalleApreciacion({ materia, salon, trimestre, numeroApreciacion, estado, estudiantes, correoProfesor }) {
    const el = obtenerElementosModal();
    if (!el.modalEl) { alert("Falta el HTML del modal de Apreciación en la página."); return; }

    if (estado === "bloqueada") {
        alert(`La Apreciación ${numeroApreciacion} todavía está bloqueada. Primero hay que completar la anterior.`);
        return;
    }

    el.titulo.textContent = `Apreciación ${numeroApreciacion} — Clase ${numeroApreciacion}`;
    el.cuerpo.innerHTML = `<div class="text-center py-4"><span class="spinner-border"></span> Cargando...</div>`;
    const modalBootstrap = new bootstrap.Modal(el.modalEl);
    modalBootstrap.show();

    const soloLectura = estado === "completada";

    const [pesos, asistenciaClase, comportamiento, actividadesClase, actividadesCasa] = await Promise.all([
        obtenerConfigPesos(),
        obtenerClaseDeAsistencia(materia, salon, numeroApreciacion),
        obtenerComportamiento(materia, trimestre, numeroApreciacion),
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
        asistenciaClase, comportamiento: { ...comportamiento }, actividadesClase, actividadesCasa,
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
    const { asistenciaClase, comportamiento, actividadesClase, actividadesCasa, valoresAsistencia, pesos } = estado_;

    const notaAsistencia = asistenciaClase
        ? (valoresAsistencia[asistenciaClase.porEstudiante[estudianteId]] ?? null)
        : null;

    const notaComportamiento = comportamiento[estudianteId] ?? null;

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
    const { estudiantes, asistenciaClase, comportamiento, actividadesClase, actividadesCasa, soloLectura, numeroApreciacion } = estado_;

    const filaAsistencia = (est) => {
        if (!asistenciaClase) return `<span class="text-muted small">Sin asistencia tomada aún</span>`;
        const est_ = asistenciaClase.porEstudiante[est.id] || "—";
        const badge = { presente: "success", tardanza: "warning", ausente: "danger", permiso: "secondary" }[est_] || "secondary";
        return `<span class="badge bg-${badge}">${escapeHtml(est_)}</span>`;
    };

    const filaComportamiento = (est) => {
        const valor = comportamiento[est.id];
        if (soloLectura) return valor ?? "–";
        return `
            <select class="form-select form-select-sm input-comportamiento" data-estudiante-id="${est.id}" style="width:90px;">
                <option value="">–</option>
                <option value="5" ${valor === 5 ? "selected" : ""}>😀 Bueno (5)</option>
                <option value="1" ${valor === 1 ? "selected" : ""}>😕 Malo (1)</option>
            </select>`;
    };

    const bloqueActividades = (lista, tipoActividad) => {
        const filasEncabezado = lista.map((a) => `<th class="text-center small">${escapeHtml(a.nombre)}</th>`).join("");
        const filasEstudiantes = estudiantes.map((est) => {
            const celdas = lista.map((a) => {
                const valor = a.notas[est.id] ?? "";
                if (soloLectura) return `<td class="text-center">${valor === "" ? "–" : valor}</td>`;
                return `<td>
                    <input type="text" inputmode="decimal" class="form-control form-control-sm input-nota-actividad"
                        data-actividad-id="${a.id}" data-estudiante-id="${est.id}" value="${valor}" style="width:60px; margin:auto;">
                </td>`;
            }).join("");
            return `<tr><td class="small">${escapeHtml(est.nombre)}</td>${celdas}</tr>`;
        }).join("");

        return `
            <table class="table table-sm table-bordered align-middle mb-2">
                <thead><tr><th class="small">Estudiante</th>${filasEncabezado}</tr></thead>
                <tbody>${filasEstudiantes || `<tr><td colspan="99" class="text-muted small">Sin actividades todavía.</td></tr>`}</tbody>
            </table>
            ${soloLectura ? "" : `
                <div class="d-flex gap-2 mb-3">
                    <input type="text" class="form-control form-control-sm input-nombre-nueva-actividad" placeholder="Nombre de la nueva actividad (ej: Actividad ${lista.length + 1})" data-tipo="${tipoActividad}" style="max-width:280px;">
                    <button type="button" class="btn btn-sm btn-outline-primary btn-agregar-actividad" data-tipo="${tipoActividad}">➕ Agregar actividad</button>
                </div>`}
        `;
    };

    el.cuerpo.innerHTML = `
        <h6 class="fw-bold" style="color:var(--color-primario, #4f46e5);">1) Asistencia
            ${asistenciaClase ? `<span class="small text-muted fw-normal">(clase del ${asistenciaClase.fecha})</span>` : ""}
        </h6>
        <table class="table table-sm table-bordered mb-3">
            <thead><tr><th class="small">Estudiante</th><th class="small text-center">Asistencia</th></tr></thead>
            <tbody>${estudiantes.map((est) => `<tr><td class="small">${escapeHtml(est.nombre)}</td><td class="text-center">${filaAsistencia(est)}</td></tr>`).join("")}</tbody>
        </table>

        <h6 class="fw-bold" style="color:var(--color-primario, #4f46e5);">2) Comportamiento</h6>
        <table class="table table-sm table-bordered mb-3">
            <thead><tr><th class="small">Estudiante</th><th class="small text-center">Comportamiento</th></tr></thead>
            <tbody>${estudiantes.map((est) => `<tr><td class="small">${escapeHtml(est.nombre)}</td><td class="text-center">${filaComportamiento(est)}</td></tr>`).join("")}</tbody>
        </table>

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

    el.cuerpo.querySelectorAll(".input-comportamiento").forEach((sel) => {
        sel.addEventListener("change", async () => {
            const estudianteId = sel.dataset.estudianteId;
            const valor = sel.value ? parseInt(sel.value, 10) : null;
            if (valor !== null) {
                estado_.comportamiento[estudianteId] = valor;
                const fecha = estado_.asistenciaClase?.fecha || new Date().toISOString().slice(0, 10);
                await guardarComportamiento(estado_.materia, estado_.trimestre, numeroApreciacion, fecha, estudianteId, valor);
            }
            calcularYPintarNotasFinales(estado_);
        });
    });

    el.cuerpo.querySelectorAll(".input-nota-actividad").forEach((input) => {
        input.addEventListener("change", async () => {
            const valor = input.value.trim();
            const nota = valor === "" ? null : Math.min(5, Math.max(1, parseFloat(valor)));
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

    el.cuerpo.querySelectorAll(".btn-agregar-actividad").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const tipoActividad = btn.dataset.tipo;
            const input = el.cuerpo.querySelector(`.input-nombre-nueva-actividad[data-tipo="${tipoActividad}"]`);
            const nombre = input.value.trim();
            if (!nombre) { alert("Escribe un nombre para la actividad."); return; }

            const lista = tipoActividad === "clase" ? estado_.actividadesClase : estado_.actividadesCasa;
            const nueva = await crearActividad(estado_.materia, estado_.trimestre, numeroApreciacion, tipoActividad, nombre, lista.length);
            if (!nueva) { alert("No se pudo crear la actividad."); return; }
            lista.push(nueva);
            pintarModal(estado_);
            calcularYPintarNotasFinales(estado_);
        });
    });
}
