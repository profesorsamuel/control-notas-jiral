import { supabase } from "./supabase.js";
import { pintarCambiarPanel } from "./roles.js";

// =========================================================
// 0) UTILIDADES
// =========================================================

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

const PROMEDIO_MINIMO_APROBAR = 3.0;

// Mientras el/la docente escribe: solo deja pasar dígitos y un único punto
// decimal, y limita a 1 dígito entero + 1 decimal (así nunca se puede
// llegar a escribir algo como "33").
function sanitizarEntradaNota(valor) {
    let v = valor.replace(",", ".").replace(/[^0-9.]/g, "");

    const partes = v.split(".");
    if (partes.length > 2) v = partes[0] + "." + partes.slice(1).join("");

    let [entero, decimal] = v.split(".");
    entero = (entero || "").slice(0, 1);

    if (decimal !== undefined) {
        decimal = decimal.slice(0, 1);
        return `${entero}.${decimal}`;
    }
    return entero;
}

// Al salir de la casilla: convierte "3" en "3.0", ".6" en "0.6", y
// limita cualquier valor al rango 0–5.
function formatearNotaFinal(valor) {
    const texto = (valor ?? "").trim();
    if (texto === "" || texto === ".") return "";

    let num = parseFloat(texto);
    if (isNaN(num)) return "";

    if (num < 0) num = 0;
    if (num > 5) num = 5;

    return num.toFixed(1);
}

function claveCasilla(tipo, numero) {
    return `${tipo}-${numero}`;
}

function etiquetaCasilla(tipo, numero) {
    return `${tipo === "apreciacion" ? "Aprec." : "Ejer."} ${numero}`;
}

// =========================================================
// 1) VERIFICAR SESIÓN Y QUE SEA PROFESOR
// =========================================================

let correoProfesor = "";
let nombreProfesor = "";
let misAsignaciones = []; // [{materia, salon}, ...] -- solo lo que este profesor da
let bloqueoActual = false; // ¿la materia/salón cargada está bloqueada para estudiantes?

// El acceso a este panel se decide igual que en consejero.js:
// por pertenecer a la tabla correspondiente (profesor_materias),
// no por el campo "rol" de la tabla "usuarios". Así una cuenta
// puede ser profesor(a) sin dejar de ser también admin/consejero(a).
async function verificarSesion() {
    const { data: { user }, error: errUser } = await supabase.auth.getUser();

    if (errUser || !user) {
        window.location.href = "login.html";
        return false;
    }

    correoProfesor = (user.email || "").trim().toLowerCase();

    const { data: materias, error: errMaterias } = await supabase
        .from("profesor_materias")
        .select("materia, salon")
        .eq("correo_profesor", correoProfesor);

    if (errMaterias) {
        console.error("❌ Error al verificar acceso de docente:", errMaterias);
        alert("Ocurrió un error al verificar tu acceso. Intenta de nuevo.");
        window.location.href = "login.html";
        return false;
    }

    if (!materias || materias.length === 0) {
        alert("⛔ Esta cuenta no tiene materias asignadas como docente. Contacta al administrador.");
        window.location.href = "login.html";
        return false;
    }

    misAsignaciones = materias;

    const { data: perfilProfesor } = await supabase
        .from("profesores")
        .select("nombre_profesor")
        .eq("correo_profesor", correoProfesor)
        .maybeSingle();
    nombreProfesor = perfilProfesor?.nombre_profesor || correoProfesor;

    return true;
}

// =========================================================
// 2) SELECTORES DE SALÓN / MATERIA (solo lo que este profesor da)
// =========================================================

const selectSalonNota = document.getElementById("selectSalonNota");
const selectMateriaNota = document.getElementById("selectMateriaNota");
const selectTipoNota = document.getElementById("selectTipoNota");
const inputNumeroNota = document.getElementById("inputNumeroNota");
const selectTrimestreNota = document.getElementById("selectTrimestreNota");
const btnCargarSalon = document.getElementById("btnCargarSalon");
const bloqueTablaNotas = document.getElementById("bloqueTablaNotas");
const cabeceraNotasGrupo = document.getElementById("cabeceraNotasGrupo");
const cabeceraTemasGrupo = document.getElementById("cabeceraTemasGrupo");
const tablaNotasGrupo = document.getElementById("tablaNotasGrupo");
const btnGuardarNotasGrupo = document.getElementById("btnGuardarNotasGrupo");
const estadoGuardadoNotas = document.getElementById("estadoGuardadoNotas");
const avisoSinAsignaciones = document.getElementById("avisoSinAsignaciones");
const checkBloqueoEstudiantes = document.getElementById("checkBloqueoEstudiantes");
const checkSoloColumnaActual = document.getElementById("checkSoloColumnaActual");
const checkMostrarPromedios = document.getElementById("checkMostrarPromedios");
const btnElegirColumnas = document.getElementById("btnElegirColumnas");
const panelElegirColumnas = document.getElementById("panelElegirColumnas");
const listaChecksColumnas = document.getElementById("listaChecksColumnas");
const btnColumnasSeleccionarTodas = document.getElementById("btnColumnasSeleccionarTodas");
const btnColumnasSeleccionarNinguna = document.getElementById("btnColumnasSeleccionarNinguna");
const btnExportarPdf = document.getElementById("btnExportarPdf");
const btnExportarJpg = document.getElementById("btnExportarJpg");

