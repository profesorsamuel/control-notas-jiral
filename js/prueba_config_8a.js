// =========================================================
// CONFIGURACIÓN — Examen de Recuperación de Ciencias Naturales 8A
// C.E.B.G. EL JIRAL — Prof. Samuel Ortega
// =========================================================
// Igual que en el examen de 9°: este es el único lugar que necesitas
// tocar para cambiar fecha, cantidad de preguntas, tiempos, etc.
// La conexión a Supabase ya vive en js/portal-config.js (se reutiliza).
// =========================================================

window.PRUEBA_CONFIG = {

  // ---- Identidad del examen ----
  materia: "Ciencias Naturales",
  grado: "8°A",
  tituloExamen: "Examen de Recuperación de Ciencias Naturales 8A",
  escuela: "C.E.B.G. EL JIRAL",
  codigoExamen: "cn8a-recuperacion-2026", // identifica este examen en Supabase; distinto al de 9°
  bancoGlobal: "BANCO_CIENCIAS_8A",
  paginaExamen: "prueba_ciencias_8a.html",

  // ---- Salones habilitados para este examen ----
  salones: ["8A"],

  // ---- Fecha límite de inscripción ----
  fechaLimiteInscripcion: "2026-08-27T23:59:59-05:00",

  // ---- Fecha y hora oficiales (misma que el examen de 9°) ----
  fechaInicio: "2026-09-03T10:00:00-05:00",
  fechaLimiteAcceso: "2026-09-03T10:10:00-05:00",
  fechaCierreTotal: "2026-09-03T12:00:00-05:00",

  // ---- Examen oficial ----
  preguntasExamenOficial: 25,
  unSoloIntento: true,

  // ---- Modo práctica ----
  preguntasModoPractica: 20,

  // ---- Tiempos por pregunta según dificultad (segundos) ----
  tiempos: {
    basica: 30,
    intermedia: 60,
    dificil: 90,
    avanzada: 120,
  },

  // ---- Escala de calificación MEDUCA ----
  escalaMeduca: [
    { min: 91, max: 100, nota: 5.0 },
    { min: 81, max: 90, nota: 4.5 },
    { min: 71, max: 80, nota: 4.0 },
    { min: 61, max: 70, nota: 3.5 },
    { min: 51, max: 60, nota: 3.0 },
    { min: 41, max: 50, nota: 2.5 },
    { min: 31, max: 40, nota: 2.0 },
    { min: 21, max: 30, nota: 1.5 },
    { min: 0, max: 20, nota: 1.0 },
  ],

  // ---- Seguridad ----
  maxCambiosPestanaAntesDeAlerta: 3,
  segundosInactividadAlerta: 45,

  // ---- Nombres de tablas en Supabase (las MISMAS tablas que usa el examen de 9°;
  // ambos exámenes conviven ahí gracias al campo "codigo_examen") ----
  tablas: {
    sesiones: "prueba_sesiones",
    eventos: "prueba_eventos",
  },

};

// ---- Utilidad: calcular nota MEDUCA a partir de un porcentaje ----
window.calcularNotaMeduca = function (porcentaje) {
  const escala = window.PRUEBA_CONFIG.escalaMeduca;
  for (const tramo of escala) {
    if (porcentaje >= tramo.min && porcentaje <= tramo.max) return tramo.nota;
  }
  return 1.0;
};

// ---- Utilidad: tiempo en segundos según dificultad ----
window.tiempoPorDificultad = function (dificultad) {
  return window.PRUEBA_CONFIG.tiempos[dificultad] || 60;
};
