// =========================================================
// Banco de fotos — Ejercicio 3 (Pareo de imágenes) — Clase 2: La vida
// en la Tierra, la historia geológica y la exploración del universo
// Ciencias Naturales 9° | C.E.B.G. EL JIRAL
// =========================================================
// Cada vez que un estudiante practica este ejercicio, se toman 8
// fotos AL AZAR de este banco completo de 25 (ver js/fotos_clase2.js).
// Para agregar más fotos en el futuro, solo hay que poner la imagen
// en img/clase2/ y agregar su fila aquí — el ejercicio se ajusta solo.

window.BANCO_FOTOS_CLASE2 = [
  { imagen: "01_tierra_incandescente.jpg", nombre: "Tierra incandescente" },
  { imagen: "02_capas_de_la_tierra.jpg", nombre: "Capas de la Tierra" },
  { imagen: "03_erupcion_volcanica.jpg", nombre: "Erupción volcánica" },
  { imagen: "04_hidrosfera.jpg", nombre: "Hidrósfera" },
  { imagen: "05_molecula_organica.jpg", nombre: "Molécula orgánica" },
  { imagen: "06_celula_procariota.jpg", nombre: "Célula procariota" },
  { imagen: "07_celula_eucariota.jpg", nombre: "Célula eucariota" },
  { imagen: "08_trilobite.jpg", nombre: "Trilobite" },
  { imagen: "09_crinoideo.jpg", nombre: "Crinoideo" },
  { imagen: "10_anfibio.jpg", nombre: "Anfibio" },
  { imagen: "11_pangea.jpg", nombre: "Pangea" },
  { imagen: "12_dinosaurio.jpg", nombre: "Dinosaurio" },
  { imagen: "13_pterosaurio.jpg", nombre: "Pterosaurio" },
  { imagen: "14_ictiosaurio.jpg", nombre: "Ictiosaurio" },
  { imagen: "15_mamiferos.jpg", nombre: "Mamíferos" },
  { imagen: "16_primate.jpg", nombre: "Primate" },
  { imagen: "17_galileo_galilei.jpg", nombre: "Galileo Galilei" },
  { imagen: "18_superficie_lunar.jpg", nombre: "Superficie lunar" },
  { imagen: "19_jupiter_y_satelites.jpg", nombre: "Júpiter y sus satélites" },
  { imagen: "20_manchas_solares.jpg", nombre: "Manchas solares" },
  { imagen: "21_telescopio_james_webb.jpg", nombre: "Telescopio espacial James Webb" },
  { imagen: "22_estacion_espacial_internacional.jpg", nombre: "Estación Espacial Internacional" },
  { imagen: "23_sonda_espacial.jpg", nombre: "Sonda espacial" },
  { imagen: "24_rover_de_marte.jpg", nombre: "Rover de Marte" },
  { imagen: "25_nave_espacial_tripulada.jpg", nombre: "Nave espacial tripulada" },
].map((t) => ({ ...t, imagen: `../img/clase2/${t.imagen}` }));
