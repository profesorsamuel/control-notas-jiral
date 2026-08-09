<!DOCTYPE html>
<html lang="es">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <title>Panel del Estudiante</title>

    <!-- Favicon -->
    <link rel="icon" type="image/x-icon" href="../img/estudiante-favicon.ico">
    <link rel="icon" type="image/png" sizes="32x32" href="../img/estudiante-favicon-32.png">
    <link rel="icon" type="image/png" sizes="16x16" href="../img/estudiante-favicon-16.png">
    <link rel="apple-touch-icon" sizes="180x180" href="../img/estudiante-apple-touch-icon.png">

    <!-- Vista previa al compartir el enlace -->
    <meta property="og:type" content="website">
    <meta property="og:title" content="Panel del Estudiante | Control de Notas - C.E.B.G. El Jiral">
    <meta property="og:description" content="Registra tus notas de apreciación y ejercicio de cada materia, y descarga tu boletín.">
    <meta property="og:image" content="https://notasjiral.netlify.app/img/estudiante-og-image.jpg">
    <meta property="og:url" content="https://notasjiral.netlify.app/pages/estudiante.html">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:image" content="https://notasjiral.netlify.app/img/estudiante-og-image.jpg">

    <style>
        * {
            box-sizing: border-box;
        }

        body {
            font-family: Arial, sans-serif;
            margin: 30px;
            background: #f5f7fa;
        }

        h1 {
            color: #1f4e79;
        }

        #usuario {
            max-width: 900px;
            padding: 12px;
            color: #155724;
            background: #d4edda;
            border: 1px solid #c3e6cb;
            border-radius: 5px;
            font-weight: bold;
            margin-bottom: 15px;
        }

        #nombreEstudiante {
            font-size: 1.6rem;
            color: #1f4e79;
            margin: 0 0 4px;
        }

        #salonEstudiante {
            color: #64748b;
            margin: 0 0 18px;
            font-size: 0.95rem;
        }

        .acciones-superiores {
            display: flex;
            gap: 10px;
            margin-bottom: 15px;
            flex-wrap: wrap;
        }

        #btnSalir,
        #btnPdf,
        #btnJpg,
        #btnGuardarTodo {
            padding: 10px 15px;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 15px;
        }

        #btnSalir {
            background: #dc3545;
        }

        #btnSalir:hover {
            background: #b02a37;
        }

        #btnPdf {
            background: #198754;
        }

        #btnPdf:hover {
            background: #146c43;
        }

        #btnJpg {
            background: #0f766e;
        }

        #btnJpg:hover {
            background: #0b5c56;
        }

        #btnGuardarTodo {
            background: #1f4e79;
        }

        #btnGuardarTodo:hover {
            background: #163a5c;
        }

        .btn-accion {
            padding: 10px 15px;
            color: white;
            background: #6b46c1;
            border: none;
            border-radius: 5px;
            font-size: 15px;
            text-decoration: none;
            text-align: center;
            display: inline-block;
        }

        .btn-accion:hover {
            background: #553c9a;
        }

        .filtro-trimestre {
            max-width: 900px;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
        }

        .filtro-trimestre label {
            font-weight: bold;
            color: #1f4e79;
        }

        #filtroTrimestre {
            padding: 8px 12px;
            border: 1px solid #ccc;
            border-radius: 5px;
            font-size: 14px;
        }

        .aviso-solo-lectura {
            background: #fef3c7;
            color: #92400e;
            border: 1px solid #fde68a;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 13px;
            display: none;
        }

        .scroll-hint {
            display: none;
            font-size: 13px;
            color: #1f4e79;
            margin: 0 0 10px;
            text-align: center;
        }

        /* ============================================
           TARJETA POR MATERIA
           ============================================ */

        .materia-card {
            background: #ffffff;
            border-radius: 12px;
            padding: 18px 20px 20px;
            margin-bottom: 22px;
            max-width: 1000px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, .1);
        }

        .materia-card h2 {
            margin: 0 0 12px;
            color: #1f4e79;
            font-size: 1.15rem;
        }

        .tabla-contenedor {
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
        }

        .tabla-notas {
            width: 100%;
            border-collapse: collapse;
            text-align: center;
            color: #0f172a;
            font-size: 0.9rem;
        }

        .tabla-notas th,
        .tabla-notas td {
            border: 1px solid #cbd5e1;
            padding: 8px 6px;
            min-width: 74px;
        }

        .tabla-notas thead th[title] {
            cursor: help;
        }

        .btn-borrar-col {
            border: none;
            background: none;
            cursor: pointer;
            font-size: 11px;
            padding: 0 0 0 4px;
            vertical-align: middle;
        }

        .btn-borrar-col:hover {
            filter: brightness(1.3);
        }

        .tabla-notas thead tr:first-child {
            background-color: #1e293b;
            color: #ffffff;
        }

        .tabla-notas thead tr:nth-child(2) {
            background-color: #334155;
            color: #ffffff;
            font-weight: 600;
            font-size: 0.8rem;
        }

        .tabla-notas tbody tr:hover {
            background-color: #f8fafc;
        }

        .tabla-notas td.celda-promedio {
            background-color: #f1f5f9;
            font-weight: 700;
        }

        .celda-nota {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 2px;
        }

        .celda-nota input[type="number"] {
            width: 56px;
            padding: 5px;
            border: 1px solid #cbd5e1;
            border-radius: 5px;
            font-size: 14px;
            text-align: center;
        }

        .celda-nota input[type="number"]:focus {
            outline: none;
            border-color: #2563eb;
            box-shadow: 0 0 0 2px rgba(37, 99, 235, .15);
        }

        .celda-nota.guardando input {
            border-color: #f59e0b;
        }

        .celda-nota.guardado input {
            border-color: #16a34a;
        }

        .celda-nota.solo-lectura input {
            background: #f1f5f9;
            color: #475569;
        }

        .btn-companeros {
            border: 1px solid #fbbf24;
            background: #fffbeb;
            color: #92400e;
            border-radius: 5px;
            font-size: 11px;
            padding: 2px 6px;
            cursor: pointer;
        }

        .btn-companeros:hover {
            background: #fef3c7;
        }

        /* Botón "❓" rojo: el estudiante no tiene nota pero algún
           compañero de su nivel sí tiene nota en esa casilla */
        .btn-companeros.falta {
            border: 1px solid #dc2626;
            background: #fee2e2;
            color: #b91c1c;
            font-weight: bold;
        }

        .btn-companeros.falta:hover {
            background: #fecaca;
        }

        /* ============================================
           TABLA CONSOLIDADA (todas las materias juntas)
           ============================================ */

        .col-materia {
            text-align: left !important;
            font-weight: 700;
            white-space: nowrap;
            width: 108px;
            max-width: 108px;
            overflow: hidden;
            text-overflow: ellipsis;
            font-size: 0.82rem;
        }

        /* ============================================
           COLORES POR GRUPO: APRECIACIÓN / EJERCICIO / FINAL
           ============================================ */

        .th-grupo {
            font-size: 0.85rem;
            letter-spacing: .3px;
        }

        .th-apreciacion {
            background: linear-gradient(180deg, #4f46e5, #4338ca) !important;
        }

        .th-apreciacion-num {
            background-color: #eef2ff !important;
            color: #3730a3 !important;
        }

        .th-ejercicio {
            background: linear-gradient(180deg, #ea580c, #c2410c) !important;
        }

        .th-ejercicio-num {
            background-color: #fff7ed !important;
            color: #9a3412 !important;
        }

        .th-prom {
            background: #475569 !important;
        }

        .th-final {
            background: linear-gradient(180deg, #0f766e, #115e59) !important;
        }

        td.grupo-apreciacion {
            background-color: #f5f6ff;
        }

        td.grupo-ejercicio {
            background-color: #fffaf3;
        }

        td.prom-apreciacion {
            background-color: #e0e7ff !important;
            color: #3730a3;
            font-weight: 700;
        }

        td.prom-ejercicio {
            background-color: #fed7aa !important;
            color: #9a3412;
            font-weight: 700;
        }

        td.celda-final {
            font-weight: 800;
            font-size: 1rem;
            border-left: 2px solid #cbd5e1;
        }

        td.celda-final.aprobado {
            background-color: #dcfce7 !important;
            color: #15803d;
        }

        td.celda-final.reprobado {
            background-color: #fee2e2 !important;
            color: #b91c1c;
        }

        .celda-vacia {
            background-color: #f8fafc !important;
        }

        .col-agregar {
            min-width: 34px !important;
            width: 34px;
        }

        .celda-agregar {
            min-width: 34px !important;
            width: 34px;
        }

        .celda-nota-acciones {
            display: flex;
            gap: 3px;
            justify-content: center;
            margin-top: 2px;
            flex-wrap: wrap;
        }

        .btn-tema {
            border: none;
            background: none;
            cursor: pointer;
            font-size: 11px;
            padding: 0;
            line-height: 1;
        }

        .btn-tema:hover {
            filter: brightness(1.3);
        }

        .btn-tema-oficial {
            opacity: 0.85;
        }

        /* Casilla donde falta la nota (compañeros ya tienen) */
        td.celda-falta {
            background-color: #fef2f2;
        }

        .input-falta {
            border-color: #dc2626 !important;
        }

        .input-falta::placeholder {
            color: #dc2626;
            font-weight: bold;
        }

        /* Fila de "Tema", debajo de los números de columna */
        .fila-temas th {
            background-color: #eef2ff;
            padding: 4px 6px;
        }

        .celda-tema-vacia {
            background-color: #f1f5f9 !important;
        }

        .celda-tema-fija {
            font-size: 11px;
            font-weight: normal;
            font-style: italic;
            color: #475569;
            text-align: center;
        }

        .celda-tema-editable .input-tema {
            width: 100%;
            padding: 4px 6px;
            border: 1px solid #cbd5e1;
            border-radius: 5px;
            font-size: 11px;
            font-weight: normal;
            text-align: center;
            background: #ffffff;
        }

        .celda-tema-editable .input-tema:disabled {
            background: #f1f5f9;
            color: #94a3b8;
            border-style: dashed;
        }

        .celda-tema-editable .input-tema:focus {
            outline: none;
            border-color: #2563eb;
        }

        .fila-botones-materia {
            display: flex;
            gap: 10px;
            margin-top: 12px;
            flex-wrap: wrap;
        }

        .btn-agregar-col {
            padding: 8px 14px;
            border: 1px dashed #1f4e79;
            background: #eef2ff;
            color: #1f4e79;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
        }

        .btn-agregar-col:hover {
            background: #e0e7ff;
        }

        /* ============================================
           TOAST DE GUARDADO
           ============================================ */

        #toast {
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%) translateY(20px);
            background: #1e293b;
            color: white;
            padding: 10px 18px;
            border-radius: 8px;
            font-size: 14px;
            opacity: 0;
            pointer-events: none;
            transition: opacity .2s, transform .2s;
            z-index: 999;
        }

        #toast.visible {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }

        /* ============================================
           IMPRESIÓN (Oculta banner de Admin y botones)
           ============================================ */

        @media print {
            #usuario,
            .acciones-superiores,
            .filtro-trimestre,
            .scroll-hint,
            .fila-botones-materia,
            .btn-companeros,
            .btn-borrar-col,
            #toast,
            #overlayPreguntas {
                display: none !important;
            }

            body {
                background: #ffffff !important;
                margin: 0 !important;
                padding: 0 !important;
            }

            .celda-nota input,
            .celda-tema-editable .input-tema {
                border: none !important;
                background: none !important;
                box-shadow: none !important;
            }

            .materia-card {
                box-shadow: none !important;
                border: 1px solid #cbd5e1 !important;
                break-inside: avoid;
                margin-bottom: 15px !important;
            }

            .tabla-consolidada tr {
                break-inside: avoid;
            }
        }

        /* ============================================
           RESPONSIVE - MÓVIL
           ============================================ */

        @media (max-width: 768px) {
            body {
                margin: 15px;
            }

            h1 {
                font-size: 1.4rem;
                text-align: center;
            }

            #nombreEstudiante {
                font-size: 1.3rem;
                text-align: center;
            }

            #salonEstudiante {
                text-align: center;
            }

            #usuario {
                max-width: 100%;
                font-size: 14px;
                text-align: center;
            }

            .acciones-superiores {
                flex-direction: column;
            }

            #btnSalir,
            #btnPdf,
            #btnJpg,
            #btnGuardarTodo,
            .btn-accion {
                width: 100%;
            }

            .filtro-trimestre {
                max-width: 100%;
            }

            #filtroTrimestre {
                flex: 1;
            }

            .materia-card {
                padding: 12px;
                border-radius: 10px;
            }

            .tabla-notas {
                font-size: 0.78rem;
            }

            .tabla-notas th,
            .tabla-notas td {
                padding: 6px 4px;
                min-width: 60px;
            }

            /* Mantiene la columna de Materia visible al deslizar */
            .tabla-notas .col-materia {
                position: sticky;
                left: 0;
                z-index: 2;
                background-color: #ffffff;
                box-shadow: 2px 0 4px rgba(0, 0, 0, 0.12);
                width: 82px;
                max-width: 82px;
                font-size: 0.72rem;
            }

            .tabla-notas thead .col-materia {
                background-color: #1e293b;
                z-index: 3;
            }

            .scroll-hint {
                display: block;
            }
        }
        /* ============================================
           OVERLAY OBLIGATORIO: PREGUNTAS DE SEGURIDAD
           ============================================ */

        .overlay-preguntas {
            position: fixed;
            inset: 0;
            background: rgba(15, 23, 42, 0.78);
            z-index: 2000;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }

        .tarjeta-preguntas {
            background: #ffffff;
            border-radius: 14px;
            padding: 26px 24px;
            max-width: 440px;
            width: 100%;
            box-shadow: 0 10px 40px rgba(0, 0, 0, .3);
            max-height: 90vh;
            overflow-y: auto;
        }

        .tarjeta-preguntas h2 {
            margin: 0 0 10px;
            color: #1f4e79;
            font-size: 1.2rem;
        }

        .tarjeta-preguntas p {
            color: #475569;
            font-size: .88rem;
            margin: 0 0 18px;
            line-height: 1.45;
        }

        .campo-pregunta {
            margin-bottom: 14px;
        }

        .campo-pregunta label {
            display: block;
            font-weight: bold;
            color: #334155;
            font-size: .85rem;
            margin-bottom: 5px;
        }

        .campo-pregunta input {
            width: 100%;
            padding: 10px;
            border: 1px solid #cbd5e1;
            border-radius: 7px;
            font-size: .95rem;
        }

        .campo-pregunta input:focus {
            outline: none;
            border-color: #2563eb;
            box-shadow: 0 0 0 2px rgba(37, 99, 235, .15);
        }

        .mensaje-preguntas {
            display: none;
            padding: 9px 12px;
            border-radius: 7px;
            font-size: .85rem;
            margin-bottom: 12px;
            background: #fee2e2;
            color: #991b1b;
        }

        .mensaje-preguntas.visible {
            display: block;
        }

        #btnGuardarPreguntasObligatorias {
            width: 100%;
            padding: 11px;
            border: none;
            border-radius: 7px;
            background: #1f4e79;
            color: #fff;
            font-weight: bold;
            font-size: .95rem;
            cursor: pointer;
        }

        #btnGuardarPreguntasObligatorias:hover {
            background: #163a5c;
        }

        #btnGuardarPreguntasObligatorias:disabled {
            background: #94a3b8;
            cursor: not-allowed;
        }
    </style>
