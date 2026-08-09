<!DOCTYPE html>
<html lang="es">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Asignaciones de Profesores</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" rel="stylesheet">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --color-primario: #1f4e79;
            --color-primario-oscuro: #163a5a;
            --color-primario-claro: #e8ecfb;
            --color-acento: #198754;
            --color-fondo: #eef1f6;
        }

        body {
            font-family: 'Inter', Arial, sans-serif;
            padding: 0 16px 60px;
            background: var(--color-fondo);
        }

        h1, h2 { font-family: 'Baloo 2', 'Inter', Arial, sans-serif; }

        /* ---- Encabezado moderno tipo banner ---- */
        .banner-superior {
            max-width: 1000px;
            margin: 0 auto;
            background: linear-gradient(135deg, var(--color-primario) 0%, var(--color-primario-oscuro) 100%);
            color: #fff;
            border-radius: 0 0 20px 20px;
            padding: 28px 26px 22px;
            margin-bottom: 24px;
            box-shadow: 0 8px 24px rgba(31, 78, 121, .25);
        }

        .banner-superior .eyebrow {
            font-size: 12px; font-weight: 700; letter-spacing: 1.5px;
            text-transform: uppercase; color: #c7d7ef; margin: 0 0 4px;
        }

        .banner-superior h1 {
            font-size: 1.7rem; font-weight: 800; margin: 0 0 8px; color: #fff;
        }

        .banner-superior .enlaces-nav a {
            color: #dbe7fa; text-decoration: none; font-weight: 600; font-size: .87rem;
        }
        .banner-superior .enlaces-nav a:hover { color: #fff; text-decoration: underline; }

        .contenedor { max-width: 1000px; margin: 0 auto; }

        .panel-blanco {
            background: white;
            padding: 22px;
            border-radius: 14px;
            margin-bottom: 20px;
            box-shadow: 0 4px 14px rgba(20, 40, 70, .08);
        }

        .panel-titulo {
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 1.05rem;
            font-weight: 700;
            color: var(--color-primario);
            margin-bottom: 4px;
        }

        .panel-icono {
            width: 34px; height: 34px; border-radius: 9px;
            display: flex; align-items: center; justify-content: center;
            font-size: 1rem; flex-shrink: 0;
            background: var(--color-primario-claro); color: #2f3ea3;
        }

        .panel-subtexto { color: #6c757d; font-size: .85rem; margin-bottom: 16px; }

        .subtitulo-campo {
            font-weight: 700; font-size: .88rem; margin-bottom: 8px; display: block;
            color: #333;
        }

        /* ---- Chips para materias / salones ---- */
        .grupo-chips {
            display: flex; flex-wrap: wrap; gap: 8px;
            padding: 12px; border-radius: 10px; background: #f6f8fb;
            border: 1px solid #e3e8ef;
        }

        .chip-check { position: absolute; opacity: 0; width: 0; height: 0; }

        .chip-check + label {
            display: inline-flex; align-items: center; gap: 6px;
            padding: 7px 14px; border-radius: 20px;
            border: 1.5px solid #d7dee6; background: #fff;
            font-size: .85rem; color: #444; cursor: pointer; user-select: none;
            transition: all .15s ease; margin: 0;
        }

        .chip-check + label:hover { border-color: #9fb4d6; }

        .chip-materias .chip-check:checked + label {
            background: var(--color-primario); border-color: var(--color-primario); color: #fff;
        }

        .chip-salones .chip-check:checked + label {
            background: var(--color-acento); border-color: var(--color-acento); color: #fff;
        }

        /* ---- Tarjeta del profesor activo (viene de la URL) ---- */
        .tarjeta-profesor-activo {
            display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
            background: var(--color-primario-claro); border-radius: 12px;
            padding: 14px 16px; margin-bottom: 18px;
        }

        .avatar-profesor-activo {
            flex: none; width: 46px; height: 46px; border-radius: 50%;
            background: var(--color-primario); color: #fff;
            display: flex; align-items: center; justify-content: center;
            font-weight: 700; font-size: 1.05rem; font-family: 'Baloo 2', sans-serif;
        }

        .tarjeta-profesor-activo .nombre-activo { font-weight: 700; color: var(--color-primario); font-size: 1.02rem; }
        .tarjeta-profesor-activo .detalle-activo { font-size: .82rem; color: #4a5a72; }

        .tarjeta-profesor-activo .cambiar-profesor {
            margin-left: auto; font-size: .82rem; font-weight: 600;
            color: var(--color-primario); text-decoration: none;
        }
        .tarjeta-profesor-activo .cambiar-profesor:hover { text-decoration: underline; }

        .campo-telefono-activo { max-width: 220px; }

        /* ---- Estado vacío (sin ?correo en la URL) ---- */
        .estado-vacio {
            text-align: center; padding: 40px 20px; color: #6c757d;
        }
        .estado-vacio .icono-vacio { font-size: 2.4rem; margin-bottom: 10px; }

        /* ---- Listado de asignaciones del profesor activo ---- */
        .fila-materia {
            display: flex; justify-content: space-between; align-items: center;
            flex-wrap: wrap; gap: 6px;
            padding: 9px 0; border-bottom: 1px solid #f2f3f6;
        }
        .fila-materia:last-child { border-bottom: none; }

        .etiqueta-materia {
            display: inline-block; background: #eef1fa; color: var(--color-primario);
            font-weight: 700; font-size: .8rem; padding: 3px 10px; border-radius: 8px;
            margin-right: 6px;
        }
    </style>
</head>

<body>

    <div class="banner-superior">
        <p class="eyebrow">Panel de administración</p>
        <h1>📋 Asignaciones de Profesores</h1>
        <div class="enlaces-nav">
            <a href="admin.html">&larr; Volver al panel de administración</a>
            &nbsp;·&nbsp;
            <a href="profesores.html"><i class="fa-solid fa-address-book"></i> Ver directorio completo de profesores</a>
        </div>
    </div>

    <div class="contenedor">

        <div id="bloqueSinProfesor" class="panel-blanco estado-vacio" style="display:none;">
            <div class="icono-vacio">👥</div>
            <p><strong>Elige un profesor(a) primero.</strong></p>
            <p class="small">Entra al directorio de profesores y presiona "Editar materias/salones en Asignaciones" en la tarjeta del profesor(a) que quieras editar.</p>
            <a href="profesores.html" class="btn btn-primary btn-sm mt-2">
                <i class="fa-solid fa-address-book me-1"></i> Ir al directorio de profesores
            </a>
        </div>

        <div id="bloqueFormulario" style="display:none;">

            <!-- FORMULARIO DE ASIGNACIÓN -->
            <div class="panel-blanco panel-manual">
                <div class="panel-titulo"><span class="panel-icono">➕</span> Agregar asignación</div>
                <p class="panel-subtexto">Marca las materias que dicta y en qué salones. El horario exacto (día/hora) lo arma el profesor(a) en su propia pantalla de "Mi horario".</p>

                <form id="formAsignacion">

                    <div class="tarjeta-profesor-activo" id="tarjetaProfesorActivo">
                        <div class="avatar-profesor-activo" id="avatarProfesorActivo">—</div>
                        <div>
                            <div class="nombre-activo" id="nombreProfesorActivo">Cargando...</div>
                            <div class="detalle-activo" id="correoProfesorActivo"></div>
                        </div>
                        <div>
                            <label class="form-label small fw-bold mb-1">Teléfono (WhatsApp)</label>
                            <input type="tel" id="inputTelefonoProfesor" class="form-control form-control-sm campo-telefono-activo" placeholder="6123-4567">
                        </div>
                        <a href="profesores.html" class="cambiar-profesor">Cambiar profesor →</a>
                    </div>

                    <div class="form-check mb-3">
                        <input class="form-check-input" type="checkbox" id="checkWhatsapp">
                        <label class="form-check-label" for="checkWhatsapp">
                            <i class="fa-brands fa-whatsapp text-success"></i>
                            Activar para WhatsApp (permite generar un enlace directo para escribirle)
                        </label>
                    </div>

                    <label class="subtitulo-campo">Materias que dicta (puedes marcar varias)</label>
                    <div class="grupo-chips chip-materias mb-2" id="grupoMaterias">
                        <input class="chip-check" type="checkbox" value="Español" id="mat-espanol"><label for="mat-espanol">Español</label>
                        <input class="chip-check" type="checkbox" value="Matemática" id="mat-matematica"><label for="mat-matematica">Matemática</label>
                        <input class="chip-check" type="checkbox" value="Ciencias Naturales" id="mat-ciencias"><label for="mat-ciencias">Ciencias Naturales</label>
                        <input class="chip-check" type="checkbox" value="Inglés" id="mat-ingles"><label for="mat-ingles">Inglés</label>
                        <input class="chip-check" type="checkbox" value="Expresión Artística" id="mat-expresion-artistica"><label for="mat-expresion-artistica">Expresión Artística</label>
                        <input class="chip-check" type="checkbox" value="Música" id="mat-musica"><label for="mat-musica">Música</label>
                        <input class="chip-check" type="checkbox" value="Educación Física" id="mat-fisica"><label for="mat-fisica">Educación Física</label>
                        <input class="chip-check" type="checkbox" value="Familia y Desarrollo Comunitario" id="mat-familia"><label for="mat-familia">Familia y Desarrollo Comunitario</label>
                        <input class="chip-check" type="checkbox" value="Historia" id="mat-historia"><label for="mat-historia">Historia</label>
                        <input class="chip-check" type="checkbox" value="Educación Agropecuaria" id="mat-agropecuaria"><label for="mat-agropecuaria">Educación Agropecuaria</label>
                        <input class="chip-check" type="checkbox" value="Contabilidad" id="mat-contabilidad"><label for="mat-contabilidad">Contabilidad</label>
                        <input class="chip-check" type="checkbox" value="Informática" id="mat-informatica"><label for="mat-informatica">Informática</label>
                        <input class="chip-check" type="checkbox" value="Geografía" id="mat-geografia"><label for="mat-geografia">Geografía</label>
                        <input class="chip-check" type="checkbox" value="Orientación" id="mat-orientacion"><label for="mat-orientacion">Orientación</label>
                        <input class="chip-check" type="checkbox" value="Cívica" id="mat-civica"><label for="mat-civica">Cívica</label>
                        <input class="chip-check" type="checkbox" value="Religión, Moral y Valores" id="mat-religion"><label for="mat-religion">Religión, Moral y Valores</label>
                    </div>
                    <input type="text" id="inputOtraMateria" class="form-control mb-3" placeholder="¿Otra materia que no está en la lista? Escríbela aquí (raro, revisar con administración)">

                    <label class="subtitulo-campo">
                        Salones donde da clase (puedes marcar varios)
                        &nbsp;·&nbsp;
                        <a href="salones.html" class="small">Administrar lista de salones</a>
                    </label>
                    <div class="grupo-chips chip-salones mb-3" id="grupoSalones">
                        <span class="text-muted small">Cargando salones...</span>
                    </div>

                    <button type="submit" class="btn btn-primary"><i class="fa-solid fa-floppy-disk me-1"></i> Guardar asignación</button>
                    <span id="estadoAsignacion" class="small ms-2"></span>
                </form>
            </div>

            <!-- LISTADO DE LO YA ASIGNADO A ESTE PROFESOR -->
            <div class="panel-blanco panel-listado">
                <div class="panel-titulo"><span class="panel-icono">📚</span> Ya asignado a este profesor(a)</div>
                <div id="listadoAsignacionesActivo">Cargando...</div>
            </div>

        </div>

    </div>

    <script type="module" src="../js/asignaciones.js"></script>

</body>

</html>
