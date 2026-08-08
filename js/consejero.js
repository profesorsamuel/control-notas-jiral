// =====================================================
// consejero.js
// Panel de SEGUIMIENTO para el consejero.
// Muestra qué estudiantes van al día y a cuáles les faltan
// casillas frente al resto del grupo, solo para el trimestre
// activo. Además permite marcar una casilla vacía como
// "Falta intencional" (el estudiante decidió no presentarla),
// lo cual cuenta como 0.0 en el promedio pero se distingue
// visualmente de una nota normal.
// =====================================================

import { supabase } from "./supabase.js";
import { pintarCambiarPanel } from "./roles.js";

document.addEventListener("DOMContentLoaded", async () => {

    pintarCambiarPanel("consejero");
    const totalEstudiantesEl = document.getElementById("totalEstudiantes");
    const totalRegistradosEl = document.getElementById("totalRegistrados");
    const totalNotasEl = document.getElementById("totalNotas");
    const trimestreLabelEl = document.getElementById("trimestreLabel");
    const tablaResumen = document.getElementById("tablaResumen");
    const btnSalir = document.getElementById("btnSalir");

    const modalDetalle = new bootstrap.Modal(document.getElementById("modalDetalle"));
    const modalDetalleTitulo = document.getElementById("modalDetalleTitulo");
    const modalDetalleContenido = document.getElementById("modalDetalleContenido");

    const escapeHtml = (str) => {
        return String(str ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    };

    // =====================================================
    // VERIFICAR SESIÓN ACTIVA
    // Si alguien entra a esta página sin haber iniciado sesión
    // (por ejemplo escribiendo la URL directamente), las consultas
    // a Supabase se harían como usuario anónimo y fallarían con
    // "permission denied". Por eso se valida la sesión primero.
    // =====================================================

    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
        alert("Debes iniciar sesión para ver el panel del consejero.");
        window.location.href = "login.html";
        return;
    }

    // =====================================================
    // ¿A QUÉ SALÓN PERTENECE ESTE CONSEJERO(A)?
    // Se busca en la tabla "consejeros" usando el correo con el
    // que inició sesión. Si no aparece ahí, no tiene un salón
    // asignado y no debe ver datos de ningún estudiante.
    //
    // La búsqueda es tolerante a espacios accidentales y a
    // diferencias de mayúsculas/minúsculas, tanto en el correo
    // como en el salón, y además valida que la cuenta tenga
    // rol "consejero".
    // =====================================================

    const correoSesion = (user.email || "").trim().toLowerCase();

    console.log("🔎 Buscando consejero con correo:", correoSesion);

    const { data: consejerosData, error: errConsejero } = await supabase
        .from("consejeros")
        .select("salon, nombre, correo, rol");

    console.log("📋 Consejeros encontrados en la tabla:", consejerosData, "Error:", errConsejero);

    let consejeroInfo = null;

    if (!errConsejero && Array.isArray(consejerosData)) {
        consejeroInfo = consejerosData.find((c) => {
            const correoBD = (c.correo || "").trim().toLowerCase();
            return correoBD === correoSesion;
        }) || null;
    }

    if (errConsejero || !consejeroInfo) {
        alert("Esta cuenta no tiene un salón asignado. Contacta al administrador del sistema.");
        window.location.href = "login.html";
        return;
    }

    if (consejeroInfo.rol && consejeroInfo.rol.trim().toLowerCase() !== "consejero") {
        console.warn("⚠️ La cuenta existe en 'consejeros' pero su rol no es 'consejero':", consejeroInfo.rol);
        alert("Esta cuenta no tiene permiso de consejero(a). Contacta al administrador del sistema.");
        window.location.href = "login.html";
        return;
    }

    // Normaliza el salón (quita espacios extra y pone la letra en mayúscula,
    // p. ej. " 9c " o "9 c" terminan siendo "9C") para que coincida sin
    // problemas con lo que tengan guardado los estudiantes.
    const salonActual = (consejeroInfo.salon || "").trim().toUpperCase();

    console.log("✅ Consejero encontrado:", consejeroInfo, "| Salón normalizado:", salonActual);

    // Encabezado y bienvenida dinámicos (ya no dicen "9C" fijo)
    const navbarSalonEl = document.getElementById("navbarSalon");
    if (navbarSalonEl) {
        navbarSalonEl.textContent = `Consejería · Salón ${salonActual}`;
    }

    const navbarProfesorNombreEl = document.getElementById("navbarProfesorNombre");
    if (navbarProfesorNombreEl) {
        navbarProfesorNombreEl.textContent = consejeroInfo.nombre || "Consejero(a)";
    }

    const bienvenidaEl = document.getElementById("bienvenidaConsejero");
    if (bienvenidaEl) {
        bienvenidaEl.textContent = `Bienvenido(a), ${consejeroInfo.nombre || "consejero(a)"}`;
    }

    // =====================================================
    // BOTÓN "REGRESAR" DE LA BARRA SUPERIOR
    // Vuelve a la página anterior (por ejemplo, el selector de
    // panel si esta cuenta también es profesor y/o administrador).
    // Si no hay una página anterior en el historial, cae de
    // vuelta al inicio de sesión.
    // =====================================================

    const btnVolver = document.getElementById("btnVolver");
    if (btnVolver) {
        btnVolver.addEventListener("click", () => {
            if (window.history.length > 1) {
                window.history.back();
            } else {
                window.location.href = "login.html";
            }
        });
    }

    // =====================================================
    // CONTROL DE CONSULTAS DE NOTAS (quién ha revisado y si
    // descargó el PDF, usando "Ver mis notas" con su cédula)
    // =====================================================

    const btnVerConsultas = document.getElementById("btnVerConsultas");
    const bloqueConsultas = document.getElementById("bloqueConsultas");
    const tablaConsultas = document.getElementById("tablaConsultas");
    const statTotalConsultas = document.getElementById("statTotalConsultas");
    const statEstudiantesDistintos = document.getElementById("statEstudiantesDistintos");
    const statConPdf = document.getElementById("statConPdf");
    const statSinConsultar = document.getElementById("statSinConsultar");

    function formatearFecha(iso) {
        if (!iso) return "-";
        const d = new Date(iso);
        return d.toLocaleString("es-PA", {
            day: "2-digit", month: "2-digit", year: "numeric",
            hour: "2-digit", minute: "2-digit"
        });
    }

    let consultasYaCargadas = false;

    async function cargarConsultas() {
        tablaConsultas.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-3">Cargando...</td></tr>`;

        const { data, error } = await supabase.rpc("obtener_consultas_por_salon", { p_salon: salonActual });

        if (error) {
            console.error("❌ Error al cargar consultas:", error);
            tablaConsultas.innerHTML = `<tr><td colspan="4" class="text-center text-danger py-3">No se pudo cargar la información.</td></tr>`;
            return;
        }

        const consultas = data || [];

        // -------- Estadísticas resumidas --------
        const nombresQueConsultaron = new Set(
            consultas.filter((c) => c.encontrado && c.nombre).map((c) => c.nombre)
        );
        const totalConPdf = consultas.filter((c) => c.pdf_descargado).length;

        // Cuántos del salón NUNCA han consultado (comparando contra la
        // lista de estudiantes ya cargada en resumenEstudiantes)
        const nombresDelSalon = new Set(
            (resumenEstudiantes || []).map((e) => (e.nombre || "").trim())
        );
        let sinConsultar = 0;
        nombresDelSalon.forEach((n) => {
            if (!nombresQueConsultaron.has(n)) sinConsultar++;
        });

        statTotalConsultas.textContent = consultas.length;
        statEstudiantesDistintos.textContent = nombresQueConsultaron.size;
        statConPdf.textContent = totalConPdf;
        statSinConsultar.textContent = sinConsultar;

        // -------- Tabla de consultas --------
        if (consultas.length === 0) {
            tablaConsultas.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-3">Todavía no hay consultas registradas para este salón.</td></tr>`;
            return;
        }

        tablaConsultas.innerHTML = consultas.map((c) => `
            <tr>
                <td>${escapeHtml(c.nombre || "(cédula no encontrada)")}</td>
                <td class="text-center">
                    ${c.encontrado
                        ? `<span class="badge bg-success">Sí</span>`
                        : `<span class="badge bg-secondary">No</span>`}
                </td>
                <td class="text-center">
                    ${c.pdf_descargado
                        ? `<span class="badge bg-primary">Sí</span>`
                        : `<span class="badge bg-light text-muted border">No</span>`}
                </td>
                <td>${formatearFecha(c.creado_en)}</td>
            </tr>
        `).join("");
    }

    if (btnVerConsultas) {
        btnVerConsultas.addEventListener("click", async () => {
            const abierto = bloqueConsultas.style.display !== "none";

            if (abierto) {
                bloqueConsultas.style.display = "none";
                btnVerConsultas.innerHTML = `<i class="fa-solid fa-chart-simple me-1"></i> Ver estadísticas`;
                return;
            }

            bloqueConsultas.style.display = "block";
            btnVerConsultas.innerHTML = `<i class="fa-solid fa-chevron-up me-1"></i> Ocultar estadísticas`;

            if (!consultasYaCargadas) {
                consultasYaCargadas = true;
                await cargarConsultas();
            }
        });
    }

    // =====================================================
    // VARIABLES GLOBALES
    // =====================================================

    let trimestreActivo = "Trimestre 1";
    let resumenEstudiantes = [];
    let correoDetalleAbierto = null; // para reabrir el modal tras marcar una falta
    let maxCasillaGrupoGlobal = {}; // "materia|tipo" -> casilla más alta que el grupo ya trabajó (para el PDF)
    let casillasGrupoConNotaGlobal = new Set(); // "materia|tipo|numero" que SÍ tienen al menos una nota real de alguien

    // =====================================================
    // CARGAR TRIMESTRE, ESTUDIANTES Y NOTAS
    // (función reutilizable para refrescar después de marcar)
    // =====================================================

    async function cargarPanel() {
        try {
            // -------- Trimestre activo --------
            const { data: cfg, error: errCfg } = await supabase
                .from("configuracion")
                .select("trimestre_activo")
                .limit(1)
                .single();

            if (!errCfg && cfg?.trimestre_activo) {
                trimestreActivo = cfg.trimestre_activo;
            }

            if (trimestreLabelEl) {
                trimestreLabelEl.textContent = trimestreActivo;
            }

            // -------- Estudiantes --------
            // es_prueba = false: los estudiantes de prueba nunca aparecen
            // en este panel, ni en el resumen, ni en los boletines
            // individuales o masivos que salen de aquí.
            const { data: estudiantes, error: errEst } = await supabase
                .from("estudiantes")
                .select("id, codigo, nombre, correo")
                .eq("salon", salonActual)
                .eq("es_prueba", false)
                .order("codigo", { ascending: true });

            if (errEst) {
                console.error("Error cargando estudiantes:", errEst);
                alert("No se pudieron cargar los estudiantes: " + errEst.message);
                return;
            }

            // -------- Correos de ESTE salón (para filtrar notas) --------
            const correosDelSalon = estudiantes
                .map((e) => e.correo)
                .filter((c) => !!c);

            // -------- Notas del trimestre activo, solo de este salón --------
            let notas = [];

            if (correosDelSalon.length > 0) {
                const { data: notasData, error: errNotas } = await supabase
                    .from("notas")
                    .select("id, correo, materia, tipo, numero, tema, nota, fecha, estado, observacion")
                    .eq("trimestre", trimestreActivo)
                    .in("correo", correosDelSalon);

                if (errNotas) {
                    console.error("Error cargando notas:", errNotas);
                    alert("No se pudieron cargar las notas: " + errNotas.message);
                    return;
                }

                notas = notasData || [];
            }

            // -------- Agrupar notas por correo --------
            const notasPorCorreo = {};

            notas.forEach((n) => {
                if (!notasPorCorreo[n.correo]) {
                    notasPorCorreo[n.correo] = [];
                }
                notasPorCorreo[n.correo].push(n);
            });

            // -------- Casilla más alta llenada por el grupo, por materia+tipo --------
            const maxCasillaGrupo = {};
            const casillasGrupoConNota = new Set();

            notas.forEach((n) => {
                const clave = `${n.materia}|${n.tipo}`;
                const num = Number(n.numero) || 0;

                if (!maxCasillaGrupo[clave] || num > maxCasillaGrupo[clave]) {
                    maxCasillaGrupo[clave] = num;
                }

                // Casilla exacta (no solo "hasta dónde llegó el grupo"),
                // para no marcar como pendiente una columna que existe
                // pero que en realidad nadie ha llenado todavía.
                casillasGrupoConNota.add(`${n.materia}|${n.tipo}|${num}`);
            });

            // Se guarda también en la variable de afuera, para que el
            // generador de PDF pueda armar filas de materias donde el
            // grupo ya trabajó aunque este estudiante no tenga notas ahí.
            maxCasillaGrupoGlobal = maxCasillaGrupo;
            casillasGrupoConNotaGlobal = casillasGrupoConNota;

            // -------- Construir resumen por estudiante --------
            resumenEstudiantes = estudiantes.map((est) => {
                const tieneCuenta = !!est.correo;
                const notasEst = tieneCuenta ? (notasPorCorreo[est.correo] || []) : [];

                let pendientes = 0;

                // Desglose por materia: cuántas casillas de Apreciación y de
                // Ejercicio le faltan a este estudiante en cada materia,
                // frente al máximo que ya trabajó el grupo. Se usa para
                // mostrar el detalle en el boletín PDF (ALERTA PARA LOS PADRES).
                const detallePendientes = {};

                // Antes solo se revisaban las materias que el propio estudiante
                // ya tenía registradas, así que alguien con 0 notas nunca
                // aparecía con pendientes. Ahora se revisan TODAS las materias
                // que el grupo ya trabajó (maxCasillaGrupo), incluyendo las que
                // este estudiante todavía no ha tocado.
                Object.keys(maxCasillaGrupo).forEach((clave) => {
                    const max = maxCasillaGrupo[clave];
                    const tiene = notasEst.filter((n) => `${n.materia}|${n.tipo}` === clave).length;

                    if (max > tiene) {
                        const faltan = max - tiene;
                        pendientes += faltan;

                        const separador = clave.lastIndexOf("|");
                        const materiaClave = clave.slice(0, separador);
                        const tipoClave = clave.slice(separador + 1);

                        if (!detallePendientes[materiaClave]) {
                            detallePendientes[materiaClave] = { apreciacion: 0, ejercicio: 0 };
                        }

                        if (tipoClave === "apreciacion") {
                            detallePendientes[materiaClave].apreciacion += faltan;
                        } else if (tipoClave === "ejercicio") {
                            detallePendientes[materiaClave].ejercicio += faltan;
                        }
                    }
                });

                const ultimaFecha = notasEst.length > 0
                    ? notasEst.reduce((max, n) => (n.fecha > max ? n.fecha : max), notasEst[0].fecha)
                    : null;

                return {
                    codigo: est.codigo,
                    nombre: est.nombre,
                    correo: est.correo,
                    tieneCuenta,
                    totalNotas: notasEst.length,
                    pendientes,
                    detallePendientes,
                    ultimaFecha,
                    notas: notasEst
                };
            });

            // -------- Ordenar: sin cuenta primero, luego más pendientes, luego menos notas --------
            resumenEstudiantes.sort((a, b) => {
                if (a.tieneCuenta !== b.tieneCuenta) return a.tieneCuenta ? 1 : -1;
                if (b.pendientes !== a.pendientes) return b.pendientes - a.pendientes;
                return a.totalNotas - b.totalNotas;
            });

            // -------- Tarjetas --------
            if (totalEstudiantesEl) totalEstudiantesEl.textContent = estudiantes.length;
            if (totalRegistradosEl) totalRegistradosEl.textContent = estudiantes.filter((e) => e.correo).length;
            if (totalNotasEl) totalNotasEl.textContent = notas.length;

            renderTabla(resumenEstudiantes);

        } catch (error) {
            console.error("Error inesperado cargando el panel:", error);
            alert("Ocurrió un error inesperado cargando el panel.");
        }
    }

    await cargarPanel();

    // =====================================================
    // RENDER DE LA TABLA RESUMEN
    // =====================================================

    function renderTabla(lista) {
        if (!tablaResumen) return;

        if (lista.length === 0) {
            tablaResumen.innerHTML = `<tr><td colspan="7" class="text-center">No hay estudiantes registrados.</td></tr>`;
            return;
        }

        tablaResumen.innerHTML = lista.map((est) => {
            let estadoBadge;

            if (!est.tieneCuenta) {
                estadoBadge = `<span class="badge bg-secondary">Sin cuenta creada</span>`;
            } else if (est.totalNotas === 0 && est.pendientes > 0) {
                estadoBadge = `<span class="badge bg-danger">❗ Le faltan ${est.pendientes} nota(s)</span>`;
            } else if (est.pendientes > 0) {
                estadoBadge = `<span class="badge bg-warning text-dark">⚠️ ${est.pendientes} pendiente(s)</span>`;
            } else if (est.totalNotas === 0) {
                estadoBadge = `<span class="badge bg-secondary">Sin notas aún</span>`;
            } else {
                estadoBadge = `<span class="badge bg-success">Al día</span>`;
            }

            const ultimaFechaTexto = est.ultimaFecha
                ? new Date(est.ultimaFecha + "T00:00:00").toLocaleDateString("es-PA")
                : "-";

            const btnDetalle = est.tieneCuenta
                ? `<button type="button" class="btn btn-sm btn-outline-primary" onclick="verDetalle('${escapeHtml(est.correo)}')">Ver detalle</button>`
                : "";

            // El PDF se puede generar aunque el estudiante NO tenga cuenta,
            // porque justamente ese es uno de los casos en que se necesita
            // avisar a los padres.
            const btnPdf = `<button type="button" class="btn btn-sm btn-outline-danger ms-1"
                title="Generar boletín PDF"
                onclick="generarPdfEstudiante('${escapeHtml(est.codigo)}')">
                <i class="fa-solid fa-file-pdf"></i>
            </button>`;

            const btnCambiarCorreo = est.tieneCuenta
                ? `<button type="button" class="btn btn-sm btn-outline-secondary ms-1"
                    title="Restablecer correo y/o contraseña"
                    onclick="cambiarCorreoEstudiante('${escapeHtml(est.correo)}', '${escapeHtml(est.nombre)}')">
                    <i class="fa-solid fa-envelope"></i>
                </button>`
                : "";

            return `
                <tr>
                    <td>${est.codigo}</td>
                    <td>${escapeHtml(est.nombre)}</td>
                    <td>${estadoBadge}</td>
                    <td>${est.totalNotas}</td>
                    <td>${est.tieneCuenta ? est.pendientes : "-"}</td>
                    <td>${ultimaFechaTexto}</td>
                    <td>${btnDetalle}${btnCambiarCorreo}${btnPdf}</td>
                </tr>
            `;
        }).join("");
    }

    // =====================================================
    // DETALLE POR MATERIA (al hacer clic en "Ver detalle")
    // =====================================================

    window.verDetalle = function (correo) {
        const est = resumenEstudiantes.find((e) => e.correo === correo);

        if (!est) {
            alert("No se encontró información de este estudiante.");
            return;
        }

        correoDetalleAbierto = correo;

        modalDetalleTitulo.textContent = `${est.nombre} — ${trimestreActivo}`;

        // -------------------------------------------------------
        // Recolectar TODAS las materias que el GRUPO ya trabajó
        // en este trimestre (no solo las que este estudiante ya
        // tiene). Así, si a un estudiante le faltan notas, el
        // detalle muestra exactamente cuáles casillas le faltan
        // en lugar de un mensaje genérico o un modal vacío.
        // -------------------------------------------------------
        const materiasGrupo = new Set();

        resumenEstudiantes.forEach((e) => {
            e.notas.forEach((n) => materiasGrupo.add(n.materia));
        });

        if (materiasGrupo.size === 0) {
            modalDetalleContenido.innerHTML = `<p>Aún no hay notas registradas por el grupo en este trimestre.</p>`;
            modalDetalle.show();
            return;
        }

        // Preparar la estructura por materia (arranca vacía para
        // todas las materias del grupo, aunque el estudiante no
        // tenga ninguna nota propia todavía)
        const porMateria = {};

        materiasGrupo.forEach((materia) => {
            porMateria[materia] = { apreciacion: {}, ejercicio: {} };
        });

        // Rellenar con las notas que este estudiante sí tiene
        est.notas.forEach((n) => {
            if (!porMateria[n.materia]) {
                porMateria[n.materia] = { apreciacion: {}, ejercicio: {} };
            }

            const tipoNorm = (n.tipo || "").toLowerCase();
            const casilla = Number(n.numero);

            if (tipoNorm === "apreciacion") {
                porMateria[n.materia].apreciacion[casilla] = n;
            } else if (tipoNorm === "ejercicio") {
                porMateria[n.materia].ejercicio[casilla] = n;
            }
        });

        let html = "";

        Object.keys(porMateria).sort().forEach((materia) => {
            const bloqueApreciacion = renderBloqueTipo("Apreciación", porMateria[materia].apreciacion, materia, "apreciacion", correo);
            const bloqueEjercicio = renderBloqueTipo("Ejercicio", porMateria[materia].ejercicio, materia, "ejercicio", correo);

            // Solo se muestra el encabezado de la materia si hay
            // algún bloque con contenido (el grupo trabajó esa
            // materia en apreciación y/o ejercicio)
            if (bloqueApreciacion || bloqueEjercicio) {
                html += `<h6 class="mt-3">${escapeHtml(materia)}</h6>`;
                html += bloqueApreciacion;
                html += bloqueEjercicio;
            }
        });

        if (!html) {
            html = `<p>Este estudiante aún no ha registrado notas en este trimestre.</p>`;
        }

        modalDetalleContenido.innerHTML = html;
        modalDetalle.show();
    };

    // =====================================================
    // CAMBIAR EL CORREO DE ACCESO DE UN ESTUDIANTE
    // Llama a la Edge Function "cambiar-correo-estudiante",
    // que valida que quien llama sea el consejero, cambia el
    // correo en Auth y lo actualiza en las tablas del sistema.
    // =====================================================

    const URL_FUNCION_CAMBIAR_CORREO =
        "https://luewrpzgetqslxqmdcxv.functions.supabase.co/cambiar-correo-estudiante";

    window.cambiarCorreoEstudiante = async function (correoActual, nombre) {
        const nuevoCorreo = prompt(
            `Nuevo correo real para ${nombre}\n\n` +
            `(Correo interno actual: ${correoActual})\n\n` +
            `Déjalo en blanco si NO quieres cambiar el correo, solo la contraseña.`
        );

        // Si presiona "Cancelar" en el primer prompt, se detiene todo
        if (nuevoCorreo === null) return;

        const nuevoCorreoLimpio = nuevoCorreo.trim().toLowerCase();

        if (nuevoCorreoLimpio && !nuevoCorreoLimpio.includes("@")) {
            alert("Escribe un correo válido, por ejemplo: nombre@gmail.com");
            return;
        }

        const nuevaPassword = prompt(
            `Nueva contraseña para ${nombre}\n\n` +
            `Déjalo en blanco si NO quieres cambiar la contraseña, solo el correo.\n` +
            `(Mínimo 6 caracteres si la escribes)`
        );

        if (nuevaPassword === null) return;

        const nuevaPasswordLimpia = nuevaPassword.trim();

        if (!nuevoCorreoLimpio && !nuevaPasswordLimpia) {
            alert("No escribiste ningún cambio. Operación cancelada.");
            return;
        }

        if (nuevaPasswordLimpia && nuevaPasswordLimpia.length < 6) {
            alert("La contraseña debe tener al menos 6 caracteres.");
            return;
        }

        let resumenCambios = `¿Confirmas estos cambios para ${nombre}?\n\n`;
        if (nuevoCorreoLimpio) resumenCambios += `📧 Correo: ${correoActual} → ${nuevoCorreoLimpio}\n`;
        if (nuevaPasswordLimpia) resumenCambios += `🔑 Contraseña nueva: ${nuevaPasswordLimpia}\n`;

        const confirmar = confirm(resumenCambios);
        if (!confirmar) return;

        try {
            const { data: { session } } = await supabase.auth.getSession();

            const respuesta = await fetch(URL_FUNCION_CAMBIAR_CORREO, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${session.access_token}`
                },
                body: JSON.stringify({
                    correoActual,
                    correoNuevo: nuevoCorreoLimpio || null,
                    nuevaPassword: nuevaPasswordLimpia || null
                })
            });

            const resultado = await respuesta.json();

            if (!respuesta.ok) {
                alert("❌ " + (resultado.error || "No se pudo actualizar la cuenta."));
                return;
            }

            alert("✅ Cuenta actualizada correctamente.");
            await cargarPanel();

        } catch (error) {
            console.error("❌ Error actualizando la cuenta:", error);
            alert("❌ Ocurrió un error inesperado: " + error.message);
        }
    };

    // Recalcula, para una materia+tipo, la casilla más alta que
    // cualquier estudiante del grupo ya llenó en este trimestre.
    function maxCasillaDelGrupo(materia, tipo) {
        let max = 0;

        resumenEstudiantes.forEach((est) => {
            est.notas.forEach((n) => {
                if (n.materia === materia && (n.tipo || "").toLowerCase() === tipo) {
                    const num = Number(n.numero) || 0;
                    if (num > max) max = num;
                }
            });
        });

        return max;
    }

    function renderBloqueTipo(etiqueta, casillasObj, materia, tipo, correo) {
        const max = maxCasillaDelGrupo(materia, tipo);

        if (max === 0) return "";

        let filas = "";

        for (let i = 1; i <= max; i++) {
            const item = casillasObj[i];

            if (item && item.estado === "Intencional") {
                // Casilla marcada por el consejero: cuenta 0.0 pero se distingue visualmente
                filas += `
                    <tr class="table-secondary">
                        <td>${i}</td>
                        <td title="Falta marcada por el consejero (cuenta como 0.0 en el promedio)">
                            ⚠️ 0.0 <span class="text-muted small">(intencional)</span>
                        </td>
                        <td>
                            ${escapeHtml(item.observacion || "-")}
                            <button type="button" class="btn btn-sm btn-outline-secondary ms-2"
                                title="Quitar marca de falta intencional"
                                onclick="quitarFaltaIntencional('${item.id}')">
                                <i class="fa-solid fa-rotate-left"></i> Quitar
                            </button>
                        </td>
                    </tr>
                `;
            } else if (item) {
                // Nota normal registrada
                filas += `
                    <tr>
                        <td>${i}</td>
                        <td class="text-success"><i class="fa-solid fa-check"></i> ${item.nota}</td>
                        <td>${escapeHtml(item.tema || "-")}</td>
                    </tr>
                `;
            } else {
                // Casilla vacía: se puede marcar como falta intencional
                filas += `
                    <tr class="table-warning">
                        <td>${i}</td>
                        <td class="text-danger"><i class="fa-solid fa-xmark"></i> Falta</td>
                        <td>
                            <button type="button" class="btn btn-sm btn-outline-dark"
                                title="Marcar como falta intencional (cuenta como 0.0 en el promedio)"
                                onclick="marcarFaltaIntencional('${escapeHtml(correo)}', '${escapeHtml(materia)}', '${tipo}', ${i})">
                                ⚠️ Marcar intencional
                            </button>
                        </td>
                    </tr>
                `;
            }
        }

        return `
            <table class="table table-sm table-bordered mb-3">
                <thead>
                    <tr>
                        <th colspan="3">${etiqueta}</th>
                    </tr>
                    <tr>
                        <th style="width:60px;">N°</th>
                        <th style="width:160px;">Nota</th>
                        <th>Tema / Observación</th>
                    </tr>
                </thead>
                <tbody>${filas}</tbody>
            </table>
        `;
    }

    // =====================================================
    // MARCAR CASILLA COMO FALTA INTENCIONAL
    // =====================================================

    window.marcarFaltaIntencional = async function (correo, materia, tipo, numero) {
        const confirmar = confirm(
            `¿Marcar la casilla ${numero} (${tipo === "apreciacion" ? "Apreciación" : "Ejercicio"}) de "${materia}" ` +
            `como falta intencional?\n\nEsto contará como 0.0 en el promedio del estudiante.`
        );
        if (!confirmar) return;

        const hoy = new Date().toISOString().slice(0, 10);

        const { error } = await supabase
            .from("notas")
            .insert([{
                correo,
                materia,
                tipo,
                numero,
                tema: "Falta intencional",
                actividad: "Falta intencional", // compatibilidad con registros/consultas viejas
                fecha: hoy,
                nota: 0,
                observacion: "Marcada por el consejero: el estudiante no presentó esta actividad.",
                trimestre: trimestreActivo,
                estado: "Intencional"
            }]);

        if (error) {
            console.error("❌ Error al marcar falta intencional:", error);

            if (error.code === "23505") {
                alert("Ya existe una nota en esa casilla. No se puede marcar sobre una nota existente.");
            } else if (error.code === "23514") {
                alert("Datos inválidos: revisa que el número esté entre 1 y 10 y el tipo sea válido.");
            } else {
                alert("No se pudo marcar la falta: " + error.message);
            }
            return;
        }

        // Refrescar tabla resumen y, si el modal estaba abierto, volver a abrirlo actualizado
        await cargarPanel();

        if (correoDetalleAbierto) {
            window.verDetalle(correoDetalleAbierto);
        }
    };

    // =====================================================
    // QUITAR MARCA DE FALTA INTENCIONAL
    // (por si el consejero se equivocó al marcarla)
    // =====================================================

    window.quitarFaltaIntencional = async function (id) {
        const confirmar = confirm("¿Quitar la marca de falta intencional en esta casilla?");
        if (!confirmar) return;

        const { error } = await supabase
            .from("notas")
            .delete()
            .eq("id", id);

        if (error) {
            console.error("❌ Error al quitar la marca:", error);
            alert("No se pudo quitar la marca: " + error.message);
            return;
        }

        await cargarPanel();

        if (correoDetalleAbierto) {
            window.verDetalle(correoDetalleAbierto);
        }
    };

    // =====================================================
    // ESCRIBIR EL BOLETÍN DE UN ESTUDIANTE EN UN DOCUMENTO PDF
    // (función reutilizable: la usa tanto el botón individual
    // como el botón de "generar boletines de todos")
    // =====================================================

    async function escribirBoletinEnDoc(doc, est) {

        // -------- Datos personales (solo existen si tiene cuenta) --------
        let datosEstudiante = null;

        if (est.tieneCuenta) {
            const { data } = await supabase
                .from("datos_estudiante")
                .select("*")
                .eq("correo", est.correo)
                .maybeSingle();

            datosEstudiante = data;
        }

        // -------- Encabezado --------
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
        doc.text(`Trimestre: ${trimestreActivo}`, 105, 36, { align: "center" });
        doc.text(`Fecha de emisión: ${fechaEmision}`, 150, 36);

        doc.setLineWidth(0.3);
        doc.line(20, 40, 190, 40);

        // -------- Datos del estudiante --------
        doc.setFont(undefined, "bold");
        doc.setFontSize(11);
        doc.text("Datos del estudiante", 20, 48);
        doc.setFont(undefined, "normal");
        doc.setFontSize(10);

        let yDatos = 55;

        doc.text(`Nombre: ${est.nombre}`, 20, yDatos);
        yDatos += 6;
        doc.text(`Código: ${est.codigo}`, 20, yDatos);
        yDatos += 6;

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

        // -------- Tabla de notas --------
        let y;

        if (est.notas.length === 0 && Object.keys(maxCasillaGrupoGlobal).length === 0) {

            doc.setFont(undefined, "italic");

            const mensajeSinNotas = est.tieneCuenta
                ? "El estudiante ya tiene cuenta en la plataforma, pero aun no ha buscado ni registrado " +
                  "ninguna nota de este trimestre."
                : "Este estudiante no tiene notas registradas en este trimestre.";

            doc.text(mensajeSinNotas, 20, startYTabla, { maxWidth: 170 });
            doc.setFont(undefined, "normal");

            y = startYTabla + 12;

        } else {

            const materiasMap = {};
            let maxApreciacion = 0;
            let maxEjercicio = 0;

            function asegurarMateria(mat) {
                if (!materiasMap[mat]) {
                    materiasMap[mat] = { apreciacion: {}, ejercicio: {} };
                }
            }

            // Primero se agregan las materias donde el GRUPO ya trabajó
            // (aunque este estudiante todavía no tenga ninguna nota ahí),
            // usando maxCasillaGrupoGlobal para saber cuántas columnas
            // mostrar. Así, esas materias también salen en el boletín,
            // con "?" en cada casilla que le falte a este estudiante.
            Object.keys(maxCasillaGrupoGlobal).forEach((clave) => {
                const separador = clave.lastIndexOf("|");
                const materia = clave.slice(0, separador);
                const tipo = clave.slice(separador + 1);
                const max = maxCasillaGrupoGlobal[clave];

                asegurarMateria(materia);

                if (tipo === "apreciacion" && max > maxApreciacion) maxApreciacion = max;
                if (tipo === "ejercicio" && max > maxEjercicio) maxEjercicio = max;
            });

            est.notas.forEach((item) => {
                const mat = item.materia || "Sin Materia";
                asegurarMateria(mat);

                const tipoNorm = (item.tipo || "").toLowerCase();
                const casilla = Number(item.numero);

                if (!casilla || casilla < 1) return;

                const valor = {
                    nota: Number(item.nota),
                    intencional: item.estado === "Intencional"
                };

                if (tipoNorm === "apreciacion") {
                    materiasMap[mat].apreciacion[casilla] = valor;
                    if (casilla > maxApreciacion) maxApreciacion = casilla;
                } else if (tipoNorm === "ejercicio") {
                    materiasMap[mat].ejercicio[casilla] = valor;
                    if (casilla > maxEjercicio) maxEjercicio = casilla;
                }
            });

            const head = [["Materia"]];
            for (let i = 1; i <= maxApreciacion; i++) head[0].push(`Apr. ${i}`);
            if (maxApreciacion > 0) head[0].push("Prom. Apr.");
            for (let i = 1; i <= maxEjercicio; i++) head[0].push(`Eje. ${i}`);
            if (maxEjercicio > 0) head[0].push("Prom. Eje.");
            head[0].push("Prom. Final");

            const body = [];
            let sumaPromedios = 0;
            let totalMaterias = 0;

            let huboCasillasSinRegistrar = false;

            const celdaTexto = (v, algunOtroTiene) => {
                if (v === null || v === undefined) {
                    if (algunOtroTiene) {
                        huboCasillasSinRegistrar = true;
                        return "?";
                    }
                    return ""; // nadie (ni siquiera otro estudiante) tiene nota ahí: no se marca como pendiente
                }
                if (v.intencional) return "F*";
                return v.nota.toFixed(1);
            };

            Object.keys(materiasMap).sort().forEach((materia) => {
                const apr = [];
                for (let i = 1; i <= maxApreciacion; i++) {
                    apr.push({
                        valor: materiasMap[materia].apreciacion[i] ?? null,
                        algunOtroTiene: casillasGrupoConNotaGlobal.has(`${materia}|apreciacion|${i}`)
                    });
                }

                const eje = [];
                for (let i = 1; i <= maxEjercicio; i++) {
                    eje.push({
                        valor: materiasMap[materia].ejercicio[i] ?? null,
                        algunOtroTiene: casillasGrupoConNotaGlobal.has(`${materia}|ejercicio|${i}`)
                    });
                }

                const aprValidos = apr.map((c) => c.valor).filter((v) => v !== null);
                const ejeValidos = eje.map((c) => c.valor).filter((v) => v !== null);

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
                apr.forEach((c) => row.push(celdaTexto(c.valor, c.algunOtroTiene)));
                if (maxApreciacion > 0) row.push(promApr !== null ? promApr.toFixed(1) : "-");
                eje.forEach((c) => row.push(celdaTexto(c.valor, c.algunOtroTiene)));
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

            y = doc.lastAutoTable.finalY + 6;

            // -------- Nota aclaratoria sobre las casillas vacías --------
            // El sistema funciona con AUTO-registro: es el propio estudiante
            // quien busca la nota con el docente y la escribe en la plataforma.
            // Por eso, si aparece "-" en una casilla NO significa que el
            // docente no haya calificado esa actividad, sino que el
            // estudiante (quien ya tiene cuenta y ha usado la plataforma)
            // todavía no ha ido a buscar esa nota para registrarla.
            if (huboCasillasSinRegistrar) {
                doc.setFont(undefined, "italic");
                doc.setFontSize(8);
                doc.setTextColor(100, 100, 100);
                doc.text(
                    "Nota: el simbolo \"?\" indica que el estudiante aun no ha buscado ni registrado esa nota en el sistema " +
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
        }

        // =================================================
        // ALERTA PARA LOS PADRES
        // Aparece si el estudiante no tiene cuenta creada,
        // o si le faltan notas frente al resto del grupo.
        // =================================================

        if (!est.tieneCuenta || est.pendientes > 0) {

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

            let textoAlerta = "";

            if (!est.tieneCuenta) {
                textoAlerta =
                    "Su hijo(a) aun NO ha creado su cuenta en el sistema de Control de Notas, " +
                    "por lo que no lleva un control adecuado de sus calificaciones. Le pedimos " +
                    "comunicarse con la consejeria o pedirle a su hijo(a) que se registre en el " +
                    "sistema lo antes posible, para poder darle seguimiento a su rendimiento academico.";
            } else if (est.pendientes > 0) {
                textoAlerta =
                    `Su hijo(a) tiene ${est.pendientes} nota(s) pendiente(s) de registrar, en comparacion ` +
                    "con el resto de sus companeros de grupo. Le recomendamos averiguar con su hijo(a) o " +
                    "con el docente la razon de estas actividades pendientes, y corregir la situacion lo " +
                    "antes posible para que este al dia con el resto del grupo.";
            }

            doc.text(textoAlerta, 20, y, { maxWidth: 170 });
            doc.setTextColor(0, 0, 0);

            // Calcula cuántas líneas ocupó el párrafo para colocar lo
            // siguiente justo debajo (en vez de un salto fijo).
            const lineasAlerta = doc.splitTextToSize(textoAlerta, 170);
            y += lineasAlerta.length * 5 + 4;

            // -------- Detalle por materia --------
            // Tabla chiquita mostrando, materia por materia, cuántas
            // casillas de Apreciación y de Ejercicio le faltan al
            // estudiante frente al resto del grupo.
            if (est.tieneCuenta && est.pendientes > 0 && est.detallePendientes &&
                Object.keys(est.detallePendientes).length > 0) {

                const filasDetalle = Object.keys(est.detallePendientes).sort().map((materia) => {
                    const d = est.detallePendientes[materia];
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
        // Siempre se incluyen, aunque la hoja quede casi
        // vacía (sin cuenta / sin notas), para que quede un
        // registro firmado de que se entregó y se notificó.
        // Se colocan justo debajo del contenido (no al fondo
        // de la página) para que siempre sean visibles sin
        // necesidad de hacer scroll.
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
    }

    // =====================================================
    // GENERAR BOLETÍN PDF DE UN SOLO ESTUDIANTE
    // =====================================================

    window.generarPdfEstudiante = async function (codigo) {
        const est = resumenEstudiantes.find((e) => String(e.codigo) === String(codigo));

        if (!est) {
            alert("No se encontró información de este estudiante.");
            return;
        }

        if (typeof window.jspdf === "undefined") {
            alert("No se pudo cargar la librería para generar el PDF.");
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        await escribirBoletinEnDoc(doc, est);

        doc.save(`Boletin_${est.nombre.replace(/[,\s]+/g, "_")}.pdf`);
    };

    // =====================================================
    // GENERAR BOLETINES DE TODOS LOS ESTUDIANTES
    // (un solo PDF con una página por estudiante)
    // =====================================================

    const btnPdfTodos = document.getElementById("btnPdfTodos");

    if (btnPdfTodos) {
        btnPdfTodos.addEventListener("click", async () => {

            if (typeof window.jspdf === "undefined") {
                alert("No se pudo cargar la librería para generar el PDF.");
                return;
            }

            if (resumenEstudiantes.length === 0) {
                alert("No hay estudiantes para generar boletines.");
                return;
            }

            const confirmar = confirm(
                `Se generará un solo PDF con el boletín de los ${resumenEstudiantes.length} estudiantes ` +
                `(${trimestreActivo}). Esto puede tardar unos segundos. ¿Continuar?`
            );
            if (!confirmar) return;

            const textoOriginal = btnPdfTodos.innerHTML;
            btnPdfTodos.disabled = true;
            btnPdfTodos.innerHTML = `<i class="fa-solid fa-spinner fa-spin me-1"></i> Generando...`;

            try {
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF();

                for (let i = 0; i < resumenEstudiantes.length; i++) {
                    if (i > 0) doc.addPage();
                    await escribirBoletinEnDoc(doc, resumenEstudiantes[i]);
                }

                const fechaArchivo = new Date().toISOString().slice(0, 10);
                doc.save(`Boletines_${salonActual}_${trimestreActivo.replace(/\s+/g, "")}_${fechaArchivo}.pdf`);

            } catch (error) {
                console.error("❌ Error al generar los boletines de todos:", error);
                alert("Ocurrió un error generando los boletines: " + error.message);
            } finally {
                btnPdfTodos.disabled = false;
                btnPdfTodos.innerHTML = textoOriginal;
            }
        });
    }

    // =====================================================
    // LISTA DE ESTUDIANTES (todos los salones)
    // Nota: agregar estudiantes ya NO se hace desde este panel;
    // esa tarea le corresponde exclusivamente al administrador
    // para evitar códigos/cédulas duplicados entre consejeros.
    // Aquí solo se CONSULTA e imprime en PDF, por nombre, por
    // cédula, por salón o todos los salones juntos.
    // =====================================================

    const buscarListadoEl = document.getElementById("buscarListado");
    const filtroSalonListadoEl = document.getElementById("filtroSalonListado");
    const tablaListadoEl = document.getElementById("tablaListado");
    const contadorListadoEl = document.getElementById("contadorListado");
    const btnPdfListado = document.getElementById("btnPdfListado");

    let todosLosEstudiantes = []; // { codigo, nombre, cedula, salon }

    async function cargarListadoEstudiantes() {
        tablaListadoEl.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-3">Cargando...</td></tr>`;

        // Se consultan TODOS los salones (no solo el propio), para que
        // el consejero pueda ubicar a cualquier estudiante del colegio.
        const { data, error } = await supabase
            .from("estudiantes")
            .select("codigo, nombre, cedula, salon")
            .eq("es_prueba", false)
            .order("salon", { ascending: true })
            .order("codigo", { ascending: true });

        if (error) {
            console.error("❌ Error al cargar la lista de estudiantes:", error);
            tablaListadoEl.innerHTML = `<tr><td colspan="4" class="text-center text-danger py-3">
                No se pudo cargar la lista de estudiantes: ${escapeHtml(error.message)}
            </td></tr>`;
            filtroSalonListadoEl.innerHTML = `<option value="">Todos los salones</option>`;
            contadorListadoEl.textContent = "0 estudiantes";
            return;
        }

        todosLosEstudiantes = data || [];

        if (todosLosEstudiantes.length === 0) {
            tablaListadoEl.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-3">
                No se encontró ningún estudiante. Si esperabas ver otros salones además del tuyo,
                puede que falte habilitar el permiso de lectura entre salones para el rol "consejero" en Supabase.
            </td></tr>`;
            filtroSalonListadoEl.innerHTML = `<option value="">Todos los salones</option>`;
            contadorListadoEl.textContent = "0 estudiantes";
            return;
        }

        // -------- Llenar el selector de salones con lo que realmente exista --------
        const salonesUnicos = [...new Set(todosLosEstudiantes.map((e) => e.salon).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, "es"));

        filtroSalonListadoEl.innerHTML = `<option value="">Todos los salones</option>` +
            salonesUnicos.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");

        // Por defecto se muestra el salón del propio consejero, si existe en la lista
        if (salonesUnicos.includes(salonActual)) {
            filtroSalonListadoEl.value = salonActual;
        }

        renderListado();
    }

    function renderListado() {
        const texto = (buscarListadoEl.value || "").trim().toLowerCase();
        const salonElegido = filtroSalonListadoEl.value;

        const filtrados = todosLosEstudiantes.filter((e) => {
            if (salonElegido && e.salon !== salonElegido) return false;

            if (!texto) return true;

            const nombre = (e.nombre || "").toLowerCase();
            const cedula = (e.cedula || "").toLowerCase();
            return nombre.includes(texto) || cedula.includes(texto);
        });

        contadorListadoEl.textContent = `${filtrados.length} estudiante${filtrados.length === 1 ? "" : "s"}`;

        if (filtrados.length === 0) {
            tablaListadoEl.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-3">
                No se encontraron estudiantes con ese criterio.
            </td></tr>`;
            return;
        }

        tablaListadoEl.innerHTML = filtrados.map((e) => `
            <tr>
                <td>${escapeHtml(e.salon || "-")}</td>
                <td>${escapeHtml(e.codigo)}</td>
                <td>${escapeHtml(e.cedula || "-")}</td>
                <td>${escapeHtml(e.nombre)}</td>
            </tr>
        `).join("");
    }

    if (buscarListadoEl) buscarListadoEl.addEventListener("input", renderListado);
    if (filtroSalonListadoEl) filtroSalonListadoEl.addEventListener("change", renderListado);

    // Se carga de una vez (no se espera a que el consejero entre a la
    // sección), así el desplegable de salones y la tabla ya están
    // listos apenas hace clic en "Ver lista de estudiantes".
    cargarListadoEstudiantes();

    // -------- Descargar / imprimir la lista actual (filtrada) en PDF --------
    if (btnPdfListado) {
        btnPdfListado.addEventListener("click", () => {
            if (typeof window.jspdf === "undefined") {
                alert("No se pudo cargar la librería para generar el PDF.");
                return;
            }

            const texto = (buscarListadoEl.value || "").trim().toLowerCase();
            const salonElegido = filtroSalonListadoEl.value;

            const filtrados = todosLosEstudiantes.filter((e) => {
                if (salonElegido && e.salon !== salonElegido) return false;
                if (!texto) return true;
                const nombre = (e.nombre || "").toLowerCase();
                const cedula = (e.cedula || "").toLowerCase();
                return nombre.includes(texto) || cedula.includes(texto);
            });

            if (filtrados.length === 0) {
                alert("No hay estudiantes para imprimir con ese criterio.");
                return;
            }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            const tituloSalon = salonElegido ? `Salón ${salonElegido}` : "Todos los salones";
            const fecha = new Date().toLocaleDateString("es-PA");

            doc.setFont(undefined, "bold");
            doc.setFontSize(14);
            doc.text("CENTRO EDUCATIVO BASICO GENERAL EL JIRAL", 105, 15, { align: "center" });
            doc.setFontSize(12);
            doc.text("LISTA DE ESTUDIANTES", 105, 22, { align: "center" });
            doc.setFont(undefined, "normal");
            doc.setFontSize(10);
            doc.text(`${tituloSalon}`, 14, 30);
            doc.text(`Fecha: ${fecha}`, 196, 30, { align: "right" });

            doc.autoTable({
                startY: 35,
                head: [["Salón", "Código", "Cédula", "Nombre"]],
                body: filtrados.map((e) => [e.salon || "-", e.codigo, e.cedula || "-", e.nombre]),
                styles: { fontSize: 9 },
                headStyles: { fillColor: [13, 110, 253] }
            });

            const nombreArchivo = `Lista_estudiantes_${salonElegido || "TodosLosSalones"}_${new Date().toISOString().slice(0, 10)}.pdf`;
            doc.save(nombreArchivo);
        });
    }

    // =====================================================
    // CERRAR SESIÓN
    // =====================================================

    if (btnSalir) {
        btnSalir.addEventListener("click", async () => {
            try {
                const { error } = await supabase.auth.signOut();

                if (error) {
                    console.error("Error cerrando sesión:", error);
                    alert("No se pudo cerrar la sesión: " + error.message);
                    return;
                }

                window.location.href = "login.html";
            } catch (error) {
                console.error("Error inesperado cerrando la sesión:", error);
                alert("Ocurrió un error al cerrar la sesión.");
            }
        });
    }
});
