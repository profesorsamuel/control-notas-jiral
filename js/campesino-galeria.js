import { supabase } from "./supabase.js";
import { buscarReina } from "./campesino-datos.js";
import { DOCENTES, claveEsperada } from "./campesino-docentes.js";

const BUCKET = "campesino-reinas";
const CLAVE_STORAGE_KEY = "campesinoAcceso"; // { docente, clave }

const parametros = new URLSearchParams(window.location.search);
const slug = (parametros.get("reina") || "").trim();
const reina = buscarReina(slug);

const chipNivel = document.getElementById("chipNivel");
const tituloReina = document.getElementById("tituloReina");
const detalleReina = document.getElementById("detalleReina");
const galeria = document.getElementById("galeria");
const vacioAviso = document.getElementById("vacioAviso");
const formSubir = document.getElementById("formSubir");
const archivosFoto = document.getElementById("archivosFoto");
const nombreQuienSube = document.getElementById("nombreQuienSube");
const btnSubir = document.getElementById("btnSubir");
const estadoSubida = document.getElementById("estadoSubida");
const estadoAdmin = document.getElementById("estadoAdmin");
const estadoAcceso2 = document.getElementById("estadoAcceso2");
const visor = document.getElementById("visor");
const imgVisor = document.getElementById("imgVisor");
const cerrarVisor = document.getElementById("cerrarVisor");

const perfilContenido = document.getElementById("perfilContenido");
const perfilEditarDetalle = document.getElementById("perfilEditarDetalle");
const formPerfil = document.getElementById("formPerfil");
const pNombreReina = document.getElementById("pNombreReina");
const pComida = document.getElementById("pComida");
const pCurioso = document.getElementById("pCurioso");
const pRisa = document.getElementById("pRisa");
const pSiGana = document.getElementById("pSiGana");
const btnGuardarPerfil = document.getElementById("btnGuardarPerfil");
const estadoPerfil = document.getElementById("estadoPerfil");

const accesoCard = document.getElementById("accesoCard");
const subirCard = document.getElementById("subirCard");
const formAcceso = document.getElementById("formAcceso");
const docenteAcceso = document.getElementById("docenteAcceso");
const claveAcceso = document.getElementById("claveAcceso");
const estadoAcceso = document.getElementById("estadoAcceso");

let esAdmin = false;
let accesoDocente = null; // { docente, clave } una vez validado

// =========================================================
// Encabezado: nombre de la reina
// =========================================================
if (!reina) {
    tituloReina.textContent = "Reina no encontrada";
    detalleReina.textContent = "Vuelve a la lista de reinas y elige una tarjeta.";
    formSubir.style.display = "none";
    accesoCard.style.display = "none";
} else {
    chipNivel.textContent = reina.nivel === "primaria" ? "Reinado de Primaria" : "Reinado de Premedia";
    tituloReina.textContent = `Reina de ${reina.nombre}`;
    detalleReina.textContent = reina.detalle;
    document.title = `Reina de ${reina.nombre} · Galería · Día del Campesino 2026`;
}

// =========================================================
// Selector de docentes en el formulario de acceso
// =========================================================
docenteAcceso.insertAdjacentHTML(
    "beforeend",
    DOCENTES.map((nombre) => `<option value="${nombre}">${nombre}</option>`).join("")
);

// =========================================================
// Acceso de docente: hace falta para subir fotos o tocar el perfil.
// Se valida aquí para dar una respuesta inmediata, y de nuevo en
// Supabase (RLS) al guardar, que es lo que realmente protege los datos.
// =========================================================
function revelarFormulariosDocente() {
    accesoCard.classList.add("oculto");
    subirCard.classList.remove("oculto");
    perfilEditarDetalle.classList.remove("oculto");
    estadoAcceso2.innerHTML = `<span class="badge-acceso">🔑 ${escaparHTML(accesoDocente.docente)} <button type="button" id="btnSalirAcceso">Salir</button></span>`;
    document.getElementById("btnSalirAcceso").addEventListener("click", () => {
        sessionStorage.removeItem(CLAVE_STORAGE_KEY);
        window.location.reload();
    });
    if (!nombreQuienSube.value) nombreQuienSube.value = accesoDocente.docente;
}

