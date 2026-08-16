import { supabase } from "./supabase.js";
import { pintarCambiarPanel } from "./roles.js";
import { calcularColumnasApreciacionesNuevas, activarApreciacionSiguiente, iconoApreciacion, abrirDetalleApreciacion, abrirSelectorModo, revisarAvanceApreciacionesDirectas, eliminarApreciacionColumna } from "./apreciaciones.js";
import { obtenerLeyendaMateria, guardarLeyendaMateria } from "./leyendas.js";

// =========================================================
// 0) UTILIDADES
// =========================================================

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

const PROMEDIO_MINIMO_APROBAR = 3.0;

// Mientras el/la docente escribe: solo deja pasar dígitos y un único punto
// decimal, y limita a 1 dígito entero + 1 decimal (así nunca se puede
// llegar a escribir algo como "33").
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

// Al salir de la casilla: convierte "3" en "3.0", ".6" en "0.6", y
// limita cualquier valor al rango 1–5 (la nota mínima permitida es 1.0;
// no se aceptan notas de 0.9 o menos).
function formatearNotaFinal(valor) {
    const texto = (valor ?? "").trim();
    if (texto === "" || texto === ".") return "";

    let num = parseFloat(texto);
    if (isNaN(num)) return "";

    if (num < 1) num = 1;
    if (num > 5) num = 5;

    return num.toFixed(1);
}

function claveCasilla(tipo, numero) {
    return `${tipo}-${numero}`;
}

const ETIQUETAS_TIPO = { apreciacion: "Aprec.", ejercicio: "Ejer.", examen: "Exam." };
const ORDEN_TIPO = { apreciacion: 0, ejercicio: 1, examen: 2 };

function etiquetaCasilla(tipo, numero) {
    return `${ETIQUETAS_TIPO[tipo] || tipo} ${numero}`;
}

function ordenarCasillas(lista) {
    lista.sort((a, b) => {
        const oa = ORDEN_TIPO[a.tipo] ?? 99;
        const ob = ORDEN_TIPO[b.tipo] ?? 99;
        return oa !== ob ? oa - ob : a.numero - b.numero;
    });
}

// =========================================================
// 1) VERIFICAR SESIÓN Y QUE SEA PROFESOR
// =========================================================

let correoProfesor = "";
let nombreProfesor = "";
let misAsignaciones = []; // [{materia, salon}, ...] -- solo lo que este profesor da
let bloqueoActual = false; // ¿la materia/salón cargada está bloqueada para estudiantes?

// El acceso a este panel se decide igual que en consejero.js:
// por pertenecer a la tabla correspondiente (profesor_materias),
// no por el campo "rol" de la tabla "usuarios". Así una cuenta
// puede ser profesor(a) sin dejar de ser también admin/consejero(a).
async function verificarSesion() {
    const { data: { user }, error: errUser } = await supabase.auth.getUser();

    if (errUser || !user) {
        window.location.href = "login.html";
        return false;
    }

    correoProfesor = (user.email || "").trim().toLowerCase();

    const { data: materias, error: errMaterias } = await supabase
        .from("profesor_materias")
        .select("materia, salon")
        .eq("correo_profesor", correoProfesor);

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

    misAsignaciones = materias;

    const { data: perfilProfesor } = await supabase
        .from("profesores")
        .select("nombre_profesor")
        .eq("correo_profesor", correoProfesor)
        .maybeSingle();
    nombreProfesor = perfilProfesor?.nombre_profesor || correoProfesor;

    const nombreProfesorHeader = document.getElementById("nombreProfesorHeader");
    const avatarDocente = document.getElementById("avatarDocente");
    const resumenAsignacionesHeader = document.getElementById("resumenAsignacionesHeader");

    if (nombreProfesorHeader) nombreProfesorHeader.textContent = nombreProfesor;

    if (avatarDocente) {
        const inicial = (nombreProfesor || correoProfesor || "?").trim().charAt(0).toUpperCase();
        if (inicial) avatarDocente.textContent = inicial;
    }

    if (resumenAsignacionesHeader) {
        const salonesUnicos = new Set(materias.map((m) => m.salon)).size;
        const materiasUnicas = new Set(materias.map((m) => m.materia)).size;
        const txtSalones = salonesUnicos === 1 ? "1 salón" : `${salonesUnicos} salones`;
        const txtMaterias = materiasUnicas === 1 ? "1 materia" : `${materiasUnicas} materias`;
        resumenAsignacionesHeader.textContent = `${txtMaterias} · ${txtSalones}`;
    }

    return true;
}

// =========================================================
// 2) SELECTORES DE SALÓN / MATERIA (solo lo que este profesor da)
// =========================================================

const selectSalonNota = document.getElementById("selectSalonNota");
const selectMateriaNota = document.getElementById("selectMateriaNota");
const selectTipoNota = document.getElementById("selectTipoNota");
const inputNumeroNota = document.getElementById("inputNumeroNota");
const selectTrimestreNota = document.getElementById("selectTrimestreNota");
const estadoCargaSalon = document.getElementById("estadoCargaSalon");
const bloqueLeyendaMateria = document.getElementById("bloqueLeyendaMateria");
const textareaLeyendaMateria = document.getElementById("textareaLeyendaMateria");
const btnGuardarLeyenda = document.getElementById("btnGuardarLeyenda");
const estadoLeyenda = document.getElementById("estadoLeyenda");
const bloqueTablaNotas = document.getElementById("bloqueTablaNotas");
const cabeceraNotasGrupo = document.getElementById("cabeceraNotasGrupo");
const cabeceraTemasGrupo = document.getElementById("cabeceraTemasGrupo");
const tablaNotasGrupo = document.getElementById("tablaNotasGrupo");
const btnGuardarNotasGrupo = document.getElementById("btnGuardarNotasGrupo");
const estadoGuardadoNotas = document.getElementById("estadoGuardadoNotas");
const avisoSinAsignaciones = document.getElementById("avisoSinAsignaciones");
const listaChecksColumnas = document.getElementById("listaChecksColumnas");
const btnColumnasSeleccionarTodas = document.getElementById("btnColumnasSeleccionarTodas");
const btnColumnasSeleccionarNinguna = document.getElementById("btnColumnasSeleccionarNinguna");
const btnOcultarColumnasCompletas = document.getElementById("btnOcultarColumnasCompletas");
const btnToggleFiltroEstudiantes = document.getElementById("btnToggleFiltroEstudiantes");
const bloqueFiltroEstudiantes = document.getElementById("bloqueFiltroEstudiantes");
const listaChecksEstudiantes = document.getElementById("listaChecksEstudiantes");
const btnEstudiantesSeleccionarTodos = document.getElementById("btnEstudiantesSeleccionarTodos");
const btnEstudiantesSeleccionarNinguno = document.getElementById("btnEstudiantesSeleccionarNinguno");
const btnExportarPdf = document.getElementById("btnExportarPdf");
const btnExportarJpg = document.getElementById("btnExportarJpg");

// ---------------------------------------------------------------
// "Chips" (botoncitos con gancho) para elegir Salón / Materia en vez
// de un <select> tradicional: se ve toda la lista de una vez y se
// elige tocando encima. Solo una opción activa a la vez (no es
// selección múltiple); por debajo se sigue usando el <select> oculto
// para no tener que tocar el resto de la lógica de la página.
// ---------------------------------------------------------------
function renderizarChips(select, contenedorId) {
    const contenedor = document.getElementById(contenedorId);
    if (!contenedor) return;

    const opciones = Array.from(select.options).filter((o) => o.value !== "");

    if (select.disabled || opciones.length === 0) {
        const textoVacio = select.options[0]?.textContent || "";
        contenedor.innerHTML = `<span class="small text-muted">${escapeHtml(textoVacio)}</span>`;
        return;
    }

    contenedor.innerHTML = opciones.map((o) => {
        const activa = o.value === select.value;
        return `<button type="button" class="chip-opcion ${activa ? "chip-opcion-activa" : ""}" data-valor="${escapeHtml(o.value)}">
            ${activa ? "✅" : "⬜"} ${escapeHtml(o.textContent)}
        </button>`;
    }).join("");

    contenedor.querySelectorAll(".chip-opcion").forEach((btn) => {
        btn.addEventListener("click", () => {
            if (select.value === btn.dataset.valor) return;
            select.value = btn.dataset.valor;
            select.dispatchEvent(new Event("change"));
        });
    });
}

function poblarSelectSalon() {
    const salones = [...new Set(misAsignaciones.map((a) => a.salon))].sort();

    if (salones.length === 0) {
        selectSalonNota.innerHTML = `<option value="">No tienes salones asignados</option>`;
        selectSalonNota.disabled = true;
        avisoSinAsignaciones.style.display = "block";
        renderizarChips(selectSalonNota, "chipsSalonNota");
        return;
    }

    avisoSinAsignaciones.style.display = "none";
    selectSalonNota.innerHTML =
        `<option value="">Seleccione un salón</option>` +
        salones.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
    selectSalonNota.disabled = false;
    renderizarChips(selectSalonNota, "chipsSalonNota");
}

function poblarSelectMateria() {
    const salon = selectSalonNota.value;

    if (!salon) {
        selectMateriaNota.innerHTML = `<option value="">Seleccione primero un salón</option>`;
        selectMateriaNota.disabled = true;
        renderizarChips(selectMateriaNota, "chipsMateriaNota");
        if (bloqueTablaNotas) bloqueTablaNotas.style.display = "none";
        grupoActual = [];
        return;
    }

    const materias = misAsignaciones
        .filter((a) => a.salon === salon)
        .map((a) => a.materia);

    // Si el/la docente solo tiene UNA materia asignada en este salón, no
    // tiene sentido hacerla elegir: la seleccionamos sola y directamente
    // disparamos la carga del salón (como si hubiera dado clic en
    // "Cargar salón"). Si hay varias, se deja el comportamiento normal
    // de elegir manualmente.
    if (materias.length === 1) {
        selectMateriaNota.innerHTML =
            `<option value="${escapeHtml(materias[0])}" selected>${escapeHtml(materias[0])}</option>`;
        selectMateriaNota.disabled = false;
        renderizarChips(selectMateriaNota, "chipsMateriaNota");
        cargarSalon();
        return;
    }

    // Si hay varias materias, todavía no sabemos cuál quiere el docente:
    // ocultamos la tabla (que puede seguir mostrando el salón/materia
    // anterior) para no dar la falsa impresión de que ya está viendo
    // este salón, hasta que elija la materia con un clic.
    if (bloqueTablaNotas) bloqueTablaNotas.style.display = "none";
    grupoActual = [];

    selectMateriaNota.innerHTML =
        `<option value="">Seleccione una materia</option>` +
        materias.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
    selectMateriaNota.disabled = false;
    renderizarChips(selectMateriaNota, "chipsMateriaNota");
}

selectSalonNota?.addEventListener("change", () => {
    renderizarChips(selectSalonNota, "chipsSalonNota");
    poblarSelectMateria();
});

// Si hay varias materias en el salón elegido, el/la docente las elige a
// mano; en cuanto elige una, cargamos el salón solos (ya no hace falta
// un botón "Cargar salón").
selectMateriaNota?.addEventListener("change", () => {
    renderizarChips(selectMateriaNota, "chipsMateriaNota");
    if (selectSalonNota.value && selectMateriaNota.value) cargarSalon();
});

// Cambiar el trimestre (con salón y materia ya elegidos) también debe
// recargar solo, porque cambia qué notas se muestran.
selectTrimestreNota?.addEventListener("change", () => {
    if (selectSalonNota.value && selectMateriaNota.value) cargarSalon();
});

// =========================================================
// 3) TABLA DE ESTUDIANTES CON NOTAS EDITABLES (misma lógica del admin)
// =========================================================

let grupoActual = [];
let historiaPorEstudiante = {};
let casillasTabla = [];
let temasCasillasBD = {};
// Casillas (Aprec. 1/2/3, Ejer., Exam., etc. — NO incluye Aprec. 4+) que
// el docente marcó con candado 🔒 porque ya no las va a modificar. Se
// guarda en temas_casillas.bloqueada, igual que el tema de cada casilla.
// Mientras una casilla está bloqueada: sus inputs de nota quedan
// deshabilitados (no se pueden editar ni borrar por accidente) y su
// botón de basura 🗑️ se oculta.
let casillasBloqueadas = new Set();
// Se pone en true justo antes de llamar a renderTabla() SOLO cuando el
// docente presionó el botón "➕" de agregar columna. renderTabla() la usa
// una única vez (y la vuelve a poner en false) para decidir si debe crear
// la columna vacía "lista para escribir". Así, cualquier otro renderTabla()
// (por ejemplo el que sigue a eliminar una columna) no crea una columna
// nueva por su cuenta.
let agregarColumnaVaciaSolicitada = false;
// { 4: {estado:"activa", modo:null}, 5: {estado:"bloqueada", modo:null}, ... }
// Solo para Aprec. 4 en adelante. Aprec. 1, 2 y 3 nunca aparecen aquí:
// siguen funcionando exactamente igual que antes, sin pasar por este
// sistema nuevo.
let estadoApreciacionesNuevas = {};

// Antes esta función usaba el correo como identificador cuando el
// estudiante tenía cuenta, y el id solo cuando no tenía. El problema:
// si a un estudiante le quitaban la cuenta después, sus notas viejas
// (guardadas bajo ese correo) quedaban "huérfanas" y dejaban de
// aparecer, aunque seguían intactas en la base de datos. Para evitar
// que esto vuelva a pasar, ahora usamos SIEMPRE el id del estudiante
// (que nunca cambia) como identificador único, sin importar si tiene
// o no cuenta.
function claveEstudiante(est) {
    return `id:${est.id}`;
}

// Cuántos estudiantes ya tienen una nota guardada (no vacía) en esta
// casilla. Se usa para reforzar la confirmación antes de eliminarla.
function contarNotasEnCasilla(tipo, numero) {
    const clave = claveCasilla(tipo, numero);
    let total = 0;
    for (const claveEst in historiaPorEstudiante) {
        const nota = historiaPorEstudiante[claveEst][clave];
        if (nota && nota.nota !== null && nota.nota !== undefined && nota.nota !== "") total++;
    }
    return total;
}

// Confirmación antes de mandar una casilla a la papelera. Si la casilla
// ya tiene más de 10 notas guardadas, se pide una segunda confirmación
// explícita, para que no se borre por accidente una columna con mucho
// trabajo ya cargado.
function confirmarEliminarColumna(tipo, numero) {
    const salon = selectSalonNota.value;
    const materia = selectMateriaNota.value;
    const etiqueta = etiquetaCasilla(tipo, numero);

    if (!confirm(`¿Enviar la casilla "${etiqueta}" (${materia} - ${salon}) a la papelera?\n\nLas notas no se pierden: quedan guardadas en la papelera y puedes restaurarlas cuando quieras.`)) return false;

    const cantidadNotas = contarNotasEnCasilla(tipo, numero);
    if (cantidadNotas > 10) {
        return confirm(`⚠️ La casilla "${etiqueta}" ya tiene ${cantidadNotas} notas registradas.\n\n¿Estás seguro/a de que deseas eliminarla?`);
    }
    return true;
}

function obtenerTemaCasilla(tipo, numero) {
    const clave = claveCasilla(tipo, numero);
    if (temasCasillasBD[clave]) return temasCasillasBD[clave];

    for (const claveEst in historiaPorEstudiante) {
        const nota = historiaPorEstudiante[claveEst][clave];
        if (nota && nota.tema) return nota.tema;
    }
    return "";
}

