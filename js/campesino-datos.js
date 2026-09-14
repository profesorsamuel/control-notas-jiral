// =====================================================
// campesino-datos.js
// Lista fija de las 20 "reinas" del Día del Campesino 2026:
// 11 provincias/comarca de Primaria + 9 salones de Premedia.
// La usan campesino-reinas.html (índice) y campesino-galeria.html
// (galería de fotos de una reina), para no repetir esta lista.
//
// "docentes" son los salones y profesores(as) que representan a cada
// reina (siempre los mismos, ya definidos en el programa del evento),
// así que se muestran automáticamente sin depender de la base de datos.
// =====================================================

export const REINAS = [
    // ---------- PRIMARIA: una candidata por provincia/comarca ----------
    {
        slug: "primaria-panama", nombre: "Panamá", nivel: "primaria", detalle: "Salones II-A + II-B",
        docentes: [
            { salon: "II-A", nombre: "Telma Grenald" },
            { salon: "II-B", nombre: "Ana Grenard" },
        ],
        apoyo: { salon: "IX-A", nombre: "Miriam Valencia" },
    },
    {
        slug: "primaria-colon", nombre: "Colón", nivel: "primaria", detalle: "Salones Jardín A + IV-C",
        docentes: [
            { salon: "Jardín A", nombre: "Albertina Ortiz" },
            { salon: "IV-C", nombre: "Anabelis Gallardo" },
        ],
        apoyo: { salon: "VII-C", nombre: "Ronald González" },
    },
    {
        slug: "primaria-chiriqui", nombre: "Chiriquí", nivel: "primaria", detalle: "Salones Jardín C + I-A",
        docentes: [
            { salon: "Jardín C", nombre: "Tilsa Garibaldi" },
            { salon: "I-A", nombre: "Heidi De León" },
        ],
        apoyo: { salon: "VIII-A", nombre: "Juana Brown" },
    },
    {
        slug: "primaria-los-santos", nombre: "Los Santos", nivel: "primaria", detalle: "Salones I-C + VI-A",
        docentes: [
            { salon: "I-C", nombre: "Ananías Benítes" },
            { salon: "VI-A", nombre: "Viodelka Goitía" },
        ],
        apoyo: { salon: "VIII-C", nombre: "Nairobys Sáenz" },
    },
    {
        slug: "primaria-veraguas", nombre: "Veraguas", nivel: "primaria", detalle: "Salones IV-A + IV-B",
        docentes: [
            { salon: "IV-A", nombre: "Angélica Jiménez" },
            { salon: "IV-B", nombre: "Rosa Perea" },
        ],
        apoyo: { salon: "IX-C", nombre: "Samuel Ortega" },
    },
    {
        slug: "primaria-cocle", nombre: "Coclé", nivel: "primaria", detalle: "Salones Prejardín B + V-A",
        docentes: [
            { salon: "Prejardín B", nombre: "Milvia Ortega" },
            { salon: "V-A", nombre: "Geraldine Magallón" },
        ],
        apoyo: { salon: "VII-B", nombre: "Erika Pimentel" },
    },
    {
        slug: "primaria-herrera", nombre: "Herrera", nivel: "primaria", detalle: "Salones I-B + V-C",
        docentes: [
            { salon: "I-B", nombre: "Zulma Becerra" },
            { salon: "V-C", nombre: "Elaisa Jaramillo" },
        ],
        apoyo: { salon: "VIII-B", nombre: "Leonela Rivera" },
    },
    {
        slug: "primaria-darien", nombre: "Darién", nivel: "primaria", detalle: "Salones Jardín B + VI-B",
        docentes: [
            { salon: "Jardín B", nombre: "Ángela Hall" },
            { salon: "VI-B", nombre: "Alejandrina Salazar" },
        ],
        apoyo: { salon: "VII-A (compartido)", nombre: "Leticia de Palacios" },
    },
    {
        slug: "primaria-bocas-del-toro", nombre: "Bocas del Toro", nivel: "primaria", detalle: "Salones Prejardín A + V-B",
        docentes: [
            { salon: "Prejardín A", nombre: "Lesbia Muñoz" },
            { salon: "V-B", nombre: "Yessenia Clark" },
        ],
        apoyo: { salon: "VII-A", nombre: "Leticia de Palacios" },
    },
    {
        slug: "primaria-panama-oeste", nombre: "Panamá Oeste", nivel: "primaria", detalle: "Salones III-B + III-C",
        docentes: [
            { salon: "III-B", nombre: "Jenifer Dean" },
            { salon: "III-C", nombre: "Telma Escobar" },
        ],
        apoyo: { salon: "IX-B", nombre: "Wendy Harren" },
    },
    {
        slug: "primaria-comarcas-indigenas", nombre: "Comarcas Indígenas", nivel: "primaria", detalle: "Salones II-C + III-A",
        docentes: [
            { salon: "II-C", nombre: "Carmen Gaitán" },
            { salon: "III-A", nombre: "Betzaida Rodríguez" },
        ],
        apoyo: { salon: "VIII-A (compartido)", nombre: "Juana Brown" },
    },

    // ---------- PREMEDIA: una candidata por salón, provincia asignada por sorteo ----------
    {
        slug: "premedia-7a", nombre: "7° A", nivel: "premedia", detalle: "Provincia asignada: Bocas del Toro",
        docentes: [{ salon: "VII-A", nombre: "Leticia de Palacios" }],
    },
    {
        slug: "premedia-7b", nombre: "7° B", nivel: "premedia", detalle: "Provincia asignada: Coclé",
        docentes: [{ salon: "VII-B", nombre: "Erika Pimentel" }],
    },
    {
        slug: "premedia-7c", nombre: "7° C", nivel: "premedia", detalle: "Provincia asignada: Colón",
        docentes: [{ salon: "VII-C", nombre: "Ronald González" }],
    },
    {
        slug: "premedia-8a", nombre: "8° A", nivel: "premedia", detalle: "Provincia asignada: Chiriquí",
        docentes: [{ salon: "VIII-A", nombre: "Juana Brown" }],
    },
    {
        slug: "premedia-8b", nombre: "8° B", nivel: "premedia", detalle: "Provincia asignada: Herrera",
        docentes: [{ salon: "VIII-B", nombre: "Leonela Rivera" }],
    },
    {
        slug: "premedia-8c", nombre: "8° C", nivel: "premedia", detalle: "Provincia asignada: Los Santos",
        docentes: [{ salon: "VIII-C", nombre: "Nairobys Sáenz" }],
    },
    {
        slug: "premedia-9a", nombre: "9° A", nivel: "premedia", detalle: "Provincia asignada: Panamá",
        docentes: [{ salon: "IX-A", nombre: "Miriam Valencia" }],
    },
    {
        slug: "premedia-9b", nombre: "9° B", nivel: "premedia", detalle: "Provincia asignada: Panamá Oeste",
        docentes: [{ salon: "IX-B", nombre: "Wendy Harren" }],
    },
    {
        slug: "premedia-9c", nombre: "9° C", nivel: "premedia", detalle: "Provincia asignada: Veraguas",
        docentes: [{ salon: "IX-C", nombre: "Samuel Ortega" }],
    },
];

