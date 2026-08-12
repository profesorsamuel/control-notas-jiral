import { supabase } from "./supabase.js";

// =====================================================
// respaldos.js
// Muestra, para cada tabla del sistema, su copia de
// respaldo generada por los triggers de Postgres
// (tabla_backup), con columnas de auditoría:
//   backup_operacion  -> INSERT | UPDATE | DELETE
//   backup_fecha      -> cuándo ocurrió el cambio
// =====================================================

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// Nombre de cada tabla original -> etiqueta bonita para el menú.
// Si en el futuro agregas más tablas de respaldo, solo añádelas aquí.
const TABLAS_RESPALDO = [
    ["estudiantes", "Estudiantes"],
    ["datos_estudiante", "Datos del estudiante"],
    ["usuarios", "Usuarios"],
    ["profesores", "Profesores"],
    ["consejeros", "Consejeros"],
    ["salones", "Salones"],
    ["materias", "Materias"],
    ["notas", "Notas"],
    ["columnas_materia", "Columnas de materia"],
    ["actividades_calificaciones", "Actividades / calificaciones"],
    ["asistencias", "Asistencias"],
    ["asistencia_columnas", "Columnas de asistencia"],
    ["asistencia_detalle", "Detalle de asistencia"],
    ["comportamiento_detalle", "Detalle de comportamiento"],
    ["apreciaciones_estado", "Apreciaciones"],
    ["actividades_apreciacion", "Actividades de apreciación"],
    ["config_pesos_apreciacion", "Pesos de apreciación"],
    ["temas_casillas", "Temas / casillas"],
    ["tasks", "Tareas"],
    ["task_assignments", "Asignación de tareas"],
    ["profesor_materias", "Profesor - materias"],
    ["profesor_salones", "Profesor - salones"],
    ["horario_profesor", "Horario de profesor"],
    ["horario_salon", "Horario de salón"],
    ["franjas_horario", "Franjas de horario"],
    ["excepciones_horario", "Excepciones de horario"],
    ["configuracion", "Configuración"],
    ["accesos", "Accesos"],
    ["visitas", "Visitas"],
];

const OPERACION_BADGE = {
    INSERT: "badge badge-insert",
    UPDATE: "badge badge-update",
    DELETE: "badge badge-delete",
};

const OPERACION_TEXTO = {
    INSERT: "Agregado",
    UPDATE: "Editado",
    DELETE: "Eliminado",
};

