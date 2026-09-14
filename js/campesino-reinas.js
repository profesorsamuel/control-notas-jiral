import { supabase } from "./supabase.js";
import { REINAS } from "./campesino-datos.js";

const BUCKET = "campesino-reinas";
const gridPrimaria = document.getElementById("gridPrimaria");
const gridPremedia = document.getElementById("gridPremedia");

function tarjetaHTML(reina) {
    return `
    <a class="reina-card" href="campesino-galeria.html?reina=${encodeURIComponent(reina.slug)}">
        <div class="cubierta" id="cubierta-${reina.slug}">
            <span class="placeholder">🌼</span>
        </div>
        <p class="nombre-real" id="nombre-real-${reina.slug}" style="display:none;"></p>
        <h3>${reina.nombre}</h3>
        <p>${reina.detalle}</p>
    </a>`;
}

function pintarTarjetas() {
    gridPrimaria.innerHTML = REINAS.filter((r) => r.nivel === "primaria").map(tarjetaHTML).join("");
    gridPremedia.innerHTML = REINAS.filter((r) => r.nivel === "premedia").map(tarjetaHTML).join("");
}

async function cargarCubiertas() {
    // Trae todas las fotos y todos los perfiles de una vez, y los agrupa
    // por reina en el navegador, para no hacer 19 consultas separadas.
    const [{ data: fotos, error: errorFotos }, { data: perfiles }] = await Promise.all([
        supabase.from("campesino_fotos").select("reina_slug, ruta_storage, creado_en").order("creado_en", { ascending: true }),
        supabase.from("campesino_perfiles_reinas").select("reina_slug, nombre_reina"),
    ]);

    if (Array.isArray(perfiles)) {
        for (const perfil of perfiles) {
            const nombreReal = document.getElementById(`nombre-real-${perfil.reina_slug}`);
            if (nombreReal && perfil.nombre_reina) {
                nombreReal.textContent = perfil.nombre_reina;
                nombreReal.style.display = "block";
            }
        }
    }

    if (errorFotos || !fotos) return;

    const porReina = new Map();
    for (const fila of fotos) {
        if (!porReina.has(fila.reina_slug)) porReina.set(fila.reina_slug, []);
        porReina.get(fila.reina_slug).push(fila);
    }

    for (const [slug, fotosReina] of porReina) {
        const contenedor = document.getElementById(`cubierta-${slug}`);
        if (!contenedor || fotosReina.length === 0) continue;
        const primera = fotosReina[0];
        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(primera.ruta_storage);
        contenedor.innerHTML = `
            <img src="${pub.publicUrl}" alt="" loading="lazy">
            <span class="conteo">${fotosReina.length} foto${fotosReina.length === 1 ? "" : "s"}</span>`;
    }
}

pintarTarjetas();
cargarCubiertas();
