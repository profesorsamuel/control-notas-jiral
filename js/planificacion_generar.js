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
    const el = document.getElementById("estadoGenerar");
    el.textContent = mensaje;
    el.style.color = esError ? "#c0392b" : "#2e7d32";
}

function normalizar(t) {
    return (t || "")
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // quita acentos
}

// =========================================================
// ESTADO
// =========================================================

let correoProfesor = "";
let idProfesor = "";
let nombreProfesor = "";
let misMaterias = [];
let bancoPedagogico = [];
let competenciasCatalogo = [];

// =========================================================
// ELEMENTOS
// =========================================================

const selectMateria = document.getElementById("selectMateriaGenerar");
const selectGrado = document.getElementById("selectGradoGenerar");
const selectTrimestre = document.getElementById("selectTrimestreGenerar");
const inputSemana = document.getElementById("inputSemanaGenerar");
const btnGenerar = document.getElementById("btnGenerar");
const contenedorLecciones = document.getElementById("leccionesGeneradas");

// =========================================================
// 1) SESIÓN + DATOS BASE
// =========================================================

async function verificarSesion() {
    const { data: { user }, error: errUser } = await supabase.auth.getUser();
    if (errUser || !user) {
        window.location.href = "login.html";
        return false;
    }
    correoProfesor = (user.email || "").trim().toLowerCase();
    idProfesor = user.id;

    const { data: profe } = await supabase
        .from("profesores")
        .select("nombre_profesor")
        .eq("correo_profesor", correoProfesor)
        .maybeSingle();
    nombreProfesor = profe?.nombre_profesor || correoProfesor;

    const { data: materias, error: errMaterias } = await supabase
        .from("profesor_materias")
        .select("materia")
        .eq("correo_profesor", correoProfesor)
        .limit(1);

    if (errMaterias || !materias || materias.length === 0) {
        alert("⛔ Esta cuenta no tiene materias asignadas como docente.");
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
        selectMateria.innerHTML = `<option value="">Error al cargar</option>`;
        return;
    }
    const vistos = new Set();
    misMaterias = (data || []).filter((m) => {
        if (!m.materia || vistos.has(m.materia)) return false;
        vistos.add(m.materia);
        return true;
    });
    selectMateria.innerHTML = `<option value="">Selecciona una materia</option>` +
        misMaterias.map((m) => `<option value="${escapeHtml(m.materia)}">${escapeHtml(m.materia)}</option>`).join("");
}

async function cargarBancoYCatalogo() {
    const [{ data: banco }, { data: competencias }] = await Promise.all([
        supabase.from("banco_pedagogico").select("categoria, texto").eq("activo", true),
        supabase.from("competencias_catalogo").select("id, nombre").eq("activa", true).order("orden"),
    ]);
    bancoPedagogico = banco || [];
    competenciasCatalogo = competencias || [];
}

function deCategoria(categoria, indice) {
    const opciones = bancoPedagogico.filter((b) => b.categoria === categoria);
    if (opciones.length === 0) return "";
    return opciones[indice % opciones.length].texto;
}

// =========================================================
// 2) HABILITAR "GENERAR"
// =========================================================

function actualizarBoton() {
    btnGenerar.disabled = !(selectMateria.value && selectGrado.value && selectTrimestre.value && inputSemana.value);
}
[selectMateria, selectGrado, selectTrimestre, inputSemana].forEach((el) => {
    el.addEventListener("change", actualizarBoton);
    el.addEventListener("input", actualizarBoton);
});

// =========================================================
// 3) ELEGIR COMPETENCIAS (2 opciones) por palabras clave
// =========================================================

const REGLAS_COMPETENCIA = [
    { palabras: ["sexual", "emocional", "bienestar", "salud"], buscar: "socioemocional" },
    { palabras: ["decision", "autonom", "responsab"], buscar: "autonom" },
    { palabras: ["ambiente", "ecosistema", "natural", "cuerpo", "sistema", "energia", "materia"], buscar: "fisico" },
    { palabras: ["tecnolog", "digital", "informacion"], buscar: "digital" },
    { palabras: ["familia", "comunidad", "derecho", "ciudadan"], buscar: "ciudadana" },
    { palabras: ["arte", "cultura", "musica"], buscar: "artistica" },
    { palabras: ["emprend", "proyecto", "negocio"], buscar: "emprendimiento" },
];

