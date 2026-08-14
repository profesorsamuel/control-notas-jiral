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
    const el = document.getElementById("estadoPlanificacion");
    el.textContent = mensaje;
    el.style.color = esError ? "#c0392b" : "#2e7d32";
}

const TAMANO_MAXIMO_MB = 50;
const BUCKET = "planificacion-curricular";

// =========================================================
// ESTADO
// =========================================================

let correoProfesor = "";
let idProfesor = "";
let misMaterias = []; // [{materia, salon}, ...]

let archivoLibro = null;
let archivoPrograma = null;

// =========================================================
// ELEMENTOS
// =========================================================

const selectMateria = document.getElementById("selectMateriaPlanificacion");
const selectGrado = document.getElementById("selectGradoPlanificacion");
const btnAnalizarPdfs = document.getElementById("btnAnalizarPdfs");
const contenedorResultado = document.getElementById("resultadoTemas");
const contenedorPrograma = document.getElementById("resultadoPrograma");

let temasDetectados = [];
let bloquesProgramaDetectados = [];

const zonas = {
    libro: {
        zona: document.getElementById("zonaLibro"),
        input: document.getElementById("inputLibro"),
        btnElegir: document.getElementById("btnElegirLibro"),
        btnQuitar: document.getElementById("btnQuitarLibro"),
        nombreEl: document.getElementById("nombreArchivoLibro"),
    },
    programa: {
        zona: document.getElementById("zonaPrograma"),
        input: document.getElementById("inputPrograma"),
        btnElegir: document.getElementById("btnElegirPrograma"),
        btnQuitar: document.getElementById("btnQuitarPrograma"),
        nombreEl: document.getElementById("nombreArchivoPrograma"),
    },
};

// =========================================================
// 1) VERIFICAR SESIÓN (mismo patrón que tareas.js / mi_horario.js)
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

    return true;
}

// =========================================================
// 2) CARGAR MIS MATERIAS (desde profesor_materias existente)
// =========================================================

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
// 3) ZONAS DE SUBIDA (libro / programa)
// =========================================================

function validarPdf(archivo) {
    if (!archivo) return "No se seleccionó ningún archivo.";
    const esPdfPorTipo = archivo.type === "application/pdf";
    const esPdfPorNombre = /\.pdf$/i.test(archivo.name || "");
    if (!esPdfPorTipo && !esPdfPorNombre) return "El archivo debe ser un PDF.";
    const tamanoMb = archivo.size / (1024 * 1024);
    if (tamanoMb > TAMANO_MAXIMO_MB) return `El archivo pesa ${tamanoMb.toFixed(1)} MB; el máximo permitido es ${TAMANO_MAXIMO_MB} MB.`;
    return null;
}

function pintarZona(tipo, archivo, errorTexto) {
    const { zona, nombreEl, btnElegir, btnQuitar } = zonas[tipo];

    zona.classList.remove("tiene-archivo", "error");

    if (errorTexto) {
        zona.classList.add("error");
        nombreEl.textContent = `⚠️ ${errorTexto}`;
        btnElegir.classList.remove("d-none");
        btnQuitar.classList.add("d-none");
        return;
    }

    if (archivo) {
        zona.classList.add("tiene-archivo");
        const tamanoMb = (archivo.size / (1024 * 1024)).toFixed(1);
        nombreEl.textContent = `✅ ${archivo.name} (${tamanoMb} MB)`;
        btnElegir.classList.add("d-none");
        btnQuitar.classList.remove("d-none");
        return;
    }

    nombreEl.textContent = "";
    btnElegir.classList.remove("d-none");
    btnQuitar.classList.add("d-none");
}

function manejarSeleccion(tipo, archivo) {
    const error = validarPdf(archivo);

    if (error) {
        pintarZona(tipo, null, error);
        if (tipo === "libro") archivoLibro = null; else archivoPrograma = null;
        actualizarBotonAnalizar();
        return;
    }

    pintarZona(tipo, archivo, null);
    if (tipo === "libro") archivoLibro = archivo; else archivoPrograma = archivo;
    actualizarBotonAnalizar();
}

