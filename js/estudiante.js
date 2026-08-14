import { supabase } from "./supabase.js";
import { registrarSalida } from "./accesos.js";

// =====================================================
// LISTA BASE DE MATERIAS
// =====================================================

const MATERIAS_BASE = [
    "Español",
    "Matemática",
    "Ciencias Naturales",
    "Inglés",
    "Expresión Artística",
    "Música",
    "Educación Física",
    "Familia y Desarrollo Comunitario",
    "Historia",
    "Educación Agropecuaria",
    "Contabilidad",
    "Geografía",
    "Orientación",
    "Cívica",
    "Religión, Moral y Valores"
];

// Nombres cortos para que la columna de materia sea angosta y pareja.
// El nombre completo real (el que se guarda en la base de datos) no cambia,
// esto es solo para lo que se muestra en pantalla.
const MATERIA_ABREVIADA = {
    "Español": "Español",
    "Matemática": "Matemática",
    "Ciencias Naturales": "C. Naturales",
    "Inglés": "Inglés",
    "Expresión Artística": "Expr. Artística",
    "Música": "Música",
    "Educación Física": "Ed. Física",
    "Familia y Desarrollo Comunitario": "Fam. y Des. Com.",
    "Historia": "Historia",
    "Educación Agropecuaria": "Ed. Agropecuaria",
    "Contabilidad": "Contabilidad",
    "Informática": "Informática",
    "Geografía": "Geografía",
    "Orientación": "Orientación",
    "Cívica": "Cívica",
    "Religión, Moral y Valores": "Relig. y Valores"
};

function materiaAbreviada(materia) {
    return MATERIA_ABREVIADA[materia] || materia;
}

function materiasParaMostrar() {
    const base = miEstudiante?.salon === "8A"
        ? MATERIAS_BASE.map((m) => (m === "Contabilidad" ? "Informática" : m))
        : MATERIAS_BASE;

    const extras = Object.keys(columnasPorMateria)
        .filter((m) => !base.includes(m) && !(miEstudiante?.salon === "8A" && m === "Contabilidad"));

    // Orden alfabético (usando localeCompare "es" para que tilde/eñe ordenen bien).
    return [...base, ...extras].sort((a, b) => a.localeCompare(b, "es"));
}

// =====================================================
// ELEMENTOS DEL DOM
// =====================================================

const contenedorMaterias = document.getElementById("materias");
const filtroTrimestre = document.getElementById("filtroTrimestre");
const avisoSoloLectura = document.getElementById("avisoSoloLectura");
const toast = document.getElementById("toast");
const nombreEstudianteEl = document.getElementById("nombreEstudiante");
const salonEstudianteEl = document.getElementById("salonEstudiante");
const btnToggleApreciacion = document.getElementById("btnToggleApreciacion");
const btnToggleEjercicio = document.getElementById("btnToggleEjercicio");

// =====================================================
// ESTADO GLOBAL
// =====================================================

let trimestreActivo = null;      
let trimestreSeleccionado = null; 
let usuarioActual = null;
let miEstudiante = null;         
let datosEstudiante = null;      

let columnasPorMateria = {};
let notasPorMateria = {};
let materiasBloqueadas = new Set(); // materias donde el profesor apagó la edición del estudiante
let temasOficialesPorMateria = {};
let companerosPorCasilla = {};
let creadoPorPorCasilla = {};
let nombrePorCorreo = {};
let columnaEsOficial = {};

// Preferencia del estudiante de ocultar Apreciación o Ejercicio (para ver
// mejor la tabla en pantallas chicas). Se recuerda entre sesiones.
let ocultarApreciacion = localStorage.getItem("ocultarApreciacion") === "true";
let ocultarEjercicio = localStorage.getItem("ocultarEjercicio") === "true";