</head>

<body>

    <h1>📚 Registro de Notas</h1>

    <!-- Usuario conectado -->
    <p id="usuario">
        Verificando usuario conectado...
    </p>

    <h2 id="nombreEstudiante">Cargando estudiante...</h2>
    <p id="salonEstudiante"></p>

    <div class="acciones-superiores">
        <button type="button" id="btnSalir">
            Cerrar sesión
        </button>

        <button type="button" id="btnGuardarTodo">
            💾 Guardar todos los cambios
        </button>

        <button type="button" id="btnJpg">
            📷 Descargar como imagen
        </button>

        <button type="button" id="btnPdf">
            📄 Descargar Boletín PDF
        </button>

        <a href="datos.html" class="btn-accion">
            📋 Mis Datos
        </a>

        <a href="alerta_horario.html" class="btn-accion">
            🔔 Horario
        </a>
    </div>

    <div class="filtro-trimestre">
        <label for="filtroTrimestre">🔍 Ver:</label>
        <select id="filtroTrimestre" aria-label="Filtrar por trimestre">
            <option value="Trimestre 1">Trimestre 1</option>
            <option value="Trimestre 2">Trimestre 2</option>
            <option value="Trimestre 3">Trimestre 3</option>
        </select>
        <span id="avisoSoloLectura" class="aviso-solo-lectura">
            🔒 Este no es el trimestre activo: solo puedes consultar, no editar.
        </span>
    </div>

    <p class="scroll-hint">📱 Desliza la tabla hacia los lados para ver todas las columnas →</p>

    <!-- Aquí se generan, una por materia, las tarjetas con su tabla -->
    <div id="materias"></div>

    <div id="toast"></div>

    <!-- Overlay obligatorio: configurar preguntas de seguridad -->
    <div id="overlayPreguntas" class="overlay-preguntas" style="display:none;">
        <div class="tarjeta-preguntas">
            <h2>🔒 Configura tus preguntas de seguridad</h2>
            <p>
                Esto es obligatorio y solo lo vas a hacer una vez.
                Si algún día olvidas tu contraseña, vas a poder recuperarla
                respondiendo estas 3 preguntas — así que respóndelas con
                algo que vayas a recordar.
            </p>
            <form id="formPreguntasObligatorias">
                <div class="campo-pregunta">
                    <label for="opRespuesta1">📚 ¿Cuál es tu materia favorita?</label>
                    <input type="text" id="opRespuesta1" required>
                </div>
                <div class="campo-pregunta">
                    <label for="opRespuesta2">🔬 ¿Cuál es tu científico(a) favorito(a)?</label>
                    <input type="text" id="opRespuesta2" required>
                </div>
                <div class="campo-pregunta">
                    <label for="opRespuesta3">🌍 ¿Cuál es tu país favorito?</label>
                    <input type="text" id="opRespuesta3" required>
                </div>
                <div id="mensajePreguntasObligatorias" class="mensaje-preguntas"></div>
                <button type="submit" id="btnGuardarPreguntasObligatorias">💾 Guardar y continuar</button>
            </form>
        </div>
    </div>

    <!-- Librería jsPDF -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>

    <!-- Librería jsPDF-AutoTable -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"></script>

    <!-- Librería html2canvas (para descargar la tabla de notas como imagen JPG) -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>

    <!-- JavaScript principal -->
    <script type="module" src="../js/estudiante.js"></script>

</body>

</html>
