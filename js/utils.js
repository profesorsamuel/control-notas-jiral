// =====================================================
// UTILIDADES COMPARTIDAS
// =====================================================
//
// Convierte una cédula en un correo "interno" único,
// ya que Supabase Auth solo acepta correo/teléfono como
// identificador para registro e inicio de sesión.
//
// El estudiante nunca ve ni escribe este correo: solo
// escribe su cédula, y esta función arma el correo por
// detrás para enviárselo a Supabase.
//
// Se usa tanto en registro.js (al crear la cuenta) como
// en login.js (al iniciar sesión), para que ambos generen
// exactamente el mismo correo a partir de la misma cédula.

export function cedulaAEmail(cedula) {

    const cedulaLimpia = cedula
        .trim()
        .toLowerCase()
        .replace(/[\s-]/g, "");

    return `${cedulaLimpia}@notasjiral.local`;
}