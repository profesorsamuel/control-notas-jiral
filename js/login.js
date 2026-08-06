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
    //
    // Dos caminos posibles, según lo que la persona escriba
    // en el Paso 1:
    //   - Si escribe un CORREO (contiene "@"): se asume que es
    //     consejero(a)/profesor(a) y se manda el enlace de
    //     Supabase por correo (como ya funcionaba antes).
    //   - Si escribe una CÉDULA (sin "@"): se asume estudiante,
    //     se le muestran sus 3 preguntas de seguridad y, si las
    //     responde bien, puede escribir una contraseña nueva ahí
    //     mismo (sin necesitar correo real).

    const linkOlvido = document.getElementById("linkOlvidoPassword");
    const modalEl = document.getElementById("modalOlvidoPassword");

    const formPaso1 = document.getElementById("formOlvidoPaso1");
    const inputIdentificador = document.getElementById("identificadorRecuperar");
    const mensajePaso1 = document.getElementById("mensajeOlvidoPaso1");
    const btnContinuarRecuperar = document.getElementById("btnContinuarRecuperar");

    const formPreguntas = document.getElementById("formOlvidoPreguntas");
    const mensajePreguntas = document.getElementById("mensajeOlvidoPreguntas");
    const btnCambiarPasswordPreguntas = document.getElementById("btnCambiarPasswordPreguntas");

    let modalOlvido = null;
    let correoParaPreguntas = null; // se guarda entre el paso 1 y el paso 2

    function mostrarMensaje(elemento, texto, tipo) {
        elemento.textContent = texto;
        elemento.className = `alert alert-${tipo}`;
    }

    function volverAlPaso1() {
        formPreguntas.classList.add("d-none");
        formPaso1.classList.remove("d-none");
        formPreguntas.reset();
        mensajePreguntas.className = "alert d-none";
    }

    if (linkOlvido && modalEl) {

        linkOlvido.addEventListener("click", (e) => {
            e.preventDefault();

            correoParaPreguntas = null;
            mensajePaso1.className = "alert d-none";
            mensajePreguntas.className = "alert d-none";
            formPaso1.reset();
            formPreguntas.reset();
            formPreguntas.classList.add("d-none");
            formPaso1.classList.remove("d-none");

            modalOlvido = new bootstrap.Modal(modalEl);
            modalOlvido.show();
        });
    }

    // =================================================
    // ENLACE DIRECTO ENVIADO POR EL ADMINISTRADOR
    // =================================================
    //
    // Si el enlace incluye ?recuperarCorreo=..., se salta el
    // Paso 1 (no hace falta escribir la cédula) y se muestran
    // las preguntas de seguridad directamente. Así el admin
    // puede mandar un enlace listo por WhatsApp o correo.

    const parametrosUrl = new URLSearchParams(window.location.search);
    const correoDesdeEnlace = parametrosUrl.get("recuperarCorreo");

    if (correoDesdeEnlace && modalEl) {
        (async () => {
            const { data: tienePreguntas, error } = await supabase.rpc(
                "tiene_preguntas_seguridad",
                { p_correo: correoDesdeEnlace }
            );

            modalOlvido = new bootstrap.Modal(modalEl);

            if (error || !tienePreguntas) {
                formPaso1.classList.remove("d-none");
                formPreguntas.classList.add("d-none");
                mostrarMensaje(
                    mensajePaso1,
                    "⚠️ Esta cuenta todavía no tiene preguntas de seguridad configuradas. Pídele al administrador que las configure primero.",
                    "warning"
                );
                modalOlvido.show();
                return;
            }

            correoParaPreguntas = correoDesdeEnlace;
            mensajePreguntas.className = "alert d-none";
            formPaso1.classList.add("d-none");
            formPreguntas.classList.remove("d-none");
            modalOlvido.show();
        })();
    }

    if (formPaso1) {

        formPaso1.addEventListener("submit", async (e) => {

            e.preventDefault();

            const valor = inputIdentificador.value.trim();
            if (!valor) return;

            const esCorreo = valor.includes("@");

            btnContinuarRecuperar.disabled = true;
            btnContinuarRecuperar.textContent = "Un momento...";

            if (esCorreo) {

                // ----- CAMINO CONSEJERO/PROFESOR: enlace por correo -----
                const redirectTo = `${window.location.origin}/pages/reset-password.html`;

                const { error } = await supabase.auth.resetPasswordForEmail(
                    valor.toLowerCase(),
                    { redirectTo }
                );

                btnContinuarRecuperar.disabled = false;
                btnContinuarRecuperar.textContent = "Continuar";

                if (error) {
                    console.error("❌ Error al enviar el correo de recuperación:", error);
                    mostrarMensaje(mensajePaso1, "❌ " + error.message, "danger");
                    return;
                }

                mostrarMensaje(
                    mensajePaso1,
                    "✅ Si el correo existe, se envió un enlace para restablecer la contraseña. Revisa tu bandeja de entrada (y spam).",
                    "success"
                );

                return;
            }

            // ----- CAMINO ESTUDIANTE: cédula + preguntas de seguridad -----

            const { data: correoEncontrado, error: errCorreo } =
                await supabase.rpc("obtener_correo_login", { p_cedula: valor });

            if (errCorreo || !correoEncontrado) {
                btnContinuarRecuperar.disabled = false;
                btnContinuarRecuperar.textContent = "Continuar";
                mostrarMensaje(mensajePaso1, "❌ No encontramos ninguna cuenta con esa cédula.", "danger");
                return;
            }

            const { data: tienePreguntas, error: errTiene } =
                await supabase.rpc("tiene_preguntas_seguridad", { p_correo: correoEncontrado });

            btnContinuarRecuperar.disabled = false;
            btnContinuarRecuperar.textContent = "Continuar";

            if (errTiene) {
                console.error("❌ Error al verificar preguntas de seguridad:", errTiene);
                mostrarMensaje(mensajePaso1, "❌ Ocurrió un error, intenta de nuevo.", "danger");
                return;
            }

            if (!tienePreguntas) {
                mostrarMensaje(
                    mensajePaso1,
                    "⚠️ Tu cuenta todavía no tiene preguntas de seguridad configuradas. Pídele al profesor(a) o al administrador que te las configure.",
                    "warning"
                );
                return;
            }

            // Todo listo: se pasa al paso 2 (preguntas + nueva contraseña)
            correoParaPreguntas = correoEncontrado;
            mensajePaso1.className = "alert d-none";
            formPaso1.classList.add("d-none");
            formPreguntas.classList.remove("d-none");
        });
    }

    if (formPreguntas) {

        formPreguntas.addEventListener("submit", async (e) => {

            e.preventDefault();

            if (!correoParaPreguntas) {
                volverAlPaso1();
                return;
            }

            const respuesta1 = document.getElementById("respuesta1").value.trim();
            const respuesta2 = document.getElementById("respuesta2").value.trim();
            const respuesta3 = document.getElementById("respuesta3").value.trim();
            const nuevaPassword = document.getElementById("nuevaPasswordPreguntas").value;
            const confirmarPassword = document.getElementById("confirmarPasswordPreguntas").value;

            if (nuevaPassword.length < 6) {
                mostrarMensaje(mensajePreguntas, "⚠️ La contraseña debe tener al menos 6 caracteres.", "warning");
                return;
            }

            if (nuevaPassword !== confirmarPassword) {
                mostrarMensaje(mensajePreguntas, "⚠️ Las contraseñas no coinciden.", "warning");
                return;
            }

            btnCambiarPasswordPreguntas.disabled = true;
            btnCambiarPasswordPreguntas.textContent = "Verificando...";

            const { data: resultado, error } = await supabase.rpc(
                "restablecer_contrasena_con_preguntas",
                {
                    p_correo: correoParaPreguntas,
                    p_respuesta1: respuesta1,
                    p_respuesta2: respuesta2,
                    p_respuesta3: respuesta3,
                    p_nueva_contrasena: nuevaPassword
                }
            );

            btnCambiarPasswordPreguntas.disabled = false;
            btnCambiarPasswordPreguntas.textContent = "Cambiar contraseña";

            if (error) {
                console.error("❌ Error al restablecer la contraseña:", error);
                mostrarMensaje(mensajePreguntas, "❌ Ocurrió un error, intenta de nuevo.", "danger");
                return;
            }

            switch (resultado) {
                case "ok":
                    mostrarMensaje(mensajePreguntas, "✅ Contraseña actualizada. Ya puedes iniciar sesión con tu nueva contraseña.", "success");
                    formPreguntas.reset();
                    setTimeout(() => {
                        if (modalOlvido) modalOlvido.hide();
                    }, 2000);
                    break;
                case "incorrecto":
                    mostrarMensaje(mensajePreguntas, "❌ Alguna de las respuestas no es correcta. Intenta de nuevo.", "danger");
                    break;
                case "bloqueado":
                    mostrarMensaje(mensajePreguntas, "🔒 Demasiados intentos fallidos. Espera 15 minutos e intenta de nuevo, o pide ayuda al administrador.", "danger");
                    break;
                case "no_configurado":
                    mostrarMensaje(mensajePreguntas, "⚠️ Tu cuenta no tiene preguntas de seguridad configuradas.", "warning");
                    break;
                case "usuario_no_encontrado":
                    mostrarMensaje(mensajePreguntas, "❌ No se encontró la cuenta. Contacta al administrador.", "danger");
                    break;
                case "password_corta":
                    mostrarMensaje(mensajePreguntas, "⚠️ La contraseña debe tener al menos 6 caracteres.", "warning");
                    break;
                default:
                    mostrarMensaje(mensajePreguntas, "❌ Ocurrió un error inesperado.", "danger");
            }
        });
    }

});