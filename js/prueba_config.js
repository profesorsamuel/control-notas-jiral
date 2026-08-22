// =========================================================
// CONFIGURACIÓN — Examen de Recuperación de Ciencias Naturales 9°
// C.E.B.G. EL JIRAL
// =========================================================
// Este es el ÚNICO lugar que necesitas tocar para:
//  - Cambiar la fecha/hora del examen
//  - Cambiar cuántas preguntas se toman en el examen oficial
//  - Cambiar los tiempos por dificultad
//  - Agregar/quitar salones
// La conexión a Supabase (URL y llave) ya vive en js/portal-config.js
// (se reutiliza la misma que usa el resto del sistema).
// =========================================================

window.PRUEBA_CONFIG = {

  // ---- Identidad del examen ----
  materia: "Ciencias Naturales",
  grado: "9°",
  tituloExamen: "Examen de Recuperación de Ciencias Naturales 9°",
  escuela: "C.E.B.G. EL JIRAL",
  codigoExamen: "cn9-recuperacion-2026", // usado como clave en Supabase; cámbialo si haces otro examen

  // ---- Salones habilitados para este examen ----
  // (deben existir estudiantes con este valor exacto en la columna "salon" de la tabla "estudiantes")
  salones: ["9A", "9B", "9C"],

  // ---- Fecha y hora oficiales ----
  // Formato ISO con zona horaria de Panamá (UTC-5, sin horario de verano)
  // "fechaLimiteInscripcion": hasta cuándo un estudiante puede REGISTRARSE
  // por primera vez (elegir salón/nombre/cédula). Los estudiantes ya
  // registrados antes de esa fecha pueden seguir entrando después sin problema.
  fechaLimiteInscripcion: "2026-08-27T23:59:59-05:00",
  // "fechaInicio"/"fechaLimiteAcceso": la ventana real para PRESENTAR el
  // examen oficial (el modo práctica no depende de estas fechas).
  fechaInicio: "2026-08-29T09:00:00-05:00",
  fechaLimiteAcceso: "2026-08-29T09:10:00-05:00",
  // Si quieres, puedes poner una hora de cierre total del examen (nadie más entrega después de esto).
  // Si el estudiante ya empezó antes de esta hora, se le deja terminar su intento.
  fechaCierreTotal: "2026-08-29T11:00:00-05:00",

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

  // ---- Nombres de tablas en Supabase (creadas por supabase/prueba_ciencias_9.sql) ----
  tablas: {
    sesiones: "prueba_sesiones",
    eventos: "prueba_eventos",
  },

  // ---- Clave del panel del docente ----
  // Cámbiala por algo solo tú conozcas. No es un sistema de seguridad robusto
  // (es una llave visible en el código fuente), solo evita que estudiantes
  // curiosos entren por accidente al panel. Para más seguridad real, se
  // podría integrar con el login de profesores que ya tiene el sistema.
  claveAdmin: "jiral2026",
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