function poblarSelectSalon() {
    const salones = [...new Set(misAsignaciones.map((a) => a.salon))].sort();

    if (salones.length === 0) {
        selectSalonNota.innerHTML = `<option value="">No tienes salones asignados</option>`;
        selectSalonNota.disabled = true;
        avisoSinAsignaciones.style.display = "block";
        return;
    }

    avisoSinAsignaciones.style.display = "none";
    selectSalonNota.innerHTML =
        `<option value="">Seleccione un salón</option>` +
        salones.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
    selectSalonNota.disabled = false;
}

function poblarSelectMateria() {
    const salon = selectSalonNota.value;

    if (!salon) {
        selectMateriaNota.innerHTML = `<option value="">Seleccione primero un salón</option>`;
        selectMateriaNota.disabled = true;
        return;
    }

    const materias = misAsignaciones
        .filter((a) => a.salon === salon)
        .map((a) => a.materia);

    // Si el/la docente solo tiene UNA materia asignada en este salón, no
    // tiene sentido hacerla elegir: la seleccionamos sola y directamente
    // disparamos la carga del salón (como si hubiera dado clic en
    // "Cargar salón"). Si hay varias, se deja el comportamiento normal
    // de elegir manualmente.
    if (materias.length === 1) {
        selectMateriaNota.innerHTML =
            `<option value="${escapeHtml(materias[0])}" selected>${escapeHtml(materias[0])}</option>`;
        selectMateriaNota.disabled = false;
        btnCargarSalon.click();
        return;
    }

    selectMateriaNota.innerHTML =
        `<option value="">Seleccione una materia</option>` +
        materias.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
    selectMateriaNota.disabled = false;
}

selectSalonNota?.addEventListener("change", poblarSelectMateria);

// =========================================================
// 3) TABLA DE ESTUDIANTES CON NOTAS EDITABLES (misma lógica del admin)
// =========================================================

let grupoActual = [];
let historiaPorEstudiante = {};
let casillasTabla = [];
let temasCasillasBD = {};

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
    const salon = selectSalonNota.value;
    const materia = selectMateriaNota.value;
    const trimestre = selectTrimestreNota.value;
    const valorGuardar = nuevoTema || null;

    const { error } = await supabase
        .from("temas_casillas")
        .upsert(
            { salon, materia, trimestre, tipo, numero, tema: valorGuardar, updated_at: new Date().toISOString() },
            { onConflict: "salon,materia,trimestre,tipo,numero" }
        );

    if (error) {
        console.error("❌ Error al guardar el tema:", error);
        estadoGuardadoNotas.textContent = `⚠️ No se pudo guardar el tema de ${etiquetaCasilla(tipo, numero)}.`;
        estadoGuardadoNotas.className = "small text-danger";
        return;
    }

    temasCasillasBD[claveCasilla(tipo, numero)] = valorGuardar || "";

    const correos = grupoActual.map((e) => e.correo).filter(Boolean);
    const idsSinCuenta = grupoActual.filter((e) => !e.correo).map((e) => e.id);

    if (correos.length > 0) {
        await supabase.from("notas").update({ tema: valorGuardar })
            .eq("materia", materia).eq("trimestre", trimestre).eq("tipo", tipo).eq("numero", numero)
            .in("correo", correos);
    }
    if (idsSinCuenta.length > 0) {
        await supabase.from("notas").update({ tema: valorGuardar })
            .eq("materia", materia).eq("trimestre", trimestre).eq("tipo", tipo).eq("numero", numero)
            .in("estudiante_id", idsSinCuenta);
    }

    estadoGuardadoNotas.textContent = `✅ Tema de "${etiquetaCasilla(tipo, numero)}" actualizado.`;
    estadoGuardadoNotas.className = "small text-success";
}

async function eliminarColumnaCasilla(tipo, numero) {
    const salon = selectSalonNota.value;
    const materia = selectMateriaNota.value;
    const trimestre = selectTrimestreNota.value;
    const etiqueta = etiquetaCasilla(tipo, numero);

    if (!confirm(`¿Eliminar permanentemente la casilla "${etiqueta}" (${materia} - ${salon}) y todas las notas en ella?`)) return;

    await supabase.from("notas").delete()
        .eq("materia", materia).eq("trimestre", trimestre).eq("tipo", tipo).eq("numero", numero);
    await supabase.from("temas_casillas").delete()
        .eq("salon", salon).eq("materia", materia).eq("trimestre", trimestre).eq("tipo", tipo).eq("numero", numero);

    estadoGuardadoNotas.textContent = `✅ Casilla ${etiqueta} eliminada.`;
    estadoGuardadoNotas.className = "small text-success";
    btnCargarSalon.click();
}

