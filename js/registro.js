import { supabase } from "./supabase.js";
import { cedulaAEmail, usuarioAEmail } from "./utils.js";

const form = document.getElementById("registroForm");
const tipoRegistro = document.getElementById("tipoRegistro");
const salonInput = document.getElementById("salon");
const grupoSalon = document.getElementById("grupoSalon");
const camposEstudiante = document.getElementById("camposEstudiante");
const camposConsejero = document.getElementById("camposConsejero");
const camposProfesor = document.getElementById("camposProfesor");
const mensaje = document.getElementById("mensaje");
const btnRegistrar = document.getElementById("btnRegistrar");
const nombreSelect = document.getElementById("nombre");
const nombreConsejeroSelect = document.getElementById("nombreConsejero");
const correoConsejeroInput = document.getElementById("correoConsejero");
const nombreProfesorSelect = document.getElementById("nombreProfesor");

// Se guarda tal cual viene en el HTML (8°A, 9°A, 9°B, 9°C) para poder
// restaurarla cuando el tipo de registro sea "Estudiante", ya que a
// los estudiantes SÍ se les debe mostrar cualquier salón sin importar
// si el consejero de ese salón ya se registró o no.
const salonesTodasOpcionesHTML = salonInput.innerHTML;

// =====================================================
// MOSTRAR MENSAJES EN PANTALLA (en vez de alert)
// =====================================================
function mostrarMensaje(texto, tipo) {
    mensaje.textContent = texto;
    mensaje.className = `mensaje ${tipo}`;
}

// =====================================================
// ALTERNAR CAMPOS SEGÚN TIPO DE REGISTRO
// =====================================================
function actualizarCampos() {
    const tipo = tipoRegistro.value; // "estudiante" | "consejero" | "profesor"
    const esConsejero = tipo === "consejero";
    const esProfesor = tipo === "profesor";

    camposEstudiante.style.display = (esConsejero || esProfesor) ? "none" : "block";
    camposConsejero.style.display = esConsejero ? "block" : "none";
    camposProfesor.style.display = esProfesor ? "block" : "none";

    nombreSelect.required = !esConsejero && !esProfesor;
    document.getElementById("cedula").required = !esConsejero && !esProfesor;
    nombreConsejeroSelect.required = esConsejero;
    correoConsejeroInput.required = esConsejero;
    nombreProfesorSelect.required = esProfesor;
    document.getElementById("cedulaProfesor").required = esProfesor;

    if (esProfesor) {
        cargarProfesoresDisponibles();
    }

    if (esProfesor) {

        // Un profesor puede dar clases en varios salones a la vez
        // (ya definidos en Asignaciones), así que aquí no se pide salón.
        grupoSalon.style.display = "none";
        salonInput.required = false;
        salonInput.value = "";

    } else if (esConsejero) {

        grupoSalon.style.display = "block";
        salonInput.required = true;

        // Para consejero(a): el salón solo debe mostrar las opciones
        // donde TODAVÍA falte alguien por registrarse. Si el consejero
        // de 9°C ya tiene cuenta, 9°C ni siquiera debe aparecer aquí.
        cargarSalonesDisponiblesParaConsejero();

    } else {

        grupoSalon.style.display = "block";
        salonInput.required = true;

        // Para estudiante: se restauran los 4 salones fijos, porque
        // siempre puede haber estudiantes de ese salón sin registrar,
        // sin importar el estado del consejero.
        salonInput.innerHTML = salonesTodasOpcionesHTML;
        salonInput.disabled = false;

        if (salonInput.value) {
            cargarNombresDisponibles();
        }
    }
}

tipoRegistro.addEventListener("change", actualizarCampos);

// =====================================================
// PRESELECCIONAR EL TIPO DE REGISTRO SEGÚN LA URL
// (viene desde la página de inicio, ej. registro.html?tipo=consejero)
// =====================================================
//
// Cuando la persona llega desde un link que ya indica su tipo
// (por ejemplo la tarjeta "Soy Consejero(a)/Docente" de inicio.html),
// ya sabemos quién se está registrando: no tiene sentido volver a
// preguntarle. En ese caso se oculta el selector "¿Quién se registra?"
// y se muestra un texto fijo en su lugar.

