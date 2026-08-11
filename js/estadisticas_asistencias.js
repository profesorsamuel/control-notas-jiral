import { supabase } from "./supabase.js";
import { registrarSalida } from "./accesos.js";

document.addEventListener("DOMContentLoaded", async () => {

    const mensajeEstadisticas = document.getElementById("mensajeEstadisticas");
    const nombreAdmin = document.getElementById("nombreAdmin");
    const btnCerrarSesion = document.getElementById("btnCerrarSesion");

    function mostrarMensaje(texto, tipo = "danger") {
        mensajeEstadisticas.textContent = texto;
        mensajeEstadisticas.className = `alert alert-${tipo}`;
    }

    function escapeHtml(str) {
        return String(str ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    // ⚠️ Definición de "% de asistencia": aquí solo cuenta "presente". Si
    // quieres que tardanza/permiso también sumen, agrega sus claves aquí
    // (ej. ["presente", "tardanza"]).
    const ESTADOS_QUE_CUENTAN_COMO_ASISTENCIA = ["presente"];
    const TOP_N_RANKING = 10;

    // "Fuga" cuenta igual que "Ausente" en todos los resúmenes,
    // rankings y gráficas de esta pantalla (se guarda como estado
    // propio solo para dejar constancia de que el estudiante se fugó,
    // no que simplemente faltó).
    function estadoParaConteo(estado) {
        return estado === "fuga" ? "ausente" : estado;
    }

    // =================================================
    // 1) VERIFICAR SESIÓN Y ROL DE ADMIN
    // =================================================
    // Mismo patrón exacto que usa estadisticas.js (accesos): se valida
    // contra "usuarios" por auth_user_id, no por correo.

    const { data: { user }, error: errUser } = await supabase.auth.getUser();

    if (errUser || !user) {
        window.location.href = "login.html";
        return;
    }

    const { data: perfil, error: errPerfil } = await supabase
        .from("usuarios")
        .select("correo, rol")
        .eq("auth_user_id", user.id)
        .single();

    if (errPerfil || !perfil || perfil.rol !== "admin") {
        alert("⛔ No tienes permisos de administrador.");
        window.location.href = "login.html";
        return;
    }

    nombreAdmin.textContent = perfil.correo;

    btnCerrarSesion.addEventListener("click", async () => {
        await registrarSalida();
        await supabase.auth.signOut();
        window.location.href = "login.html";
    });

    // =================================================
    // 2) ELEMENTOS DE FILTROS Y RESUMEN
    // =================================================

    const filtroFechaDesde = document.getElementById("filtroFechaDesde");
    const filtroFechaHasta = document.getElementById("filtroFechaHasta");
    const filtroSalon = document.getElementById("filtroSalon");
    const filtroMateria = document.getElementById("filtroMateria");
    const filtroProfesor = document.getElementById("filtroProfesor");
    const btnAplicarFiltros = document.getElementById("btnAplicarFiltros");
    const btnLimpiarFiltros = document.getElementById("btnLimpiarFiltros");

    const cuerpoRankingAsistencia = document.getElementById("cuerpoRankingAsistencia");
    const cuerpoRankingAusencias = document.getElementById("cuerpoRankingAusencias");

    const canvasDistribucion = document.getElementById("graficaDistribucion");
    const canvasTopAsistencia = document.getElementById("graficaTopAsistencia");
    const canvasTopAusencias = document.getElementById("graficaTopAusencias");

    // =================================================
    // 3) DATOS EN MEMORIA
    // =================================================

    let registros = [];              // [{ estudianteId, nombreEstudiante, estado, fecha, salon, materia, correoProfesor }]
    let mapaNombresProfesor = {};    // correo_profesor -> nombre_profesor

    let graficaDistribucion = null;  // instancias de Chart.js, se destruyen antes de redibujar
    let graficaTopAsistencia = null;
    let graficaTopAusencias = null;

    function nombreProfesorDe(correo) {
        return mapaNombresProfesor[correo] || correo;
    }

    // =================================================
    // 4) CARGAR DATOS DESDE SUPABASE (una sola vez)
    // =================================================

    async function cargarDatos() {
        const [{ data: detalle, error: errDetalle }, { data: profesores, error: errProfesores }] =
            await Promise.all([
                supabase
                    .from("asistencia_detalle")
                    .select(`
                        id,
                        estado,
                        estudiante_id,
                        estudiantes ( nombre ),
                        asistencias ( fecha, salon, materia, correo_profesor )
                    `),
                supabase
                    .from("profesores")
                    .select("correo_profesor, nombre_profesor"),
            ]);

        if (errDetalle) throw errDetalle;

        if (!errProfesores && profesores) {
            mapaNombresProfesor = Object.fromEntries(
                profesores.map((p) => [p.correo_profesor, p.nombre_profesor])
            );
        }

        registros = (detalle || [])
            .filter((d) => d.asistencias) // por si alguna cabecera fue borrada
            .map((d) => ({
                estudianteId: d.estudiante_id,
                nombreEstudiante: d.estudiantes?.nombre || "—",
                estado: d.estado,
                fecha: d.asistencias.fecha,
                salon: d.asistencias.salon,
                materia: d.asistencias.materia,
                correoProfesor: d.asistencias.correo_profesor,
            }));

        construirOpcionesFiltros();
    }

    // =================================================
    // 5) FILTROS
    // =================================================

    function valoresUnicos(lista, campo) {
        return [...new Set(lista.map((r) => r[campo]).filter(Boolean))].sort((a, b) =>
            a.localeCompare(b, "es")
        );
    }

    function construirOpcionesFiltros() {
        const salones = valoresUnicos(registros, "salon");
        const materias = valoresUnicos(registros, "materia");
        const correosProfesor = valoresUnicos(registros, "correoProfesor");

        filtroSalon.innerHTML =
            `<option value="">Todos</option>` +
            salones.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");

        filtroMateria.innerHTML =
            `<option value="">Todas</option>` +
            materias.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");

        filtroProfesor.innerHTML =
            `<option value="">Todos</option>` +
            correosProfesor
                .map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(nombreProfesorDe(c))}</option>`)
                .join("");
    }

    function registrosFiltrados() {
        const desde = filtroFechaDesde.value; // "" o "2026-01-01"
        const hasta = filtroFechaHasta.value;
        const salon = filtroSalon.value;
        const materia = filtroMateria.value;
        const correoProfesor = filtroProfesor.value;

        return registros.filter((r) => {
            if (desde && r.fecha < desde) return false;
            if (hasta && r.fecha > hasta) return false;
            if (salon && r.salon !== salon) return false;
            if (materia && r.materia !== materia) return false;
            if (correoProfesor && r.correoProfesor !== correoProfesor) return false;
            return true;
        });
    }

    btnLimpiarFiltros.addEventListener("click", () => {
        filtroFechaDesde.value = "";
        filtroFechaHasta.value = "";
        filtroSalon.value = "";
        filtroMateria.value = "";
        filtroProfesor.value = "";
        pintarTodo();
    });

    // =================================================
    // 6) CÁLCULOS
    // =================================================

    function calcularResumenGeneral(lista) {
        const resumen = { presente: 0, ausente: 0, tardanza: 0, permiso: 0, total: lista.length };
        lista.forEach((r) => {
            const estado = estadoParaConteo(r.estado);
            if (resumen[estado] !== undefined) resumen[estado]++;
        });

        const asistieron = ESTADOS_QUE_CUENTAN_COMO_ASISTENCIA.reduce(
            (suma, estado) => suma + resumen[estado], 0
        );
        resumen.porcentajeAsistencia = resumen.total > 0 ? (asistieron / resumen.total) * 100 : 0;

        return resumen;
    }

    function calcularPorEstudiante(lista) {
        const mapa = new Map();

        lista.forEach((r) => {
            if (!mapa.has(r.estudianteId)) {
                mapa.set(r.estudianteId, {
                    estudianteId: r.estudianteId,
                    nombre: r.nombreEstudiante,
                    presente: 0, ausente: 0, tardanza: 0, permiso: 0, total: 0,
                });
            }
            const fila = mapa.get(r.estudianteId);
            const estado = estadoParaConteo(r.estado);
            if (fila[estado] !== undefined) fila[estado]++;
            fila.total++;
        });

        return [...mapa.values()].map((f) => ({
            ...f,
            porcentajeAsistencia:
                f.total > 0
                    ? (ESTADOS_QUE_CUENTAN_COMO_ASISTENCIA.reduce((s, e) => s + f[e], 0) / f.total) * 100
                    : 0,
        }));
    }

    // =================================================
    // 7) PINTAR TARJETAS + RANKINGS
    // =================================================

    function pintarTarjetas(resumen) {
        document.getElementById("resPorcentajeAsistencia").textContent = `${resumen.porcentajeAsistencia.toFixed(1)}%`;
        document.getElementById("resAusencias").textContent = resumen.ausente;
        document.getElementById("resTardanzas").textContent = resumen.tardanza;
        document.getElementById("resTotalRegistros").textContent = resumen.total;
    }

    function pintarRankingAsistencia(lista) {
        if (lista.length === 0) {
            cuerpoRankingAsistencia.innerHTML = `<tr><td colspan="3" class="text-center text-muted py-4">Sin datos.</td></tr>`;
            return;
        }
        cuerpoRankingAsistencia.innerHTML = lista.map((f, i) => `
            <tr>
                <td class="text-center">${i + 1}</td>
                <td>${escapeHtml(f.nombre)}</td>
                <td class="text-center"><span class="badge bg-success">${f.porcentajeAsistencia.toFixed(1)}% (${f.presente}/${f.total})</span></td>
            </tr>
        `).join("");
    }

    function pintarRankingAusencias(lista) {
        if (lista.length === 0) {
            cuerpoRankingAusencias.innerHTML = `<tr><td colspan="3" class="text-center text-muted py-4">Sin datos.</td></tr>`;
            return;
        }
        cuerpoRankingAusencias.innerHTML = lista.map((f, i) => `
            <tr>
                <td class="text-center">${i + 1}</td>
                <td>${escapeHtml(f.nombre)}</td>
                <td class="text-center"><span class="badge bg-danger">${f.ausente} ausencia(s)</span></td>
            </tr>
        `).join("");
    }

    // =================================================
    // 8) GRÁFICAS (Chart.js por CDN, cargado una sola vez)
    // =================================================

    let ChartJS = null;

    async function obtenerChartJS() {
        if (!ChartJS) {
            const modulo = await import("https://cdn.jsdelivr.net/npm/chart.js@4.4.4/+esm");
            ChartJS = modulo.Chart;
            ChartJS.register(...modulo.registerables);
        }
        return ChartJS;
    }

    async function pintarGraficaDistribucion(resumen) {
        const Chart = await obtenerChartJS();
        if (graficaDistribucion) graficaDistribucion.destroy();

        graficaDistribucion = new Chart(canvasDistribucion, {
            type: "doughnut",
            data: {
                labels: ["Presente", "Ausente", "Tardanza", "Permiso"],
                datasets: [{
                    data: [resumen.presente, resumen.ausente, resumen.tardanza, resumen.permiso],
                    backgroundColor: ["#198754", "#dc3545", "#ffc107", "#0d6efd"], // colores Bootstrap
                }],
            },
            options: {
                responsive: true,
                plugins: { title: { display: true, text: "Distribución de estados" } },
            },
        });
    }

    async function pintarGraficaTopAsistencia(lista) {
        const Chart = await obtenerChartJS();
        if (graficaTopAsistencia) graficaTopAsistencia.destroy();

        graficaTopAsistencia = new Chart(canvasTopAsistencia, {
            type: "bar",
            data: {
                labels: lista.map((f) => f.nombre),
                datasets: [{
                    label: "% de asistencia",
                    data: lista.map((f) => Number(f.porcentajeAsistencia.toFixed(1))),
                    backgroundColor: "#198754",
                }],
            },
            options: {
                indexAxis: "y",
                responsive: true,
                plugins: {
                    title: { display: true, text: `Top ${TOP_N_RANKING} — más asistencia` },
                    legend: { display: false },
                },
                scales: { x: { min: 0, max: 100 } },
            },
        });
    }

    async function pintarGraficaTopAusencias(lista) {
        const Chart = await obtenerChartJS();
        if (graficaTopAusencias) graficaTopAusencias.destroy();

        graficaTopAusencias = new Chart(canvasTopAusencias, {
            type: "bar",
            data: {
                labels: lista.map((f) => f.nombre),
                datasets: [{
                    label: "Ausencias",
                    data: lista.map((f) => f.ausente),
                    backgroundColor: "#dc3545",
                }],
            },
            options: {
                indexAxis: "y",
                responsive: true,
                plugins: {
                    title: { display: true, text: `Top ${TOP_N_RANKING} — más ausencias` },
                    legend: { display: false },
                },
                scales: { x: { min: 0, ticks: { stepSize: 1 } } },
            },
        });
    }

    // =================================================
    // 9) ORQUESTAR TODO
    // =================================================

    async function pintarTodo() {
        const lista = registrosFiltrados();

        const resumen = calcularResumenGeneral(lista);
        pintarTarjetas(resumen);

        const porEstudiante = calcularPorEstudiante(lista);

        const rankingAsistencia = [...porEstudiante]
            .sort((a, b) => b.porcentajeAsistencia - a.porcentajeAsistencia || b.total - a.total)
            .slice(0, TOP_N_RANKING);

        const rankingAusencias = [...porEstudiante]
            .filter((f) => f.ausente > 0)
            .sort((a, b) => b.ausente - a.ausente)
            .slice(0, TOP_N_RANKING);

        pintarRankingAsistencia(rankingAsistencia);
        pintarRankingAusencias(rankingAusencias);

        await pintarGraficaDistribucion(resumen);
        await pintarGraficaTopAsistencia(rankingAsistencia);
        await pintarGraficaTopAusencias(rankingAusencias);
    }

    async function cargarTodo() {
        const textoOriginal = btnAplicarFiltros.innerHTML;
        btnAplicarFiltros.disabled = true;
        btnAplicarFiltros.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Cargando...`;

        try {
            if (registros.length === 0) await cargarDatos();
            await pintarTodo();
        } catch (error) {
            console.error("❌ Error al cargar estadísticas de asistencia:", error);
            mostrarMensaje(`Error al cargar las estadísticas: ${error.message || String(error)}`);
        } finally {
            btnAplicarFiltros.disabled = false;
            btnAplicarFiltros.innerHTML = textoOriginal;
        }
    }

    btnAplicarFiltros.addEventListener("click", pintarTodo);

    cargarTodo();
});