function recalcularPromedios() {
    tablaNotasGrupo.querySelectorAll("tr").forEach((tr) => {
        const inputsFila = tr.querySelectorAll(".input-nota-grupo");
        if (inputsFila.length === 0) return;

        const apr = [], eje = [];
        inputsFila.forEach((input) => {
            const v = input.value.trim();
            if (v === "") return;
            const num = parseFloat(v);
            if (isNaN(num)) return;
            (input.dataset.tipo === "apreciacion" ? apr : eje).push(num);
        });

        const promApr = apr.length ? apr.reduce((a, b) => a + b, 0) / apr.length : null;
        const promEje = eje.length ? eje.reduce((a, b) => a + b, 0) / eje.length : null;
        let promFinal = null;
        if (promApr !== null && promEje !== null) promFinal = (promApr + promEje) / 2;
        else if (promApr !== null) promFinal = promApr;
        else if (promEje !== null) promFinal = promEje;

        const cApr = tr.querySelector(".celda-prom-apr");
        const cEje = tr.querySelector(".celda-prom-eje");
        const cFinal = tr.querySelector(".celda-prom-final");
        if (cApr) cApr.textContent = promApr !== null ? promApr.toFixed(1) : "–";
        if (cEje) cEje.textContent = promEje !== null ? promEje.toFixed(1) : "–";
        if (cFinal) {
            cFinal.textContent = promFinal !== null ? promFinal.toFixed(1) : "–";
            const enRiesgo = promFinal !== null && promFinal < PROMEDIO_MINIMO_APROBAR;
            tr.classList.toggle("table-danger", enRiesgo);
            cFinal.classList.toggle("text-danger", enRiesgo);
        }
    });
}

// "actual" = solo la casilla seleccionada arriba. "todas" = todas las
// columnas juntas. "manual" = el docente eligió a mano cuáles columnas
// quiere ver (por ejemplo, solo Ejer. 4 y Ejer. 6).
let modoColumnas = "actual";
let columnasManualOcultas = new Set(); // claves ocultas cuando modoColumnas === "manual"

function renderizarListaChecksColumnas() {
    if (!listaChecksColumnas) return;
    listaChecksColumnas.innerHTML = casillasTabla.map((c) => {
        const clave = claveCasilla(c.tipo, c.numero);
        const marcado = !columnasManualOcultas.has(clave);
        return `
            <label class="form-check" style="display:flex; align-items:center; gap:4px; margin:0;">
                <input type="checkbox" class="form-check-input check-columna-manual" data-clave="${clave}" ${marcado ? "checked" : ""} style="margin:0;">
                <span class="small">${etiquetaCasilla(c.tipo, c.numero)}</span>
            </label>`;
    }).join("");

    listaChecksColumnas.querySelectorAll(".check-columna-manual").forEach((chk) => {
        chk.addEventListener("change", () => {
            const clave = chk.dataset.clave;
            if (chk.checked) columnasManualOcultas.delete(clave);
            else columnasManualOcultas.add(clave);
            modoColumnas = "manual";
            if (checkSoloColumnaActual) checkSoloColumnaActual.checked = false;
            renderTabla();
        });
    });
}

btnElegirColumnas?.addEventListener("click", () => {
    if (!panelElegirColumnas) return;
    const visible = panelElegirColumnas.style.display !== "none";
    panelElegirColumnas.style.display = visible ? "none" : "block";
});

btnColumnasSeleccionarTodas?.addEventListener("click", () => {
    columnasManualOcultas.clear();
    modoColumnas = "manual";
    if (checkSoloColumnaActual) checkSoloColumnaActual.checked = false;
    renderizarListaChecksColumnas();
    renderTabla();
});

btnColumnasSeleccionarNinguna?.addEventListener("click", () => {
    casillasTabla.forEach((c) => columnasManualOcultas.add(claveCasilla(c.tipo, c.numero)));
    modoColumnas = "manual";
    if (checkSoloColumnaActual) checkSoloColumnaActual.checked = false;
    renderizarListaChecksColumnas();
    renderTabla();
});

checkSoloColumnaActual?.addEventListener("change", () => {
    modoColumnas = checkSoloColumnaActual.checked ? "actual" : "todas";
    if (grupoActual.length > 0) renderTabla();
});

checkMostrarPromedios?.addEventListener("change", () => {
    if (grupoActual.length > 0) renderTabla();
});

