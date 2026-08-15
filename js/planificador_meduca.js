function descargarWord() {
  const planificaciones = [
    ...document.querySelectorAll(".plan")
  ];

  if (!planificaciones.length) {
    alert("Primero genere las planificaciones.");
    return;
  }

  function limpiarTexto(texto) {
    return String(texto || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function valorCampo(planificacion, nombre) {
    const campo = planificacion.querySelector(
      `[name="${nombre}"]`
    );

    return limpiarTexto(campo?.value || "");
  }

  const paginas = planificaciones.map(
    (planificacion, indice) => {
      const datosSuperiores = [
        ...planificacion.querySelectorAll(
          ".meta input"
        )
      ];

      const asignatura = limpiarTexto(
        datosSuperiores[0]?.value ||
        "Ciencias Naturales"
      );

      const horas = limpiarTexto(
        datosSuperiores[1]?.value || "5"
      );

      const gradoSeleccionado = limpiarTexto(
        datosSuperiores[2]?.value ||
        `${grado.value}.º`
      );

      const docente = limpiarTexto(
        datosSuperiores[3]?.value ||
        profesor
      );

      const semana = limpiarTexto(
        datosSuperiores[4]?.value || ""
      );

      const trimestreSeleccionado =
        limpiarTexto(
          datosSuperiores[5]?.value ||
          trimestre.value
        );

      const regional = valorCampo(
        planificacion,
        "regional"
      );

      const avisoLibre =
        planificacion.querySelector(
          ".aviso-libre"
        );

      const diasLibres = avisoLibre
        ? `
          <div class="dias-libres">
            ${limpiarTexto(
              avisoLibre.textContent
            )}
          </div>
        `
        : "";

      return `
        <div class="pagina">
          <div class="encabezado">
            <div class="ministerio">
              MINISTERIO DE EDUCACIÓN
            </div>

            <div>
              DIRECCIÓN REGIONAL DE EDUCACIÓN DE
              <span class="linea">${regional}</span>
            </div>

            <div class="titulo">
              SECUENCIA DIDÁCTICA SEMANAL O
              QUINCENAL DE EDUCACIÓN PRIMARIA,
              PREMEDIA Y MEDIA
            </div>
          </div>

          <table class="datos">
            <tr>
              <td>
                <b>(1) ASIGNATURA:</b>
                <span class="linea">${asignatura}</span>
              </td>

              <td>
                <b>(2) HORAS SEMANALES:</b>
                <span class="linea corta">${horas}</span>
              </td>

              <td>
                <b>(3) GRADO:</b>
                <span class="linea corta">
                  ${gradoSeleccionado}
                </span>
              </td>

              <td>
                <b>(4) DOCENTE(S):</b>
                <span class="linea">${docente}</span>
              </td>
            </tr>

            <tr>
              <td colspan="3">
                <b>(5) SEMANA:</b>
                <span class="linea">${semana}</span>
              </td>

              <td>
                <b>(6) TRIMESTRE:</b>
                <span class="linea corta">
                  ${trimestreSeleccionado}
                </span>
              </td>
            </tr>
          </table>

          ${diasLibres}

          <table class="planificacion">
            <colgroup>
              <col style="width:38%">
              <col style="width:20%">
              <col style="width:21%">
              <col style="width:21%">
            </colgroup>

            <tr>
              <td colspan="4" class="area">
                <b>(7) ÁREA:</b>
                ${valorCampo(
                  planificacion,
                  "area"
                )}
              </td>
            </tr>

            <tr>
              <td colspan="2">
                <b class="competencia">
                  (8) COMPETENCIA(S) Y RASGOS:
                </b>

                <div class="contenido">
                  ${valorCampo(
                    planificacion,
                    "competencia"
                  )}
                </div>
              </td>

              <td colspan="2">
                <b>
                  (9) OBJETIVO(S) DE APRENDIZAJE:
                </b>

                <div class="contenido">
                  ${valorCampo(
                    planificacion,
                    "objetivo"
                  )}
                </div>
              </td>
            </tr>

            <tr>
              <td colspan="2">
                <b>(10) CONTENIDOS:</b>

                <div class="contenido">
                  <b>• Conceptual:</b><br>
                  ${valorCampo(
                    planificacion,
                    "conceptual"
                  )}

                  <br><br>

                  <b>• Procedimental:</b><br>
                  ${valorCampo(
                    planificacion,
                    "procedimental"
                  )}

                  <br><br>

                  <b>• Actitudinal:</b><br>
                  ${valorCampo(
                    planificacion,
                    "actitudinal"
                  )}
                </div>
              </td>

              <td colspan="2">
                <b>(11) INDICADOR(ES) DE LOGRO:</b>

                <div class="contenido">
                  ${valorCampo(
                    planificacion,
                    "indicador"
                  )}
                </div>
              </td>
            </tr>

            <tr class="subtitulos">
              <td>
                <b>(12) ACTIVIDADES</b>
              </td>

              <td>
                <b>(13.1) EVIDENCIAS</b>
              </td>

              <td>
                <b>(13.2) CRITERIOS</b>
              </td>

              <td>
                <b>
                  (13.3) TIPO DE EVALUACIÓN /
                  INSTRUMENTOS
                </b>
              </td>
            </tr>

            <tr>
              <td>
                <div class="contenido">
                  <b>• Actividad(es) de inicio:</b>
                  <br>
                  ${valorCampo(
                    planificacion,
                    "inicio"
                  )}

                  <br><br>

                  <b>• Actividad(es) de desarrollo:</b>
                  <br>
                  ${valorCampo(
                    planificacion,
                    "desarrollo"
                  )}

                  <br><br>

                  <b>• Actividad(es) de cierre:</b>
                  <br>
                  ${valorCampo(
                    planificacion,
                    "cierre"
                  )}
                </div>
              </td>

              <td>
                <div class="contenido">
                  <b>• Actuaciones directas:</b>
                  <br>
                  ${valorCampo(
                    planificacion,
                    "actuaciones"
                  )}

                  <br><br>

                  <b>• Entregables:</b>
                  <br>
                  ${valorCampo(
                    planificacion,
                    "entregables"
                  )}
                </div>
              </td>

              <td>
                <div class="contenido">
                  ${valorCampo(
                    planificacion,
                    "criterios"
                  )}
                </div>
              </td>

              <td>
                <div class="contenido">
                  <b>• Diagnóstica:</b>
                  <br>
                  ${valorCampo(
                    planificacion,
                    "diagnostica"
                  )}

                  <br><br>

                  <b>• Formativa:</b>
                  <br>
                  ${valorCampo(
                    planificacion,
                    "formativa"
                  )}

                  <br><br>

                  <b>• Sumativa:</b>
                  <br>
                  ${valorCampo(
                    planificacion,
                    "sumativa"
                  )}
                </div>
              </td>
            </tr>
          </table>

          <div class="observaciones">
            <b>(14) OBSERVACIONES:</b>
            ${valorCampo(
              planificacion,
              "observaciones"
            )}
          </div>

          <table class="firmas">
            <tr>
              <td>
                <b>(15) FIRMA DEL DOCENTE:</b>
                ______________________________
              </td>

              <td>
                <b>
                  (16) FIRMA DEL COORDINADOR O
                  SUBDIRECTOR TÉCNICO DOCENTE:
                </b>
                ______________________________
              </td>
            </tr>
          </table>
        </div>
      `;
    }
  ).join("");

  const estilos = `
    <style>
      @page Section1 {
        size: 841.9pt 595.3pt;
        mso-page-orientation: landscape;
        margin: 25pt 25pt 25pt 25pt;
      }

      body {
        font-family: "Times New Roman", serif;
        color: #000;
        margin: 0;
        font-size: 9pt;
      }

      .pagina {
        page: Section1;
        page-break-after: always;
      }

      .pagina:last-child {
        page-break-after: auto;
      }

      .encabezado {
        text-align: center;
        font-weight: bold;
        font-size: 11pt;
        line-height: 1.25;
        margin-bottom: 10px;
      }

      .ministerio {
        font-size: 13pt;
      }

      .titulo {
        font-size: 10pt;
        margin-top: 3px;
      }

      .linea {
        display: inline-block;
        min-width: 130px;
        padding: 0 4px;
        border-bottom: 1px solid #000;
        font-weight: normal;
      }

      .linea.corta {
        min-width: 45px;
      }

      table {
        width: 100%;
        border-collapse: collapse;
      }

      .datos {
        margin-bottom: 7px;
      }

      .datos td {
        border: 0;
        padding: 4px 5px;
        vertical-align: bottom;
      }

      .dias-libres {
        border: 1px solid #000;
        padding: 4px 6px;
        margin-bottom: 5px;
        font: 8pt Arial, sans-serif;
      }

      .planificacion td {
        border: 1px solid #000;
        padding: 5px;
        vertical-align: top;
      }

      .planificacion .area {
        height: 20px;
      }

      .competencia {
        color: #c00000;
      }

      .contenido {
        margin-top: 5px;
        font-family: Arial, sans-serif;
        font-size: 7.5pt;
        line-height: 1.15;
      }

      .subtitulos td {
        text-align: center;
        vertical-align: middle;
        font-size: 9pt;
      }

      .observaciones {
        min-height: 24px;
        margin-top: 8px;
        padding: 4px;
        border-bottom: 1px solid #000;
      }

      .firmas {
        margin-top: 14px;
      }

      .firmas td {
        width: 50%;
        border: 0;
        padding: 5px;
        font-size: 8.5pt;
      }
    </style>
  `;

  const documentoWord = `
    <!DOCTYPE html>
    <html
      xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
    >
      <head>
        <meta charset="UTF-8">

        <meta
          name="ProgId"
          content="Word.Document"
        >

        <title>
          Planificaciones MEDUCA
        </title>

        ${estilos}
      </head>

      <body>
        ${paginas}
      </body>
    </html>
  `;

  const archivo = new Blob(
    ["\ufeff", documentoWord],
    {
      type: "application/msword;charset=utf-8"
    }
  );

  const enlace = document.createElement("a");

  enlace.href = URL.createObjectURL(archivo);

  enlace.download =
    `Planificaciones_Ciencias_${grado.value}` +
    `_Trimestre_${trimestre.value}.doc`;

  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();

  setTimeout(() => {
    URL.revokeObjectURL(enlace.href);
  }, 1000);
}
