import { supabase } from "./supabase.js";
import { cedulaAEmail } from "./utils.js";

const form = document.getElementById("registroForm");
const tipoRegistro = document.getElementById("tipoRegistro");
const salonInput = document.getElementById("salon");
const camposEstudiante = document.getElementById("camposEstudiante");
const camposConsejero = document.getElementById("camposConsejero");
const mensaje = document.getElementById("mensaje");
const btnRegistrar = document.getElementById("btnRegistrar");
const nombreSelect = document.getElementById("nombre");
const nombreConsejeroSelect = document.getElementById("nombreConsejero");
const correoConsejeroInput = document.getElementById("correoConsejero");

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
    const esConsejero = tipoRegistro.value === "consejero";

    camposEstudiante.style.display = esConsejero ? "none" : "block";
    camposConsejero.style.display = esConsejero ? "block" : "none";

    nombreSelect.required = !esConsejero;
    document.getElementById("cedula").required = !esConsejero;
    nombreConsejeroSelect.required = esConsejero;
    correoConsejeroInput.required = esConsejero;

    if (salonInput.value) {
        if (esConsejero) {
            cargarConsejerosDisponibles();
        } else {
            cargarNombresDisponibles();
        }
    }
}

tipoRegistro.addEventListener("change", actualizarCampos);

// =====================================================
// PRESELECCIONAR EL TIPO DE REGISTRO SEGÚN LA URL
// (viene desde la página de inicio, ej. registro.html?tipo=consejero)
// =====================================================
function preseleccionarTipoDesdeURL() {
    const parametros = new URLSearchParams(window.location.search);
    const tipoParam = (parametros.get("tipo") || "").toLowerCase();

    if (tipoParam === "consejero" || tipoParam === "estudiante") {
        tipoRegistro.value = tipoParam;
    }
}

preseleccionarTipoDesdeURL();
actualizarCampos();

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
        .select("codigo, nombre, correo")
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
        return `<option value="${nombreEscapado}" data-codigo="${e.codigo}">${e.nombre}</option>`;
    }).join("");

    nombreSelect.innerHTML = `<option value="">Seleccione un estudiante</option>${opciones}`;
    nombreSelect.disabled = false;
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
        .select("correo, nombre, registrado")
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
            `<option value="">El/la consejero(a) de este salón (${yaRegistrado.nombre || yaRegistrado.correo}) ya tiene cuenta</option>`;
        return;
    }

    const opciones = disponibles.map((c) => {
        const nombreEscapado = String(c.nombre || c.correo).replace(/"/g, "&quot;");
        const correoEscapado = String(c.correo).replace(/"/g, "&quot;");
        return `<option value="${nombreEscapado}" data-correo="${correoEscapado}">${c.nombre || c.correo}</option>`;
    }).join("");

    nombreConsejeroSelect.innerHTML = `<option value="">Seleccione su nombre</option>${opciones}`;
    nombreConsejeroSelect.disabled = false;
}

// Al elegir el nombre, se completa automáticamente el correo que le
// corresponde (el mismo que ya tenía asignado ese salón)
nombreConsejeroSelect.addEventListener("change", () => {
    const correoSeleccionado = nombreConsejeroSelect.selectedOptions?.[0]?.dataset?.correo || "";
    correoConsejeroInput.value = correoSeleccionado;
});

salonInput.addEventListener("change", () => {
    if (tipoRegistro.value === "consejero") {
        cargarConsejerosDisponibles();
    } else {
        cargarNombresDisponibles();
    }
});

// Por si la página carga con un salón ya elegido (poco común, pero
// por si el navegador restaura el valor del formulario)
if (salonInput.value) {
    if (tipoRegistro.value === "consejero") {
        cargarConsejerosDisponibles();
    } else {
        cargarNombresDisponibles();
    }
}

// =====================================================
// ENVÍO DEL FORMULARIO
// =====================================================
form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const esConsejero = tipoRegistro.value === "consejero";
    const salon = salonInput.value;
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    if (!salon) {
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
    const correoReal = correoConsejeroInput.value.trim();

    if (!nombreConsejero || !correoReal) {
        btnRegistrar.disabled = false;
        mostrarMensaje("Por favor, seleccione su nombre de la lista.", "error");
        return;
    }

    // -------------------------------------------------
    // ÚLTIMA VERIFICACIÓN ANTES DE REGISTRAR
    // -------------------------------------------------
    // Por si alguien más ya registró esta cuenta mientras esta
    // persona tenía el formulario abierto.
    const { data: chequeo, error: errChequeo } = await supabase
        .from("consejeros")
        .select("registrado, nombre")
        .eq("correo", correoReal)
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
        email: correoReal,
        password,
        options: {
            data: {
                nombre: nombreConsejero,
                rol: "consejero",
                salon
            }
        }
    });

    if (error) {
        btnRegistrar.disabled = false;

        if (error.message.includes("already registered")) {
            mostrarMensaje("Este correo ya está registrado. Intenta iniciar sesión.", "error");
        } else {
            mostrarMensaje(error.message, "error");
        }
        return;
    }

    // Se actualiza (no se inserta una fila nueva) la fila que ya
    // existía para este salón, marcándola como registrada.
    const { error: errorTabla } = await supabase
        .from("consejeros")
        .update({
            nombre: nombreConsejero,
            rol: "consejero",
            registrado: true
        })
        .eq("correo", correoReal);

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