function cargarAccesoGuardado() {
    try {
        const guardado = JSON.parse(sessionStorage.getItem(CLAVE_STORAGE_KEY) || "null");
        if (guardado && guardado.docente && guardado.clave && claveEsperada(guardado.docente) === guardado.clave.toLowerCase()) {
            accesoDocente = guardado;
            revelarFormulariosDocente();
        }
    } catch {
        // ignora sesión corrupta
    }
}

formAcceso.addEventListener("submit", (evento) => {
    evento.preventDefault();
    const docente = docenteAcceso.value;
    const clave = claveAcceso.value.trim().toLowerCase();

    if (!docente) {
        estadoAcceso.textContent = "Elige tu nombre en la lista.";
        estadoAcceso.classList.add("error");
        return;
    }

    if (clave !== claveEsperada(docente)) {
        estadoAcceso.textContent = "Clave incorrecta. Pregúntale a tu profesor(a) guía.";
        estadoAcceso.classList.add("error");
        return;
    }

    estadoAcceso.classList.remove("error");
    estadoAcceso.textContent = "";
    accesoDocente = { docente, clave };
    sessionStorage.setItem(CLAVE_STORAGE_KEY, JSON.stringify(accesoDocente));
    revelarFormulariosDocente();
});

// =========================================================
// ¿La persona que mira esta página ya inició sesión como admin?
// (reutiliza la sesión del sistema de notas: si el/la administrador(a)
// ya inició sesión en pages/login.html en este navegador, aquí se
// detecta automáticamente y aparecen los botones de borrar.)
// =========================================================
async function revisarSiEsAdmin() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        esAdmin = false;
        estadoAdmin.innerHTML = `¿Eres administrador? <a href="login.html">Inicia sesión</a> para poder borrar fotos.`;
        return;
    }
    const { data: perfil } = await supabase
        .from("usuarios")
        .select("rol")
        .eq("auth_user_id", user.id)
        .maybeSingle();

    esAdmin = !!(perfil && perfil.rol === "admin");
    estadoAdmin.innerHTML = esAdmin
        ? `<span class="insignia-admin">🛡️ Modo administrador activo</span>`
        : `Sesión iniciada, pero esta cuenta no es de administrador.`;
}

// =========================================================
// Cargar y pintar las fotos de esta reina
// =========================================================
async function cargarFotos() {
    if (!reina) return;
    const { data, error } = await supabase
        .from("campesino_fotos")
        .select("id, ruta_storage, subido_por, creado_en")
        .eq("reina_slug", reina.slug)
        .order("creado_en", { ascending: false });

    if (error) {
        galeria.innerHTML = "";
        vacioAviso.style.display = "block";
        vacioAviso.textContent = "No se pudieron cargar las fotos. Intenta recargar la página.";
        return;
    }

    if (!data || data.length === 0) {
        galeria.innerHTML = "";
        vacioAviso.style.display = "block";
        return;
    }

    vacioAviso.style.display = "none";
    galeria.innerHTML = data.map((foto) => {
        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(foto.ruta_storage);
        const credito = foto.subido_por ? `Subida por ${escaparHTML(foto.subido_por)}` : "";
        return `
        <div class="foto" data-id="${foto.id}" data-ruta="${foto.ruta_storage}">
            <img src="${pub.publicUrl}" alt="Foto de la reina de ${escaparHTML(reina.nombre)}" loading="lazy">
            ${credito ? `<span class="credito">${credito}</span>` : ""}
            ${esAdmin ? `<button class="borrar" title="Borrar foto (solo administrador)">&times;</button>` : ""}
        </div>`;
    }).join("");
}

function escaparHTML(texto) {
    const div = document.createElement("div");
    div.textContent = texto;
    return div.innerHTML;
}

// =========================================================
// Subir foto(s) — requiere haber pasado el acceso de docente
// (y Supabase vuelve a exigir la misma clave al guardar la fila).
// =========================================================
async function reducirImagen(archivo, maxLado = 1600, calidad = 0.85) {
    return new Promise((resolve) => {
        const lector = new FileReader();
        lector.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let { width, height } = img;
                if (width > maxLado || height > maxLado) {
                    if (width >= height) {
                        height = Math.round(height * (maxLado / width));
                        width = maxLado;
                    } else {
                        width = Math.round(width * (maxLado / height));
                        height = maxLado;
                    }
                }
                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                canvas.getContext("2d").drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => resolve(blob || archivo), "image/jpeg", calidad);
            };
            img.onerror = () => resolve(archivo);
            img.src = e.target.result;
        };
        lector.onerror = () => resolve(archivo);
        lector.readAsDataURL(archivo);
    });
}