export function buscarReina(slug) {
    return REINAS.find((r) => r.slug === slug) || null;
}

// =====================================================
// Paleta de "colores básicos" para que cada reina elija el color
// que usará el día del evento. Es independiente por nivel: una reina
// de Primaria y una de Premedia sí pueden compartir color (son
// horarios distintos), pero dos reinas del mismo nivel no.
// =====================================================
export const COLORES_BASICOS = [
    { nombre: "Rojo", hex: "#E63946" },
    { nombre: "Azul", hex: "#1D4ED8" },
    { nombre: "Amarillo", hex: "#F4C430" },
    { nombre: "Verde", hex: "#2E7D32" },
    { nombre: "Anaranjado", hex: "#F97316" },
    { nombre: "Morado", hex: "#7C3AED" },
    { nombre: "Rosado", hex: "#EC4899" },
    { nombre: "Celeste", hex: "#38BDF8" },
    { nombre: "Turquesa", hex: "#14B8A6" },
    { nombre: "Vino", hex: "#7A1F2B" },
    { nombre: "Café", hex: "#7B4B2A" },
    { nombre: "Negro", hex: "#1F2937" },
    { nombre: "Blanco", hex: "#FFFFFF" },
    { nombre: "Gris", hex: "#6B7280" },
    { nombre: "Dorado", hex: "#D19A1F" },
];