const COMPETENCIA_DEFAULT_POR_MATERIA = {
    "ciencias naturales": "fisico",
    "espanol": "comunicativa",
    "matematica": "logico",
    "sociales": "ciudadana",
};

function elegirCompetencias(materia, textoTema) {
    const texto = normalizar(textoTema);
    const encontradas = new Set();

    for (const regla of REGLAS_COMPETENCIA) {
        if (regla.palabras.some((p) => texto.includes(p))) {
            const comp = competenciasCatalogo.find((c) => normalizar(c.nombre).includes(regla.buscar));
            if (comp) encontradas.add(comp.nombre);
        }
    }

    const claveDefault = COMPETENCIA_DEFAULT_POR_MATERIA[normalizar(materia)] || "fisico";
    const compDefault = competenciasCatalogo.find((c) => normalizar(c.nombre).includes(claveDefault));
    if (compDefault) encontradas.add(compDefault.nombre);

    // Completar con Socioemocional si solo hay una opción
    if (encontradas.size < 2) {
        const socio = competenciasCatalogo.find((c) => normalizar(c.nombre).includes("socioemocional"));
        if (socio) encontradas.add(socio.nombre);
    }

    const lista = Array.from(encontradas);
    return [lista[0] || "Conocimiento e interacción con el mundo físico", lista[1] || lista[0] || "Socioemocional"];
}

// =========================================================
// 4) GENERAR TODO PARA UNA LECCIÓN
// =========================================================

function generarParaLeccion(tema, contenido) {
    const textoTema = `${tema.area} ${tema.unidad} ${tema.leccion}`;
    const [competenciaA, competenciaB] = elegirCompetencias(selectMateria.value, textoTema);

    const objetivoReal = (contenido?.objetivos || "").trim();
    const objetivoA = objetivoReal || `Explica ${tema.leccion.toLowerCase()}, mediante el análisis de situaciones de su entorno, para fortalecer su comprensión y aplicación en la vida cotidiana.`;
    const objetivoB = `Analiza ${tema.leccion.toLowerCase()}, a través de actividades prácticas y casos reales, para tomar decisiones informadas y responsables.`;

    const verboA = deCategoria("verbo_indicador", 0);
    const verboB = deCategoria("verbo_indicador", 1);
    const indicadorA = `${verboA} ${tema.leccion.toLowerCase()}, con apoyo de recursos y actividades prácticas.`;
    const indicadorB = `${verboB} ${tema.leccion.toLowerCase()}, mediante el análisis de situaciones reales de su entorno.`;

    const actividadesA = {
        inicio: deCategoria("actividad_inicio", 0).replace("{tema}", tema.leccion.toLowerCase()),
        desarrollo: deCategoria("actividad_desarrollo", 0).replace("{tema}", tema.leccion.toLowerCase()),
        cierre: deCategoria("actividad_cierre", 0).replace("{tema}", tema.leccion.toLowerCase()),
    };
    const actividadesB = {
        inicio: deCategoria("actividad_inicio", 1).replace("{tema}", tema.leccion.toLowerCase()),
        desarrollo: deCategoria("actividad_desarrollo", 1).replace("{tema}", tema.leccion.toLowerCase()),
        cierre: deCategoria("actividad_cierre", 1).replace("{tema}", tema.leccion.toLowerCase()),
    };

    const evaluacionA = {
        diagnostica: { estrategia: deCategoria("evaluacion_diagnostica_estrategia", 0), instrumento: deCategoria("evaluacion_diagnostica_instrumento", 0) },
        formativa: { estrategia: deCategoria("evaluacion_formativa_estrategia", 0), instrumento: deCategoria("evaluacion_formativa_instrumento", 0) },
        sumativa: { estrategia: deCategoria("evaluacion_sumativa_estrategia", 0), instrumento: deCategoria("evaluacion_sumativa_instrumento", 0) },
    };
    const evaluacionB = {
        diagnostica: { estrategia: deCategoria("evaluacion_diagnostica_estrategia", 1), instrumento: deCategoria("evaluacion_diagnostica_instrumento", 1) },
        formativa: { estrategia: deCategoria("evaluacion_formativa_estrategia", 1), instrumento: deCategoria("evaluacion_formativa_instrumento", 1) },
        sumativa: { estrategia: deCategoria("evaluacion_sumativa_estrategia", 1), instrumento: deCategoria("evaluacion_sumativa_instrumento", 1) },
    };

    return {
        area: tema.area,
        contenidoReferencia: (contenido?.contenido_raw || "").trim() || "No se encontró contenido del programa enlazado a esta lección todavía.",
        opciones: {
            competencia: [competenciaA, competenciaB],
            objetivo: [objetivoA, objetivoB],
            indicador: [indicadorA, indicadorB],
            actividades: [actividadesA, actividadesB],
            evaluacion: [evaluacionA, evaluacionB],
        },
    };
}

