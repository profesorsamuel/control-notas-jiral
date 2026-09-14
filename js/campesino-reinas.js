import { supabase } from "./supabase.js";
import { REINAS } from "./campesino-datos.js";

const BUCKET = "campesino-reinas";
const TABLA_ME_GUSTA = "campesino_fotos_me_gusta";
const LS_DEVICE_KEY = "campesino_dispositivo_id";

const gridPrimaria = document.getElementById("gridPrimaria");
const gridPremedia = document.getElementById("gridPremedia");

const visor = document.getElementById("visor");
const imgVisor = document.getElementById("imgVisor");
const cerrarVisorBtn = document.getElementById("cerrarVisor");
const meGustaVisorBtn = document.getElementById("meGustaVisor");

// ---- Estado en memoria (para no recargar la página al votar) ----
// ruta_storage -> { conteo, meGusta }
const estadoFotos = new Map();
// ruta_storage -> botón "me gusta" de la tarjeta correspondiente
const botonPorRuta = new Map();
// evita doble clic mientras se guarda en Supabase
const procesando = new Set();
// ruta_storage que está abierta actualmente en el visor (o null)
let rutaAbiertaEnVisor = null;

// ---- Identificador de dispositivo (solo en localStorage) ----
function obtenerDispositivoId() {
    let id = localStorage.getItem(LS_DEVICE_KEY);
    if (!id) {
        id = (crypto.randomUUID ? crypto.randomUUID() : `dev-${Date.now()}-${Math.random().toString(16).slice(2)}`);
        localStorage.setItem(LS_DEVICE_KEY, id);
    }
    return id;
}

// ---- Tarjetas (ya NO son enlaces a campesino-galeria.html) ----
function tarjetaHTML(reina) {
    return `
    <div class="reina-card" data-slug="${reina.slug}">
        <button type="button" class="cubierta" id="cubierta-${reina.slug}">
            <span class="placeholder">🌼</span>
        </button>
        <p class="nombre-real" id="nombre-real-${reina.slug}" style="display:none;"></p>
        <h3>${reina.nombre}</h3>
        <p>${reina.detalle}</p>
        <div class="acciones-card">
            <button type="button" class="btn-me-gusta" id="me-gusta-${reina.slug}" disabled>
                <span class="icono-me-gusta">🤍</span>
                <span class="texto-me-gusta">Me gusta</span>
                <span class="conteo-votos">0</span>
            </button>
        </div>
    </div>`;
}

function pintarTarjetas() {
    gridPrimaria.innerHTML = REINAS.filter((r) => r.nivel === "primaria").map(tarjetaHTML).join("");
    gridPremedia.innerHTML = REINAS.filter((r) => r.nivel === "premedia").map(tarjetaHTML).join("");
}

// ---- Pintar el estado (icono / texto / conteo) de un botón ----
function pintarBotonMeGusta(boton, estado) {
    if (!boton) return;
    const conteo = estado?.conteo ?? 0;
    const meGusta = !!estado?.meGusta;
    boton.classList.toggle("votada", meGusta);
    const icono = boton.querySelector(".icono-me-gusta");
    const texto = boton.querySelector(".texto-me-gusta");
    const contador = boton.querySelector(".conteo-votos");
    if (icono) icono.textContent = meGusta ? "❤️" : "🤍";
    if (texto) texto.textContent = meGusta ? "Te gusta" : "Me gusta";
    if (contador) contador.textContent = String(conteo);
}

// Actualiza TODOS los botones de esa fotografía (tarjeta + visor si está abierto)
function actualizarBotonesDeRuta(ruta) {
    const estado = estadoFotos.get(ruta);
    pintarBotonMeGusta(botonPorRuta.get(ruta), estado);
    if (rutaAbiertaEnVisor === ruta) pintarBotonMeGusta(meGustaVisorBtn, estado);
}

// ---- Alternar Me gusta (agregar / quitar) para una fotografía ----
async function alternarMeGusta(ruta) {
    if (!ruta || procesando.has(ruta)) return;
    procesando.add(ruta);

    const dispositivoId = obtenerDispositivoId();
    const estadoAnterior = estadoFotos.get(ruta) || { conteo: 0, meGusta: false };
    const estadoNuevo = {
        conteo: estadoAnterior.meGusta ? estadoAnterior.conteo - 1 : estadoAnterior.conteo + 1,
        meGusta: !estadoAnterior.meGusta,
    };

    // Actualización inmediata en pantalla (optimista)
    estadoFotos.set(ruta, estadoNuevo);
    actualizarBotonesDeRuta(ruta);

    try {
        if (estadoNuevo.meGusta) {
            const { error } = await supabase
                .from(TABLA_ME_GUSTA)
                .insert({ ruta_storage: ruta, dispositivo_id: dispositivoId });
            if (error) throw error;
        } else {
            const { error } = await supabase
                .from(TABLA_ME_GUSTA)
                .delete()
                .eq("ruta_storage", ruta)
                .eq("dispositivo_id", dispositivoId);
            if (error) throw error;
        }
    } catch (err) {
        // Si Supabase falla, se revierte el cambio visual
        console.error("No se pudo guardar el Me gusta:", err);
        estadoFotos.set(ruta, estadoAnterior);
        actualizarBotonesDeRuta(ruta);
    } finally {
        procesando.delete(ruta);
    }
}

// ---- Visor (modal) de la fotografía completa ----
function abrirVisor(ruta, urlImagen) {
    if (!ruta || !urlImagen) return;
    rutaAbiertaEnVisor = ruta;
    imgVisor.src = urlImagen;
    imgVisor.alt = "";
    meGustaVisorBtn.disabled = false;
    pintarBotonMeGusta(meGustaVisorBtn, estadoFotos.get(ruta));
    visor.classList.add("abierto");
    document.body.style.overflow = "hidden";
}

