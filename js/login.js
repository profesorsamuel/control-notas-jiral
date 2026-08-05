import { supabase } from "./supabase.js";
import { usuarioAEmail } from "./utils.js";

// =================================================
// SELECTOR DE ROL (correos con doble función)
// =================================================
//
// Se muestra únicamente cuando el correo que inició sesión
// tiene rol de administrador Y también aparece en la tabla
// de consejeros. El usuario elige con qué panel quiere
// trabajar en esta sesión.

function mostrarSelectorDeRol(consejeroEncontrado) {

    const modalEl = document.getElementById("modalElegirRol");
    const btnAdmin = document.getElementById("btnEntrarComoAdmin");
    const btnConsejero = document.getElementById("btnEntrarComoConsejero");
    const salonSpan = document.getElementById("salonConsejeroBtn");

    if (!modalEl || !btnAdmin || !btnConsejero) {
        // Si por alguna razón el modal no existe en el HTML,
        // se cae al admin como comportamiento por defecto.
        sessionStorage.setItem("rolActivo", "admin");
        window.location.href = "admin.html";
        return;
    }

    if (salonSpan && consejeroEncontrado && consejeroEncontrado.salon) {
        salonSpan.textContent = ` (${consejeroEncontrado.salon})`;
    }

    const modal = new bootstrap.Modal(modalEl);

    btnAdmin.addEventListener("click", () => {
        sessionStorage.setItem("rolActivo", "admin");
        window.location.href = "admin.html";
    }, { once: true });

    btnConsejero.addEventListener("click", () => {
        sessionStorage.setItem("rolActivo", "consejero");
        window.location.href = "consejero.html";
    }, { once: true });

    modal.show();
}

