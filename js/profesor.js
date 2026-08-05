import { supabase } from "./supabase.js";

let todasLasNotas = [];

cargarNotas();

async function cargarNotas() {

    const contenedor = document.getElementById("listaEstudiantes");

    // Primero se obtienen los correos marcados como "de prueba"
    // (es_prueba = true), para poder excluir sus notas más abajo.
    // Esta tabla no guarda "materia/correo" por estudiante, así que
    // el filtro se hace del lado del cliente, sobre la lista de notas.
    const { data: estudiantesPrueba, error: errPrueba } = await supabase
        .from("estudiantes")
        .select("correo")
        .eq("es_prueba", true);

    if (errPrueba) {
        console.error("Error al obtener estudiantes de prueba:", errPrueba);
    }

    const correosDePrueba = new Set(
        (estudiantesPrueba || []).map((e) => (e.correo || "").toLowerCase()).filter(Boolean)
    );

    const { data, error } = await supabase
        .from("notas")
        .select("*")
        .order("created_at");

    if (error) {
        console.error(error);
        contenedor.innerHTML = `<p style="color:red;">Error al cargar las notas: ${error.message}</p>`;
        return;
    }

    // Se excluyen las notas de cualquier estudiante marcado como "de prueba".
    todasLasNotas = (data || []).filter(
        (n) => !correosDePrueba.has((n.correo || "").toLowerCase())
    );

    actualizarResumen(todasLasNotas);
    renderizarTabla(todasLasNotas);

    const inputBuscar = document.getElementById("buscarCorreo");
    inputBuscar.addEventListener("input", () => {
        const filtro = inputBuscar.value.trim().toLowerCase();
        const filtradas = todasLasNotas.filter((nota) =>
            nota.correo.toLowerCase().includes(filtro)
        );
        renderizarTabla(filtradas);
    });
}

function actualizarResumen(notas) {
    const totalNotas = notas.length;
    const totalEstudiantes = new Set(notas.map((n) => n.correo)).size;

    document.getElementById("totalNotas").textContent = totalNotas;
    document.getElementById("totalEstudiantes").textContent = totalEstudiantes;
}

function renderizarTabla(notas) {
    const contenedor = document.getElementById("listaEstudiantes");

    if (!notas || notas.length === 0) {
        contenedor.innerHTML = "<p>No hay notas para mostrar.</p>";
        return;
    }

    let html = `
        <table>
            <tr>
                <th>Correo</th>
                <th>Materia</th>
                <th>Tipo</th>
                <th>Nota</th>
            </tr>
    `;

    notas.forEach((nota) => {
        html += `
            <tr>
                <td>${nota.correo}</td>
                <td>${nota.materia}</td>
                <td>${nota.tipo}</td>
                <td>${nota.nota}</td>
            </tr>
        `;
    });

    html += "</table>";

    contenedor.innerHTML = html;
}

// --- Guardar trimestre activo ---
const selectTrimestre = document.getElementById("selectTrimestre");
const btnGuardarTrimestre = document.getElementById("btnGuardarTrimestre");
const estadoTrimestre = document.getElementById("estadoTrimestre");

async function cargarTrimestreActivo() {
    const { data, error } = await supabase
        .from("configuracion")
        .select("trimestre_activo")
        .eq("id", 1)
        .single();

    if (error) {
        console.error("Error al cargar trimestre activo:", error);
        return;
    }

    if (data) {
        selectTrimestre.value = data.trimestre_activo;
    }
}
cargarTrimestreActivo();

btnGuardarTrimestre.addEventListener("click", async () => {
    const trimestreSeleccionado = selectTrimestre.value;

    btnGuardarTrimestre.disabled = true;
    estadoTrimestre.style.color = "#198754";
    estadoTrimestre.textContent = "Guardando...";

    const { error } = await supabase
        .from("configuracion")
        .update({ trimestre_activo: trimestreSeleccionado })
        .eq("id", 1);

    btnGuardarTrimestre.disabled = false;

    if (error) {
        console.error(error);
        estadoTrimestre.style.color = "#dc3545";
        estadoTrimestre.textContent = "❌ Error al guardar";
    } else {
        estadoTrimestre.style.color = "#198754";
        estadoTrimestre.textContent = "✅ Guardado";
    }

    setTimeout(() => {
        estadoTrimestre.textContent = "";
    }, 2000);
});