async function actualizarTemaCasilla(tipo, numero, nuevoTema) {
    const salon = selectSalonNota.value;
    const materia = selectMateriaNota.value;
    const trimestre = selectTrimestreNota.value;
    const valorGuardar = nuevoTema || null;

    const { error } = await supabase
        .from("temas_casillas")
        .upsert(
            { salon, materia, trimestre, tipo, numero, tema: valorGuardar, updated_at: new Date().toISOString() },
            { onConflict: "salon,materia,trimestre,tipo,numero" }
        );

    if (error) {
        console.error("❌ Error al guardar el tema:", error);
        estadoGuardadoNotas.textContent = `⚠️ No se pudo guardar el tema de ${etiquetaCasilla(tipo, numero)}.`;
        estadoGuardadoNotas.className = "small text-danger";
        return;
    }

    temasCasillasBD[claveCasilla(tipo, numero)] = valorGuardar || "";

    const correos = grupoActual.map((e) => e.correo).filter(Boolean);
    const idsSinCuenta = grupoActual.filter((e) => !e.correo).map((e) => e.id);

    if (correos.length > 0) {
        await supabase.from("notas").update({ tema: valorGuardar })
            .eq("materia", materia).eq("trimestre", trimestre).eq("tipo", tipo).eq("numero", numero)
            .in("correo", correos);
    }
    if (idsSinCuenta.length > 0) {
        await supabase.from("notas").update({ tema: valorGuardar })
            .eq("materia", materia).eq("trimestre", trimestre).eq("tipo", tipo).eq("numero", numero)
            .in("estudiante_id", idsSinCuenta);
    }

    estadoGuardadoNotas.textContent = `✅ Tema de "${etiquetaCasilla(tipo, numero)}" actualizado.`;
    estadoGuardadoNotas.className = "small text-success";
}

// Pone o quita el candado 🔒 de una casilla (Aprec. 1/2/3, Ejer., Exam.,
// etc.). Se guarda en temas_casillas para que quede así aunque el
// docente recargue la página o entre desde otro salón con la misma
// materia/trimestre.
async function alternarBloqueoCasilla(tipo, numero) {
    const salon = selectSalonNota.value;
    const materia = selectMateriaNota.value;
    const trimestre = selectTrimestreNota.value;
    const clave = claveCasilla(tipo, numero);
    const nuevoValor = !casillasBloqueadas.has(clave);

    const { error } = await supabase
        .from("temas_casillas")
        .upsert(
            { salon, materia, trimestre, tipo, numero, tema: temasCasillasBD[clave] || null, bloqueada: nuevoValor, updated_at: new Date().toISOString() },
            { onConflict: "salon,materia,trimestre,tipo,numero" }
        );

    if (error) {
        console.error("❌ Error al cambiar el candado:", error);
        estadoGuardadoNotas.textContent = `⚠️ No se pudo ${nuevoValor ? "bloquear" : "desbloquear"} ${etiquetaCasilla(tipo, numero)}.`;
        estadoGuardadoNotas.className = "small text-danger";
        return;
    }

    if (nuevoValor) casillasBloqueadas.add(clave); else casillasBloqueadas.delete(clave);

    estadoGuardadoNotas.textContent = nuevoValor
        ? `🔒 ${etiquetaCasilla(tipo, numero)} bloqueada. Ya no se puede editar ni borrar.`
        : `🔓 ${etiquetaCasilla(tipo, numero)} desbloqueada.`;
    estadoGuardadoNotas.className = "small text-success";
    renderTabla();
}

// Hace el borrado suave de la casilla sin pedir confirmación. Separada
// de eliminarColumnaCasilla() para que quien la llame (el botón 🗑️ de
// la tabla) pueda controlar el orden exacto entre "confirmar" y
// "actualizar el resto de la UI".
async function eliminarColumnaCasillaInterno(tipo, numero) {
    const salon = selectSalonNota.value;
    const materia = selectMateriaNota.value;
    const trimestre = selectTrimestreNota.value;
    const etiqueta = etiquetaCasilla(tipo, numero);

    // Si la casilla que se está borrando es justo la "casilla activa"
    // (Tipo + Número guardados en los campos ocultos, que es la que el
    // botón ➕ usa como "próxima lista para escribir"), hay que moverla
    // ANTES de recargar el salón. Si no, cargarSalon() la vuelve a crear
    // vacía de inmediato porque siempre deja lista la casilla activa
    // para escribir. Importante: cuando la casilla borrada es la de
    // mayor número de su Tipo (el caso más común), "el siguiente número
    // libre" calculado a partir de lo que queda da ese MISMO número que
    // se acaba de borrar (porque al quitarla, ese número vuelve a estar
    // libre) — por eso simplemente usamos número+1, que nunca puede
    // coincidir con el que se está eliminando.
    const claveBorrada = claveCasilla(tipo, numero);
    if (selectTipoNota && inputNumeroNota &&
        claveCasilla(selectTipoNota.value, parseInt(inputNumeroNota.value, 10)) === claveBorrada) {
        inputNumeroNota.value = String(numero + 1);
    }

    const ahora = new Date().toISOString();

    // No se borra nada de verdad: se marca como eliminado (borrado
    // suave), así queda disponible para restaurar desde la papelera.
    await supabase.from("notas")
        .update({ eliminado_en: ahora, eliminado_por: correoProfesor })
        .eq("materia", materia).eq("trimestre", trimestre).eq("tipo", tipo).eq("numero", numero)
        .is("eliminado_en", null);
    await supabase.from("temas_casillas")
        .update({ eliminado_en: ahora, eliminado_por: correoProfesor })
        .eq("salon", salon).eq("materia", materia).eq("trimestre", trimestre).eq("tipo", tipo).eq("numero", numero)
        .is("eliminado_en", null);

    estadoGuardadoNotas.innerHTML = `🗑️ Casilla ${escapeHtml(etiqueta)} movida a la papelera.
        <button type="button" id="btnDeshacerEliminarCasilla" class="btn btn-link btn-sm p-0 ms-2" style="text-decoration:underline;">↩️ Deshacer</button>`;
    estadoGuardadoNotas.className = "small text-success";

    // El botón "Deshacer" solo sirve mientras siga siendo el aviso
    // vigente: si el docente hace otra acción que reemplace este
    // mensaje, el botón ya no está en pantalla y no hay confusión
    // sobre a cuál casilla restauraría.
    document.getElementById("btnDeshacerEliminarCasilla")?.addEventListener("click", async () => {
        await restaurarCasilla(tipo, numero);
        estadoGuardadoNotas.textContent = `✅ Casilla ${etiqueta} restaurada.`;
        estadoGuardadoNotas.className = "small text-success";
        cargarSalon();
    });

    cargarSalon();
}

async function eliminarColumnaCasilla(tipo, numero) {
    if (!confirmarEliminarColumna(tipo, numero)) return;

    await eliminarColumnaCasillaInterno(tipo, numero);
}

// =========================================================
// 3.1) PAPELERA DE RECICLAJE (casillas eliminadas, restaurables)
// =========================================================

const btnPapelera = document.getElementById("btnPapelera");
const panelPapelera = document.getElementById("panelPapelera");
const listaPapelera = document.getElementById("listaPapelera");
const estadoPapelera = document.getElementById("estadoPapelera");

function formatearFechaPapelera(iso) {
    if (!iso) return "";
    try {
        return new Date(iso).toLocaleString("es-PA", {
            year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
        });
    } catch {
        return iso;
    }
}

async function cargarPapelera() {
    const salon = selectSalonNota.value;
    const materia = selectMateriaNota.value;
    const trimestre = selectTrimestreNota.value;

    if (!salon || !materia) {
        listaPapelera.innerHTML = `<p class="small text-muted">Primero carga un salón y materia.</p>`;
        return;
    }

    listaPapelera.innerHTML = `<p class="small text-muted">Cargando papelera...</p>`;

    // Fuente 1: casillas eliminadas registradas en temas_casillas
    // (siempre tienen salon, así que son la fuente más confiable).
    const { data: temasEliminados } = await supabase
        .from("temas_casillas")
        .select("tipo, numero, tema, eliminado_en, eliminado_por")
        .eq("salon", salon).eq("materia", materia).eq("trimestre", trimestre)
        .not("eliminado_en", "is", null);

    // Fuente 2: casillas eliminadas que solo existen en "notas" (por si
    // nunca se les puso un "tema" y por eso no dejaron fila en
    // temas_casillas). Se busca entre los estudiantes de este salón.
    const correos = grupoActual.map((e) => e.correo).filter(Boolean);
    const idsSinCuenta = grupoActual.filter((e) => !e.correo).map((e) => e.id);

    const combinadas = new Map();
    (temasEliminados || []).forEach((t) => {
        combinadas.set(claveCasilla(t.tipo, t.numero), {
            tipo: t.tipo, numero: t.numero, tema: t.tema || "",
            eliminado_en: t.eliminado_en, eliminado_por: t.eliminado_por,
        });
    });

    async function agregarDesdeNotas(filtroCol, valores) {
        if (!valores.length) return;
        const { data } = await supabase.from("notas")
            .select("tipo, numero, tema, eliminado_en, eliminado_por")
            .eq("materia", materia).eq("trimestre", trimestre)
            .not("eliminado_en", "is", null)
            .in(filtroCol, valores);
        (data || []).forEach((n) => {
            const clave = claveCasilla(n.tipo, n.numero);
            if (!combinadas.has(clave)) {
                combinadas.set(clave, {
                    tipo: n.tipo, numero: n.numero, tema: n.tema || "",
                    eliminado_en: n.eliminado_en, eliminado_por: n.eliminado_por,
                });
            }
        });
    }
    await agregarDesdeNotas("correo", correos);
    await agregarDesdeNotas("estudiante_id", idsSinCuenta);

    const lista = [...combinadas.values()];
    ordenarCasillas(lista);

    if (lista.length === 0) {
        listaPapelera.innerHTML = `<p class="small text-muted">La papelera está vacía para este salón/materia/trimestre.</p>`;
        return;
    }

    listaPapelera.innerHTML = `
        <table class="table table-sm">
            <thead>
                <tr><th>Casilla</th><th>Tema</th><th>Eliminada</th><th>Por</th><th></th></tr>
            </thead>
            <tbody>
                ${lista.map((c) => `
                    <tr>
                        <td>${escapeHtml(etiquetaCasilla(c.tipo, c.numero))}</td>
                        <td>${escapeHtml(c.tema || "—")}</td>
                        <td class="small text-muted">${escapeHtml(formatearFechaPapelera(c.eliminado_en))}</td>
                        <td class="small text-muted">${escapeHtml(c.eliminado_por || "—")}</td>
                        <td>
                            <button type="button" class="btn btn-sm btn-outline-success btn-restaurar-casilla"
                                data-tipo="${c.tipo}" data-numero="${c.numero}">♻️ Restaurar</button>
                        </td>
                    </tr>`).join("")}
            </tbody>
        </table>`;

    listaPapelera.querySelectorAll(".btn-restaurar-casilla").forEach((btn) => {
        btn.addEventListener("click", () => restaurarCasilla(btn.dataset.tipo, parseInt(btn.dataset.numero, 10)));
    });
}

async function restaurarCasilla(tipo, numero) {
    const salon = selectSalonNota.value;
    const materia = selectMateriaNota.value;
    const trimestre = selectTrimestreNota.value;
    const etiqueta = etiquetaCasilla(tipo, numero);

    await supabase.from("notas")
        .update({ eliminado_en: null, eliminado_por: null })
        .eq("materia", materia).eq("trimestre", trimestre).eq("tipo", tipo).eq("numero", numero)
        .not("eliminado_en", "is", null);
    await supabase.from("temas_casillas")
        .update({ eliminado_en: null, eliminado_por: null })
        .eq("salon", salon).eq("materia", materia).eq("trimestre", trimestre).eq("tipo", tipo).eq("numero", numero)
        .not("eliminado_en", "is", null);

    if (estadoPapelera) {
        estadoPapelera.textContent = `✅ Casilla "${etiqueta}" restaurada.`;
        estadoPapelera.className = "small text-success";
    }

    await cargarPapelera();
    cargarSalon();
}

btnGuardarLeyenda?.addEventListener("click", async () => {
    const salon = selectSalonNota.value;
    const materia = selectMateriaNota.value;
    if (!salon || !materia) return;

    btnGuardarLeyenda.disabled = true;
    if (estadoLeyenda) { estadoLeyenda.textContent = "Guardando..."; estadoLeyenda.className = "small text-muted"; }

    const resultado = await guardarLeyendaMateria(salon, materia, textareaLeyendaMateria.value);

    btnGuardarLeyenda.disabled = false;
    if (!resultado.ok) {
        if (estadoLeyenda) { estadoLeyenda.textContent = "❌ No se pudo guardar."; estadoLeyenda.className = "small text-danger"; }
        return;
    }
    if (estadoLeyenda) { estadoLeyenda.textContent = "✅ Guardado. Ya aparece en la consulta de notas."; estadoLeyenda.className = "small text-success"; }
});

btnPapelera?.addEventListener("click", () => {
    const abrir = panelPapelera.style.display === "none";
    panelPapelera.style.display = abrir ? "block" : "none";
    if (abrir) cargarPapelera();
});

// A cuánto tiene que cambiar el promedio entre la primera mitad y la
// segunda mitad de las notas de un estudiante para considerarse que
// "mejoró" o "bajó su rendimiento" (y no solo una variación normal).
const UMBRAL_TENDENCIA = 0.4;

// Compara la primera mitad de las notas del estudiante (en el orden de
// casillasTabla, que va de la casilla más vieja a la más nueva de cada
// Tipo) contra la segunda mitad, para saber si viene mejorando o
// bajando. Devuelve "mejoro", "bajo" o "estable"; null si no hay
// suficientes notas todavía para comparar.
function calcularTendenciaEstudiante(historial, valoresEnPantalla) {
    const valores = [];
    casillasTabla.forEach((c) => {
        const clave = claveCasilla(c.tipo, c.numero);
        let valorStr;
        if (clave in valoresEnPantalla) {
            valorStr = valoresEnPantalla[clave];
        } else {
            const n = historial[clave];
            valorStr = (n && n.nota !== null && n.nota !== undefined) ? String(n.nota) : "";
        }
        if (valorStr === "") return;
        const num = parseFloat(valorStr);
        if (!isNaN(num)) valores.push(num);
    });

    if (valores.length < 2) return null;

    const mitad = Math.ceil(valores.length / 2);
    const primeraParte = valores.slice(0, mitad);
    const segundaParte = valores.slice(mitad);
    if (segundaParte.length === 0) return null;

    const promPrimera = primeraParte.reduce((a, b) => a + b, 0) / primeraParte.length;
    const promSegunda = segundaParte.reduce((a, b) => a + b, 0) / segundaParte.length;
    const diferencia = promSegunda - promPrimera;

    if (diferencia >= UMBRAL_TENDENCIA) return "mejoro";
    if (diferencia <= -UMBRAL_TENDENCIA) return "bajo";
    return "estable";
}

// Valor actual de una casilla para una fila (estudiante): usa lo que
// está escrito en pantalla ahora mismo si esa columna está visible, o
// el último valor guardado si la columna está oculta. Igual lógica que
// recalcularPromedios(), pero para una sola casilla.
function obtenerValorCasillaFila(tr, historial, c) {
    const input = tr.querySelector(`.input-nota-grupo[data-tipo="${c.tipo}"][data-numero="${c.numero}"]`);
    if (input) {
        const v = input.value.trim();
        return v === "" ? null : parseFloat(v);
    }
    const n = historial[claveCasilla(c.tipo, c.numero)];
    if (n && n.nota !== null && n.nota !== undefined) return parseFloat(n.nota);
    return null;
}

const ETIQUETA_CATEGORIA_DETALLE = { apreciacion: "Apreciación", ejercicio: "Ejercicio", examen: "Examen" };

