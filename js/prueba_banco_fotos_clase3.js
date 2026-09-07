// =========================================================
// Banco de fotos — Ejercicio 3 (Pareo de imágenes) — Clase 3: El
// movimiento ondulatorio | Ciencias Naturales 9° | C.E.B.G. EL JIRAL
// =========================================================
// Cada vez que un estudiante practica este ejercicio, se toman 8
// fotos AL AZAR de este banco completo de 33 (ver js/fotos_clase3.js).
// Para agregar más fotos en el futuro, solo hay que poner la imagen
// en img/clase3/ y agregar su fila aquí — el ejercicio se ajusta solo.

window.BANCO_FOTOS_CLASE3 = [
  { imagen: "01_onda_transversal.jpg", nombre: "Onda transversal" },
  { imagen: "02_onda_longitudinal.jpg", nombre: "Onda longitudinal" },
  { imagen: "03_cresta.jpg", nombre: "Cresta" },
  { imagen: "04_valle.jpg", nombre: "Valle" },
  { imagen: "05_linea_equilibrio.jpg", nombre: "Línea de equilibrio" },
  { imagen: "06_amplitud.jpg", nombre: "Amplitud" },
  { imagen: "07_longitud_de_onda.jpg", nombre: "Longitud de onda" },
  { imagen: "08_frecuencia_alta.jpg", nombre: "Frecuencia alta" },
  { imagen: "09_frecuencia_baja.jpg", nombre: "Frecuencia baja" },
  { imagen: "10_ciclo.jpg", nombre: "Ciclo" },
  { imagen: "11_oscilacion.jpg", nombre: "Oscilación" },
  { imagen: "12_vibracion.jpg", nombre: "Vibración" },
  { imagen: "13_propagacion.jpg", nombre: "Propagación" },
  { imagen: "14_energia_cinetica.jpg", nombre: "Energía cinética" },
  { imagen: "15_energia_potencial.jpg", nombre: "Energía potencial" },
  { imagen: "16_onda_mecanica.jpg", nombre: "Onda mecánica" },
  { imagen: "17_onda_electromagnetica.jpg", nombre: "Onda electromagnética" },
  { imagen: "18_vacio.jpg", nombre: "Vacío" },
  { imagen: "19_onda_viajera.jpg", nombre: "Onda viajera" },
  { imagen: "20_onda_estacionaria.jpg", nombre: "Onda estacionaria" },
  { imagen: "21_onda_unidimensional.jpg", nombre: "Onda unidimensional" },
  { imagen: "22_onda_bidimensional.jpg", nombre: "Onda bidimensional" },
  { imagen: "23_onda_tridimensional.jpg", nombre: "Onda tridimensional" },
  { imagen: "24_sonido.jpg", nombre: "Sonido" },
  { imagen: "25_luz.jpg", nombre: "Luz" },
  { imagen: "26_radiacion.jpg", nombre: "Radiación" },
  { imagen: "27_radiactividad.jpg", nombre: "Radiactividad" },
  { imagen: "28_electron.jpg", nombre: "Electrón" },
  { imagen: "29_nanoescala.jpg", nombre: "Nanoescala" },
  { imagen: "30_optica.jpg", nombre: "Óptica" },
  { imagen: "31_laser.jpg", nombre: "Láser" },
  { imagen: "32_comunicacion.jpg", nombre: "Comunicación" },
  { imagen: "33_ola_del_mar.jpg", nombre: "Ola del mar" },
].map((t) => ({ ...t, imagen: `../img/clase3/${t.imagen}` }));
