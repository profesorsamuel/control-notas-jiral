import { supabase } from "./supabase.js";

const BUCKET = "campesino-reinas";

async function cargarMiniaturas() {
    const [{ data: perfiles }, { data: fotos }] = await Promise.all([
        supabase.from("campesino_perfiles_reinas").select("reina_slug, foto_portada_ruta"),
        supabase.from("campesino_fotos").select("reina_slug, ruta_storage, creado_en").order("creado_en", { ascending: true }),
    ]);

    const rutaPorReina = new Map();

    // La primera foto de la galería es la opción de respaldo...
    if (Array.isArray(fotos)) {
        for (const foto of fotos) {
            if (!rutaPorReina.has(foto.reina_slug)) rutaPorReina.set(foto.reina_slug, foto.ruta_storage);
        }
    }

    // ...pero la foto de portada (si existe) tiene prioridad.
    if (Array.isArray(perfiles)) {
        for (const perfil of perfiles) {
            if (perfil.foto_portada_ruta) rutaPorReina.set(perfil.reina_slug, perfil.foto_portada_ruta);
        }
    }

    for (const [slug, ruta] of rutaPorReina) {
        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(ruta);
        const imgHtml = `<img src="${pub.publicUrl}" alt="" loading="lazy">`;

        const mini = document.getElementById(`mini-${slug}`);
        if (mini) mini.innerHTML = imgHtml;

        const contenedores = document.querySelectorAll(`[data-reina-foto="${slug}"]`);
        contenedores.forEach((el) => { el.innerHTML = imgHtml; });
    }
}

cargarMiniaturas();
