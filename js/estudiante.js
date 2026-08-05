import { supabase } from "./supabase.js";

const form = document.getElementById("formNota");
const listaNotas = document.getElementById("listaNotas");

// Guarda el id de la nota que se está editando (null = modo "nueva nota")
let notaEditando = null;

// Verificar que los elementos existan
if (!form) {
    console.error("❌ No se encontró el formulario con id='formNota'");
}

if (!listaNotas) {
    console.error("❌ No se encontró el elemento con id='listaNotas'");
}

// Mostrar el correo del usuario logueado
mostrarUsuario();

async function mostrarUsuario() {

    const {
        data: { user }
    } = await supabase.auth.getUser();

    if (user) {
        document.getElementById("usuario").textContent =
            `Bienvenido: ${user.email}`;
    }
}

// Cargar las notas al iniciar
if (listaNotas) {
    cargarNotas();
}

// Evento para guardar o actualizar una nota
if (form) {
    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const {
            data: { user },
            error: userError
        } = await supabase.auth.getUser();

        if (userError || !user) {
            alert("Tu sesión expiró. Por favor, inicia sesión de nuevo.");
            return;
        }

        const materia = document.getElementById("materia").value.trim();
        const actividad = document.getElementById("actividad").value.trim();
        const tipo = document.getElementById("tipo").value;
        const fecha = document.getElementById("fecha").value;
        const nota = parseFloat(document.getElementById("nota").value);
        const observacion = document
            .getElementById("observacion")
            .value
            .trim();

        // Validar campos
        if (
            !materia ||
            !actividad ||
            !tipo ||
            !fecha ||
            Number.isNaN(nota)
        ) {
            alert("Por favor, complete todos los campos obligatorios.");
            return;
        }

        // Validar rango de nota
        if (nota < 1 || nota > 5) {
            alert("La nota debe estar entre 1.0 y 5.0.");
            return;
        }

        if (notaEditando) {
            // Modo edición: actualizar la nota existente
            console.log("Actualizando ID:", notaEditando);

            const { data, error } = await supabase
                .from("notas")
                .update({
                    materia,
                    actividad,
                    tipo,
                    fecha,
                    nota,
                    observacion
                })
                .eq("id", notaEditando)
                .select();

            console.log("Resultado update:", data);

            if (error) {
                console.error("❌ Error al actualizar:", error);
                alert("Error al actualizar la nota: " + error.message);
                return;
            }

            alert("✅ Nota actualizada correctamente.");
            notaEditando = null;
            restaurarBotonGuardar();
        } else {
            // Modo creación: guardar nota nueva
            const { error } = await supabase
                .from("notas")
                .insert([
                    {
                        correo: user.email,
                        materia: materia,
                        actividad: actividad,
                        tipo: tipo,
                        fecha: fecha,
                        nota: nota,
                        observacion: observacion,
                        estado: "Activa"
                    }
                ]);

            if (error) {
                console.error("❌ Error al guardar:", error);
                alert("Error al guardar la nota: " + error.message);
                return;
            }

            alert("✅ Nota guardada correctamente.");
        }

        form.reset();

        await cargarNotas();
    });
}

// Cambia el texto del botón de "Actualizar" a "Guardar" de nuevo
function restaurarBotonGuardar() {
    const btnGuardar = form?.querySelector("button[type='submit']");
    if (btnGuardar) {
        btnGuardar.textContent = "Guardar";
    }
}