function quitarArchivo(tipo) {
    zonas[tipo].input.value = "";
    if (tipo === "libro") archivoLibro = null; else archivoPrograma = null;
    pintarZona(tipo, null, null);
    actualizarBotonAnalizar();
}

zonas.libro.btnElegir.addEventListener("click", () => zonas.libro.input.click());
zonas.libro.btnQuitar.addEventListener("click", () => quitarArchivo("libro"));
zonas.libro.input.addEventListener("change", (e) => manejarSeleccion("libro", e.target.files[0] || null));

zonas.programa.btnElegir.addEventListener("click", () => zonas.programa.input.click());
zonas.programa.btnQuitar.addEventListener("click", () => quitarArchivo("programa"));
zonas.programa.input.addEventListener("change", (e) => manejarSeleccion("programa", e.target.files[0] || null));

// =========================================================
// 4) HABILITAR BOTÓN "ANALIZAR PDFS"
// =========================================================

function actualizarBotonAnalizar() {
    const listo = !!selectMateria.value && !!selectGrado.value && !!archivoLibro && !!archivoPrograma;
    btnAnalizarPdfs.disabled = !listo;
}

selectMateria.addEventListener("change", actualizarBotonAnalizar);
selectGrado.addEventListener("change", actualizarBotonAnalizar);

// =========================================================
// 5) SUBIR UN ARCHIVO AL BUCKET (carpeta = uid del profesor)
// =========================================================

async function subirArchivo(archivo, nombreDestino) {
    const ruta = `${idProfesor}/${nombreDestino}`;

    const { error } = await supabase.storage
        .from(BUCKET)
        .upload(ruta, archivo, { upsert: true, contentType: "application/pdf" });

    if (error) {
        throw new Error(`Error al subir ${nombreDestino}: ${error.message}`);
    }

    return ruta;
}

// =========================================================
// 6) PINTAR LA TABLA DE TEMAS DETECTADOS
// =========================================================

function pintarTablaTemas(temas) {
    if (!temas || temas.length === 0) {
        contenedorResultado.innerHTML = "";
        return;
    }

    const filas = temas.map((t) => `
        <tr>
            <td>${t.trimestre}</td>
            <td>${escapeHtml(t.area)}</td>
            <td>${escapeHtml(t.unidad)}</td>
            <td>${escapeHtml(t.leccion)}</td>
            <td class="text-end">${t.pagina}</td>
        </tr>
    `).join("");

    contenedorResultado.innerHTML = `
        <div class="alert alert-success py-2 px-3 mb-2" style="font-size:.85rem;">
            ✅ Se detectaron <strong>${temas.length}</strong> lecciones. Revísalas antes de confirmar.
        </div>
        <div class="table-responsive" style="max-height:320px; overflow:auto; border:1px solid #eee; border-radius:8px;">
            <table class="table table-sm table-striped mb-0" style="font-size:.78rem;">
                <thead class="table-light" style="position:sticky; top:0;">
                    <tr>
                        <th>Trim.</th>
                        <th>Área</th>
                        <th>Unidad</th>
                        <th>Lección</th>
                        <th class="text-end">Pág.</th>
                    </tr>
                </thead>
                <tbody>${filas}</tbody>
            </table>
        </div>
        <div class="text-center mt-3">
            <button class="btn btn-sm btn-success" id="btnConfirmarGuardar">
                ✅ Confirmar y guardar ${temas.length} lecciones
            </button>
        </div>
    `;

    const btnConfirmar = document.getElementById("btnConfirmarGuardar");
    btnConfirmar.addEventListener("click", guardarTemasEnBaseDeDatos);
}

// =========================================================
// 6b) PINTAR LA TABLA DE OBJETIVOS/CONTENIDOS DEL PROGRAMA
// =========================================================

