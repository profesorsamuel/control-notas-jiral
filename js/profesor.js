import { supabase } from "./supabase.js";
import { pintarCambiarPanel } from "./roles.js";

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
// limita cualquier valor al rango 0–5.
function formatearNotaFinal(valor) {
    const texto = (valor ?? "").trim();
    if (texto === "" || texto === ".") return "";

    let num = parseFloat(texto);
    if (isNaN(num)) return "";

    if (num < 0) num = 0;
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
const btnCargarSalon = document.getElementById("btnCargarSalon");
const bloqueTablaNotas = document.getElementById("bloqueTablaNotas");
const cabeceraNotasGrupo = document.getElementById("cabeceraNotasGrupo");
const cabeceraTemasGrupo = document.getElementById("cabeceraTemasGrupo");
const tablaNotasGrupo = document.getElementById("tablaNotasGrupo");
const btnGuardarNotasGrupo = document.getElementById("btnGuardarNotasGrupo");
const estadoGuardadoNotas = document.getElementById("estadoGuardadoNotas");
const avisoSinAsignaciones = document.getElementById("avisoSinAsignaciones");
const checkBloqueoEstudiantes = document.getElementById("checkBloqueoEstudiantes");
const listaChecksColumnas = document.getElementById("listaChecksColumnas");
const btnColumnasSeleccionarTodas = document.getElementById("btnColumnasSeleccionarTodas");
const btnColumnasSeleccionarNinguna = document.getElementById("btnColumnasSeleccionarNinguna");
const btnExportarPdf = document.getElementById("btnExportarPdf");
const btnExportarJpg = document.getElementById("btnExportarJpg");

function poblarSelectSalon() {
    const salones = [...new Set(misAsignaciones.map((a) => a.salon))].sort();

    if (salones.length === 0) {
        selectSalonNota.innerHTML = `<option value="">No tienes salones asignados</option>`;
        selectSalonNota.disabled = true;
        avisoSinAsignaciones.style.display = "block";
        return;
    }

    avisoSinAsignaciones.style.display = "none";
    selectSalonNota.innerHTML =
        `<option value="">Seleccione un salón</option>` +
        salones.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
    selectSalonNota.disabled = false;
}

function poblarSelectMateria() {
    const salon = selectSalonNota.value;

    if (!salon) {
        selectMateriaNota.innerHTML = `<option value="">Seleccione primero un salón</option>`;
        selectMateriaNota.disabled = true;
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
        btnCargarSalon.click();
        return;
    }

    selectMateriaNota.innerHTML =
        `<option value="">Seleccione una materia</option>` +
        materias.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
    selectMateriaNota.disabled = false;
}

selectSalonNota?.addEventListener("change", poblarSelectMateria);

// =========================================================
// 3) TABLA DE ESTUDIANTES CON NOTAS EDITABLES (misma lógica del admin)
// =========================================================

let grupoActual = [];
let historiaPorEstudiante = {};
let casillasTabla = [];
let temasCasillasBD = {};

function claveEstudiante(est) {
    return est.correo ? `correo:${est.correo}` : `id:${est.id}`;
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

async function eliminarColumnaCasilla(tipo, numero) {
    const salon = selectSalonNota.value;
    const materia = selectMateriaNota.value;
    const trimestre = selectTrimestreNota.value;
    const etiqueta = etiquetaCasilla(tipo, numero);

    if (!confirm(`¿Enviar la casilla "${etiqueta}" (${materia} - ${salon}) a la papelera?\n\nLas notas no se pierden: quedan guardadas en la papelera y puedes restaurarlas cuando quieras.`)) return;

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

    estadoGuardadoNotas.textContent = `🗑️ Casilla ${etiqueta} movida a la papelera.`;
    estadoGuardadoNotas.className = "small text-success";
    btnCargarSalon.click();
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
    btnCargarSalon.click();
}

btnPapelera?.addEventListener("click", () => {
    const abrir = panelPapelera.style.display === "none";
    panelPapelera.style.display = abrir ? "block" : "none";
    if (abrir) cargarPapelera();
});

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

        const enRiesgoFinal = promFinal !== null && promFinal < PROMEDIO_MINIMO_APROBAR;
        tr.classList.toggle("table-danger", enRiesgoFinal);
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
    const todosLosItems = [...itemsCasillas, ...PROMEDIOS_SELECCIONABLES];

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
    renderizarListaChecksColumnas();
    renderTabla();
});

