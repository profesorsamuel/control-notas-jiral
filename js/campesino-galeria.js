import { supabase } from "./supabase.js";
import { buscarReina, REINAS, COLORES_BASICOS } from "./campesino-datos.js";
import { DOCENTES, claveEsperada } from "./campesino-docentes.js";

const BUCKET = "campesino-reinas";
const CLAVE_STORAGE_KEY = "campesinoAcceso"; // { docente, clave }

const parametros = new URLSearchParams(window.location.search);
const slug = (parametros.get("reina") || "").trim();
const reina = buscarReina(slug);

const chipNivel = document.getElementById("chipNivel");
const tituloReina = document.getElementById("tituloReina");
const detalleReina = document.getElementById("detalleReina");
const docentesStrip = document.getElementById("docentesStrip");
const portadaHero = document.getElementById("portadaHero");
const galeria = document.getElementById("galeria");
const vacioAviso = document.getElementById("vacioAviso");
const formSubir = document.getElementById("formSubir");
const archivosFoto = document.getElementById("archivosFoto");
const nombreQuienSube = document.getElementById("nombreQuienSube");
const observacionFoto = document.getElementById("observacionFoto");
const btnSubir = document.getElementById("btnSubir");
const estadoSubida = document.getElementById("estadoSubida");
const estadoAdmin = document.getElementById("estadoAdmin");
const estadoAcceso2 = document.getElementById("estadoAcceso2");
const visor = document.getElementById("visor");
const imgVisor = document.getElementById("imgVisor");
const cerrarVisor = document.getElementById("cerrarVisor");

const portadaCard = document.getElementById("portadaCard");
const portadaActualImg = document.getElementById("portadaActualImg");
const portadaActualVacio = document.getElementById("portadaActualVacio");
const portadaActualTexto = document.getElementById("portadaActualTexto");
const formPortada = document.getElementById("formPortada");
const archivoPortada = document.getElementById("archivoPortada");
const btnPortada = document.getElementById("btnPortada");
const estadoPortada = document.getElementById("estadoPortada");

const perfilContenido = document.getElementById("perfilContenido");
const perfilEditarDetalle = document.getElementById("perfilEditarDetalle");
const formPerfil = document.getElementById("formPerfil");
const pNombreReina = document.getElementById("pNombreReina");
const notaNombreBloqueado = document.getElementById("notaNombreBloqueado");
const pFechaNacimiento = document.getElementById("pFechaNacimiento");
const pComida = document.getElementById("pComida");
const pColor = document.getElementById("pColor");
const pColorReinado = document.getElementById("pColorReinado");
const notaColorTomado = document.getElementById("notaColorTomado");
const globosReina = document.getElementById("globosReina");
const pMateria = document.getElementById("pMateria");
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
// Encabezado: nombre de la reina, y los docentes/salones que la
// representan (siempre los mismos, definidos en el programa del
// evento, así que se muestran sin depender de la base de datos).
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

    const chips = [];
    for (const d of reina.docentes || []) {
        chips.push(`<span class="chip-docente">🏫 ${escaparHTML(d.salon)} · ${escaparHTML(d.nombre)}</span>`);
    }
    if (reina.apoyo) {
        chips.push(`<span class="chip-docente">🤝 Apoyo Premedia: ${escaparHTML(reina.apoyo.salon)} · ${escaparHTML(reina.apoyo.nombre)}</span>`);
    }
    if (chips.length) {
        docentesStrip.innerHTML = `<span class="etiqueta">Docentes y salones que la representan</span>${chips.join("")}`;
    }
}

// =========================================================
// Selector de docentes en el formulario de acceso
// =========================================================
docenteAcceso.insertAdjacentHTML(
    "beforeend",
    DOCENTES.map((nombre) => `<option value="${nombre}">${nombre}</option>`).join("")
);

// =========================================================
// Color que usará la reina el día del evento: se elige de una paleta
// fija de colores básicos, y no se puede repetir entre reinas del
// MISMO reinado (Primaria o Premedia son horarios distintos, así que
// sí pueden compartir color entre ellos).
// =========================================================
pColorReinado.insertAdjacentHTML(
    "beforeend",
    COLORES_BASICOS.map((c) => `<option value="${c.hex}" data-nombre="${c.nombre}">${c.nombre}</option>`).join("")
);