// Arma el desglose (qué casillas y con qué nota) de una categoría para
// un estudiante, y devuelve tanto el texto listo para mostrar como el
// promedio numérico (para poder combinarlos en el detalle de "Final").
function calcularBloqueDetalle(tr, historial, tipo) {
    const etiquetaCat = ETIQUETA_CATEGORIA_DETALLE[tipo] || tipo;
    const items = casillasTabla
        .filter((c) => c.tipo === tipo)
        .map((c) => ({ etiqueta: etiquetaCasilla(c.tipo, c.numero), valor: obtenerValorCasillaFila(tr, historial, c) }))
        .filter((it) => it.valor !== null && !isNaN(it.valor));

    if (items.length === 0) return { texto: `${etiquetaCat}: sin notas todavía.`, promedio: null };

    const promedio = items.reduce((a, b) => a + b.valor, 0) / items.length;
    const detalle = items.map((it) => `   • ${it.etiqueta}: ${it.valor.toFixed(1)}`).join("\n");
    return { texto: `${etiquetaCat} (promedio ${promedio.toFixed(1)}):\n${detalle}`, promedio };
}

// Botón "ver detalle" en las celdas de Prom. Aprec./Ejer./Examen/Final:
// muestra de dónde sale exactamente esa nota para ese estudiante.
function mostrarDetallePromedio(tr, categoria) {
    const historial = historiaPorEstudiante[tr.dataset.claveEstudiante] || {};
    const nombreEst = tr.querySelector(".col-fija-nombre")?.textContent?.trim() || "Estudiante";

    if (categoria === "final") {
        const bApr = calcularBloqueDetalle(tr, historial, "apreciacion");
        const bEje = calcularBloqueDetalle(tr, historial, "ejercicio");
        const bExa = calcularBloqueDetalle(tr, historial, "examen");
        const presentes = [bApr.promedio, bEje.promedio, bExa.promedio].filter((v) => v !== null);
        const promFinal = presentes.length ? presentes.reduce((a, b) => a + b, 0) / presentes.length : null;
        alert(
            `${nombreEst} — cómo salió la Nota Final\n\n${bApr.texto}\n\n${bEje.texto}\n\n${bExa.texto}\n\n` +
            `Nota Final = promedio de las categorías que sí tienen notas = ${promFinal !== null ? promFinal.toFixed(1) : "–"}`
        );
        return;
    }

    const bloque = calcularBloqueDetalle(tr, historial, categoria);
    alert(`${nombreEst} — cómo salió ${ETIQUETA_CATEGORIA_DETALLE[categoria] || categoria}\n\n${bloque.texto}`);
}

function recalcularPromedios() {
    // Los promedios se calculan usando TODAS las casillas que existen
    // (casillasTabla), no solo las que están visibles en pantalla en
    // este momento. Para las casillas visibles usamos el valor que el
    // docente tiene escrito ahora mismo (aunque no lo haya guardado
    // todavía); para las que están ocultas, usamos el último valor
    // guardado en la base de datos. Así el resumen de promedios
    // funciona igual de bien con cualquier combinación de columnas
    // visibles/ocultas.
    tablaNotasGrupo.querySelectorAll("tr[data-clave-estudiante]").forEach((tr) => {
        const historial = historiaPorEstudiante[tr.dataset.claveEstudiante] || {};

        const valoresEnPantalla = {};
        tr.querySelectorAll(".input-nota-grupo").forEach((input) => {
            valoresEnPantalla[claveCasilla(input.dataset.tipo, parseInt(input.dataset.numero, 10))] = input.value.trim();
        });

        const apr = [], eje = [], exa = [];
        casillasTabla.forEach((c) => {
            const clave = claveCasilla(c.tipo, c.numero);
            let valorStr;
            if (clave in valoresEnPantalla) {
                valorStr = valoresEnPantalla[clave];
            } else {
                const n = historial[clave];
                valorStr = (n && n.nota !== null && n.nota !== undefined) ? String(n.nota) : "";
            }
            if (valorStr === "") return;
            const num = parseFloat(valorStr);
            if (isNaN(num)) return;
            if (c.tipo === "apreciacion") apr.push(num);
            else if (c.tipo === "examen") exa.push(num);
            else eje.push(num);
        });

        const promApr = apr.length ? apr.reduce((a, b) => a + b, 0) / apr.length : null;
        const promEje = eje.length ? eje.reduce((a, b) => a + b, 0) / eje.length : null;
        const promExa = exa.length ? exa.reduce((a, b) => a + b, 0) / exa.length : null;

        // Promedio final = promedio de las categorías que sí tengan datos
        // (Apreciación, Ejercicio, Examen), cada una con el mismo peso.
        const presentes = [promApr, promEje, promExa].filter((v) => v !== null);
        const promFinal = presentes.length ? presentes.reduce((a, b) => a + b, 0) / presentes.length : null;

        const cApr = tr.querySelector(".celda-prom-apr");
        const cEje = tr.querySelector(".celda-prom-eje");
        const cExa = tr.querySelector(".celda-prom-examen");
        const cFinal = tr.querySelector(".celda-prom-final");

        const pintar = (celda, valor) => {
            if (!celda) return;
            celda.textContent = valor !== null ? valor.toFixed(1) : "–";
            const enRiesgo = valor !== null && valor < PROMEDIO_MINIMO_APROBAR;
            celda.classList.toggle("text-danger", enRiesgo);
        };
        pintar(cApr, promApr);
        pintar(cEje, promEje);
        pintar(cExa, promExa);
        pintar(cFinal, promFinal);

        // Resaltado del estudiante: "en peligro" (nota final por debajo de
        // 3.0) manda sobre todo lo demás; si no está en peligro, se marca
        // si viene mejorando o bajando su rendimiento comparando la
        // primera mitad de sus notas contra la segunda mitad.
        const enRiesgoFinal = promFinal !== null && promFinal < PROMEDIO_MINIMO_APROBAR;
        const tendencia = enRiesgoFinal ? null : calcularTendenciaEstudiante(historial, valoresEnPantalla);

        tr.classList.toggle("table-danger", enRiesgoFinal);
        tr.classList.toggle("fila-mejora", tendencia === "mejoro");
        tr.classList.toggle("fila-bajada", tendencia === "bajo");

        const badge = tr.querySelector(".badge-tendencia");
        if (badge) {
            if (enRiesgoFinal) {
                badge.innerHTML = ' <span class="badge bg-danger">⚠️ En peligro</span>';
            } else if (tendencia === "mejoro") {
                badge.innerHTML = ' <span class="badge bg-success">📈 Mejoró</span>';
            } else if (tendencia === "bajo") {
                badge.innerHTML = ' <span class="badge bg-warning text-dark">📉 Bajó</span>';
            } else {
                badge.innerHTML = "";
            }
        }
    });
}

// "actual" = solo la casilla seleccionada arriba. "todas" = todas las
// columnas juntas. "manual" = el docente eligió a mano cuáles columnas
// quiere ver (por ejemplo, solo Ejer. 4 y Ejer. 6).
// quiere ver (por ejemplo, solo Ejer. 4 y Ejer. 6, o solo los
// promedios). Empieza vacío: por defecto TODO está visible (nada
// oculto) hasta que el docente desmarque algo.
let columnasOcultas = new Set();

// Claves reservadas para las 4 columnas de promedio, que ahora también
// se eligen desde la misma lista de checkboxes que las casillas de nota.
const CLAVE_PROM_APREC = "__prom_aprec__";
const CLAVE_PROM_EJER = "__prom_ejer__";
const CLAVE_PROM_EXAMEN = "__prom_examen__";
const CLAVE_PROM_FINAL = "__prom_final__";
// Columna fija "#" (el número de fila): también se puede ocultar desde el
// mismo panel de checkboxes, igual que cualquier otra columna.
const CLAVE_COL_NUMERO = "__col_numero__";
const COLUMNA_NUMERO_SELECCIONABLE = { clave: CLAVE_COL_NUMERO, etiqueta: "# (número)" };
const PROMEDIOS_SELECCIONABLES = [
    { clave: CLAVE_PROM_APREC, etiqueta: "Prom. Aprec." },
    { clave: CLAVE_PROM_EJER, etiqueta: "Prom. Ejer." },
    { clave: CLAVE_PROM_EXAMEN, etiqueta: "Prom. Examen" },
    { clave: CLAVE_PROM_FINAL, etiqueta: "Prom. Final" },
];

function renderizarListaChecksColumnas() {
    if (!listaChecksColumnas) return;

    const itemsCasillas = casillasTabla.map((c) => ({
        clave: claveCasilla(c.tipo, c.numero),
        etiqueta: etiquetaCasilla(c.tipo, c.numero),
    }));
    const todosLosItems = [COLUMNA_NUMERO_SELECCIONABLE, ...itemsCasillas, ...PROMEDIOS_SELECCIONABLES];

    listaChecksColumnas.innerHTML = todosLosItems.map(({ clave, etiqueta }) => {
        const marcado = !columnasOcultas.has(clave);
        return `
            <label class="form-check" style="display:flex; align-items:center; gap:4px; margin:0;">
                <input type="checkbox" class="form-check-input check-columna-manual" data-clave="${clave}" ${marcado ? "checked" : ""} style="margin:0;">
                <span class="small">${etiqueta}</span>
            </label>`;
    }).join("");

    listaChecksColumnas.querySelectorAll(".check-columna-manual").forEach((chk) => {
        chk.addEventListener("change", () => {
            const clave = chk.dataset.clave;
            if (chk.checked) columnasOcultas.delete(clave);
            else columnasOcultas.add(clave);
            renderTabla();
        });
    });
}

btnColumnasSeleccionarTodas?.addEventListener("click", () => {
    columnasOcultas.clear();
    renderizarListaChecksColumnas();
    renderTabla();
});

btnColumnasSeleccionarNinguna?.addEventListener("click", () => {
    casillasTabla.forEach((c) => columnasOcultas.add(claveCasilla(c.tipo, c.numero)));
    PROMEDIOS_SELECCIONABLES.forEach((p) => columnasOcultas.add(p.clave));
    columnasOcultas.add(CLAVE_COL_NUMERO);
    renderizarListaChecksColumnas();
    renderTabla();
});

// Oculta cada columna donde TODOS los estudiantes visibles ya tienen
// nota, dejando a la vista solo la(s) que todavía están vacías (o, en
// el caso de Aprec. 4+, las que no están "completada"). Así, después
// de elegir salón/materia, con un clic queda lista para seguir
// metiendo notas sin distraerse con lo que ya está lleno.
btnOcultarColumnasCompletas?.addEventListener("click", () => {
    const estudiantesVisibles = grupoActual.filter((est) => !estudiantesOcultos.has(claveEstudiante(est)));

    casillasTabla.forEach((c) => {
        const clave = claveCasilla(c.tipo, c.numero);

        if (c.tipo === "apreciacion" && c.numero >= 4) {
            const infoCol = estadoApreciacionesNuevas[c.numero];
            if (infoCol && infoCol.estado === "completada") columnasOcultas.add(clave);
            return;
        }

        const todosTienenNota = estudiantesVisibles.length > 0 && estudiantesVisibles.every((est) => {
            const n = (historiaPorEstudiante[claveEstudiante(est)] || {})[clave];
            return n && n.nota !== null && n.nota !== undefined && n.nota !== "";
        });
        if (todosTienenNota) columnasOcultas.add(clave);
    });

    renderizarListaChecksColumnas();
    renderTabla();
});

// =========================================================
// 3.2) FILTRO DE ESTUDIANTES (elegir a quiénes ver en la tabla)
// =========================================================
// Empieza vacío: por defecto se ven TODOS los estudiantes, hasta que
// el docente oculte a alguno a mano. Solo afecta lo que se ve en
// pantalla; el PDF/JPG (construirTablaReporteCompleta) siempre sale
// completo, con todos los estudiantes, como reporte formal.
let estudiantesOcultos = new Set();

function renderizarListaChecksEstudiantes() {
    if (!listaChecksEstudiantes) return;

    listaChecksEstudiantes.innerHTML = grupoActual.map((est) => {
        const clave = claveEstudiante(est);
        const marcado = !estudiantesOcultos.has(clave);
        return `
            <label class="form-check" style="display:flex; align-items:center; gap:4px; margin:0;">
                <input type="checkbox" class="form-check-input check-estudiante-manual" data-clave="${escapeHtml(clave)}" ${marcado ? "checked" : ""} style="margin:0;">
                <span class="small">${escapeHtml(est.nombre)}</span>
            </label>`;
    }).join("");

    listaChecksEstudiantes.querySelectorAll(".check-estudiante-manual").forEach((chk) => {
        chk.addEventListener("change", () => {
            const clave = chk.dataset.clave;
            if (chk.checked) estudiantesOcultos.delete(clave);
            else estudiantesOcultos.add(clave);
            renderTabla();
        });
    });
}

btnToggleFiltroEstudiantes?.addEventListener("click", () => {
    const abrir = bloqueFiltroEstudiantes.style.display === "none";
    bloqueFiltroEstudiantes.style.display = abrir ? "block" : "none";
    btnToggleFiltroEstudiantes.textContent = abrir ? "Ocultar filtro" : "Mostrar filtro";
    if (abrir) renderizarListaChecksEstudiantes();
});

btnEstudiantesSeleccionarTodos?.addEventListener("click", () => {
    estudiantesOcultos.clear();
    renderizarListaChecksEstudiantes();
    renderTabla();
});

btnEstudiantesSeleccionarNinguno?.addEventListener("click", () => {
    grupoActual.forEach((est) => estudiantesOcultos.add(claveEstudiante(est)));
    renderizarListaChecksEstudiantes();
    renderTabla();
});