// =====================================================
// UTILIDADES
// =====================================================

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function fechaHoy() {
    const d = new Date();
    const mes = String(d.getMonth() + 1).padStart(2, "0");
    const dia = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${mes}-${dia}`;
}

function etiquetaCasillaRespaldo(tipo, numero) {
    return `${tipo === "apreciacion" ? "Apreciación" : "Ejercicio"} ${numero}`;
}

let toastTimeout = null;
function mostrarToast(texto) {
    toast.textContent = texto;
    toast.classList.add("visible");
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove("visible"), 2000);
}

function estaEditando() {
    return trimestreSeleccionado === trimestreActivo;
}

// =====================================================
// CARGA INICIAL: usuario, trimestre activo, estudiante
// =====================================================

async function obtenerTrimestreActivo() {
    try {
        const { data, error } = await supabase
            .from("configuracion")
            .select("trimestre_activo")
            .limit(1)
            .single();

        if (error || !data || !data.trimestre_activo) {
            console.warn("⚠️ No se pudo obtener el trimestre activo, se usará 'Trimestre 1'.");
            trimestreActivo = "Trimestre 1";
        } else {
            trimestreActivo = data.trimestre_activo;
        }
    } catch (error) {
        console.error("❌ Error inesperado al obtener el trimestre activo:", error);
        trimestreActivo = "Trimestre 1";
    }

    return trimestreActivo;
}

async function mostrarUsuario() {
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        window.location.href = "login.html";
        return null;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const correoParam = urlParams.get("correo");

    if (correoParam) {
        usuarioActual = { email: correoParam, esAdminSimulado: true };
    } else {
        usuarioActual = user;
    }

    const elementoUsuario = document.getElementById("usuario");
    if (elementoUsuario) {
        elementoUsuario.textContent = correoParam 
            ? `👁️ Modo Administrador (Revisando a: ${correoParam})`
            : `Sesión iniciada: ${user.email}`;
    }

    return user;
}

async function cargarDatosEstudiante() {
    const [{ data: est }, { data: datos }] = await Promise.all([
        supabase
            .from("estudiantes")
            .select("id, codigo, nombre, salon")
            .eq("correo", usuarioActual.email)
            .maybeSingle(),
        supabase
            .from("datos_estudiante")
            .select("*")
            .eq("correo", usuarioActual.email)
            .maybeSingle()
    ]);

    miEstudiante = est || null;
    datosEstudiante = datos || null;

    nombreEstudianteEl.textContent = miEstudiante?.nombre
        || datosEstudiante?.nombre_apellido
        || "Estudiante";

    salonEstudianteEl.textContent = miEstudiante?.salon
        ? `Salón: ${miEstudiante.salon}`
        : "";
}

// =====================================================
// CARGAR COLUMNAS Y NOTAS (IDENTIFICANDO AL CREADOR DEL NIVEL)
// =====================================================

async function cargarColumnas(trimestre) {
    const salon = miEstudiante?.salon || null;
    const nivelNum = salon ? salon.replace(/\D/g, '') : null;

    let correosNivel = [];
    if (nivelNum) {
        const { data: estNivel } = await supabase
            .from("estudiantes")
            .select("correo, nombre")
            .like("salon", `${nivelNum}%`)
            .eq("es_prueba", false);

        (estNivel || []).forEach((e) => {
            if (e.correo) {
                correosNivel.push(e.correo);
                if (e.nombre) nombrePorCorreo[e.correo] = e.nombre;
            }
        });
    }

    let consultaColumnas = supabase
        .from("columnas_materia")
        .select("materia, tipo, numero, creado_por")
        .eq("trimestre", trimestre);

    // Solo columnas de mi mismo grado, o "oficiales" (sin nivel = para todos).
    // Así, dos grados distintos que comparten el nombre de una materia
    // (ej. "Ciencias Naturales" en 8° y en 9°) ya no chocan entre sí.
    if (nivelNum) {
        consultaColumnas = consultaColumnas.or(`nivel.eq.${nivelNum},nivel.is.null`);
    }

    const consultas = [consultaColumnas];

    if (correosNivel.length > 0) {
        consultas.push(
            supabase
                .from("notas")
                .select("correo, materia, tipo, numero")
                .eq("trimestre", trimestre)
                .in("correo", correosNivel)
        );
    } else {
        consultas.push(
            supabase
                .from("notas")
                .select("correo, materia, tipo, numero")
                .eq("trimestre", trimestre)
                .eq("correo", usuarioActual.email)
        );
    }

    if (salon) {
        consultas.push(
            supabase
                .from("temas_casillas")
                .select("materia, tipo, numero, tema")
                .eq("trimestre", trimestre)
                .eq("salon", salon)
        );
    }

    const [
        { data: columnasDef, error: errCol },
        { data: notasTodas, error: errNotas },
        temasCasillasResultado
    ] = await Promise.all(consultas);

    const temasCasillas = salon ? temasCasillasResultado?.data : null;

    columnasPorMateria = {};
    temasOficialesPorMateria = {};
    creadoPorPorCasilla = {};
    columnaEsOficial = {};

    if (errCol) console.error("❌ Error al cargar columnas:", errCol);
    if (errNotas) console.warn("⚠️ No se pudieron revisar notas de este nivel:", errNotas);

    const agregarColumnaLocal = (materia, tipo, numero) => {
        if (!materia || !tipo || !numero) return false;
        if (!columnasPorMateria[materia]) {
            columnasPorMateria[materia] = { apreciacion: [], ejercicio: [] };
        }
        const lista = columnasPorMateria[materia][tipo];
        if (!lista) return false;
        if (lista.includes(numero)) return false;
        lista.push(numero);
        return true;
    };

    // 1. Temas oficiales asignados por profesor/admin
    (temasCasillas || []).forEach((c) => {
        agregarColumnaLocal(c.materia, c.tipo, c.numero);
        columnaEsOficial[`${c.materia}|${c.tipo}|${c.numero}`] = true;

        if (c.tema && c.tema.trim() !== "") {
            if (!temasOficialesPorMateria[c.materia]) {
                temasOficialesPorMateria[c.materia] = { apreciacion: {}, ejercicio: {} };
            }
            temasOficialesPorMateria[c.materia][c.tipo][c.numero] = c.tema.trim();
        }
    });

    // 2. Definiciones explicitas de columnas
    (columnasDef || []).forEach((c) => {
        if (!c.creado_por || correosNivel.includes(c.creado_por) || c.creado_por === usuarioActual.email) {
            agregarColumnaLocal(c.materia, c.tipo, c.numero);
            if (c.creado_por) {
                creadoPorPorCasilla[`${c.materia}|${c.tipo}|${c.numero}`] = c.creado_por;
            }
        }
    });

    // 3. Casillas autocompletadas desde la tabla notas de su nivel (9A, 9B, 9C, etc.)
    (notasTodas || []).forEach((n) => {
        const tipoNorm = (n.tipo || "").toLowerCase();
        if (tipoNorm === "apreciacion" || tipoNorm === "ejercicio") {
            agregarColumnaLocal(n.materia, tipoNorm, n.numero);
            const clave = `${n.materia}|${tipoNorm}|${n.numero}`;
            if (!creadoPorPorCasilla[clave] && n.correo) {
                creadoPorPorCasilla[clave] = n.correo;
            }
        }
    });

    Object.values(columnasPorMateria).forEach((cols) => {
        cols.apreciacion.sort((a, b) => a - b);
        cols.ejercicio.sort((a, b) => a - b);
    });
}

async function cargarNotasEstudiante(trimestre) {
    const { data, error } = await supabase
        .from("notas")
        .select("*")
        .eq("correo", usuarioActual.email)
        .eq("trimestre", trimestre);

    notasPorMateria = {};

    if (error) {
        console.error("❌ Error al cargar notas:", error);
        return;
    }

    (data || []).forEach((n) => {
        if (!notasPorMateria[n.materia]) {
            notasPorMateria[n.materia] = { apreciacion: {}, ejercicio: {} };
        }
        const tipoNorm = (n.tipo || "").toLowerCase();
        if (tipoNorm === "apreciacion" || tipoNorm === "ejercicio") {
            notasPorMateria[n.materia][tipoNorm][n.numero] = n;
        }
    });
}

async function cargarCompanerosConNotas(trimestre) {
    companerosPorCasilla = {};

    if (usuarioActual?.email && miEstudiante?.nombre) {
        nombrePorCorreo[usuarioActual.email] = miEstudiante.nombre;
    }

    if (!miEstudiante?.salon) return;

    // Extrae el dígito del nivel (ejemplo: "9A" -> "9", "8A" -> "8")
    const nivelNum = miEstudiante.salon.replace(/\D/g, '');

    const { data: companeros, error: errComp } = await supabase
        .from("estudiantes")
        .select("correo, nombre, salon")
        .like("salon", `${nivelNum}%`)
        .eq("es_prueba", false);

    if (errComp) {
        console.warn("⚠️ No se pudo cargar la lista de estudiantes del nivel:", errComp);
        return;
    }

    const correosCompaneros = [];

    (companeros || []).forEach((c) => {
        if (!c.correo) return;
        nombrePorCorreo[c.correo] = c.nombre || c.correo;
        if (c.correo !== usuarioActual.email) correosCompaneros.push(c.correo);
    });

    if (correosCompaneros.length === 0) return;

    const { data: notasComp, error: errNotasComp } = await supabase
        .from("notas")
        .select("correo, materia, tipo, numero")
        .eq("trimestre", trimestre)
        .in("correo", correosCompaneros);

    if (errNotasComp) {
        console.warn("⚠️ No se pudieron cargar las notas del nivel:", errNotasComp);
        return;
    }

    (notasComp || []).forEach((n) => {
        const tipoNorm = (n.tipo || "").toLowerCase();
        if (tipoNorm !== "apreciacion" && tipoNorm !== "ejercicio") return;

        const clave = `${n.materia}|${tipoNorm}|${n.numero}`;
        const nombre = nombrePorCorreo[n.correo];
        if (!nombre) return;

        if (!companerosPorCasilla[clave]) companerosPorCasilla[clave] = [];
        if (!companerosPorCasilla[clave].includes(nombre)) {
            companerosPorCasilla[clave].push(nombre);
        }
    });
}

async function cargarMateriasBloqueadas() {
    materiasBloqueadas = new Set();
    if (!miEstudiante?.salon) return;

    const { data, error } = await supabase
        .from("profesor_materias")
        .select("materia")
        .eq("salon", miEstudiante.salon)
        .eq("bloqueado_para_estudiantes", true);

    if (error) { console.warn("⚠️ No se pudo revisar materias bloqueadas:", error); return; }
    (data || []).forEach((fila) => materiasBloqueadas.add(fila.materia));
}

async function cargarTodo(trimestre) {
    await Promise.all([
        cargarColumnas(trimestre),
        cargarNotasEstudiante(trimestre),
        cargarCompanerosConNotas(trimestre),
        cargarMateriasBloqueadas()
    ]);
    render();
}

// =====================================================
// PROMEDIOS
// =====================================================

function calcularPromedio(materia, tipo, numeros) {
    const notas = notasPorMateria[materia]?.[tipo] || {};
    const valores = numeros
        .map((n) => notas[n])
        .filter(Boolean)
        .map((n) => (n.estado === "Intencional" ? 0 : Number(n.nota)));

    if (valores.length === 0) return null;
    return valores.reduce((a, b) => a + b, 0) / valores.length;
}

function calcularPromedioFinal(materia, apr, eje) {
    const promApr = calcularPromedio(materia, "apreciacion", apr);
    const promEje = calcularPromedio(materia, "ejercicio", eje);

    if (promApr !== null && promEje !== null) return (promApr + promEje) / 2;
    if (promApr !== null) return promApr;
    if (promEje !== null) return promEje;
    return null;
}

// =====================================================
// RENDER DE UNA CELDA DE NOTA
// =====================================================

function celdaNotaHtml(materia, tipo, numero) {
    const nota = notasPorMateria[materia]?.[tipo]?.[numero];
    const soloLectura = !estaEditando();
    const clave = `${materia}|${tipo}|${numero}`;
    const temaOficial = temasOficialesPorMateria[materia]?.[tipo]?.[numero];

    if (nota && nota.estado === "Intencional") {
        const claseGrupoFalta = tipo === "apreciacion" ? "grupo-apreciacion" : "grupo-ejercicio";
        return `
            <td class="${claseGrupoFalta}">
                <div class="celda-nota solo-lectura" title="Falta marcada por el consejero(a) (cuenta como 0.0)">
                    ⚠️
                </div>
            </td>
        `;
    }

    const notaEsDelProfesor = nota && nota.origen === "profesor";
    const materiaBloqueada = materiasBloqueadas.has(materia);
    // El estudiante no puede tocar una nota que puso el profesor, ni agregar
    // una nueva si el profesor bloqueó la materia y todavía no hay nota ahí.
    const bloqueadaParaEstudiante = notaEsDelProfesor || (!nota && materiaBloqueada);

    const valor = nota?.nota ?? "";
    const disabled = (soloLectura || bloqueadaParaEstudiante) ? "disabled" : "";

    const nombres = companerosPorCasilla[clave] || [];
    const faltaNota = !nota && nombres.length > 0;

    let avisoCompaneros = "";
    if (faltaNota) {
        avisoCompaneros = `
            <button
                type="button"
                class="btn-companeros falta"
                title="Ya tienen nota aquí: ${escapeHtml(nombres.join(", "))}"
                data-nombres="${escapeHtml(nombres.join(", "))}"
                data-cantidad="${nombres.length}"
                data-materia="${escapeHtml(materia)}"
                data-tipo="${tipo}"
                data-numero="${numero}"
            >❓</button>
        `;
    }

    let botonTema = "";
    if (temaOficial) {
        // El profesor(a) o administrador ya puso el tema: el estudiante solo lo ve, no lo edita.
        botonTema = `
            <button
                type="button"
                class="btn-tema btn-tema-oficial"
                title="Tema (puesto por el profesor/a): ${escapeHtml(temaOficial)}"
                data-tema="${escapeHtml(temaOficial)}"
            >🔒</button>
        `;
    } else if (!soloLectura && nota) {
        // El estudiante puede poner o editar su propio tema para esta nota.
        botonTema = `
            <button
                type="button"
                class="btn-tema"
                title="${nota.tema ? "Tema: " + escapeHtml(nota.tema) : "Agregar tema (opcional)"}"
                data-materia="${escapeHtml(materia)}"
                data-tipo="${tipo}"
                data-numero="${numero}"
            >🏷️</button>
        `;
    } else if (soloLectura && nota?.tema) {
        // Trimestre no editable, pero el estudiante ya le había puesto un tema: se sigue viendo.
        botonTema = `
            <button
                type="button"
                class="btn-tema btn-tema-oficial"
                title="Tema: ${escapeHtml(nota.tema)}"
                data-tema="${escapeHtml(nota.tema)}"
            >🏷️</button>
        `;
    }

    let botonBorrar = "";
    if (!soloLectura && !columnaEsOficial[clave]) {
        botonBorrar = `
            <button
                type="button"
                class="btn-borrar-col"
                title="Eliminar esta columna (solo si nadie más tiene nota aquí)"
                data-materia="${escapeHtml(materia)}"
                data-tipo="${tipo}"
                data-numero="${numero}"
            >🗑️</button>
        `;
    }

    let tituloTema = temaOficial
        ? `Tema asignado por el profesor(a): ${escapeHtml(temaOficial)}`
        : (nota?.tema ? `Tema: ${escapeHtml(nota.tema)}` : "");

    let candadoIcono = "";
    if (notaEsDelProfesor) {
        tituloTema = `🔒 Nota puesta por el profesor(a). No se puede modificar. ${tituloTema}`.trim();
        candadoIcono = `<span class="icono-candado" title="Nota puesta por el profesor(a)">🔒</span>`;
    } else if (!nota && materiaBloqueada && !soloLectura) {
        tituloTema = `🔒 El profesor(a) desactivó agregar notas nuevas en esta materia.`;
        candadoIcono = `<span class="icono-candado" title="El profesor(a) desactivó agregar notas nuevas aquí">🔒</span>`;
    }

    const claseGrupo = tipo === "apreciacion" ? "grupo-apreciacion" : "grupo-ejercicio";

    return `
        <td class="${claseGrupo}${faltaNota ? " celda-falta" : ""}"${tituloTema ? ` title="${tituloTema}"` : ""}>
            <div class="celda-nota">
                <input
                    type="number"
                    class="input-nota${faltaNota ? " input-falta" : ""}"
                    min="1" max="5" step="0.1"
                    value="${escapeHtml(valor)}"
                    placeholder="${faltaNota ? "❓" : "—"}"
                    data-materia="${escapeHtml(materia)}"
                    data-tipo="${tipo}"
                    data-numero="${numero}"
                    ${disabled}
                >
                <div class="celda-nota-acciones">
                    ${candadoIcono}
                    ${avisoCompaneros}
                    ${notaEsDelProfesor ? "" : botonTema}
                    ${notaEsDelProfesor ? "" : botonBorrar}
                </div>
            </div>
        </td>
    `;
}

// =====================================================
// TABLA CONSOLIDADA (todas las materias juntas)
// =====================================================

function tablaConsolidadaHtml() {
    const materias = materiasParaMostrar();
    const editando = estaEditando();

    let maxApr = 0;
    let maxEje = 0;
    materias.forEach((m) => {
        const cols = columnasPorMateria[m] || { apreciacion: [], ejercicio: [] };
        if (cols.apreciacion.length) maxApr = Math.max(maxApr, Math.max(...cols.apreciacion));
        if (cols.ejercicio.length) maxEje = Math.max(maxEje, Math.max(...cols.ejercicio));
    });

    let filaHead1 = `<tr>`;
    filaHead1 += `<th rowspan="2" class="col-materia">Materia</th>`;
    if (!ocultarApreciacion) {
        filaHead1 += `<th colspan="${maxApr + 1}" class="th-grupo th-apreciacion">Apreciación</th>`;
        filaHead1 += `<th rowspan="2" class="th-prom">Prom.<br>Apr.</th>`;
    }
    if (!ocultarEjercicio) {
        filaHead1 += `<th colspan="${maxEje + 1}" class="th-grupo th-ejercicio">Ejercicio</th>`;
        filaHead1 += `<th rowspan="2" class="th-prom">Prom.<br>Eje.</th>`;
    }
    filaHead1 += `<th rowspan="2" class="th-final">Promedio<br>Final</th>`;
    filaHead1 += `</tr>`;

    let filaHead2 = `<tr>`;
    if (!ocultarApreciacion) {
        for (let i = 1; i <= maxApr; i++) filaHead2 += `<th class="th-apreciacion-num">${i}</th>`;
        filaHead2 += `<th class="col-agregar th-apreciacion-num">+</th>`;
    }
    if (!ocultarEjercicio) {
        for (let i = 1; i <= maxEje; i++) filaHead2 += `<th class="th-ejercicio-num">${i}</th>`;
        filaHead2 += `<th class="col-agregar th-ejercicio-num">+</th>`;
    }
    filaHead2 += `</tr>`;

    let filas = "";
    materias.forEach((materia) => {
        const cols = columnasPorMateria[materia] || { apreciacion: [], ejercicio: [] };
        const promApr = calcularPromedio(materia, "apreciacion", cols.apreciacion);
        const promEje = calcularPromedio(materia, "ejercicio", cols.ejercicio);
        const promFinal = calcularPromedioFinal(materia, cols.apreciacion, cols.ejercicio);

        filas += `<tr>`;
        filas += `<td class="col-materia" title="${escapeHtml(materia)}">${escapeHtml(materiaAbreviada(materia))}</td>`;

        if (!ocultarApreciacion) {
            for (let i = 1; i <= maxApr; i++) {
                filas += cols.apreciacion.includes(i)
                    ? celdaNotaHtml(materia, "apreciacion", i)
                    : `<td class="celda-vacia grupo-apreciacion"></td>`;
            }
            filas += celdaAgregarHtml(materia, "apreciacion", editando);
            filas += `<td class="celda-promedio prom-apreciacion">${promApr !== null ? promApr.toFixed(1) : "-"}</td>`;
        }

        if (!ocultarEjercicio) {
            for (let i = 1; i <= maxEje; i++) {
                filas += cols.ejercicio.includes(i)
                    ? celdaNotaHtml(materia, "ejercicio", i)
                    : `<td class="celda-vacia grupo-ejercicio"></td>`;
            }
            filas += celdaAgregarHtml(materia, "ejercicio", editando);
            filas += `<td class="celda-promedio prom-ejercicio">${promEje !== null ? promEje.toFixed(1) : "-"}</td>`;
        }

        let claseFinal = "celda-promedio celda-final";
        if (promFinal !== null) {
            claseFinal += promFinal < 3 ? " reprobado" : " aprobado";
        }
        filas += `<td class="${claseFinal}">${promFinal !== null ? promFinal.toFixed(1) : "-"}</td>`;
        filas += `</tr>`;
    });

    return `
        <div class="tabla-contenedor">
            <table class="tabla-notas tabla-consolidada">
                <thead>${filaHead1}${filaHead2}</thead>
                <tbody>${filas}</tbody>
            </table>
        </div>
    `;
}

function celdaAgregarHtml(materia, tipo, editando) {
    const claseGrupo = tipo === "apreciacion" ? "grupo-apreciacion" : "grupo-ejercicio";
    if (!editando) return `<td class="celda-agregar ${claseGrupo}"></td>`;
    const etiqueta = tipo === "apreciacion" ? "Agregar apreciación" : "Agregar ejercicio";
    return `
        <td class="celda-agregar ${claseGrupo}">
            <button
                type="button"
                class="btn-agregar-col"
                title="${etiqueta} a ${escapeHtml(materia)}"
                data-materia="${escapeHtml(materia)}"
                data-tipo="${tipo}"
            >➕</button>
        </td>
    `;
}

function render() {
    avisoSoloLectura.style.display = estaEditando() ? "none" : "inline-block";
    contenedorMaterias.innerHTML = tablaConsolidadaHtml();
}

function actualizarBotonesSeccion() {
    if (btnToggleApreciacion) {
        btnToggleApreciacion.setAttribute("aria-pressed", String(ocultarApreciacion));
        btnToggleApreciacion.textContent = ocultarApreciacion
            ? "👁️ Mostrar Apreciación"
            : "🙈 Ocultar Apreciación";
    }
    if (btnToggleEjercicio) {
        btnToggleEjercicio.setAttribute("aria-pressed", String(ocultarEjercicio));
        btnToggleEjercicio.textContent = ocultarEjercicio
            ? "👁️ Mostrar Ejercicio"
            : "🙈 Ocultar Ejercicio";
    }
}

btnToggleApreciacion?.addEventListener("click", () => {
    ocultarApreciacion = !ocultarApreciacion;
    localStorage.setItem("ocultarApreciacion", String(ocultarApreciacion));
    actualizarBotonesSeccion();
    render();
});

btnToggleEjercicio?.addEventListener("click", () => {
    ocultarEjercicio = !ocultarEjercicio;
    localStorage.setItem("ocultarEjercicio", String(ocultarEjercicio));
    actualizarBotonesSeccion();
    render();
});

actualizarBotonesSeccion();

// =====================================================
// EDITAR EL TEMA DE UNA CASILLA (por ícono 🏷️)
// =====================================================

async function editarTemaCelda(materia, tipo, numero) {
    if (!estaEditando()) return;

    const nota = notasPorMateria[materia]?.[tipo]?.[numero];
    if (!nota || nota.estado === "Intencional") {
        mostrarToast("✍️ Primero escribe la nota");
        return;
    }
    if (nota.origen === "profesor") {
        mostrarToast("🔒 Esta nota la puso el profesor(a), no se puede modificar");
        return;
    }

    const actual = nota.tema || "";
    const nuevo = window.prompt("Tema de esta actividad (opcional):", actual);
    if (nuevo === null) return;

    const nuevoLimpio = nuevo.trim();
    if (nuevoLimpio === actual) return;

    const { error } = await supabase
        .from("notas")
        .update({ tema: nuevoLimpio || null, actividad: nuevoLimpio || etiquetaCasillaRespaldo(tipo, numero) })
        .eq("id", nota.id);

    if (error) {
        console.error("❌ Error al guardar el tema:", error);
        mostrarToast("❌ No se pudo guardar el tema");
        return;
    }

    nota.tema = nuevoLimpio || null;
    mostrarToast("✅ Tema guardado");
    render();
}

// =====================================================
// AVISO POR CORREO: si pasan 5 minutos sin que el estudiante
// guarde nada nuevo, se manda un correo con la tabla de lo
// que cambió desde el último aviso. Misma lógica que ya
// existe en profesor.js (segunda capa de seguridad).
// =====================================================
const EMAILJS_SERVICE_ID = "service_avsesik";
const EMAILJS_TEMPLATE_ID = "template_00nky6m";
const EMAILJS_PUBLIC_KEY = "2PasfycZJSW6hDpqg";
const MINUTOS_INACTIVIDAD_RESPALDO = 5;

if (window.emailjs) {
    window.emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
}

let cambiosPendientesRespaldoEst = [];
let temporizadorRespaldoEst = null;

function registrarCambioParaRespaldoEst(materia, tipo, numero, valor) {
    cambiosPendientesRespaldoEst.push({
        estudiante: miEstudiante?.nombre || usuarioActual?.email || "—",
        casilla: `${materia} — ${etiquetaCasillaRespaldo(tipo, numero)}`,
        nota: valor,
        hora: new Date().toLocaleString("es-PA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
    });
    reiniciarTemporizadorRespaldoEst();
}

function reiniciarTemporizadorRespaldoEst() {
    if (temporizadorRespaldoEst) clearTimeout(temporizadorRespaldoEst);
    temporizadorRespaldoEst = setTimeout(enviarRespaldoPorCorreoEst, MINUTOS_INACTIVIDAD_RESPALDO * 60 * 1000);
}

async function enviarRespaldoPorCorreoEst() {
    if (!window.emailjs || cambiosPendientesRespaldoEst.length === 0) return;

    const filas = cambiosPendientesRespaldoEst.map((c) =>
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
        profesor: `Estudiante: ${miEstudiante?.nombre || usuarioActual?.email || "—"}`,
        materia: "(auto-reporte de estudiante)",
        salon: miEstudiante?.salon || "—",
        trimestre: trimestreActivo,
        fecha: new Date().toLocaleString("es-PA"),
        tabla_notas: tablaHtml,
    };

    try {
        await window.emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, parametros);
        cambiosPendientesRespaldoEst = [];
    } catch (err) {
        console.error("❌ No se pudo enviar el respaldo automático por correo:", err);
        reiniciarTemporizadorRespaldoEst();
    }
}

// =====================================================
// GUARDAR UNA CASILLA
// =====================================================

async function guardarCelda(inputEl) {
    const materia = inputEl.dataset.materia;
    const tipo = inputEl.dataset.tipo;
    const numero = Number(inputEl.dataset.numero);
    const valorTexto = inputEl.value.trim();

    const notaExistente = notasPorMateria[materia]?.[tipo]?.[numero] || null;

    const contenedorCelda = inputEl.closest(".celda-nota");

    if (notaExistente && notaExistente.origen === "profesor") {
        mostrarToast("🔒 Esta nota la puso el profesor(a), no se puede modificar");
        inputEl.value = notaExistente.nota;
        return;
    }
    if (!notaExistente && materiasBloqueadas.has(materia)) {
        mostrarToast("🔒 El profesor(a) desactivó agregar notas nuevas en esta materia");
        inputEl.value = "";
        return;
    }

    if (valorTexto === "") {
        if (!notaExistente) return;

        const { error } = await supabase.from("notas").delete().eq("id", notaExistente.id);

        if (error) {
            console.error("❌ Error al eliminar la nota:", error);
            mostrarToast("❌ No se pudo borrar la nota");
            inputEl.value = notaExistente.nota;
            return;
        }

        delete notasPorMateria[materia][tipo][numero];
        mostrarToast("🗑️ Nota eliminada");
        render();
        return;
    }

    const valor = parseFloat(valorTexto);

    if (Number.isNaN(valor) || valor < 1 || valor > 5) {
        mostrarToast("⚠️ La nota debe estar entre 1.0 y 5.0");
        inputEl.value = notaExistente?.nota ?? "";
        return;
    }

    contenedorCelda?.classList.add("guardando");

    if (notaExistente) {
        const { error } = await supabase
            .from("notas")
            .update({ nota: valor, fecha: fechaHoy() })
            .eq("id", notaExistente.id);

        contenedorCelda?.classList.remove("guardando");

        if (error) {
            console.error("❌ Error al actualizar la nota:", error);
            mostrarToast("❌ Error al guardar");
            return;
        }

        notaExistente.nota = valor;
        notaExistente.fecha = fechaHoy();
        registrarCambioParaRespaldoEst(materia, tipo, numero, valor);
    } else {
        const { data, error } = await supabase
            .from("notas")
            .insert([{
                correo: usuarioActual.email,
                estudiante_id: miEstudiante?.id || null,
                materia,
                tipo,
                numero,
                tema: null,
                actividad: etiquetaCasillaRespaldo(tipo, numero),
                fecha: fechaHoy(),
                nota: valor,
                observacion: null,
                trimestre: trimestreActivo,
                estado: "Activa",
                origen: "estudiante"
            }])
            .select()
            .single();

        contenedorCelda?.classList.remove("guardando");

        if (error) {
            console.error("❌ Error al guardar la nota:", error);
            mostrarToast("❌ Error al guardar");
            return;
        }

        if (!notasPorMateria[materia]) notasPorMateria[materia] = { apreciacion: {}, ejercicio: {} };
        notasPorMateria[materia][tipo][numero] = data;
        registrarCambioParaRespaldoEst(materia, tipo, numero, valor);
    }

    mostrarToast("✅ Guardado");
    contenedorCelda?.classList.add("guardado");
    setTimeout(() => contenedorCelda?.classList.remove("guardado"), 1200);

    render();
}

// =====================================================
// GUARDAR EL TEMA DE UNA CASILLA
// =====================================================

async function guardarTemaCelda(inputEl) {
    const materia = inputEl.dataset.materia;
    const tipo = inputEl.dataset.tipo;
    const numero = Number(inputEl.dataset.numero);
    const nuevoTema = inputEl.value.trim();

    const notaExistente = notasPorMateria[materia]?.[tipo]?.[numero] || null;

    if (!notaExistente) return;
    if ((notaExistente.tema || "") === nuevoTema) return;

    const { error } = await supabase
        .from("notas")
        .update({ tema: nuevoTema || null, actividad: nuevoTema || etiquetaCasillaRespaldo(tipo, numero) })
        .eq("id", notaExistente.id);

    if (error) {
        console.error("❌ Error al guardar el tema:", error);
        mostrarToast("❌ No se pudo guardar el tema");
        inputEl.value = notaExistente.tema || "";
        return;
    }

    notaExistente.tema = nuevoTema || null;
    mostrarToast("✅ Tema guardado");
}

// =====================================================
// AGREGAR UNA COLUMNA NUEVA
// =====================================================

async function agregarColumna(materia, tipo) {
    if (!estaEditando()) return;

    const listaActual = columnasPorMateria[materia]?.[tipo] || [];
    const siguienteNumero = listaActual.length > 0 ? Math.max(...listaActual) + 1 : 1;

    const salonActual = miEstudiante?.salon || null;
    const nivelActual = salonActual ? salonActual.replace(/\D/g, "") : null;

    const { error } = await supabase
        .from("columnas_materia")
        .insert([{
            materia, tipo, numero: siguienteNumero, trimestre: trimestreActivo,
            creado_por: usuarioActual.email, nivel: nivelActual
        }]);

    if (error) {
        console.error("❌ Error al crear la columna:", error);

        if (error.code === "23505") {
            await cargarColumnas(trimestreActivo);
            render();
            return;
        }

        mostrarToast("❌ No se pudo crear la columna");
        return;
    }

    if (!columnasPorMateria[materia]) {
        columnasPorMateria[materia] = { apreciacion: [], ejercicio: [] };
    }
    columnasPorMateria[materia][tipo].push(siguienteNumero);
    creadoPorPorCasilla[`${materia}|${tipo}|${siguienteNumero}`] = usuarioActual.email;

    const etiqueta = tipo === "apreciacion" ? "Apreciación" : "Ejercicio";
    mostrarToast(`✅ ${etiqueta} ${siguienteNumero} agregada`);
    render();
}

// =====================================================
// ELIMINAR UNA COLUMNA
// =====================================================

async function eliminarColumna(materia, tipo, numero) {
    if (!estaEditando()) return;

    const etiqueta = tipo === "apreciacion" ? "Apreciación" : "Ejercicio";

    const confirmar = confirm(
        `¿Eliminar la columna "${etiqueta} ${numero}" de ${materia}?\n\n` +
        `Se borrará si nadie más tiene nota ahí, o si la única nota es la tuya (en ese caso también se borra tu nota).`
    );
    if (!confirmar) return;

    const { data: notasAhi, error: errConsulta } = await supabase
        .from("notas")
        .select("id, correo, origen")
        .eq("materia", materia)
        .eq("tipo", tipo)
        .eq("numero", numero)
        .eq("trimestre", trimestreActivo);

    if (errConsulta) {
        console.error("❌ Error al verificar si la columna tiene notas:", errConsulta);
        mostrarToast("❌ No se pudo verificar la columna");
        return;
    }

    const filas = notasAhi || [];
    const soloLaMia = filas.length === 1
        && filas[0].correo === usuarioActual.email
        && filas[0].origen !== "profesor";

    if (filas.length > 0 && filas[0].origen === "profesor" && filas[0].correo === usuarioActual.email) {
        mostrarToast("🔒 Esta nota la puso el profesor(a), no se puede eliminar");
        return;
    }

    if (filas.length > 0 && !soloLaMia) {
        alert(
            `No se puede eliminar: ya hay ${filas.length} nota(s) guardada(s) en esta casilla, ` +
            `de otro(s) estudiante(s). Se recargó la información.`
        );
        await cargarTodo(trimestreSeleccionado);
        return;
    }

    if (soloLaMia) {
        const { error: errBorrarNota } = await supabase.from("notas").delete().eq("id", filas[0].id);

        if (errBorrarNota) {
            console.error("❌ Error al borrar tu nota antes de eliminar la columna:", errBorrarNota);
            mostrarToast("❌ No se pudo borrar tu nota");
            return;
        }
    }

    const salonParaBorrar = miEstudiante?.salon || null;
    const nivelParaBorrar = salonParaBorrar ? salonParaBorrar.replace(/\D/g, "") : null;

    let consultaBorrar = supabase
        .from("columnas_materia")
        .delete()
        .eq("materia", materia)
        .eq("tipo", tipo)
        .eq("numero", numero)
        .eq("trimestre", trimestreActivo);

    // Solo borra la columna de MI grado (o una oficial sin grado);
    // así no se toca por error la de otro grado con el mismo número.
    consultaBorrar = nivelParaBorrar
        ? consultaBorrar.or(`nivel.eq.${nivelParaBorrar},nivel.is.null`)
        : consultaBorrar.is("nivel", null);

    const { error: errBorrar } = await consultaBorrar;

    if (errBorrar) {
        console.error("❌ Error al eliminar la columna:", errBorrar);
        mostrarToast("❌ No se pudo eliminar la columna");
        return;
    }

    if (columnasPorMateria[materia]) {
        columnasPorMateria[materia][tipo] = columnasPorMateria[materia][tipo].filter((n) => n !== numero);
    }
    delete creadoPorPorCasilla[`${materia}|${tipo}|${numero}`];
    if (soloLaMia && notasPorMateria[materia]?.[tipo]) {
        delete notasPorMateria[materia][tipo][numero];
    }

    mostrarToast(`🗑️ ${etiqueta} ${numero} eliminada`);
    render();
}

// =====================================================
// GUARDAR TODOS LOS CAMBIOS DE UNA VEZ
// =====================================================

async function guardarTodosLosCambios() {
    if (!estaEditando()) {
        mostrarToast("🔒 Solo puedes guardar en el trimestre activo");
        return;
    }

    const inputs = Array.from(document.querySelectorAll(".input-nota"));
    const filas = [];
    let omitidasPorProfesor = 0;
    let omitidasPorBloqueo = 0;

    inputs.forEach((input) => {
        const valorTexto = input.value.trim();
        if (valorTexto === "") return;

        const valor = parseFloat(valorTexto);
        if (Number.isNaN(valor) || valor < 1 || valor > 5) return;

        const materia = input.dataset.materia;
        const tipo = input.dataset.tipo;
        const numero = Number(input.dataset.numero);
        const notaExistente = notasPorMateria[materia]?.[tipo]?.[numero];
        const esNueva = !notaExistente;

        if (notaExistente && notaExistente.origen === "profesor") { omitidasPorProfesor++; return; }
        if (esNueva && materiasBloqueadas.has(materia)) { omitidasPorBloqueo++; return; }

        const fila = {
            correo: usuarioActual.email,
            materia,
            tipo,
            numero,
            fecha: fechaHoy(),
            nota: valor,
            trimestre: trimestreActivo,
            estado: "Activa",
            origen: "estudiante"
        };

        if (esNueva) {
            fila.actividad = etiquetaCasillaRespaldo(tipo, numero);
        }

        filas.push(fila);
    });

    if (omitidasPorProfesor > 0 || omitidasPorBloqueo > 0) {
        const partes = [];
        if (omitidasPorProfesor > 0) partes.push(`${omitidasPorProfesor} puesta(s) por el profesor(a)`);
        if (omitidasPorBloqueo > 0) partes.push(`${omitidasPorBloqueo} en materia(s) bloqueada(s)`);
        mostrarToast(`🔒 Se omitieron ${partes.join(" y ")}`);
    }

    if (filas.length === 0) {
        if (omitidasPorProfesor === 0 && omitidasPorBloqueo === 0) mostrarToast("No hay calificaciones para guardar");
        return;
    }

    const { error } = await supabase
        .from("notas")
        .upsert(filas, { onConflict: "correo,materia,tipo,numero,trimestre" });

    if (error) {
        console.error("❌ Error al guardar todo:", error);
        mostrarToast("❌ Error al guardar todos los cambios");
        return;
    }

    mostrarToast("✅ Todos los cambios se guardaron");
    await cargarNotasEstudiante(trimestreActivo);
    render();
}

// =====================================================
// EVENTOS
// =====================================================

// =====================================================
// ORDEN REAL EN QUE LOS COMPAÑEROS PUSIERON SU NOTA
// =====================================================

async function mostrarOrdenCompaneros(materia, tipo, numero, nombresRespaldo, cantidadRespaldo) {
    const { data, error } = await supabase
        .from("notas")
        .select("correo, created_at")
        .eq("materia", materia)
        .eq("tipo", tipo)
        .eq("numero", numero)
        .eq("trimestre", trimestreSeleccionado)
        .order("created_at", { ascending: true });

    if (error || !data || data.length === 0) {
        console.error("❌ Error al consultar el orden de las notas:", error);
        // Si falla la consulta, se muestra al menos la lista simple que ya se tenía.
        alert(`${cantidadRespaldo} estudiante(s) del nivel ya tienen nota en esta casilla:\n\n${nombresRespaldo}\n\nPuedes preguntarles o buscar la nota con el profesor(a).`);
        return;
    }

    const lineas = data.map((fila, indice) => {
        const nombre = nombrePorCorreo[fila.correo] || fila.correo;
        const fecha = fila.created_at
            ? new Date(fila.created_at).toLocaleString("es-PA", {
                  day: "2-digit", month: "2-digit", year: "numeric",
                  hour: "2-digit", minute: "2-digit"
              })
            : "";
        const medalla = indice === 0 ? "🥇" : (indice === 1 ? "🥈" : (indice === 2 ? "🥉" : `${indice + 1}°`));
        return `${medalla} ${nombre}${fecha ? " — " + fecha : ""}`;
    });

    alert(`Orden en que se puso la nota en esta casilla:\n\n${lineas.join("\n")}`);
}

contenedorMaterias.addEventListener("change", (e) => {
    if (e.target.matches(".input-nota")) {
        guardarCelda(e.target);
    } else if (e.target.matches(".input-tema")) {
        guardarTemaCelda(e.target);
    }
});

contenedorMaterias.addEventListener("click", (e) => {
    if (e.target.matches(".btn-agregar-col")) {
        agregarColumna(e.target.dataset.materia, e.target.dataset.tipo);
    } else if (e.target.matches(".btn-borrar-col")) {
        eliminarColumna(e.target.dataset.materia, e.target.dataset.tipo, Number(e.target.dataset.numero));
    } else if (e.target.matches(".btn-companeros")) {
        mostrarOrdenCompaneros(
            e.target.dataset.materia,
            e.target.dataset.tipo,
            Number(e.target.dataset.numero),
            e.target.dataset.nombres,
            e.target.dataset.cantidad
        );
    } else if (e.target.matches(".btn-tema-oficial")) {
        alert(`📌 Tema de esta nota:\n\n${e.target.dataset.tema}`);
    } else if (e.target.matches(".btn-tema")) {
        editarTemaCelda(e.target.dataset.materia, e.target.dataset.tipo, Number(e.target.dataset.numero));
    }
});

// El botón "Guardar todos los cambios" ya no se usa: cada nota se guarda
// automáticamente al escribirla (ver guardarCelda), así que ese botón
// solo generaba errores en conexiones débiles sin aportar nada nuevo.
// Se oculta en vez de borrarlo del HTML, por si en el futuro se reactiva.
document.getElementById("btnGuardarTodo")?.style.setProperty("display", "none");

document.getElementById("btnJpg")?.addEventListener("click", async () => {
    const btn = document.getElementById("btnJpg");
    const textoOriginal = btn.innerHTML;

    if (typeof html2canvas !== "function") {
        mostrarToast("❌ No se pudo cargar el generador de imágenes");
        return;
    }

    const elemento = document.getElementById("materias");
    if (!elemento) return;

    btn.disabled = true;
    btn.textContent = "Generando imagen...";

    try {
        const canvas = await html2canvas(elemento, {
            backgroundColor: "#ffffff",
            scale: 2,
            useCORS: true
        });

        const nombreArchivo = (miEstudiante?.nombre || datosEstudiante?.nombre_apellido || "Notas")
            .replace(/[,\s]+/g, "_");

        const enlace = document.createElement("a");
        enlace.download = `Notas_${nombreArchivo}.jpg`;
        enlace.href = canvas.toDataURL("image/jpeg", 0.92);
        document.body.appendChild(enlace);
        enlace.click();
        enlace.remove();
    } catch (error) {
        console.error("❌ Error al generar la imagen:", error);
        mostrarToast("❌ No se pudo generar la imagen");
    } finally {
        btn.disabled = false;
        btn.innerHTML = textoOriginal;
    }
});

filtroTrimestre?.addEventListener("change", async () => {
    trimestreSeleccionado = filtroTrimestre.value;
    await cargarTodo(trimestreSeleccionado);
});

document.getElementById("btnSalir")?.addEventListener("click", async () => {
    await registrarSalida();
    await supabase.auth.signOut();
    window.location.href = "login.html";
});

// =====================================================
// GENERAR PDF (BOLETÍN DEL TRIMESTRE ACTIVO)
// =====================================================

document.getElementById("btnPdf")?.addEventListener("click", async () => {
    await obtenerTrimestreActivo();
    const trimestreParaBoletin = trimestreActivo;

    const [{ data: columnas }, { data: notas, error }, { data: notasTodas }] = await Promise.all([
        supabase.from("columnas_materia").select("materia, tipo, numero").eq("trimestre", trimestreParaBoletin),
        supabase.from("notas").select("*").eq("correo", usuarioActual.email).eq("trimestre", trimestreParaBoletin),
        supabase.from("notas").select("materia, tipo, numero").eq("trimestre", trimestreParaBoletin)
    ]);

    const casillasConNotaGlobal = new Set(
        (notasTodas || []).map((n) => `${n.materia}|${(n.tipo || "").toLowerCase()}|${n.numero}`)
    );

    if (error) {
        console.error("❌ Error al obtener notas:", error);
        alert("Error al obtener las notas.");
        return;
    }

    if (!notas || notas.length === 0) {
        alert(`No tienes notas registradas en ${trimestreParaBoletin} para generar el boletín.`);
        return;
    }

    const columnasMap = {};
    (columnas || []).forEach((c) => {
        if (!columnasMap[c.materia]) columnasMap[c.materia] = { apreciacion: [], ejercicio: [] };
        if (!columnasMap[c.materia][c.tipo].includes(c.numero)) {
            columnasMap[c.materia][c.tipo].push(c.numero);
        }
    });
    Object.values(columnasMap).forEach((c) => {
        c.apreciacion.sort((a, b) => a - b);
        c.ejercicio.sort((a, b) => a - b);
    });

    const notasMap = {};
    notas.forEach((item) => {
        const mat = item.materia || "Sin Materia";
        if (!notasMap[mat]) notasMap[mat] = { apreciacion: {}, ejercicio: {} };
        const tipoNorm = (item.tipo || "").toLowerCase();
        if (tipoNorm === "apreciacion" || tipoNorm === "ejercicio") {
            notasMap[mat][tipoNorm][item.numero] = {
                nota: Number(item.nota),
                intencional: item.estado === "Intencional"
            };
        }
    });

    const { data: datosEst } = await supabase
        .from("datos_estudiante").select("*").eq("correo", usuarioActual.email).maybeSingle();

    const { data: miEst } = await supabase
        .from("estudiantes").select("codigo, nombre, salon").eq("correo", usuarioActual.email).maybeSingle();

    let pendientesVsGrupo = 0;
    const detallePendientesEstudiante = {};

    if (miEst?.salon) {
        const nivelNum = miEst.salon.replace(/\D/g, '');
        const { data: companerosNivel } = await supabase
            .from("estudiantes").select("correo").like("salon", `${nivelNum}%`).eq("es_prueba", false);

        const correosDelNivel = (companerosNivel || []).map((e) => e.correo).filter(Boolean);

        if (correosDelNivel.length > 0) {
            const { data: notasGrupo } = await supabase
                .from("notas")
                .select("correo, materia, tipo, numero")
                .eq("trimestre", trimestreParaBoletin)
                .in("correo", correosDelNivel);

            const maxCasillaGrupo = {};
            (notasGrupo || []).forEach((n) => {
                const clave = `${n.materia}|${n.tipo}`;
                const num = Number(n.numero) || 0;
                if (!maxCasillaGrupo[clave] || num > maxCasillaGrupo[clave]) {
                    maxCasillaGrupo[clave] = num;
                }
            });

            Object.keys(maxCasillaGrupo).forEach((clave) => {
                const max = maxCasillaGrupo[clave];
                const tiene = notas.filter((n) => `${n.materia}|${n.tipo}` === clave).length;

                if (max > tiene) {
                    const faltan = max - tiene;

                    const separador = clave.lastIndexOf("|");
                    const materiaClave = clave.slice(0, separador);
                    const tipoClave = clave.slice(separador + 1);

                    if (miEst?.salon === "8A" && materiaClave === "Contabilidad") return;

                    pendientesVsGrupo += faltan;

                    if (!detallePendientesEstudiante[materiaClave]) {
                        detallePendientesEstudiante[materiaClave] = { apreciacion: 0, ejercicio: 0 };
                    }
                    if (tipoClave === "apreciacion") detallePendientesEstudiante[materiaClave].apreciacion += faltan;
                    else if (tipoClave === "ejercicio") detallePendientesEstudiante[materiaClave].ejercicio += faltan;
                }
            });
        }
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const fechaEmision = new Date().toLocaleDateString("es-PA");
    const anioEscolar = new Date().getFullYear();

    doc.setFont(undefined, "bold");
    doc.setFontSize(14);
    doc.text("CENTRO EDUCATIVO BASICO GENERAL EL JIRAL", 105, 18, { align: "center" });

    doc.setFontSize(12);
    doc.text("RESUMEN DE CALIFICACIONES", 105, 26, { align: "center" });

    doc.setFont(undefined, "normal");
    doc.setFontSize(10);
    doc.text(`Año escolar: ${anioEscolar}`, 20, 36);
    doc.text(`Trimestre: ${trimestreParaBoletin}`, 105, 36, { align: "center" });
    doc.text(`Fecha de emisión: ${fechaEmision}`, 150, 36);

    doc.setLineWidth(0.3);
    doc.line(20, 40, 190, 40);

    doc.setFont(undefined, "bold");
    doc.setFontSize(11);
    doc.text("Datos del estudiante", 20, 48);
    doc.setFont(undefined, "normal");
    doc.setFontSize(10);

    let yDatos = 55;
    doc.text(`Nombre: ${miEst?.nombre || datosEst?.nombre_apellido || "-"}`, 20, yDatos);
    yDatos += 6;

    if (miEst?.codigo) {
        doc.text(`Código: ${miEst.codigo}`, 20, yDatos);
        yDatos += 6;
    }

    if (datosEst) {
        doc.text(`Cédula: ${datosEst.cedula || "-"}`, 20, yDatos);

        const fechaNac = datosEst.fecha_nacimiento
            ? new Date(datosEst.fecha_nacimiento + "T00:00:00").toLocaleDateString("es-PA")
            : "-";
        doc.text(`Fecha de nacimiento: ${fechaNac}`, 120, yDatos);
        yDatos += 6;

        doc.setFont(undefined, "bold");
        doc.text("Datos del acudiente", 20, yDatos);
        doc.setFont(undefined, "normal");
        yDatos += 6;

        doc.text(`Nombre: ${datosEst.nombre_padre_acudiente || "-"}`, 20, yDatos);
        yDatos += 6;

        doc.text(`Tel. 1: ${datosEst.celular_acudiente1 || "-"}`, 20, yDatos);
        doc.text(`Tel. 2: ${datosEst.telefono_acudiente2 || "-"}`, 100, yDatos);
        yDatos += 8;
    } else {
        doc.text("El estudiante aún no ha completado sus datos personales de contacto.", 20, yDatos);
        yDatos += 8;
    }

    const startYTabla = yDatos + 4;

    const baseMateriasList = miEst?.salon === "8A"
        ? MATERIAS_BASE.map((m) => (m === "Contabilidad" ? "Informática" : m))
        : MATERIAS_BASE;

    const materiasDetectadas = new Set([
        ...baseMateriasList,
        ...Object.keys(columnasMap),
        ...Object.keys(notasMap)
    ]);

    const materiasConDatos = Array.from(materiasDetectadas)
        .filter((m) => {
            if (miEst?.salon === "8A" && m === "Contabilidad") return false;
            return columnasMap[m] || notasMap[m];
        });

    const head = [["Materia"]];
    let maxAprGlobal = 0;
    let maxEjeGlobal = 0;
    materiasConDatos.forEach((m) => {
        maxAprGlobal = Math.max(maxAprGlobal, (columnasMap[m]?.apreciacion || []).length
            ? Math.max(...columnasMap[m].apreciacion) : 0);
        maxEjeGlobal = Math.max(maxEjeGlobal, (columnasMap[m]?.ejercicio || []).length
            ? Math.max(...columnasMap[m].ejercicio) : 0);
    });

    for (let i = 1; i <= maxAprGlobal; i++) head[0].push(`Apr. ${i}`);
    if (maxAprGlobal > 0) head[0].push("Prom. Apr.");
    for (let i = 1; i <= maxEjeGlobal; i++) head[0].push(`Eje. ${i}`);
    if (maxEjeGlobal > 0) head[0].push("Prom. Eje.");
    head[0].push("Prom. Final");

    const body = [];
    let sumaPromedios = 0;
    let totalMaterias = 0;
    let huboIntencional = false;
    let huboCasillasSinRegistrar = false;

    const celdaTexto = (v, algunoTiene) => {
        if (!v) {
            if (algunoTiene) {
                huboCasillasSinRegistrar = true;
                return "?";
            }
            return "";
        }
        if (v.intencional) { huboIntencional = true; return "F*"; }
        return v.nota.toFixed(1);
    };

    materiasConDatos.forEach((materia) => {
        const aprCols = columnasMap[materia]?.apreciacion || [];
        const ejeCols = columnasMap[materia]?.ejercicio || [];
        const notasM = notasMap[materia] || { apreciacion: {}, ejercicio: {} };

        const aprValidos = aprCols.map((n) => notasM.apreciacion[n]).filter(Boolean);
        const ejeValidos = ejeCols.map((n) => notasM.ejercicio[n]).filter(Boolean);

        const promApr = aprValidos.length > 0
            ? aprValidos.reduce((a, b) => a + (b.intencional ? 0 : b.nota), 0) / aprValidos.length : null;
        const promEje = ejeValidos.length > 0
            ? ejeValidos.reduce((a, b) => a + (b.intencional ? 0 : b.nota), 0) / ejeValidos.length : null;

        let promFinal = null;
        if (promApr !== null && promEje !== null) promFinal = (promApr + promEje) / 2;
        else if (promApr !== null) promFinal = promApr;
        else if (promEje !== null) promFinal = promEje;

        const row = [materia];

        for (let i = 1; i <= maxAprGlobal; i++) {
            row.push(aprCols.includes(i)
                ? celdaTexto(notasM.apreciacion[i], casillasConNotaGlobal.has(`${materia}|apreciacion|${i}`))
                : "");
        }
        if (maxAprGlobal > 0) row.push(promApr !== null ? promApr.toFixed(1) : "-");

        for (let i = 1; i <= maxEjeGlobal; i++) {
            row.push(ejeCols.includes(i)
                ? celdaTexto(notasM.ejercicio[i], casillasConNotaGlobal.has(`${materia}|ejercicio|${i}`))
                : "");
        }
        if (maxEjeGlobal > 0) row.push(promEje !== null ? promEje.toFixed(1) : "-");

        row.push(promFinal !== null ? promFinal.toFixed(1) : "-");
        body.push(row);

        if (promFinal !== null) {
            sumaPromedios += promFinal;
            totalMaterias++;
        }
    });

    doc.autoTable({
        head, body, startY: startYTabla,
        styles: { fontSize: 8, halign: "center" },
        headStyles: { fillColor: [30, 41, 59], textColor: 255 },
        columnStyles: { 0: { halign: "left", fontStyle: "bold" } },
        didParseCell: function(data) {
            if (data.section === 'body' && data.cell.raw === '?') {
                data.cell.styles.textColor = [220, 38, 38];
                data.cell.styles.fontStyle = 'bold';
            }
        }
    });

    let y = doc.lastAutoTable.finalY + 6;

    if (huboCasillasSinRegistrar) {
        doc.setFont(undefined, "italic");
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text(
            "Nota: el simbolo \"?\" indica que aun no has registrado esa nota en el sistema " +
            "(no significa que el docente no la haya asignado o calificado).",
            20, y, { maxWidth: 170 }
        );
        doc.setTextColor(0, 0, 0);
        doc.setFont(undefined, "normal");
        doc.setFontSize(10);
        y += 9;
    } else {
        y += 4;
    }

    const promedioGeneral = totalMaterias > 0 ? sumaPromedios / totalMaterias : 0;

    doc.setFont(undefined, "bold");
    doc.setFontSize(11);
    doc.text("Resumen académico", 20, y);
    doc.setFont(undefined, "normal");
    doc.setFontSize(10);

    y += 7;
    doc.text(`Promedio General: ${promedioGeneral.toFixed(1)}`, 20, y);
    y += 6;
    doc.text(`Total de materias con notas: ${totalMaterias}`, 20, y);
    y += 10;

    if (huboIntencional) {
        doc.setFontSize(8);
        doc.setFont(undefined, "italic");
        doc.text("F* = Falta marcada por el consejero (cuenta como 0.0 en el promedio).", 20, y);
        doc.setFont(undefined, "normal");
        doc.setFontSize(10);
        y += 10;
    }

    if (pendientesVsGrupo > 0) {
        if (y > 250) { doc.addPage(); y = 25; }

        doc.setLineWidth(0.5);
        doc.setDrawColor(200, 0, 0);
        doc.line(20, y, 190, y);
        y += 8;

        doc.setFont(undefined, "bold");
        doc.setFontSize(11);
        doc.setTextColor(180, 0, 0);
        doc.text("ALERTA PARA LOS PADRES / ACUDIENTES", 20, y);
        y += 8;

        doc.setFont(undefined, "normal");
        doc.setFontSize(10);

        const textoAlerta =
            `Su hijo(a) tiene ${pendientesVsGrupo} nota(s) pendiente(s) de registrar, en comparacion ` +
            "con el resto de sus companeros de grupo. Le recomendamos averiguar con su hijo(a) o " +
            "con el docente la razon de estas actividades pendientes, y corregir la situacion lo " +
            "antes posible para que este al dia con el resto del grupo.";

        doc.text(textoAlerta, 20, y, { maxWidth: 170 });
        doc.setTextColor(0, 0, 0);

        const lineasAlerta = doc.splitTextToSize(textoAlerta, 170);
        y += lineasAlerta.length * 5 + 4;

        if (Object.keys(detallePendientesEstudiante).length > 0) {
            const filasDetalle = Object.keys(detallePendientesEstudiante).sort().map((materia) => {
                const d = detallePendientesEstudiante[materia];
                const total = d.apreciacion + d.ejercicio;
                return [
                    materia,
                    d.apreciacion > 0 ? `${d.apreciacion} ?` : "-",
                    d.ejercicio > 0 ? `${d.ejercicio} ?` : "-",
                    String(total)
                ];
            });

            doc.autoTable({
                head: [["Materia", "Apreciación pendiente", "Ejercicio pendiente", "Total"]],
                body: filasDetalle, startY: y,
                styles: { fontSize: 8, halign: "center" },
                headStyles: { fillColor: [180, 0, 0], textColor: 255 },
                columnStyles: { 0: { halign: "left", fontStyle: "bold" } },
                margin: { left: 20, right: 20 },
                didParseCell: function(data) {
                    if (data.section === 'body' && typeof data.cell.raw === 'string' && data.cell.raw.includes('?')) {
                        data.cell.styles.textColor = [220, 38, 38];
                        data.cell.styles.fontStyle = 'bold';
                    }
                }
            });
            y = doc.lastAutoTable.finalY + 8;
        } else {
            y += 6;
        }
    }

    y += 20;
    if (y > 265) { doc.addPage(); y = 40; }

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);

    doc.line(25, y, 90, y);
    doc.setFont(undefined, "normal");
    doc.setFontSize(9);
    doc.text("Firma del consejero(a)", 30, y + 5);

    doc.line(120, y, 185, y);
    doc.text("Firma del padre de familia / acudiente", 122, y + 5);

    const nombreArchivo = (miEst?.nombre || datosEst?.nombre_apellido || "Boletin").replace(/[,\s]+/g, "_");
    doc.save(`Boletin_${nombreArchivo}.pdf`);
});

// =====================================================
// INICIAR TODO
// =====================================================

// =====================================================
// PREGUNTAS DE SEGURIDAD OBLIGATORIAS (si aún no las tiene)
// =====================================================

async function verificarPreguntasSeguridadObligatorias() {
    // Si es el administrador revisando el boletín de otro estudiante
    // (?correo=... en la URL), no se le fuerza a él a responder las
    // preguntas de seguridad del estudiante.
    if (usuarioActual?.esAdminSimulado) return;

    const { data: tiene, error } = await supabase.rpc(
        "tiene_preguntas_seguridad",
        { p_correo: usuarioActual.email }
    );

    if (error) {
        // Si falla la verificación (ej. problema de red), no se bloquea
        // al estudiante para que igual pueda usar el sistema.
        console.error("❌ Error al verificar preguntas de seguridad:", error);
        return;
    }

    if (tiene) return;

    const overlay = document.getElementById("overlayPreguntas");
    const form = document.getElementById("formPreguntasObligatorias");
    const mensaje = document.getElementById("mensajePreguntasObligatorias");
    const btn = document.getElementById("btnGuardarPreguntasObligatorias");

    if (!overlay || !form) return;

    overlay.style.display = "flex";
    document.body.style.overflow = "hidden";

    await new Promise((resolve) => {
        form.addEventListener("submit", async function manejarSubmit(e) {
            e.preventDefault();

            const r1 = document.getElementById("opRespuesta1").value.trim();
            const r2 = document.getElementById("opRespuesta2").value.trim();
            const r3 = document.getElementById("opRespuesta3").value.trim();

            if (!r1 || !r2 || !r3) {
                mensaje.textContent = "⚠️ Completa las 3 respuestas.";
                mensaje.className = "mensaje-preguntas visible";
                return;
            }

            btn.disabled = true;
            btn.textContent = "Guardando...";

            const { data: ok, error: errGuardar } = await supabase.rpc(
                "guardar_preguntas_seguridad",
                {
                    p_correo: usuarioActual.email,
                    p_respuesta1: r1,
                    p_respuesta2: r2,
                    p_respuesta3: r3
                }
            );

            btn.disabled = false;
            btn.textContent = "💾 Guardar y continuar";

            if (errGuardar || !ok) {
                console.error("❌ Error al guardar preguntas de seguridad:", errGuardar);
                mensaje.textContent = "❌ No se pudo guardar, intenta de nuevo.";
                mensaje.className = "mensaje-preguntas visible";
                return;
            }

            form.removeEventListener("submit", manejarSubmit);
            overlay.style.display = "none";
            document.body.style.overflow = "";
            resolve();
        });
    });
}

// =====================================================
// REGISTRO DE VISITAS A LA PLATAFORMA
// =====================================================
//
// Cada vez que un estudiante entra a esta página se crea una fila
// en "visitas" con la hora de inicio. Mientras tenga la pestaña
// abierta y visible, cada 30 segundos se actualiza "ultima_actividad"
// (esto es lo que permite calcular después, en el panel de admin o
// consejero, cuánto tiempo estuvo realmente conectado).
// No se activa si es el administrador revisando el boletín de otro
// estudiante (modo simulado con ?correo=...).

let visitaActualId = null;
let heartbeatVisitaInterval = null;

async function iniciarRegistroVisita() {
    if (usuarioActual?.esAdminSimulado) return;

    try {
        const { data, error } = await supabase
            .from("visitas")
            .insert([{
                correo: usuarioActual.email,
                salon: miEstudiante?.salon || null
            }])
            .select("id")
            .single();

        if (error || !data) {
            console.warn("⚠️ No se pudo registrar la visita:", error);
            return;
        }

        visitaActualId = data.id;

        heartbeatVisitaInterval = setInterval(() => {
            if (!visitaActualId) return;
            if (document.visibilityState !== "visible") return;

            supabase
                .from("visitas")
                .update({ ultima_actividad: new Date().toISOString() })
                .eq("id", visitaActualId)
                .then(({ error: errHeartbeat }) => {
                    if (errHeartbeat) {
                        console.warn("⚠️ No se pudo actualizar la visita:", errHeartbeat);
                    }
                });
        }, 30000);
    } catch (err) {
        console.warn("⚠️ Error inesperado al registrar la visita:", err);
    }
}

async function inicializarPagina() {
    const user = await mostrarUsuario();
    if (!user) return;

    await Promise.all([
        cargarDatosEstudiante(),
        obtenerTrimestreActivo()
    ]);

    trimestreSeleccionado = trimestreActivo;
    if (filtroTrimestre) filtroTrimestre.value = trimestreActivo;

    iniciarRegistroVisita();

    await verificarPreguntasSeguridadObligatorias();

    await cargarTodo(trimestreSeleccionado);
}

inicializarPagina();
