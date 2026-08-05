import { supabase } from "./supabase.js";
import { cedulaAEmail } from "./utils.js";

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
        // DETECTAR SI ES CÉDULA O CORREO
        // =================================================
        //
        // - Si contiene "@" se asume que es un correo real
        //   (por ejemplo, la cuenta del consejero/profesor).
        // - Si no contiene "@" se asume que es una cédula de
        //   estudiante, y se convierte al correo interno.

        const esCorreoReal = valorIngresado.includes("@");

        let correo;

        if (esCorreoReal) {

            correo = valorIngresado.toLowerCase();

        } else {

            // Es una cédula: buscamos el correo real de acceso
            // (puede ser el interno @notasjiral.local, o uno real
            // si el consejero ya lo cambió desde su panel).
            const { data: correoEncontrado, error: errBusqueda } =
                await supabase.rpc("obtener_correo_login", {
                    p_cedula: valorIngresado
                });

            correo = (!errBusqueda && correoEncontrado)
                ? correoEncontrado
                : cedulaAEmail(valorIngresado); // respaldo por si acaso
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
             * Si lo es, se manda directo al panel de admin y
             * no se sigue evaluando si es consejero o estudiante.
             */
            const { data: perfilLogin, error: errPerfilLogin } = await supabase
                .from("usuarios")
                .select("rol")
                .eq("auth_user_id", data.user.id)
                .single();

            console.log("🛡️ Perfil de usuario (para revisar rol):", perfilLogin, "Error:", errPerfilLogin);

            if (!errPerfilLogin && perfilLogin && perfilLogin.rol === "admin") {

                console.log("🛡️ Acceso como administrador");

                window.location.href = "admin.html";
                return;
            }

            /*
             * ¿ES CUENTA DE CONSEJERO(A)?
             * Antes se comparaba contra un solo correo fijo.
             * Ahora se busca en la tabla "consejeros", que
             * asocia cada correo con su salón (9A, 9B, 9C, 8A...).
             */
            const correoLoginNormalizado = (correo || "").trim().toLowerCase();

            const { data: consejerosParaLogin, error: errConsejerosLogin } = await supabase
                .from("consejeros")
                .select("correo, salon, nombre");

            console.log("📋 Consejeros (para decidir a dónde redirigir):", consejerosParaLogin, "Error:", errConsejerosLogin);

            const consejeroEncontrado = (!errConsejerosLogin && Array.isArray(consejerosParaLogin))
                ? consejerosParaLogin.find((c) => (c.correo || "").trim().toLowerCase() === correoLoginNormalizado) || null
                : null;

            if (consejeroEncontrado) {

                console.log("👨‍🏫 Acceso como consejero(a) de", consejeroEncontrado.salon);

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