function renderTabla() {
    const mostrarColNumero = !columnasOcultas.has(CLAVE_COL_NUMERO);
    // Cuando la columna "#" está oculta, la columna "Estudiante" pasa a
    // ocupar su lugar pegada al borde izquierdo (en vez de dejar el hueco).
    const styleColNombre = mostrarColNumero ? "" : ` style="left:0;"`;
    const thColNumero = mostrarColNumero ? `<th class="col-fija col-fija-num">#</th>` : "";

    if (grupoActual.length === 0) {
        cabeceraNotasGrupo.innerHTML = `${thColNumero}<th class="col-fija col-fija-nombre"${styleColNombre}>Estudiante</th>`;
        cabeceraTemasGrupo.innerHTML = "";
        tablaNotasGrupo.innerHTML = `<tr><td colspan="2" class="text-center text-muted py-3">Este salón aún no tiene estudiantes cargados.</td></tr>`;
        return;
    }

    const claveSel = claveCasilla(selectTipoNota.value, parseInt(inputNumeroNota.value, 10));

    // Si la casilla que el docente seleccionó arriba (Tipo + Número)
    // todavía no tiene ninguna nota guardada, normalmente NO la
    // agregamos como columna: solo lo hacemos cuando el docente la pidió
    // a propósito con el botón "➕", o cuando no hay ninguna otra
    // columna que mostrar (salón recién empezado). Así, después de
    // eliminar una columna no aparece otra automáticamente en su lugar.
    if (!casillasTabla.some((c) => claveCasilla(c.tipo, c.numero) === claveSel) &&
        (agregarColumnaVaciaSolicitada || casillasTabla.length === 0)) {
        casillasTabla.push({ tipo: selectTipoNota.value, numero: parseInt(inputNumeroNota.value, 10) });
        ordenarCasillas(casillasTabla);
    }
    agregarColumnaVaciaSolicitada = false;

    // Cada columna (de nota o de promedio) se muestra u oculta según lo
    // que el docente haya marcado en el panel "Elegir columnas para ver".
    const columnasVisibles = casillasTabla.filter((c) => !columnasOcultas.has(claveCasilla(c.tipo, c.numero)));
    const mostrarPromApr = !columnasOcultas.has(CLAVE_PROM_APREC);
    const mostrarPromEje = !columnasOcultas.has(CLAVE_PROM_EJER);
    const mostrarPromExa = !columnasOcultas.has(CLAVE_PROM_EXAMEN);
    const mostrarPromFinal = !columnasOcultas.has(CLAVE_PROM_FINAL);

    renderizarListaChecksColumnas();
    if (bloqueFiltroEstudiantes && bloqueFiltroEstudiantes.style.display !== "none") {
        renderizarListaChecksEstudiantes();
    }

    // Después de la última columna de cada Tipo (Aprec./Ejer./Exam.) se
    // intercala un marcador especial para dibujar ahí mismo un botón "+"
    // que agrega la siguiente casilla de ese Tipo. Se arma una sola vez
    // y se reutiliza en la cabecera, la fila de temas y cada fila de
    // estudiante, así las tres quedan siempre alineadas entre sí.
    const columnasConBoton = [];
    columnasVisibles.forEach((c, idx) => {
        columnasConBoton.push(c);
        const siguiente = columnasVisibles[idx + 1];
        if (!siguiente || siguiente.tipo !== c.tipo) {
            // Para Apreciación 4+, este "➕" ya no es solo la casilla
            // "lista para escribir" del sistema viejo: crea/activa la
            // siguiente Apreciación (numero+1) en apreciaciones_estado
            // (ver el manejador de .btn-agregar-columna más abajo).
            columnasConBoton.push({ tipo: c.tipo, numero: null, esBotonAgregar: true });
        }
    });
    // Índice de columna de nota "real" para cada posición (null en los
    // marcadores "+"); se usa para la navegación con flechas arriba/abajo.
    let contadorColNota = 0;
    const indicesColumna = columnasConBoton.map((c) => c.esBotonAgregar ? null : contadorColNota++);

    let htmlCabecera = `${thColNumero}<th class="col-fija col-fija-nombre"${styleColNombre}>Estudiante</th>`;
    columnasConBoton.forEach((c) => {
        if (c.esBotonAgregar) {
            htmlCabecera += `
                <th class="text-center" style="width:34px;">
                    <button type="button" class="btn btn-link btn-sm p-0 text-success btn-agregar-columna" data-tipo="${c.tipo}" title="Agregar otra columna de ${escapeHtml(ETIQUETAS_TIPO[c.tipo] || c.tipo)}">➕</button>
                </th>`;
            return;
        }
        if (c.tipo === "apreciacion" && c.numero >= 4) {
            const infoCol = estadoApreciacionesNuevas[c.numero] || { estado: "bloqueada", modo: null };
            const claveCas = claveCasilla(c.tipo, c.numero);
            // El encabezado siempre muestra "Aprec. N" de forma consecutiva
            // (1, 2, 3, 4, 5...), igual que Aprec. 1/2/3. El nombre de la
            // actividad (ej. "Clase 3", "Científico") que el docente escribe
            // en la casilla de "Tema" NO reemplaza este número — se ve
            // aparte, en la fila "Tema de cada casilla:" debajo del
            // encabezado, para que no se pierda la numeración consecutiva.
            const etiquetaMostrada = `Aprec. ${c.numero}`;
            // Candado 🔒 manual: el mismo mecanismo que ya usan Aprec.
            // 1/2/3, Ejer. y Exam. (se guarda en temas_casillas.bloqueada).
            // Solo tiene sentido ofrecerlo una vez que la columna existe
            // de verdad (activa o completada), no mientras está
            // "bloqueada" en el sentido de "todavía no le toca".
            const candadoManual = casillasBloqueadas.has(claveCas);
            const puedeCandado = infoCol.estado !== "bloqueada";
            const btnCandado = puedeCandado
                ? `<button type="button" class="btn btn-link btn-sm p-0 btn-bloquear-columna" data-tipo="${c.tipo}" data-numero="${c.numero}" style="color:${candadoManual ? "#fecaca" : "#c7d2fe"};" title="${candadoManual ? "Quitar candado (permitir editar de nuevo)" : "Poner candado (ya no la voy a modificar)"}">${candadoManual ? "🔓" : "🔒"}</button>`
                : "";
            if (infoCol.modo === "directo") {
                // Modo directo: se ve exactamente como una columna normal
                // (Aprec. 1, 2, 3), incluyendo el mismo botón de basura
                // (🗑️) para reiniciarla mientras esté activa.
                htmlCabecera += `
                    <th class="text-center small ${claveCas === claveSel ? "table-primary text-primary" : "text-muted"}" style="width:90px;">
                        <div>${candadoManual ? "🔒" : iconoApreciacion(infoCol.estado)} ${etiquetaMostrada}</div>
                        ${btnCandado}
                        ${(!candadoManual && infoCol.estado === "activa") ? `<button type="button" class="btn btn-link btn-sm p-0 text-danger btn-reiniciar-apreciacion" data-numero="${c.numero}" title="Eliminar por completo esta apreciación">🗑️</button>` : ""}
                    </th>`;
                return;
            }
            // OJO: el fondo del encabezado de toda la tabla ya es
            // indigo/morado (var(--color-primario)). Antes este texto se
            // pintaba con ESE MISMO color, así que quedaba invisible —
            // solo se veía el emoji de estado (los emojis no heredan el
            // "color" de CSS). Por eso "Aprec. 4" y "Aprec. 5" (o su
            // nombre personalizado) no se veían. Ahora usamos blanco
            // (igual que el resto de encabezados) o gris claro cuando
            // está bloqueada, que sí contrastan con el fondo morado.
            const colorTextoHeader = infoCol.estado === "bloqueada" ? "#c7d2fe" : "#fff";
            htmlCabecera += `
                <th class="text-center small" data-abrir-apreciacion-header="${c.numero}" data-estado-header="${infoCol.estado}" data-candado-manual="${candadoManual ? "1" : "0"}"
                    style="width:90px; min-width:90px; cursor:${(infoCol.estado === "bloqueada") ? "default" : "pointer"};">
                    <div class="fw-bold" style="color:${colorTextoHeader}; white-space:normal; line-height:1.15; word-break:keep-all;">
                        <span style="font-size:14px;">${candadoManual ? "🔒" : iconoApreciacion(infoCol.estado)}</span> ${etiquetaMostrada}
                    </div>
                    ${btnCandado}
                    ${(!candadoManual && infoCol.estado === "activa") ? `<button type="button" class="btn btn-link btn-sm p-0 text-danger btn-reiniciar-apreciacion" data-numero="${c.numero}" title="Eliminar por completo esta apreciación">🗑️</button>` : ""}
                </th>`;
            return;
        }
        const sel = claveCasilla(c.tipo, c.numero) === claveSel;
        const bloqueada = casillasBloqueadas.has(claveCasilla(c.tipo, c.numero));
        htmlCabecera += `
            <th class="text-center small ${bloqueada ? "text-muted" : (sel ? "table-primary text-primary" : "text-muted")}" style="width:90px;">
                <div>${bloqueada ? "🔒 " : ""}${etiquetaCasilla(c.tipo, c.numero)}</div>
                <button type="button" class="btn btn-link btn-sm p-0 ${bloqueada ? "text-secondary" : "text-muted"} btn-bloquear-columna" data-tipo="${c.tipo}" data-numero="${c.numero}" title="${bloqueada ? "Quitar candado (permitir editar de nuevo)" : "Poner candado (ya no la voy a modificar)"}">${bloqueada ? "🔓" : "🔒"}</button>
                ${bloqueada ? "" : `<button type="button" class="btn btn-link btn-sm p-0 text-danger btn-eliminar-columna" data-tipo="${c.tipo}" data-numero="${c.numero}" title="Eliminar esta columna">🗑️</button>`}
            </th>`;
    });
    if (mostrarPromApr) htmlCabecera += `<th class="text-center small fw-bold" style="width:85px;">Prom. Aprec.</th>`;
    if (mostrarPromEje) htmlCabecera += `<th class="text-center small fw-bold" style="width:85px;">Prom. Ejer.</th>`;
    if (mostrarPromExa) htmlCabecera += `<th class="text-center small fw-bold" style="width:85px;">Prom. Examen</th>`;
    if (mostrarPromFinal) htmlCabecera += `<th class="text-center small fw-bold table-success" style="width:90px;">Prom. Final</th>`;
    cabeceraNotasGrupo.innerHTML = htmlCabecera;

    let htmlTemas = `${mostrarColNumero ? `<th class="col-fija col-fija-num"></th>` : ""}<th class="col-fija col-fija-nombre small text-muted fw-normal"${styleColNombre}>Tema de cada casilla:</th>`;
    columnasConBoton.forEach((c) => {
        if (c.esBotonAgregar) {
            htmlTemas += `<th></th>`;
            return;
        }
        const tema = obtenerTemaCasilla(c.tipo, c.numero);
        const temaBloqueado = casillasBloqueadas.has(claveCasilla(c.tipo, c.numero));
        htmlTemas += `
            <th style="padding:2px 4px;">
                <input type="text" class="form-control form-control-sm input-tema-columna"
                    data-tipo="${c.tipo}" data-numero="${c.numero}" data-tema-guardado="${escapeHtml(tema)}"
                    value="${escapeHtml(tema)}" placeholder="Ej: Proyecto 2" style="font-size:11px; font-weight:normal;" ${temaBloqueado ? "disabled" : ""}>
            </th>`;
    });
    [mostrarPromApr, mostrarPromEje, mostrarPromExa, mostrarPromFinal].forEach((mostrar) => {
        if (mostrar) htmlTemas += `<th></th>`;
    });
    cabeceraTemasGrupo.innerHTML = htmlTemas;

    const estudiantesVisibles = grupoActual.filter((est) => !estudiantesOcultos.has(claveEstudiante(est)));

    tablaNotasGrupo.innerHTML = estudiantesVisibles.length === 0
        ? `<tr><td colspan="2" class="text-center text-muted py-3">No hay estudiantes seleccionados en el filtro de arriba.</td></tr>`
        : estudiantesVisibles.map((est, i) => {
        const sinCuenta = !est.correo;
        const historial = historiaPorEstudiante[claveEstudiante(est)] || {};

        const columnas = columnasConBoton.map((c, pos) => {
            if (c.esBotonAgregar) return `<td></td>`;
            const claveCas = claveCasilla(c.tipo, c.numero);

            if (c.tipo === "apreciacion" && c.numero >= 4) {
                const infoCol = estadoApreciacionesNuevas[c.numero] || { estado: "bloqueada", modo: null };
                if (infoCol.modo !== "directo") {
                    const candadoManual = casillasBloqueadas.has(claveCas);
                    const n = historial[claveCas];
                    const valorGuardado = (n && n.nota !== null && n.nota !== undefined) ? formatearNotaFinal(String(n.nota)) : "";
                    // 🔍 junto al número: avisa que esa nota salió de una
                    // evaluación (asistencia + comportamiento +
                    // actividades) y que se puede hacer clic para ver el
                    // desglose completo de dónde salió.
                    const contenido = infoCol.estado === "completada"
                        ? `<span class="fw-bold text-success">${valorGuardado || "–"}</span>
                           <span style="font-size:10px;" title="Nota calculada de una evaluación — clic para ver el desglose">🔍</span>
                           ${candadoManual ? `<span style="font-size:10px;" title="Bloqueada con candado">🔒</span>` : ""}`
                        : `<span style="opacity:${infoCol.estado === "bloqueada" ? .5 : 1};">${candadoManual ? "🔒" : iconoApreciacion(infoCol.estado)}</span>`;
                    return `<td class="celda-nota text-center" style="cursor:${infoCol.estado === "bloqueada" ? "default" : "pointer"};" data-abrir-apreciacion="${c.numero}" data-estado-apreciacion="${infoCol.estado}" data-candado-manual="${candadoManual ? "1" : "0"}">${contenido}</td>`;
                }
                // modo === "directo": sigue de largo y cae en el mismo
                // renderizado de <input> normal que usan Aprec. 1, 2, 3
                // (ya respeta casillasBloqueadas más abajo).
            }

            const colIndex = indicesColumna[pos];
            const n = historial[claveCas];
            const crudo = (n && n.nota !== null && n.nota !== undefined) ? n.nota : "";
            const valor = crudo === "" ? "" : formatearNotaFinal(String(crudo));
            const bloqueada = casillasBloqueadas.has(claveCas);
            return `
                <td class="celda-nota">
                    <input type="text" inputmode="decimal" class="form-control form-control-sm input-nota-grupo"
                        data-col="${colIndex}" data-correo="${sinCuenta ? "" : escapeHtml(est.correo)}"
                        data-estudiante-id="${escapeHtml(est.id)}" data-nota-id="${n ? n.id : ""}"
                        data-tipo="${c.tipo}" data-numero="${c.numero}" data-ultimo-valor-guardado="${valor}"
                        value="${valor}" placeholder="–" ${bloqueada ? `disabled style="background:#f1f5f9; color:#64748b;" title="🔒 Casilla bloqueada"` : ""}>
                </td>`;
        }).join("");

        return `
            <tr class="${sinCuenta ? "table-warning" : ""}" data-clave-estudiante="${escapeHtml(claveEstudiante(est))}">
                ${mostrarColNumero ? `<td class="col-fija col-fija-num">${i + 1}</td>` : ""}
                <td class="col-fija col-fija-nombre"${styleColNombre}>${escapeHtml(est.nombre)}${sinCuenta ? ' <span class="badge bg-warning text-dark">Sin cuenta</span>' : ""}<span class="badge-tendencia"></span></td>
                ${columnas}
                ${mostrarPromApr ? `<td class="celda-prom-apr text-center fw-bold" style="cursor:pointer;" title="Ver detalle" data-detalle-categoria="apreciacion">–</td>` : ""}
                ${mostrarPromEje ? `<td class="celda-prom-eje text-center fw-bold" style="cursor:pointer;" title="Ver detalle" data-detalle-categoria="ejercicio">–</td>` : ""}
                ${mostrarPromExa ? `<td class="celda-prom-examen text-center fw-bold" style="cursor:pointer;" title="Ver detalle" data-detalle-categoria="examen">–</td>` : ""}
                ${mostrarPromFinal ? `<td class="celda-prom-final text-center fw-bold table-success bg-opacity-25" style="cursor:pointer;" title="Ver detalle" data-detalle-categoria="final">–</td>` : ""}
            </tr>`;
    }).join("");

    recalcularPromedios();

    cabeceraNotasGrupo.querySelectorAll(".btn-eliminar-columna").forEach((btn) => {
        btn.addEventListener("click", () => eliminarColumnaCasilla(btn.dataset.tipo, parseInt(btn.dataset.numero, 10)));
    });

    cabeceraNotasGrupo.querySelectorAll(".btn-bloquear-columna").forEach((btn) => {
        btn.addEventListener("click", () => alternarBloqueoCasilla(btn.dataset.tipo, parseInt(btn.dataset.numero, 10)));
    });

    tablaNotasGrupo.querySelectorAll("[data-detalle-categoria]").forEach((td) => {
        td.addEventListener("click", () => {
            const tr = td.closest("tr[data-clave-estudiante]");
            if (tr) mostrarDetallePromedio(tr, td.dataset.detalleCategoria);
        });
    });

    function abrirDesdeApreciacionNueva(numeroApreciacion, estadoCol, candadoManual) {
        const infoCol = estadoApreciacionesNuevas[numeroApreciacion] || {};
        const materia = selectMateriaNota.value, salon = selectSalonNota.value, trimestre = selectTrimestreNota.value;
        // Nombre que el docente le puso a esta apreciación (ej. "Clase 3")
        // en la casilla de "Tema" bajo el encabezado. Si no ha puesto
        // nada, se sigue usando "Apreciación N" como antes.
        const etiquetaPersonalizada = obtenerTemaCasilla("apreciacion", numeroApreciacion) || "";

        // Con el candado 🔒 puesto, siempre se abre en modo VER (solo
        // lectura) el desglose de la evaluación — nunca el selector de
        // modo ni la edición, sin importar el estado real de la
        // apreciación. Para editarla de nuevo, primero hay que quitar
        // el candado (🔓) en la tabla principal.
        if (!candadoManual && !infoCol.modo && estadoCol === "activa") {
            abrirSelectorModo({
                materia, salon, trimestre, numeroApreciacion, correoProfesor, estudiantes: grupoActual, etiquetaPersonalizada,
                onModoElegido: (modoElegido) => {
                    infoCol.modo = modoElegido;
                    if (modoElegido === "directo") renderTabla(); // repinta la celda como input normal
                },
            });
            return;
        }

        abrirDetalleApreciacion({
            materia, salon, trimestre, numeroApreciacion, estado: estadoCol, etiquetaPersonalizada,
            estudiantes: grupoActual, correoProfesor, candadoManual,
        });
    }

    cabeceraNotasGrupo.querySelectorAll("[data-abrir-apreciacion-header]").forEach((th) => {
        if (th.dataset.estadoHeader === "bloqueada") return;
        th.addEventListener("click", (e) => {
            if (e.target.closest(".btn-reiniciar-apreciacion") || e.target.closest(".btn-bloquear-columna")) return; // esos botones tienen su propio listener
            abrirDesdeApreciacionNueva(parseInt(th.dataset.abrirApreciacionHeader, 10), th.dataset.estadoHeader, th.dataset.candadoManual === "1");
        });
    });

    cabeceraNotasGrupo.querySelectorAll(".btn-reiniciar-apreciacion").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const numeroApreciacion = parseInt(btn.dataset.numero, 10);
            const ok = window.confirm(
                `¿Eliminar por completo la Apreciación ${numeroApreciacion}? Esto borra sus notas, comportamiento y actividades, y la columna desaparece de la tabla (solo esta, no toca Aprec. 1, 2 ni 3). Nota: esta apreciación es la misma para todos los salones que tengan esta materia y trimestre, así que se elimina para todos ellos, no solo para este salón.`
            );
            if (!ok) return;
            const materia = selectMateriaNota.value, trimestre = selectTrimestreNota.value;
            const resultado = await eliminarApreciacionColumna(materia, trimestre, numeroApreciacion);
            if (!resultado.ok) { alert("❌ No se pudo eliminar la columna.\n\nMotivo: " + (resultado.error?.message || "desconocido")); return; }
            cargarSalon();
        });
    });

    tablaNotasGrupo.querySelectorAll("[data-abrir-apreciacion]").forEach((td) => {
        if (td.dataset.estadoApreciacion === "bloqueada") return;
        td.addEventListener("click", () => abrirDesdeApreciacionNueva(parseInt(td.dataset.abrirApreciacion, 10), td.dataset.estadoApreciacion, td.dataset.candadoManual === "1"));
    });

    // "➕" al final de cada grupo de columnas: agrega la siguiente casilla
    // de ese mismo Tipo (Aprec./Ejer./Exam.), sin importar cuál Tipo esté
    // elegido arriba en el selector.
    cabeceraNotasGrupo.querySelectorAll(".btn-agregar-columna").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const tipo = btn.dataset.tipo;

            if (tipo === "apreciacion") {
                // Apreciación 4+ vive en apreciaciones_estado, no en la
                // tabla "notas" normal: crea/activa la siguiente en vez
                // de abrir una casilla vacía del sistema viejo.
                const numerosActuales = Object.keys(estadoApreciacionesNuevas).map((n) => parseInt(n, 10));
                const siguienteNumero = numerosActuales.length > 0 ? Math.max(...numerosActuales) + 1 : 4;
                btn.disabled = true;
                const ok = await activarApreciacionSiguiente(selectMateriaNota.value, selectTrimestreNota.value, siguienteNumero);
                btn.disabled = false;
                if (!ok) { alert("No se pudo agregar la siguiente Apreciación."); return; }
                await cargarSalon();
                return;
            }

            selectTipoNota.value = tipo;
            inputNumeroNota.value = obtenerUltimoNumeroTipo(tipo) + 1;
            agregarColumnaVaciaSolicitada = true;
            renderTabla();
        });
    });

    tablaNotasGrupo.parentElement.querySelectorAll(".input-tema-columna").forEach((input) => {
        input.addEventListener("blur", async () => {
            const nuevo = input.value.trim();
            if (nuevo === input.dataset.temaGuardado) return;
            await actualizarTemaCasilla(input.dataset.tipo, parseInt(input.dataset.numero, 10), nuevo);
            input.dataset.temaGuardado = nuevo;
        });
    });

    const todosInputs = Array.from(tablaNotasGrupo.querySelectorAll(".input-nota-grupo"));
    const porColumna = {};
    todosInputs.forEach((input) => {
        (porColumna[input.dataset.col] ??= []).push(input);
    });
    todosInputs.forEach((input) => {
        input.addEventListener("input", () => {
            const alFinal = input.selectionEnd === input.value.length;
            input.value = sanitizarEntradaNota(input.value);
            if (alFinal) input.selectionStart = input.selectionEnd = input.value.length;
            recalcularPromedios();
        });

        input.addEventListener("keydown", (e) => {
            const lista = porColumna[input.dataset.col] || [];

            if (e.key === "Enter" || e.key === "ArrowDown") {
                e.preventDefault();
                const siguiente = lista[lista.indexOf(input) + 1];
                if (siguiente) { siguiente.focus(); siguiente.select(); }
                return;
            }
            if (e.key === "ArrowUp") {
                e.preventDefault();
                const anterior = lista[lista.indexOf(input) - 1];
                if (anterior) { anterior.focus(); anterior.select(); }
            }
        });
    });
}