document.addEventListener("DOMContentLoaded", async () => {

    const selectTabla = document.getElementById("selectTabla");
    const selectOperacion = document.getElementById("selectOperacion");
    const inputBuscar = document.getElementById("inputBuscar");
    const btnActualizar = document.getElementById("btnActualizar");
    const estadoRespaldo = document.getElementById("estadoRespaldo");
    const tablaWrap = document.getElementById("tablaRespaldoWrap");
    const filaEncabezados = document.getElementById("filaEncabezados");
    const cuerpoRespaldo = document.getElementById("cuerpoRespaldo");
    const contadorFilas = document.getElementById("contadorFilas");

    // =================================================
    // 1) VERIFICAR SESIÓN Y ROL DE ADMIN
    // =================================================
    const { data: { user }, error: errUser } = await supabase.auth.getUser();
    if (errUser || !user) { window.location.href = "login.html"; return; }

    const { data: perfil, error: errPerfil } = await supabase
        .from("usuarios")
        .select("rol")
        .eq("auth_user_id", user.id)
        .single();

    if (errPerfil || !perfil || perfil.rol !== "admin") {
        alert("⛔ No tienes permisos de administrador.");
        window.location.href = "login.html";
        return;
    }

    // =================================================
    // 2) LLENAR EL MENÚ DE TABLAS
    // =================================================
    for (const [tabla, etiqueta] of TABLAS_RESPALDO) {
        const opt = document.createElement("option");
        opt.value = tabla;
        opt.textContent = etiqueta;
        selectTabla.appendChild(opt);
    }

    let filasActuales = []; // datos crudos de la última consulta

    function formatearFecha(valor) {
        if (!valor) return "";
        const fecha = new Date(valor);
        if (isNaN(fecha.getTime())) return String(valor);
        return fecha.toLocaleString("es-PA", {
            day: "2-digit", month: "2-digit", year: "numeric",
            hour: "2-digit", minute: "2-digit",
        });
    }

    function pintarTabla(filas) {
        if (!filas.length) {
            tablaWrap.classList.add("d-none");
            estadoRespaldo.classList.remove("d-none");
            estadoRespaldo.textContent = "No hay resultados para mostrar.";
            contadorFilas.textContent = "";
            return;
        }

        // Columnas: backup_operacion y backup_fecha primero, luego el resto
        // (sin mostrar backup_id, que es solo un id interno).
        const columnasBase = ["backup_operacion", "backup_fecha"];
        const otrasColumnas = Object.keys(filas[0]).filter(
            (c) => !columnasBase.includes(c) && c !== "backup_id"
        );
        const columnas = [...columnasBase, ...otrasColumnas];

        filaEncabezados.innerHTML = columnas.map((c) => {
            const etiqueta = c === "backup_operacion" ? "Cambio"
                : c === "backup_fecha" ? "Fecha"
                : c;
            return `<th>${escapeHtml(etiqueta)}</th>`;
        }).join("");

        cuerpoRespaldo.innerHTML = filas.map((fila) => {
            const celdas = columnas.map((c) => {
                if (c === "backup_operacion") {
                    const op = fila[c];
                    const clase = OPERACION_BADGE[op] || "badge bg-secondary";
                    const texto = OPERACION_TEXTO[op] || op || "";
                    return `<td><span class="${clase}">${escapeHtml(texto)}</span></td>`;
                }
                if (c === "backup_fecha") {
                    return `<td>${escapeHtml(formatearFecha(fila[c]))}</td>`;
                }
                const valor = fila[c];
                const texto = valor === null || valor === undefined ? ""
                    : typeof valor === "object" ? JSON.stringify(valor)
                    : String(valor);
                return `<td title="${escapeHtml(texto)}">${escapeHtml(texto)}</td>`;
            }).join("");
            return `<tr>${celdas}</tr>`;
        }).join("");

        estadoRespaldo.classList.add("d-none");
        tablaWrap.classList.remove("d-none");
        contadorFilas.textContent = `${filas.length} fila(s)`;
    }

    function aplicarFiltros() {
        const texto = inputBuscar.value.trim().toLowerCase();
        const operacion = selectOperacion.value;

        let filas = filasActuales;
        if (operacion) {
            filas = filas.filter((f) => f.backup_operacion === operacion);
        }
        if (texto) {
            filas = filas.filter((f) =>
                Object.values(f).some((v) => String(v ?? "").toLowerCase().includes(texto))
            );
        }
        pintarTabla(filas);
    }

    async function cargarTabla() {
        const tabla = selectTabla.value;
        if (!tabla) {
            filasActuales = [];
            tablaWrap.classList.add("d-none");
            estadoRespaldo.classList.remove("d-none");
            estadoRespaldo.textContent = "Elige una tabla arriba para ver su historial.";
            contadorFilas.textContent = "";
            return;
        }

        estadoRespaldo.classList.remove("d-none");
        tablaWrap.classList.add("d-none");
        estadoRespaldo.innerHTML = `<i class="fa-solid fa-spinner fa-spin me-1"></i>Cargando...`;

        const { data, error } = await supabase
            .from(`${tabla}_backup`)
            .select("*")
            .order("backup_fecha", { ascending: false })
            .limit(300);

        if (error) {
            estadoRespaldo.textContent = `⚠️ No se pudo cargar el respaldo de "${tabla}". ${error.message || ""}`;
            filasActuales = [];
            return;
        }

        filasActuales = data || [];
        aplicarFiltros();
    }

    selectTabla.addEventListener("change", cargarTabla);
    btnActualizar.addEventListener("click", cargarTabla);
    inputBuscar.addEventListener("input", aplicarFiltros);
    selectOperacion.addEventListener("change", aplicarFiltros);
});
