// =========================================================
// Catálogo de actividades — Decoremos el salón (Clase 1 y Clase 2)
// Ciencias Naturales 9° | C.E.B.G. EL JIRAL
// =========================================================
// Cada actividad la puede tomar UN SOLO grupo (ver
// js/decoracion_clase1.js y supabase_decoracion_clase1_v2.sql). La
// "zona" es solo una sugerencia de dónde va físicamente en el salón
// (puerta, pared 1/2/3/4, techo) — el estudiante puede acomodarla
// donde quede mejor si ya esa zona está muy llena.
//
// 30 actividades en total (74 estudiantes ÷ grupos de 2-3 ≈ 25-30
// grupos), para que sobren opciones y nadie se quede sin nada que
// hacer aunque las primeras más populares se agoten rápido.

window.CATALOGO_DECORACION_CLASE1 = [
  // ---- Clase 1: universo y sistema solar ----
  { id: "big-bang-mural", titulo: "Mural del Big Bang", zona: "Pared 1",
    descripcion: "En una cartulina o papel grande, dibujen un punto de luz en una esquina que se va \"expandiendo\" en círculos de colores hacia el resto de la hoja, como una explosión. Pueden usar témpera, marcadores o recortes." },
  { id: "movil-planetas", titulo: "Móvil colgante del sistema solar", zona: "Techo",
    descripcion: "Hagan los 8 planetas con bolas de papel periódico y pintura (o foamy), y cuélguenlos del techo con hilos de distinto largo, en el orden correcto desde el Sol." },
  { id: "via-lactea-espiral", titulo: "Espiral de la Vía Láctea", zona: "Pared 2",
    descripcion: "Dibujen o pinten una galaxia espiral grande (como la de la foto del banco de imágenes) usando papel oscuro de fondo y purpurina, témpera blanca/azul o papel picado para las \"estrellas\"." },
  { id: "linea-tiempo-universo", titulo: "Línea de tiempo del universo", zona: "Pared 3",
    descripcion: "Una tira larga de papel pegada horizontalmente en la pared, marcando con dibujos pequeños: Big Bang (13,800 M.A.) → formación del Sol y la Tierra (4,568-4,540 M.A.) → hoy." },
  { id: "poster-teorias-luna", titulo: "Póster de las 5 teorías del origen de la Luna", zona: "Pared 1",
    descripcion: "Dividan una cartulina en 5 recuadros: captura, fisión, conformación lunar, colisiones planetesimales y gran impacto. Un dibujo simple y una frase corta por cada una." },
  { id: "diorama-theia", titulo: "Diorama de Theia chocando con la Tierra", zona: "Pared 2",
    descripcion: "Con foamy, plastilina o cartón, hagan una escena pequeña (en una caja de zapatos sin tapa, de lado) mostrando el choque del protoplaneta Theia contra la Tierra primitiva." },
  { id: "radiacion-fondo", titulo: "Cartel de la radiación cósmica de fondo", zona: "Pared 3",
    descripcion: "Representen con manchas de color (como un mapa de calor) el \"eco\" que quedó del Big Bang y que hoy se detecta en todas direcciones del universo. Agreguen el dato: descubierta en 1965 por Penzias y Wilson." },
  { id: "nebulosa-colgante", titulo: "Nebulosa colgante", zona: "Techo",
    descripcion: "Con algodón teñido de colores (o papel celofán) dentro de una bolsa plástica transparente, hagan una \"nube\" que se cuelgue del techo con hilo — representa una nebulosa real." },
  { id: "secuencia-estrella", titulo: "Cartel: de protoestrella a supernova", zona: "Pared 1",
    descripcion: "Una secuencia de 4 dibujos en fila mostrando: nube de gas → protoestrella → estrella → supernova (explosión). Con una frase corta debajo de cada etapa." },
  { id: "puerta-portal", titulo: "La puerta como portal al espacio", zona: "Puerta",
    descripcion: "Decoren el marco y la superficie de la puerta como si fuera la entrada a una galaxia (estrellas, planetas pequeños, un aro de luz alrededor). Usen cinta adhesiva que no dañe la pintura." },

  // ---- Clase 2: origen de la vida, eras geológicas y tecnología espacial ----
  { id: "capas-tierra", titulo: "Corte transversal de la Tierra", zona: "Pared 2",
    descripcion: "Dibujen un círculo grande (la Tierra) cortado por la mitad, marcando y coloreando: núcleo (hierro/níquel), manto (silicatos), corteza, atmósfera e hidrósfera. Etiqueten cada capa." },
  { id: "linea-tiempo-geologica", titulo: "Línea de tiempo geológica (las 4 eras)", zona: "Pared 3",
    descripcion: "Tira larga en la pared dividida en 4 partes de distinto color: Precámbrico, Paleozoico, Mesozoico y Cenozoico, con un dibujo representativo en cada una (bacterias, trilobites, dinosaurios, mamíferos)." },
  { id: "mural-precambrico", titulo: "Mural del Precámbrico", zona: "Pared 1",
    descripcion: "Ilustren las primeras formas de vida: moléculas replicantes, cianobacterias haciendo fotosíntesis, y las primeras células eucariotas. Pueden usar tonos verdes/azules para representar los océanos primitivos." },
  { id: "explosion-cambrica", titulo: "Póster de la explosión cámbrica", zona: "Pared 2",
    descripcion: "Dibujen varios organismos raros e inventados (inspirados en trilobites, graptolitos, crinoideos) para representar la \"explosión\" de formas de vida nuevas que apareció en el periodo Cámbrico." },
  { id: "mural-dinosaurios", titulo: "Mural de dinosaurios del Mesozoico", zona: "Pared 3",
    descripcion: "Un mural grande con dinosaurios, pterosaurios (reptiles voladores) e ictiosaurios (reptiles marinos) — los tres grupos que dominaron la era Mesozoica." },
  { id: "pangea-fragmentada", titulo: "Cartel de Pangea fragmentándose", zona: "Pared 1",
    descripcion: "Dibujen 3 mapas en secuencia: Pangea unida, Pangea partiéndose, y los continentes actuales — mostrando cómo un solo supercontinente se separó en los que conocemos hoy." },
  { id: "era-mamiferos", titulo: "Póster \"La era de los mamíferos\" (Cenozoico)", zona: "Pared 2",
    descripcion: "Ilustren la evolución desde los primeros primates (hace 30 millones de años) hasta el Homo sapiens sapiens (hace 200,000 años), pasando por distintos mamíferos." },
  { id: "meteorito-extincion", titulo: "Cartel del meteorito que extinguió a los dinosaurios", zona: "Pared 3",
    descripcion: "Una ilustración del impacto de un meteorito gigante golpeando la Tierra, marcando el final de la era Mesozoica hace 66 millones de años." },
  { id: "telescopio-galileo", titulo: "Cartel del telescopio de Galileo (1610)", zona: "Pared 1",
    descripcion: "Dibujen o recreen el primer telescopio, con sus 4 grandes descubrimientos: la superficie de la Luna, el planeta Venus, los satélites de Júpiter y las manchas solares." },
  { id: "telescopio-james-webb", titulo: "Cartel del telescopio espacial James Webb", zona: "Pared 2",
    descripcion: "Un póster mostrando el telescopio James Webb (busca una imagen de referencia) y una imagen real que haya tomado del espacio, con una breve explicación de para qué sirve." },
  { id: "movil-sondas", titulo: "Móvil de sondas espaciales", zona: "Techo",
    descripcion: "Hagan pequeñas maquetas o dibujos recortados de las sondas Voyager 1 y 2, Cassini-Huygens y New Horizons, y cuélguenlas del techo con una etiqueta de qué exploró cada una." },
  { id: "mars-rovers", titulo: "Cartel de los Mars Rovers", zona: "Pared 3",
    descripcion: "Ilustren los 4 rovers que han explorado Marte: Sojourner, Spirit, Opportunity y Curiosity, con una línea de tiempo de cuándo llegó cada uno." },
  { id: "estacion-espacial", titulo: "Maqueta de la Estación Espacial Internacional", zona: "Techo",
    descripcion: "Con material reciclado (cartón, palitos, papel aluminio) hagan una maqueta sencilla de la EEI y cuélguenla del techo con hilo, como si estuviera orbitando." },
  { id: "naves-tripuladas", titulo: "Cartel: naves tripuladas vs. no tripuladas", zona: "Pared 1",
    descripcion: "Dividan un cartel en dos mitades: un lado con naves tripuladas (Soyuz, Crew Dragon) que llevan y traen astronautas, y el otro con sondas no tripuladas que viajan solas (Voyager, New Horizons)." },
  { id: "calendario-cosmico", titulo: "El calendario cósmico (un año comprimido)", zona: "Pared 2",
    descripcion: "Hagan un calendario de 12 meses en la pared y marquen en qué \"mes\" caería cada evento si los 4,570 millones de años de historia de la Tierra fueran solo un año (el Big Bang sería el 1 de enero, los humanos aparecerían en los últimos segundos del 31 de diciembre)." },
  { id: "cianobacterias-oxigeno", titulo: "Mural: cianobacterias y el cambio de la atmósfera", zona: "Pared 3",
    descripcion: "Ilustren cómo las primeras cianobacterias (hace 3,500 millones de años) empezaron a liberar oxígeno y cambiaron poco a poco la composición de la atmósfera terrestre." },
  { id: "escala-tiempo-geologico", titulo: "Cartel de la escala de tiempo geológico", zona: "Pared 1",
    descripcion: "Expliquen con un esquema (como una pirámide o escalera) las 4 unidades de tiempo geológico, de mayor a menor: Eón → Era → Periodo → Época." },
  { id: "exploracion-lunar", titulo: "Cartel de la exploración lunar como evidencia", zona: "Pared 2",
    descripcion: "Expliquen cómo las misiones a la Luna descubrieron que su composición geológica es parecida a la de la Tierra, y por qué eso apoya la teoría del gran impacto." },
  { id: "ventana-sistema-solar", titulo: "Decoración de la pared de las ventanas", zona: "Pared 4",
    descripcion: "Cuelguen soles, planetas o estrellas pequeñas de hilo transparente frente a las ventanas (Pared 4), para que se vean \"flotando\" con la luz que entra, sin tapar el paso de luz por completo." },
  { id: "capas-formacion-tierra", titulo: "Cartel: cómo se formaron las capas de la Tierra", zona: "Pared 3",
    descripcion: "Expliquen en 3-4 pasos cómo la Tierra, al calentarse y fundirse, fue separando sus materiales: los pesados (hierro, níquel) hundiéndose al centro, y los livianos formando las capas exteriores." },
];
