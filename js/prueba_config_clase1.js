// =========================================================
// CONFIGURACIÓN — Examen Clase 1: El origen del universo y del sistema solar
// Ciencias Naturales 9° | C.E.B.G. EL JIRAL
// =========================================================
// Este es el ÚNICO lugar que necesitas tocar para:
//  - Cambiar la fecha/hora del examen oficial
//  - Cambiar cuántas preguntas se toman en práctica/oficial (banco tiene 75)
//  - Cambiar los tiempos por dificultad
//  - Cambiar la clave del panel del docente
// La conexión a Supabase (URL y llave) ya vive en js/portal-config.js
// (se reutiliza la misma que usa el resto del sistema).
// El motor (js/prueba_ciencias.js) es el MISMO que usan los demás exámenes:
// es genérico y lee todo desde este archivo de configuración.
// =========================================================

window.PRUEBA_CONFIG = {

  // ---- Identidad del examen ----
  materia: "Ciencias Naturales",
  grado: "9°",
  tituloExamen: "Examen Clase 1: El origen del universo y del sistema solar",
  escuela: "C.E.B.G. EL JIRAL",
  codigoExamen: "cn9-clase1-universo-2026", // clave única en Supabase para este examen
  bancoGlobal: "BANCO_CLASE1_CIENCIAS_9",
  paginaExamen: "prueba_clase1_ciencias_9.html",

  // ---- Salones habilitados para este examen ----
  // (deben existir estudiantes con este valor exacto en la columna "salon"
  // de la tabla "estudiantes" — son los mismos salones que ya usa el resto del sistema)
  salones: ["9A", "9B", "9C"],

  // ---- Fecha y hora oficiales ----
  // Formato ISO con zona horaria de Panamá (UTC-5, sin horario de verano).
  // AJUSTA estas 4 fechas según cuándo quieras abrir/cerrar este examen.
  // "fechaLimiteInscripcion": hasta cuándo un estudiante puede REGISTRARSE
  // por primera vez (elegir salón/nombre y ver su cédula). Los estudiantes ya
  // registrados antes de esa fecha pueden seguir entrando después sin problema.
  fechaLimiteInscripcion: "2026-09-22T23:59:59-05:00",
  // "fechaInicio"/"fechaLimiteAcceso": la ventana real para PRESENTAR el
  // examen oficial (el modo práctica no depende de estas fechas y está
  // disponible desde ya).
  fechaInicio: "2026-09-24T09:00:00-05:00",
  fechaLimiteAcceso: "2026-09-24T09:20:00-05:00",
  // Hora de cierre total del examen (nadie más entrega después de esto).
  // Si el estudiante ya empezó antes de esta hora, se le deja terminar su intento.
  fechaCierreTotal: "2026-09-24T11:00:00-05:00",

  // ---- Examen oficial ----
  // El banco tiene 75 preguntas; cada estudiante recibe una selección
  // aleatoria (pero fija para él/ella) de este tamaño.
  preguntasExamenOficial: 25,
  unSoloIntento: true,

  // ---- Modo práctica ----
  preguntasModoPractica: 15,

  // ---- Tiempos por pregunta según dificultad (segundos) ----
  tiempos: {
    basica: 30,
    intermedia: 60,
    dificil: 90,
    avanzada: 120,
  },

  // ---- Escala de calificación MEDUCA (nota de 1.0 a 5.0) ----
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

  // ---- Clave para entrar al Panel del Docente (cámbiala por una propia) ----
  claveAdmin: "clase1jiral2026",

  // ---- Nombres de tablas en Supabase (compartidas con los demás exámenes;
  // se distinguen por "codigoExamen", así que no se mezclan los resultados) ----
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