// Si el docente cambia cuál casilla está editando (Tipo / Número),
// volvemos a dibujar la tabla al instante con los datos que ya están en
// memoria (sin tener que volver a presionar "Cargar salón").
// El número de casilla ya no lo escribe el docente: cada vez que
// cambia el Tipo, se calcula solo como "la siguiente casilla libre"
// de ese Tipo (misma lógica que usa el botón "➕").
selectTipoNota?.addEventListener("change", () => {
    if (inputNumeroNota) inputNumeroNota.value = String(obtenerUltimoNumeroTipo(selectTipoNota.value) + 1);
    if (grupoActual.length > 0) renderTabla();
});

// Último número de casilla ya existente para un tipo dado (0 si el tipo
// todavía no tiene ninguna columna). Se usa para que el botón "➕" al
// final de cada grupo de columnas agregue siempre la siguiente.
function obtenerUltimoNumeroTipo(tipo) {
    const numeros = casillasTabla.filter((c) => c.tipo === tipo).map((c) => c.numero);
    return numeros.length ? Math.max(...numeros) : 0;
}

let cargaSalonEnCurso = false;

async function cargarSalon() {
    const salon = selectSalonNota.value;
    const materia = selectMateriaNota.value;
    const tipo = selectTipoNota.value;
    const numero = parseInt(inputNumeroNota.value, 10);
    const trimestre = selectTrimestreNota.value;

    if (!salon || !materia) return;

    const esMia = misAsignaciones.some((a) => a.salon === salon && a.materia === materia);
    if (!esMia) return alert("Esa materia/salón no está asignada a tu cuenta.");

    // Evita que dos cargas se pisen si el docente cambia varios
    // selectores muy rápido seguido (ej. salón y luego materia).
    if (cargaSalonEnCurso) return;
    cargaSalonEnCurso = true;

    // Si hay un guardado automático en curso (el docente acaba de salir
    // de una casilla y de inmediato cambió salón/materia/trimestre),
    // esperamos a que termine de escribirse en la base de datos antes
    // de volver a leerla. Así esa nota nunca "desaparece" de la vista.
    if (guardadoAutomaticoPendiente) {
        if (estadoCargaSalon) estadoCargaSalon.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Terminando de guardar...`;
        await guardadoAutomaticoPendiente;
    }

    if (estadoCargaSalon) estadoCargaSalon.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Cargando...`;

    // Muestra el bloque de "Explicación de las notas" para el salón +
    // materia recién elegidos y precarga el texto que ya tenía guardado
    // (si tenía). Es independiente del trimestre, pero cada salón tiene
    // su propia leyenda para una misma materia.
    if (bloqueLeyendaMateria) {
        bloqueLeyendaMateria.style.display = "block";
        if (estadoLeyenda) estadoLeyenda.textContent = "";
        if (textareaLeyendaMateria) {
            textareaLeyendaMateria.value = "Cargando...";
            textareaLeyendaMateria.disabled = true;
            obtenerLeyendaMateria(salon, materia).then((texto) => {
                // Si el docente ya cambió de salón/materia mientras esto
                // cargaba, no pisamos lo que esté viendo ahora.
                if (selectSalonNota.value !== salon || selectMateriaNota.value !== materia) return;
                textareaLeyendaMateria.value = texto;
                textareaLeyendaMateria.disabled = false;
            });
        }
    }

    const { data: estudiantesSalon, error: errEst } = await supabase
        .from("estudiantes")
        .select("id, codigo, nombre, correo, es_prueba")
        .eq("salon", salon)
        .order("nombre", { ascending: true });

    if (errEst) {
        alert("Error al cargar estudiantes: " + errEst.message);
        if (estadoCargaSalon) estadoCargaSalon.textContent = "";
        cargaSalonEnCurso = false;
        return;
    }

    grupoActual = (estudiantesSalon || []).filter((e) => !e.es_prueba);
    estudiantesOcultos.clear();

    // A partir de ahora, el "id" del estudiante es la fuente de verdad
    // para relacionar sus notas (nunca cambia, a diferencia del correo,
    // que puede quitarse o cambiarse si le tocan la cuenta). Guardamos
    // un mapa correo->id para poder rescatar también las notas viejas
    // que solo tienen "correo" (por si todavía no se han migrado).
    const todosLosIds = grupoActual.map((e) => e.id);
    const correoAId = {};
    grupoActual.forEach((e) => { if (e.correo) correoAId[e.correo] = e.id; });
    const correosActuales = Object.keys(correoAId);

    historiaPorEstudiante = {};
    const casillasEncontradas = new Set();

    function registrar(estudianteId, n) {
        (historiaPorEstudiante[`id:${estudianteId}`] ??= {})[claveCasilla(n.tipo, n.numero)] = n;
        casillasEncontradas.add(claveCasilla(n.tipo, n.numero));
    }

    // Fuente principal: notas ya conectadas por estudiante_id.
    if (todosLosIds.length > 0) {
        const { data } = await supabase.from("notas").select("id, estudiante_id, correo, tipo, numero, nota, tema")
            .eq("materia", materia).eq("trimestre", trimestre).in("estudiante_id", todosLosIds)
            .is("eliminado_en", null);
        (data || []).forEach((n) => registrar(n.estudiante_id, n));
    }
    // Fuente de respaldo: notas antiguas que todavía solo tienen
    // "correo" (sin estudiante_id). Se conectan usando el correo ACTUAL
    // del estudiante. Si más adelante le quitan la cuenta, esta rama ya
    // no las encontraría — por eso guardarNotas() ahora siempre rellena
    // también el estudiante_id, para que esto no dependa del correo.
    if (correosActuales.length > 0) {
        const { data } = await supabase.from("notas").select("id, estudiante_id, correo, tipo, numero, nota, tema")
            .eq("materia", materia).eq("trimestre", trimestre).in("correo", correosActuales)
            .is("eliminado_en", null);
        (data || []).forEach((n) => {
            if (n.estudiante_id) return; // ya se registró arriba
            const idEst = correoAId[n.correo];
            if (idEst) registrar(idEst, n);
        });
    }

    temasCasillasBD = {};
    casillasBloqueadas = new Set();
    const { data: temas } = await supabase.from("temas_casillas").select("tipo, numero, tema, bloqueada")
        .eq("salon", salon).eq("materia", materia).eq("trimestre", trimestre)
        .is("eliminado_en", null);
    (temas || []).forEach((t) => {
        const clave = claveCasilla(t.tipo, t.numero);
        temasCasillasBD[clave] = t.tema || "";
        if (t.tema) casillasEncontradas.add(clave);
        if (t.bloqueada) casillasBloqueadas.add(clave);
    });

    // ¿La casilla que estaba seleccionada (numero) ya tenía notas guardadas
    // de verdad en la base de datos? Si es así, es una casilla real y hay
    // que mover el puntero a la siguiente libre. Si no, es solo la casilla
    // "lista para escribir" que ya estaba esperando (por ejemplo, la que
    // quedó después de eliminar una columna) y no hay que avanzarla de
    // nuevo solo porque se recargó el salón; si se avanza igual, se crea
    // una segunda columna vacía además de esta.
    const numeroYaTeniaDatos = casillasEncontradas.has(claveCasilla(tipo, numero));

    // Solo agregamos la casilla activa como columna "lista para escribir"
    // cuando el salón/materia/trimestre no tiene ABSOLUTAMENTE ninguna
    // columna todavía (primera vez que se usa esa combinación). Si ya
    // existe al menos una columna, no la agregamos aquí: así, al eliminar
    // una columna, no vuelve a aparecer otra automáticamente. Para
    // agregar una columna nueva a mano, el docente usa el botón "➕".
    if (casillasEncontradas.size === 0) {
        casillasEncontradas.add(claveCasilla(tipo, numero));
    }
    casillasTabla = [...casillasEncontradas].map((c) => {
        const sep = c.lastIndexOf("-");
        return { tipo: c.slice(0, sep), numero: parseInt(c.slice(sep + 1), 10) };
    });
    ordenarCasillas(casillasTabla);
    if (inputNumeroNota && numeroYaTeniaDatos) inputNumeroNota.value = String(obtenerUltimoNumeroTipo(tipo) + 1);

    // --- Apreciación 4 en adelante: sistema nuevo (asistencia +
    // comportamiento + actividades). Estas columnas NO se manejan con
    // el botón "➕" de arriba: se calculan solas según su estado
    // (activa/completada/bloqueada) en apreciaciones_estado. Se quitan
    // aquí de casillasTabla y se vuelven a agregar con su estado, para
    // no duplicarlas si ya tenían notas guardadas.
    casillasTabla = casillasTabla.filter((c) => !(c.tipo === "apreciacion" && c.numero >= 4));
    estadoApreciacionesNuevas = {};
    const columnasNuevas = await calcularColumnasApreciacionesNuevas(materia, trimestre);
    columnasNuevas.forEach(({ numero, estado: estadoCol, modo }) => {
        estadoApreciacionesNuevas[numero] = { estado: estadoCol, modo: modo || null };
        casillasTabla.push({ tipo: "apreciacion", numero, esNueva: true });
    });
    ordenarCasillas(casillasTabla);

    const { data: filaAsignacion } = await supabase
        .from("profesor_materias")
        .select("bloqueado_para_estudiantes")
        .eq("correo_profesor", correoProfesor).eq("materia", materia).eq("salon", salon)
        .maybeSingle();
    // Los estudiantes nunca deben poder agregar/editar notas: si esta
    // materia/salón todavía no está marcada como bloqueada en la base
    // de datos, la bloqueamos ahora mismo de forma automática y
    // silenciosa (ya no depende de que el docente marque una casilla).
    bloqueoActual = true;
    if (!filaAsignacion?.bloqueado_para_estudiantes) {
        supabase
            .from("profesor_materias")
            .update({ bloqueado_para_estudiantes: true })
            .eq("correo_profesor", correoProfesor).eq("materia", materia).eq("salon", salon)
            .then(({ error }) => { if (error) console.error("No se pudo bloquear automáticamente:", error); });
    }

    renderTabla();
    bloqueTablaNotas.style.display = "block";

    if (panelPapelera && panelPapelera.style.display !== "none") {
        cargarPapelera();
    }

    if (estadoCargaSalon) {
        const hora = new Date().toLocaleTimeString("es-PA", { hour: "2-digit", minute: "2-digit" });
        estadoCargaSalon.textContent = `✅ Cargado a las ${hora}`;
    }
    cargaSalonEnCurso = false;
}

// Le permite a js/apreciaciones.js refrescar esta misma tabla después
// de guardar una Apreciación 4+, sin tener que reimplementar toda la
// carga de estudiantes/notas/temas que ya hace cargarSalon().
window.__recargarSalonProfesor = cargarSalon;

// =========================================================
// 4) GUARDAR NOTAS
// =========================================================

// Después de guardar una nota (nueva o editada) en la base de datos,
// actualizamos también nuestra copia en memoria (historiaPorEstudiante)
// para que los promedios y cualquier otra vista que dependa de esos
// datos reflejen el cambio al instante, sin tener que volver a
// presionar "Cargar salón".
function actualizarHistorialEnMemoria(item, temaPorCasilla, idInsertado) {
    const claveEst = `id:${item.estudianteId}`;
    const claveCas = claveCasilla(item.tipo, item.numero);
    const notaId = item.notaId || idInsertado;

    if (!historiaPorEstudiante[claveEst]) historiaPorEstudiante[claveEst] = {};
    historiaPorEstudiante[claveEst][claveCas] = {
        id: notaId,
        tipo: item.tipo,
        numero: item.numero,
        nota: item.nota,
        tema: temaPorCasilla[claveCas] ?? (historiaPorEstudiante[claveEst][claveCas]?.tema ?? null)
    };
}

async function guardarNotas(esAutomatico = false) {
    const materia = selectMateriaNota.value;
    const salon = selectSalonNota.value;
    const trimestre = selectTrimestreNota.value;
    const hoy = new Date().toISOString().slice(0, 10);

    const inputsTema = Array.from(tablaNotasGrupo.parentElement.querySelectorAll(".input-tema-columna"));
    const temaPorCasilla = {};
    for (const inputTema of inputsTema) {
        const valor = inputTema.value.trim();
        temaPorCasilla[claveCasilla(inputTema.dataset.tipo, parseInt(inputTema.dataset.numero, 10))] = valor || null;
        if (valor !== inputTema.dataset.temaGuardado) {
            await actualizarTemaCasilla(inputTema.dataset.tipo, parseInt(inputTema.dataset.numero, 10), valor);
            inputTema.dataset.temaGuardado = valor;
        }
    }

    const inputs = tablaNotasGrupo.querySelectorAll(".input-nota-grupo");
    const aGuardar = [];
    inputs.forEach((input) => {
        const valor = input.value.trim();
        if (valor === "") return;
        const notaNum = parseFloat(valor);
        if (isNaN(notaNum)) return;
        if (esAutomatico && input.dataset.ultimoValorGuardado === valor) return;
        aGuardar.push({
            input,
            correo: input.dataset.correo || null,
            estudianteId: input.dataset.estudianteId || null,
            notaId: input.dataset.notaId || null,
            tipo: input.dataset.tipo,
            numero: parseInt(input.dataset.numero, 10),
            nota: notaNum
        });
    });

    if (aGuardar.length === 0) {
        if (!esAutomatico) alert("No escribiste ninguna nota para guardar.");
        return;
    }

    if (!esAutomatico) btnGuardarNotasGrupo.disabled = true;
    estadoGuardadoNotas.textContent = esAutomatico ? "Autoguardando..." : `Guardando 0 / ${aGuardar.length}...`;
    estadoGuardadoNotas.className = "small text-primary";

    let exitosas = 0, fallidas = 0;

    for (let i = 0; i < aGuardar.length; i++) {
        const item = aGuardar[i];

        if (item.notaId) {
            const { error } = await supabase.from("notas").update({ nota: item.nota, fecha: hoy, origen: "profesor" }).eq("id", item.notaId);
            if (error) { fallidas++; } else {
                exitosas++;
                item.input.dataset.ultimoValorGuardado = String(item.nota);
                actualizarHistorialEnMemoria(item, temaPorCasilla);
                registrarCambioParaRespaldo(item);
            }
        } else {
            const { data: insertado, error } = await supabase.from("notas").insert([{
                correo: item.correo,
                estudiante_id: item.estudianteId,
                materia,
                tipo: item.tipo,
                numero: item.numero,
                tema: temaPorCasilla[claveCasilla(item.tipo, item.numero)] || null,
                actividad: temaPorCasilla[claveCasilla(item.tipo, item.numero)] || `${ETIQUETAS_TIPO[item.tipo] || item.tipo} ${item.numero}`,
                fecha: hoy,
                nota: item.nota,
                observacion: `Agregada por el/la docente (${correoProfesor})`,
                trimestre,
                estado: "Activa",
                origen: "profesor"
            }]).select("id");

            if (error) { fallidas++; }
            else {
                exitosas++;
                item.input.dataset.ultimoValorGuardado = String(item.nota);
                if (insertado && insertado[0]) item.input.dataset.notaId = insertado[0].id;
                actualizarHistorialEnMemoria(item, temaPorCasilla, insertado && insertado[0] ? insertado[0].id : null);
                registrarCambioParaRespaldo(item);
            }
        }
        if (!esAutomatico) estadoGuardadoNotas.textContent = `Guardando ${i + 1} / ${aGuardar.length}...`;
    }

    if (!esAutomatico) btnGuardarNotasGrupo.disabled = false;
    const hora = new Date().toLocaleTimeString("es-PA", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

    if (fallidas === 0) {
        estadoGuardadoNotas.textContent = esAutomatico ? `✅ Autoguardado (${exitosas}) a las ${hora}` : `✅ ${exitosas} nota(s) guardada(s).`;
        estadoGuardadoNotas.className = "small text-success";
    } else {
        estadoGuardadoNotas.textContent = `⚠️ ${exitosas} guardada(s), ${fallidas} con error.`;
        estadoGuardadoNotas.className = "small text-danger";
    }

    // Si alguna de las notas guardadas era de una Apreciación 4+ en modo
    // "directo", hay que revisar si con esto quedó completa (todos los
    // estudiantes con nota) para activar la siguiente automáticamente.
    const numerosApreciacionNuevaGuardados = [...new Set(
        aGuardar.filter((item) => item.tipo === "apreciacion" && item.numero >= 4).map((item) => item.numero)
    )];
    let huboAvanceDeApreciacion = false;
    if (numerosApreciacionNuevaGuardados.length > 0) {
        huboAvanceDeApreciacion = await revisarAvanceApreciacionesDirectas(materia, salon, trimestre, numerosApreciacionNuevaGuardados);
    }

    if (!esAutomatico || huboAvanceDeApreciacion) cargarSalon();
}

// =========================================================
// 4.1) RESPALDO AUTOMÁTICO POR CORREO (EmailJS)
// =========================================================
// Cada vez que se guarda una nota (automático o manual) se anota el
// cambio en una lista pendiente y se reinicia un temporizador de 30
// minutos. Si pasan 30 minutos sin que el/la docente guarde nada
// nuevo, se manda un correo con la tabla completa de lo que cambió
// desde el último respaldo. Es una segunda capa de seguridad,
// independiente de la papelera: cubre el caso de un desastre mayor
// en la base de datos, no solo un borrado accidental.

const EMAILJS_SERVICE_ID = "service_avsesik";
const EMAILJS_TEMPLATE_ID = "template_00nky6m";
const EMAILJS_PUBLIC_KEY = "2PasfycZJSW6hDpqg";
const MINUTOS_INACTIVIDAD_RESPALDO = 10;
const URL_FUNCION_ENVIAR_NOTAS = "https://luewrpzgetqslxqmdcxv.functions.supabase.co/enviar-notas-correo";

if (window.emailjs) {
    window.emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
}

let cambiosPendientesRespaldo = [];
let temporizadorRespaldo = null;

function nombreEstudiantePorItem(item) {
    const est = grupoActual.find((e) =>
        (item.correo && e.correo === item.correo) || (item.estudianteId && String(e.id) === String(item.estudianteId))
    );
    return est ? est.nombre : (item.correo || item.estudianteId || "—");
}

function registrarCambioParaRespaldo(item) {
    cambiosPendientesRespaldo.push({
        estudiante: nombreEstudiantePorItem(item),
        casilla: etiquetaCasilla(item.tipo, item.numero),
        nota: item.nota,
        hora: new Date().toLocaleString("es-PA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
    });
    reiniciarTemporizadorRespaldo();
}

function reiniciarTemporizadorRespaldo() {
    if (temporizadorRespaldo) clearTimeout(temporizadorRespaldo);
    temporizadorRespaldo = setTimeout(enviarRespaldoPorCorreo, MINUTOS_INACTIVIDAD_RESPALDO * 60 * 1000);
}

async function enviarRespaldoPorCorreo() {
    if (!window.emailjs || cambiosPendientesRespaldo.length === 0) return;

    const filas = cambiosPendientesRespaldo.map((c) =>
        `<tr>` +
        `<td style="padding:4px 8px;border:1px solid #ccc;">${escapeHtml(c.estudiante)}</td>` +
        `<td style="padding:4px 8px;border:1px solid #ccc;text-align:center;">${escapeHtml(c.casilla)}</td>` +
        `<td style="padding:4px 8px;border:1px solid #ccc;text-align:center;">${escapeHtml(String(c.nota))}</td>` +
        `<td style="padding:4px 8px;border:1px solid #ccc;text-align:center;">${escapeHtml(c.hora)}</td>` +
        `</tr>`
    ).join("");

    const tablaHtml = `
        <table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;">
            <thead>
                <tr>
                    <th style="padding:4px 8px;border:1px solid #ccc;background:#f0f0f0;">Estudiante</th>
                    <th style="padding:4px 8px;border:1px solid #ccc;background:#f0f0f0;">Casilla</th>
                    <th style="padding:4px 8px;border:1px solid #ccc;background:#f0f0f0;">Nota</th>
                    <th style="padding:4px 8px;border:1px solid #ccc;background:#f0f0f0;">Hora</th>
                </tr>
            </thead>
            <tbody>${filas}</tbody>
        </table>`;

    const parametros = {
        profesor: nombreProfesor,
        materia: selectMateriaNota.value,
        salon: selectSalonNota.value,
        trimestre: selectTrimestreNota.value,
        fecha: new Date().toLocaleString("es-PA"),
        tabla_notas: tablaHtml,
    };

    try {
        await window.emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, parametros);
        cambiosPendientesRespaldo = [];
    } catch (err) {
        console.error("❌ No se pudo enviar el respaldo automático por correo:", err);
        // No se pierden los cambios acumulados: se reintenta en el
        // siguiente ciclo de inactividad.
        reiniciarTemporizadorRespaldo();
    }
}

// Botón "Enviar notas ahora": fuerza el envío inmediato del correo de
// respaldo, sin esperar los MINUTOS_INACTIVIDAD_RESPALDO. Útil si el
// docente quiere mandar el correo justo después de terminar de anotar,
// en vez de esperar a que pase el tiempo de inactividad.
// Construye una tabla HTML con las notas de un grupo de estudiantes ya
// consultado (usado tanto por el envío del salón/materia actual como
// por el envío de varios salones a la vez).
function construirTablaNotasHtml(estudiantes, historial, casillas) {
    const columnas = casillas.slice();
    ordenarCasillas(columnas);

    const encabezado = columnas.map((c) =>
        `<th style="padding:4px 8px;border:1px solid #ccc;background:#f0f0f0;">${escapeHtml(etiquetaCasilla(c.tipo, c.numero))}</th>`
    ).join("");

    const filas = estudiantes.map((est) => {
        const historialEst = historial[`id:${est.id}`] || {};
        const celdas = columnas.map((c) => {
            const nota = historialEst[claveCasilla(c.tipo, c.numero)];
            const valor = nota && nota.nota !== null && nota.nota !== undefined && nota.nota !== ""
                ? escapeHtml(String(nota.nota))
                : "-";
            return `<td style="padding:4px 8px;border:1px solid #ccc;text-align:center;">${valor}</td>`;
        }).join("");

        return `<tr>` +
            `<td style="padding:4px 8px;border:1px solid #ccc;">${escapeHtml(est.nombre || "-")}</td>` +
            celdas +
            `</tr>`;
    }).join("");

    return `
        <table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;">
            <thead>
                <tr>
                    <th style="padding:4px 8px;border:1px solid #ccc;background:#f0f0f0;">Estudiante</th>
                    ${encabezado}
                </tr>
            </thead>
            <tbody>${filas || `<tr><td colspan="${columnas.length + 1}" style="padding:6px;text-align:center;color:#888;">Sin estudiantes</td></tr>`}</tbody>
        </table>`;
}

// Consulta en la base de datos las notas de UN salón + UNA materia, tal
// como están guardadas ahora mismo, sin depender de lo que esté cargado
// en pantalla. Devuelve { estudiantes, historial, casillas }.
async function consultarSnapshotSalonMateria(salon, materia, trimestre) {
    const { data: estudiantesSalon } = await supabase
        .from("estudiantes")
        .select("id, nombre, correo, es_prueba")
        .eq("salon", salon)
        .order("nombre", { ascending: true });

    const estudiantes = (estudiantesSalon || []).filter((e) => !e.es_prueba);
    const todosLosIds = estudiantes.map((e) => e.id);
    const correoAId = {};
    estudiantes.forEach((e) => { if (e.correo) correoAId[e.correo] = e.id; });
    const correosActuales = Object.keys(correoAId);

    const historial = {};
    const casillasEncontradas = new Set();

    function registrar(estudianteId, n) {
        (historial[`id:${estudianteId}`] ??= {})[claveCasilla(n.tipo, n.numero)] = n;
        casillasEncontradas.add(claveCasilla(n.tipo, n.numero));
    }

    if (todosLosIds.length > 0) {
        const { data } = await supabase.from("notas").select("estudiante_id, correo, tipo, numero, nota")
            .eq("materia", materia).eq("trimestre", trimestre).in("estudiante_id", todosLosIds)
            .is("eliminado_en", null);
        (data || []).forEach((n) => registrar(n.estudiante_id, n));
    }
    if (correosActuales.length > 0) {
        const { data } = await supabase.from("notas").select("estudiante_id, correo, tipo, numero, nota")
            .eq("materia", materia).eq("trimestre", trimestre).in("correo", correosActuales)
            .is("eliminado_en", null);
        (data || []).forEach((n) => {
            if (n.estudiante_id) return;
            const idEst = correoAId[n.correo];
            if (idEst) registrar(idEst, n);
        });
    }

    const casillas = [...casillasEncontradas].map((c) => {
        const sep = c.lastIndexOf("-");
        return { tipo: c.slice(0, sep), numero: parseInt(c.slice(sep + 1), 10) };
    });
    ordenarCasillas(casillas);

    return { estudiantes, historial, casillas };
}

// =========================================================
// PANEL "ENVIAR NOTAS POR CORREO" (selección de salones)
// =========================================================

const btnAbrirEnviarNotas = document.getElementById("btnAbrirEnviarNotas");
const panelEnviarNotas = document.getElementById("panelEnviarNotas");
const listaChecksSalonesEnvio = document.getElementById("listaChecksSalonesEnvio");
const btnConfirmarEnvioNotas = document.getElementById("btnConfirmarEnvioNotas");

function renderizarChecksSalonesEnvio() {
    const salones = [...new Set(misAsignaciones.map((a) => a.salon))].sort();
    listaChecksSalonesEnvio.innerHTML = salones.map((s) => `
        <label class="small" style="display:flex; align-items:center; gap:6px; cursor:pointer;">
            <input type="checkbox" class="check-salon-envio" value="${escapeHtml(s)}" checked>
            ${escapeHtml(s)}
        </label>
    `).join("");
}

btnAbrirEnviarNotas?.addEventListener("click", () => {
    const abierto = panelEnviarNotas.style.display !== "none";
    if (abierto) {
        panelEnviarNotas.style.display = "none";
        return;
    }
    renderizarChecksSalonesEnvio();
    panelEnviarNotas.style.display = "block";
});

// Cierra el panel si el docente hace clic afuera.
document.addEventListener("click", (e) => {
    if (!panelEnviarNotas || panelEnviarNotas.style.display === "none") return;
    if (panelEnviarNotas.contains(e.target) || btnAbrirEnviarNotas.contains(e.target)) return;
    panelEnviarNotas.style.display = "none";
});

document.getElementById("btnEnvioSalonesTodos")?.addEventListener("click", () => {
    listaChecksSalonesEnvio.querySelectorAll(".check-salon-envio").forEach((chk) => { chk.checked = true; });
});
document.getElementById("btnEnvioSalonesNinguno")?.addEventListener("click", () => {
    listaChecksSalonesEnvio.querySelectorAll(".check-salon-envio").forEach((chk) => { chk.checked = false; });
});

// Lee qué salones están marcados en el panel y devuelve, junto con el
// trimestre actual, solo las combinaciones salón+materia que de verdad
// da este docente (puede dar más de una materia en el mismo salón).
// La comparten el botón de correo y el botón de Drive.
function leerSeleccionSalonesEnvio() {
    const salonesElegidos = Array.from(listaChecksSalonesEnvio.querySelectorAll(".check-salon-envio:checked"))
        .map((chk) => chk.value);
    const trimestre = selectTrimestreNota.value;
    const combinaciones = misAsignaciones.filter((a) => salonesElegidos.includes(a.salon));
    return { salonesElegidos, trimestre, combinaciones };
}

btnConfirmarEnvioNotas?.addEventListener("click", async () => {
    const estado = document.getElementById("estadoEnviarRespaldo");
    const { salonesElegidos, trimestre, combinaciones } = leerSeleccionSalonesEnvio();

    if (salonesElegidos.length === 0) {
        estado.textContent = "⚠️ Elige al menos un salón.";
        estado.className = "small text-danger";
        return;
    }

    panelEnviarNotas.style.display = "none";
    btnConfirmarEnvioNotas.disabled = true;
    const textoOriginal = btnAbrirEnviarNotas.textContent;
    btnAbrirEnviarNotas.textContent = "Enviando...";
    btnAbrirEnviarNotas.disabled = true;
    estado.textContent = "";

    try {
        const secciones = await Promise.all(combinaciones.map(async (a) => {
            const { estudiantes, historial, casillas } = await consultarSnapshotSalonMateria(a.salon, a.materia, trimestre);
            const tabla = construirTablaNotasHtml(estudiantes, historial, casillas);
            return `
                <h3 style="font-family:Arial,sans-serif;color:#1f4e79;margin:18px 0 6px;">
                    ${escapeHtml(a.salon)} — ${escapeHtml(a.materia)}
                </h3>
                ${tabla}`;
        }));

        const fecha = new Date().toLocaleString("es-PA");
        const htmlCompleto = `
            <div style="font-family:Arial,sans-serif;">
                <h2 style="color:#1f4e79;">📋 Notas — ${escapeHtml(nombreProfesor)}</h2>
                <p><strong>Trimestre:</strong> ${escapeHtml(trimestre)}<br>
                <strong>Generado:</strong> ${escapeHtml(fecha)}</p>
                ${secciones.join("")}
            </div>`;

        const { data: { session } } = await supabase.auth.getSession();
        const base64Excel = await construirExcelSnapshot(combinaciones, trimestre);
        const nombreArchivoExcel = `Notas ${salonesElegidos.join("-")} - ${trimestre}.xlsx`;

        const respuesta = await fetch(URL_FUNCION_ENVIAR_NOTAS, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
                asunto: `Notas — ${salonesElegidos.join(", ")} — ${trimestre}`,
                html: htmlCompleto,
                adjunto: { nombreArchivo: nombreArchivoExcel, base64Content: base64Excel },
            }),
        });

        const resultado = await respuesta.json();

        if (!respuesta.ok) {
            throw new Error(resultado?.error || "El servidor rechazó el envío.");
        }

        estado.textContent = `✅ Notas de ${salonesElegidos.length === 1 ? salonesElegidos[0] : salonesElegidos.length + " salones"} enviadas por correo.`;
        estado.className = "small text-success";
        cambiosPendientesRespaldo = [];
        if (temporizadorRespaldo) clearTimeout(temporizadorRespaldo);
    } catch (err) {
        console.error("❌ No se pudo enviar el correo:", err);
        estado.textContent = "❌ No se pudo enviar el correo: " + err.message;
        estado.className = "small text-danger";
    } finally {
        btnConfirmarEnvioNotas.disabled = false;
        btnAbrirEnviarNotas.textContent = textoOriginal;
        btnAbrirEnviarNotas.disabled = false;
    }
});