document.addEventListener("DOMContentLoaded", () => {

    const loginForm = document.getElementById("loginForm");

    if (!loginForm) {
        console.error("❌ No existe el formulario con id='loginForm'");
        return;
    }

    loginForm.addEventListener("submit", async (event) => {

        event.preventDefault();

        const correoInput = document.getElementById("correo");
        const passwordInput = document.getElementById("password");

        if (!correoInput || !passwordInput) {
            console.error("❌ No se encontraron los campos correo/password");
            alert("❌ Error: faltan campos del formulario.");
            return;
        }

        const valorIngresado = correoInput.value.trim();
        const password = passwordInput.value;

        if (valorIngresado === "" || password === "") {
            alert("⚠️ Escribe tu cédula (o correo) y tu contraseña.");
            return;
        }

        // =================================================
        // DETECTAR SI ES CÉDULA, USUARIO DE CONSEJERO(A), O CORREO
        // =================================================
        //
        // - Si contiene "@" se asume que es un correo real
        //   (por ejemplo, la cuenta de un consejero/profesor
        //   que todavía usa su correo real).
        // - Si no contiene "@", puede ser:
        //     (a) una cédula de estudiante, o
        //     (b) el "usuario" de un consejero(a), ej. "JUANA2026".
        //   Se prueba primero como cédula; si no se encuentra,
        //   se prueba como usuario de consejero(a).

        const esCorreoReal = valorIngresado.includes("@");

        let correo;

        if (esCorreoReal) {

            correo = valorIngresado.toLowerCase();

        } else {

            // 1) Se intenta primero como cédula de estudiante
            const { data: correoEncontrado, error: errBusqueda } =
                await supabase.rpc("obtener_correo_login", {
                    p_cedula: valorIngresado
                });

            if (!errBusqueda && correoEncontrado) {

                correo = correoEncontrado;

            } else {

                // 2) No fue una cédula conocida: se revisa si es el
                // usuario de un consejero(a) ya registrado (ej. "JUANA2026").
                const { data: consejeroPorUsuario } = await supabase
                    .from("consejeros")
                    .select("correo")
                    .eq("usuario", valorIngresado.toUpperCase())
                    .maybeSingle();

                correo = consejeroPorUsuario?.correo
                    ? consejeroPorUsuario.correo
                    : usuarioAEmail(valorIngresado); // respaldo por si acaso
            }
        }

        try {

            console.log("🔄 Intentando iniciar sesión...");
            console.log(
                esCorreoReal ? "📧 Correo:" : "🪪 Cédula:",
                valorIngresado
            );

            const { data, error } =
                await supabase.auth.signInWithPassword({
                    email: correo,
                    password: password
                });

            if (error) {

                console.error("❌ ERROR DE SUPABASE:");
                console.error(error);

                alert("❌ " + error.message);

                return;
            }

            console.log("✅ Inicio de sesión correcto");
            console.log("👤 Usuario:", data.user);

            alert("✅ Inicio de sesión correcto");

            /*
             * ¿ES CUENTA DE ADMINISTRADOR?
             * Se busca en "usuarios" (por auth_user_id, que es
             * el UUID real de la sesión) si el rol es "admin".
             */
            const { data: perfilLogin, error: errPerfilLogin } = await supabase
                .from("usuarios")
                .select("rol")
                .eq("auth_user_id", data.user.id)
                .single();

            console.log("🛡️ Perfil de usuario (para revisar rol):", perfilLogin, "Error:", errPerfilLogin);

            const esAdmin = !errPerfilLogin && perfilLogin && perfilLogin.rol === "admin";

            /*
             * ¿ES CUENTA DE CONSEJERO(A)?
             * Se busca en la tabla "consejeros", que asocia cada
             * correo con su salón (9A, 9B, 9C, 8A...).
             *
             * IMPORTANTE: ya NO se corta el flujo apenas se sabe
             * que es admin, porque un mismo correo puede tener
             * los dos roles a la vez (admin y consejero). Se
             * revisan ambos primero y se decide al final.
             */
            const correoLoginNormalizado = (correo || "").trim().toLowerCase();

            const { data: consejerosParaLogin, error: errConsejerosLogin } = await supabase
                .from("consejeros")
                .select("correo, salon, nombre");

            console.log("📋 Consejeros (para decidir a dónde redirigir):", consejerosParaLogin, "Error:", errConsejerosLogin);

            const consejeroEncontrado = (!errConsejerosLogin && Array.isArray(consejerosParaLogin))
                ? consejerosParaLogin.find((c) => (c.correo || "").trim().toLowerCase() === correoLoginNormalizado) || null
                : null;

            /*
             * DECISIÓN FINAL
             * - Si tiene AMBOS roles (admin y consejero), se le
             *   muestra un modal para que elija con cuál entrar.
             * - Si solo tiene uno, se manda directo a ese panel.
             * - Si no tiene ninguno, se asume estudiante.
             */
            if (esAdmin && consejeroEncontrado) {

                console.log("🔀 Esta cuenta tiene ambos roles. Mostrando selector...");

                mostrarSelectorDeRol(consejeroEncontrado);

            } else if (esAdmin) {

                console.log("🛡️ Acceso como administrador");

                sessionStorage.setItem("rolActivo", "admin");
                window.location.href = "admin.html";

            } else if (consejeroEncontrado) {

                console.log("👨‍🏫 Acceso como consejero(a) de", consejeroEncontrado.salon);

                sessionStorage.setItem("rolActivo", "consejero");
                window.location.href = "consejero.html";

            } else {

                console.log("👨‍🎓 Acceso como estudiante");

                window.location.href = "estudiante.html";
            }

        } catch (error) {

            console.error("❌ ERROR INESPERADO:");
            console.error(error);

            alert(
                "❌ Error al iniciar sesión: " +
                (error.message || "Error desconocido")
            );
        }

    });

    // =================================================
    // RECUPERAR CONTRASEÑA (¿Olvidaste tu contraseña?)
    // =================================================

    const linkOlvido = document.getElementById("linkOlvidoPassword");
    const modalEl = document.getElementById("modalOlvidoPassword");
    const formOlvido = document.getElementById("formOlvidoPassword");
    const mensajeOlvido = document.getElementById("mensajeOlvidoPassword");
    const btnEnviarRecuperar = document.getElementById("btnEnviarRecuperar");

    let modalOlvido = null;

    if (linkOlvido && modalEl) {

        linkOlvido.addEventListener("click", (e) => {
            e.preventDefault();

            mensajeOlvido.className = "alert d-none";
            formOlvido.reset();

            modalOlvido = new bootstrap.Modal(modalEl);
            modalOlvido.show();
        });
    }

    if (formOlvido) {

        formOlvido.addEventListener("submit", async (e) => {

            e.preventDefault();

            const correo = document.getElementById("correoRecuperar").value.trim().toLowerCase();

            if (!correo) return;

            btnEnviarRecuperar.disabled = true;
            btnEnviarRecuperar.textContent = "Enviando...";

            // IMPORTANTE: esta URL debe estar agregada en Supabase,
            // en Authentication > URL Configuration > Redirect URLs.
            const redirectTo = `${window.location.origin}/pages/reset-password.html`;

            const { error } = await supabase.auth.resetPasswordForEmail(correo, {
                redirectTo
            });

            btnEnviarRecuperar.disabled = false;
            btnEnviarRecuperar.textContent = "Enviar enlace";

            if (error) {
                console.error("❌ Error al enviar el correo de recuperación:", error);
                mensajeOlvido.textContent = "❌ " + error.message;
                mensajeOlvido.className = "alert alert-danger";
                return;
            }

            mensajeOlvido.textContent = "✅ Si el correo existe, se envió un enlace para restablecer la contraseña. Revisa tu bandeja de entrada (y spam).";
            mensajeOlvido.className = "alert alert-success";
        });
    }

});