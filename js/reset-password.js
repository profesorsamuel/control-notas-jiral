import { supabase } from "./supabase.js";

const form = document.getElementById("resetForm");
const mensaje = document.getElementById("mensaje");
const btnGuardar = document.getElementById("btnGuardar");
const descripcion = document.getElementById("descripcion");

// =====================================================
// MOSTRAR MENSAJE
// =====================================================

function mostrarMensaje(texto, tipo) {
    mensaje.textContent = texto;
    mensaje.className = `mensaje ${tipo}`;
}

// =====================================================
// VERIFICAR QUE EL ENLACE DE RECUPERACIÓN SEA VÁLIDO
// =====================================================
//
// Supabase envía al usuario aquí con un token especial
// en la URL (después del #). El cliente de Supabase lo
// detecta automáticamente y crea una sesión temporal
// que solo sirve para cambiar la contraseña.

supabase.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") {
        descripcion.textContent = "Enlace verificado. Ya puedes escribir tu nueva contraseña.";
    }
});

// Si después de un momento no hay sesión, el enlace es inválido o expiró
setTimeout(async () => {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
        descripcion.textContent = "";
        mostrarMensaje(
            "❌ Este enlace no es válido o ya expiró. Solicita uno nuevo desde el panel de Supabase o pide ayuda al consejero.",
            "error"
        );
        btnGuardar.disabled = true;
    }
}, 1500);

// =====================================================
// GUARDAR LA NUEVA CONTRASEÑA
// =====================================================

form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    if (password.length < 6) {
        mostrarMensaje("⚠️ La contraseña debe tener al menos 6 caracteres.", "error");
        return;
    }

    if (password !== confirmPassword) {
        mostrarMensaje("⚠️ Las contraseñas no coinciden.", "error");
        return;
    }

    btnGuardar.disabled = true;
    btnGuardar.textContent = "Guardando...";

    const { error } = await supabase.auth.updateUser({ password });

    btnGuardar.disabled = false;
    btnGuardar.textContent = "💾 Guardar nueva contraseña";

    if (error) {
        console.error("❌ Error al actualizar la contraseña:", error);
        mostrarMensaje("❌ Error: " + error.message, "error");
        return;
    }

    mostrarMensaje("✅ Contraseña actualizada. Ya puedes iniciar sesión con ella.", "exito");

    form.reset();

    setTimeout(() => {
        window.location.href = "login.html";
    }, 2000);
});