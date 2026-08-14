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

function mostrarEstado(mensaje, esError = false) {
    const el = document.getElementById("estadoSemana");
    el.textContent = mensaje;
    el.style.color = esError ? "#c0392b" : "#2e7d32";
}

// =========================================================
// ESTADO
// =========================================================

let correoProfesor = "";
let idProfesor = "";
let misMaterias = [];
let temasDeEstaMateriaGrado = []; // lo que se cargó al pedir "Cargar lecciones"

// =========================================================
// ELEMENTOS
// =========================================================

const selectMateria = document.getElementById("selectMateriaSemana");
const selectGrado = document.getElementById("selectGradoSemana");
const selectTrimestre = document.getElementById("selectTrimestreSemana");
const inputSemana = document.getElementById("inputSemanaNumero");
const btnCargarLecciones = document.getElementById("btnCargarLecciones");
const listaLecciones = document.getElementById("listaLecciones");
const cajaGuardar = document.getElementById("cajaGuardar");
const btnGuardarSemana = document.getElementById("btnGuardarSemana");

// =========================================================
// 1) VERIFICAR SESIÓN (mismo patrón que planificacion_subir.js)
// =========================================================

async function verificarSesion() {
    const { data: { user }, error: errUser } = await supabase.auth.getUser();

    if (errUser || !user) {
        window.location.href = "login.html";
        return false;
    }

    correoProfesor = (user.email || "").trim().toLowerCase();
    idProfesor = user.id;

    const { data: materias, error: errMaterias } = await supabase
        .from("profesor_materias")
        .select("materia")
        .eq("correo_profesor", correoProfesor)
        .limit(1);

    if (errMaterias || !materias || materias.length === 0) {
        alert("⛔ Esta cuenta no tiene materias asignadas como docente. Contacta al administrador.");
        window.location.href = "login.html";
        return false;
    }

    return true;
}

async function cargarMisMaterias() {
    const { data, error } = await supabase
        .from("profesor_materias")
        .select("materia, salon")
        .eq("correo_profesor", correoProfesor);

    if (error) {
        console.error("❌ Error al cargar materias:", error);
        selectMateria.innerHTML = `<option value="">Error al cargar</option>`;
        return;
    }

    const vistos = new Set();
    misMaterias = (data || []).filter((m) => {
        if (!m.materia || vistos.has(m.materia)) return false;
        vistos.add(m.materia);
        return true;
    });

    if (misMaterias.length === 0) {
        selectMateria.innerHTML = `<option value="">No tienes materias asignadas</option>`;
        return;
    }

    selectMateria.innerHTML = `<option value="">Selecciona una materia</option>` +
        misMaterias.map((m) => `<option value="${escapeHtml(m.materia)}">${escapeHtml(m.materia)}</option>`).join("");
}

// =========================================================
// 2) HABILITAR "CARGAR LECCIONES"
// =========================================================

function actualizarBotonCargar() {
    const listo = !!selectMateria.value && !!selectGrado.value && !!selectTrimestre.value && !!inputSemana.value;
    btnCargarLecciones.disabled = !listo;
}

[selectMateria, selectGrado, selectTrimestre, inputSemana].forEach((el) => {
    el.addEventListener("change", actualizarBotonCargar);
    el.addEventListener("input", actualizarBotonCargar);
});

// =========================================================
// 3) CARGAR LECCIONES (agrupadas por área) + selección previa si existe
// =========================================================