// Arma un Excel real (.xlsx) con una hoja por cada salón+materia,
// usando SheetJS (cargado en profesor.html). Devuelve el archivo ya
// codificado en base64, listo para mandarlo a la función de Drive.
async function construirExcelSnapshot(combinaciones, trimestre) {
    const wb = window.XLSX.utils.book_new();

    for (const a of combinaciones) {
        const { estudiantes, historial, casillas } = await consultarSnapshotSalonMateria(a.salon, a.materia, trimestre);
        const columnas = casillas.slice();
        ordenarCasillas(columnas);

        const encabezado = ["Estudiante", ...columnas.map((c) => etiquetaCasilla(c.tipo, c.numero))];
        const filas = estudiantes.map((est) => {
            const historialEst = historial[`id:${est.id}`] || {};
            const valores = columnas.map((c) => {
                const nota = historialEst[claveCasilla(c.tipo, c.numero)];
                return nota && nota.nota !== null && nota.nota !== undefined && nota.nota !== "" ? Number(nota.nota) : "";
            });
            return [est.nombre || "-", ...valores];
        });

        const hoja = window.XLSX.utils.aoa_to_sheet([encabezado, ...filas]);
        // El nombre de hoja de Excel no puede pasar de 31 caracteres ni
        // llevar / \ ? * [ ].
        const nombreHoja = `${a.salon} - ${a.materia}`.replace(/[/\\?*[\]]/g, "-").slice(0, 31);
        window.XLSX.utils.book_append_sheet(wb, hoja, nombreHoja);
    }

    return window.XLSX.write(wb, { bookType: "xlsx", type: "base64" });
}