// Carga los datos de una nota en el formulario para editarla
window.editarNota = async function (id) {

    console.log("ID recibido para editar:", id);

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

    document.getElementById("materia").value = data.materia ?? "";
    document.getElementById("actividad").value = data.actividad ?? "";
    document.getElementById("tipo").value = data.tipo ?? "";
    document.getElementById("fecha").value = data.fecha ?? "";
    document.getElementById("nota").value = data.nota ?? "";
    document.getElementById("observacion").value = data.observacion ?? "";

    notaEditando = id;

    const btnGuardar = form?.querySelector("button[type='submit']");
    if (btnGuardar) {
        btnGuardar.textContent = "Actualizar";
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
};

// Elimina una nota tras confirmar con el usuario
window.eliminarNota = async function (id) {

    const confirmar = confirm("¿Seguro que deseas eliminar esta nota?");
    if (!confirmar) return;

    const { error } = await supabase
        .from("notas")
        .delete()
        .eq("id", id);

    if (error) {
        console.error("❌ Error al eliminar:", error);
        alert("Error al eliminar la nota: " + error.message);
        return;
    }

    alert("✅ Nota eliminada correctamente.");
    await cargarNotas();
};

// Función para cargar las notas del estudiante
async function cargarNotas() {
    const {
        data: { user },
        error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
        listaNotas.innerHTML =
            '<p style="color:red;">Debes iniciar sesión para ver tus notas.</p>';
        return;
    }

    // Consultar notas del usuario
    const { data, error } = await supabase
        .from("notas")
        .select("*")
        .eq("correo", user.email)
        .order("created_at", { ascending: true });

    if (error) {
        console.error("❌ Error al cargar las notas:", error);

        listaNotas.innerHTML =
            '<p style="color:red;">No se pudieron cargar las notas.</p>';

        return;
    }

    // Si no existen notas
    if (!data || data.length === 0) {
        listaNotas.innerHTML =
            "<p>No hay notas registradas.</p>";

        return;
    }

    // Organizar las materias
    const materiasMap = {};

    let maxApreciacion = 0;
    let maxEjercicio = 0;

    data.forEach((item) => {
        const mat = item.materia || "Sin Materia";

        if (!materiasMap[mat]) {
            materiasMap[mat] = {
                apreciacion: [],
                ejercicio: []
            };
        }

        const tipoNorm = (item.tipo || "").toLowerCase();

        if (
            tipoNorm.includes("apreciacion") ||
            tipoNorm.includes("apreciación")
        ) {
            materiasMap[mat].apreciacion.push(item);
        } else {
            materiasMap[mat].ejercicio.push(item);
        }
    });

    // Obtener cantidad máxima de actividades
    Object.values(materiasMap).forEach((materia) => {
        maxApreciacion = Math.max(
            maxApreciacion,
            materia.apreciacion.length
        );

        maxEjercicio = Math.max(
            maxEjercicio,
            materia.ejercicio.length
        );
    });

    // Función para proteger el HTML
    const escapeHtml = (str) => {
        return String(str ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    };

    // Genera el contenido de una celda de nota individual con botones de acción
    const celdaNota = (item) => {
        if (!item) {
            return `<td></td>`;
        }

        return `
            <td>
                ${escapeHtml(item.nota ?? "")}
                <div style="margin-top:4px;">
                    <button
                        type="button"
                        title="Editar"
                        onclick="editarNota('${item.id}')"
                        style="border:none;background:none;cursor:pointer;font-size:14px;"
                    >✏️</button>
                    <button
                        type="button"
                        title="Eliminar"
                        onclick="eliminarNota('${item.id}')"
                        style="border:none;background:none;cursor:pointer;font-size:14px;"
                    >🗑️</button>
                </div>
            </td>
        `;
    };

    // Crear tabla
    let htmlTabla = `
        <div style="
            overflow-x:auto;
            background:white;
            padding:15px;
            border-radius:10px;
        ">
            <table
                border="1"
                style="
                    width:100%;
                    border-collapse:collapse;
                    text-align:center;
                "
            >
                <thead>
                    <tr style="
                        background:#1e293b;
                        color:white;
                    ">
                        <th rowspan="2">Materia</th>
    `;

    // Encabezado de apreciación
    if (maxApreciacion > 0) {
        htmlTabla += `
            <th colspan="${maxApreciacion + 1}">
                Notas de Apreciación
            </th>
        `;
    }

    // Encabezado de ejercicio
    if (maxEjercicio > 0) {
        htmlTabla += `
            <th colspan="${maxEjercicio + 1}">
                Notas de Ejercicio
            </th>
        `;
    }

    htmlTabla += `
            <th rowspan="2">
                Promedio Final
            </th>
        </tr>

        <tr>
    `;

    // Número de actividades de apreciación
    for (let i = 1; i <= maxApreciacion; i++) {
        htmlTabla += `<th>${i}</th>`;
    }

    if (maxApreciacion > 0) {
        htmlTabla += `<th>Prom. Apr.</th>`;
    }

    // Número de actividades de ejercicio
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

    // Crear una fila por materia
    Object.keys(materiasMap).forEach((materia) => {
        const apreciaciones = materiasMap[materia].apreciacion;
        const ejercicios = materiasMap[materia].ejercicio;

        // Promedio de apreciación
        const promApr =
            apreciaciones.length > 0
                ? apreciaciones.reduce(
                      (total, item) => total + Number(item.nota),
                      0
                  ) / apreciaciones.length
                : null;

        // Promedio de ejercicios
        const promEje =
            ejercicios.length > 0
                ? ejercicios.reduce(
                      (total, item) => total + Number(item.nota),
                      0
                  ) / ejercicios.length
                : null;

        // Promedio final
        let promFinal = "-";

        if (promApr !== null && promEje !== null) {
            promFinal = ((promApr + promEje) / 2).toFixed(1);
        } else if (promApr !== null) {
            promFinal = promApr.toFixed(1);
        } else if (promEje !== null) {
            promFinal = promEje.toFixed(1);
        }

        // Materia
        htmlTabla += `
            <tr>
                <td>
                    <strong>
                        ${escapeHtml(materia)}
                    </strong>
                </td>
        `;

        // Notas de apreciación (con botones editar/eliminar)
        for (let i = 0; i < maxApreciacion; i++) {
            htmlTabla += celdaNota(apreciaciones[i]);
        }

        // Promedio apreciación
        if (maxApreciacion > 0) {
            htmlTabla += `
                <td>
                    <strong>
                        ${promApr !== null
                            ? promApr.toFixed(1)
                            : "-"}
                    </strong>
                </td>
            `;
        }

        // Notas de ejercicio (con botones editar/eliminar)
        for (let i = 0; i < maxEjercicio; i++) {
            htmlTabla += celdaNota(ejercicios[i]);
        }

        // Promedio ejercicio
        if (maxEjercicio > 0) {
            htmlTabla += `
                <td>
                    <strong>
                        ${promEje !== null
                            ? promEje.toFixed(1)
                            : "-"}
                    </strong>
                </td>
            `;
        }

        // Promedio final
        htmlTabla += `
                <td>
                    <strong>
                        ${promFinal}
                    </strong>
                </td>
            </tr>
        `;
    });

    // Cerrar tabla
    htmlTabla += `
        </tbody>
        </table>
        </div>
    `;

    // Mostrar tabla
    listaNotas.innerHTML = htmlTabla;
}

// Botones de sesión y PDF
const btnSalir = document.getElementById("btnSalir");
const btnPdf = document.getElementById("btnPdf");

// Botón cerrar sesión
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

        const {
            data: { user }
        } = await supabase.auth.getUser();

        if (!user) {
            alert("Debes iniciar sesión.");
            return;
        }

        const { data: notas, error } = await supabase
            .from("notas")
            .select("*")
            .eq("correo", user.email)
            .order("materia");

        if (error) {
            alert("Error al obtener las notas.");
            return;
        }

        if (!notas || notas.length === 0) {
            alert("No hay notas registradas para generar el boletín.");
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // ===================================================
        // Organizar las notas por materia
        // ===================================================
        const materiasMap = {};
        let maxApreciacion = 0;
        let maxEjercicio = 0;

        notas.forEach((item) => {
            const mat = item.materia || "Sin Materia";

            if (!materiasMap[mat]) {
                materiasMap[mat] = { apreciacion: [], ejercicio: [] };
            }

            const tipoNorm = (item.tipo || "").toLowerCase();

            if (
                tipoNorm.includes("apreciacion") ||
                tipoNorm.includes("apreciación")
            ) {
                materiasMap[mat].apreciacion.push(Number(item.nota));
            } else {
                materiasMap[mat].ejercicio.push(Number(item.nota));
            }
        });

        Object.values(materiasMap).forEach((m) => {
            maxApreciacion = Math.max(maxApreciacion, m.apreciacion.length);
            maxEjercicio = Math.max(maxEjercicio, m.ejercicio.length);
        });

        // ===================================================
        // Encabezado del boletín
        // ===================================================
        const fechaEmision = new Date().toLocaleDateString("es-PA");
        const anioEscolar = new Date().getFullYear();

        doc.setFont(undefined, "bold");
        doc.setFontSize(14);
        doc.text(
            "CENTRO EDUCATIVO BASICO GENERAL EL JIRAL",
            105,
            18,
            { align: "center" }
        );

        doc.setFontSize(12);
        doc.text("RESUMEN DE CALIFICACIONES", 105, 26, { align: "center" });

        doc.setFont(undefined, "normal");
        doc.setFontSize(10);
        doc.text(`Año escolar: ${anioEscolar}`, 20, 36);
        doc.text(`Fecha de emisión: ${fechaEmision}`, 150, 36);

        doc.setLineWidth(0.3);
        doc.line(20, 40, 190, 40);

        // ===================================================
        // Datos del estudiante
        // (por ahora solo el correo; nombre/grado/sección se
        // pueden agregar cuando existan esos campos en la BD)
        // ===================================================
        doc.setFont(undefined, "bold");
        doc.setFontSize(11);
        doc.text("Datos del estudiante", 20, 48);

        doc.setFont(undefined, "normal");
        doc.setFontSize(10);
        doc.text(`Correo: ${user.email}`, 20, 55);

        // ===================================================
        // Tabla de calificaciones
        // ===================================================
        const head = [["Materia"]];

        for (let i = 1; i <= maxApreciacion; i++) {
            head[0].push(`Apr. ${i}`);
        }
        if (maxApreciacion > 0) head[0].push("Prom. Apr.");

        for (let i = 1; i <= maxEjercicio; i++) {
            head[0].push(`Eje. ${i}`);
        }
        if (maxEjercicio > 0) head[0].push("Prom. Eje.");

        head[0].push("Prom. Final");

        const body = [];
        let sumaPromedios = 0;
        let totalMaterias = 0;
        let totalActividades = 0;

        Object.keys(materiasMap).forEach((materia) => {
            const apr = materiasMap[materia].apreciacion;
            const eje = materiasMap[materia].ejercicio;

            const promApr =
                apr.length > 0
                    ? apr.reduce((a, b) => a + b, 0) / apr.length
                    : null;

            const promEje =
                eje.length > 0
                    ? eje.reduce((a, b) => a + b, 0) / eje.length
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

            for (let i = 0; i < maxApreciacion; i++) {
                row.push(apr[i] !== undefined ? apr[i].toFixed(1) : "-");
            }
            if (maxApreciacion > 0) {
                row.push(promApr !== null ? promApr.toFixed(1) : "-");
            }

            for (let i = 0; i < maxEjercicio; i++) {
                row.push(eje[i] !== undefined ? eje[i].toFixed(1) : "-");
            }
            if (maxEjercicio > 0) {
                row.push(promEje !== null ? promEje.toFixed(1) : "-");
            }

            row.push(promFinal !== null ? promFinal.toFixed(1) : "-");

            body.push(row);

            if (promFinal !== null) {
                sumaPromedios += promFinal;
                totalMaterias++;
            }

            totalActividades += apr.length + eje.length;
        });

        doc.autoTable({
            head,
            body,
            startY: 62,
            styles: { fontSize: 8, halign: "center" },
            headStyles: { fillColor: [30, 41, 59], textColor: 255 },
            columnStyles: { 0: { halign: "left", fontStyle: "bold" } }
        });

        // ===================================================
        // Resumen académico
        // ===================================================
        let y = doc.lastAutoTable.finalY + 12;
        const promedioGeneral =
            totalMaterias > 0 ? sumaPromedios / totalMaterias : 0;

        doc.setFont(undefined, "bold");
        doc.setFontSize(11);
        doc.text("Resumen académico", 20, y);

        doc.setFont(undefined, "normal");
        doc.setFontSize(10);
        y += 7;
        doc.text(`Promedio General: ${promedioGeneral.toFixed(1)}`, 20, y);
        y += 6;
        doc.text(`Total de materias: ${totalMaterias}`, 20, y);
        y += 6;
        doc.text(`Total de actividades: ${totalActividades}`, 20, y);

        // ===================================================
        // Observaciones
        // ===================================================
        y += 12;
        doc.setFont(undefined, "bold");
        doc.text("Observaciones", 20, y);

        doc.setFont(undefined, "normal");
        y += 7;

        const observacionGeneral =
            promedioGeneral >= 3.5
                ? "El estudiante mantiene un rendimiento satisfactorio."
                : "El estudiante debe reforzar los contenidos de las materias con promedio bajo.";

        doc.text(observacionGeneral, 20, y, { maxWidth: 170 });

        // ===================================================
        // Firmas
        // ===================================================
        if (y > 240) {
            doc.addPage();
            y = 30;
        } else {
            y += 40;
        }

        doc.line(30, y, 90, y);
        doc.text("Docente", 48, y + 6);

        doc.line(120, y, 180, y);
        doc.text("Director", 140, y + 6);

        doc.save("Boletin.pdf");

    });

}
