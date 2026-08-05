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
    // 5) BOTONES DE RECARGA
    // =================================================

    btnRecargarUsuarios.addEventListener("click", cargarUsuarios);
    btnRecargarNotas.addEventListener("click", cargarNotas);

    // Carga inicial
    cargarUsuarios();
    cargarNotas();

});