// Auto-guardado real: cada celda se guarda sola al salir de ella (blur)
// o al presionar Enter, sin necesidad de un botón "Guardar". Guardamos
// la promesa en curso para que, si el docente cambia de salón/materia/
// trimestre justo después de escribir, la recarga espere a que ese
// guardado termine antes de leer la base de datos otra vez (si no,
// podría leer "de más rápido" y mostrar la nota como si no se hubiera
// guardado, aunque en realidad sí se guardó un instante después).
let guardadoAutomaticoPendiente = null;

tablaNotasGrupo?.addEventListener("blur", (e) => {
    if (e.target.classList?.contains("input-nota-grupo")) {
        e.target.value = formatearNotaFinal(e.target.value);
        recalcularPromedios();
        guardadoAutomaticoPendiente = guardarNotas(true).finally(() => {
            guardadoAutomaticoPendiente = null;
        });
    }
}, true);

// Respaldo por si algo quedó sin guardar (ej. el profesor cerró la pestaña
// mientras seguía escribiendo en la misma celda sin salir de ella).
setInterval(() => {
    if (bloqueTablaNotas && bloqueTablaNotas.style.display !== "none") guardarNotas(true);
}, 30000);

// =========================================================
// 5) HISTORIAL DE NOTAS (funcionalidad que ya existía, ahora
//    filtrada a solo las materias que este profesor da)
// =========================================================

let todasLasNotas = [];

async function cargarHistorialNotas() {
    const contenedor = document.getElementById("listaEstudiantes");
    const misMaterias = new Set(misAsignaciones.map((a) => a.materia));

    if (misMaterias.size === 0) {
        contenedor.innerHTML = "<p>No hay notas para mostrar.</p>";
        return;
    }

    const { data: estudiantesPrueba } = await supabase.from("estudiantes").select("correo").eq("es_prueba", true);
    const correosDePrueba = new Set((estudiantesPrueba || []).map((e) => (e.correo || "").toLowerCase()).filter(Boolean));

    const { data, error } = await supabase
        .from("notas")
        .select("*")
        .in("materia", [...misMaterias])
        .is("eliminado_en", null)
        .order("created_at", { ascending: false });

    if (error) {
        console.error(error);
        contenedor.innerHTML = `<p style="color:red;">Error al cargar las notas: ${error.message}</p>`;
        return;
    }

    todasLasNotas = (data || []).filter((n) => !correosDePrueba.has((n.correo || "").toLowerCase()));

    actualizarResumen(todasLasNotas);
    renderizarTablaHistorial(todasLasNotas);

    const inputBuscar = document.getElementById("buscarCorreo");
    inputBuscar.addEventListener("input", () => {
        const filtro = inputBuscar.value.trim().toLowerCase();
        renderizarTablaHistorial(todasLasNotas.filter((n) => (n.correo || "").toLowerCase().includes(filtro)));
    });
}

function actualizarResumen(notas) {
    document.getElementById("totalNotas").textContent = notas.length;
    document.getElementById("totalEstudiantes").textContent = new Set(notas.map((n) => n.correo)).size;
}

function renderizarTablaHistorial(notas) {
    const contenedor = document.getElementById("listaEstudiantes");

    if (!notas || notas.length === 0) {
        contenedor.innerHTML = "<p>No hay notas para mostrar.</p>";
        return;
    }

    let html = `<table><tr><th>Correo</th><th>Materia</th><th>Tema</th><th>Tipo</th><th>Nota</th><th>Trimestre</th></tr>`;
    notas.forEach((nota) => {
        html += `<tr>
            <td>${escapeHtml(nota.correo)}</td>
            <td>${escapeHtml(nota.materia)}</td>
            <td>${escapeHtml(nota.tema || nota.actividad || "")}</td>
            <td>${escapeHtml(nota.tipo)}</td>
            <td>${escapeHtml(nota.nota)}</td>
            <td>${escapeHtml(nota.trimestre)}</td>
        </tr>`;
    });
    html += "</table>";
    contenedor.innerHTML = html;
}

// =========================================================
// 6) TRIMESTRE ACTIVO (calculado solo, según fechas configuradas
//    por el admin — el docente ya NO puede cambiarlo a mano)
// =========================================================

// Misma lógica que en admin.js: compara la fecha de hoy contra los
// 3 rangos configurados y devuelve cuál trimestre corresponde, o
// null si hoy cae en un hueco (ej. receso entre trimestres).
function calcularTrimestreActivo(fechas) {
    const hoy = new Date().toISOString().slice(0, 10);
    const rangos = [
        { nombre: "Trimestre 1", inicio: fechas.t1_inicio, fin: fechas.t1_fin },
        { nombre: "Trimestre 2", inicio: fechas.t2_inicio, fin: fechas.t2_fin },
        { nombre: "Trimestre 3", inicio: fechas.t3_inicio, fin: fechas.t3_fin }
    ];

    for (const rango of rangos) {
        if (!rango.inicio || !rango.fin) continue;
        if (hoy >= rango.inicio && hoy <= rango.fin) return rango.nombre;
    }
    return null;
}

async function cargarTrimestreActivo() {
    const { data, error } = await supabase
        .from("configuracion")
        .select("t1_inicio, t1_fin, t2_inicio, t2_fin, t3_inicio, t3_fin, trimestre_activo")
        .eq("id", 1)
        .single();

    if (error) { console.error(error); return; }
    if (!data) return;

    // Se calcula localmente a partir de las fechas; si por lo que sea
    // hoy no cae en ningún rango (fechas sin configurar, o receso),
    // se usa como respaldo el último trimestre_activo guardado.
    const trimestreCalculado = calcularTrimestreActivo(data) || data.trimestre_activo;

    if (trimestreCalculado && selectTrimestreNota) {
        selectTrimestreNota.value = trimestreCalculado;
    }

    const textoTrimestre = document.getElementById("textoTrimestreActivo");
    if (textoTrimestre) textoTrimestre.textContent = trimestreCalculado || "Sin definir";
}

// =========================================================
// EXPORTAR REPORTE (PDF y JPG) — membrete, notas malas en rojo, firma
// =========================================================

// Construye una tabla completa (TODAS las columnas de nota + los 3
// promedios) directamente desde los datos en memoria, sin importar si
// en pantalla el docente tiene activado "solo la casilla actual" o
// tiene ocultos los promedios. El reporte en PDF/JPG siempre debe verse
// completo, como un informe formal.

// Paleta del reporte: la misma familia de colores que usa el resto de
// la app (índigo), en vez del verde suelto que no combinaba con nada.
const REPORTE_COLOR_OSCURO = "#3730a3";
const REPORTE_COLOR_PRIMARIO = "#4f46e5";
const REPORTE_COLOR_CLARO = "#eef2ff";
const REPORTE_COLOR_TEXTO = "#1f2937";
const REPORTE_COLOR_BORDE = "#e2e2f0";
const REPORTE_FUENTE = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