async function cargarLecciones() {
    const materia = selectMateria.value;
    const grado = selectGrado.value;
    const trimestre = Number(selectTrimestre.value);
    const semana = Number(inputSemana.value);

    btnCargarLecciones.disabled = true;
    listaLecciones.innerHTML = "";
    cajaGuardar.classList.add("d-none");
    mostrarEstado("Cargando lecciones...");

    const { data: temas, error: errTemas } = await supabase
        .from("temas_programa")
        .select("id, area, unidad, leccion, pagina, orden")
        .eq("profesor_id", idProfesor)
        .eq("materia", materia)
        .eq("grado", grado)
        .eq("trimestre", trimestre)
        .order("orden", { ascending: true });

    if (errTemas) {
        console.error("❌ Error al cargar lecciones:", errTemas);
        mostrarEstado("Error al cargar lecciones: " + errTemas.message, true);
        btnCargarLecciones.disabled = false;
        return;
    }

    if (!temas || temas.length === 0) {
        mostrarEstado(`No hay lecciones guardadas de ${materia} - ${grado}° - Trimestre ${trimestre}. Sube el libro de esa materia/grado primero en "Subir libro / programa".`, true);
        btnCargarLecciones.disabled = false;
        return;
    }

    temasDeEstaMateriaGrado = temas;

    // ¿Ya existe una selección guardada para esta semana? (para precargar los checks)
    const { data: semanaGuardada, error: errSemana } = await supabase
        .from("planificacion_semanal")
        .select("temas_seleccionados")
        .eq("profesor_id", idProfesor)
        .eq("materia", materia)
        .eq("grado", grado)
        .eq("trimestre", trimestre)
        .eq("semana_numero", semana)
        .maybeSingle();

    if (errSemana) {
        console.error("⚠️ No se pudo verificar selección previa:", errSemana);
    }

    const idsYaMarcados = new Set(semanaGuardada?.temas_seleccionados || []);

    pintarLecciones(temas, idsYaMarcados);

    mostrarEstado(
        idsYaMarcados.size > 0
            ? `Se cargaron ${temas.length} lecciones. Ya tenías ${idsYaMarcados.size} marcadas para esta semana — puedes ajustarlas.`
            : `Se cargaron ${temas.length} lecciones. Marca las que vas a cubrir esta semana.`
    );

    cajaGuardar.classList.remove("d-none");
    btnCargarLecciones.disabled = false;
}

function pintarLecciones(temas, idsYaMarcados) {
    // Agrupar por área, conservando el orden en que ya vienen
    const grupos = new Map();
    for (const t of temas) {
        if (!grupos.has(t.area)) grupos.set(t.area, []);
        grupos.get(t.area).push(t);
    }

    let html = "";
    for (const [area, lecciones] of grupos) {
        html += `
            <div class="grupo-area">
                <div class="titulo-area">${escapeHtml(area)}</div>
                ${lecciones.map((t) => `
                    <label class="fila-leccion" style="cursor:pointer;">
                        <input type="checkbox" class="check-leccion" value="${t.id}" ${idsYaMarcados.has(t.id) ? "checked" : ""}>
                        <div class="detalle-leccion">
                            ${escapeHtml(t.leccion)}
                            <small>${escapeHtml(t.unidad)} · pág. ${t.pagina}</small>
                        </div>
                    </label>
                `).join("")}
            </div>
        `;
    }

    listaLecciones.innerHTML = html;
}

// =========================================================
// 4) GUARDAR LA SELECCIÓN DE LA SEMANA (upsert)
// =========================================================

async function guardarSemana() {
    const materia = selectMateria.value;
    const grado = selectGrado.value;
    const trimestre = Number(selectTrimestre.value);
    const semana = Number(inputSemana.value);

    const idsMarcados = Array.from(document.querySelectorAll(".check-leccion:checked")).map((el) => el.value);

    if (idsMarcados.length === 0) {
        mostrarEstado("Marca al menos una lección antes de guardar.", true);
        return;
    }

    btnGuardarSemana.disabled = true;
    btnGuardarSemana.textContent = "Guardando...";

    const { error } = await supabase
        .from("planificacion_semanal")
        .upsert({
            profesor_id: idProfesor,
            correo_profesor: correoProfesor,
            materia,
            grado,
            trimestre,
            semana_numero: semana,
            temas_seleccionados: idsMarcados,
            actualizado_en: new Date().toISOString(),
        }, { onConflict: "profesor_id,materia,grado,trimestre,semana_numero" });

    if (error) {
        console.error("❌ Error al guardar la semana:", error);
        mostrarEstado("Error al guardar: " + error.message, true);
        btnGuardarSemana.disabled = false;
        btnGuardarSemana.textContent = "✅ Guardar selección de la semana";
        return;
    }

    btnGuardarSemana.textContent = "✅ Guardado correctamente";
    mostrarEstado(`Se guardaron ${idsMarcados.length} lecciones para ${materia} - ${grado}° - Trimestre ${trimestre} - Semana ${semana}.`);

    setTimeout(() => {
        btnGuardarSemana.disabled = false;
        btnGuardarSemana.textContent = "✅ Guardar selección de la semana";
    }, 1500);
}

btnCargarLecciones.addEventListener("click", cargarLecciones);
btnGuardarSemana.addEventListener("click", guardarSemana);

// =========================================================
// INICIO
// =========================================================

(async function init() {
    const ok = await verificarSesion();
    if (!ok) return;
    await cargarMisMaterias();
    actualizarBotonCargar();
})();