function pintarTablaPrograma(bloques) {
    if (!bloques || bloques.length === 0) {
        contenedorPrograma.innerHTML = "";
        return;
    }

    const filas = bloques.map((b, i) => `
        <tr>
            <td>${escapeHtml(b.grado)}°</td>
            <td>${escapeHtml(b.area)}</td>
            <td style="max-width:260px;">
                <ul class="mb-0 ps-3">
                    ${b.objetivos.map((o) => `<li>${escapeHtml(o)}</li>`).join("")}
                </ul>
            </td>
            <td style="max-width:280px; white-space:pre-wrap;">${escapeHtml(b.contenido_raw.slice(0, 400))}${b.contenido_raw.length > 400 ? "…" : ""}</td>
        </tr>
    `).join("");

    contenedorPrograma.innerHTML = `
        <div class="alert alert-success py-2 px-3 mb-2" style="font-size:.85rem;">
            ✅ Se detectaron <strong>${bloques.length}</strong> bloques de Área/grado del programa. Revísalos antes de confirmar
            (el bloque de contenidos viene tal cual salió del PDF; puedes ajustarlo después de guardar).
        </div>
        <div class="table-responsive" style="max-height:320px; overflow:auto; border:1px solid #eee; border-radius:8px;">
            <table class="table table-sm table-striped mb-0" style="font-size:.75rem;">
                <thead class="table-light" style="position:sticky; top:0;">
                    <tr>
                        <th>Grado</th>
                        <th>Área</th>
                        <th>Objetivos de aprendizaje</th>
                        <th>Contenidos / indicadores / actividades (crudo)</th>
                    </tr>
                </thead>
                <tbody>${filas}</tbody>
            </table>
        </div>
        <div class="text-center mt-3">
            <button class="btn btn-sm btn-success" id="btnConfirmarPrograma">
                ✅ Confirmar y guardar ${bloques.length} bloques del programa
            </button>
        </div>
    `;

    document.getElementById("btnConfirmarPrograma").addEventListener("click", guardarProgramaEnBaseDeDatos);
}

async function guardarProgramaEnBaseDeDatos() {
    const btnConfirmar = document.getElementById("btnConfirmarPrograma");
    if (!btnConfirmar || bloquesProgramaDetectados.length === 0) return;

    btnConfirmar.disabled = true;
    btnConfirmar.textContent = "Guardando...";

    const filasAInsertar = bloquesProgramaDetectados.map((b, i) => ({
        profesor_id: idProfesor,
        correo_profesor: correoProfesor,
        materia: selectMateria.value,
        grado: b.grado,
        area: b.area,
        objetivos: b.objetivos.join("\n"),
        contenido_raw: b.contenido_raw,
        orden: i,
    }));

    const { error } = await supabase.from("contenidos_curriculares").insert(filasAInsertar);

    if (error) {
        console.error("❌ Error al guardar el programa:", error);
        mostrarEstado("Error al guardar el programa: " + error.message, true);
        btnConfirmar.disabled = false;
        btnConfirmar.textContent = `✅ Confirmar y guardar ${bloquesProgramaDetectados.length} bloques del programa`;
        return;
    }

    btnConfirmar.textContent = "✅ Guardado correctamente";
    mostrarEstado(`Se guardaron ${bloquesProgramaDetectados.length} bloques del programa de ${selectMateria.value}.`);
}

// =========================================================
// 8) GUARDAR LOS TEMAS CONFIRMADOS EN "temas_programa"
// =========================================================

async function guardarTemasEnBaseDeDatos() {
    const btnConfirmar = document.getElementById("btnConfirmarGuardar");
    if (!btnConfirmar || temasDetectados.length === 0) return;

    btnConfirmar.disabled = true;
    btnConfirmar.textContent = "Guardando...";

    const filasAInsertar = temasDetectados.map((t, i) => ({
        profesor_id: idProfesor,
        correo_profesor: correoProfesor,
        id_docente: idProfesor,
        materia: selectMateria.value,
        grado: selectGrado.value,
        trimestre: t.trimestre,
        area: t.area,
        unidad: t.unidad,
        leccion: t.leccion,
        pagina: t.pagina,
        orden: i,
        confirmado: true,
    }));

    const { error } = await supabase.from("temas_programa").insert(filasAInsertar);

    if (error) {
        console.error("❌ Error al guardar temas:", error);
        mostrarEstado("Error al guardar: " + error.message, true);
        btnConfirmar.disabled = false;
        btnConfirmar.textContent = `✅ Confirmar y guardar ${temasDetectados.length} lecciones`;
        return;
    }

    btnConfirmar.textContent = "✅ Guardado correctamente";
    mostrarEstado(`Se guardaron ${temasDetectados.length} lecciones de ${selectMateria.value} - ${selectGrado.value}° en la base de datos.`);
}

