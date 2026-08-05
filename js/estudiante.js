import { supabase } from "./supabase.js";

// =====================================================
// ELEMENTOS DEL DOM
// =====================================================

const form = document.getElementById("formNota");
const listaNotas = document.getElementById("listaNotas");
const filtroTrimestre = document.getElementById("filtroTrimestre");

// =====================================================
// VARIABLES GLOBALES
// =====================================================

let notaEditando = null;
let trimestreActivo = null;

if (!form) {
    console.error("❌ No se encontró el formulario con id='formNota'");
}

if (!listaNotas) {
    console.error("❌ No se encontró el elemento con id='listaNotas'");
}

// =====================================================
// OBTENER TRIMESTRE ACTIVO DESDE SUPABASE
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
            return trimestreActivo;
        }

        trimestreActivo = data.trimestre_activo;
        console.log("✅ Trimestre activo:", trimestreActivo);
        return trimestreActivo;

    } catch (error) {
        console.error("❌ Error inesperado al obtener el trimestre activo:", error);
        trimestreActivo = "Trimestre 1";
        return trimestreActivo;
    }
}

// =====================================================
// MOSTRAR USUARIO LOGUEADO
// =====================================================

async function mostrarUsuario() {
    try {
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error) {
            console.error("❌ Error al obtener usuario:", error);
            return;
        }

        if (user) {
            const elementoUsuario = document.getElementById("usuario");
            if (elementoUsuario) {
                elementoUsuario.textContent = `Bienvenido: ${user.email}`;
            }
        }
    } catch (error) {
        console.error("❌ Error inesperado al mostrar usuario:", error);
    }
}

// =====================================================
// INICIALIZAR PÁGINA
// =====================================================

async function inicializarPagina() {
    console.log("🚀 Inicializando página de estudiante...");

    await mostrarUsuario();
    await obtenerTrimestreActivo();

    if (listaNotas) {
        await cargarNotas();
    }

    console.log("✅ Página inicializada correctamente.");
}

// =====================================================
// FILTRO DE TRIMESTRE
// =====================================================

if (filtroTrimestre) {
    filtroTrimestre.addEventListener("change", () => {
        cargarNotas();
    });
}

// =====================================================
// EVENTO PARA GUARDAR O ACTUALIZAR NOTA
// =====================================================