async function cargarColoresTomados() {
    if (!reina) return;
    const slugsDelNivel = REINAS.filter((r) => r.nivel === reina.nivel).map((r) => r.slug);

    const { data, error } = await supabase
        .from("campesino_perfiles_reinas")
        .select("reina_slug, color_evento")
        .in("reina_slug", slugsDelNivel);

    if (error) return;

    const tomadosPorOtras = new Set(
        (data || [])
            .filter((fila) => fila.reina_slug !== reina.slug && fila.color_evento)
            .map((fila) => fila.color_evento)
    );

    let algunoTachado = false;
    Array.from(pColorReinado.options).forEach((opcion) => {
        if (!opcion.value) return;
        const tomado = tomadosPorOtras.has(opcion.value);
        opcion.disabled = tomado;
        opcion.textContent = tomado ? `${opcion.dataset.nombre} (ya elegido)` : opcion.dataset.nombre;
        if (tomado) algunoTachado = true;
    });
    notaColorTomado.style.display = algunoTachado ? "block" : "none";
}

function nombreColor(hex) {
    const c = COLORES_BASICOS.find((c) => c.hex.toLowerCase() === (hex || "").toLowerCase());
    return c ? c.nombre : null;
}

function pintarGlobos(hex) {
    const nombre = nombreColor(hex);
    if (!hex || !nombre) {
        globosReina.classList.add("oculto");
        globosReina.innerHTML = "";
        return;
    }
    globosReina.classList.remove("oculto");
    globosReina.innerHTML = `
        <div class="globo-wrap">
            <div class="globo" style="background:${hex}; color:${hex};"></div>
            <div class="hilo"></div>
        </div>
        <div class="globo-wrap">
            <div class="globo" style="background:${hex}; color:${hex};"></div>
            <div class="hilo"></div>
            <div class="etiqueta-color">Color que usará: <b>${escaparHTML(nombre)}</b></div>
        </div>
        <div class="globo-wrap">
            <div class="globo" style="background:${hex}; color:${hex};"></div>
            <div class="hilo"></div>
        </div>
    `;
}

// =========================================================
// Acceso de docente: hace falta para subir fotos, la portada o tocar
// el perfil. Se valida aquí para dar una respuesta inmediata, y de
// nuevo en Supabase (RLS) al guardar, que es lo que realmente protege
// los datos.
// =========================================================
function revelarFormulariosDocente() {
    accesoCard.classList.add("oculto");
    portadaCard.classList.remove("oculto");
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

formAcceso.addEventListener("submit", async (evento) => {
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
    await cargarFotos();
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
        ? `<span class="insignia-admin">🛡️ Modo administrador activo</span> · <a href="campesino-bitacora.html">Ver bitácora</a>`
        : `Sesión iniciada, pero esta cuenta no es de administrador.`;
}

// =========================================================
// Cargar y pintar las fotos de esta reina
// =========================================================
async function cargarFotos() {
    if (!reina) return;
    const { data, error } = await supabase
        .from("campesino_fotos")
        .select("id, ruta_storage, subido_por, descripcion, creado_en, orden")
        .eq("reina_slug", reina.slug)
        .order("orden", { ascending: true, nullsFirst: false })
        .order("creado_en", { ascending: false })
        .limit(16);

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
        const partesCredito = [];
        if (foto.descripcion) partesCredito.push(`<span class="obs">${escaparHTML(foto.descripcion)}</span>`);
        if (foto.subido_por) partesCredito.push(`Subida por ${escaparHTML(foto.subido_por)}`);
        const reordenable = puedeReordenar();
        return `
        <div class="foto" data-id="${foto.id}" data-ruta="${foto.ruta_storage}" ${reordenable ? 'draggable="true"' : ""}>
            <div class="foto-img">
                <img src="${pub.publicUrl}" alt="Foto de la reina de ${escaparHTML(reina.nombre)}" loading="lazy">
                ${reordenable ? `<button type="button" class="manija" title="Arrastra para reordenar">⠿</button>` : ""}
                ${esAdmin ? `<button class="borrar" title="Borrar foto (solo administrador)">&times;</button>` : ""}
            </div>
            ${partesCredito.length ? `<span class="credito">${partesCredito.join("")}</span>` : ""}
        </div>`;
    }).join("");
}