formSubir.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    if (!reina || !accesoDocente) return;

    const archivos = Array.from(archivosFoto.files || []);
    if (archivos.length === 0) {
        estadoSubida.textContent = "Elige al menos una foto.";
        estadoSubida.classList.add("error");
        return;
    }

    btnSubir.disabled = true;
    estadoSubida.classList.remove("error");

    const nombreSube = nombreQuienSube.value.trim().slice(0, 60);
    let subidas = 0;

    for (const archivo of archivos) {
        if (!archivo.type.startsWith("image/")) continue;
        estadoSubida.textContent = `Subiendo ${subidas + 1} de ${archivos.length}...`;

        try {
            const imagenLista = await reducirImagen(archivo);
            const nombreArchivo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
            const ruta = `${reina.slug}/${nombreArchivo}`;

            const { error: errorSubida } = await supabase.storage
                .from(BUCKET)
                .upload(ruta, imagenLista, { contentType: "image/jpeg", upsert: false });

            if (errorSubida) throw errorSubida;

            const { error: errorFila } = await supabase.from("campesino_fotos").insert({
                reina_slug: reina.slug,
                reina_nombre: reina.nombre,
                nivel: reina.nivel,
                ruta_storage: ruta,
                mime_type: "image/jpeg",
                peso_bytes: imagenLista.size || null,
                subido_por: nombreSube || null,
                docente_nombre: accesoDocente.docente,
                clave_ingresada: accesoDocente.clave,
            });

            if (errorFila) throw errorFila;
            subidas++;
        } catch (err) {
            console.error("Error subiendo foto:", err);
        }
    }

    btnSubir.disabled = false;
    archivosFoto.value = "";

    if (subidas === archivos.length) {
        estadoSubida.textContent = `¡Listo! Se subieron ${subidas} foto${subidas === 1 ? "" : "s"}. 🌼`;
    } else if (subidas > 0) {
        estadoSubida.textContent = `Se subieron ${subidas} de ${archivos.length} fotos. Algunas fallaron, intenta de nuevo.`;
        estadoSubida.classList.add("error");
    } else {
        estadoSubida.textContent = "No se pudo subir la foto. Revisa tu conexión e intenta de nuevo.";
        estadoSubida.classList.add("error");
    }

    await cargarFotos();
});

// =========================================================
// Borrar foto — solo funciona si esAdmin es true (RLS lo exige igual)
// =========================================================
galeria.addEventListener("click", async (evento) => {
    const botonBorrar = evento.target.closest(".borrar");
    if (botonBorrar) {
        evento.stopPropagation();
        if (!esAdmin) return;
        const tarjeta = botonBorrar.closest(".foto");
        const id = tarjeta.dataset.id;
        const ruta = tarjeta.dataset.ruta;
        if (!confirm("¿Borrar esta foto? Esta acción no se puede deshacer.")) return;

        const { error: errorFila } = await supabase.from("campesino_fotos").delete().eq("id", id);
        if (errorFila) {
            alert("No se pudo borrar la foto: " + errorFila.message);
            return;
        }
        await supabase.storage.from(BUCKET).remove([ruta]);
        tarjeta.remove();
        if (!galeria.querySelector(".foto")) vacioAviso.style.display = "block";
        return;
    }

    // Clic en la foto (fuera del botón borrar) abre el visor grande.
    const tarjeta = evento.target.closest(".foto");
    if (tarjeta) {
        const img = tarjeta.querySelector("img");
        imgVisor.src = img.src;
        visor.classList.add("abierto");
    }
});

cerrarVisor.addEventListener("click", () => visor.classList.remove("abierto"));
visor.addEventListener("click", (e) => {
    if (e.target === visor) visor.classList.remove("abierto");
});