const grupoTipoRegistro = document.getElementById("grupoTipoRegistro");
const avisoTipoPreseleccionado = document.getElementById("avisoTipoPreseleccionado");
const textoTipoPreseleccionado = document.getElementById("textoTipoPreseleccionado");
const tituloRegistro = document.getElementById("tituloRegistro");

const TITULOS_POR_TIPO = {
    consejero: "Registro de Consejero(a)",
    profesor: "Registro de Profesor(a)",
    estudiante: "Registro de Estudiante"
};

const TEXTOS_PRESELECCION = {
    consejero: "Te estás registrando como Consejero(a).",
    profesor: "Te estás registrando como Profesor(a).",
    estudiante: "Te estás registrando como Estudiante."
};

function preseleccionarTipoDesdeURL() {
    const parametros = new URLSearchParams(window.location.search);
    const tipoParam = (parametros.get("tipo") || "").toLowerCase();

    if (tipoParam === "consejero" || tipoParam === "estudiante" || tipoParam === "profesor") {
        tipoRegistro.value = tipoParam;

        if (grupoTipoRegistro && avisoTipoPreseleccionado && textoTipoPreseleccionado) {
            grupoTipoRegistro.style.display = "none";
            avisoTipoPreseleccionado.style.display = "block";
            textoTipoPreseleccionado.textContent = TEXTOS_PRESELECCION[tipoParam];
        }

        if (tituloRegistro) {
            tituloRegistro.textContent = TITULOS_POR_TIPO[tipoParam];
        }

        document.title = `${TITULOS_POR_TIPO[tipoParam]} - Control de Notas`;
    }
}

preseleccionarTipoDesdeURL();
actualizarCampos();

// =====================================================
// PRE-LLENADO "PASO 1": llega desde "Ver mis notas"
// (consulta.html) con ?cedula=... ya identificada
// =====================================================
//
// En vez de hacerle elegir su nombre de una lista larga, ya sabemos
// exactamente quién es (por la cédula que escribió en consulta.html),
// así que se le confirma su nombre/salón y solo falta la contraseña.

const avisoPrefillEstudiante = document.getElementById("avisoPrefillEstudiante");
const textoPrefillEstudiante = document.getElementById("textoPrefillEstudiante");