function cerrarVisor() {
    visor.classList.remove("abierto");
    document.body.style.overflow = "";
    rutaAbiertaEnVisor = null;
    imgVisor.src = "";
}

cerrarVisorBtn.addEventListener("click", cerrarVisor);
visor.addEventListener("click", (evento) => {
    if (evento.target === visor) cerrarVisor(); // clic fuera de la foto
});
document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape" && visor.classList.contains("abierto")) cerrarVisor();
});
meGustaVisorBtn.addEventListener("click", () => alternarMeGusta(rutaAbiertaEnVisor));

// ---- Habilita la foto de una reina: visor + botón Me gusta ----
function habilitarFoto(slug, ruta, urlImagen) {
    const cubierta = document.getElementById(`cubierta-${slug}`);
    const botonMeGusta = document.getElementById(`me-gusta-${slug}`);
    if (!cubierta || !botonMeGusta) return;

    cubierta.classList.add("con-foto");
    cubierta.addEventListener("click", () => abrirVisor(ruta, urlImagen));

    botonMeGusta.disabled = false;
    botonMeGusta.addEventListener("click", () => alternarMeGusta(ruta));

    botonPorRuta.set(ruta, botonMeGusta);
}

// ---- Trae los conteos de Me gusta y cuáles ya votó este dispositivo ----
async function cargarMeGusta(rutas) {
    if (rutas.length === 0) return;
    const dispositivoId = obtenerDispositivoId();

    const [{ data: todos, error: errorTodos }, { data: propios, error: errorPropios }] = await Promise.all([
        supabase.from(TABLA_ME_GUSTA).select("ruta_storage").in("ruta_storage", rutas),
        supabase.from(TABLA_ME_GUSTA).select("ruta_storage").eq("dispositivo_id", dispositivoId).in("ruta_storage", rutas),
    ]);

    if (errorTodos || errorPropios) {
        console.error("No se pudieron cargar los Me gusta:", errorTodos || errorPropios);
        return;
    }

    const conteos = new Map();
    for (const fila of todos || []) {
        conteos.set(fila.ruta_storage, (conteos.get(fila.ruta_storage) || 0) + 1);
    }
    const propiosSet = new Set((propios || []).map((f) => f.ruta_storage));

    for (const ruta of rutas) {
        estadoFotos.set(ruta, {
            conteo: conteos.get(ruta) || 0,
            meGusta: propiosSet.has(ruta),
        });
        actualizarBotonesDeRuta(ruta);
    }
}

// ---- Trae las fotos de portada / primera foto de cada reina ----
async function cargarCubiertas() {
    // Trae todas las fotos y todos los perfiles de una vez, y los agrupa
    // por reina en el navegador, para no hacer 19 consultas separadas.
    const [{ data: fotos, error: errorFotos }, { data: perfiles }] = await Promise.all([
        supabase.from("campesino_fotos").select("reina_slug, ruta_storage, creado_en").order("creado_en", { ascending: true }),
        supabase.from("campesino_perfiles_reinas").select("reina_slug, nombre_reina, foto_portada_ruta"),
    ]);

    const portadaPorReina = new Map();
    if (Array.isArray(perfiles)) {
        for (const perfil of perfiles) {
            const nombreReal = document.getElementById(`nombre-real-${perfil.reina_slug}`);
            if (nombreReal && perfil.nombre_reina) {
                nombreReal.textContent = perfil.nombre_reina;
                nombreReal.style.display = "block";
            }
            if (perfil.foto_portada_ruta) portadaPorReina.set(perfil.reina_slug, perfil.foto_portada_ruta);
        }
    }

    const rutasConFoto = [];

    // La foto de portada (si existe) manda sobre la primera foto de la galería.
    for (const [slug, ruta] of portadaPorReina) {
        const contenedor = document.getElementById(`cubierta-${slug}`);
        if (!contenedor) continue;
        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(ruta);
        contenedor.innerHTML = `<img src="${pub.publicUrl}" alt="" loading="lazy">`;
        habilitarFoto(slug, ruta, pub.publicUrl);
        rutasConFoto.push(ruta);
    }

    if (!errorFotos && fotos) {
        const porReina = new Map();
        for (const fila of fotos) {
            if (!porReina.has(fila.reina_slug)) porReina.set(fila.reina_slug, []);
            porReina.get(fila.reina_slug).push(fila);
        }

        for (const [slug, fotosReina] of porReina) {
            const contenedor = document.getElementById(`cubierta-${slug}`);
            if (!contenedor || fotosReina.length === 0) continue;
            const conteoHTML = `<span class="conteo">${fotosReina.length} foto${fotosReina.length === 1 ? "" : "s"}</span>`;
            if (portadaPorReina.has(slug)) {
                // Ya se pintó la foto de portada arriba: solo se agrega el contador.
                contenedor.insertAdjacentHTML("beforeend", conteoHTML);
                continue;
            }
            const primera = fotosReina[0];
            const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(primera.ruta_storage);
            contenedor.innerHTML = `<img src="${pub.publicUrl}" alt="" loading="lazy">${conteoHTML}`;
            habilitarFoto(slug, primera.ruta_storage, pub.publicUrl);
            rutasConFoto.push(primera.ruta_storage);
        }
    }

    await cargarMeGusta(rutasConFoto);
}

pintarTarjetas();
cargarCubiertas();
