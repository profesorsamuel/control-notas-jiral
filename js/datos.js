import { supabase } from "./supabase.js";

const form = document.getElementById("datosForm");
const mensaje = document.getElementById("mensaje");
const btnGuardar = document.getElementById("btnGuardarDatos");

let filaExistente = null;

// =====================================================
// MOSTRAR MENSAJE
// =====================================================

function mostrarMensaje(texto, tipo) {

    mensaje.textContent = texto;
    mensaje.className = `mensaje ${tipo}`;

}

// =====================================================
// CARGAR DATOS EXISTENTES (si ya los había llenado antes)
// =====================================================

async function cargarDatos() {

    const {
        data: { user },
        error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {

        window.location.href = "login.html";

        return;
    }

    const { data, error } = await supabase
        .from("datos_estudiante")
        .select("*")
        .eq("correo", user.email)
        .maybeSingle();

    if (error) {

        console.error("❌ Error al cargar los datos:", error);

        return;
    }

    if (data) {

        filaExistente = data;

        document.getElementById("nombreApellido").value = data.nombre_apellido ?? "";
        document.getElementById("cedula").value = data.cedula ?? "";
        document.getElementById("fechaNacimiento").value = data.fecha_nacimiento ?? "";
        document.getElementById("genero").value = data.genero ?? "";
        document.getElementById("celularEstudiante").value = data.celular_estudiante ?? "";
        document.getElementById("nombrePadreAcudiente").value = data.nombre_padre_acudiente ?? "";
        document.getElementById("celularAcudiente1").value = data.celular_acudiente1 ?? "";
        document.getElementById("telefonoAcudiente2").value = data.telefono_acudiente2 ?? "";
        document.getElementById("correoContacto").value = data.correo_contacto ?? "";

        btnGuardar.textContent = "💾 Actualizar datos";

    }

}

cargarDatos();

// =====================================================
// GUARDAR (INSERTAR O ACTUALIZAR)
// =====================================================

form.addEventListener("submit", async (e) => {

    e.preventDefault();

    const {
        data: { user },
        error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {

        window.location.href = "login.html";

        return;
    }

    const registro = {

        correo: user.email,

        nombre_apellido: document.getElementById("nombreApellido").value.trim(),
        cedula: document.getElementById("cedula").value.trim(),
        fecha_nacimiento: document.getElementById("fechaNacimiento").value,
        genero: document.getElementById("genero").value,
        celular_estudiante: document.getElementById("celularEstudiante").value.trim(),
        nombre_padre_acudiente: document.getElementById("nombrePadreAcudiente").value.trim(),
        celular_acudiente1: document.getElementById("celularAcudiente1").value.trim(),
        telefono_acudiente2: document.getElementById("telefonoAcudiente2").value.trim(),
        correo_contacto: document.getElementById("correoContacto").value.trim()

    };

    btnGuardar.disabled = true;

    let error;

    if (filaExistente) {

        // Ya existía una fila: actualizar
        ({ error } = await supabase
            .from("datos_estudiante")
            .update(registro)
            .eq("correo", user.email));

    } else {

        // Primera vez: insertar
        ({ error } = await supabase
            .from("datos_estudiante")
            .insert([registro]));

    }

    btnGuardar.disabled = false;

    if (error) {

        console.error("❌ Error al guardar los datos:", error);

        mostrarMensaje("❌ Error al guardar: " + error.message, "error");

        return;
    }

    mostrarMensaje("✅ Datos guardados correctamente.", "exito");

    filaExistente = registro;

    btnGuardar.textContent = "💾 Actualizar datos";

});