async function precargarDesdeConsulta() {
    const parametros = new URLSearchParams(window.location.search);
    const cedulaParam = parametros.get("cedula");

    if (!cedulaParam || tipoRegistro.value !== "estudiante") return;

    const { data, error } = await supabase.rpc("buscar_estudiante_para_registro", { p_cedula: cedulaParam });
    const encontrado = Array.isArray(data) ? data[0] : data;

    if (error || !encontrado) {
        mostrarMensaje("No se pudo identificar al estudiante. Por favor completa el formulario manualmente.", "error");
        return;
    }

    if (encontrado.correo) {
        mostrarMensaje("Esta cédula ya tiene una cuenta registrada. Si eres tú, inicia sesión en vez de registrarte de nuevo.", "error");
        return;
    }

    // Bloquea el salón en el que ya sabemos que está
    if (encontrado.salon) {
        salonInput.innerHTML = salonesTodasOpcionesHTML;
        salonInput.value = encontrado.salon;
        salonInput.disabled = true;
    }

    // Reemplaza el select de nombre por una sola opción ya confirmada,
    // con los mismos data-codigo / data-id que usa registrarEstudiante()
    // para vincular las notas que el admin ya le haya puesto antes.
    const nombreEscapado = String(encontrado.nombre || "").replace(/"/g, "&quot;");
    nombreSelect.innerHTML = `<option value="${nombreEscapado}" data-codigo="${encontrado.codigo ?? ""}" data-id="${encontrado.id ?? ""}" selected>${encontrado.nombre}</option>`;
    nombreSelect.disabled = true;

    // Cédula ya confirmada, no hace falta volver a escribirla
    const cedulaInput = document.getElementById("cedula");
    cedulaInput.value = cedulaParam;
    cedulaInput.readOnly = true;

    if (avisoPrefillEstudiante) {
        textoPrefillEstudiante.textContent =
            `Hola, ${encontrado.nombre}. Ya tenemos tu nombre, salón y cédula. Solo elige la contraseña que vas a usar.`;
        avisoPrefillEstudiante.style.display = "block";
    }

    // Reemplaza el encabezado fijo ("C.E.B.G. EL JIRAL / Consejería...")
    // por el nombre del estudiante, igual que hace login.html cuando
    // llega con la cédula ya identificada.
    const tituloRegistroEl = document.getElementById("tituloRegistro");
    const subtituloRegistroEl = document.getElementById("subtituloRegistro");
    if (tituloRegistroEl) tituloRegistroEl.textContent = encontrado.nombre;
    if (subtituloRegistroEl) subtituloRegistroEl.textContent = "Registro de estudiante";
}

precargarDesdeConsulta();

// =====================================================
// CARGAR LA LISTA DE ESTUDIANTES DISPONIBLES DEL SALÓN
// =====================================================
//
// Ya NO se usa una lista fija en el HTML. Aquí se consulta la tabla
// "estudiantes" (la misma que usan el panel del consejero y del
// docente) filtrando por el salón elegido, y se muestran SOLO los
// estudiantes que todavía NO tienen una cuenta creada (correo vacío).
//
// Así, en cuanto un estudiante se registra, su nombre desaparece de
// esta lista para todos los demás, y nadie más puede registrarse
// haciéndose pasar por él/ella.

async function cargarNombresDisponibles() {
    const salon = salonInput.value;

    nombreSelect.innerHTML = `<option value="">Seleccione primero un salón</option>`;
    nombreSelect.disabled = true;

    if (!salon) {
        return;
    }

    nombreSelect.innerHTML = `<option value="">Cargando estudiantes...</option>`;

    const { data: estudiantesSalon, error } = await supabase
        .from("estudiantes")
        .select("id, codigo, nombre, correo")
        .eq("salon", salon)
        .order("nombre", { ascending: true });

    if (error) {
        console.error("❌ Error al cargar la lista de estudiantes:", error);
        nombreSelect.innerHTML = `<option value="">No se pudo cargar la lista. Recarga la página.</option>`;
        return;
    }

    if ((estudiantesSalon || []).length === 0) {
        nombreSelect.innerHTML = `<option value="">Este salón aún no tiene estudiantes cargados. Contacta al administrador.</option>`;
        return;
    }

    const disponibles = (estudiantesSalon || []).filter((e) => !e.correo);

    if (disponibles.length === 0) {
        nombreSelect.innerHTML = `<option value="">Todos los estudiantes de este salón ya tienen cuenta</option>`;
        return;
    }

    const opciones = disponibles.map((e) => {
        const nombreEscapado = String(e.nombre).replace(/"/g, "&quot;");
        return `<option value="${nombreEscapado}" data-codigo="${e.codigo}" data-id="${e.id}">${e.nombre}</option>`;
    }).join("");

    nombreSelect.innerHTML = `<option value="">Seleccione un estudiante</option>${opciones}`;
    nombreSelect.disabled = false;
}

// =====================================================
// CARGAR SOLO LOS SALONES CON CONSEJERO(A) PENDIENTE
// =====================================================
//
// Se usa únicamente cuando el tipo de registro es "Consejero(a)".
// Consulta TODA la tabla "consejeros" y arma la lista de salones
// quedándose solo con los que tienen al menos un registro con
// "registrado" = false. Así, si el consejero de 9°C ya se registró,
// 9°C deja de aparecer como opción en el select de Salón.

const ORDEN_SALONES = ["8A", "9A", "9B", "9C"];
const ETIQUETAS_SALONES = { "8A": "8°A", "9A": "9°A", "9B": "9°B", "9C": "9°C" };

async function cargarSalonesDisponiblesParaConsejero() {

    const salonPrevio = salonInput.value;

    salonInput.innerHTML = `<option value="">Cargando salones...</option>`;
    salonInput.disabled = true;

    const { data: consejerosTodos, error } = await supabase
        .from("consejeros")
        .select("salon, registrado");

    if (error) {
        console.error("❌ Error al cargar salones disponibles para consejero(a):", error);
        // Si falla la consulta, se muestra la lista completa como respaldo
        // en vez de dejar al usuario sin poder elegir nada.
        salonInput.innerHTML = salonesTodasOpcionesHTML;
        salonInput.disabled = false;
        return;
    }

    const salonesConPendiente = new Set(
        (consejerosTodos || [])
            .filter((c) => !c.registrado)
            .map((c) => c.salon)
    );

    if (salonesConPendiente.size === 0) {
        salonInput.innerHTML = `<option value="">Todos los salones ya tienen su consejero(a) registrado(a)</option>`;
        salonInput.disabled = true;
        nombreConsejeroSelect.innerHTML = `<option value="">Seleccione primero un salón</option>`;
        nombreConsejeroSelect.disabled = true;
        correoConsejeroInput.value = "";
        return;
    }

    const opciones = ORDEN_SALONES
        .filter((s) => salonesConPendiente.has(s))
        .map((s) => `<option value="${s}">${ETIQUETAS_SALONES[s] || s}</option>`)
        .join("");

    salonInput.innerHTML = `<option value="">Seleccione un salón</option>${opciones}`;
    salonInput.disabled = false;

    // Si el salón que tenía elegido sigue disponible, se mantiene
    // seleccionado y se recarga el nombre del consejero de una vez.
    if (salonPrevio && salonesConPendiente.has(salonPrevio)) {
        salonInput.value = salonPrevio;
        await cargarConsejerosDisponibles();
    }
}

// =====================================================
// CARGAR EL/LA CONSEJERO(A) DISPONIBLE DEL SALÓN
// =====================================================
//
// Igual que con los estudiantes: se consulta la tabla "consejeros"
// filtrando por el salón elegido, y se muestra SOLO si esa persona
// todavía NO se ha registrado (columna "registrado" = false). En
// cuanto alguien se registra, deja de aparecer en la lista.

async function cargarConsejerosDisponibles() {
    const salon = salonInput.value;

    nombreConsejeroSelect.innerHTML = `<option value="">Seleccione primero un salón</option>`;
    nombreConsejeroSelect.disabled = true;
    correoConsejeroInput.value = "";

    if (!salon) {
        return;
    }

    nombreConsejeroSelect.innerHTML = `<option value="">Cargando...</option>`;

    const { data: consejerosSalon, error } = await supabase
        .from("consejeros")
        .select("correo, usuario, nombre, registrado")
        .eq("salon", salon);

    if (error) {
        console.error("❌ Error al cargar el/la consejero(a) del salón:", error);
        nombreConsejeroSelect.innerHTML = `<option value="">No se pudo cargar. Recarga la página.</option>`;
        return;
    }

    if ((consejerosSalon || []).length === 0) {
        nombreConsejeroSelect.innerHTML = `<option value="">Este salón aún no tiene consejero(a) asignado(a). Contacta al administrador.</option>`;
        return;
    }

    const disponibles = (consejerosSalon || []).filter((c) => !c.registrado);

    if (disponibles.length === 0) {
        const yaRegistrado = consejerosSalon[0];
        nombreConsejeroSelect.innerHTML =
            `<option value="">El/la consejero(a) de este salón (${yaRegistrado.nombre || yaRegistrado.usuario || yaRegistrado.correo}) ya tiene cuenta</option>`;
        return;
    }

    // Identificador para iniciar sesión: se usa "usuario" (ej. "JUANA2026").
    // Si algún consejero(a) todavía no tiene un "usuario" asignado en la
    // base de datos, se usa su correo como respaldo (para no dejarlo
    // sin poder registrarse).
    const idLogin = (c) => c.usuario || c.correo;

    // -------------------------------------------------
    // CASO NORMAL: un solo consejero(a) pendiente en el salón
    // -------------------------------------------------
    // No tiene sentido pedirle que "elija su nombre de una lista"
    // si solo hay una persona posible. Se autoselecciona y se
    // completa el usuario de una vez; el select queda bloqueado
    // (deshabilitado) solo para que se vea el nombre confirmado.
    if (disponibles.length === 1) {
        const unico = disponibles[0];
        const nombreEscapado = String(unico.nombre || idLogin(unico)).replace(/"/g, "&quot;");
        const usuarioEscapado = String(idLogin(unico)).replace(/"/g, "&quot;");

        nombreConsejeroSelect.innerHTML =
            `<option value="${nombreEscapado}" data-usuario="${usuarioEscapado}" selected>${unico.nombre || idLogin(unico)}</option>`;
        nombreConsejeroSelect.disabled = true;

        correoConsejeroInput.value = idLogin(unico);
        return;
    }

    // -------------------------------------------------
    // CASO POCO COMÚN: más de un consejero(a) pendiente
    // (por ejemplo si el administrador asignó dos personas
    // al mismo salón). Aquí sí se le pide elegir de la lista.
    // -------------------------------------------------
    const opciones = disponibles.map((c) => {
        const nombreEscapado = String(c.nombre || idLogin(c)).replace(/"/g, "&quot;");
        const usuarioEscapado = String(idLogin(c)).replace(/"/g, "&quot;");
        return `<option value="${nombreEscapado}" data-usuario="${usuarioEscapado}">${c.nombre || idLogin(c)}</option>`;
    }).join("");

    nombreConsejeroSelect.innerHTML = `<option value="">Seleccione su nombre</option>${opciones}`;
    nombreConsejeroSelect.disabled = false;
}

// Al elegir el nombre, se completa automáticamente el usuario que le
// corresponde (el mismo que ya tenía asignado ese salón)
nombreConsejeroSelect.addEventListener("change", () => {
    const usuarioSeleccionado = nombreConsejeroSelect.selectedOptions?.[0]?.dataset?.usuario || "";
    correoConsejeroInput.value = usuarioSeleccionado;
});

// =====================================================
// CARGAR LA LISTA DE PROFESORES(AS) DISPONIBLES
// =====================================================
//
// Igual que con consejero(a): se consulta la tabla "profesores" y
// se muestran SOLO quienes todavía NO tienen cuenta creada
// (columna "registrado" = false). Cada opción guarda en
// data-correo el correo_profesor "pendiente.xxx@notasjiral.local"
// que el administrador puso al agregar a esa persona a la lista;
// ese valor se usa después para saber qué fila actualizar al
// completar el registro (ver registrarProfesor).

async function cargarProfesoresDisponibles() {

    nombreProfesorSelect.innerHTML = `<option value="">Cargando...</option>`;
    nombreProfesorSelect.disabled = true;

    const { data: profesoresTodos, error } = await supabase
        .from("profesores")
        .select("correo_profesor, nombre_profesor, registrado")
        .order("nombre_profesor", { ascending: true });

    if (error) {
        console.error("❌ Error al cargar la lista de profesores(as):", error);
        nombreProfesorSelect.innerHTML = `<option value="">No se pudo cargar. Recarga la página.</option>`;
        return;
    }

    const disponibles = (profesoresTodos || []).filter((p) => !p.registrado);

    if (disponibles.length === 0) {
        nombreProfesorSelect.innerHTML = `<option value="">No hay profesores(as) pendientes. Contacta al administrador.</option>`;
        return;
    }

    const opciones = disponibles.map((p) => {
        const nombreEscapado = String(p.nombre_profesor).replace(/"/g, "&quot;");
        const correoEscapado = String(p.correo_profesor).replace(/"/g, "&quot;");
        return `<option value="${nombreEscapado}" data-correo="${correoEscapado}">${p.nombre_profesor}</option>`;
    }).join("");

    nombreProfesorSelect.innerHTML = `<option value="">Seleccione su nombre</option>${opciones}`;
    nombreProfesorSelect.disabled = false;
}

salonInput.addEventListener("change", () => {
    if (tipoRegistro.value === "consejero") {
        cargarConsejerosDisponibles();
    } else if (tipoRegistro.value === "estudiante") {
        cargarNombresDisponibles();
    }
});

// Por si la página carga con un salón ya elegido (poco común, pero
// por si el navegador restaura el valor del formulario)
if (salonInput.value) {
    if (tipoRegistro.value === "consejero") {
        cargarConsejerosDisponibles();
    } else if (tipoRegistro.value === "estudiante") {
        cargarNombresDisponibles();
    }
}

// =====================================================
// ENVÍO DEL FORMULARIO
// =====================================================
form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const tipo = tipoRegistro.value;
    const esConsejero = tipo === "consejero";
    const esProfesor = tipo === "profesor";
    const salon = salonInput.value;
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    if (!esProfesor && !salon) {
        mostrarMensaje("Por favor, seleccione el salón.", "error");
        return;
    }

    if (password !== confirmPassword) {
        mostrarMensaje("Las contraseñas no coinciden.", "error");
        return;
    }

    btnRegistrar.disabled = true;
    mostrarMensaje("Registrando...", "cargando");

    if (esConsejero) {
        await registrarConsejero(salon, password);
    } else if (esProfesor) {
        await registrarProfesor(password);
    } else {
        await registrarEstudiante(salon, password);
    }
});

// =====================================================
// REGISTRO DE ESTUDIANTE
// =====================================================
async function registrarEstudiante(salon, password) {
    const nombre = nombreSelect.value;
    const codigoSeleccionado = nombreSelect.selectedOptions?.[0]?.dataset?.codigo || null;
    const idSeleccionado = nombreSelect.selectedOptions?.[0]?.dataset?.id || null;
    const cedula = document.getElementById("cedula").value.trim();

    if (!nombre) {
        btnRegistrar.disabled = false;
        mostrarMensaje("Por favor, seleccione el nombre del estudiante.", "error");
        return;
    }

    if (!cedula) {
        btnRegistrar.disabled = false;
        mostrarMensaje("Por favor, ingrese la cédula del estudiante.", "error");
        return;
    }

    // -------------------------------------------------
    // ÚLTIMA VERIFICACIÓN ANTES DE REGISTRAR
    // -------------------------------------------------
    // Por si alguien más registró a este mismo estudiante mientras
    // esta persona tenía el formulario abierto (o la lista quedó
    // desactualizada por cualquier motivo), se vuelve a confirmar
    // que ese estudiante SIGUE sin cuenta antes de crear una nueva.
    if (codigoSeleccionado) {
        const { data: chequeo, error: errChequeo } = await supabase
            .from("estudiantes")
            .select("correo")
            .eq("codigo", codigoSeleccionado)
            .maybeSingle();

        if (!errChequeo && chequeo?.correo) {
            btnRegistrar.disabled = false;
            mostrarMensaje(
                "⚠️ Este estudiante ya tiene una cuenta registrada. Si eres tú, inicia sesión en vez de registrarte de nuevo.",
                "error"
            );
            await cargarNombresDisponibles();
            return;
        }
    }

    const emailInterno = cedulaAEmail(cedula);

    const { error } = await supabase.auth.signUp({
        email: emailInterno,
        password,
        options: {
            data: {
                nombre,
                cedula,
                rol: "estudiante",
                salon
            }
        }
    });

    if (error) {
        btnRegistrar.disabled = false;

        if (error.message.includes("already registered")) {
            mostrarMensaje("Esta cédula ya está registrada. Intenta iniciar sesión.", "error");
        } else {
            mostrarMensaje(error.message, "error");
        }
        return;
    }

    // Guarda/actualiza rol y salón en datos_estudiante
    // (upsert: si la fila no existe la crea; si ya existe la actualiza)
    const { error: errorTabla } = await supabase
        .from("datos_estudiante")
        .upsert(
            {
                correo: emailInterno,
                nombre_apellido: nombre,
                cedula,
                rol: "estudiante",
                salon
            },
            { onConflict: "correo" }
        );

    if (errorTabla) {
        console.error("Error al guardar rol/salón del estudiante:", errorTabla);
    }

    // -------------------------------------------------
    // VINCULAR ESTA CUENTA CON LA FILA DEL ESTUDIANTE
    // -------------------------------------------------
    // Sin este paso, el estudiante puede iniciar sesión y guardar
    // notas con normalidad, pero el panel del consejero(a) nunca
    // las va a encontrar: ese panel busca las notas comparando
    // "notas.correo" contra "estudiantes.correo", y ese campo
    // se queda vacío si no se actualiza aquí.
    if (codigoSeleccionado) {
        const { error: errorEstudiante } = await supabase
            .from("estudiantes")
            .update({ correo: emailInterno })
            .eq("codigo", codigoSeleccionado);

        if (errorEstudiante) {
            console.error("Error al vincular el correo en 'estudiantes':", errorEstudiante);
        }
    }

    // -------------------------------------------------
    // VINCULAR NOTAS "PROVISIONALES" QUE EL ADMINISTRADOR
    // YA LE HAYA PUESTO ANTES DE QUE ESTE ESTUDIANTE TUVIERA CUENTA
    // -------------------------------------------------
    // El panel de admin puede guardar notas de un estudiante sin
    // cuenta usando "notas.estudiante_id" (en vez de "notas.correo",
    // que todavía no existía). Ahora que el estudiante ya se registró,
    // esas notas se actualizan para que también tengan su correo, y
    // así aparezcan en el panel del consejero(a) y en su propio panel.
    if (idSeleccionado) {
        const { error: errorNotasVinculo } = await supabase
            .from("notas")
            .update({ correo: emailInterno })
            .eq("estudiante_id", idSeleccionado)
            .is("correo", null);

        if (errorNotasVinculo) {
            console.error("Error al vincular notas previas del estudiante:", errorNotasVinculo);
        }
    }

    btnRegistrar.disabled = false;
    mostrarMensaje("✅ Estudiante registrado correctamente.", "exito");
    form.reset();
    actualizarCampos();

    // Refresca la lista para que este estudiante ya no aparezca
    if (salonInput.value) {
        await cargarNombresDisponibles();
    }
}

// =====================================================
// REGISTRO DE CONSEJERO(A)
// =====================================================
async function registrarConsejero(salon, password) {
    const nombreConsejero = nombreConsejeroSelect.value;
    const usuarioIngresado = correoConsejeroInput.value.trim();

    if (!nombreConsejero || !usuarioIngresado) {
        btnRegistrar.disabled = false;
        mostrarMensaje("Por favor, seleccione su nombre de la lista.", "error");
        return;
    }

    // El usuario (ej. "JUANA2026") no es un correo real; se convierte
    // a un correo interno único para poder usar Supabase Auth, igual
    // que se hace con la cédula de los estudiantes.
    const emailInterno = usuarioAEmail(usuarioIngresado);

    // -------------------------------------------------
    // ÚLTIMA VERIFICACIÓN ANTES DE REGISTRAR
    // -------------------------------------------------
    // Por si alguien más ya registró esta cuenta mientras esta
    // persona tenía el formulario abierto. Se busca por "usuario"
    // (con respaldo por "correo" para quien todavía no tenga
    // usuario asignado en la base de datos).
    const { data: chequeo, error: errChequeo } = await supabase
        .from("consejeros")
        .select("registrado, nombre")
        .or(`usuario.eq.${usuarioIngresado},correo.eq.${usuarioIngresado}`)
        .maybeSingle();

    if (!errChequeo && chequeo?.registrado) {
        btnRegistrar.disabled = false;
        mostrarMensaje(
            `⚠️ ${chequeo.nombre || "Esta persona"} ya tiene una cuenta registrada. Si eres tú, inicia sesión en vez de registrarte de nuevo.`,
            "error"
        );
        await cargarConsejerosDisponibles();
        return;
    }

    const { error } = await supabase.auth.signUp({
        email: emailInterno,
        password,
        options: {
            data: {
                nombre: nombreConsejero,
                usuario: usuarioIngresado,
                rol: "consejero",
                salon
            }
        }
    });

    if (error) {
        btnRegistrar.disabled = false;

        if (error.message.includes("already registered")) {
            mostrarMensaje("Este usuario ya está registrado. Intenta iniciar sesión.", "error");
        } else {
            mostrarMensaje(error.message, "error");
        }
        return;
    }

    // Se actualiza (no se inserta una fila nueva) la fila que ya
    // existía para este salón, marcándola como registrada. Se guarda
    // el correo interno recién creado en "correo" (así el resto del
    // sistema —login, panel del consejero, panel de admin— sigue
    // funcionando igual, comparando contra "correo" como siempre).
    const { error: errorTabla } = await supabase
        .from("consejeros")
        .update({
            nombre: nombreConsejero,
            usuario: usuarioIngresado,
            correo: emailInterno,
            rol: "consejero",
            registrado: true
        })
        .or(`usuario.eq.${usuarioIngresado},correo.eq.${usuarioIngresado}`);

    if (errorTabla) {
        console.error("Error al actualizar datos del consejero:", errorTabla);
    }

    btnRegistrar.disabled = false;
    mostrarMensaje("✅ Consejero(a) registrado(a) correctamente.", "exito");
    form.reset();
    actualizarCampos();

    // Refresca la lista para que ya no aparezca disponible
    if (salonInput.value) {
        await cargarConsejerosDisponibles();
    }
}

// =====================================================
// REGISTRO DE PROFESOR(A)
// =====================================================
//
// El profesor(a) elige su nombre de la lista (agregada antes por
// el administrador en la tabla "profesores") y completa su cédula,
// que es lo que va a usar para iniciar sesión (igual que hace un
// estudiante). El teléfono y los correos (Meduca/personal) son
// solo datos de contacto, no se usan para iniciar sesión.
async function registrarProfesor(password) {
    const nombre = nombreProfesorSelect.value;
    const correoPendiente = nombreProfesorSelect.selectedOptions?.[0]?.dataset?.correo || "";
    const cedula = document.getElementById("cedulaProfesor").value.trim();
    const telefono = document.getElementById("telefonoProfesor").value.trim();
    const fechaNacimiento = document.getElementById("fechaNacimientoProfesor").value || null;
    const correoMeduca = document.getElementById("correoMeducaProfesor").value.trim().toLowerCase();
    const correoPersonal = document.getElementById("correoPersonalProfesor").value.trim().toLowerCase();

    if (!nombre || !correoPendiente) {
        btnRegistrar.disabled = false;
        mostrarMensaje("Por favor, seleccione su nombre de la lista.", "error");
        return;
    }

    if (!cedula) {
        btnRegistrar.disabled = false;
        mostrarMensaje("Por favor, ingrese su cédula.", "error");
        return;
    }

    // -------------------------------------------------
    // ÚLTIMA VERIFICACIÓN ANTES DE REGISTRAR
    // -------------------------------------------------
    const { data: chequeo, error: errChequeo } = await supabase
        .from("profesores")
        .select("registrado, nombre_profesor")
        .eq("correo_profesor", correoPendiente)
        .maybeSingle();

    if (!errChequeo && chequeo?.registrado) {
        btnRegistrar.disabled = false;
        mostrarMensaje(
            `⚠️ ${chequeo.nombre_profesor || "Esta persona"} ya tiene una cuenta registrada. Si eres tú, inicia sesión en vez de registrarte de nuevo.`,
            "error"
        );
        await cargarProfesoresDisponibles();
        return;
    }

    // La cédula se convierte a un correo interno único para poder usar
    // Supabase Auth (igual que se hace con la cédula del estudiante).
    const emailInterno = cedulaAEmail(cedula);

    const { error } = await supabase.auth.signUp({
        email: emailInterno,
        password,
        options: {
            data: {
                nombre,
                cedula,
                rol: "profesor"
            }
        }
    });

    if (error) {
        btnRegistrar.disabled = false;

        if (error.message.includes("already registered")) {
            mostrarMensaje("Esta cédula ya está registrada. Intenta iniciar sesión.", "error");
        } else {
            mostrarMensaje(error.message, "error");
        }
        return;
    }

    // Actualiza la fila que ya existía (agregada por el administrador),
    // reemplazando el correo temporal "pendiente.xxx@..." por el correo
    // interno real generado a partir de la cédula, y guardando los
    // demás datos de contacto.
    const { error: errorTabla } = await supabase
        .from("profesores")
        .update({
            correo_profesor: emailInterno,
            nombre_profesor: nombre,
            cedula,
            telefono: telefono || null,
            fecha_nacimiento: fechaNacimiento,
            correo_meduca: correoMeduca || null,
            correo_personal: correoPersonal || null,
            registrado: true,
            actualizado_en: new Date().toISOString()
        })
        .eq("correo_profesor", correoPendiente);

    if (errorTabla) {
        console.error("Error al actualizar datos del profesor(a):", errorTabla);
    }

    btnRegistrar.disabled = false;
    mostrarMensaje("✅ Profesor(a) registrado(a) correctamente. Ya puedes iniciar sesión con tu cédula.", "exito");
    form.reset();
    actualizarCampos();
}