// =========================================================
// Perfil de la reina: nombre real + preguntas curiosas.
// Verlo es libre; crearlo o editarlo requiere el acceso de docente.
// =========================================================
function pintarPerfil(perfil) {
    if (!perfil) {
        perfilContenido.innerHTML = `<p class="perfil-vacio">Todavía nadie ha completado el perfil de esta reina. El salón o su profesor(a) guía puede hacerlo con la clave de acceso. 👇</p>`;
        return;
    }

    // Si ya hay un nombre real, se usa en el encabezado de la página.
    if (perfil.nombre_reina) {
        tituloReina.textContent = `${perfil.nombre_reina} · Reina de ${reina.nombre}`;
    }

    const preguntas = [
        ["🍽️ Le gusta comer", perfil.comida_favorita],
        ["✨ Dato curioso", perfil.dato_curioso],
        ["😂 Algo que da risa", perfil.algo_que_da_risa],
        ["👑 Si gana el reinado hará", perfil.que_hara_si_gana],
    ].filter(([, valor]) => valor && valor.trim() !== "");

    perfilContenido.innerHTML = `
        <p class="perfil-nombre">${escaparHTML(perfil.nombre_reina)}</p>
        ${preguntas.length ? `<div class="perfil-preguntas">${preguntas.map(([pregunta, valor]) => `
            <div class="pregunta"><div class="q">${pregunta}</div><div class="a">${escaparHTML(valor)}</div></div>
        `).join("")}</div>` : `<p class="perfil-vacio">Aún faltan las preguntas curiosas.</p>`}
        ${perfil.docente_nombre ? `<p class="perfil-credito">Completado por ${escaparHTML(perfil.docente_nombre)}</p>` : ""}
    `;
}

let perfilActual = null;

async function cargarPerfil() {
    if (!reina) return;
    const { data, error } = await supabase
        .from("campesino_perfiles_reinas")
        .select("*")
        .eq("reina_slug", reina.slug)
        .maybeSingle();

    if (error) {
        perfilContenido.innerHTML = `<p class="perfil-vacio">No se pudo cargar el perfil. Intenta recargar la página.</p>`;
        return;
    }

    perfilActual = data || null;
    pintarPerfil(perfilActual);

    if (perfilActual) {
        pNombreReina.value = perfilActual.nombre_reina || "";
        pComida.value = perfilActual.comida_favorita || "";
        pCurioso.value = perfilActual.dato_curioso || "";
        pRisa.value = perfilActual.algo_que_da_risa || "";
        pSiGana.value = perfilActual.que_hara_si_gana || "";
    }
}

formPerfil.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    if (!reina || !accesoDocente) return;

    const nombre = pNombreReina.value.trim();
    if (!nombre) {
        estadoPerfil.textContent = "Escribe el nombre de la reina.";
        estadoPerfil.classList.add("error");
        return;
    }

    btnGuardarPerfil.disabled = true;
    estadoPerfil.classList.remove("error");
    estadoPerfil.textContent = "Guardando...";

    const filaPerfil = {
        reina_slug: reina.slug,
        nombre_reina: nombre,
        comida_favorita: pComida.value.trim() || null,
        dato_curioso: pCurioso.value.trim() || null,
        algo_que_da_risa: pRisa.value.trim() || null,
        que_hara_si_gana: pSiGana.value.trim() || null,
        actualizado_por: accesoDocente.docente,
        docente_nombre: accesoDocente.docente,
        clave_ingresada: accesoDocente.clave,
    };

    // Un solo perfil por reina: si ya existe, se actualiza; si no, se crea.
    const { error } = perfilActual
        ? await supabase.from("campesino_perfiles_reinas").update(filaPerfil).eq("reina_slug", reina.slug)
        : await supabase.from("campesino_perfiles_reinas").insert(filaPerfil);

    btnGuardarPerfil.disabled = false;

    if (error) {
        estadoPerfil.textContent = "No se pudo guardar: " + error.message;
        estadoPerfil.classList.add("error");
        return;
    }

    estadoPerfil.textContent = "¡Perfil guardado! 🌼";
    await cargarPerfil();
});

// =========================================================
// Arranque
// =========================================================
(async function iniciar() {
    if (!reina) return;
    cargarAccesoGuardado();
    await revisarSiEsAdmin();
    await cargarFotos();
    await cargarPerfil();
})();