if (form) {
    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError || !user) {
            alert("Tu sesión expiró. Por favor, inicia sesión de nuevo.");
            return;
        }

        if (!trimestreActivo) {
            await obtenerTrimestreActivo();
        }

        const trimestre = trimestreActivo;

        // =================================================
        // OBTENER DATOS DEL FORMULARIO
        // =================================================

        const materia = document.getElementById("materia")?.value.trim() || "";
        const tipo = document.getElementById("tipo")?.value || "";
        const numeroRaw = document.getElementById("numero")?.value || "";
        const numero = parseInt(numeroRaw, 10);
        const tema = document.getElementById("tema")?.value.trim() || "";
        const fecha = document.getElementById("fecha")?.value || "";
        const nota = parseFloat(document.getElementById("nota")?.value);
        const observacion = document.getElementById("observacion")?.value.trim() || "";

        // =================================================
        // VALIDAR CAMPOS
        // =================================================

        if (!materia || !tipo || !numeroRaw || !tema || !fecha || Number.isNaN(nota)) {
            alert("Por favor, complete todos los campos obligatorios.");
            return;
        }

        if (Number.isNaN(numero) || numero < 1 || numero > 10) {
            alert("La casilla (N°) debe estar entre 1 y 10.");
            return;
        }

        if (nota < 1 || nota > 5) {
            alert("La nota debe estar entre 1.0 y 5.0.");
            return;
        }

        // =================================================
        // VERIFICAR SI ESA CASILLA YA TIENE NOTA
        // (solo aplica al crear una nota nueva, no al editar
        // la que ya está abierta para edición)
        // =================================================

        if (!notaEditando) {
            const { data: notaExistente, error: errBuscarExistente } = await supabase
                .from("notas")
                .select("id, nota, tema")
                .eq("correo", user.email)
                .eq("materia", materia)
                .eq("tipo", tipo)
                .eq("numero", numero)
                .eq("trimestre", trimestre)
                .maybeSingle();

            if (errBuscarExistente) {
                console.error("❌ Error al verificar si la casilla ya tiene nota:", errBuscarExistente);
            } else if (notaExistente) {
                const tipoTexto = tipo === "apreciacion" ? "Apreciación" : "Ejercicio";
                const notaTexto = Number(notaExistente.nota).toFixed(1);

                alert(
                    `⚠️ Esa casilla ya está llena.\n\n` +
                    `Ya tienes registrada una nota en "${materia} - ${tipoTexto} N°${numero}" ` +
                    `(nota: ${notaTexto}${notaExistente.tema ? `, tema: "${notaExistente.tema}"` : ""}).\n\n` +
                    `Si quieres corregirla, edítala desde la tabla de "Notas registradas" (botón ✏️) en vez de crear una nueva.`
                );

                return;
            }
        }

        // =================================================
        // ACTUALIZAR NOTA
        // =================================================

        if (notaEditando) {
            const { data, error } = await supabase
                .from("notas")
                .update({
                    materia,
                    tipo,
                    numero,
                    tema,
                    actividad: tema, // se mantiene por compatibilidad con registros/consultas viejos
                    fecha,
                    nota,
                    observacion,
                    trimestre
                })
                .eq("id", notaEditando)
                .select();

            if (error) {
                console.error("❌ Error al actualizar:", error);

                if (error.code === "23505") {
                    alert("Ya existe una nota en esa casilla (mismo tipo y número) para esta materia y trimestre.");
                } else if (error.code === "23514") {
                    alert("Datos inválidos: revisa que el número esté entre 1 y 10 y el tipo sea válido.");
                } else {
                    alert("Error al actualizar la nota: " + error.message);
                }

                return;
            }

            console.log("Resultado update:", data);
            alert("✅ Nota actualizada correctamente.");

            notaEditando = null;
            restaurarBotonGuardar();
        }

        // =================================================
        // CREAR NOTA NUEVA
        // =================================================

        else {
            const { error } = await supabase
                .from("notas")
                .insert([{
                    correo: user.email,
                    materia,
                    tipo,
                    numero,
                    tema,
                    actividad: tema, // compatibilidad con registros viejos
                    fecha,
                    nota,
                    observacion,
                    trimestre,
                    estado: "Activa"
                }]);

            if (error) {
                console.error("❌ Error al guardar:", error);

                if (error.code === "23505") {
                    alert(`Ya existe una nota de "${tipo === "apreciacion" ? "Apreciación" : "Ejercicio"} ${numero}" para esta materia en este trimestre. Edítala en la tabla en vez de crear una nueva.`);
                } else if (error.code === "23514") {
                    alert("Datos inválidos: revisa que el número esté entre 1 y 10 y el tipo sea válido.");
                } else {
                    alert("Error al guardar la nota: " + error.message);
                }

                return;
            }

            alert("✅ Nota guardada correctamente.");
        }

        form.reset();
        await cargarNotas();
    });
}

// =====================================================
// RESTAURAR BOTÓN GUARDAR
// =====================================================

function restaurarBotonGuardar() {
    const btnGuardar = form?.querySelector("button[type='submit']");
    if (btnGuardar) {
        btnGuardar.textContent = "💾 Guardar nota";
    }
}

// =====================================================
// EDITAR NOTA
// =====================================================