function renderTabla() {
    if (grupoActual.length === 0) {
        cabeceraNotasGrupo.innerHTML = `<th class="col-fija col-fija-num">#</th><th class="col-fija col-fija-nombre">Estudiante</th>`;
        cabeceraTemasGrupo.innerHTML = "";
        tablaNotasGrupo.innerHTML = `<tr><td colspan="2" class="text-center text-muted py-3">Este salón aún no tiene estudiantes cargados.</td></tr>`;
        return;
    }

    const claveSel = claveCasilla(selectTipoNota.value, parseInt(inputNumeroNota.value, 10));

    // Si la casilla que el docente seleccionó arriba (Tipo + Número)
    // todavía no tiene ninguna nota guardada, no aparecerá en
    // casillasTabla; la agregamos igual para que la columna esté lista
    // para escribir desde el primer momento.
    if (!casillasTabla.some((c) => claveCasilla(c.tipo, c.numero) === claveSel)) {
        casillasTabla.push({ tipo: selectTipoNota.value, numero: parseInt(inputNumeroNota.value, 10) });
        casillasTabla.sort((a, b) => a.tipo !== b.tipo ? (a.tipo === "apreciacion" ? -1 : 1) : a.numero - b.numero);
    }

    // Según el modo elegido, decidimos qué columnas de nota mostrar:
    // "actual" = solo la casilla seleccionada arriba; "manual" = las que
    // el docente marcó a mano en el panel de "Elegir columnas
    // específicas"; "todas" = la tabla completa.
    let columnasVisibles;
    if (modoColumnas === "manual") {
        columnasVisibles = casillasTabla.filter((c) => !columnasManualOcultas.has(claveCasilla(c.tipo, c.numero)));
    } else if (modoColumnas === "actual") {
        columnasVisibles = casillasTabla.filter((c) => claveCasilla(c.tipo, c.numero) === claveSel);
    } else {
        columnasVisibles = casillasTabla;
    }

    const mostrarProm = !!checkMostrarPromedios?.checked;

    renderizarListaChecksColumnas();

    let htmlCabecera = `<th class="col-fija col-fija-num">#</th><th class="col-fija col-fija-nombre">Estudiante</th>`;
    columnasVisibles.forEach((c) => {
        const sel = claveCasilla(c.tipo, c.numero) === claveSel;
        htmlCabecera += `
            <th class="text-center small ${sel ? "table-primary text-primary" : "text-muted"}" style="width:90px;">
                <div>${etiquetaCasilla(c.tipo, c.numero)}</div>
                <button type="button" class="btn btn-link btn-sm p-0 text-danger btn-eliminar-columna" data-tipo="${c.tipo}" data-numero="${c.numero}" title="Eliminar esta columna">🗑️</button>
            </th>`;
    });
    if (mostrarProm) {
        htmlCabecera += `<th class="text-center small fw-bold" style="width:85px;">Prom. Aprec.</th>`;
        htmlCabecera += `<th class="text-center small fw-bold" style="width:85px;">Prom. Ejer.</th>`;
        htmlCabecera += `<th class="text-center small fw-bold table-success" style="width:90px;">Prom. Final</th>`;
    }
    cabeceraNotasGrupo.innerHTML = htmlCabecera;

    let htmlTemas = `<th class="col-fija col-fija-num"></th><th class="col-fija col-fija-nombre small text-muted fw-normal">Tema de cada casilla:</th>`;
    columnasVisibles.forEach((c) => {
        const tema = obtenerTemaCasilla(c.tipo, c.numero);
        htmlTemas += `
            <th style="padding:2px 4px;">
                <input type="text" class="form-control form-control-sm input-tema-columna"
                    data-tipo="${c.tipo}" data-numero="${c.numero}" data-tema-guardado="${escapeHtml(tema)}"
                    value="${escapeHtml(tema)}" placeholder="Ej: Proyecto 2" style="font-size:11px; font-weight:normal;">
            </th>`;
    });
    if (mostrarProm) htmlTemas += `<th></th><th></th><th></th>`;
    cabeceraTemasGrupo.innerHTML = htmlTemas;

    tablaNotasGrupo.innerHTML = grupoActual.map((est, i) => {
        const sinCuenta = !est.correo;
        const historial = historiaPorEstudiante[claveEstudiante(est)] || {};

        const columnas = columnasVisibles.map((c, colIndex) => {
            const claveCas = claveCasilla(c.tipo, c.numero);
            const n = historial[claveCas];
            const crudo = (n && n.nota !== null && n.nota !== undefined) ? n.nota : "";
            const valor = crudo === "" ? "" : formatearNotaFinal(String(crudo));
            return `
                <td class="celda-nota">
                    <input type="text" inputmode="decimal" class="form-control form-control-sm input-nota-grupo"
                        data-col="${colIndex}" data-correo="${sinCuenta ? "" : escapeHtml(est.correo)}"
                        data-estudiante-id="${sinCuenta ? escapeHtml(est.id) : ""}" data-nota-id="${n ? n.id : ""}"
                        data-tipo="${c.tipo}" data-numero="${c.numero}" data-ultimo-valor-guardado="${valor}"
                        value="${valor}" placeholder="–">
                </td>`;
        }).join("");

        return `
            <tr class="${sinCuenta ? "table-warning" : ""}">
                <td class="col-fija col-fija-num">${i + 1}</td>
                <td class="col-fija col-fija-nombre">${escapeHtml(est.nombre)}${sinCuenta ? ' <span class="badge bg-warning text-dark">Sin cuenta</span>' : ""}</td>
                ${columnas}
                ${mostrarProm ? `
                <td class="celda-prom-apr text-center fw-bold">–</td>
                <td class="celda-prom-eje text-center fw-bold">–</td>
                <td class="celda-prom-final text-center fw-bold table-success bg-opacity-25">–</td>` : ""}
            </tr>`;
    }).join("");

    recalcularPromedios();

    cabeceraNotasGrupo.querySelectorAll(".btn-eliminar-columna").forEach((btn) => {
        btn.addEventListener("click", () => eliminarColumnaCasilla(btn.dataset.tipo, parseInt(btn.dataset.numero, 10)));
    });

    tablaNotasGrupo.parentElement.querySelectorAll(".input-tema-columna").forEach((input) => {
        input.addEventListener("blur", async () => {
            const nuevo = input.value.trim();
            if (nuevo === input.dataset.temaGuardado) return;
            await actualizarTemaCasilla(input.dataset.tipo, parseInt(input.dataset.numero, 10), nuevo);
            input.dataset.temaGuardado = nuevo;
        });
    });

    const todosInputs = Array.from(tablaNotasGrupo.querySelectorAll(".input-nota-grupo"));
    const porColumna = {};
    todosInputs.forEach((input) => {
        (porColumna[input.dataset.col] ??= []).push(input);
    });
    todosInputs.forEach((input) => {
        input.addEventListener("input", () => {
            const alFinal = input.selectionEnd === input.value.length;
            input.value = sanitizarEntradaNota(input.value);
            if (alFinal) input.selectionStart = input.selectionEnd = input.value.length;
            recalcularPromedios();
        });

        input.addEventListener("keydown", (e) => {
            const lista = porColumna[input.dataset.col] || [];

            if (e.key === "Enter" || e.key === "ArrowDown") {
                e.preventDefault();
                const siguiente = lista[lista.indexOf(input) + 1];
                if (siguiente) { siguiente.focus(); siguiente.select(); }
                return;
            }
            if (e.key === "ArrowUp") {
                e.preventDefault();
                const anterior = lista[lista.indexOf(input) - 1];
                if (anterior) { anterior.focus(); anterior.select(); }
            }
        });
    });
}

