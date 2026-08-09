import { supabase } from "./supabase.js";

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// =====================================================
// 0) VERIFICAR QUE SEA ADMIN (mismo patrón que asignaciones.js)
// =====================================================
async function verificarAdmin() {
    const { data: { user }, error: errUser } = await supabase.auth.getUser();
    if (errUser || !user) { window.location.href = "login.html"; return false; }

    const { data: perfil, error: errPerfil } = await supabase
        .from("usuarios")
        .select("rol")
        .eq("auth_user_id", user.id)
        .single();

    if (errPerfil || !perfil || perfil.rol !== "admin") {
        alert("⛔ No tienes permisos de administrador.");
        window.location.href = "login.html";
        return false;
    }
    return true;
}

// =====================================================
// 1) ELEMENTOS Y ESTADO
// =====================================================
const contenedorNiveles = document.getElementById("contenedorNiveles");
const mensajeSalones = document.getElementById("mensajeSalones");
const panelFormSalon = document.getElementById("panelFormSalon");
const tituloFormSalon = document.getElementById("tituloFormSalon");
const formSalon = document.getElementById("formSalon");
const salonIdEdicion = document.getElementById("salonIdEdicion");
const inputNivelSalon = document.getElementById("inputNivelSalon");
const inputLetraSalon = document.getElementById("inputLetraSalon");
const paletaColores = document.getElementById("paletaColores");
const btnCancelarSalon = document.getElementById("btnCancelarSalon");

const NOMBRES_NIVEL = { 7: "7° grado", 8: "8° grado", 9: "9° grado" };

// Paleta fija: un color por defecto por nivel + algunas variantes para elegir
const COLORES_DISPONIBLES = [
    "#3f7d6e", "#2f6f62", "#4a8f7f",
    "#cf8b2c", "#e0a23f", "#c77b1a",
    "#8f4f9e", "#a55fb5", "#6a4fb3",
    "#c0575a", "#3f6fb3", "#5f8f4f"
];

let colorSeleccionado = COLORES_DISPONIBLES[0];

function mostrarMensaje(texto, tipo) {
    mensajeSalones.textContent = texto;
    mensajeSalones.className = `alert alert-${tipo}`;
    mensajeSalones.style.display = "block";
    setTimeout(() => { mensajeSalones.style.display = "none"; }, 3500);
}

function pintarPaletaColores() {
    paletaColores.innerHTML = COLORES_DISPONIBLES.map((c) => `
        <span class="swatch ${c === colorSeleccionado ? "seleccionado" : ""}" data-color="${c}" style="background:${c};"></span>
    `).join("");

    paletaColores.querySelectorAll(".swatch").forEach((sw) => {
        sw.addEventListener("click", () => {
            colorSeleccionado = sw.dataset.color;
            pintarPaletaColores();
        });
    });
}

// =====================================================
// 2) CARGAR Y PINTAR LOS SALONES AGRUPADOS POR NIVEL
// =====================================================
async function cargarSalones() {
    contenedorNiveles.innerHTML = "Cargando salones...";

    const { data: salones, error } = await supabase
        .from("salones")
        .select("id, codigo, nivel, letra, nombre_visible, color, orden, activo")
        .order("orden", { ascending: true });

    if (error) {
        contenedorNiveles.innerHTML = `<p class="text-danger">No se pudieron cargar los salones: ${escapeHtml(error.message)}</p>`;
        return;
    }

    if (!salones || salones.length === 0) {
        contenedorNiveles.innerHTML = `<p class="text-muted">Todavía no hay salones creados. Usa "+ Agregar salón" para crear el primero.</p>`;
        return;
    }

    const porNivel = {};
    salones.forEach((s) => {
        if (!porNivel[s.nivel]) porNivel[s.nivel] = [];
        porNivel[s.nivel].push(s);
    });

    const niveles = Object.keys(porNivel).sort((a, b) => a - b);

    contenedorNiveles.innerHTML = niveles.map((nivel) => {
        const lista = porNivel[nivel];
        const tarjetas = lista.map((s) => `
            <div class="tarjeta-salon ${s.activo ? "" : "inactivo"}" style="background:${escapeHtml(s.color)};">
                ${s.activo ? "" : `<span class="badge-inactivo">Desactivado</span>`}
                <div class="nombre-salon">${escapeHtml(s.nombre_visible)}</div>
                <div class="acciones-salon">
                    <button type="button" class="btn-editar-salon" data-id="${s.id}">✎ Editar</button>
                    <button type="button" class="btn-alternar-salon" data-id="${s.id}" data-activo="${s.activo}">
                        ${s.activo ? "Desactivar" : "Activar"}
                    </button>
                    <button type="button" class="btn-eliminar-salon" data-id="${s.id}" data-nombre="${escapeHtml(s.nombre_visible)}">🗑</button>
                </div>
            </div>
        `).join("");

        return `
            <div class="nivel-bloque">
                <div class="titulo-nivel">
                    ${escapeHtml(NOMBRES_NIVEL[nivel] || `Nivel ${nivel}`)}
                    <span class="pastilla-cantidad">${lista.length} salón${lista.length === 1 ? "" : "es"}</span>
                </div>
                <div class="grid-salones">
                    ${tarjetas}
                    <div class="tarjeta-agregar" data-nivel="${nivel}">+ Agregar salón</div>
                </div>
            </div>
        `;
    }).join("") + `
        <div class="nivel-bloque">
            <div class="grid-salones" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr));">
                <div class="tarjeta-agregar" id="btnAgregarNivelNuevo">+ Agregar salón (otro nivel)</div>
            </div>
        </div>
    `;

    // -------- Editar --------
    contenedorNiveles.querySelectorAll(".btn-editar-salon").forEach((btn) => {
        btn.addEventListener("click", () => {
            const salon = salones.find((s) => String(s.id) === btn.dataset.id);
            if (salon) abrirFormEdicion(salon);
        });
    });

    // -------- Activar / desactivar --------
    contenedorNiveles.querySelectorAll(".btn-alternar-salon").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const activoActual = btn.dataset.activo === "true";
            const { error: errUpdate } = await supabase
                .from("salones")
                .update({ activo: !activoActual })
                .eq("id", btn.dataset.id);

            if (errUpdate) {
                mostrarMensaje("No se pudo actualizar: " + errUpdate.message, "danger");
                return;
            }
            cargarSalones();
        });
    });

    // -------- Eliminar --------
    contenedorNiveles.querySelectorAll(".btn-eliminar-salon").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const confirmar = confirm(
                `¿Eliminar el salón "${btn.dataset.nombre}"? Esto no borra las notas ni asignaciones ya guardadas con ese código, ` +
                `pero dejará de aparecer como opción para elegir. Si solo quieres ocultarlo temporalmente, usa "Desactivar" en su lugar.`
            );
            if (!confirmar) return;

            const { error: errDelete } = await supabase.from("salones").delete().eq("id", btn.dataset.id);
            if (errDelete) {
                mostrarMensaje("No se pudo eliminar: " + errDelete.message, "danger");
                return;
            }
            mostrarMensaje("Salón eliminado.", "success");
            cargarSalones();
        });
    });

    // -------- Agregar (tarjeta "+" dentro de un nivel ya existente) --------
    contenedorNiveles.querySelectorAll(".tarjeta-agregar[data-nivel]").forEach((tarjeta) => {
        tarjeta.addEventListener("click", () => abrirFormNuevo(tarjeta.dataset.nivel));
    });

    const btnAgregarNivelNuevo = document.getElementById("btnAgregarNivelNuevo");
    if (btnAgregarNivelNuevo) {
        btnAgregarNivelNuevo.addEventListener("click", () => abrirFormNuevo(""));
    }
}

