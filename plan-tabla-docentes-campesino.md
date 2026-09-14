# Plan de trabajo — Tabla de docentes en "Día del Campesino"

Proyecto: control-notas-jiral (C.E.B.G. General El Jiral)
Archivos: `pages/dia-del-campesino.html` y `js/campesino-platos.js`

## Objetivo
Reemplazar la tabla única actual (Salón / Docente / Apoyo de Premedia / Plato / Color)
por **dos pestañas numeradas: "Primaria" y "Premedia"**, cada una con las columnas
**N° / Salón / Docente / Plato de comida o Actividad / Color a traer**, incluyendo
a los maestros especiales que faltaban.

## Decisiones ya tomadas
- Dos pestañas separadas (Primaria / Premedia), numeradas 1, 2, 3...
- Se elimina la columna "Apoyo de Premedia" (tenía rowspan, emparejaba primaria con premedia).
- Los docentes especiales no tienen salón fijo → se usa su **nombre completo** como
  identificador único (`data-salon="Nombre Apellido"`) en vez de un salón. No requiere
  cambios en Supabase (la tabla `campesino_platos` ya usa una columna de texto libre
  como llave, con `upsert onConflict: "salon"`).

## Lista completa de docentes (ya recopilada, no falta nada)

### Primaria — normales (22)
1. Lesbia Muñoz — P-J-A
2. Milvia Ortega — P-J-B
3. Albertina Ortiz — J-A
4. Ángela Hall — J-B
5. Tilsa Garibaldi — J-C
6. Heidi De León — I-A
7. Zulma Becerra — I-B
8. Ananías Benítes — I-C
9. Telma Grenald — II-A
10. Ana Grenard — II-B
11. Carmen Gaitán — II-C
12. Betzaida Rodríguez — III-A
13. Jenifer Dean — III-B
14. Telma Escobar — III-C
15. Angélica Jiménez — IV-A
16. Rosa Perea — IV-B
17. Anabelis Gallardo — IV-C
18. Geraldine Magallón — V-A
19. Yessenia Clark — V-B
20. Elaisa Jaramillo — V-C
21. Viodelka Goitía — VI-A
22. Alejandrina Salazar — VI-B

### Primaria — especiales (11)
23. Beto Correa — Educación Física
24. Isaura Góndolo — Educación Física
25. Berta Barreno — Familia y Desarrollo
26. Patricia Reyes — Inglés
27. Arline Henry — Inglés
28. Danisue Valdés — Inglés
29. Yitzuri Vargas — Inglés
30. Laura Rodríguez — Inglés
31. Claribel Camargo — Educación Especial
32. Magalis Rodríguez — Educación Especial
33. Doris Andrión — Informática

### Premedia — normales (9)
1. Leticia de Palacios — VII-A · Español
2. Erika Pimentel — VII-B · Familia y Desarrollo
3. Ronald González — VII-C · Teacher/Música
4. Juana Brown — VIII-A · Matemática
5. Leonela Rivera — VIII-B · Matemática
6. Nairobys Sáenz — VIII-C · Ciencias Naturales
7. Miriam Valencia — IX-A · Expresión Artística
8. Wendy Harren — IX-B · Inglés
9. Samuel Ortega — IX-C · Ciencias Naturales

### Premedia — especiales (8)
10. Alexis Del Mar — Agropecuaria
11. Nitzi Williams — Orientación
12. Yadira de Gracia — Español
13. Encelma Álvarez — Religión–Música
14. Faustina Rodríguez — Geografía
15. Gillian Barría — Educación Física
16. Yetzagelis Batista — Educación Especial
17. Ayllen Nieto — Inglés–Religión

**Total: 33 en Primaria + 17 en Premedia = 50 filas.**

## Fases pendientes

**Fase 2 — HTML: pestañas**
Insertar sub-pestañas "Primaria" / "Premedia" dentro de la sección `#ranchos`
(donde está hoy `<table id="tabla-platos">`, línea ~1002), reutilizando el mismo
patrón de pestañas que ya usa la página (`nav.tabs` + el script al final del
archivo que hace `showSection`). No hace falta inventar un sistema nuevo, solo
adaptarlo a escala de tabla en vez de sección completa.

**Fase 3 — HTML: filas**
Construir las dos tablas con las 50 filas de arriba, numeradas, sin la columna
"Apoyo de Premedia" ni los `rowspan`. Cada fila especial usa el nombre del
docente como `data-salon`.

**Fase 4 — JS (`campesino-platos.js`)**
Verificar que `cargarPlatos()` y `guardarPlatos()` sigan funcionando igual con
50 inputs repartidos en dos tablas en vez de ~22 en una sola. No debería
requerir cambios de lógica, solo confirmarlo.

**Fase 5 — Pruebas**
Cambiar de pestaña, desbloquear con contraseña (Elaisa/Miriam/Samuel), escribir
un plato/color de prueba, guardar, y revisar en celular que el diseño
responsive (`.rtable`) siga viéndose bien.

**Fase 6 — Publicar**
Reemplazar el archivo actualizado en el proyecto real.

## Decisión pendiente (contestar antes de seguir)
Dentro de cada pestaña, ¿los docentes especiales van numerados a continuación de
los normales (como arriba, 23-33 y 10-17), o se mezclan todos en otro orden
(alfabético, por grado, etc.)? Si no se indica lo contrario, se sigue con el
orden de arriba: normales primero, especiales después.

## Cómo continuar en otro chat
1. Sube de nuevo el zip del proyecto (o al menos `pages/dia-del-campesino.html`
   y `js/campesino-platos.js`).
2. Sube este archivo de plan.
3. Indica en qué fase quieres retomar (por defecto, Fase 2).