function escaparHTML(texto) {
    const div = document.createElement("div");
    div.textContent = texto || "";
    return div.innerHTML;
}

// =========================================================
// Bitácora: deja constancia de quién hizo cada cambio, dónde y cuándo.
// Solo la puede consultar el administrador (campesino-bitacora.html).
// =========================================================
async function registrarBitacora(accion, detalle) {
    if (!reina || !accesoDocente) return;
    try {
        await supabase.from("campesino_bitacora").insert({
            docente_nombre: accesoDocente.docente,
            accion,
            reina_slug: reina.slug,
            reina_nombre: reina.nombre,
            detalle: (detalle || "").slice(0, 200),
        });
    } catch (err) {
        console.error("No se pudo registrar en la bitácora:", err);
    }
}

// =========================================================
// Reducir una imagen en el navegador antes de subirla (portada o galería)
// =========================================================
async function reducirImagen(archivo, maxLado = 1000, calidad = 0.72) {
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

// =========================================================
// Subir foto(s) de la galería — requiere haber pasado el acceso de
// docente (y Supabase vuelve a exigir la misma clave al guardar la fila).
// =========================================================
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
    const descripcion = observacionFoto.value.trim().slice(0, 200);
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
                descripcion: descripcion || null,
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

    if (subidas > 0) {
        await registrarBitacora("foto", `Subió ${subidas} foto${subidas === 1 ? "" : "s"}${descripcion ? `: "${descripcion}"` : ""}`);
    }

    if (subidas === archivos.length) {
        estadoSubida.textContent = `¡Listo! Se subieron ${subidas} foto${subidas === 1 ? "" : "s"}. 🌼`;
        observacionFoto.value = "";
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
// Reordenar fotos arrastrando — solo disponible para quien tiene
// acceso de docente o es administrador (quien puede reordenar también
// puede subir/borrar, así que reutiliza el mismo criterio).
// =========================================================
function puedeReordenar() {
    return !!(accesoDocente || esAdmin);
}

let elementoArrastrado = null;

galeria.addEventListener("dragstart", (evento) => {
    const tarjeta = evento.target.closest(".foto");
    if (!tarjeta || !tarjeta.draggable) return;
    elementoArrastrado = tarjeta;
    tarjeta.classList.add("arrastrando");
    evento.dataTransfer.effectAllowed = "move";
});

galeria.addEventListener("dragend", () => {
    if (elementoArrastrado) elementoArrastrado.classList.remove("arrastrando");
    galeria.querySelectorAll(".destino-arrastre").forEach((el) => el.classList.remove("destino-arrastre"));
    elementoArrastrado = null;
});

galeria.addEventListener("dragover", (evento) => {
    if (!elementoArrastrado) return;
    evento.preventDefault();
    const tarjeta = evento.target.closest(".foto");
    if (!tarjeta || tarjeta === elementoArrastrado) return;
    galeria.querySelectorAll(".destino-arrastre").forEach((el) => el.classList.remove("destino-arrastre"));
    tarjeta.classList.add("destino-arrastre");
});

galeria.addEventListener("drop", async (evento) => {
    evento.preventDefault();
    const destino = evento.target.closest(".foto");
    galeria.querySelectorAll(".destino-arrastre").forEach((el) => el.classList.remove("destino-arrastre"));
    if (!elementoArrastrado || !destino || destino === elementoArrastrado) return;

    const tarjetas = Array.from(galeria.children);
    const indiceArrastrado = tarjetas.indexOf(elementoArrastrado);
    const indiceDestino = tarjetas.indexOf(destino);
    if (indiceArrastrado < indiceDestino) {
        destino.after(elementoArrastrado);
    } else {
        destino.before(elementoArrastrado);
    }

    await guardarNuevoOrden();
});

async function guardarNuevoOrden() {
    const tarjetas = Array.from(galeria.querySelectorAll(".foto"));
    const actualizaciones = tarjetas.map((tarjeta, indice) =>
        supabase.from("campesino_fotos").update({ orden: indice }).eq("id", tarjeta.dataset.id)
    );
    try {
        await Promise.all(actualizaciones);
        await registrarBitacora("fotos_reordenadas", "Cambió el orden de las fotos de la galería");
    } catch (err) {
        console.error("No se pudo guardar el nuevo orden:", err);
    }
}

// =========================================================
// Foto de portada: la foto principal que aparece al frente.
// =========================================================
function pintarPortada(rutaStorage) {
    if (!rutaStorage) {
        portadaHero.classList.add("oculto");
        portadaActualImg.classList.add("oculto");
        portadaActualVacio.classList.remove("oculto");
        portadaActualTexto.textContent = "Todavía no hay foto de portada.";
        return;
    }
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(rutaStorage);
    portadaHero.src = pub.publicUrl;
    portadaHero.classList.remove("oculto");
    portadaActualImg.src = pub.publicUrl;
    portadaActualImg.classList.remove("oculto");
    portadaActualVacio.classList.add("oculto");
    portadaActualTexto.textContent = "Foto de portada actual.";
}

formPortada.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    if (!reina || !accesoDocente) return;

    const archivo = archivoPortada.files && archivoPortada.files[0];
    if (!archivo || !archivo.type.startsWith("image/")) {
        estadoPortada.textContent = "Elige una foto.";
        estadoPortada.classList.add("error");
        return;
    }

    btnPortada.disabled = true;
    estadoPortada.classList.remove("error");
    estadoPortada.textContent = "Subiendo...";

    try {
        const imagenLista = await reducirImagen(archivo, 500, 0.75);
        const nombreArchivo = `portada-${Date.now()}.jpg`;
        const ruta = `${reina.slug}/portada/${nombreArchivo}`;

        const { error: errorSubida } = await supabase.storage
            .from(BUCKET)
            .upload(ruta, imagenLista, { contentType: "image/jpeg", upsert: false });
        if (errorSubida) throw errorSubida;

        const filaPortada = {
            reina_slug: reina.slug,
            foto_portada_ruta: ruta,
            docente_nombre: accesoDocente.docente,
            clave_ingresada: accesoDocente.clave,
        };

        const { error: errorFila } = perfilActual
            ? await supabase.from("campesino_perfiles_reinas").update(filaPortada).eq("reina_slug", reina.slug)
            : await supabase.from("campesino_perfiles_reinas").insert(filaPortada);
        if (errorFila) throw errorFila;

        await registrarBitacora("portada", "Actualizó la foto de portada");
        estadoPortada.textContent = "¡Foto de portada guardada! 🌼";
        archivoPortada.value = "";
        await cargarPerfil();
    } catch (err) {
        console.error("Error guardando portada:", err);
        estadoPortada.textContent = "No se pudo guardar la foto de portada.";
        estadoPortada.classList.add("error");
    }

    btnPortada.disabled = false;
});