function construirTablaReporteCompleta() {
    const tabla = document.createElement("table");

    const estiloThCabecera = `background:${REPORTE_COLOR_OSCURO}; color:#fff; padding:10px 8px; font-size:12.5px; font-weight:600; letter-spacing:.2px;`;
    const estiloThTema = `background:#2c2790; color:#d7d4fb; font-weight:400; font-size:10.5px; padding:5px 6px;`;

    const thead = document.createElement("thead");

    const trCabecera = document.createElement("tr");
    let htmlCabecera = `<th style="${estiloThCabecera} width:36px;">#</th><th style="${estiloThCabecera} text-align:left; min-width:190px;">Estudiante</th>`;
    casillasTabla.forEach((c) => {
        htmlCabecera += `<th style="${estiloThCabecera}">${etiquetaCasilla(c.tipo, c.numero)}</th>`;
    });
    htmlCabecera += `<th style="${estiloThCabecera} background:${REPORTE_COLOR_PRIMARIO};">Prom. Aprec.</th>`;
    htmlCabecera += `<th style="${estiloThCabecera} background:${REPORTE_COLOR_PRIMARIO};">Prom. Ejer.</th>`;
    htmlCabecera += `<th style="${estiloThCabecera} background:${REPORTE_COLOR_PRIMARIO};">Prom. Examen</th>`;
    htmlCabecera += `<th style="${estiloThCabecera} background:#22c55e;">Prom. Final</th>`;
    trCabecera.innerHTML = htmlCabecera;
    thead.appendChild(trCabecera);

    const trTemas = document.createElement("tr");
    let htmlTemas = `<th style="${estiloThTema}"></th><th style="${estiloThTema}"></th>`;
    casillasTabla.forEach((c) => {
        const tema = obtenerTemaCasilla(c.tipo, c.numero);
        htmlTemas += `<th style="${estiloThTema}">${escapeHtml(tema)}</th>`;
    });
    htmlTemas += `<th style="${estiloThTema}"></th><th style="${estiloThTema}"></th><th style="${estiloThTema}"></th><th style="${estiloThTema}"></th>`;
    trTemas.innerHTML = htmlTemas;
    thead.appendChild(trTemas);

    tabla.appendChild(thead);

    const tbody = document.createElement("tbody");

    grupoActual.forEach((est, i) => {
        const sinCuenta = !est.correo;
        const historial = historiaPorEstudiante[claveEstudiante(est)] || {};
        const apr = [], eje = [], exa = [];

        const fondoFila = sinCuenta ? "#fef9e7" : (i % 2 === 0 ? "#ffffff" : "#fafaff");

        const tr = document.createElement("tr");
        tr.style.backgroundColor = fondoFila;

        // Celda "#"
        const tdNum = document.createElement("td");
        tdNum.style.cssText = "text-align:center; padding:7px 6px; color:#6b7280; font-size:12px;";
        tdNum.textContent = String(i + 1);
        tr.appendChild(tdNum);

        // Celda del nombre: se arma con nodos DOM reales (no como texto
        // HTML concatenado) y cada parte (nombre y, si aplica, el
        // badge "SIN CUENTA") va en su propio <span> con
        // "display:inline-block". Esto evita un problema conocido de
        // html2canvas donde, al capturar la tabla, a veces "pierde" el
        // texto de una celda que combina texto normal + un span con
        // fondo de color, dejando solo el fondo visible y sin el
        // nombre del estudiante.
        const tdNombre = document.createElement("td");
        tdNombre.style.cssText = "text-align:left; padding:7px 10px; font-weight:500; white-space:normal; word-break:break-word;";

        const spanNombre = document.createElement("span");
        spanNombre.style.cssText = "display:inline-block;";
        if (est.nombre && est.nombre.trim()) {
            spanNombre.textContent = est.nombre;
        } else {
            spanNombre.textContent = "(Sin nombre registrado)";
            spanNombre.style.color = "#b91c1c";
            spanNombre.style.fontStyle = "italic";
        }
        tdNombre.appendChild(spanNombre);

        if (sinCuenta) {
            tdNombre.appendChild(document.createTextNode(" "));
            const spanBadge = document.createElement("span");
            spanBadge.style.cssText = "display:inline-block; white-space:nowrap; font-size:10px; font-weight:600; color:#92400e; background:#fde68a; padding:1px 6px; border-radius:8px;";
            spanBadge.textContent = "SIN CUENTA";
            tdNombre.appendChild(spanBadge);
        }
        tr.appendChild(tdNombre);

        // Celdas de notas
        casillasTabla.forEach((c) => {
            const claveCas = claveCasilla(c.tipo, c.numero);
            const n = historial[claveCas];
            const crudo = (n && n.nota !== null && n.nota !== undefined) ? n.nota : "";
            const valorStr = crudo === "" ? "" : formatearNotaFinal(String(crudo));
            const valorNum = valorStr === "" ? null : parseFloat(valorStr);
            if (valorNum !== null) {
                if (c.tipo === "apreciacion") apr.push(valorNum);
                else if (c.tipo === "examen") exa.push(valorNum);
                else eje.push(valorNum);
            }
            const bajo = valorNum !== null && valorNum < PROMEDIO_MINIMO_APROBAR;

            const tdNota = document.createElement("td");
            tdNota.style.cssText = "text-align:center; padding:7px 6px;";
            if (valorStr === "") {
                const span = document.createElement("span");
                span.style.color = "#b8bcc8";
                span.textContent = "–";
                tdNota.appendChild(span);
            } else if (bajo) {
                const span = document.createElement("span");
                span.style.cssText = "display:inline-block; min-width:26px; padding:2px 6px; border-radius:10px; background:#fee2e2; color:#b91c1c; font-weight:700;";
                span.textContent = valorStr;
                tdNota.appendChild(span);
            } else {
                const span = document.createElement("span");
                span.style.fontWeight = "500";
                span.textContent = valorStr;
                tdNota.appendChild(span);
            }
            tr.appendChild(tdNota);
        });

        const promApr = apr.length ? apr.reduce((a, b) => a + b, 0) / apr.length : null;
        const promEje = eje.length ? eje.reduce((a, b) => a + b, 0) / eje.length : null;
        const promExa = exa.length ? exa.reduce((a, b) => a + b, 0) / exa.length : null;
        const presentes = [promApr, promEje, promExa].filter((v) => v !== null);
        const promFinal = presentes.length ? presentes.reduce((a, b) => a + b, 0) / presentes.length : null;

        const agregarCeldaProm = (val, esFinal) => {
            const td = document.createElement("td");
            const fondo = esFinal ? "#f0fdf4" : "#f8f8fd";
            if (val === null) {
                td.style.cssText = `text-align:center; padding:7px 6px; background:${fondo};`;
                const span = document.createElement("span");
                span.style.color = "#b8bcc8";
                span.textContent = "–";
                td.appendChild(span);
            } else {
                const bajo = val < PROMEDIO_MINIMO_APROBAR;
                const color = bajo ? "#b91c1c" : (esFinal ? "#15803d" : REPORTE_COLOR_OSCURO);
                td.style.cssText = `text-align:center; padding:7px 6px; font-weight:700; color:${color}; background:${fondo};`;
                td.textContent = val.toFixed(1);
            }
            tr.appendChild(td);
        };
        agregarCeldaProm(promApr, false);
        agregarCeldaProm(promEje, false);
        agregarCeldaProm(promExa, false);
        agregarCeldaProm(promFinal, true);

        tbody.appendChild(tr);
    });

    tabla.appendChild(tbody);

    tabla.querySelectorAll("th, td").forEach((cell) => {
        cell.style.border = `1px solid ${REPORTE_COLOR_BORDE}`;
    });

    return tabla;
}

// Calcula estadísticas rápidas del grupo (promedio general del salón y
// cuántos estudiantes están por debajo del mínimo para aprobar), usando
// exactamente la misma lógica de promedios que la tabla del reporte.
function calcularResumenReporte() {
    let sumaFinales = 0, conFinal = 0, reprobados = 0;
    grupoActual.forEach((est) => {
        const historial = historiaPorEstudiante[claveEstudiante(est)] || {};
        const apr = [], eje = [], exa = [];
        casillasTabla.forEach((c) => {
            const n = historial[claveCasilla(c.tipo, c.numero)];
            const crudo = (n && n.nota !== null && n.nota !== undefined) ? n.nota : "";
            if (crudo === "") return;
            const valorNum = parseFloat(formatearNotaFinal(String(crudo)));
            if (Number.isNaN(valorNum)) return;
            if (c.tipo === "apreciacion") apr.push(valorNum);
            else if (c.tipo === "examen") exa.push(valorNum);
            else eje.push(valorNum);
        });
        const promedios = [apr, eje, exa]
            .filter((lista) => lista.length)
            .map((lista) => lista.reduce((a, b) => a + b, 0) / lista.length);
        if (!promedios.length) return;
        const promFinal = promedios.reduce((a, b) => a + b, 0) / promedios.length;
        sumaFinales += promFinal;
        conFinal++;
        if (promFinal < PROMEDIO_MINIMO_APROBAR) reprobados++;
    });
    return {
        totalEstudiantes: grupoActual.length,
        promedioGeneral: conFinal ? sumaFinales / conFinal : null,
        reprobados,
        aprobados: conFinal - reprobados,
    };
}

function construirReporteHtml() {
    const salon = selectSalonNota.value;
    const materia = selectMateriaNota.value;
    const trimestre = selectTrimestreNota.value;
    const fechaHoyTexto = new Date().toLocaleDateString("es-PA", { year: "numeric", month: "long", day: "numeric" });
    const horaHoyTexto = new Date().toLocaleTimeString("es-PA", { hour: "2-digit", minute: "2-digit" });

    const tablaReporte = construirTablaReporteCompleta();
    const resumen = calcularResumenReporte();

    const dato = (etiqueta, valor) => `
        <div style="flex:1; min-width:150px;">
            <div style="font-size:10.5px; text-transform:uppercase; letter-spacing:.5px; color:#9691e8; font-weight:600;">${etiqueta}</div>
            <div style="font-size:14.5px; font-weight:600; color:#1f2937; margin-top:2px;">${valor}</div>
        </div>`;

    const estadistica = (numero, etiqueta, color) => `
        <div style="text-align:center; padding:0 18px;">
            <div style="font-size:22px; font-weight:700; color:${color};">${numero}</div>
            <div style="font-size:10.5px; color:#6b7280; text-transform:uppercase; letter-spacing:.3px;">${etiqueta}</div>
        </div>`;

    const contenedor = document.createElement("div");
    contenedor.style.cssText = `background:#fff; width:1050px; font-family:${REPORTE_FUENTE}; color:${REPORTE_COLOR_TEXTO};`;
    contenedor.innerHTML = `
        <div style="background:linear-gradient(135deg, ${REPORTE_COLOR_PRIMARIO} 0%, ${REPORTE_COLOR_OSCURO} 100%); padding:26px 32px; display:flex; align-items:center; justify-content:space-between;">
            <div>
                <div style="font-size:20px; font-weight:700; color:#fff; letter-spacing:.2px;">🏫 Centro Básico General El Jiral</div>
                <div style="font-size:13px; color:#d9d7fb; margin-top:4px;">Reporte oficial de notas</div>
            </div>
            <div style="text-align:right;">
                <div style="font-size:12px; color:#d9d7fb;">${fechaHoyTexto}</div>
                <div style="display:inline-block; margin-top:6px; background:rgba(255,255,255,0.18); color:#fff; font-size:12px; font-weight:600; padding:4px 12px; border-radius:14px;">${escapeHtml(trimestre)}</div>
            </div>
        </div>

        <div style="padding:18px 32px 4px; display:flex; flex-wrap:wrap; gap:18px; background:${REPORTE_COLOR_CLARO}; border-bottom:1px solid ${REPORTE_COLOR_BORDE};">
            ${dato("Profesor(a)", escapeHtml(nombreProfesor))}
            ${dato("Materia", escapeHtml(materia))}
            ${dato("Salón", escapeHtml(salon))}
            ${dato("Estudiantes", resumen.totalEstudiantes)}
        </div>

        <div style="display:flex; justify-content:center; gap:6px; padding:16px 32px; border-bottom:1px solid ${REPORTE_COLOR_BORDE};">
            ${estadistica(resumen.promedioGeneral !== null ? resumen.promedioGeneral.toFixed(1) : "–", "Promedio general", REPORTE_COLOR_OSCURO)}
            ${estadistica(resumen.aprobados, "Aprobados", "#15803d")}
            ${estadistica(resumen.reprobados, "Por debajo del mínimo", "#b91c1c")}
        </div>

        <div style="padding:20px 32px 0;">
            <div id="tablaReporteContenedor" style="box-shadow:0 1px 3px rgba(0,0,0,0.08);"></div>
            <div style="margin-top:10px; font-size:11px; color:#6b7280; display:flex; align-items:center; gap:6px;">
                <span style="display:inline-block; width:10px; height:10px; border-radius:5px; background:#fee2e2; border:1px solid #fecaca;"></span>
                Notas en rojo: por debajo del mínimo para aprobar (${PROMEDIO_MINIMO_APROBAR.toFixed(1)})
            </div>
        </div>

        <div style="padding:50px 32px 28px; display:flex; justify-content:center;">
            <div style="text-align:center;">
                <div style="border-top:1px solid #9ca3af; width:280px; margin-bottom:6px;"></div>
                <div style="font-size:12.5px; color:#4b5563;">Firma del/de la docente</div>
            </div>
        </div>

        <div style="border-top:1px solid ${REPORTE_COLOR_BORDE}; padding:12px 32px; display:flex; justify-content:space-between; font-size:10.5px; color:#9ca3af;">
            <span>Generado el ${fechaHoyTexto} a las ${horaHoyTexto}</span>
            <span>Sistema de Control de Notas · Centro Básico General El Jiral</span>
        </div>
    `;
    contenedor.querySelector("#tablaReporteContenedor").appendChild(tablaReporte);
    tablaReporte.style.width = "100%";
    tablaReporte.style.borderCollapse = "collapse";

    return contenedor;
}

async function generarCanvasReporte() {
    const contenedor = construirReporteHtml();
    contenedor.style.position = "fixed";
    contenedor.style.left = "-99999px";
    contenedor.style.top = "0";
    document.body.appendChild(contenedor);

    try {
        // Antes de tomar la "foto" de la tabla, esperamos a que las
        // fuentes terminen de cargar y le damos al navegador dos vueltas
        // de pintado (requestAnimationFrame x2). Sin esto, a veces
        // html2canvas captura la tabla a medio calcular y el texto de
        // alguna celda (típicamente un nombre junto a un badge de color)
        // sale en blanco aunque el fondo de color sí se vea.
        if (document.fonts && document.fonts.ready) {
            await document.fonts.ready;
        }
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        const canvas = await html2canvas(contenedor, { scale: 3, backgroundColor: "#ffffff" });
        return canvas;
    } finally {
        contenedor.remove();
    }
}

btnExportarPdf?.addEventListener("click", async () => {
    if (!selectSalonNota.value || !selectMateriaNota.value) return alert("Primero carga un salón y materia.");
    btnExportarPdf.disabled = true;
    btnExportarPdf.innerHTML = `<span class="btn-exportar-icono">⏳</span><span class="btn-exportar-texto">Generando PDF...</span>`;
    try {
        const canvas = await generarCanvasReporte();
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const ratio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
        const w = canvas.width * ratio;
        const h = canvas.height * ratio;
        const y = Math.max(16, (pageHeight - h) / 2);
        pdf.addImage(canvas.toDataURL("image/jpeg", 1.0), "JPEG", (pageWidth - w) / 2, y, w, h);
        pdf.save(`Notas_${selectMateriaNota.value}_${selectSalonNota.value}.pdf`);
    } catch (err) {
        console.error(err);
        alert("No se pudo generar el PDF: " + err.message);
    } finally {
        btnExportarPdf.disabled = false;
        btnExportarPdf.innerHTML = `<span class="btn-exportar-icono">📄</span><span class="btn-exportar-texto">Descargar PDF</span>`;
    }
});

btnExportarJpg?.addEventListener("click", async () => {
    if (!selectSalonNota.value || !selectMateriaNota.value) return alert("Primero carga un salón y materia.");
    btnExportarJpg.disabled = true;
    btnExportarJpg.innerHTML = `<span class="btn-exportar-icono">⏳</span><span class="btn-exportar-texto">Generando JPG...</span>`;
    try {
        const canvas = await generarCanvasReporte();
        const enlace = document.createElement("a");
        enlace.download = `Notas_${selectMateriaNota.value}_${selectSalonNota.value}.jpg`;
        enlace.href = canvas.toDataURL("image/jpeg", 1.0);
        enlace.click();
    } catch (err) {
        console.error(err);
        alert("No se pudo generar el JPG: " + err.message);
    } finally {
        btnExportarJpg.disabled = false;
        btnExportarJpg.innerHTML = `<span class="btn-exportar-icono">🖼️</span><span class="btn-exportar-texto">Descargar JPG</span>`;
    }
});

// =========================================================
// INICIO
// =========================================================

// =========================================================
// 7) CONTROL DE ANCHO DE LAS CASILLAS DE NOTA (ajuste manual)
// =========================================================

const rangoAnchoCasilla = document.getElementById("rangoAnchoCasilla");
const valorAnchoCasilla = document.getElementById("valorAnchoCasilla");
const CLAVE_ANCHO_CASILLA = "controlNotas_anchoCasilla";

function aplicarAnchoCasilla(px) {
    document.documentElement.style.setProperty("--ancho-celda-nota", `${px}px`);
    if (valorAnchoCasilla) valorAnchoCasilla.textContent = `${px}px`;
}

function iniciarControlAnchoCasilla() {
    if (!rangoAnchoCasilla) return;

    const guardado = localStorage.getItem(CLAVE_ANCHO_CASILLA);
    const inicial = guardado ? parseInt(guardado, 10) : 68;
    rangoAnchoCasilla.value = inicial;
    aplicarAnchoCasilla(inicial);

    rangoAnchoCasilla.addEventListener("input", () => {
        const px = parseInt(rangoAnchoCasilla.value, 10);
        aplicarAnchoCasilla(px);
        localStorage.setItem(CLAVE_ANCHO_CASILLA, String(px));
    });
}

(async function init() {
    const ok = await verificarSesion();
    if (!ok) return;

    pintarCambiarPanel("profesor", "oscuro-sobre-claro");
    poblarSelectSalon();
    cargarTrimestreActivo();
    iniciarControlAnchoCasilla();
})();
