import { supabase } from "./supabase.js";

document.addEventListener("DOMContentLoaded", async () => {

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
    // 3) CARGAR USUARIOS REGISTRADOS
    // =================================================

    async function cargarUsuarios() {

        const tablaUsuarios = document.getElementById("tablaUsuarios");
        tablaUsuarios.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4">Cargando usuarios...</td></tr>`;

        const { data, error } = await supabase
            .from("usuarios")
            .select("correo, rol, activo, created_at")
            .order("created_at", { ascending: false });

        if (error) {
            console.error("❌ Error al cargar usuarios:", error);
            tablaUsuarios.innerHTML = `<tr><td colspan="4" class="text-center text-danger py-4">Error: ${error.message}</td></tr>`;
            return;
        }

        if (!data || data.length === 0) {
            tablaUsuarios.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4">No hay usuarios registrados.</td></tr>`;
            return;
        }

        tablaUsuarios.innerHTML = "";

        data.forEach((u) => {

            const fila = document.createElement("tr");

            const fecha = u.created_at
                ? new Date(u.created_at).toLocaleString("es-PA")
                : "-";

            fila.innerHTML = `
                <td>${u.correo ?? "-"}</td>
                <td><span class="badge bg-secondary">${u.rol ?? "-"}</span></td>
                <td>${u.activo ? "✅" : "❌"}</td>
                <td>${fecha}</td>
            `;

            tablaUsuarios.appendChild(fila);
        });
    }

    // =================================================
    // 4) CARGAR NOTAS DE TODOS LOS ESTUDIANTES
    // =================================================
    //
    // Se usa select("*") porque el esquema exacto de la
    // tabla "notas" puede variar; las columnas se muestran
    // dinámicamente según lo que devuelva la consulta.

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

        // Construir cabecera dinámicamente a partir de las columnas
        const columnas = Object.keys(data[0]);

        const filaCabecera = document.createElement("tr");
        columnas.forEach((col) => {
            const th = document.createElement("th");
            th.textContent = col;
            filaCabecera.appendChild(th);
        });
        cabeceraNotas.appendChild(filaCabecera);

        // Construir filas
        tablaNotas.innerHTML = "";

        data.forEach((registro) => {
            const fila = document.createElement("tr");
            columnas.forEach((col) => {
                const td = document.createElement("td");
                td.textContent = registro[col] ?? "-";
                fila.appendChild(td);
            });
            tablaNotas.appendChild(fila);
        });
    }

    // =================================================
    // 5) AGREGAR NOTAS POR SECCIÓN (formulario masivo)
    // =================================================
    //
    // Usa exactamente las mismas columnas que ya usa el resto del
    // sistema en la tabla "notas" (correo, materia, tipo, numero,
    // trimestre, etc. -- ver consejero.js) para que las notas que
    // el administrador agregue aquí se vean igual en el panel del
    // consejero(a) y en el boletín del estudiante.

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
    const notasTema = document.getElementById("notasTema");
    const btnCargarGrupo = document.getElementById("btnCargarGrupo");
    const bloqueTablaNotas = document.getElementById("bloqueTablaNotas");
    const tablaNotasGrupo = document.getElementById("tablaNotasGrupo");
    const btnGuardarNotasGrupo = document.getElementById("btnGuardarNotasGrupo");
    const estadoGuardadoNotas = document.getElementById("estadoGuardadoNotas");

    // Estudiantes del salón elegido, y el historial COMPLETO de notas
    // del grupo en la materia/trimestre elegidos (todas las casillas
    // de Apreciación y Ejercicio que ya existan, no solo una).
    let grupoActualNotas = [];
    let historiaPorEstudiante = {}; // claveEstudiante -> { "tipo-numero": {id, nota, tema} }
    let casillasTabla = [];         // [{tipo, numero}] TODAS las columnas a mostrar (historial + la elegida arriba)

    function claveCasilla(tipo, numero) {
        return `${tipo}-${numero}`;
    }

    function etiquetaCasilla(tipo, numero) {
        return `${tipo === "apreciacion" ? "Aprec." : "Ejer."} ${numero}`;
    }

    function claveEstudiante(est) {
        return est.correo ? `correo:${est.correo}` : `id:${est.id}`;
    }

    // Busca si ALGUIEN del grupo ya tiene un "tema" escrito en esa
    // casilla, para mostrarlo como valor inicial del campo (así no
    // se ve vacío si ya se había puesto uno antes).
    function obtenerTemaCasilla(tipo, numero) {
        const clave = claveCasilla(tipo, numero);

        for (const claveEst in historiaPorEstudiante) {
            const nota = historiaPorEstudiante[claveEst][clave];
            if (nota && nota.tema) return nota.tema;
        }

        return "";
    }

    // Actualiza el "tema" de TODAS las notas que ya existan en esa
    // casilla exacta (materia + tipo + número + trimestre) para el
    // grupo cargado en pantalla. Se puede usar en cualquier momento,
    // incluso mucho después de haber metido las notas.
    async function actualizarTemaCasilla(tipo, numero, nuevoTema) {

        const materia = notasMateria.value.trim();
        const trimestre = notasTrimestre.value;
        const valorGuardar = nuevoTema || null;

        const correosDelGrupo = grupoActualNotas.map((e) => e.correo).filter(Boolean);
        const idsSinCuenta = grupoActualNotas.filter((e) => !e.correo).map((e) => e.id);

        let huboError = false;

        if (correosDelGrupo.length > 0) {
            const { error } = await supabase
                .from("notas")
                .update({ tema: valorGuardar })
                .eq("materia", materia)
                .eq("trimestre", trimestre)
                .eq("tipo", tipo)
                .eq("numero", numero)
                .in("correo", correosDelGrupo);

            if (error) {
                console.error("❌ Error al actualizar tema de la casilla:", error);
                huboError = true;
            }
        }

        if (idsSinCuenta.length > 0) {
            const { error } = await supabase
                .from("notas")
                .update({ tema: valorGuardar })
                .eq("materia", materia)
                .eq("trimestre", trimestre)
                .eq("tipo", tipo)
                .eq("numero", numero)
                .in("estudiante_id", idsSinCuenta);

            if (error) {
                console.error("❌ Error al actualizar tema de la casilla (sin cuenta):", error);
                huboError = true;
            }
        }

        // Se refleja también en la memoria local, para que el reporte
        // en PDF/JPG y el propio campo queden consistentes sin recargar.
        const clave = claveCasilla(tipo, numero);
        Object.keys(historiaPorEstudiante).forEach((claveEst) => {
            if (historiaPorEstudiante[claveEst][clave]) {
                historiaPorEstudiante[claveEst][clave].tema = valorGuardar;
            }
        });

        estadoGuardadoNotas.textContent = huboError
            ? `⚠️ No se pudo actualizar el tema de ${etiquetaCasilla(tipo, numero)}.`
            : `✅ Tema de "${etiquetaCasilla(tipo, numero)}" actualizado.`;
        estadoGuardadoNotas.className = huboError ? "small text-danger" : "small text-success";
    }

    // Precargar el trimestre activo como valor por defecto
    (async function precargarTrimestreActivo() {
        const { data: cfg } = await supabase
            .from("configuracion")
            .select("trimestre_activo")
            .maybeSingle();

        if (cfg?.trimestre_activo && notasTrimestre) {
            notasTrimestre.value = cfg.trimestre_activo;
        }
    })();

    // Lista fija de materias del colegio (la misma que usa
    // estudiante.html). En 8°A la materia "Contabilidad" no se da:
    // en su lugar se da "Informática".
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

        // Se ordena en español (localeCompare con "es") para que los
        // acentos se acomoden bien (ej. "Educación" antes de "Español").
        return [...lista].sort((a, b) => a.localeCompare(b, "es"));
    }

    // Profesor(a) responsable de cada materia, para que aparezca en el
    // encabezado del reporte impreso. "Historia" e "Informática" no se
    // incluyeron en la lista que se dio, así que salen como "(sin
    // asignar)" hasta que se indique quién las da.
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

    // Nota mínima para aprobar en esta escala (0 a 5). Se usa para
    // resaltar en rojo, en el reporte, a los estudiantes en riesgo.
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

    // =================================================
    // PROMEDIOS EN VIVO (misma fórmula que usa el boletín en PDF
    // de consejero.js): promedio de Apreciación, de Ejercicio, y
    // el promedio final es el promedio de esos dos promedios (si
    // solo hay uno de los dos tipos, el final es igual a ese).
    // =================================================
    function recalcularPromedios() {
        tablaNotasGrupo.querySelectorAll("tr").forEach((tr) => {

            const inputsFila = tr.querySelectorAll(".input-nota-grupo");
            if (inputsFila.length === 0) return; // fila de "sin estudiantes"

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
            if (celdaFinal) celdaFinal.textContent = promFinal !== null ? promFinal.toFixed(1) : "–";
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

        // -------- Encabezado: # | Estudiante | ...todas las casillas... | Estado --------
        // La casilla que se eligió arriba (Tipo + N°) se resalta en azul
        // para ubicarla rápido, pero TODAS las columnas son editables.
        const claveSeleccionada = claveCasilla(notasTipo.value, parseInt(notasNumero.value, 10));

        let htmlCabecera = `<th style="width:45px;">#</th><th>Estudiante</th>`;

        casillasTabla.forEach((c) => {
            const esSeleccionada = claveCasilla(c.tipo, c.numero) === claveSeleccionada;
            const claseTh = esSeleccionada ? "table-primary text-primary" : "text-muted";
            htmlCabecera += `<th class="text-center small ${claseTh}" style="width:80px;">${etiquetaCasilla(c.tipo, c.numero)}</th>`;
        });

        htmlCabecera += `<th class="text-center small fw-bold" style="width:85px;">Prom. Aprec.</th>`;
        htmlCabecera += `<th class="text-center small fw-bold" style="width:85px;">Prom. Ejer.</th>`;
        htmlCabecera += `<th class="text-center small fw-bold table-success" style="width:90px;">Prom. Final</th>`;
        htmlCabecera += `<th style="width:160px;">Estado</th>`;
        cabecera.innerHTML = htmlCabecera;

        // -------- Segunda fila del encabezado: tema/descripción de cada casilla --------
        // Se puede escribir o editar en cualquier momento (incluso después
        // de ya haber metido las notas); al salir del campo se guarda solo.
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
                        value="${escapeHtmlAdmin(temaActual)}"
                        placeholder="Ej: Prueba corta"
                        style="font-size:11px; font-weight:normal;"
                    >
                </th>
            `;
        });

        htmlTemas += `<th></th><th></th><th></th><th></th>`; // Prom.Aprec / Prom.Ejer / Prom.Final / Estado
        cabeceraTemas.innerHTML = htmlTemas;

        // -------- Filas --------
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

            const badge = sinCuenta
                ? `<span class="badge bg-warning text-dark">Sin cuenta · provisional</span>`
                : `<span class="badge bg-light text-muted border">Con cuenta</span>`;

            return `
                <tr class="${sinCuenta ? "table-warning" : ""}">
                    <td>${i + 1}</td>
                    <td>${escapeHtmlAdmin(est.nombre)}</td>
                    ${columnasNotas}
                    <td class="celda-prom-apr text-center fw-bold">–</td>
                    <td class="celda-prom-eje text-center fw-bold">–</td>
                    <td class="celda-prom-final text-center fw-bold table-success bg-opacity-25">–</td>
                    <td>${badge}</td>
                </tr>
            `;
        }).join("");

        recalcularPromedios();

        // Al salir de un campo de "tema de la casilla", se guarda solo.
        tablaNotasGrupo.parentElement.querySelectorAll(".input-tema-columna").forEach((input) => {
            input.addEventListener("blur", () => {
                actualizarTemaCasilla(input.dataset.tipo, parseInt(input.dataset.numero, 10), input.value.trim());
            });
        });

        // Al presionar Enter en una casilla, se pasa el foco a la
        // MISMA columna, una fila más abajo (para llenar toda una
        // columna de corrido, ej. todas las notas de "Ejer. 1").
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

            // 1) Estudiantes del salón elegido (se pide también "id"
            // porque a los que no tienen cuenta se les va a guardar
            // la nota usando notas.estudiante_id en vez de correo).
            const { data: estudiantesSalon, error: errEst } = await supabase
                .from("estudiantes")
                .select("id, codigo, nombre, correo")
                .eq("salon", salon)
                .order("nombre", { ascending: true });

            if (errEst) {
                console.error("❌ Error al cargar estudiantes del salón:", errEst);
                alert("Error al cargar estudiantes: " + errEst.message);
                btnCargarGrupo.disabled = false;
                btnCargarGrupo.innerHTML = textoOriginalBoton;
                return;
            }

            grupoActualNotas = estudiantesSalon || [];

            // 2) Historial COMPLETO de notas del grupo en esta materia
            // y trimestre (todas las casillas, no solo la seleccionada),
            // para mostrarlas como columnas de referencia.
            //
            // Se busca por DOS vías:
            // - Por correo: estudiantes que ya tienen cuenta.
            // - Por estudiante_id: estudiantes SIN cuenta todavía, cuyas
            //   notas se guardaron "provisionalmente" ligadas a su fila
            //   en la tabla "estudiantes" en vez de a un correo.
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

            // Columnas a mostrar = todas las casillas que el grupo ya
            // tiene MÁS la que se eligió arriba (Tipo + N°), aunque
            // todavía nadie tenga nota ahí (para poder empezar a
            // llenarla). Todas quedan editables.
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
    // GUARDAR NOTAS (manual o automático)
    // =================================================
    //
    // esAutomatico = true: lo llama el autoguardado cada 30 segundos.
    // Solo guarda las casillas que CAMBIARON desde el último guardado
    // (usando data-ultimo-valor-guardado), no interrumpe al admin con
    // alerts, y NO recarga toda la tabla (para no perder el foco de
    // lo que esté escribiendo en ese momento).
    //
    // esAutomatico = false: lo llama el botón "Guardar todas las
    // notas". Guarda todo lo que tenga valor, muestra progreso, y al
    // terminar recarga la tabla y la lista general de notas.
    async function guardarNotasGrupo(esAutomatico = false) {

        const materia = notasMateria.value.trim();
        const trimestre = notasTrimestre.value;
        const tema = notasTema.value.trim() || null;
        const hoy = new Date().toISOString().slice(0, 10);

        const inputs = tablaNotasGrupo.querySelectorAll(".input-nota-grupo");
        const aGuardar = [];

        inputs.forEach((input) => {
            const valor = input.value.trim();
            if (valor === "") return; // en blanco = no se toca

            const notaNum = parseFloat(valor);
            if (isNaN(notaNum)) return;

            // En modo automático, si el valor no cambió desde el
            // último guardado, no hay nada que hacer con esta casilla.
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

                // Ya existía una nota en esa casilla: se actualiza en vez de duplicarla
                // (esto es lo que permite corregir un error, ej. si se
                // escribió una nota en la casilla equivocada).
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

                // No existía: se crea una nueva, usando el tipo/número
                // propio de la columna donde se escribió (no el del
                // selector de arriba, porque ahora cualquier columna
                // se puede llenar). Se pide de vuelta el "id" para
                // guardarlo en el input: así, si se vuelve a guardar
                // esta misma casilla (ej. en el próximo autoguardado),
                // se actualiza en vez de crear una fila duplicada.
                const { data: insertado, error } = await supabase
                    .from("notas")
                    .insert([{
                        correo: item.correo,
                        estudiante_id: item.estudianteId,
                        materia,
                        tipo: item.tipo,
                        numero: item.numero,
                        tema,
                        actividad: tema || `${item.tipo === "apreciacion" ? "Apreciación" : "Ejercicio"} ${item.numero}`,
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
            estadoGuardadoNotas.textContent = `⚠️ ${exitosas} guardada(s), ${fallidas} con error (revisa la consola).`;
            estadoGuardadoNotas.className = "small text-danger";
        }

        // Solo se recarga toda la tabla en un guardado MANUAL. En el
        // autoguardado NO se recarga, para no interrumpir al admin
        // mientras sigue escribiendo (perdería el foco/cursor cada
        // 30 segundos si se recargara).
        if (!esAutomatico) {
            btnCargarGrupo.click();
            cargarNotas();
        }
    }

    if (btnGuardarNotasGrupo) {
        btnGuardarNotasGrupo.addEventListener("click", () => guardarNotasGrupo(false));
    }

    // Autoguardado cada 30 segundos, solo si hay un grupo cargado
    // en pantalla (para no intentar guardar cuando no hay nada).
    setInterval(() => {
        if (bloqueTablaNotas && bloqueTablaNotas.style.display !== "none") {
            guardarNotasGrupo(true);
        }
    }, 30000);

    // =================================================
    // IMPRIMIR / EXPORTAR REPORTE DE LA MATERIA
    // =================================================
    //
    // Lee directamente la tabla que está en pantalla (con los valores
    // actuales de cada casilla y los promedios ya calculados por
    // recalcularPromedios), así el reporte siempre refleja lo que el
    // administrador está viendo, incluso si algo no se ha guardado aún.

    function recolectarDatosTablaActual() {
        const filas = [];

        tablaNotasGrupo.querySelectorAll("tr").forEach((tr) => {
            const inputs = tr.querySelectorAll(".input-nota-grupo");
            if (inputs.length === 0) return; // fila de "sin estudiantes"

            const nombreEst = tr.children[1]?.textContent?.trim() || "";
            const valoresPorCasilla = {};

            inputs.forEach((input) => {
                const clave = `${input.dataset.tipo}-${input.dataset.numero}`;
                valoresPorCasilla[clave] = input.value.trim();
            });

            filas.push({
                nombre: nombreEst,
                valoresPorCasilla,
                promApr: tr.querySelector(".celda-prom-apr")?.textContent?.trim() || "–",
                promEje: tr.querySelector(".celda-prom-eje")?.textContent?.trim() || "–",
                promFinal: tr.querySelector(".celda-prom-final")?.textContent?.trim() || "–",
                sinCuenta: tr.classList.contains("table-warning")
            });
        });

        return filas;
    }

    // Datos comunes que necesitan tanto el PDF como el JPG
    function prepararReporte() {
        const materia = notasMateria.value;
        const salonTexto = ETIQUETAS_SALON[notasSalon.value] || notasSalon.value;
        const trimestre = notasTrimestre.value;
        const profesor = MATERIA_A_PROFESOR[materia] || "(sin asignar)";

        const fechaImpresion = new Date().toLocaleString("es-PA", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });

        const columnasApr = casillasTabla
            .filter((c) => c.tipo === "apreciacion")
            .sort((a, b) => a.numero - b.numero);

        const columnasEje = casillasTabla
            .filter((c) => c.tipo === "ejercicio")
            .sort((a, b) => a.numero - b.numero);

        const filas = recolectarDatosTablaActual();

        const enRiesgo = filas
            .filter((f) => {
                const n = parseFloat(f.promFinal);
                return !isNaN(n) && n < PROMEDIO_MINIMO_APROBAR;
            })
            .map((f) => f.nombre);

        const textoAnalisis = enRiesgo.length === 0
            ? "Todos los estudiantes tienen un promedio final de 3.0 o más en esta materia."
            : `${enRiesgo.length} estudiante(s) tienen un promedio por debajo de 3.0 y necesitan apoyo: ${enRiesgo.join(", ")}.`;

        return { materia, salonTexto, trimestre, profesor, fechaImpresion, columnasApr, columnasEje, filas, enRiesgo, textoAnalisis };
    }

    function validarReporteListo() {
        if (grupoActualNotas.length === 0) {
            alert("Primero elige salón y materia, y presiona \"Cargar estudiantes del salón\".");
            return false;
        }
        if (!notasMateria.value) {
            alert("Selecciona una materia.");
            return false;
        }
        return true;
    }

    // -------- PDF (jsPDF + autoTable) --------
    function generarPDFMateria() {
        if (!validarReporteListo()) return;

        const { materia, salonTexto, trimestre, profesor, fechaImpresion, columnasApr, columnasEje, filas, textoAnalisis } = prepararReporte();

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: columnasApr.length + columnasEje.length > 6 ? "landscape" : "portrait" });

        doc.setFont(undefined, "bold");
        doc.setFontSize(16);
        doc.text("CONTROL DE NOTAS", 148, 15, { align: "center" });
        doc.setFontSize(13);
        doc.text("C.E.B.G. EL JIRAL", 148, 22, { align: "center" });

        doc.setFont(undefined, "normal");
        doc.setFontSize(10);
        doc.text(`Materia: ${materia}`, 14, 32);
        doc.text(`Profesor(a): ${profesor}`, 14, 38);
        doc.text(`Salón: ${salonTexto}`, 200, 32);
        doc.text(`Trimestre: ${trimestre}`, 200, 38);

        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text(`Fecha de impresión: ${fechaImpresion}`, 14, 44);
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);

        const filaTitulos = [
            "#", "Estudiante",
            ...columnasApr.map((c) => `Aprec.${c.numero}`), "Prom.Aprec.",
            ...columnasEje.map((c) => `Ejer.${c.numero}`), "Prom.Ejer.",
            "Prom.Final"
        ];

        // Segunda fila del encabezado: el tema/descripción de cada
        // casilla (lo que se escribió en "Tema de cada casilla" en
        // pantalla). Las columnas que no son casillas van en blanco.
        const filaTemas = [
            "", "Tema:",
            ...columnasApr.map((c) => obtenerTemaCasilla(c.tipo, c.numero) || "-"),
            "",
            ...columnasEje.map((c) => obtenerTemaCasilla(c.tipo, c.numero) || "-"),
            "",
            ""
        ];

        const head = [filaTitulos, filaTemas];

        const body = filas.map((f, i) => {
            const row = [i + 1, f.nombre];
            columnasApr.forEach((c) => row.push(f.valoresPorCasilla[`apreciacion-${c.numero}`] || "-"));
            row.push(f.promApr);
            columnasEje.forEach((c) => row.push(f.valoresPorCasilla[`ejercicio-${c.numero}`] || "-"));
            row.push(f.promEje);
            row.push(f.promFinal);
            return row;
        });

        const indiceColumnaFinal = filaTitulos.length - 1;
        const idxPromApr = 2 + columnasApr.length;
        const idxPromEje = idxPromApr + 1 + columnasEje.length;
        const idxPromFinal = idxPromEje + 1; // = indiceColumnaFinal

        doc.autoTable({
            head,
            body,
            startY: 50,
            styles: { fontSize: 8, halign: "center", lineColor: [180, 180, 180], lineWidth: 0.1 },
            headStyles: { fillColor: [31, 78, 121], textColor: 255, fontStyle: "bold" },
            columnStyles: { 1: { halign: "left", fontStyle: "bold" } },
            alternateRowStyles: { fillColor: [246, 248, 251] },
            didParseCell: (data) => {

                const col = data.column.index;
                const esColumnaPromedio = col === idxPromApr || col === idxPromEje || col === idxPromFinal;

                // Fila 0 del encabezado = títulos (Aprec.1, Ejer.1...)
                // Fila 1 del encabezado = temas de cada casilla (más chica y en cursiva)
                if (data.section === "head" && data.row.index === 1) {
                    data.cell.styles.fontStyle = "italic";
                    data.cell.styles.fontSize = 6.5;
                    data.cell.styles.fillColor = [255, 255, 255];
                    data.cell.styles.textColor = [90, 90, 90];
                    data.cell.styles.lineColor = [200, 200, 200];
                    return;
                }

                if (esColumnaPromedio) {
                    data.cell.styles.fontStyle = "bold";
                }

                if (data.section === "head" && data.row.index === 0 && esColumnaPromedio) {
                    data.cell.styles.fillColor = [17, 53, 84];
                }

                if (data.section === "body") {

                    const finalNum = parseFloat(body[data.row.index][indiceColumnaFinal]);
                    const enRiesgo = !isNaN(finalNum) && finalNum < PROMEDIO_MINIMO_APROBAR;

                    if (enRiesgo) {
                        data.cell.styles.textColor = [200, 3, 17];
                    }

                    if (esColumnaPromedio) {
                        if (col === idxPromFinal && enRiesgo) {
                            data.cell.styles.fillColor = [253, 226, 226];
                        } else {
                            data.cell.styles.fillColor = col === idxPromFinal ? [227, 247, 227] : [238, 242, 255];
                        }
                    }
                }
            }
        });

        let y = doc.lastAutoTable.finalY + 10;

        doc.setFont(undefined, "bold");
        doc.setFontSize(11);
        doc.text("Análisis:", 14, y);
        y += 6;

        doc.setFont(undefined, "normal");
        doc.setFontSize(9);
        const lineas = doc.splitTextToSize(textoAnalisis, 260);
        doc.text(lineas, 14, y);

        const nombreArchivo = `Notas_${materia}_${salonTexto}_${trimestre}`.replace(/[\s°]+/g, "_");
        doc.save(`${nombreArchivo}.pdf`);
    }

    // -------- JPG (html2canvas sobre un reporte armado aparte) --------
    function construirReporteDOM(datos) {
        const { materia, salonTexto, trimestre, profesor, fechaImpresion, columnasApr, columnasEje, filas, textoAnalisis } = datos;

        const cont = document.createElement("div");
        cont.style.cssText = "position:fixed; left:-9999px; top:0; width:1100px; background:#fff; padding:26px; font-family:Arial, Helvetica, sans-serif; color:#111;";

        let filasHtml = "";

        filas.forEach((f, i) => {
            const finalNum = parseFloat(f.promFinal);
            const riesgo = !isNaN(finalNum) && finalNum < PROMEDIO_MINIMO_APROBAR;

            let celdas = `
                <td style="padding:5px 7px; border:1px solid #ccc;">${i + 1}</td>
                <td style="padding:5px 7px; border:1px solid #ccc; text-align:left; font-weight:bold;">${escapeHtmlAdmin(f.nombre)}</td>
            `;

            columnasApr.forEach((c) => {
                celdas += `<td style="padding:5px 7px; border:1px solid #ccc; text-align:center;">${escapeHtmlAdmin(f.valoresPorCasilla[`apreciacion-${c.numero}`] || "-")}</td>`;
            });
            celdas += `<td style="padding:5px 7px; border:1px solid #ccc; text-align:center; font-weight:bold; background:#eef2ff;">${escapeHtmlAdmin(f.promApr)}</td>`;

            columnasEje.forEach((c) => {
                celdas += `<td style="padding:5px 7px; border:1px solid #ccc; text-align:center;">${escapeHtmlAdmin(f.valoresPorCasilla[`ejercicio-${c.numero}`] || "-")}</td>`;
            });
            celdas += `<td style="padding:5px 7px; border:1px solid #ccc; text-align:center; font-weight:bold; background:#eef2ff;">${escapeHtmlAdmin(f.promEje)}</td>`;

            celdas += `<td style="padding:5px 7px; border:1px solid #ccc; text-align:center; font-weight:bold; background:${riesgo ? "#fde2e2" : "#e3f7e3"};">${escapeHtmlAdmin(f.promFinal)}</td>`;

            filasHtml += `<tr style="${riesgo ? "color:#c00311;" : ""}">${celdas}</tr>`;
        });

        const columnasEncabezado = [
            "#", "Estudiante",
            ...columnasApr.map((c) => `Aprec.${c.numero}`), "Prom.Aprec.",
            ...columnasEje.map((c) => `Ejer.${c.numero}`), "Prom.Ejer.",
            "Prom.Final"
        ].map((t) => `<th style="padding:6px 7px; border:1px solid #999; background:#1f4e79; color:#fff; font-size:12px;">${t}</th>`).join("");

        // Segunda fila del encabezado: el tema/descripción de cada
        // casilla, más chica y en cursiva debajo del título.
        let filaTemasHtml = `<th style="border:1px solid #ccc;"></th><th style="border:1px solid #ccc; font-size:10px; font-weight:normal; color:#666;">Tema:</th>`;

        columnasApr.forEach((c) => {
            const tema = obtenerTemaCasilla(c.tipo, c.numero) || "-";
            filaTemasHtml += `<th style="border:1px solid #ccc; font-size:10px; font-weight:normal; font-style:italic; color:#666;">${escapeHtmlAdmin(tema)}</th>`;
        });
        filaTemasHtml += `<th style="border:1px solid #ccc;"></th>`;

        columnasEje.forEach((c) => {
            const tema = obtenerTemaCasilla(c.tipo, c.numero) || "-";
            filaTemasHtml += `<th style="border:1px solid #ccc; font-size:10px; font-weight:normal; font-style:italic; color:#666;">${escapeHtmlAdmin(tema)}</th>`;
        });
        filaTemasHtml += `<th style="border:1px solid #ccc;"></th><th style="border:1px solid #ccc;"></th>`;

        cont.innerHTML = `
            <div style="text-align:center; margin-bottom:16px;">
                <h2 style="margin:0; font-size:22px; letter-spacing:1px;">CONTROL DE NOTAS</h2>
                <h3 style="margin:4px 0 0; font-size:16px; color:#1f4e79;">C.E.B.G. EL JIRAL</h3>
                <p style="margin:4px 0 0; font-size:11px; color:#777;">Fecha de impresión: ${escapeHtmlAdmin(fechaImpresion)}</p>
            </div>
            <table style="width:100%; margin-bottom:16px; font-size:13px; border-collapse:collapse;">
                <tr>
                    <td style="padding:3px 0;"><strong>Materia:</strong> ${escapeHtmlAdmin(materia)}</td>
                    <td style="padding:3px 0;"><strong>Profesor(a):</strong> ${escapeHtmlAdmin(profesor)}</td>
                </tr>
                <tr>
                    <td style="padding:3px 0;"><strong>Salón:</strong> ${escapeHtmlAdmin(salonTexto)}</td>
                    <td style="padding:3px 0;"><strong>Trimestre:</strong> ${escapeHtmlAdmin(trimestre)}</td>
                </tr>
            </table>
            <table style="width:100%; border-collapse:collapse; font-size:12px;">
                <thead>
                    <tr>${columnasEncabezado}</tr>
                    <tr>${filaTemasHtml}</tr>
                </thead>
                <tbody>${filasHtml}</tbody>
            </table>
            <div style="margin-top:18px; padding:12px; border:1px solid #ccc; background:#f8f9fa; font-size:13px;">
                <strong>Análisis:</strong><br>${escapeHtmlAdmin(textoAnalisis)}
            </div>
        `;

        return cont;
    }

    async function generarJPGMateria() {
        if (!validarReporteListo()) return;

        const datos = prepararReporte();
        const cont = construirReporteDOM(datos);
        document.body.appendChild(cont);

        try {
            const canvas = await html2canvas(cont, { scale: 2, backgroundColor: "#ffffff" });
            const nombreArchivo = `Notas_${datos.materia}_${datos.salonTexto}_${datos.trimestre}`.replace(/[\s°]+/g, "_");

            const enlace = document.createElement("a");
            enlace.download = `${nombreArchivo}.jpg`;
            enlace.href = canvas.toDataURL("image/jpeg", 0.95);
            enlace.click();
        } catch (err) {
            console.error("❌ Error al generar la imagen:", err);
            alert("No se pudo generar la imagen. Revisa la consola.");
        } finally {
            document.body.removeChild(cont);
        }
    }

    const btnImprimirPDF = document.getElementById("btnImprimirPDF");
    const btnDescargarJPG = document.getElementById("btnDescargarJPG");

    if (btnImprimirPDF) btnImprimirPDF.addEventListener("click", generarPDFMateria);
    if (btnDescargarJPG) btnDescargarJPG.addEventListener("click", generarJPGMateria);

    // =================================================
    // 6) BOTONES DE RECARGA
    // =================================================

    btnRecargarUsuarios.addEventListener("click", cargarUsuarios);
    btnRecargarNotas.addEventListener("click", cargarNotas);

    // Carga inicial
    cargarUsuarios();
    cargarNotas();

});