// =========================================================
// Perfil de la reina: nombre real + preguntas curiosas, mostradas
// como un párrafo. Verlo es libre; crearlo o editarlo requiere el
// acceso de docente.
// =========================================================
function construirParrafo(perfil) {
    const frases = [];
    if (perfil.fecha_nacimiento) frases.push(`Nació el ${perfil.fecha_nacimiento}.`);
    if (perfil.comida_favorita) frases.push(`Le gusta comer ${perfil.comida_favorita}.`);
    if (perfil.color_favorito) frases.push(`Su color favorito es el ${perfil.color_favorito}.`);
    if (perfil.materia_favorita) frases.push(`Su materia favorita es ${perfil.materia_favorita}.`);
    if (perfil.dato_curioso) frases.push(perfil.dato_curioso.trim().replace(/\.?$/, "."));
    if (perfil.algo_que_da_risa) frases.push(perfil.algo_que_da_risa.trim().replace(/\.?$/, "."));
    if (perfil.que_hara_si_gana) frases.push(`Si gana el reinado, ${perfil.que_hara_si_gana.trim().replace(/^./, (c) => c.toLowerCase())}${/[.!?]$/.test(perfil.que_hara_si_gana.trim()) ? "" : "."}`);
    return frases.join(" ");
}

function pintarPerfil(perfil) {
    if (!perfil || !perfil.nombre_reina) {
        perfilContenido.innerHTML = `<p class="perfil-vacio">Todavía nadie ha completado el perfil de esta reina. El salón o su profesor(a) guía puede hacerlo con la clave de acceso. 👇</p>`;
        pintarGlobos(null);
        return;
    }

    // Si ya hay un nombre real, se usa como título principal (grande y centrado).
    tituloReina.textContent = perfil.nombre_reina;
    detalleReina.textContent = `Reina de ${reina.nombre}`;

    const parrafo = construirParrafo(perfil);

    perfilContenido.innerHTML = `
        <p class="perfil-nombre">${escaparHTML(perfil.nombre_reina)}</p>
        ${parrafo ? `<p class="perfil-parrafo">${escaparHTML(parrafo)}</p>` : `<p class="perfil-vacio">Aún faltan las preguntas curiosas.</p>`}
        ${perfil.docente_nombre ? `<p class="perfil-credito">Completado por ${escaparHTML(perfil.docente_nombre)}</p>` : ""}
    `;
    pintarGlobos(perfil.color_evento);
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
    pintarPortada(perfilActual ? perfilActual.foto_portada_ruta : null);

    if (perfilActual) {
        pNombreReina.value = perfilActual.nombre_reina || "";
        const registrada = !!(perfilActual.nombre_reina && perfilActual.nombre_reina.trim() !== "");
        pNombreReina.readOnly = registrada;
        pNombreReina.required = !registrada;
        notaNombreBloqueado.classList.toggle("oculto", !registrada);
        pFechaNacimiento.value = perfilActual.fecha_nacimiento || "";
        pComida.value = perfilActual.comida_favorita || "";
        pColor.value = perfilActual.color_favorito || "";
        pColorReinado.value = perfilActual.color_evento || "";
        pMateria.value = perfilActual.materia_favorita || "";
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

    if (pColorReinado.value) {
        await cargarColoresTomados();
        const opcionElegida = Array.from(pColorReinado.options).find((o) => o.value === pColorReinado.value);
        if (opcionElegida && opcionElegida.disabled) {
            estadoPerfil.textContent = "Ese color ya lo eligió otra reina de tu mismo reinado justo ahora. Elige otro color.";
            estadoPerfil.classList.add("error");
            return;
        }
    }

    btnGuardarPerfil.disabled = true;
    estadoPerfil.classList.remove("error");
    estadoPerfil.textContent = "Guardando...";

    const filaPerfil = {
        reina_slug: reina.slug,
        nombre_reina: nombre,
        fecha_nacimiento: pFechaNacimiento.value.trim() || null,
        comida_favorita: pComida.value.trim() || null,
        color_favorito: pColor.value.trim() || null,
        color_evento: pColorReinado.value || null,
        materia_favorita: pMateria.value.trim() || null,
        dato_curioso: pCurioso.value.trim() || null,
        algo_que_da_risa: pRisa.value.trim() || null,
        que_hara_si_gana: pSiGana.value.trim() || null,
        actualizado_por: accesoDocente.docente,
        docente_nombre: accesoDocente.docente,
        clave_ingresada: accesoDocente.clave,
    };

    // Un solo perfil por reina: si ya existe, se actualiza; si no, se crea.
    const yaExistia = !!(perfilActual && perfilActual.nombre_reina);
    const { error } = perfilActual
        ? await supabase.from("campesino_perfiles_reinas").update(filaPerfil).eq("reina_slug", reina.slug)
        : await supabase.from("campesino_perfiles_reinas").insert(filaPerfil);

    btnGuardarPerfil.disabled = false;

    if (error) {
        estadoPerfil.textContent = "No se pudo guardar: " + error.message;
        estadoPerfil.classList.add("error");
        return;
    }

    await registrarBitacora(yaExistia ? "perfil_editado" : "perfil_creado", `Nombre de la reina: ${nombre}`);

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
    await cargarColoresTomados();
})();