// =====================================================
// 3) FORMULARIO (crear / editar) — un solo form reutilizado
// =====================================================
function abrirFormNuevo(nivelSugerido) {
    tituloFormSalon.textContent = "Nuevo salón";
    salonIdEdicion.value = "";
    if (nivelSugerido) inputNivelSalon.value = nivelSugerido;
    inputLetraSalon.value = "";
    colorSeleccionado = COLORES_DISPONIBLES[Math.floor(Math.random() * COLORES_DISPONIBLES.length)];
    pintarPaletaColores();
    panelFormSalon.style.display = "block";
    panelFormSalon.scrollIntoView({ behavior: "smooth" });
    inputLetraSalon.focus();
}

function abrirFormEdicion(salon) {
    tituloFormSalon.textContent = `Editando ${salon.nombre_visible}`;
    salonIdEdicion.value = salon.id;
    inputNivelSalon.value = salon.nivel;
    inputLetraSalon.value = salon.letra;
    colorSeleccionado = salon.color;
    pintarPaletaColores();
    panelFormSalon.style.display = "block";
    panelFormSalon.scrollIntoView({ behavior: "smooth" });
}

btnCancelarSalon.addEventListener("click", () => {
    panelFormSalon.style.display = "none";
    formSalon.reset();
});

formSalon.addEventListener("submit", async (e) => {
    e.preventDefault();

    const nivel = parseInt(inputNivelSalon.value, 10);
    const letra = inputLetraSalon.value.trim().toUpperCase();

    if (!letra) {
        mostrarMensaje("Escribe la letra del salón (ej. A, B, C).", "warning");
        return;
    }

    const codigo = `${nivel}${letra}`;
    const nombreVisible = `${nivel}°${letra}`;

    const datosSalon = {
        codigo,
        nivel,
        letra,
        nombre_visible: nombreVisible,
        color: colorSeleccionado
    };

    let resultado;
    if (salonIdEdicion.value) {
        resultado = await supabase.from("salones").update(datosSalon).eq("id", salonIdEdicion.value);
    } else {
        resultado = await supabase.from("salones").insert([{ ...datosSalon, orden: 999, activo: true }]);
    }

    if (resultado.error) {
        if (resultado.error.message?.includes("duplicate") || resultado.error.code === "23505") {
            mostrarMensaje(`Ya existe un salón con el código "${codigo}".`, "warning");
        } else {
            mostrarMensaje("No se pudo guardar: " + resultado.error.message, "danger");
        }
        return;
    }

    mostrarMensaje(`✅ Salón "${nombreVisible}" guardado.`, "success");
    panelFormSalon.style.display = "none";
    formSalon.reset();
    cargarSalones();
});

// =====================================================
// INICIO
// =====================================================
(async function init() {
    const ok = await verificarAdmin();
    if (!ok) return;
    pintarPaletaColores();
    cargarSalones();
})();
