import { supabase } from "./supabase.js";

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

function materiasParaMostrar() {
    const base = miEstudiante?.salon === "8A"
        ? MATERIAS_BASE.map((m) => (m === "Contabilidad" ? "Informática" : m))
        : MATERIAS_BASE;

    const extras = Object.keys(columnasPorMateria)
        .filter((m) => !base.includes(m) && !(miEstudiante?.salon === "8A" && m === "Contabilidad"))
        .sort();

    return [...base, ...extras];
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
let temasOficialesPorMateria = {};
let companerosPorCasilla = {};
let creadoPorPorCasilla = {};
let nombrePorCorreo = {};
let columnaEsOficial = {};

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
            .select("codigo, nombre, salon")
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

    const consultas = [
        supabase
            .from("columnas_materia")
            .select("materia, tipo, numero, creado_por")
            .eq("trimestre", trimestre)
    ];

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

async function cargarTodo(trimestre) {
    await Promise.all([
        cargarColumnas(trimestre),
        cargarNotasEstudiante(trimestre),
        cargarCompanerosConNotas(trimestre)
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

    if (nota && nota.estado === "Intencional") {
        return `
            <td>
                <div class="celda-nota solo-lectura" title="Falta marcada por el consejero(a) (cuenta como 0.0)">
                    ⚠️
                </div>
            </td>
        `;
    }

    const valor = nota?.nota ?? "";
    const disabled = soloLectura ? "disabled" : "";

    let avisoCompaneros = "";
    const clave = `${materia}|${tipo}|${numero}`;
    const nombres = companerosPorCasilla[clave] || [];

    if (nombres.length > 0) {
        avisoCompaneros = `
            <button
                type="button"
                class="btn-companeros"
                title="Ya tienen nota aquí: ${escapeHtml(nombres.join(", "))}"
                data-nombres="${escapeHtml(nombres.join(", "))}"
                data-cantidad="${nombres.length}"
            >👥 ${nombres.length}</button>
        `;
    }

    return `
        <td>
            <div class="celda-nota">
                <input
                    type="number"
                    class="input-nota"
                    min="1" max="5" step="0.1"
                    value="${escapeHtml(valor)}"
                    placeholder="—"
                    data-materia="${escapeHtml(materia)}"
                    data-tipo="${tipo}"
                    data-numero="${numero}"
                    ${disabled}
                >
                ${avisoCompaneros}
            </div>
        </td>
    `;
}

// =====================================================
// RENDER DE LA CELDA DE "TEMA"
// =====================================================

function celdaTemaHtml(materia, tipo, numero) {
    const temaOficial = temasOficialesPorMateria[materia]?.[tipo]?.[numero];

    if (temaOficial) {
        return `<th class="celda-tema-fija" title="Tema puesto por el profesor(a)/administrador — no se puede editar aquí">
            🔒 ${escapeHtml(temaOficial)}
        </th>`;
    }

    const nota = notasPorMateria[materia]?.[tipo]?.[numero];
    const soloLectura = !estaEditando();
    const sinNotaAun = !nota || nota.estado === "Intencional";
    const disabled = (soloLectura || sinNotaAun) ? "disabled" : "";
    const placeholder = sinNotaAun ? "Escribe la nota primero" : "Tema (opcional)";

    return `
        <th class="celda-tema-editable">
            <input
                type="text"
                class="input-tema"
                value="${escapeHtml(nota?.tema ?? "")}"
                placeholder="${placeholder}"
                data-materia="${escapeHtml(materia)}"
                data-tipo="${tipo}"
                data-numero="${numero}"
                ${disabled}
            >
        </th>
    `;
}

// =====================================================
// TEXTO DEL TOOLTIP (REVELA CREADOR EXACTO)
// =====================================================

function tituloColumnaHeader(materia, tipo, numero) {
    if (temasOficialesPorMateria[materia]?.[tipo]?.[numero]) {
        return "Esta columna la creó el profesor(a) o el/la administrador(a) del sistema.";
    }

    const correoCreador = creadoPorPorCasilla[`${materia}|${tipo}|${numero}`];

    if (correoCreador) {
        if (correoCreador === usuarioActual.email) {
            return "Esta columna la creaste tú.";
        }
        const nombre = nombrePorCorreo[correoCreador];
        return nombre
            ? `Esta columna la creó: ${nombre}.`
            : `Esta columna la creó: ${correoCreador}.`;
    }

    return "Columna creada por un estudiante de tu nivel.";
}

// =====================================================
// BOTÓN "ELIMINAR COLUMNA"
// =====================================================

function botonBorrarColumnaHtml(materia, tipo, numero) {
    const clave = `${materia}|${tipo}|${numero}`;

    if (!estaEditando()) return "";
    if (columnaEsOficial[clave]) return "";

    const nota = notasPorMateria[materia]?.[tipo]?.[numero];
    if (nota && nota.estado === "Intencional") return "";

    return `
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

// =====================================================
// RENDER DE LA TARJETA DE UNA MATERIA
// =====================================================

function materiaCardHtml(materia) {
    const cols = columnasPorMateria[materia] || { apreciacion: [], ejercicio: [] };
    const apr = cols.apreciacion;
    const eje = cols.ejercicio;

    let tabla = "";

    if (apr.length === 0 && eje.length === 0) {
        tabla = `<p style="color:#64748b; font-size:14px;">Todavía no hay columnas de notas para esta materia.</p>`;
    } else {
        let filaHead1 = `<tr>`;
        if (apr.length > 0) filaHead1 += `<th colspan="${apr.length + 1}">Notas de Apreciación</th>`;
        if (eje.length > 0) filaHead1 += `<th colspan="${eje.length + 1}">Notas de Ejercicio</th>`;
        filaHead1 += `<th rowspan="3">Promedio Final</th></tr>`;

        let filaHead2 = `<tr>`;
        apr.forEach((n) => { filaHead2 += `<th title="${escapeHtml(tituloColumnaHeader(materia, "apreciacion", n))}">Apreciación ${n} ℹ️${botonBorrarColumnaHtml(materia, "apreciacion", n)}</th>`; });
        if (apr.length > 0) filaHead2 += `<th>Prom. Apr.</th>`;
        eje.forEach((n) => { filaHead2 += `<th title="${escapeHtml(tituloColumnaHeader(materia, "ejercicio", n))}">Ejercicio ${n} ℹ️${botonBorrarColumnaHtml(materia, "ejercicio", n)}</th>`; });
        if (eje.length > 0) filaHead2 += `<th>Prom. Eje.</th>`;
        filaHead2 += `</tr>`;

        let filaHead3 = `<tr class="fila-temas">`;
        apr.forEach((n) => { filaHead3 += celdaTemaHtml(materia, "apreciacion", n); });
        if (apr.length > 0) filaHead3 += `<th class="celda-tema-vacia"></th>`;
        eje.forEach((n) => { filaHead3 += celdaTemaHtml(materia, "ejercicio", n); });
        if (eje.length > 0) filaHead3 += `<th class="celda-tema-vacia"></th>`;
        filaHead3 += `</tr>`;

        const promApr = calcularPromedio(materia, "apreciacion", apr);
        const promEje = calcularPromedio(materia, "ejercicio", eje);
        const promFinal = calcularPromedioFinal(materia, apr, eje);

        let filaDatos = `<tr>`;
        apr.forEach((n) => { filaDatos += celdaNotaHtml(materia, "apreciacion", n); });
        if (apr.length > 0) {
            filaDatos += `<td class="celda-promedio">${promApr !== null ? promApr.toFixed(1) : "-"}</td>`;
        }
        eje.forEach((n) => { filaDatos += celdaNotaHtml(materia, "ejercicio", n); });
        if (eje.length > 0) {
            filaDatos += `<td class="celda-promedio">${promEje !== null ? promEje.toFixed(1) : "-"}</td>`;
        }
        filaDatos += `<td class="celda-promedio">${promFinal !== null ? promFinal.toFixed(1) : "-"}</td>`;
        filaDatos += `</tr>`;

        tabla = `
            <div class="tabla-contenedor">
                <table class="tabla-notas">
                    <thead>${filaHead1}${filaHead2}${filaHead3}</thead>
                    <tbody>${filaDatos}</tbody>
                </table>
            </div>
        `;
    }

    const botones = estaEditando() ? `
        <div class="fila-botones-materia">
            <button type="button" class="btn-agregar-col" data-materia="${escapeHtml(materia)}" data-tipo="apreciacion">
                ➕ Agregar Apreciación
            </button>
            <button type="button" class="btn-agregar-col" data-materia="${escapeHtml(materia)}" data-tipo="ejercicio">
                ➕ Agregar Ejercicio
            </button>
        </div>
    ` : "";

    return `
        <section class="materia-card">
            <h2>${escapeHtml(materia)}</h2>
            ${tabla}
            ${botones}
        </section>
    `;
}

function render() {
    avisoSoloLectura.style.display = estaEditando() ? "none" : "inline-block";
    contenedorMaterias.innerHTML = materiasParaMostrar().map(materiaCardHtml).join("");
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
    } else {
        const { data, error } = await supabase
            .from("notas")
            .insert([{
                correo: usuarioActual.email,
                materia,
                tipo,
                numero,
                tema: null,
                actividad: etiquetaCasillaRespaldo(tipo, numero),
                fecha: fechaHoy(),
                nota: valor,
                observacion: null,
                trimestre: trimestreActivo,
                estado: "Activa"
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

    const { error } = await supabase
        .from("columnas_materia")
        .insert([{ materia, tipo, numero: siguienteNumero, trimestre: trimestreActivo, creado_por: usuarioActual.email }]);

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
        .select("id, correo")
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
    const soloLaMia = filas.length === 1 && filas[0].correo === usuarioActual.email;

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

    const { error: errBorrar } = await supabase
        .from("columnas_materia")
        .delete()
        .eq("materia", materia)
        .eq("tipo", tipo)
        .eq("numero", numero)
        .eq("trimestre", trimestreActivo);

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

    inputs.forEach((input) => {
        const valorTexto = input.value.trim();
        if (valorTexto === "") return;

        const valor = parseFloat(valorTexto);
        if (Number.isNaN(valor) || valor < 1 || valor > 5) return;

        const materia = input.dataset.materia;
        const tipo = input.dataset.tipo;
        const numero = Number(input.dataset.numero);
        const esNueva = !notasPorMateria[materia]?.[tipo]?.[numero];

        const fila = {
            correo: usuarioActual.email,
            materia,
            tipo,
            numero,
            fecha: fechaHoy(),
            nota: valor,
            trimestre: trimestreActivo,
            estado: "Activa"
        };

        if (esNueva) {
            fila.actividad = etiquetaCasillaRespaldo(tipo, numero);
        }

        filas.push(fila);
    });

    if (filas.length === 0) {
        mostrarToast("No hay calificaciones para guardar");
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
        const nombres = e.target.dataset.nombres;
        const cantidad = e.target.dataset.cantidad;
        alert(`${cantidad} estudiante(s) del nivel ya tienen nota en esta casilla:\n\n${nombres}\n\nPuedes preguntarles o buscar la nota con el profesor(a).`);
    }
});

// El botón "Guardar todos los cambios" ya no se usa: cada nota se guarda
// automáticamente al escribirla (ver guardarCelda), así que ese botón
// solo generaba errores en conexiones débiles sin aportar nada nuevo.
// Se oculta en vez de borrarlo del HTML, por si en el futuro se reactiva.
document.getElementById("btnGuardarTodo")?.style.setProperty("display", "none");

document.getElementById("btnImprimir")?.addEventListener("click", () => window.print());

filtroTrimestre?.addEventListener("change", async () => {
    trimestreSeleccionado = filtroTrimestre.value;
    await cargarTodo(trimestreSeleccionado);
});

document.getElementById("btnSalir")?.addEventListener("click", async () => {
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

async function inicializarPagina() {
    const user = await mostrarUsuario();
    if (!user) return;

    await Promise.all([
        cargarDatosEstudiante(),
        obtenerTrimestreActivo()
    ]);

    trimestreSeleccionado = trimestreActivo;
    if (filtroTrimestre) filtroTrimestre.value = trimestreActivo;

    await cargarTodo(trimestreSeleccionado);
}

inicializarPagina();