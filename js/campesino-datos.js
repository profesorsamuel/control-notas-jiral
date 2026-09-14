// =====================================================
// campesino-datos.js
// Lista fija de las 19 "reinas" del Día del Campesino 2026:
// 10 provincias/comarca de Primaria + 9 salones de Premedia.
// La usan campesino-reinas.html (índice) y campesino-galeria.html
// (galería de fotos de una reina), para no repetir esta lista.
// =====================================================

export const REINAS = [
    // ---------- PRIMARIA: una candidata por provincia/comarca ----------
    { slug: "primaria-panama", nombre: "Panamá", nivel: "primaria", detalle: "Salones II-A + II-B" },
    { slug: "primaria-colon", nombre: "Colón", nivel: "primaria", detalle: "Salones Jardín A + IV-C" },
    { slug: "primaria-chiriqui", nombre: "Chiriquí", nivel: "primaria", detalle: "Salones Jardín C + I-A" },
    { slug: "primaria-los-santos", nombre: "Los Santos", nivel: "primaria", detalle: "Salones I-C + VI-A" },
    { slug: "primaria-veraguas", nombre: "Veraguas", nivel: "primaria", detalle: "Salones IV-A + IV-B" },
    { slug: "primaria-cocle", nombre: "Coclé", nivel: "primaria", detalle: "Salones Prejardín B + V-A" },
    { slug: "primaria-herrera", nombre: "Herrera", nivel: "primaria", detalle: "Salones I-B + V-C" },
    { slug: "primaria-darien", nombre: "Darién", nivel: "primaria", detalle: "Salones Jardín B + VI-B" },
    { slug: "primaria-bocas-del-toro", nombre: "Bocas del Toro", nivel: "primaria", detalle: "Salones Prejardín A + V-B" },
    { slug: "primaria-panama-oeste", nombre: "Panamá Oeste", nivel: "primaria", detalle: "Salones III-B + III-C" },

    // ---------- PREMEDIA: una candidata por salón, provincia asignada por sorteo ----------
    { slug: "premedia-7a", nombre: "7° A", nivel: "premedia", detalle: "Provincia asignada: Bocas del Toro" },
    { slug: "premedia-7b", nombre: "7° B", nivel: "premedia", detalle: "Provincia asignada: Coclé" },
    { slug: "premedia-7c", nombre: "7° C", nivel: "premedia", detalle: "Provincia asignada: Colón" },
    { slug: "premedia-8a", nombre: "8° A", nivel: "premedia", detalle: "Provincia asignada: Chiriquí" },
    { slug: "premedia-8b", nombre: "8° B", nivel: "premedia", detalle: "Provincia asignada: Herrera" },
    { slug: "premedia-8c", nombre: "8° C", nivel: "premedia", detalle: "Provincia asignada: Los Santos" },
    { slug: "premedia-9a", nombre: "9° A", nivel: "premedia", detalle: "Provincia asignada: Panamá" },
    { slug: "premedia-9b", nombre: "9° B", nivel: "premedia", detalle: "Provincia asignada: Panamá Oeste" },
    { slug: "premedia-9c", nombre: "9° C", nivel: "premedia", detalle: "Provincia asignada: Veraguas" },
];

export function buscarReina(slug) {
    return REINAS.find((r) => r.slug === slug) || null;
}