// =========================================================
// 5) CARGAR LA SEMANA Y GENERAR TODO
// =========================================================

async function generar() {
    const materia = selectMateria.value;
    const grado = selectGrado.value;
    const trimestre = Number(selectTrimestre.value);
    const semana = Number(inputSemana.value);

    btnGenerar.disabled = true;
    contenedorLecciones.innerHTML = "";
    mostrarEstado("Cargando la semana...");

    const { data: semanaGuardada, error: errSemana } = await supabase
        .from("planificacion_semanal")
        .select("temas_seleccionados")
        .eq("profesor_id", idProfesor)
        .eq("materia", materia)
        .eq("grado", grado)
        .eq("trimestre", trimestre)
        .eq("semana_numero", semana)
        .maybeSingle();

    if (errSemana || !semanaGuardada || !semanaGuardada.temas_seleccionados?.length) {
        mostrarEstado(`No hay lecciones marcadas para ${materia} - ${grado}° - Trimestre ${trimestre} - Semana ${semana}. Ve a "Planificación semanal" y marca las lecciones primero.`, true);
        btnGenerar.disabled = false;
        return;
    }

    const idsTemas = semanaGuardada.temas_seleccionados;

    const { data: temas, error: errTemas } = await supabase
        .from("temas_programa")
        .select("id, area, unidad, leccion, pagina")
        .in("id", idsTemas);

    if (errTemas || !temas) {
        mostrarEstado("Error al cargar las lecciones: " + (errTemas?.message || ""), true);
        btnGenerar.disabled = false;
        return;
    }

    const { data: cruces } = await supabase
        .from("cruce_tema_contenido")
        .select("id_tema, id_contenido")
        .in("id_tema", idsTemas);

    const idsContenidos = (cruces || []).map((c) => c.id_contenido);
    const { data: contenidos } = idsContenidos.length
        ? await supabase.from("contenidos_curriculares").select("id, objetivos, contenido_raw").in("id", idsContenidos)
        : { data: [] };

    const contenidoPorTema = new Map();
    for (const c of cruces || []) {
        const contenido = (contenidos || []).find((x) => x.id === c.id_contenido);
        if (contenido && !contenidoPorTema.has(c.id_tema)) contenidoPorTema.set(c.id_tema, contenido);
    }

    mostrarEstado(`Generando opciones para ${temas.length} lección(es)...`);
    pintarLecciones(temas, contenidoPorTema);
    mostrarEstado(`Listo: ${temas.length} planificación(es) generada(s), una por cada lección. Elige una opción por campo y guarda cada lección.`);
    btnGenerar.disabled = false;
}

// =========================================================
// 6) PINTAR CADA LECCIÓN COMO TARJETA CON RADIOS
// =========================================================

function filaOpciones(nombreCampo, opciones, idTema, formatear) {
    const grupo = `${nombreCampo}_${idTema}`;
    return `
        <div class="campo-formato">
            <div class="titulo-campo">${escapeHtml(nombreCampo.replace(/_/g, " "))}</div>
            <label class="opcion-radio">
                <input type="radio" name="${grupo}" value="0" checked>
                <span class="etiqueta-opcion">Opción A —</span> ${formatear(opciones[0])}
            </label>
            <label class="opcion-radio">
                <input type="radio" name="${grupo}" value="1">
                <span class="etiqueta-opcion">Opción B —</span> ${formatear(opciones[1])}
            </label>
        </div>
    `;
}

function formatearActividades(a) {
    return `Inicio: ${escapeHtml(a.inicio)} · Desarrollo: ${escapeHtml(a.desarrollo)} · Cierre: ${escapeHtml(a.cierre)}`;
}

