// =========================================================
// Banco de fotos — Ejercicio 3 (Pareo de imágenes) — Clase 1: El
// origen del universo y del sistema solar | Ciencias Naturales 9°
// C.E.B.G. EL JIRAL
// =========================================================
// Cada vez que un estudiante practica este ejercicio, se toman 8
// fotos AL AZAR de este banco completo de 32 (ver
// js/fotos_clase1.js). Para agregar más fotos en el futuro, solo hay
// que poner la imagen en img/vocabulario-clase1/ y agregar su fila
// aquí — el ejercicio se ajusta solo.

window.BANCO_FOTOS_CLASE1 = [
  { imagen: "01.jpg", nombre: "Universo" },
  { imagen: "02.jpg", nombre: "Galaxia" },
  { imagen: "03.jpg", nombre: "Vía Láctea" },
  { imagen: "04.jpg", nombre: "Sistema Solar" },
  { imagen: "05.jpg", nombre: "Big Bang" },
  { imagen: "06.jpg", nombre: "Singularidad" },
  { imagen: "07.jpg", nombre: "Expansión" },
  { imagen: "08.jpg", nombre: "Radiación Cósmica de Fondo" },
  { imagen: "09.jpg", nombre: "Nebulosa" },
  { imagen: "10.jpg", nombre: "Gravedad" },
  { imagen: "11.jpg", nombre: "Acreción" },
  { imagen: "12.jpg", nombre: "Protosol" },
  { imagen: "13.jpg", nombre: "Planetesimal" },
  { imagen: "14.jpg", nombre: "Protoplaneta" },
  { imagen: "15.jpg", nombre: "Disco Protoplanetario" },
  { imagen: "16.jpg", nombre: "Órbita" },
  { imagen: "17.jpg", nombre: "Protoestrella" },
  { imagen: "18.jpg", nombre: "Estrella" },
  { imagen: "19.jpg", nombre: "Supernova" },
  { imagen: "20.jpg", nombre: "Onda de Choque" },
  { imagen: "21.jpg", nombre: "Asteroide" },
  { imagen: "22.jpg", nombre: "Cometa" },
  { imagen: "23.jpg", nombre: "Astronomía" },
  { imagen: "24.jpg", nombre: "Astrofísica" },
  { imagen: "25.jpg", nombre: "Luna" },
  { imagen: "26.jpg", nombre: "Satélite Natural" },
  { imagen: "27.jpg", nombre: "Captura" },
  { imagen: "28.jpg", nombre: "Fisión" },
  { imagen: "29.jpg", nombre: "Conformación Lunar" },
  { imagen: "30.jpg", nombre: "Colisiones Planetesimales" },
  { imagen: "31.jpg", nombre: "Gran Impacto" },
  { imagen: "32.jpg", nombre: "Theia" },
].map((t) => ({ ...t, imagen: `../img/vocabulario-clase1/${t.imagen}` }));