function renderTabla() {
    if (grupoActual.length === 0) {
        cabeceraNotasGrupo.innerHTML = `<th class="col-fija col-fija-num">#</th><th class="col-fija col-fija-nombre">Estudiante</th>`;
        cabeceraTemasGrupo.innerHTML = "";
        tablaNotasGrupo.innerHTML = `<tr><td colspan="2" class="text-center text-muted py-3">Este salón aún no tiene estudiantes cargados.</td></tr>`;
        return;
    }

    const claveSel = claveCasilla(selectTipoNota.value, parseInt(inputNumeroNota.value, 10));

    // Si la casilla que el docente seleccionó arriba (Tipo + Número)
    // todavía no tiene ninguna nota guardada, no aparecerá en
    // casillasTabla; la agregamos igual para que la columna esté lista
    // para escribir desde el primer momento.
    if (!casillasTabla.some((c) => claveCasilla(c.tipo, c.numero) === claveSel)) {
        casillasTabla.push({ tipo: selectTipoNota.value, numero: parseInt(inputNumeroNota.value, 10) });
        ordenarCasillas(casillasTabla);
    }

    // Cada columna (de nota o de promedio) se muestra u oculta según lo
    // que el docente haya marcado en el panel "Elegir columnas para ver".
    const columnasVisibles = casillasTabla.filter((c) => !columnasOcultas.has(claveCasilla(c.tipo, c.numero)));
    const mostrarPromApr = !columnasOcultas.has(CLAVE_PROM_APREC);
    const mostrarPromEje = !columnasOcultas.has(CLAVE_PROM_EJER);
    const mostrarPromExa = !columnasOcultas.has(CLAVE_PROM_EXAMEN);
    const mostrarPromFinal = !columnasOcultas.has(CLAVE_PROM_FINAL);

    renderizarListaChecksColumnas();

    let htmlCabecera = `<th class="col-fija col-fija-num">#</th><th class="col-fija col-fija-nombre">Estudiante</th>`;
    columnasVisibles.forEach((c) => {
        const sel = claveCasilla(c.tipo, c.numero) === claveSel;
        htmlCabecera += `
            <th class="text-center small ${sel ? "table-primary text-primary" : "text-muted"}" style="width:90px;">
                <div>${etiquetaCasilla(c.tipo, c.numero)}</div>
                <button type="button" class="btn btn-link btn-sm p-0 text-danger btn-eliminar-columna" data-tipo="${c.tipo}" data-numero="${c.numero}" title="Eliminar esta columna">🗑️</button>
            </th>`;
    });
    if (mostrarPromApr) htmlCabecera += `<th class="text-center small fw-bold" style="width:85px;">Prom. Aprec.</th>`;
    if (mostrarPromEje) htmlCabecera += `<th class="text-center small fw-bold" style="width:85px;">Prom. Ejer.</th>`;
    if (mostrarPromExa) htmlCabecera += `<th class="text-center small fw-bold" style="width:85px;">Prom. Examen</th>`;
    if (mostrarPromFinal) htmlCabecera += `<th class="text-center small fw-bold table-success" style="width:90px;">Prom. Final</th>`;
    cabeceraNotasGrupo.innerHTML = htmlCabecera;

    let htmlTemas = `<th class="col-fija col-fija-num"></th><th class="col-fija col-fija-nombre small text-muted fw-normal">Tema de cada casilla:</th>`;
    columnasVisibles.forEach((c) => {
        const tema = obtenerTemaCasilla(c.tipo, c.numero);
        htmlTemas += `
            <th style="padding:2px 4px;">
                <input type="text" class="form-control form-control-sm input-tema-columna"
                    data-tipo="${c.tipo}" data-numero="${c.numero}" data-tema-guardado="${escapeHtml(tema)}"
                    value="${escapeHtml(tema)}" placeholder="Ej: Proyecto 2" style="font-size:11px; font-weight:normal;">
            </th>`;
    });
    [mostrarPromApr, mostrarPromEje, mostrarPromExa, mostrarPromFinal].forEach((mostrar) => {
        if (mostrar) htmlTemas += `<th></th>`;
    });
    cabeceraTemasGrupo.innerHTML = htmlTemas;

    tablaNotasGrupo.innerHTML = grupoActual.map((est, i) => {
        const sinCuenta = !est.correo;
        const historial = historiaPorEstudiante[claveEstudiante(est)] || {};

        const columnas = columnasVisibles.map((c, colIndex) => {
            const claveCas = claveCasilla(c.tipo, c.numero);
            const n = historial[claveCas];
            const crudo = (n && n.nota !== null && n.nota !== undefined) ? n.nota : "";
            const valor = crudo === "" ? "" : formatearNotaFinal(String(crudo));
            return `
                <td class="celda-nota">
                    <input type="text" inputmode="decimal" class="form-control form-control-sm input-nota-grupo"
                        data-col="${colIndex}" data-correo="${sinCuenta ? "" : escapeHtml(est.correo)}"
                        data-estudiante-id="${sinCuenta ? escapeHtml(est.id) : ""}" data-nota-id="${n ? n.id : ""}"
                        data-tipo="${c.tipo}" data-numero="${c.numero}" data-ultimo-valor-guardado="${valor}"
                        value="${valor}" placeholder="–">
                </td>`;
        }).join("");

        return `
            <tr class="${sinCuenta ? "table-warning" : ""}" data-clave-estudiante="${escapeHtml(claveEstudiante(est))}">
                <td class="col-fija col-fija-num">${i + 1}</td>
                <td class="col-fija col-fija-nombre">${escapeHtml(est.nombre)}${sinCuenta ? ' <span class="badge bg-warning text-dark">Sin cuenta</span>' : ""}</td>
                ${columnas}
                ${mostrarPromApr ? `<td class="celda-prom-apr text-center fw-bold">–</td>` : ""}
                ${mostrarPromEje ? `<td class="celda-prom-eje text-center fw-bold">–</td>` : ""}
                ${mostrarPromExa ? `<td class="celda-prom-examen text-center fw-bold">–</td>` : ""}
                ${mostrarPromFinal ? `<td class="celda-prom-final text-center fw-bold table-success bg-opacity-25">–</td>` : ""}
            </tr>`;
    }).join("");

    recalcularPromedios();

    cabeceraNotasGrupo.querySelectorAll(".btn-eliminar-columna").forEach((btn) => {
        btn.addEventListener("click", () => eliminarColumnaCasilla(btn.dataset.tipo, parseInt(btn.dataset.numero, 10)));
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
selectTipoNota?.addEventListener("change", () => {
    if (grupoActual.length > 0) renderTabla();
});
inputNumeroNota?.addEventListener("input", () => {
    if (grupoActual.length > 0) renderTabla();
});

btnCargarSalon?.addEventListener("click", async () => {
    const salon = selectSalonNota.value;
    const materia = selectMateriaNota.value;
    const tipo = selectTipoNota.value;
    const numero = parseInt(inputNumeroNota.value, 10);
    const trimestre = selectTrimestreNota.value;

    if (!salon) return alert("Selecciona un salón.");
    if (!materia) return alert("Selecciona una materia.");

    const esMia = misAsignaciones.some((a) => a.salon === salon && a.materia === materia);
    if (!esMia) return alert("Esa materia/salón no está asignada a tu cuenta.");

    const textoOriginal = btnCargarSalon.innerHTML;
    btnCargarSalon.disabled = true;
    btnCargarSalon.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Cargando...`;

    const { data: estudiantesSalon, error: errEst } = await supabase
        .from("estudiantes")
        .select("id, codigo, nombre, correo, es_prueba")
        .eq("salon", salon)
        .order("nombre", { ascending: true });

    if (errEst) {
        alert("Error al cargar estudiantes: " + errEst.message);
        btnCargarSalon.disabled = false;
        btnCargarSalon.innerHTML = textoOriginal;
        return;
    }

    grupoActual = (estudiantesSalon || []).filter((e) => !e.es_prueba);

    const correos = grupoActual.map((e) => e.correo).filter(Boolean);
    const idsSinCuenta = grupoActual.filter((e) => !e.correo).map((e) => e.id);

    historiaPorEstudiante = {};
    const casillasEncontradas = new Set();

    function registrar(clave, n) {
        (historiaPorEstudiante[clave] ??= {})[claveCasilla(n.tipo, n.numero)] = n;
        casillasEncontradas.add(claveCasilla(n.tipo, n.numero));
    }

    if (correos.length > 0) {
        const { data } = await supabase.from("notas").select("id, correo, tipo, numero, nota, tema")
            .eq("materia", materia).eq("trimestre", trimestre).in("correo", correos)
            .is("eliminado_en", null);
        (data || []).forEach((n) => registrar(`correo:${n.correo}`, n));
    }
    if (idsSinCuenta.length > 0) {
        const { data } = await supabase.from("notas").select("id, estudiante_id, tipo, numero, nota, tema")
            .eq("materia", materia).eq("trimestre", trimestre).in("estudiante_id", idsSinCuenta)
            .is("eliminado_en", null);
        (data || []).forEach((n) => registrar(`id:${n.estudiante_id}`, n));
    }

    temasCasillasBD = {};
    const { data: temas } = await supabase.from("temas_casillas").select("tipo, numero, tema")
        .eq("salon", salon).eq("materia", materia).eq("trimestre", trimestre)
        .is("eliminado_en", null);
    (temas || []).forEach((t) => {
        temasCasillasBD[claveCasilla(t.tipo, t.numero)] = t.tema || "";
        if (t.tema) casillasEncontradas.add(claveCasilla(t.tipo, t.numero));
    });

    casillasEncontradas.add(claveCasilla(tipo, numero));
    casillasTabla = [...casillasEncontradas].map((c) => {
        const sep = c.lastIndexOf("-");
        return { tipo: c.slice(0, sep), numero: parseInt(c.slice(sep + 1), 10) };
    });
    ordenarCasillas(casillasTabla);

    const { data: filaAsignacion } = await supabase
        .from("profesor_materias")
        .select("bloqueado_para_estudiantes")
        .eq("correo_profesor", correoProfesor).eq("materia", materia).eq("salon", salon)
        .maybeSingle();
    bloqueoActual = !!filaAsignacion?.bloqueado_para_estudiantes;
    if (checkBloqueoEstudiantes) checkBloqueoEstudiantes.checked = bloqueoActual;

    renderTabla();
    bloqueTablaNotas.style.display = "block";

    if (panelPapelera && panelPapelera.style.display !== "none") {
        cargarPapelera();
    }

    btnCargarSalon.disabled = false;
    btnCargarSalon.innerHTML = textoOriginal;
});

// =========================================================
// 4) GUARDAR NOTAS
// =========================================================

// Después de guardar una nota (nueva o editada) en la base de datos,
// actualizamos también nuestra copia en memoria (historiaPorEstudiante)
// para que los promedios y cualquier otra vista que dependa de esos
// datos reflejen el cambio al instante, sin tener que volver a
// presionar "Cargar salón".
function actualizarHistorialEnMemoria(item, temaPorCasilla, idInsertado) {
    const claveEst = item.correo ? `correo:${item.correo}` : `id:${item.estudianteId}`;
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

    if (!esAutomatico) btnCargarSalon.click();
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
const MINUTOS_INACTIVIDAD_RESPALDO = 30;

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

checkBloqueoEstudiantes?.addEventListener("change", async () => {
    const salon = selectSalonNota.value;
    const materia = selectMateriaNota.value;
    if (!salon || !materia) return;

    bloqueoActual = checkBloqueoEstudiantes.checked;
    const { error } = await supabase
        .from("profesor_materias")
        .update({ bloqueado_para_estudiantes: bloqueoActual })
        .eq("correo_profesor", correoProfesor).eq("materia", materia).eq("salon", salon);

    if (error) {
        estadoGuardadoNotas.textContent = "❌ No se pudo guardar el candado: " + error.message;
        estadoGuardadoNotas.className = "small text-danger";
        checkBloqueoEstudiantes.checked = !bloqueoActual;
        bloqueoActual = !bloqueoActual;
        return;
    }

    estadoGuardadoNotas.textContent = bloqueoActual
        ? "🔒 Los estudiantes ya no pueden agregar notas en esta materia/salón."
        : "🔓 Los estudiantes pueden volver a agregar notas donde no haya nota tuya.";
    estadoGuardadoNotas.className = "small text-success";
});

// Auto-guardado real: cada celda se guarda sola al salir de ella (blur)
// o al presionar Enter, sin necesidad de un botón "Guardar".
tablaNotasGrupo?.addEventListener("blur", (e) => {
    if (e.target.classList?.contains("input-nota-grupo")) {
        e.target.value = formatearNotaFinal(e.target.value);
        recalcularPromedios();
        guardarNotas(true);
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
// 6) TRIMESTRE ACTIVO (funcionalidad que ya existía)
// =========================================================

const selectTrimestre = document.getElementById("selectTrimestre");
const btnGuardarTrimestre = document.getElementById("btnGuardarTrimestre");
const estadoTrimestre = document.getElementById("estadoTrimestre");

async function cargarTrimestreActivo() {
    const { data, error } = await supabase.from("configuracion").select("trimestre_activo").eq("id", 1).single();
    if (error) { console.error(error); return; }
    if (data) {
        selectTrimestre.value = data.trimestre_activo;
        if (selectTrimestreNota) selectTrimestreNota.value = data.trimestre_activo;
    }
}

btnGuardarTrimestre?.addEventListener("click", async () => {
    const trimestreSeleccionado = selectTrimestre.value;
    btnGuardarTrimestre.disabled = true;
    estadoTrimestre.style.color = "#198754";
    estadoTrimestre.textContent = "Guardando...";

    const { error } = await supabase.from("configuracion").update({ trimestre_activo: trimestreSeleccionado }).eq("id", 1);
    btnGuardarTrimestre.disabled = false;

    if (error) {
        estadoTrimestre.style.color = "#dc3545";
        estadoTrimestre.textContent = "❌ Error al guardar";
    } else {
        estadoTrimestre.style.color = "#198754";
        estadoTrimestre.textContent = "✅ Guardado";
    }
    setTimeout(() => { estadoTrimestre.textContent = ""; }, 2000);
});

// =========================================================
// EXPORTAR REPORTE (PDF y JPG) — membrete, notas malas en rojo, firma
// =========================================================

// Construye una tabla completa (TODAS las columnas de nota + los 3
// promedios) directamente desde los datos en memoria, sin importar si
// en pantalla el docente tiene activado "solo la casilla actual" o
// tiene ocultos los promedios. El reporte en PDF/JPG siempre debe verse
// completo, como un informe formal.
function construirTablaReporteCompleta() {
    const tabla = document.createElement("table");

    const thead = document.createElement("thead");

    const trCabecera = document.createElement("tr");
    let htmlCabecera = `<th style="background:#2f6f62; color:#fff; padding:6px;">#</th><th style="background:#2f6f62; color:#fff; padding:6px;">Estudiante</th>`;
    casillasTabla.forEach((c) => {
        htmlCabecera += `<th style="background:#2f6f62; color:#fff; padding:6px;">${etiquetaCasilla(c.tipo, c.numero)}</th>`;
    });
    htmlCabecera += `<th style="background:#2f6f62; color:#fff; padding:6px;">Prom. Aprec.</th>`;
    htmlCabecera += `<th style="background:#2f6f62; color:#fff; padding:6px;">Prom. Ejer.</th>`;
    htmlCabecera += `<th style="background:#2f6f62; color:#fff; padding:6px;">Prom. Examen</th>`;
    htmlCabecera += `<th style="background:#2f6f62; color:#fff; padding:6px;">Prom. Final</th>`;
    trCabecera.innerHTML = htmlCabecera;
    thead.appendChild(trCabecera);

    const trTemas = document.createElement("tr");
    let htmlTemas = `<th style="background:#2f6f62;"></th><th style="background:#2f6f62;"></th>`;
    casillasTabla.forEach((c) => {
        const tema = obtenerTemaCasilla(c.tipo, c.numero);
        htmlTemas += `<th style="background:#2f6f62; color:#e3efec; font-weight:normal; font-size:11px; padding:4px;">${escapeHtml(tema)}</th>`;
    });
    htmlTemas += `<th style="background:#2f6f62;"></th><th style="background:#2f6f62;"></th><th style="background:#2f6f62;"></th><th style="background:#2f6f62;"></th>`;
    trTemas.innerHTML = htmlTemas;
    thead.appendChild(trTemas);

    tabla.appendChild(thead);

    const tbody = document.createElement("tbody");

    grupoActual.forEach((est, i) => {
        const sinCuenta = !est.correo;
        const historial = historiaPorEstudiante[claveEstudiante(est)] || {};
        const apr = [], eje = [], exa = [];

        let htmlCeldas = "";
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
            htmlCeldas += `<td style="text-align:center; padding:6px; ${bajo ? "color:#c0392b; font-weight:bold;" : ""}">${valorStr === "" ? "–" : valorStr}</td>`;
        });

        const promApr = apr.length ? apr.reduce((a, b) => a + b, 0) / apr.length : null;
        const promEje = eje.length ? eje.reduce((a, b) => a + b, 0) / eje.length : null;
        const promExa = exa.length ? exa.reduce((a, b) => a + b, 0) / exa.length : null;
        const presentes = [promApr, promEje, promExa].filter((v) => v !== null);
        const promFinal = presentes.length ? presentes.reduce((a, b) => a + b, 0) / presentes.length : null;

        const celdaProm = (val) => {
            if (val === null) return `<td style="text-align:center; padding:6px;">–</td>`;
            const bajo = val < PROMEDIO_MINIMO_APROBAR;
            return `<td style="text-align:center; padding:6px; font-weight:bold; ${bajo ? "color:#c0392b;" : ""}">${val.toFixed(1)}</td>`;
        };

        const tr = document.createElement("tr");
        if (sinCuenta) tr.style.backgroundColor = "#fdf3d6";
        tr.innerHTML =
            `<td style="text-align:center; padding:6px;">${i + 1}</td>` +
            `<td style="text-align:left; padding:6px;">${escapeHtml(est.nombre)}${sinCuenta ? " (Sin cuenta)" : ""}</td>` +
            htmlCeldas +
            celdaProm(promApr) + celdaProm(promEje) + celdaProm(promExa) + celdaProm(promFinal);
        tbody.appendChild(tr);
    });

    tabla.appendChild(tbody);

    tabla.querySelectorAll("th, td").forEach((cell) => {
        cell.style.border = "1px solid #ccc";
    });

    return tabla;
}

function construirReporteHtml() {
    const salon = selectSalonNota.value;
    const materia = selectMateriaNota.value;
    const trimestre = selectTrimestreNota.value;
    const fechaHoyTexto = new Date().toLocaleDateString("es-PA", { year: "numeric", month: "long", day: "numeric" });

    const tablaReporte = construirTablaReporteCompleta();

    const contenedor = document.createElement("div");
    contenedor.style.cssText = "background:#fff; padding:24px; width:1000px; font-family:Arial, sans-serif; color:#222;";
    contenedor.innerHTML = `
        <div style="text-align:center; margin-bottom:14px;">
            <h2 style="margin:0; color:#1f4e79;">🏫 CENTRO BÁSICO GENERAL EL JIRAL</h2>
            <p style="margin:4px 0 0; font-size:14px;">Reporte de notas · ${fechaHoyTexto}</p>
        </div>
        <table style="width:100%; margin-bottom:14px; font-size:13px;">
            <tr>
                <td><strong>Profesor(a):</strong> ${escapeHtml(nombreProfesor)}</td>
                <td><strong>Materia:</strong> ${escapeHtml(materia)}</td>
            </tr>
            <tr>
                <td><strong>Salón:</strong> ${escapeHtml(salon)}</td>
                <td><strong>Trimestre activo:</strong> ${escapeHtml(trimestre)}</td>
            </tr>
        </table>
        <div id="tablaReporteContenedor"></div>
        <div style="margin-top:60px; display:flex; justify-content:center;">
            <div style="text-align:center;">
                <div style="border-top:1px solid #333; width:280px; margin-bottom:6px;"></div>
                <div style="font-size:13px;">Firma del/de la docente</div>
            </div>
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
        const canvas = await html2canvas(contenedor, { scale: 3, backgroundColor: "#ffffff" });
        return canvas;
    } finally {
        contenedor.remove();
    }
}

btnExportarPdf?.addEventListener("click", async () => {
    if (!selectSalonNota.value || !selectMateriaNota.value) return alert("Primero carga un salón y materia.");
    btnExportarPdf.disabled = true;
    btnExportarPdf.textContent = "Generando PDF...";
    try {
        const canvas = await generarCanvasReporte();
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const ratio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
        const w = canvas.width * ratio;
        const h = canvas.height * ratio;
        pdf.addImage(canvas.toDataURL("image/jpeg", 1.0), "JPEG", (pageWidth - w) / 2, 20, w, h);
        pdf.save(`Notas_${selectMateriaNota.value}_${selectSalonNota.value}.pdf`);
    } catch (err) {
        console.error(err);
        alert("No se pudo generar el PDF: " + err.message);
    } finally {
        btnExportarPdf.disabled = false;
        btnExportarPdf.textContent = "📄 Descargar PDF";
    }
});

btnExportarJpg?.addEventListener("click", async () => {
    if (!selectSalonNota.value || !selectMateriaNota.value) return alert("Primero carga un salón y materia.");
    btnExportarJpg.disabled = true;
    btnExportarJpg.textContent = "Generando JPG...";
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
        btnExportarJpg.textContent = "🖼️ Descargar JPG";
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