// =========================================================
// 7) ANALIZAR PDFS
// -----------------------------------------------------------
// Paso pequeño 2 (este archivo): sube libro + programa a Storage,
// llama la Edge Function "parsear-libro" y muestra la tabla.
// Paso pequeño 3 (siguiente entrega): botón "Confirmar y guardar"
// hace el insert real en "temas_programa", y se agrega la Edge
// Function "parsear-programa" para el segundo PDF.
// =========================================================

async function analizarPdfs() {
    if (!selectMateria.value || !archivoLibro || !archivoPrograma) return;

    btnAnalizarPdfs.disabled = true;
    contenedorResultado.innerHTML = "";
    contenedorPrograma.innerHTML = "";
    mostrarEstado("Subiendo archivos...");

    try {
        const rutaLibro = await subirArchivo(archivoLibro, "libro.pdf");
        const rutaPrograma = await subirArchivo(archivoPrograma, "programa.pdf");

        mostrarEstado("Analizando el libro (esto puede tardar unos segundos)...");

        const { data: dataLibro, error: errorLibro } = await supabase.functions.invoke("parsear-libro", {
            body: { path: rutaLibro },
        });

        if (errorLibro) {
            throw new Error(errorLibro.message || "Error al llamar la función de análisis del libro.");
        }
        if (!dataLibro || !dataLibro.ok) {
            throw new Error((dataLibro && dataLibro.error) || "No se pudo analizar el libro.");
        }

        temasDetectados = dataLibro.temas;
        pintarTablaTemas(dataLibro.temas);

        mostrarEstado("Analizando el programa curricular (esto puede tardar unos segundos)...");

        const { data: dataPrograma, error: errorPrograma } = await supabase.functions.invoke("parsear-programa", {
            body: { path: rutaPrograma },
        });

        if (errorPrograma) {
            throw new Error(errorPrograma.message || "Error al llamar la función de análisis del programa.");
        }
        if (!dataPrograma || !dataPrograma.ok) {
            throw new Error((dataPrograma && dataPrograma.error) || "No se pudo analizar el programa.");
        }

        bloquesProgramaDetectados = dataPrograma.bloques;
        pintarTablaPrograma(dataPrograma.bloques);

        if (dataPrograma.diagnostico) {
            const cajaDiagnostico = document.createElement("div");
            cajaDiagnostico.className = "alert alert-warning mt-3";
            cajaDiagnostico.style.fontSize = ".72rem";
            cajaDiagnostico.style.whiteSpace = "pre-wrap";
            cajaDiagnostico.innerHTML = `<strong>🔍 Diagnóstico temporal (cópiaselo a Claude):</strong>\n${dataPrograma.diagnostico.map((d, i) => `${i + 1}. ${escapeHtml(d)}`).join("\n")}`;
            contenedorPrograma.appendChild(cajaDiagnostico);
        }

        mostrarEstado(`Listo. ${dataLibro.total} lecciones del libro y ${dataPrograma.total} bloques del programa.`);
    } catch (err) {
        console.error("❌ Error al analizar PDFs:", err);
        mostrarEstado(err.message || "Ocurrió un error al analizar los archivos.", true);
    } finally {
        btnAnalizarPdfs.disabled = false;
    }
}

btnAnalizarPdfs.addEventListener("click", analizarPdfs);

// =========================================================
// INICIO
// =========================================================

(async function init() {
    const ok = await verificarSesion();
    if (!ok) return;
    await cargarMisMaterias();
    actualizarBotonAnalizar();
})();
