import { supabase } from "./supabase.js";
import { pintarCambiarPanel } from "./roles.js";

document.addEventListener("DOMContentLoaded", async () => {

    pintarCambiarPanel("admin");

    const mensajeAdmin = document.getElementById("mensajeAdmin");
    const nombreAdmin = document.getElementById("nombreAdmin");
    const btnCerrarSesion = document.getElementById("btnCerrarSesion");
    const btnRecargarUsuarios = document.getElementById("btnRecargarUsuarios");
    const btnRecargarNotas = document.getElementById("btnRecargarNotas");

    function mostrarMensaje(texto, tipo = "danger") {
        mensajeAdmin.textContent = texto;
        mensajeAdmin.className = `alert alert-${tipo}`;
    }

    // =================================================
    // 1) VERIFICAR SESIÓN Y ROL DE ADMIN
    // =================================================

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
        console.error("❌ Acceso denegado, no es admin:", errPerfil);
        alert("⛔ No tienes permisos de administrador.");
        window.location.href = "login.html";
        return;
    }

    nombreAdmin.textContent = perfil.correo;

    // =================================================
    // 2) CERRAR SESIÓN
    // =================================================

    btnCerrarSesion.addEventListener("click", async () => {
        await supabase.auth.signOut();
        window.location.href = "login.html";
    });

    // =================================================
    // 2.5) GESTIONAR ESTUDIANTES (nombre, cédula, salón)
    // =================================================

    const estFiltroSalon = document.getElementById("estFiltroSalon");
    const btnCargarEstudiantes = document.getElementById("btnCargarEstudiantes");
    const tablaEstudiantesAdmin = document.getElementById("tablaEstudiantesAdmin");
    const estadoGuardadoEstudiantes = document.getElementById("estadoGuardadoEstudiantes");
    const nuevoEstNombre = document.getElementById("nuevoEstNombre");
    const nuevoEstCedula = document.getElementById("nuevoEstCedula");
    const nuevoEstSalon = document.getElementById("nuevoEstSalon");
    const nuevoEstSalonOtro = document.getElementById("nuevoEstSalonOtro");
    const bloqueOtroSalon = document.getElementById("bloqueOtroSalon");
    const btnAgregarEstudiante = document.getElementById("btnAgregarEstudiante");
    const mensajeEstudiantesAdmin = document.getElementById("mensajeEstudiantesAdmin");

    function mostrarMensajeEstudiantes(texto, tipo = "danger") {
        mensajeEstudiantesAdmin.textContent = texto;
        mensajeEstudiantesAdmin.className = `alert alert-${tipo} mt-3 mb-0`;
    }

    function ocultarMensajeEstudiantes() {
        mensajeEstudiantesAdmin.className = "alert d-none mt-3 mb-0";
    }

    function avisoGuardado(texto, esError = false) {
        estadoGuardadoEstudiantes.textContent = texto;
        estadoGuardadoEstudiantes.className = `small ${esError ? "text-danger" : "text-success"}`;
        setTimeout(() => {
            estadoGuardadoEstudiantes.textContent = "";
        }, 2000);
    }

    nuevoEstSalon.addEventListener("change", () => {
        bloqueOtroSalon.style.display = nuevoEstSalon.value === "__otro__" ? "block" : "none";
    });

    function filaEstudianteHtml(est) {
        const registrado = !!est.correo;
        const chip = registrado
            ? `<span class="badge bg-success">Registrado</span>`
            : `<span class="badge bg-secondary">Sin registrar</span>`;

        return `
            <tr data-id="${est.id}">
                <td>
                    <input type="text" class="form-control form-control-sm campo-nombre" value="${escapeHtmlAdmin(est.nombre || "")}">
                </td>
                <td>
                    <input type="text" class="form-control form-control-sm campo-cedula" value="${escapeHtmlAdmin(est.cedula || "")}" placeholder="8-123-4567">
                </td>
                <td>
                    <input type="text" class="form-control form-control-sm campo-salon" value="${escapeHtmlAdmin(est.salon || "")}">
                </td>
                <td>${chip}</td>
                <td class="text-center">
                    <button type="button" class="btn btn-sm btn-outline-danger btn-borrar-estudiante" title="Eliminar estudiante">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }

    // (usa la función escapeHtmlAdmin ya definida más abajo en este archivo)

    async function cargarEstudiantesAdmin() {
        tablaEstudiantesAdmin.innerHTML = `
            <tr><td colspan="5" class="text-center text-muted py-3">Cargando...</td></tr>
        `;

        let consulta = supabase
            .from("estudiantes")
            .select("id, codigo, nombre, cedula, salon, correo, es_prueba")
            .eq("es_prueba", false)
            .order("salon", { ascending: true })
            .order("nombre", { ascending: true });

        if (estFiltroSalon.value) {
            consulta = consulta.eq("salon", estFiltroSalon.value);
        }

        const { data, error } = await consulta;

        if (error) {
            console.error("❌ Error al cargar estudiantes:", error);
            tablaEstudiantesAdmin.innerHTML = `
                <tr><td colspan="5" class="text-center text-danger py-3">No se pudo cargar la lista.</td></tr>
            `;
            return;
        }

        if (!data || data.length === 0) {
            tablaEstudiantesAdmin.innerHTML = `
                <tr><td colspan="5" class="text-center text-muted py-3">No hay estudiantes en este salón todavía.</td></tr>
            `;
            return;
        }

        tablaEstudiantesAdmin.innerHTML = data.map(filaEstudianteHtml).join("");

        // Guardar nombre/cédula/salón al salir de la casilla (blur)
        tablaEstudiantesAdmin.querySelectorAll("tr[data-id]").forEach((fila) => {
            const id = fila.dataset.id;
            const inputNombre = fila.querySelector(".campo-nombre");
            const inputCedula = fila.querySelector(".campo-cedula");
            const inputSalon = fila.querySelector(".campo-salon");
            const btnBorrar = fila.querySelector(".btn-borrar-estudiante");

            async function guardarCampo(campo, valor) {
                const cambios = { [campo]: valor.trim() || null };
                const { error: errGuardar } = await supabase
                    .from("estudiantes")
                    .update(cambios)
                    .eq("id", id);

                if (errGuardar) {
                    console.error(`❌ Error al guardar ${campo}:`, errGuardar);
                    avisoGuardado(
                        errGuardar.code === "23505"
                            ? "⚠️ Esa cédula ya está en uso por otro estudiante."
                            : "❌ No se pudo guardar",
                        true
                    );
                    return;
                }
                avisoGuardado("✅ Guardado");
            }

            inputNombre.addEventListener("blur", () => guardarCampo("nombre", inputNombre.value));
            inputCedula.addEventListener("blur", () => guardarCampo("cedula", inputCedula.value));
            inputSalon.addEventListener("blur", () => guardarCampo("salon", inputSalon.value));

            btnBorrar.addEventListener("click", async () => {
                const nombreActual = inputNombre.value || "este estudiante";
                if (!confirm(`¿Eliminar a ${nombreActual}? Esto no borra sus notas, solo su ficha de estudiante.`)) return;

                const { error: errBorrar } = await supabase
                    .from("estudiantes")
                    .delete()
                    .eq("id", id);

                if (errBorrar) {
                    console.error("❌ Error al eliminar estudiante:", errBorrar);
                    avisoGuardado("❌ No se pudo eliminar", true);
                    return;
                }

                fila.remove();
            });
        });
    }

    btnCargarEstudiantes.addEventListener("click", cargarEstudiantesAdmin);

    btnAgregarEstudiante.addEventListener("click", async () => {
        ocultarMensajeEstudiantes();

        const nombre = nuevoEstNombre.value.trim();
        const cedula = nuevoEstCedula.value.trim();
        const salon = nuevoEstSalon.value === "__otro__"
            ? nuevoEstSalonOtro.value.trim()
            : nuevoEstSalon.value;

        if (!nombre || !salon) {
            mostrarMensajeEstudiantes("Por favor completa al menos el nombre y el salón.", "warning");
            return;
        }

        btnAgregarEstudiante.disabled = true;
        const textoOriginalBoton = btnAgregarEstudiante.innerHTML;
        btnAgregarEstudiante.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;

        try {
            // -------- 1) Verificar que la cédula no exista ya (si se dio una) --------
            if (cedula) {
                const { data: existente, error: errBuscar } = await supabase
                    .from("estudiantes")
                    .select("id")
                    .eq("cedula", cedula)
                    .maybeSingle();

                if (errBuscar) {
                    throw new Error("No se pudo verificar la cédula: " + errBuscar.message);
                }
                if (existente) {
                    mostrarMensajeEstudiantes("⚠️ Esa cédula ya está en uso por otro estudiante.", "warning");
                    return;
                }
            }

            // -------- 2) Calcular el siguiente código dentro de ese salón --------
            // "codigo" es un número entero en la base de datos, así que no puede
            // ser un texto tipo "EST-...". Se calcula como el siguiente número
            // disponible dentro del salón (1, 2, 3...).
            const { data: ultimoCodigo, error: errCodigo } = await supabase
                .from("estudiantes")
                .select("codigo")
                .eq("salon", salon)
                .order("codigo", { ascending: false })
                .limit(1)
                .maybeSingle();

            if (errCodigo) {
                throw new Error("No se pudo calcular el código: " + errCodigo.message);
            }

            const siguienteCodigo = ultimoCodigo ? (Number(ultimoCodigo.codigo) + 1) : 1;

            // -------- 3) Insertar el estudiante --------
            const { error } = await supabase
                .from("estudiantes")
                .insert([{
                    codigo: siguienteCodigo,
                    nombre,
                    cedula: cedula || null,
                    salon,
                    es_prueba: false
                }]);

            if (error) {
                // 23505 = cédula o (salón, código) duplicado
                if (error.code === "23505") {
                    throw new Error("⚠️ Esa cédula ya está en uso, o hubo un choque de código. Intenta de nuevo.");
                }
                // 42501 = RLS bloqueó el insert (sin permiso)
                if (error.code === "42501") {
                    throw new Error("No tienes permiso para agregar estudiantes en este salón.");
                }
                throw new Error(error.message);
            }

            mostrarMensajeEstudiantes(`✅ ${nombre} fue agregado(a) a ${salon} con el código ${siguienteCodigo}.`, "success");
            nuevoEstNombre.value = "";
            nuevoEstCedula.value = "";
            nuevoEstSalonOtro.value = "";

            // Si el salón filtrado coincide (o está en "Todos"), refresca la tabla
            if (!estFiltroSalon.value || estFiltroSalon.value === salon) {
                await cargarEstudiantesAdmin();
            }

        } catch (err) {
            console.error("❌ Error al agregar estudiante:", err);
            mostrarMensajeEstudiantes(err.message || "❌ No se pudo agregar el estudiante.", "danger");
        } finally {
            btnAgregarEstudiante.disabled = false;
            btnAgregarEstudiante.innerHTML = textoOriginalBoton;
        }
    });

    // =================================================
    // 3) CARGAR USUARIOS REGISTRADOS
    // =================================================

    async function cargarUsuarios() {

        const tablaUsuarios = document.getElementById("tablaUsuarios");
        tablaUsuarios.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">Cargando usuarios...</td></tr>`;

        const { data, error } = await supabase
            .from("usuarios")
            .select("correo, rol, activo, created_at")
            .order("created_at", { ascending: false });

        if (error) {
            console.error("❌ Error al cargar usuarios:", error);
            tablaUsuarios.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-4">Error: ${error.message}</td></tr>`;
            return;
        }

        if (!data || data.length === 0) {
            tablaUsuarios.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">No hay usuarios registrados.</td></tr>`;
            return;
        }

        tablaUsuarios.innerHTML = "";

        data.forEach((u) => {

            const fila = document.createElement("tr");

            const fecha = u.created_at
                ? new Date(u.created_at).toLocaleString("es-PA")
                : "-";

            const btnInspeccionar = u.correo 
                ? `<a href="estudiante.html?correo=${encodeURIComponent(u.correo)}" target="_blank" class="btn btn-sm btn-outline-primary py-0">👁️ Ver Boletín</a>`
                : '-';

            fila.innerHTML = `
                <td>${u.correo ?? "-"}</td>
                <td><span class="badge bg-secondary">${u.rol ?? "-"}</span></td>
                <td>${u.activo ? "✅" : "❌"}</td>
                <td>${fecha}</td>
                <td>${btnInspeccionar}</td>
            `;

            tablaUsuarios.appendChild(fila);
        });
    }

    // =================================================
    // 4) CARGAR NOTAS DE TODOS LOS ESTUDIANTES
    // =================================================

    async function cargarNotas() {

        const cabeceraNotas = document.getElementById("cabeceraNotas");
        const tablaNotas = document.getElementById("tablaNotas");

        tablaNotas.innerHTML = `<tr><td class="text-center text-muted py-4">Cargando notas...</td></tr>`;
        cabeceraNotas.innerHTML = "";

        const { data, error } = await supabase
            .from("notas")
            .select("*")
            .order("id", { ascending: false });

        if (error) {
            console.error("❌ Error al cargar notas:", error);
            tablaNotas.innerHTML = `<tr><td class="text-center text-danger py-4">Error: ${error.message}</td></tr>`;
            return;
        }

        if (!data || data.length === 0) {
            tablaNotas.innerHTML = `<tr><td class="text-center text-muted py-4">No hay notas registradas.</td></tr>`;
            return;
        }

        const columnas = Object.keys(data[0]);

        const filaCabecera = document.createElement("tr");
        columnas.forEach((col) => {
            const th = document.createElement("th");
            th.textContent = col;
            filaCabecera.appendChild(th);
        });
        filaCabecera.innerHTML += `<th>Acción</th>`;
        cabeceraNotas.appendChild(filaCabecera);

        tablaNotas.innerHTML = "";

        data.forEach((registro) => {
            const fila = document.createElement("tr");
            columnas.forEach((col) => {
                const td = document.createElement("td");
                td.textContent = registro[col] ?? "-";
                fila.appendChild(td);
            });

            const tdAccion = document.createElement("td");
            tdAccion.innerHTML = registro.correo 
                ? `<a href="estudiante.html?correo=${encodeURIComponent(registro.correo)}" target="_blank" class="btn btn-sm btn-outline-primary py-0">👁️ Ver</a>`
                : '-';
            fila.appendChild(tdAccion);

            tablaNotas.appendChild(fila);
        });
    }

    // =================================================
    // 5) AGREGAR NOTAS POR SECCIÓN
    // =================================================

    function escapeHtmlAdmin(str) {
        return String(str ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    const notasSalon = document.getElementById("notasSalon");
    const notasMateria = document.getElementById("notasMateria");
    const notasTipo = document.getElementById("notasTipo");
    const notasNumero = document.getElementById("notasNumero");
    const notasTrimestre = document.getElementById("notasTrimestre");
    const btnCargarGrupo = document.getElementById("btnCargarGrupo");
    const bloqueTablaNotas = document.getElementById("bloqueTablaNotas");
    const tablaNotasGrupo = document.getElementById("tablaNotasGrupo");
    const btnGuardarNotasGrupo = document.getElementById("btnGuardarNotasGrupo");
    const estadoGuardadoNotas = document.getElementById("estadoGuardadoNotas");

    let grupoActualNotas = [];
    let historiaPorEstudiante = {}; 
    let casillasTabla = [];         
    let temasCasillasBD = {};       

    function claveCasilla(tipo, numero) {
        return `${tipo}-${numero}`;
    }

    function etiquetaCasilla(tipo, numero) {
        return `${tipo === "apreciacion" ? "Aprec." : "Ejer."} ${numero}`;
    }

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

        const salon = notasSalon.value;
        const materia = notasMateria.value.trim();
        const trimestre = notasTrimestre.value;
        const valorGuardar = nuevoTema || null;

        const { error: errorTemaTabla } = await supabase
            .from("temas_casillas")
            .upsert(
                {
                    salon,
                    materia,
                    trimestre,
                    tipo,
                    numero,
                    tema: valorGuardar,
                    updated_at: new Date().toISOString()
                },
                { onConflict: "salon,materia,trimestre,tipo,numero" }
            );

        if (errorTemaTabla) {
            console.error("❌ Error al guardar el tema de la casilla:", errorTemaTabla);
            estadoGuardadoNotas.textContent = `⚠️ No se pudo guardar el tema de ${etiquetaCasilla(tipo, numero)}.`;
            estadoGuardadoNotas.className = "small text-danger";
            return;
        }

        temasCasillasBD[claveCasilla(tipo, numero)] = valorGuardar || "";

        const correosDelGrupo = grupoActualNotas.map((e) => e.correo).filter(Boolean);
        const idsSinCuenta = grupoActualNotas.filter((e) => !e.correo).map((e) => e.id);

        if (correosDelGrupo.length > 0) {
            await supabase
                .from("notas")
                .update({ tema: valorGuardar })
                .eq("materia", materia)
                .eq("trimestre", trimestre)
                .eq("tipo", tipo)
                .eq("numero", numero)
                .in("correo", correosDelGrupo);
        }

        if (idsSinCuenta.length > 0) {
            await supabase
                .from("notas")
                .update({ tema: valorGuardar })
                .eq("materia", materia)
                .eq("trimestre", trimestre)
                .eq("tipo", tipo)
                .eq("numero", numero)
                .in("estudiante_id", idsSinCuenta);
        }

        const clave = claveCasilla(tipo, numero);
        Object.keys(historiaPorEstudiante).forEach((claveEst) => {
            if (historiaPorEstudiante[claveEst][clave]) {
                historiaPorEstudiante[claveEst][clave].tema = valorGuardar;
            }
        });

        estadoGuardadoNotas.textContent = `✅ Tema de "${etiquetaCasilla(tipo, numero)}" actualizado.`;
        estadoGuardadoNotas.className = "small text-success";
    }

    async function eliminarColumnaCasilla(tipo, numero) {
        const salon = notasSalon.value;
        const materia = notasMateria.value.trim();
        const trimestre = notasTrimestre.value;
        const etiqueta = etiquetaCasilla(tipo, numero);

        const confirmar = confirm(`¿Estás seguro de que deseas eliminar permanentemente la casilla "${etiqueta}" (${materia} - ${salon}) y TODAS las notas registradas en ella?`);
        if (!confirmar) return;

        estadoGuardadoNotas.textContent = `Eliminando columna ${etiqueta}...`;
        estadoGuardadoNotas.className = "small text-primary";

        try {
            await supabase.from("notas")
                .delete()
                .eq("materia", materia)
                .eq("trimestre", trimestre)
                .eq("tipo", tipo)
                .eq("numero", numero);

            await supabase.from("temas_casillas")
                .delete()
                .eq("salon", salon)
                .eq("materia", materia)
                .eq("trimestre", trimestre)
                .eq("tipo", tipo)
                .eq("numero", numero);

            await supabase.from("columnas_materia")
                .delete()
                .eq("materia", materia)
                .eq("trimestre", trimestre)
                .eq("tipo", tipo)
                .eq("numero", numero);

            estadoGuardadoNotas.textContent = `✅ Casilla ${etiqueta} eliminada correctamente.`;
            estadoGuardadoNotas.className = "small text-success";

            btnCargarGrupo.click();
            cargarNotas();

        } catch (error) {
            console.error("❌ Error al eliminar casilla:", error);
            estadoGuardadoNotas.textContent = `⚠️ Error al eliminar la casilla: ${error.message || String(error)}`;
            estadoGuardadoNotas.className = "small text-danger";
        }
    }

    (async function precargarTrimestreActivo() {
        const { data: cfg } = await supabase
            .from("configuracion")
            .select("trimestre_activo")
            .maybeSingle();

        if (cfg?.trimestre_activo && notasTrimestre) {
            notasTrimestre.value = cfg.trimestre_activo;
        }
    })();

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

    function materiasParaSalon(salon) {
        const lista = salon === "8A"
            ? MATERIAS_BASE.map((m) => (m === "Contabilidad" ? "Informática" : m))
            : MATERIAS_BASE;

        return [...lista].sort((a, b) => a.localeCompare(b, "es"));
    }

    const MATERIA_A_PROFESOR = {
        "Español": "Yadira de Gracia",
        "Geografía": "Faustina Rodríguez",
        "Inglés": "Wendy Warren",
        "Matemática": "Juana Browns",
        "Ciencias Naturales": "Samuel Ortega",
        "Cívica": "Juana Browns",
        "Educación Física": "Guiliam Barría",
        "Expresión Artística": "Miriam Valencia",
        "Educación Agropecuaria": "Alexis Del Mar",
        "Familia y Desarrollo Comunitario": "Erika Pimentel",
        "Contabilidad": "Alexis Del Mar",
        "Orientación": "Willian Mitzi",
        "Religión, Moral y Valores": "Encelma Álvarez",
        "Música": "Miriam Valencia"
    };

    const ETIQUETAS_SALON = { "8A": "8°A", "9A": "9°A", "9B": "9°B", "9C": "9°C" };
    const PROMEDIO_MINIMO_APROBAR = 3.0;

    function actualizarOpcionesMateria() {
        const salon = notasSalon.value;

        if (!salon) {
            notasMateria.innerHTML = `<option value="">Seleccione primero un salón</option>`;
            notasMateria.disabled = true;
            return;
        }

        const materias = materiasParaSalon(salon);

        notasMateria.innerHTML =
            `<option value="">Seleccione una materia</option>` +
            materias.map((m) => `<option value="${escapeHtmlAdmin(m)}">${escapeHtmlAdmin(m)}</option>`).join("");

        notasMateria.disabled = false;
    }

    notasSalon.addEventListener("change", actualizarOpcionesMateria);

    function recalcularPromedios() {
        tablaNotasGrupo.querySelectorAll("tr").forEach((tr) => {

            const inputsFila = tr.querySelectorAll(".input-nota-grupo");
            if (inputsFila.length === 0) return;

            const aprValores = [];
            const ejeValores = [];

            inputsFila.forEach((input) => {
                const valor = input.value.trim();
                if (valor === "") return;

                const num = parseFloat(valor);
                if (isNaN(num)) return;

                if (input.dataset.tipo === "apreciacion") aprValores.push(num);
                else if (input.dataset.tipo === "ejercicio") ejeValores.push(num);
            });

            const promApr = aprValores.length > 0
                ? aprValores.reduce((a, b) => a + b, 0) / aprValores.length
                : null;

            const promEje = ejeValores.length > 0
                ? ejeValores.reduce((a, b) => a + b, 0) / ejeValores.length
                : null;

            let promFinal = null;
            if (promApr !== null && promEje !== null) {
                promFinal = (promApr + promEje) / 2;
            } else if (promApr !== null) {
                promFinal = promApr;
            } else if (promEje !== null) {
                promFinal = promEje;
            }

            const celdaApr = tr.querySelector(".celda-prom-apr");
            const celdaEje = tr.querySelector(".celda-prom-eje");
            const celdaFinal = tr.querySelector(".celda-prom-final");

            if (celdaApr) celdaApr.textContent = promApr !== null ? promApr.toFixed(1) : "–";
            if (celdaEje) celdaEje.textContent = promEje !== null ? promEje.toFixed(1) : "–";

            if (celdaFinal) {
                celdaFinal.textContent = promFinal !== null ? promFinal.toFixed(1) : "–";

                const enRiesgo = promFinal !== null && promFinal < PROMEDIO_MINIMO_APROBAR;

                if (enRiesgo) {
                    tr.classList.add("table-danger");
                    celdaFinal.classList.add("text-danger");
                } else {
                    tr.classList.remove("table-danger");
                    celdaFinal.classList.remove("text-danger");
                }
            }
        });
    }

    function renderTablaNotasGrupo() {

        const cabecera = document.getElementById("cabeceraNotasGrupo");
        const cabeceraTemas = document.getElementById("cabeceraTemasGrupo");

        if (grupoActualNotas.length === 0) {
            cabecera.innerHTML = `<th style="width:45px;">#</th><th>Estudiante</th>`;
            cabeceraTemas.innerHTML = "";
            tablaNotasGrupo.innerHTML = `<tr><td colspan="2" class="text-center text-muted py-3">Este salón aún no tiene estudiantes cargados.</td></tr>`;
            return;
        }

        const claveSeleccionada = claveCasilla(notasTipo.value, parseInt(notasNumero.value, 10));

        let htmlCabecera = `<th style="width:45px;">#</th><th>Estudiante</th>`;

        casillasTabla.forEach((c) => {
            const esSeleccionada = claveCasilla(c.tipo, c.numero) === claveSeleccionada;
            const claseTh = esSeleccionada ? "table-primary text-primary" : "text-muted";
            htmlCabecera += `
                <th class="text-center small ${claseTh}" style="width:90px;">
                    <div>${etiquetaCasilla(c.tipo, c.numero)}</div>
                    <button type="button" class="btn btn-link btn-sm p-0 text-danger btn-eliminar-columna" data-tipo="${c.tipo}" data-numero="${c.numero}" title="Eliminar esta columna y sus notas">🗑️</button>
                </th>`;
        });

        htmlCabecera += `<th class="text-center small fw-bold" style="width:85px;">Prom. Aprec.</th>`;
        htmlCabecera += `<th class="text-center small fw-bold" style="width:85px;">Prom. Ejer.</th>`;
        htmlCabecera += `<th class="text-center small fw-bold table-success" style="width:90px;">Prom. Final</th>`;
        htmlCabecera += `<th style="width:160px;">Estado</th>`;
        cabecera.innerHTML = htmlCabecera;

        let htmlTemas = `<th></th><th class="small text-muted fw-normal">Tema de cada casilla:</th>`;

        casillasTabla.forEach((c) => {
            const temaActual = obtenerTemaCasilla(c.tipo, c.numero);
            htmlTemas += `
                <th style="padding:2px 4px;">
                    <input
                        type="text"
                        class="form-control form-control-sm input-tema-columna"
                        data-tipo="${c.tipo}"
                        data-numero="${c.numero}"
                        data-tema-guardado="${escapeHtmlAdmin(temaActual)}"
                        value="${escapeHtmlAdmin(temaActual)}"
                        placeholder="Ej: Prueba corta"
                        style="font-size:11px; font-weight:normal;"
                    >
                </th>
            `;
        });

        htmlTemas += `<th></th><th></th><th></th><th></th>`; 
        cabeceraTemas.innerHTML = htmlTemas;

        tablaNotasGrupo.innerHTML = grupoActualNotas.map((est, i) => {
            const sinCuenta = !est.correo;
            const historialEst = historiaPorEstudiante[claveEstudiante(est)] || {};

            const columnasNotas = casillasTabla.map((c, colIndex) => {
                const claveCas = claveCasilla(c.tipo, c.numero);
                const n = historialEst[claveCas];
                const valor = (n && n.nota !== null && n.nota !== undefined) ? n.nota : "";

                return `
                    <td>
                        <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="5"
                            class="form-control form-control-sm input-nota-grupo"
                            data-col="${colIndex}"
                            data-correo="${sinCuenta ? "" : escapeHtmlAdmin(est.correo)}"
                            data-estudiante-id="${sinCuenta ? escapeHtmlAdmin(est.id) : ""}"
                            data-nota-id="${n ? n.id : ""}"
                            data-tipo="${c.tipo}"
                            data-numero="${c.numero}"
                            data-ultimo-valor-guardado="${valor}"
                            value="${valor}"
                            placeholder="–"
                        >
                    </td>
                `;
            }).join("");

            const nombreEnlace = est.correo
                ? `<a href="estudiante.html?correo=${encodeURIComponent(est.correo)}" target="_blank" class="fw-bold text-decoration-none text-primary" title="Hacer clic para ver/editar las notas individuales de este estudiante">${escapeHtmlAdmin(est.nombre)} 👁️</a>`
                : escapeHtmlAdmin(est.nombre);

            const badge = sinCuenta
                ? `<span class="badge bg-warning text-dark">Sin cuenta</span>`
                : `<a href="estudiante.html?correo=${encodeURIComponent(est.correo)}" target="_blank" class="badge bg-primary text-decoration-none">👁️ Ver Boletín</a>`;

            return `
                <tr class="${sinCuenta ? "table-warning" : ""}">
                    <td>${i + 1}</td>
                    <td>${nombreEnlace}</td>
                    ${columnasNotas}
                    <td class="celda-prom-apr text-center fw-bold">–</td>
                    <td class="celda-prom-eje text-center fw-bold">–</td>
                    <td class="celda-prom-final text-center fw-bold table-success bg-opacity-25">–</td>
                    <td>${badge}</td>
                </tr>
            `;
        }).join("");

        recalcularPromedios();

        cabecera.querySelectorAll(".btn-eliminar-columna").forEach((btn) => {
            btn.addEventListener("click", () => {
                eliminarColumnaCasilla(btn.dataset.tipo, parseInt(btn.dataset.numero, 10));
            });
        });

        tablaNotasGrupo.parentElement.querySelectorAll(".input-tema-columna").forEach((input) => {
            input.addEventListener("blur", async () => {
                const nuevoValor = input.value.trim();
                if (nuevoValor === input.dataset.temaGuardado) return;
                await actualizarTemaCasilla(input.dataset.tipo, parseInt(input.dataset.numero, 10), nuevoValor);
                input.dataset.temaGuardado = nuevoValor;
            });
        });

        const todosLosInputs = Array.from(tablaNotasGrupo.querySelectorAll(".input-nota-grupo"));
        const inputsPorColumna = {};

        todosLosInputs.forEach((input) => {
            const col = input.dataset.col;
            if (!inputsPorColumna[col]) inputsPorColumna[col] = [];
            inputsPorColumna[col].push(input);
        });

        todosLosInputs.forEach((input) => {

            input.addEventListener("input", recalcularPromedios);

            input.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();

                    const listaColumna = inputsPorColumna[input.dataset.col] || [];
                    const posicion = listaColumna.indexOf(input);
                    const siguiente = listaColumna[posicion + 1];

                    if (siguiente) {
                        siguiente.focus();
                        siguiente.select();
                    }
                }
            });
        });
    }

    if (btnCargarGrupo) {

        btnCargarGrupo.addEventListener("click", async () => {

            const salon = notasSalon.value;
            const materia = notasMateria.value.trim();
            const tipo = notasTipo.value;
            const numero = parseInt(notasNumero.value, 10);
            const trimestre = notasTrimestre.value;

            if (!salon) {
                alert("Selecciona un salón.");
                return;
            }

            if (!materia) {
                alert("Escribe el nombre de la materia.");
                return;
            }

            const textoOriginalBoton = btnCargarGrupo.innerHTML;
            btnCargarGrupo.disabled = true;
            btnCargarGrupo.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Cargando...`;

            const { data: estudiantesSalon, error: errEst } = await supabase
                .from("estudiantes")
                .select("id, codigo, nombre, correo, es_prueba")
                .eq("salon", salon)
                .order("nombre", { ascending: true });

            if (errEst) {
                console.error("❌ Error al cargar estudiantes del salón:", errEst);
                alert("Error al cargar estudiantes: " + errEst.message);
                btnCargarGrupo.disabled = false;
                btnCargarGrupo.innerHTML = textoOriginalBoton;
                return;
            }

            grupoActualNotas = (estudiantesSalon || []).filter((e) => !e.es_prueba);

            const correosDelGrupo = grupoActualNotas.map((e) => e.correo).filter(Boolean);
            const idsSinCuenta = grupoActualNotas.filter((e) => !e.correo).map((e) => e.id);

            historiaPorEstudiante = {};
            const casillasEncontradas = new Set();

            function registrarNotaEnHistorial(clave, n) {
                if (!historiaPorEstudiante[clave]) historiaPorEstudiante[clave] = {};
                const claveCas = claveCasilla(n.tipo, n.numero);
                historiaPorEstudiante[clave][claveCas] = n;
                casillasEncontradas.add(claveCas);
            }

            if (correosDelGrupo.length > 0) {
                const { data: notasCorreo, error: errNotas } = await supabase
                    .from("notas")
                    .select("id, correo, tipo, numero, nota, tema")
                    .eq("materia", materia)
                    .eq("trimestre", trimestre)
                    .in("correo", correosDelGrupo);

                if (errNotas) {
                    console.error("❌ Error al cargar historial de notas:", errNotas);
                } else if (notasCorreo) {
                    notasCorreo.forEach((n) => registrarNotaEnHistorial(`correo:${n.correo}`, n));
                }
            }

            if (idsSinCuenta.length > 0) {
                const { data: notasSinCuenta, error: errNotasSinCuenta } = await supabase
                    .from("notas")
                    .select("id, estudiante_id, tipo, numero, nota, tema")
                    .eq("materia", materia)
                    .eq("trimestre", trimestre)
                    .in("estudiante_id", idsSinCuenta);

                if (errNotasSinCuenta) {
                    console.error("❌ Error al cargar historial de notas (sin cuenta):", errNotasSinCuenta);
                } else if (notasSinCuenta) {
                    notasSinCuenta.forEach((n) => registrarNotaEnHistorial(`id:${n.estudiante_id}`, n));
                }
            }

            temasCasillasBD = {};

            const { data: temasGuardados, error: errTemas } = await supabase
                .from("temas_casillas")
                .select("tipo, numero, tema")
                .eq("salon", salon)
                .eq("materia", materia)
                .eq("trimestre", trimestre);

            if (errTemas) {
                console.error("❌ Error al cargar temas de casillas:", errTemas);
            } else if (temasGuardados) {
                temasGuardados.forEach((t) => {
                    const claveCas = claveCasilla(t.tipo, t.numero);
                    temasCasillasBD[claveCas] = t.tema || "";
                    if (t.tema) casillasEncontradas.add(claveCas);
                });
            }

            const claveActual = claveCasilla(tipo, numero);
            casillasEncontradas.add(claveActual);

            casillasTabla = [...casillasEncontradas]
                .map((c) => {
                    const separador = c.lastIndexOf("-");
                    return {
                        tipo: c.slice(0, separador),
                        numero: parseInt(c.slice(separador + 1), 10)
                    };
                })
                .sort((a, b) => {
                    if (a.tipo !== b.tipo) return a.tipo === "apreciacion" ? -1 : 1;
                    return a.numero - b.numero;
                });

            renderTablaNotasGrupo();
            bloqueTablaNotas.style.display = "block";

            btnCargarGrupo.disabled = false;
            btnCargarGrupo.innerHTML = textoOriginalBoton;
        });
    }

    // =================================================
    // GUARDAR NOTAS
    // =================================================

    async function guardarNotasGrupo(esAutomatico = false) {

        const materia = notasMateria.value.trim();
        const trimestre = notasTrimestre.value;
        const hoy = new Date().toISOString().slice(0, 10);

        const inputsTema = Array.from(tablaNotasGrupo.parentElement.querySelectorAll(".input-tema-columna"));
        const temaPorCasilla = {};
        for (const inputTema of inputsTema) {
            const valorActual = inputTema.value.trim();
            temaPorCasilla[claveCasilla(inputTema.dataset.tipo, parseInt(inputTema.dataset.numero, 10))] = valorActual || null;
            if (valorActual !== inputTema.dataset.temaGuardado) {
                await actualizarTemaCasilla(inputTema.dataset.tipo, parseInt(inputTema.dataset.numero, 10), valorActual);
                inputTema.dataset.temaGuardado = valorActual;
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

        estadoGuardadoNotas.textContent = esAutomatico
            ? "Autoguardando..."
            : `Guardando 0 / ${aGuardar.length}...`;
        estadoGuardadoNotas.className = "small text-primary";

        let exitosas = 0;
        let fallidas = 0;

        for (let i = 0; i < aGuardar.length; i++) {

            const item = aGuardar[i];

            if (item.notaId) {

                const { error } = await supabase
                    .from("notas")
                    .update({
                        nota: item.nota,
                        fecha: hoy
                    })
                    .eq("id", item.notaId);

                if (error) {
                    console.error("❌ Error al actualizar nota:", item, error);
                    fallidas++;
                } else {
                    exitosas++;
                    item.input.dataset.ultimoValorGuardado = String(item.nota);
                }

            } else {

                const { data: insertado, error } = await supabase
                    .from("notas")
                    .insert([{
                        correo: item.correo,
                        estudiante_id: item.estudianteId,
                        materia,
                        tipo: item.tipo,
                        numero: item.numero,
                        tema: temaPorCasilla[claveCasilla(item.tipo, item.numero)] || null,
                        actividad: temaPorCasilla[claveCasilla(item.tipo, item.numero)] || `${item.tipo === "apreciacion" ? "Apreciación" : "Ejercicio"} ${item.numero}`,
                        fecha: hoy,
                        nota: item.nota,
                        observacion: item.correo
                            ? "Agregada por el administrador"
                            : "Agregada por el administrador (estudiante aún sin cuenta)",
                        trimestre,
                        estado: "Activa"
                    }])
                    .select("id");

                if (error) {
                    console.error("❌ Error al insertar nota:", item, error);
                    fallidas++;
                } else {
                    exitosas++;
                    item.input.dataset.ultimoValorGuardado = String(item.nota);

                    if (insertado && insertado[0]) {
                        item.input.dataset.notaId = insertado[0].id;
                    }
                }
            }

            if (!esAutomatico) {
                estadoGuardadoNotas.textContent = `Guardando ${i + 1} / ${aGuardar.length}...`;
            }
        }

        if (!esAutomatico) btnGuardarNotasGrupo.disabled = false;

        const horaActual = new Date().toLocaleTimeString("es-PA", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        });

        if (fallidas === 0) {
            estadoGuardadoNotas.textContent = esAutomatico
                ? `✅ Autoguardado (${exitosas}) a las ${horaActual}`
                : `✅ ${exitosas} nota(s) guardada(s) correctamente.`;
            estadoGuardadoNotas.className = "small text-success";
        } else {
            estadoGuardadoNotas.textContent = `⚠️ ${exitosas} guardada(s), ${fallidas} con error.`;
            estadoGuardadoNotas.className = "small text-danger";
        }

        if (!esAutomatico) {
            btnCargarGrupo.click();
            cargarNotas();
        }
    }

    if (btnGuardarNotasGrupo) {
        btnGuardarNotasGrupo.addEventListener("click", () => guardarNotasGrupo(false));
    }

    setInterval(() => {
        if (bloqueTablaNotas && bloqueTablaNotas.style.display !== "none") {
            guardarNotasGrupo(true);
        }
    }, 30000);

    // =================================================
    // 5.5) VISTA GENERAL POR SALÓN
    // =================================================

    const vistaGeneralSalon = document.getElementById("vistaGeneralSalon");
    const vistaGeneralTrimestre = document.getElementById("vistaGeneralTrimestre");
    const btnCargarVistaGeneral = document.getElementById("btnCargarVistaGeneral");
    const vistaGeneralContenedor = document.getElementById("vistaGeneralContenedor");
    const vistaGeneralFiltroMateria = document.getElementById("vistaGeneralFiltroMateria");

    let datosVistaGeneral = null;

    function claveCasillaVG(tipo, numero) {
        return `${tipo}|${numero}`;
    }

    async function construirDatosVistaGeneral(salon, trimestre) {
        const { data: estudiantesSalon, error: errEst } = await supabase
            .from("estudiantes")
            .select("id, codigo, nombre, correo, es_prueba")
            .eq("salon", salon)
            .order("nombre", { ascending: true });

        if (errEst) throw errEst;

        const estudiantes = (estudiantesSalon || []).filter((e) => !e.es_prueba);
        if (estudiantes.length === 0) return { estudiantes: [], materias: [] };

        const correosConCuenta = estudiantes.map((e) => e.correo).filter(Boolean);
        const idsSinCuenta = estudiantes.filter((e) => !e.correo).map((e) => e.id);

        let notas = [];

        if (correosConCuenta.length > 0) {
            const { data, error } = await supabase
                .from("notas")
                .select("correo, estudiante_id, materia, tipo, numero, nota, tema, estado")
                .eq("trimestre", trimestre)
                .in("correo", correosConCuenta);
            if (error) throw error;
            notas = notas.concat(data || []);
        }

        if (idsSinCuenta.length > 0) {
            const { data, error } = await supabase
                .from("notas")
                .select("correo, estudiante_id, materia, tipo, numero, nota, tema, estado")
                .eq("trimestre", trimestre)
                .in("estudiante_id", idsSinCuenta);
            if (error) throw error;
            notas = notas.concat(data || []);
        }

        const [{ data: columnasDef }, { data: temasCasillas }] = await Promise.all([
            supabase.from("columnas_materia").select("materia, tipo, numero").eq("trimestre", trimestre),
            supabase.from("temas_casillas").select("materia, tipo, numero, tema").eq("trimestre", trimestre).eq("salon", salon)
        ]);

        const columnasPorMateria = {};
        const temaPorCasilla = {};

        function agregarCol(materia, tipo, numero) {
            if (!materia || !tipo || !numero) return;
            if (!columnasPorMateria[materia]) columnasPorMateria[materia] = { apreciacion: new Set(), ejercicio: new Set() };
            if (columnasPorMateria[materia][tipo]) columnasPorMateria[materia][tipo].add(numero);
        }

        function guardarTemaSiFalta(materia, tipo, numero, tema) {
            if (!tema || !tema.trim()) return;
            if (!temaPorCasilla[materia]) temaPorCasilla[materia] = {};
            const clave = claveCasillaVG(tipo, numero);
            if (!temaPorCasilla[materia][clave]) temaPorCasilla[materia][clave] = tema.trim();
        }

        (columnasDef || []).forEach((c) => agregarCol(c.materia, c.tipo, c.numero));
        (temasCasillas || []).forEach((c) => {
            agregarCol(c.materia, c.tipo, c.numero);
            guardarTemaSiFalta(c.materia, c.tipo, c.numero, c.tema);
        });

        notas.forEach((n) => {
            const tipoNorm = (n.tipo || "").toLowerCase();
            if (tipoNorm === "apreciacion" || tipoNorm === "ejercicio") {
                agregarCol(n.materia, tipoNorm, n.numero);
                guardarTemaSiFalta(n.materia, tipoNorm, n.numero, n.tema);
            }
        });

        const claveEstudianteVG = (n) => n.correo ? `correo:${n.correo}` : `id:${n.estudiante_id}`;
        const notasPorEstudianteMateria = {};

        notas.forEach((n) => {
            const claveEst = claveEstudianteVG(n);
            if (!notasPorEstudianteMateria[claveEst]) notasPorEstudianteMateria[claveEst] = {};
            if (!notasPorEstudianteMateria[claveEst][n.materia]) notasPorEstudianteMateria[claveEst][n.materia] = {};
            notasPorEstudianteMateria[claveEst][n.materia][claveCasillaVG(n.tipo, n.numero)] = n;
        });

        const materiasOrdenadas = materiasParaSalon(salon);
        const materias = [];

        materiasOrdenadas.forEach((materia) => {
            const cols = columnasPorMateria[materia];
            if (!cols) return;

            const apr = [...cols.apreciacion].sort((a, b) => a - b);
            const eje = [...cols.ejercicio].sort((a, b) => a - b);
            const temas = temaPorCasilla[materia] || {};

            const filas = estudiantes.map((est) => {
                const claveEst = est.correo ? `correo:${est.correo}` : `id:${est.id}`;
                const notasEstMateria = notasPorEstudianteMateria[claveEst]?.[materia] || {};

                const celdasApr = apr.map((n) => notasEstMateria[claveCasillaVG("apreciacion", n)] || null);
                const celdasEje = eje.map((n) => notasEstMateria[claveCasillaVG("ejercicio", n)] || null);

                const valoresApr = celdasApr.filter((n) => n && n.estado !== "Intencional");
                const valoresEje = celdasEje.filter((n) => n && n.estado !== "Intencional");

                const promApr = valoresApr.length > 0
                    ? valoresApr.reduce((a, b) => a + Number(b.nota), 0) / valoresApr.length : null;
                const promEje = valoresEje.length > 0
                    ? valoresEje.reduce((a, b) => a + Number(b.nota), 0) / valoresEje.length : null;

                let promFinal = null;
                if (promApr !== null && promEje !== null) promFinal = (promApr + promEje) / 2;
                else if (promApr !== null) promFinal = promApr;
                else if (promEje !== null) promFinal = promEje;

                return {
                    nombre: est.nombre,
                    correo: est.correo,
                    sinCuenta: !est.correo,
                    celdasApr, celdasEje,
                    promApr, promEje, promFinal
                };
            });

            const tieneNotasReales = filas.some((f) => 
                f.celdasApr.some((n) => n !== null && n.nota !== null && n.nota !== undefined) || 
                f.celdasEje.some((n) => n !== null && n.nota !== null && n.nota !== undefined)
            );

            if (tieneNotasReales) {
                materias.push({ materia, apr, eje, temas, filas });
            }
        });

        return { estudiantes, materias };
    }

    function renderVistaGeneralHTML(datos, salon, trimestre, filtroMateria) {
        if (datos.materias.length === 0) {
            vistaGeneralContenedor.innerHTML = `<p class="text-muted">Todavía no hay ninguna nota registrada para este salón en ${escapeHtmlAdmin(trimestre)}.</p>`;
            return;
        }

        const materiasAMostrar = filtroMateria
            ? datos.materias.filter((m) => m.materia === filtroMateria)
            : datos.materias;

        let html = `<h4 class="mb-3">${ETIQUETAS_SALON[salon] || salon} — ${escapeHtmlAdmin(trimestre)}</h4>`;

        materiasAMostrar.forEach(({ materia, apr, eje, temas, filas }) => {
            const profesor = MATERIA_A_PROFESOR[materia] || "(sin asignar)";

            let filaEncabezado = `<tr><th style="min-width:160px;">Estudiante</th>`;
            apr.forEach((n) => { filaEncabezado += `<th class="text-center">Apr.${n}</th>`; });
            if (apr.length > 0) filaEncabezado += `<th class="text-center fw-bold">Prom.Apr.</th>`;
            eje.forEach((n) => { filaEncabezado += `<th class="text-center">Eje.${n}</th>`; });
            if (eje.length > 0) filaEncabezado += `<th class="text-center fw-bold">Prom.Eje.</th>`;
            filaEncabezado += `<th class="text-center fw-bold table-success">Prom.Final</th></tr>`;

            let filaTemas = `<tr class="table-light"><th class="small text-muted fw-normal">Tema:</th>`;
            apr.forEach((n) => {
                const tema = temas[claveCasillaVG("apreciacion", n)] || "-";
                filaTemas += `<th class="small text-muted fw-normal fst-italic">${escapeHtmlAdmin(tema)}</th>`;
            });
            if (apr.length > 0) filaTemas += `<th></th>`;
            eje.forEach((n) => {
                const tema = temas[claveCasillaVG("ejercicio", n)] || "-";
                filaTemas += `<th class="small text-muted fw-normal fst-italic">${escapeHtmlAdmin(tema)}</th>`;
            });
            if (eje.length > 0) filaTemas += `<th></th>`;
            filaTemas += `<th></th></tr>`;

            const celdaHtml = (n) => {
                if (!n) return `<td class="text-center text-muted">—</td>`;
                if (n.estado === "Intencional") return `<td class="text-center" title="Falta intencional">⚠️</td>`;
                return `<td class="text-center">${escapeHtmlAdmin(Number(n.nota).toFixed(1))}</td>`;
            };

            let filasCuerpo = "";
            filas.forEach((fila) => {
                const enRiesgo = fila.promFinal !== null && fila.promFinal < PROMEDIO_MINIMO_APROBAR;

                const nombreClickeable = fila.correo
                    ? `<a href="estudiante.html?correo=${encodeURIComponent(fila.correo)}" target="_blank" class="fw-bold text-decoration-none text-primary" title="Hacer clic para abrir y editar el boletín de este estudiante">${escapeHtmlAdmin(fila.nombre)} 👁️</a>`
                    : escapeHtmlAdmin(fila.nombre);

                filasCuerpo += `<tr class="${enRiesgo ? "table-danger" : (fila.sinCuenta ? "table-warning" : "")}">`;
                filasCuerpo += `<td>${nombreClickeable}${fila.sinCuenta ? ' <span class="badge bg-warning text-dark">sin cuenta</span>' : ""}</td>`;
                fila.celdasApr.forEach((n) => { filasCuerpo += celdaHtml(n); });
                if (apr.length > 0) filasCuerpo += `<td class="text-center fw-bold">${fila.promApr !== null ? fila.promApr.toFixed(1) : "-"}</td>`;
                fila.celdasEje.forEach((n) => { filasCuerpo += celdaHtml(n); });
                if (eje.length > 0) filasCuerpo += `<td class="text-center fw-bold">${fila.promEje !== null ? fila.promEje.toFixed(1) : "-"}</td>`;
                filasCuerpo += `<td class="text-center fw-bold ${enRiesgo ? "text-danger" : ""}">${fila.promFinal !== null ? fila.promFinal.toFixed(1) : "-"}</td>`;
                filasCuerpo += `</tr>`;
            });

            html += `
                <div class="d-flex justify-content-between align-items-center mt-4 mb-2">
                    <h6 class="m-0 font-weight-bold">${escapeHtmlAdmin(materia)}</h6>
                    <span class="small text-muted"><strong>Profesor(a):</strong> ${escapeHtmlAdmin(profesor)}</span>
                </div>
                <div class="table-responsive mb-2">
                    <table class="table table-sm table-bordered align-middle">
                        <thead class="table-light">${filaEncabezado}${filaTemas}</thead>
                        <tbody>${filasCuerpo}</tbody>
                    </table>
                </div>
            `;
        });

        vistaGeneralContenedor.innerHTML = html;
    }

    async function cargarVistaGeneral() {
        const salon = vistaGeneralSalon.value;
        const trimestre = vistaGeneralTrimestre.value;

        if (!salon) {
            alert("Selecciona un salón.");
            return;
        }

        const textoOriginal = btnCargarVistaGeneral.innerHTML;
        btnCargarVistaGeneral.disabled = true;
        btnCargarVistaGeneral.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Cargando...`;
        vistaGeneralContenedor.innerHTML = "";

        try {
            datosVistaGeneral = await construirDatosVistaGeneral(salon, trimestre);
            datosVistaGeneral.salon = salon;
            datosVistaGeneral.trimestre = trimestre;

            vistaGeneralFiltroMateria.innerHTML = `<option value="">Todas las materias</option>` +
                datosVistaGeneral.materias.map((m) => `<option value="${escapeHtmlAdmin(m.materia)}">${escapeHtmlAdmin(m.materia)}</option>`).join("");

            const materiaSeleccionada = vistaGeneralFiltroMateria.value;
            vistaGeneralFiltroMateria.disabled = datosVistaGeneral.materias.length === 0;

            renderVistaGeneralHTML(datosVistaGeneral, salon, trimestre, materiaSeleccionada);

        } catch (error) {
            console.error("❌ Error al cargar la vista general:", error);
            vistaGeneralContenedor.innerHTML = `<p class="text-danger">Error al cargar: ${escapeHtmlAdmin(error.message || String(error))}</p>`;
        } finally {
            btnCargarVistaGeneral.disabled = false;
            btnCargarVistaGeneral.innerHTML = textoOriginal;
        }
    }

    if (btnCargarVistaGeneral) {
        btnCargarVistaGeneral.addEventListener("click", cargarVistaGeneral);
    }

    if (vistaGeneralFiltroMateria) {
        vistaGeneralFiltroMateria.addEventListener("change", () => {
            if (!datosVistaGeneral) return;
            renderVistaGeneralHTML(datosVistaGeneral, datosVistaGeneral.salon, datosVistaGeneral.trimestre, vistaGeneralFiltroMateria.value);
        });
    }

    // =================================================
    // 6) BOTONES DE RECARGA
    // =================================================

    btnRecargarUsuarios.addEventListener("click", cargarUsuarios);
    btnRecargarNotas.addEventListener("click", cargarNotas);

    // =================================================
    // 6.5) GESTIONAR PROFESORES (salón + permiso para
    // agregar estudiantes). Se guarda solo al cambiar
    // cada campo, sin necesidad de un botón "Guardar".
    // =================================================

    const tablaProfesoresAdmin = document.getElementById("tablaProfesoresAdmin");
    const mensajeProfesores = document.getElementById("mensajeProfesores");

    const SALONES_DISPONIBLES = ["8A", "8B", "9A", "9B", "9C"];

    function mostrarMensajeProfesores(texto, tipo) {
        if (!mensajeProfesores) return;
        mensajeProfesores.textContent = texto;
        mensajeProfesores.className = `alert alert-${tipo}`;
        mensajeProfesores.classList.remove("d-none");
        setTimeout(() => mensajeProfesores.classList.add("d-none"), 3000);
    }

    function opcionesSalonProfesor(salonActualDelProfesor) {
        const opciones = ["", ...SALONES_DISPONIBLES];
        // Si el profesor ya tiene un salón que no está en la lista fija,
        // se agrega igual para no perder el dato al mostrarlo.
        if (salonActualDelProfesor && !opciones.includes(salonActualDelProfesor)) {
            opciones.push(salonActualDelProfesor);
        }
        return opciones.map((s) => {
            const seleccionado = s === (salonActualDelProfesor || "") ? "selected" : "";
            const etiqueta = s === "" ? "-- Sin asignar --" : s;
            return `<option value="${escapeHtmlAdmin(s)}" ${seleccionado}>${escapeHtmlAdmin(etiqueta)}</option>`;
        }).join("");
    }

    async function cargarProfesoresAdmin() {
        if (!tablaProfesoresAdmin) return;

        tablaProfesoresAdmin.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-3">Cargando profesores...</td></tr>`;

        const { data: profesores, error } = await supabase
            .from("profesores")
            .select("correo_profesor, nombre_profesor, salon, puede_agregar_estudiantes")
            .order("nombre_profesor", { ascending: true });

        if (error) {
            console.error("❌ Error al cargar profesores:", error);
            tablaProfesoresAdmin.innerHTML = `<tr><td colspan="4" class="text-center text-danger py-3">No se pudieron cargar los profesores.</td></tr>`;
            return;
        }

        if (!profesores || profesores.length === 0) {
            tablaProfesoresAdmin.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-3">Todavía no hay profesores registrados.</td></tr>`;
            return;
        }

        tablaProfesoresAdmin.innerHTML = profesores.map((p) => `
            <tr>
                <td>${escapeHtmlAdmin(p.nombre_profesor || "(sin nombre)")}</td>
                <td class="small">${escapeHtmlAdmin(p.correo_profesor || "-")}</td>
                <td>
                    <select class="form-select form-select-sm profesor-salon-select" data-correo="${escapeHtmlAdmin(p.correo_profesor)}">
                        ${opcionesSalonProfesor(p.salon)}
                    </select>
                </td>
                <td>
                    <div class="form-check form-switch mb-0">
                        <input class="form-check-input profesor-permiso-switch" type="checkbox"
                            role="switch"
                            data-correo="${escapeHtmlAdmin(p.correo_profesor)}"
                            ${p.puede_agregar_estudiantes ? "checked" : ""}>
                    </div>
                </td>
            </tr>
        `).join("");

        // -------- Cambiar salón --------
        tablaProfesoresAdmin.querySelectorAll(".profesor-salon-select").forEach((select) => {
            select.addEventListener("change", async () => {
                const correo = select.dataset.correo;
                const nuevoSalon = select.value || null;

                const { error: errUpdate } = await supabase
                    .from("profesores")
                    .update({ salon: nuevoSalon })
                    .eq("correo_profesor", correo);

                if (errUpdate) {
                    console.error("❌ Error al actualizar salón del profesor:", errUpdate);
                    mostrarMensajeProfesores("No se pudo guardar el salón: " + errUpdate.message, "danger");
                    return;
                }

                mostrarMensajeProfesores(`Salón actualizado para ${correo}.`, "success");
            });
        });

        // -------- Cambiar permiso de agregar estudiantes --------
        tablaProfesoresAdmin.querySelectorAll(".profesor-permiso-switch").forEach((toggle) => {
            toggle.addEventListener("change", async () => {
                const correo = toggle.dataset.correo;
                const nuevoValor = toggle.checked;

                const { error: errUpdate } = await supabase
                    .from("profesores")
                    .update({ puede_agregar_estudiantes: nuevoValor })
                    .eq("correo_profesor", correo);

                if (errUpdate) {
                    console.error("❌ Error al actualizar permiso del profesor:", errUpdate);
                    mostrarMensajeProfesores("No se pudo guardar el permiso: " + errUpdate.message, "danger");
                    // Revertir el switch visualmente si falló el guardado
                    toggle.checked = !nuevoValor;
                    return;
                }

                mostrarMensajeProfesores(
                    nuevoValor
                        ? `✅ ${correo} ahora puede agregar estudiantes.`
                        : `${correo} ya no puede agregar estudiantes.`,
                    "success"
                );
            });
        });
    }

    // Se expone para que el script de navegación del menú (en admin.html)
    // pueda cargar la tabla la primera vez que se abre esta sección.
    window.cargarProfesoresAdmin = cargarProfesoresAdmin;

    // =================================================
    // 7) PREGUNTAS DE SEGURIDAD DE UN ESTUDIANTE
    // =================================================

    const pregSalon = document.getElementById("pregSalon");
    const pregEstudiante = document.getElementById("pregEstudiante");
    const mensajePregSeguridad = document.getElementById("mensajePregSeguridad");

    function mostrarMensajePreg(texto, tipo) {
        mensajePregSeguridad.textContent = texto;
        mensajePregSeguridad.className = `alert alert-${tipo} mt-2 mb-0`;
    }

    if (pregSalon) {
        pregSalon.addEventListener("change", async () => {
            const salon = pregSalon.value;

            pregEstudiante.innerHTML = `<option value="">Cargando...</option>`;
            pregEstudiante.disabled = true;

            const bloqueEnlace = document.getElementById("bloqueEnlaceRecuperacion");
            if (bloqueEnlace) bloqueEnlace.style.display = "none";
            mensajePregSeguridad.className = "alert d-none";

            if (!salon) {
                pregEstudiante.innerHTML = `<option value="">Seleccione primero un salón</option>`;
                return;
            }

            const { data: estudiantesSalon, error } = await supabase
                .from("estudiantes")
                .select("correo, nombre, es_prueba")
                .eq("salon", salon)
                .order("nombre", { ascending: true });

            if (error) {
                console.error("❌ Error al cargar estudiantes:", error);
                pregEstudiante.innerHTML = `<option value="">Error al cargar</option>`;
                return;
            }

            const lista = (estudiantesSalon || []).filter((e) => !e.es_prueba && e.correo);

            if (lista.length === 0) {
                pregEstudiante.innerHTML = `<option value="">No hay estudiantes en este salón</option>`;
                return;
            }

            pregEstudiante.innerHTML =
                `<option value="">Seleccione...</option>` +
                lista.map((e) => `<option value="${e.correo}">${escapeHtmlAdmin(e.nombre || e.correo)}</option>`).join("");

            pregEstudiante.disabled = false;
        });
    }

    if (pregEstudiante) {
        pregEstudiante.addEventListener("change", () => {
            mensajePregSeguridad.className = "alert d-none";

            const bloqueEnlace = document.getElementById("bloqueEnlaceRecuperacion");
            const inputEnlace = document.getElementById("enlaceRecuperacion");
            const btnWhatsapp = document.getElementById("btnEnviarWhatsapp");

            if (pregEstudiante.value) {
                const url = `${window.location.origin}/pages/login.html?recuperarCorreo=${encodeURIComponent(pregEstudiante.value)}`;
                const nombreEst = pregEstudiante.options[pregEstudiante.selectedIndex].text;

                inputEnlace.value = url;

                const mensajeWa = encodeURIComponent(
                    `Hola ${nombreEst}, para poner una contraseña nueva en el sistema de notas, ` +
                    `entrá a este enlace y respondé tus 3 preguntas de seguridad:\n${url}`
                );
                btnWhatsapp.href = `https://wa.me/?text=${mensajeWa}`;

                bloqueEnlace.style.display = "block";
            } else {
                bloqueEnlace.style.display = "none";
            }
        });
    }

    document.getElementById("btnCopiarEnlace")?.addEventListener("click", async () => {
        const inputEnlace = document.getElementById("enlaceRecuperacion");
        if (!inputEnlace.value) return;

        try {
            await navigator.clipboard.writeText(inputEnlace.value);
        } catch (err) {
            inputEnlace.select();
            document.execCommand("copy");
        }

        mostrarMensajePreg("🔗 Enlace copiado al portapapeles.", "success");
    });

    // =================================================
    // 8) ACTIVIDAD DE ESTUDIANTES (VISITAS A LA PLATAFORMA)
    // =================================================

    const visitasSalon = document.getElementById("visitasSalon");
    const btnCargarVisitas = document.getElementById("btnCargarVisitas");
    const tablaVisitas = document.getElementById("tablaVisitas");
    const thSalonVisitas = document.getElementById("thSalonVisitas");

    function formatearDuracion(segundosTotales) {
        const segundos = Math.max(0, Math.round(segundosTotales));
        const horas = Math.floor(segundos / 3600);
        const minutos = Math.floor((segundos % 3600) / 60);
        if (horas > 0) return `${horas}h ${minutos}min`;
        if (minutos > 0) return `${minutos}min`;
        return `${segundos}seg`;
    }

    async function cargarVisitas() {
        const salon = visitasSalon.value;
        const mostrarColumnaSalon = !salon;
        const colspanActual = mostrarColumnaSalon ? 7 : 6;

        if (thSalonVisitas) {
            thSalonVisitas.style.display = mostrarColumnaSalon ? "" : "none";
        }

        const textoOriginal = btnCargarVisitas.innerHTML;
        btnCargarVisitas.disabled = true;
        btnCargarVisitas.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Cargando...`;

        tablaVisitas.innerHTML = `<tr><td colspan="${colspanActual}" class="text-center text-muted py-3">Cargando...</td></tr>`;

        let consultaEstudiantes = supabase
            .from("estudiantes")
            .select("correo, nombre, es_prueba, salon")
            .order("nombre", { ascending: true });

        if (salon) {
            consultaEstudiantes = consultaEstudiantes.eq("salon", salon);
        }

        const { data: estudiantesSalon, error: errEst } = await consultaEstudiantes;

        btnCargarVisitas.disabled = false;
        btnCargarVisitas.innerHTML = textoOriginal;

        if (errEst) {
            console.error("❌ Error al cargar estudiantes:", errEst);
            tablaVisitas.innerHTML = `<tr><td colspan="${colspanActual}" class="text-danger text-center py-3">Error al cargar estudiantes.</td></tr>`;
            return;
        }

        const estudiantesReales = (estudiantesSalon || []).filter((e) => !e.es_prueba && e.correo);

        if (estudiantesReales.length === 0) {
            const mensaje = salon ? "No hay estudiantes en este salón." : "No hay estudiantes registrados.";
            tablaVisitas.innerHTML = `<tr><td colspan="${colspanActual}" class="text-center text-muted py-3">${mensaje}</td></tr>`;
            return;
        }

        const correos = estudiantesReales.map((e) => e.correo);

        const { data: visitas, error: errVis } = await supabase
            .from("visitas")
            .select("correo, inicio, ultima_actividad")
            .in("correo", correos);

        if (errVis) {
            console.error("❌ Error al cargar visitas:", errVis);
            tablaVisitas.innerHTML = `<tr><td colspan="${colspanActual}" class="text-danger text-center py-3">Error al cargar las visitas.</td></tr>`;
            return;
        }

        const resumenPorCorreo = {};

        (visitas || []).forEach((v) => {
            if (!resumenPorCorreo[v.correo]) {
                resumenPorCorreo[v.correo] = {
                    totalVisitas: 0,
                    tiempoTotalSeg: 0,
                    primeraVisita: null,
                    ultimaVisita: null,
                    diasDistintos: new Set()
                };
            }

            const r = resumenPorCorreo[v.correo];
            const inicio = new Date(v.inicio);
            const fin = new Date(v.ultima_actividad || v.inicio);
            const duracionSeg = Math.max(0, (fin - inicio) / 1000);

            r.totalVisitas++;
            r.tiempoTotalSeg += duracionSeg;
            r.diasDistintos.add(inicio.toISOString().slice(0, 10));

            if (!r.primeraVisita || inicio < r.primeraVisita) r.primeraVisita = inicio;
            if (!r.ultimaVisita || fin > r.ultimaVisita) r.ultimaVisita = fin;
        });

        const opcionesFecha = { day: "2-digit", month: "2-digit", year: "numeric" };
        const opcionesFechaHora = { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" };

        const filas = estudiantesReales.map((est) => {
            const r = resumenPorCorreo[est.correo];
            const celdaSalon = mostrarColumnaSalon
                ? `<td class="text-center">${escapeHtmlAdmin(est.salon || "—")}</td>`
                : "";

            if (!r) {
                return `
                    <tr class="table-light">
                        <td>${escapeHtmlAdmin(est.nombre || est.correo)}</td>
                        ${celdaSalon}
                        <td class="text-center">0</td>
                        <td class="text-center">—</td>
                        <td class="text-center">—</td>
                        <td class="text-center">—</td>
                        <td class="text-center text-muted">Nunca entró</td>
                    </tr>
                `;
            }

            return `
                <tr>
                    <td>${escapeHtmlAdmin(est.nombre || est.correo)}</td>
                    ${celdaSalon}
                    <td class="text-center fw-bold">${r.totalVisitas}</td>
                    <td class="text-center">${r.diasDistintos.size}</td>
                    <td class="text-center">${formatearDuracion(r.tiempoTotalSeg)}</td>
                    <td class="text-center">${r.primeraVisita.toLocaleDateString("es-PA", opcionesFecha)}</td>
                    <td class="text-center">${r.ultimaVisita.toLocaleString("es-PA", opcionesFechaHora)}</td>
                </tr>
            `;
        });

        tablaVisitas.innerHTML = filas.join("");
    }

    if (btnCargarVisitas) {
        btnCargarVisitas.addEventListener("click", cargarVisitas);
    }

});
