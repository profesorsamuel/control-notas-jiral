# Revisión técnica — Control de Notas Jiral

Fecha de revisión: 5 de septiembre de 2026.

## Correcciones realizadas

- Se reconstruyó `js/estudiante.js`. El archivo contenía una página HTML completa y provocaba `SyntaxError: Unexpected token '<'`, dejando inutilizable el panel del estudiante.
- Se restauró en el panel del estudiante: validación de sesión, carga del perfil, consulta por trimestre, visualización de notas, promedios, edición y creación de notas, bloqueo de notas registradas por el docente, cierre de sesión y exportación JPG/PDF.
- Se corrigió la referencia inexistente `estadisticas-asistencia.js` por el nombre real `estadisticas_asistencias.js`.
- Se actualizó el service worker a la caché `v5`. La instalación ya no falla completamente si un recurso individual no puede descargarse y ahora devuelve una respuesta controlada cuando no hay conexión.
- Se retiraron de la entrega aproximadamente 35 MB de imágenes y un ZIP duplicados que no eran utilizados por ninguna página. Las imágenes enlazadas por las clases se conservaron.

## Validaciones superadas

- Sintaxis válida en todos los archivos JavaScript.
- JSON válido en ambos manifiestos.
- Ninguna referencia local rota en las páginas HTML.
- Estructura del ZIP comprobada después de generarlo.

## Segunda revisión de seguridad y mantenimiento

- Se eliminó por completo `claveAdmin: "jiral2026"`. Los paneles de examen ahora exigen una sesión válida de Supabase y comprueban que la cuenta sea administradora o tenga una asignación en `profesor_materias`.
- El inicio de sesión acepta como retorno únicamente los dos paneles de examen conocidos y solo para docentes/administradores; no admite destinos arbitrarios.
- Se agregó `.gitignore` y se retiró `supabase/.temp/` de la entrega. La función real de Supabase se conserva.
- La lógica duplicada de los exámenes 9.º y 8A se consolidó en `prueba_ciencias.js`; la de los paneles docentes se consolidó en `prueba_ciencias_admin.js`.
- Los dos bancos permanecen separados porque no son copias del mismo contenido: son conjuntos diferentes de 150 preguntas. La estructura común ya es consumida por un solo motor mediante `bancoGlobal`, por lo que una corrección del examen no debe repetirse.

Como defensa de base de datos, deben mantenerse activas políticas RLS en `notas`, `estudiantes`, `usuarios`, `prueba_sesiones` y `prueba_eventos`. La llave pública de Supabase puede estar en el navegador únicamente con esas políticas configuradas.