// Si el docente cambia cuál casilla está editando (Tipo / Número),
// volvemos a dibujar la tabla al instante con los datos que ya están en
// memoria (sin tener que volver a presionar "Cargar salón").
selectTipoNota?.addEventListener("change", () => {
    if (grupoActual.length > 0) renderTabla();
});
inputNumeroNota?.addEventListener("input", () => {
    if (grupoActual.length > 0) renderTabla();
});

btnCargarSalon?.addEventListener("click", async () => {
    const salon = selectSalonNota.value;
    const materia = selectMateriaNota.value;
    const tipo = selectTipoNota.value;
    const numero = parseInt(inputNumeroNota.value, 10);
    const trimestre = selectTrimestreNota.value;

    if (!salon) return alert("Selecciona un salón.");
    if (!materia) return alert("Selecciona una materia.");

    const esMia = misAsignaciones.some((a) => a.salon === salon && a.materia === materia);
    if (!esMia) return alert("Esa materia/salón no está asignada a tu cuenta.");

    const textoOriginal = btnCargarSalon.innerHTML;
    btnCargarSalon.disabled = true;
    btnCargarSalon.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Cargando...`;

    const { data: estudiantesSalon, error: errEst } = await supabase
        .from("estudiantes")
        .select("id, codigo, nombre, correo, es_prueba")
        .eq("salon", salon)
        .order("nombre", { ascending: true });

    if (errEst) {
        alert("Error al cargar estudiantes: " + errEst.message);
        btnCargarSalon.disabled = false;
        btnCargarSalon.innerHTML = textoOriginal;
        return;
    }

    grupoActual = (estudiantesSalon || []).filter((e) => !e.es_prueba);

    const correos = grupoActual.map((e) => e.correo).filter(Boolean);
    const idsSinCuenta = grupoActual.filter((e) => !e.correo).map((e) => e.id);

    historiaPorEstudiante = {};
    const casillasEncontradas = new Set();

    function registrar(clave, n) {
        (historiaPorEstudiante[clave] ??= {})[claveCasilla(n.tipo, n.numero)] = n;
        casillasEncontradas.add(claveCasilla(n.tipo, n.numero));
    }

    if (correos.length > 0) {
        const { data } = await supabase.from("notas").select("id, correo, tipo, numero, nota, tema")
            .eq("materia", materia).eq("trimestre", trimestre).in("correo", correos);
        (data || []).forEach((n) => registrar(`correo:${n.correo}`, n));
    }
    if (idsSinCuenta.length > 0) {
        const { data } = await supabase.from("notas").select("id, estudiante_id, tipo, numero, nota, tema")
            .eq("materia", materia).eq("trimestre", trimestre).in("estudiante_id", idsSinCuenta);
        (data || []).forEach((n) => registrar(`id:${n.estudiante_id}`, n));
    }

    temasCasillasBD = {};
    const { data: temas } = await supabase.from("temas_casillas").select("tipo, numero, tema")
        .eq("salon", salon).eq("materia", materia).eq("trimestre", trimestre);
    (temas || []).forEach((t) => {
        temasCasillasBD[claveCasilla(t.tipo, t.numero)] = t.tema || "";
        if (t.tema) casillasEncontradas.add(claveCasilla(t.tipo, t.numero));
    });

    casillasEncontradas.add(claveCasilla(tipo, numero));
    casillasTabla = [...casillasEncontradas].map((c) => {
        const sep = c.lastIndexOf("-");
        return { tipo: c.slice(0, sep), numero: parseInt(c.slice(sep + 1), 10) };
    }).sort((a, b) => a.tipo !== b.tipo ? (a.tipo === "apreciacion" ? -1 : 1) : a.numero - b.numero);

    const { data: filaAsignacion } = await supabase
        .from("profesor_materias")
        .select("bloqueado_para_estudiantes")
        .eq("correo_profesor", correoProfesor).eq("materia", materia).eq("salon", salon)
        .maybeSingle();
    bloqueoActual = !!filaAsignacion?.bloqueado_para_estudiantes;
    if (checkBloqueoEstudiantes) checkBloqueoEstudiantes.checked = bloqueoActual;

    renderTabla();
    bloqueTablaNotas.style.display = "block";

    btnCargarSalon.disabled = false;
    btnCargarSalon.innerHTML = textoOriginal;
});

// =========================================================
// 4) GUARDAR NOTAS
// =========================================================

async function guardarNotas(esAutomatico = false) {
    const materia = selectMateriaNota.value;
    const trimestre = selectTrimestreNota.value;
    const hoy = new Date().toISOString().slice(0, 10);

    const inputsTema = Array.from(tablaNotasGrupo.parentElement.querySelectorAll(".input-tema-columna"));
    const temaPorCasilla = {};
    for (const inputTema of inputsTema) {
        const valor = inputTema.value.trim();
        temaPorCasilla[claveCasilla(inputTema.dataset.tipo, parseInt(inputTema.dataset.numero, 10))] = valor || null;
        if (valor !== inputTema.dataset.temaGuardado) {
            await actualizarTemaCasilla(inputTema.dataset.tipo, parseInt(inputTema.dataset.numero, 10), valor);
            inputTema.dataset.temaGuardado = valor;
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
    estadoGuardadoNotas.textContent = esAutomatico ? "Autoguardando..." : `Guardando 0 / ${aGuardar.length}...`;
    estadoGuardadoNotas.className = "small text-primary";

    let exitosas = 0, fallidas = 0;

    for (let i = 0; i < aGuardar.length; i++) {
        const item = aGuardar[i];

        if (item.notaId) {
            const { error } = await supabase.from("notas").update({ nota: item.nota, fecha: hoy, origen: "profesor" }).eq("id", item.notaId);
            if (error) { fallidas++; } else { exitosas++; item.input.dataset.ultimoValorGuardado = String(item.nota); }
        } else {
            const { data: insertado, error } = await supabase.from("notas").insert([{
                correo: item.correo,
                estudiante_id: item.estudianteId,
                materia,
                tipo: item.tipo,
                numero: item.numero,
                tema: temaPorCasilla[claveCasilla(item.tipo, item.numero)] || null,
                actividad: temaPorCasilla[claveCasilla(item.tipo, item.numero)] || `${item.tipo === "apreciacion" ? "Apreciación" : "Ejercicio"} ${item.numero}`,
                fecha: hoy,
                nota: item.nota,
                observacion: `Agregada por el/la docente (${correoProfesor})`,
                trimestre,
                estado: "Activa",
                origen: "profesor"
            }]).select("id");

            if (error) { fallidas++; }
            else {
                exitosas++;
                item.input.dataset.ultimoValorGuardado = String(item.nota);
                if (insertado && insertado[0]) item.input.dataset.notaId = insertado[0].id;
            }
        }
        if (!esAutomatico) estadoGuardadoNotas.textContent = `Guardando ${i + 1} / ${aGuardar.length}...`;
    }

    if (!esAutomatico) btnGuardarNotasGrupo.disabled = false;
    const hora = new Date().toLocaleTimeString("es-PA", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

    if (fallidas === 0) {
        estadoGuardadoNotas.textContent = esAutomatico ? `✅ Autoguardado (${exitosas}) a las ${hora}` : `✅ ${exitosas} nota(s) guardada(s).`;
        estadoGuardadoNotas.className = "small text-success";
    } else {
        estadoGuardadoNotas.textContent = `⚠️ ${exitosas} guardada(s), ${fallidas} con error.`;
        estadoGuardadoNotas.className = "small text-danger";
    }

    if (!esAutomatico) btnCargarSalon.click();
}

checkBloqueoEstudiantes?.addEventListener("change", async () => {
    const salon = selectSalonNota.value;
    const materia = selectMateriaNota.value;
    if (!salon || !materia) return;

    bloqueoActual = checkBloqueoEstudiantes.checked;
    const { error } = await supabase
        .from("profesor_materias")
        .update({ bloqueado_para_estudiantes: bloqueoActual })
        .eq("correo_profesor", correoProfesor).eq("materia", materia).eq("salon", salon);

    if (error) {
        estadoGuardadoNotas.textContent = "❌ No se pudo guardar el candado: " + error.message;
        estadoGuardadoNotas.className = "small text-danger";
        checkBloqueoEstudiantes.checked = !bloqueoActual;
        bloqueoActual = !bloqueoActual;
        return;
    }

    estadoGuardadoNotas.textContent = bloqueoActual
        ? "🔒 Los estudiantes ya no pueden agregar notas en esta materia/salón."
        : "🔓 Los estudiantes pueden volver a agregar notas donde no haya nota tuya.";
    estadoGuardadoNotas.className = "small text-success";
});

// Auto-guardado real: cada celda se guarda sola al salir de ella (blur)
// o al presionar Enter, sin necesidad de un botón "Guardar".
tablaNotasGrupo?.addEventListener("blur", (e) => {
    if (e.target.classList?.contains("input-nota-grupo")) {
        e.target.value = formatearNotaFinal(e.target.value);
        recalcularPromedios();
        guardarNotas(true);
    }
}, true);

// Respaldo por si algo quedó sin guardar (ej. el profesor cerró la pestaña
// mientras seguía escribiendo en la misma celda sin salir de ella).
setInterval(() => {
    if (bloqueTablaNotas && bloqueTablaNotas.style.display !== "none") guardarNotas(true);
}, 30000);

// =========================================================
// 5) HISTORIAL DE NOTAS (funcionalidad que ya existía, ahora
//    filtrada a solo las materias que este profesor da)
// =========================================================

let todasLasNotas = [];

async function cargarHistorialNotas() {
    const contenedor = document.getElementById("listaEstudiantes");
    const misMaterias = new Set(misAsignaciones.map((a) => a.materia));

    if (misMaterias.size === 0) {
        contenedor.innerHTML = "<p>No hay notas para mostrar.</p>";
        return;
    }

    const { data: estudiantesPrueba } = await supabase.from("estudiantes").select("correo").eq("es_prueba", true);
    const correosDePrueba = new Set((estudiantesPrueba || []).map((e) => (e.correo || "").toLowerCase()).filter(Boolean));

    const { data, error } = await supabase
        .from("notas")
        .select("*")
        .in("materia", [...misMaterias])
        .order("created_at", { ascending: false });

    if (error) {
        console.error(error);
        contenedor.innerHTML = `<p style="color:red;">Error al cargar las notas: ${error.message}</p>`;
        return;
    }

    todasLasNotas = (data || []).filter((n) => !correosDePrueba.has((n.correo || "").toLowerCase()));

    actualizarResumen(todasLasNotas);
    renderizarTablaHistorial(todasLasNotas);

    const inputBuscar = document.getElementById("buscarCorreo");
    inputBuscar.addEventListener("input", () => {
        const filtro = inputBuscar.value.trim().toLowerCase();
        renderizarTablaHistorial(todasLasNotas.filter((n) => (n.correo || "").toLowerCase().includes(filtro)));
    });
}

function actualizarResumen(notas) {
    document.getElementById("totalNotas").textContent = notas.length;
    document.getElementById("totalEstudiantes").textContent = new Set(notas.map((n) => n.correo)).size;
}

function renderizarTablaHistorial(notas) {
    const contenedor = document.getElementById("listaEstudiantes");

    if (!notas || notas.length === 0) {
        contenedor.innerHTML = "<p>No hay notas para mostrar.</p>";
        return;
    }

    let html = `<table><tr><th>Correo</th><th>Materia</th><th>Tema</th><th>Tipo</th><th>Nota</th><th>Trimestre</th></tr>`;
    notas.forEach((nota) => {
        html += `<tr>
            <td>${escapeHtml(nota.correo)}</td>
            <td>${escapeHtml(nota.materia)}</td>
            <td>${escapeHtml(nota.tema || nota.actividad || "")}</td>
            <td>${escapeHtml(nota.tipo)}</td>
            <td>${escapeHtml(nota.nota)}</td>
            <td>${escapeHtml(nota.trimestre)}</td>
        </tr>`;
    });
    html += "</table>";
    contenedor.innerHTML = html;
}

// =========================================================
// 6) TRIMESTRE ACTIVO (funcionalidad que ya existía)
// =========================================================

const selectTrimestre = document.getElementById("selectTrimestre");
const btnGuardarTrimestre = document.getElementById("btnGuardarTrimestre");
const estadoTrimestre = document.getElementById("estadoTrimestre");

async function cargarTrimestreActivo() {
    const { data, error } = await supabase.from("configuracion").select("trimestre_activo").eq("id", 1).single();
    if (error) { console.error(error); return; }
    if (data) {
        selectTrimestre.value = data.trimestre_activo;
        if (selectTrimestreNota) selectTrimestreNota.value = data.trimestre_activo;
    }
}

btnGuardarTrimestre?.addEventListener("click", async () => {
    const trimestreSeleccionado = selectTrimestre.value;
    btnGuardarTrimestre.disabled = true;
    estadoTrimestre.style.color = "#198754";
    estadoTrimestre.textContent = "Guardando...";

    const { error } = await supabase.from("configuracion").update({ trimestre_activo: trimestreSeleccionado }).eq("id", 1);
    btnGuardarTrimestre.disabled = false;

    if (error) {
        estadoTrimestre.style.color = "#dc3545";
        estadoTrimestre.textContent = "❌ Error al guardar";
    } else {
        estadoTrimestre.style.color = "#198754";
        estadoTrimestre.textContent = "✅ Guardado";
    }
    setTimeout(() => { estadoTrimestre.textContent = ""; }, 2000);
});

// =========================================================
// EXPORTAR REPORTE (PDF y JPG) — membrete, notas malas en rojo, firma
// =========================================================

function construirReporteHtml() {
    const salon = selectSalonNota.value;
    const materia = selectMateriaNota.value;
    const trimestre = selectTrimestreNota.value;
    const fechaHoyTexto = new Date().toLocaleDateString("es-PA", { year: "numeric", month: "long", day: "numeric" });

    // Clonamos la tabla actual tal cual está en pantalla (con sus promedios
    // ya calculados), pero sin los botones de eliminar columna ni los
    // inputs editables — solo texto, para que se vea limpio al exportar.
    const tablaOriginal = document.querySelector("#bloqueTablaNotas table");
    const tablaClon = tablaOriginal.cloneNode(true);

    tablaClon.querySelectorAll(".btn-eliminar-columna").forEach((b) => b.remove());
    tablaClon.querySelectorAll("input.input-nota-grupo").forEach((input) => {
        const valor = input.value.trim();
        const numero = valor === "" ? null : parseFloat(valor);
        const td = document.createElement("td");
        td.textContent = valor === "" ? "–" : valor;
        td.style.textAlign = "center";
        td.style.padding = "6px";
        if (numero !== null && numero < PROMEDIO_MINIMO_APROBAR) {
            td.style.color = "#c0392b";
            td.style.fontWeight = "bold";
        }
        input.closest("td").replaceWith(td);
    });
    tablaClon.querySelectorAll("input.input-tema-columna").forEach((input) => {
        const th = document.createElement("th");
        th.textContent = input.value.trim();
        th.style.fontWeight = "normal";
        th.style.fontSize = "11px";
        input.closest("th").replaceWith(th);
    });
    // Notas malas también en la columna de promedio final (ya la marca table-danger,
    // reforzamos el color por si el exportador no respeta las clases de Bootstrap).
    tablaClon.querySelectorAll(".celda-prom-final").forEach((td) => {
        const val = parseFloat(td.textContent);
        if (!isNaN(val) && val < PROMEDIO_MINIMO_APROBAR) {
            td.style.color = "#c0392b";
            td.style.fontWeight = "bold";
        }
    });

    const contenedor = document.createElement("div");
    contenedor.style.cssText = "background:#fff; padding:24px; width:1000px; font-family:Arial, sans-serif; color:#222;";
    contenedor.innerHTML = `
        <div style="text-align:center; margin-bottom:14px;">
            <h2 style="margin:0; color:#1f4e79;">🏫 CENTRO BÁSICO GENERAL EL JIRAL</h2>
            <p style="margin:4px 0 0; font-size:14px;">Reporte de notas · ${fechaHoyTexto}</p>
        </div>
        <table style="width:100%; margin-bottom:14px; font-size:13px;">
            <tr>
                <td><strong>Profesor(a):</strong> ${escapeHtml(nombreProfesor)}</td>
                <td><strong>Materia:</strong> ${escapeHtml(materia)}</td>
            </tr>
            <tr>
                <td><strong>Salón:</strong> ${escapeHtml(salon)}</td>
                <td><strong>Trimestre activo:</strong> ${escapeHtml(trimestre)}</td>
            </tr>
        </table>
        <div id="tablaReporteContenedor"></div>
        <div style="margin-top:60px; display:flex; justify-content:center;">
            <div style="text-align:center;">
                <div style="border-top:1px solid #333; width:280px; margin-bottom:6px;"></div>
                <div style="font-size:13px;">Firma del/de la docente</div>
            </div>
        </div>
    `;
    contenedor.querySelector("#tablaReporteContenedor").appendChild(tablaClon);
    tablaClon.style.width = "100%";
    tablaClon.style.borderCollapse = "collapse";
    tablaClon.querySelectorAll("th, td").forEach((cell) => {
        cell.style.border = "1px solid #ccc";
    });

    return contenedor;
}

async function generarCanvasReporte() {
    const contenedor = construirReporteHtml();
    contenedor.style.position = "fixed";
    contenedor.style.left = "-99999px";
    contenedor.style.top = "0";
    document.body.appendChild(contenedor);

    try {
        const canvas = await html2canvas(contenedor, { scale: 3, backgroundColor: "#ffffff" });
        return canvas;
    } finally {
        contenedor.remove();
    }
}

btnExportarPdf?.addEventListener("click", async () => {
    if (!selectSalonNota.value || !selectMateriaNota.value) return alert("Primero carga un salón y materia.");
    btnExportarPdf.disabled = true;
    btnExportarPdf.textContent = "Generando PDF...";
    try {
        const canvas = await generarCanvasReporte();
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const ratio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
        const w = canvas.width * ratio;
        const h = canvas.height * ratio;
        pdf.addImage(canvas.toDataURL("image/jpeg", 1.0), "JPEG", (pageWidth - w) / 2, 20, w, h);
        pdf.save(`Notas_${selectMateriaNota.value}_${selectSalonNota.value}.pdf`);
    } catch (err) {
        console.error(err);
        alert("No se pudo generar el PDF: " + err.message);
    } finally {
        btnExportarPdf.disabled = false;
        btnExportarPdf.textContent = "📄 Descargar PDF";
    }
});

btnExportarJpg?.addEventListener("click", async () => {
    if (!selectSalonNota.value || !selectMateriaNota.value) return alert("Primero carga un salón y materia.");
    btnExportarJpg.disabled = true;
    btnExportarJpg.textContent = "Generando JPG...";
    try {
        const canvas = await generarCanvasReporte();
        const enlace = document.createElement("a");
        enlace.download = `Notas_${selectMateriaNota.value}_${selectSalonNota.value}.jpg`;
        enlace.href = canvas.toDataURL("image/jpeg", 1.0);
        enlace.click();
    } catch (err) {
        console.error(err);
        alert("No se pudo generar el JPG: " + err.message);
    } finally {
        btnExportarJpg.disabled = false;
        btnExportarJpg.textContent = "🖼️ Descargar JPG";
    }
});

// =========================================================
// INICIO
// =========================================================

// =========================================================
// 7) CONTROL DE ANCHO DE LAS CASILLAS DE NOTA (ajuste manual)
// =========================================================

const rangoAnchoCasilla = document.getElementById("rangoAnchoCasilla");
const valorAnchoCasilla = document.getElementById("valorAnchoCasilla");
const CLAVE_ANCHO_CASILLA = "controlNotas_anchoCasilla";

function aplicarAnchoCasilla(px) {
    document.documentElement.style.setProperty("--ancho-celda-nota", `${px}px`);
    if (valorAnchoCasilla) valorAnchoCasilla.textContent = `${px}px`;
}

function iniciarControlAnchoCasilla() {
    if (!rangoAnchoCasilla) return;

    const guardado = localStorage.getItem(CLAVE_ANCHO_CASILLA);
    const inicial = guardado ? parseInt(guardado, 10) : 68;
    rangoAnchoCasilla.value = inicial;
    aplicarAnchoCasilla(inicial);

    rangoAnchoCasilla.addEventListener("input", () => {
        const px = parseInt(rangoAnchoCasilla.value, 10);
        aplicarAnchoCasilla(px);
        localStorage.setItem(CLAVE_ANCHO_CASILLA, String(px));
    });
}

(async function init() {
    const ok = await verificarSesion();
    if (!ok) return;

    pintarCambiarPanel("profesor", "oscuro-sobre-claro");
    poblarSelectSalon();
    cargarTrimestreActivo();
    iniciarControlAnchoCasilla();
})();