window.editarNota = async function (id) {
    const { data, error } = await supabase
        .from("notas")
        .select("*")
        .eq("id", id)
        .single();

    if (error || !data) {
        console.error("❌ Error al obtener la nota:", error);
        alert("No se pudo cargar la nota para editar.");
        return;
    }

    if (data.estado === "Intencional") {
        alert("Esta casilla fue marcada por el consejero como falta intencional y no se puede editar desde aquí.");
        return;
    }

    document.getElementById("materia").value = data.materia ?? "";
    document.getElementById("tipo").value = data.tipo ?? "";
    document.getElementById("numero").value = data.numero ?? "";
    document.getElementById("tema").value = data.tema ?? data.actividad ?? "";
    document.getElementById("fecha").value = data.fecha ?? "";
    document.getElementById("nota").value = data.nota ?? "";
    document.getElementById("observacion").value = data.observacion ?? "";

    notaEditando = id;

    const btnGuardar = form?.querySelector("button[type='submit']");
    if (btnGuardar) {
        btnGuardar.textContent = "🔄 Actualizar nota";
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
};

// =====================================================
// ELIMINAR NOTA
// =====================================================

window.eliminarNota = async function (id) {
    const confirmar = confirm("¿Seguro que deseas eliminar esta nota?");
    if (!confirmar) return;

    const { error } = await supabase.from("notas").delete().eq("id", id);

    if (error) {
        console.error("❌ Error al eliminar:", error);
        alert("Error al eliminar la nota: " + error.message);
        return;
    }

    alert("✅ Nota eliminada correctamente.");
    await cargarNotas();
};

// =====================================================
// CARGAR NOTAS
// =====================================================

async function cargarNotas() {
    if (!listaNotas) return;

    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
        listaNotas.innerHTML = '<p style="color:red;">Debes iniciar sesión para ver tus notas.</p>';
        return;
    }

    const filtroVal = document.getElementById("filtroTrimestre")?.value || "todos";

    let query = supabase.from("notas").select("*").eq("correo", user.email);

    if (filtroVal !== "todos") {
        query = query.eq("trimestre", filtroVal);
    }

    const { data, error } = await query
        .order("materia", { ascending: true })
        .order("numero", { ascending: true });

    if (error) {
        console.error("❌ Error al cargar las notas:", error);
        listaNotas.innerHTML = '<p style="color:red;">No se pudieron cargar las notas.</p>';
        return;
    }

    if (!data || data.length === 0) {
        listaNotas.innerHTML = "<p>No hay notas registradas para este trimestre.</p>";
        return;
    }

    // =================================================
    // ORGANIZAR MATERIAS POR CASILLA (1-10)
    // =================================================

    const materiasMap = {};
    let maxApreciacion = 0;
    let maxEjercicio = 0;

    data.forEach((item) => {
        const mat = item.materia || "Sin Materia";

        if (!materiasMap[mat]) {
            materiasMap[mat] = {
                apreciacion: Array(10).fill(null),
                ejercicio: Array(10).fill(null)
            };
        }

        const tipoNorm = (item.tipo || "").toLowerCase();
        const casilla = Number(item.numero);

        if (!casilla || casilla < 1 || casilla > 10) return;

        if (tipoNorm === "apreciacion") {
            materiasMap[mat].apreciacion[casilla - 1] = item;
            if (casilla > maxApreciacion) maxApreciacion = casilla;
        } else if (tipoNorm === "ejercicio") {
            materiasMap[mat].ejercicio[casilla - 1] = item;
            if (casilla > maxEjercicio) maxEjercicio = casilla;
        }
    });

    // =================================================
    // PROTEGER HTML
    // =================================================

    const escapeHtml = (str) => {
        return String(str ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    };

    // =================================================
    // CELDA DE NOTA
    // =================================================

    const celdaNota = (item) => {
        if (!item) {
            return `<td></td>`;
        }

        // Casilla marcada por el consejero como falta intencional:
        // cuenta como 0.0 en el promedio, pero se distingue visualmente
        // de una nota normal y no se puede editar/eliminar desde aquí.
        if (item.estado === "Intencional") {
            return `
                <td>
                    <div class="nota-valor" title="Falta marcada por el consejero (cuenta como 0.0 en el promedio)">⚠️</div>
                    <div class="nota-tema" style="color:#b45309;">Falta intencional</div>
                </td>
            `;
        }

        return `
            <td>
                <div class="nota-valor">${escapeHtml(item.nota ?? "")}</div>
                ${item.tema ? `<div class="nota-tema" title="${escapeHtml(item.tema)}">${escapeHtml(item.tema)}</div>` : ""}
                <div class="notas-acciones">
                    <button type="button" class="btn-nota" title="Editar" aria-label="Editar nota" onclick="editarNota('${item.id}')">✏️</button>
                    <button type="button" class="btn-nota" title="Eliminar" aria-label="Eliminar nota" onclick="eliminarNota('${item.id}')">🗑️</button>
                </div>
            </td>
        `;
    };

    // =================================================
    // CREAR TABLA
    // =================================================

    let htmlTabla = `
        <div class="tabla-contenedor">
            <table class="tabla-notas">
                <thead>
                    <tr>
                        <th rowspan="2">Materia</th>
    `;

    if (maxApreciacion > 0) {
        htmlTabla += `<th colspan="${maxApreciacion + 1}">Notas de Apreciación</th>`;
    }

    if (maxEjercicio > 0) {
        htmlTabla += `<th colspan="${maxEjercicio + 1}">Notas de Ejercicio</th>`;
    }

    htmlTabla += `
                        <th rowspan="2">Promedio Final</th>
                    </tr>
                    <tr>
    `;

    for (let i = 1; i <= maxApreciacion; i++) {
        htmlTabla += `<th>${i}</th>`;
    }
    if (maxApreciacion > 0) {
        htmlTabla += `<th>Prom. Apr.</th>`;
    }

    for (let i = 1; i <= maxEjercicio; i++) {
        htmlTabla += `<th>${i}</th>`;
    }
    if (maxEjercicio > 0) {
        htmlTabla += `<th>Prom. Eje.</th>`;
    }

    htmlTabla += `
                    </tr>
                </thead>
                <tbody>
    `;

    // =================================================
    // FILAS POR MATERIA
    // =================================================

    Object.keys(materiasMap).forEach((materia) => {
        const apreciaciones = materiasMap[materia].apreciacion.slice(0, maxApreciacion);
        const ejercicios = materiasMap[materia].ejercicio.slice(0, maxEjercicio);

        const apreciacionesValidas = apreciaciones.filter(Boolean);
        const ejerciciosValidos = ejercicios.filter(Boolean);

        const promApr = apreciacionesValidas.length > 0
            ? apreciacionesValidas.reduce((total, item) => total + Number(item.nota), 0) / apreciacionesValidas.length
            : null;

        const promEje = ejerciciosValidos.length > 0
            ? ejerciciosValidos.reduce((total, item) => total + Number(item.nota), 0) / ejerciciosValidos.length
            : null;

        let promFinal = "-";
        if (promApr !== null && promEje !== null) {
            promFinal = ((promApr + promEje) / 2).toFixed(1);
        } else if (promApr !== null) {
            promFinal = promApr.toFixed(1);
        } else if (promEje !== null) {
            promFinal = promEje.toFixed(1);
        }

        htmlTabla += `
            <tr>
                <td><strong>${escapeHtml(materia)}</strong></td>
        `;

        apreciaciones.forEach((item) => {
            htmlTabla += celdaNota(item);
        });

        if (maxApreciacion > 0) {
            htmlTabla += `<td><strong>${promApr !== null ? promApr.toFixed(1) : "-"}</strong></td>`;
        }

        ejercicios.forEach((item) => {
            htmlTabla += celdaNota(item);
        });

        if (maxEjercicio > 0) {
            htmlTabla += `<td><strong>${promEje !== null ? promEje.toFixed(1) : "-"}</strong></td>`;
        }

        htmlTabla += `
                <td><strong>${promFinal}</strong></td>
            </tr>
        `;
    });

    htmlTabla += `
                </tbody>
            </table>
        </div>
    `;

    listaNotas.innerHTML = htmlTabla;
}

// =====================================================
// BOTONES DE SESIÓN Y PDF
// =====================================================

const btnSalir = document.getElementById("btnSalir");
const btnPdf = document.getElementById("btnPdf");

if (btnSalir) {
    btnSalir.addEventListener("click", async () => {
        await supabase.auth.signOut();
        window.location.href = "login.html";
    });
}

// =====================================================
// GENERAR PDF
// =====================================================

if (btnPdf) {
    btnPdf.addEventListener("click", async () => {
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            alert("Debes iniciar sesión.");
            return;
        }

        // -------- Trimestre activo del sistema --------
        // El boletín SIEMPRE se genera para el trimestre activo, igual que
        // lo hace el consejero(a) desde su panel (no usa el filtro "Ver:"
        // de esta pantalla, que es solo para consultar notas de trimestres
        // pasados, no para el boletín oficial).
        await obtenerTrimestreActivo();

        const trimestreParaBoletin = trimestreActivo;

        let query = supabase
            .from("notas")
            .select("*")
            .eq("correo", user.email)
            .eq("trimestre", trimestreParaBoletin);

        const { data: notas, error } = await query
            .order("materia", { ascending: true })
            .order("numero", { ascending: true });

        if (error) {
            console.error("❌ Error al obtener notas:", error);
            alert("Error al obtener las notas.");
            return;
        }

        if (!notas || notas.length === 0) {
            alert(`No tienes notas registradas en ${trimestreParaBoletin} para generar el boletín.`);
            return;
        }

        const { data: datosEstudiante } = await supabase
            .from("datos_estudiante")
            .select("*")
            .eq("correo", user.email)
            .maybeSingle();

        // -------- Código, nombre "oficial" y salón --------
        // (misma tabla que usa el consejero(a) para su versión del boletín,
        // así ambos documentos salen con el mismo formato)
        const { data: miEstudiante } = await supabase
            .from("estudiantes")
            .select("codigo, nombre, salon")
            .eq("correo", user.email)
            .maybeSingle();

        // -------- Trimestre a mostrar en el encabezado --------
        const trimestreTexto = trimestreParaBoletin;

        // -------- Comparación con el grupo (igual que en el panel del consejero) --------
        let pendientesVsGrupo = 0;
        const detallePendientesEstudiante = {};

        if (miEstudiante?.salon) {
            const { data: companerosSalon } = await supabase
                .from("estudiantes")
                .select("correo")
                .eq("salon", miEstudiante.salon);

            const correosDelSalon = (companerosSalon || [])
                .map((e) => e.correo)
                .filter((c) => !!c);

            if (correosDelSalon.length > 0) {
                const { data: notasGrupo } = await supabase
                    .from("notas")
                    .select("correo, materia, tipo, numero")
                    .eq("trimestre", trimestreParaBoletin)
                    .in("correo", correosDelSalon);

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
                        pendientesVsGrupo += faltan;

                        const separador = clave.lastIndexOf("|");
                        const materiaClave = clave.slice(0, separador);
                        const tipoClave = clave.slice(separador + 1);

                        if (!detallePendientesEstudiante[materiaClave]) {
                            detallePendientesEstudiante[materiaClave] = { apreciacion: 0, ejercicio: 0 };
                        }

                        if (tipoClave === "apreciacion") {
                            detallePendientesEstudiante[materiaClave].apreciacion += faltan;
                        } else if (tipoClave === "ejercicio") {
                            detallePendientesEstudiante[materiaClave].ejercicio += faltan;
                        }
                    }
                });
            }
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // =================================================
        // ORGANIZAR NOTAS POR CASILLA
        // Cada valor guarda la nota y si fue marcada como
        // falta intencional por el consejero (item.intencional).
        // =================================================

        const materiasMap = {};
        let maxApreciacion = 0;
        let maxEjercicio = 0;

        notas.forEach((item) => {
            const mat = item.materia || "Sin Materia";

            if (!materiasMap[mat]) {
                materiasMap[mat] = {
                    apreciacion: Array(10).fill(null),
                    ejercicio: Array(10).fill(null)
                };
            }

            const tipoNorm = (item.tipo || "").toLowerCase();
            const casilla = Number(item.numero);

            if (!casilla || casilla < 1 || casilla > 10) return;

            const valor = {
                nota: Number(item.nota),
                intencional: item.estado === "Intencional"
            };

            if (tipoNorm === "apreciacion") {
                materiasMap[mat].apreciacion[casilla - 1] = valor;
                if (casilla > maxApreciacion) maxApreciacion = casilla;
            } else if (tipoNorm === "ejercicio") {
                materiasMap[mat].ejercicio[casilla - 1] = valor;
                if (casilla > maxEjercicio) maxEjercicio = casilla;
            }
        });

        // =================================================
        // ENCABEZADO
        // =================================================

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
        doc.text(`Trimestre: ${trimestreTexto}`, 105, 36, { align: "center" });
        doc.text(`Fecha de emisión: ${fechaEmision}`, 150, 36);

        doc.setLineWidth(0.3);
        doc.line(20, 40, 190, 40);

        // =================================================
        // DATOS ESTUDIANTE
        // =================================================

        doc.setFont(undefined, "bold");
        doc.setFontSize(11);
        doc.text("Datos del estudiante", 20, 48);
        doc.setFont(undefined, "normal");
        doc.setFontSize(10);

        let yDatos = 55;

        doc.text(`Nombre: ${miEstudiante?.nombre || datosEstudiante?.nombre_apellido || "-"}`, 20, yDatos);
        yDatos += 6;

        if (miEstudiante?.codigo) {
            doc.text(`Código: ${miEstudiante.codigo}`, 20, yDatos);
            yDatos += 6;
        }

        if (datosEstudiante) {
            doc.text(`Cédula: ${datosEstudiante.cedula || "-"}`, 20, yDatos);

            const fechaNac = datosEstudiante.fecha_nacimiento
                ? new Date(datosEstudiante.fecha_nacimiento + "T00:00:00").toLocaleDateString("es-PA")
                : "-";

            doc.text(`Fecha de nacimiento: ${fechaNac}`, 120, yDatos);
            yDatos += 6;

            doc.setFont(undefined, "bold");
            doc.text("Datos del acudiente", 20, yDatos);
            doc.setFont(undefined, "normal");
            yDatos += 6;

            doc.text(`Nombre: ${datosEstudiante.nombre_padre_acudiente || "-"}`, 20, yDatos);
            yDatos += 6;

            doc.text(`Tel. 1: ${datosEstudiante.celular_acudiente1 || "-"}`, 20, yDatos);
            doc.text(`Tel. 2: ${datosEstudiante.telefono_acudiente2 || "-"}`, 100, yDatos);
            yDatos += 8;
        } else {
            doc.text("El estudiante aún no ha completado sus datos personales de contacto.", 20, yDatos);
            yDatos += 8;
        }

        const startYTabla = yDatos + 4;

        // =================================================
        // TABLA PDF
        // =================================================

        const head = [["Materia"]];

        for (let i = 1; i <= maxApreciacion; i++) head[0].push(`Apr. ${i}`);
        if (maxApreciacion > 0) head[0].push("Prom. Apr.");

        for (let i = 1; i <= maxEjercicio; i++) head[0].push(`Eje. ${i}`);
        if (maxEjercicio > 0) head[0].push("Prom. Eje.");

        head[0].push("Prom. Final");

        const body = [];
        let sumaPromedios = 0;
        let totalMaterias = 0;
        let huboIntencional = false;
        let huboCasillasSinRegistrar = false;

        // Texto de una celda: "-" si está vacía, "F*" si es falta
        // intencional (cuenta 0.0 en el promedio), o la nota normal.
        const celdaTexto = (v) => {
            if (v === null) {
                huboCasillasSinRegistrar = true;
                return "-";
            }
            if (v.intencional) {
                huboIntencional = true;
                return "F*";
            }
            return v.nota.toFixed(1);
        };

        Object.keys(materiasMap).forEach((materia) => {
            const apr = materiasMap[materia].apreciacion.slice(0, maxApreciacion);
            const eje = materiasMap[materia].ejercicio.slice(0, maxEjercicio);

            const aprValidos = apr.filter((v) => v !== null);
            const ejeValidos = eje.filter((v) => v !== null);

            const promApr = aprValidos.length > 0
                ? aprValidos.reduce((a, b) => a + b.nota, 0) / aprValidos.length
                : null;

            const promEje = ejeValidos.length > 0
                ? ejeValidos.reduce((a, b) => a + b.nota, 0) / ejeValidos.length
                : null;

            let promFinal = null;
            if (promApr !== null && promEje !== null) {
                promFinal = (promApr + promEje) / 2;
            } else if (promApr !== null) {
                promFinal = promApr;
            } else if (promEje !== null) {
                promFinal = promEje;
            }

            const row = [materia];

            apr.forEach((v) => row.push(celdaTexto(v)));
            if (maxApreciacion > 0) row.push(promApr !== null ? promApr.toFixed(1) : "-");

            eje.forEach((v) => row.push(celdaTexto(v)));
            if (maxEjercicio > 0) row.push(promEje !== null ? promEje.toFixed(1) : "-");

            row.push(promFinal !== null ? promFinal.toFixed(1) : "-");

            body.push(row);

            if (promFinal !== null) {
                sumaPromedios += promFinal;
                totalMaterias++;
            }
        });

        doc.autoTable({
            head,
            body,
            startY: startYTabla,
            styles: { fontSize: 8, halign: "center" },
            headStyles: { fillColor: [30, 41, 59], textColor: 255 },
            columnStyles: { 0: { halign: "left", fontStyle: "bold" } }
        });

        let y = doc.lastAutoTable.finalY + 6;

        // -------- Nota aclaratoria sobre las casillas vacías --------
        // El sistema funciona con AUTO-registro: eres tú quien busca la
        // nota con el docente y la escribe en la plataforma. Por eso, si
        // aparece "-" en una casilla NO significa que el docente no haya
        // calificado esa actividad, sino que todavía no la has buscado
        // para registrarla.
        if (huboCasillasSinRegistrar) {
            doc.setFont(undefined, "italic");
            doc.setFontSize(8);
            doc.setTextColor(100, 100, 100);
            doc.text(
                "Nota: el simbolo \"-\" indica que aun no has buscado ni registrado esa nota en el sistema " +
                "(no significa que el docente no la haya asignado o calificado).",
                20,
                y,
                { maxWidth: 170 }
            );
            doc.setTextColor(0, 0, 0);
            doc.setFont(undefined, "normal");
            doc.setFontSize(10);
            y += 9;
        } else {
            y += 4;
        }

        // =================================================
        // RESUMEN ACADÉMICO
        // =================================================

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

        // Leyenda de la marca F*, solo si se usó al menos una vez
        if (huboIntencional) {
            doc.setFontSize(8);
            doc.setFont(undefined, "italic");
            doc.text("F* = Falta marcada por el consejero (cuenta como 0.0 en el promedio).", 20, y);
            doc.setFont(undefined, "normal");
            doc.setFontSize(10);
            y += 10;
        }

        // =================================================
        // ALERTA PARA LOS PADRES
        // Igual que en el boletín generado por el consejero(a):
        // aparece si, comparado con el resto del salón, faltan
        // casillas por registrar en este trimestre.
        // =================================================

        if (pendientesVsGrupo > 0) {

            if (y > 250) {
                doc.addPage();
                y = 25;
            }

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

            // Calcula cuántas líneas ocupó el párrafo para colocar lo
            // siguiente justo debajo (en vez de un salto fijo).
            const lineasAlerta = doc.splitTextToSize(textoAlerta, 170);
            y += lineasAlerta.length * 5 + 4;

            // -------- Detalle por materia --------
            // Tabla chiquita mostrando, materia por materia, cuántas
            // casillas de Apreciación y de Ejercicio te faltan frente
            // al resto del grupo.
            if (Object.keys(detallePendientesEstudiante).length > 0) {

                const filasDetalle = Object.keys(detallePendientesEstudiante).sort().map((materia) => {
                    const d = detallePendientesEstudiante[materia];
                    const total = d.apreciacion + d.ejercicio;
                    return [
                        materia,
                        d.apreciacion > 0 ? String(d.apreciacion) : "-",
                        d.ejercicio > 0 ? String(d.ejercicio) : "-",
                        String(total)
                    ];
                });

                doc.autoTable({
                    head: [["Materia", "Apreciación pendiente", "Ejercicio pendiente", "Total"]],
                    body: filasDetalle,
                    startY: y,
                    styles: { fontSize: 8, halign: "center" },
                    headStyles: { fillColor: [180, 0, 0], textColor: 255 },
                    columnStyles: { 0: { halign: "left", fontStyle: "bold" } },
                    margin: { left: 20, right: 20 }
                });

                y = doc.lastAutoTable.finalY + 8;
            } else {
                y += 6;
            }
        }

        // =================================================
        // FIRMAS
        // (mismas etiquetas que usa el consejero(a) en su boletín)
        // =================================================

        y += 20;

        if (y > 265) {
            doc.addPage();
            y = 40;
        }

        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.3);

        doc.line(25, y, 90, y);
        doc.setFont(undefined, "normal");
        doc.setFontSize(9);
        doc.text("Firma del consejero(a)", 30, y + 5);

        doc.line(120, y, 185, y);
        doc.text("Firma del padre de familia / acudiente", 122, y + 5);

        const nombreArchivo = (miEstudiante?.nombre || datosEstudiante?.nombre_apellido || "Boletin")
            .replace(/[,\s]+/g, "_");

        doc.save(`Boletin_${nombreArchivo}.pdf`);
    });
}

// =====================================================
// INICIAR TODO
// =====================================================

inicializarPagina();