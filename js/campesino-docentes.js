// =====================================================
// campesino-docentes.js
// Lista de docentes del plantel (para el selector de acceso) y la
// fórmula de su clave: primera letra del nombre + última letra del
// apellido, sin tildes, en minúscula. Ej. "Samuel Ortega" -> "sa".
//
// Esta comprobación en el navegador es solo para dar una respuesta
// inmediata ("clave incorrecta"); la que realmente protege los datos
// se hace en Supabase (supabase/campesino_reinas.sql), así que no se
// puede saltar aunque alguien manipule esta página.
// =====================================================

export const DOCENTES = [
    "Albertina Ortiz", "Alejandrina Salazar", "Alexis Del Mar", "Ana Grenard",
    "Anabelis Gallardo", "Ananías Benítes", "Angélica Jiménez", "Arline Henry",
    "Ayllen Nieto", "Berta Barreno", "Beto Correa", "Betzaida Rodríguez",
    "Carmen Gaitán", "Claribel Camargo", "Danisue Valdés", "Doris Andrión",
    "Elaisa Jaramillo", "Encelma Álvarez", "Erika Pimentel", "Faustina Rodríguez",
    "Geraldine Magallón", "Gillian Barría", "Heidi De León", "Isaura Góndolo",
    "Jenifer Dean", "Juana Brown", "Laura Rodríguez", "Leonela Rivera",
    "Lesbia Muñoz", "Leticia de Palacios", "Magalis Rodríguez", "Milvia Ortega",
    "Miriam Valencia", "Nairobys Sáenz", "Nitzi Williams", "Patricia Reyes",
    "Ronald González", "Rosa Perea", "Samuel Ortega", "Telma Escobar",
    "Telma Grenald", "Tilsa Garibaldi", "Viodelka Goitía", "Wendy Harren",
    "Yadira de Gracia", "Yessenia Clark", "Yetzagelis Batista", "Yitzuri Vargas",
    "Zulma Becerra", "Ángela Hall",
].sort((a, b) => a.localeCompare(b, "es"));

function quitarTildes(texto) {
    return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function claveEsperada(nombreCompleto) {
    const partes = (nombreCompleto || "").trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return "";
    const primeraLetra = quitarTildes(partes[0]).replace(/[^A-Za-z]/g, "").charAt(0).toLowerCase();
    const ultimaPalabra = quitarTildes(partes[partes.length - 1]).replace(/[^A-Za-z]/g, "");
    const ultimaLetra = ultimaPalabra.charAt(ultimaPalabra.length - 1).toLowerCase();
    return `${primeraLetra}${ultimaLetra}`;
}