function formatearEvaluacion(e) {
    return `Diagnóstica: ${escapeHtml(e.diagnostica.estrategia)} (${escapeHtml(e.diagnostica.instrumento)}) · Formativa: ${escapeHtml(e.formativa.estrategia)} (${escapeHtml(e.formativa.instrumento)}) · Sumativa: ${escapeHtml(e.sumativa.estrategia)} (${escapeHtml(e.sumativa.instrumento)})`;
}

function pintarLecciones(temas, contenidoPorTema) {
    let html = "";

    for (const tema of temas) {
        const contenido = contenidoPorTema.get(tema.id);
        const generado = generarParaLeccion(tema, contenido);

        html += `
            <div class="tarjeta-leccion" data-tema-id="${tema.id}">
                <div class="cabecera-leccion">
                    ${escapeHtml(tema.leccion)}
                    <small>${escapeHtml(tema.area)} · ${escapeHtml(tema.unidad)} · pág. ${tema.pagina}</small>
                </div>

                <div class="campo-formato">
                    <div class="titulo-campo">Área (automático)</div>
                    <div>${escapeHtml(generado.area)}</div>
                </div>

                ${filaOpciones("competencia", generado.opciones.competencia, tema.id, (v) => escapeHtml(v))}
                ${filaOpciones("objetivo", generado.opciones.objetivo, tema.id, (v) => escapeHtml(v))}
                ${filaOpciones("indicador_de_logro", generado.opciones.indicador, tema.id, (v) => escapeHtml(v))}
                ${filaOpciones("actividades", generado.opciones.actividades, tema.id, formatearActividades)}
                ${filaOpciones("evaluacion", generado.opciones.evaluacion, tema.id, formatearEvaluacion)}

                <div class="campo-formato">
                    <div class="titulo-campo">Contenido de referencia del programa (para llenar Conceptual / Procedimental / Actitudinal a tu criterio)</div>
                    <div class="caja-contenido-real">${escapeHtml(generado.contenidoReferencia)}</div>
                </div>

                <div class="acciones-guardar-leccion">
                    <button class="btn btn-sm btn-success btn-guardar-leccion">✅ Guardar esta lección</button>
                </div>
            </div>
        `;
    }

    contenedorLecciones.innerHTML = html;

    document.querySelectorAll(".btn-guardar-leccion").forEach((btn) => {
        btn.addEventListener("click", (e) => guardarLeccion(e.target.closest(".tarjeta-leccion")));
    });

    // Guarda cada tarjeta generada en memoria para poder leerla al guardar
    window.__leccionesGeneradas = new Map(temas.map((t) => [t.id, generarParaLeccion(t, contenidoPorTema.get(t.id))]));
}

async function guardarLeccion(tarjeta) {
    const temaId = tarjeta.dataset.temaId;
    const generado = window.__leccionesGeneradas.get(temaId);
    const btn = tarjeta.querySelector(".btn-guardar-leccion");

    const leer = (campo) => tarjeta.querySelector(`input[name="${campo}_${temaId}"]:checked`).value;

    const datos = {
        area: generado.area,
        competencia: generado.opciones.competencia[leer("competencia")],
        objetivo: generado.opciones.objetivo[leer("objetivo")],
        indicador_de_logro: generado.opciones.indicador[leer("indicador_de_logro")],
        actividades: generado.opciones.actividades[leer("actividades")],
        evaluacion: generado.opciones.evaluacion[leer("evaluacion")],
        contenido_referencia: generado.contenidoReferencia,
    };

    btn.disabled = true;
    btn.textContent = "Guardando...";

    const { error } = await supabase
        .from("planificacion_generada")
        .upsert({
            profesor_id: idProfesor,
            correo_profesor: correoProfesor,
            tema_id: temaId,
            datos,
            actualizado_en: new Date().toISOString(),
        }, { onConflict: "tema_id" });

    if (error) {
        console.error("❌ Error al guardar la lección:", error);
        btn.textContent = "Error — reintentar";
        btn.disabled = false;
        return;
    }

    btn.textContent = "✅ Guardado correctamente";
    setTimeout(() => {
        btn.disabled = false;
        btn.textContent = "✅ Guardar esta lección";
    }, 1500);
}

btnGenerar.addEventListener("click", generar);

// =========================================================
// INICIO
// =========================================================

(async function init() {
    const ok = await verificarSesion();
    if (!ok) return;
    await cargarMisMaterias();
    await cargarBancoYCatalogo();
    actualizarBoton();
})();
