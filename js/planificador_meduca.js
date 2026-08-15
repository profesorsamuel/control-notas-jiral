import { supabase } from "./supabase.js";

const temas = {
  7: [
    "La célula y la teoría celular",
    "Tejidos animales y vegetales",
    "Funciones vitales de los seres vivos",
    "Ecosistemas y redes tróficas",
    "Materia, energía y sus transformaciones",
    "La Tierra y el universo"
  ],
  8: [
    "Sistema circulatorio y tejido sanguíneo",
    "Sistema inmunológico",
    "Reproducción de los organismos",
    "Ecosistemas e interdependencia",
    "Ciencias físicas y químicas",
    "La Tierra y el universo"
  ]
};

const temas9 = {
  I: [
    "El informe científico",
    "Material genético: ADN y ARN",
    "Organización del ADN",
    "El ciclo celular",
    "El óvulo y el espermatozoide",
    "La gametogénesis",
    "La fecundación",
    "Genética mendeliana",
    "Sistema abreviado de Punnett",
    "Genética no mendeliana",
    "Enfermedades autosómicas",
    "Enfermedades hereditarias ligadas al sexo",
    "Trastornos cromosómicos",
    "Tipos sanguíneos: grupo ABO y factor Rh",
    "Detección temprana de trastornos hereditarios"
  ],
  II: [
    "Sexualidad responsable y sana",
    "Consecuencias de una sexualidad irresponsable",
    "Teorías religiosas del origen de la vida",
    "Teorías científicas del origen de la vida",
    "El proceso evolutivo",
    "Fuerzas evolutivas en el genoma",
    "Evolución humana",
    "Mejoramiento artificial de los seres vivos",
    "Efecto invernadero y cambio climático",
    "Lucha contra bacterias, hongos y virus",
    "Acciones humanas contra el cambio climático",
    "Ciencia, tecnología y medioambiente"
  ],
  III: [
    "Las ondas",
    "Recepción y emisión de ondas en los seres humanos",
    "La electricidad",
    "Materiales según su comportamiento ante la electricidad",
    "Leyes de la electrostática",
    "Métodos de electrificación de un cuerpo",
    "Electricidad estática y sus usos",
    "Origen del sistema solar",
    "Origen de la Luna",
    "Origen de la vida en la Tierra",
    "Tecnología y estudio del universo",
    "Proyecto STEAM"
  ]
};

const campos = [
  ["area", "(7) Área"],
  ["competencia", "(8) Competencia(s) y rasgos"],
  ["objetivo", "(9) Objetivo(s) de aprendizaje"],
  ["conceptual", "(10) Contenido conceptual"],
  ["procedimental", "(10) Contenido procedimental"],
  ["actitudinal", "(10) Contenido actitudinal"],
  ["indicador", "(11) Indicador(es) de logro"],
  ["inicio", "(12) Actividad(es) de inicio"],
  ["desarrollo", "(12) Actividad(es) de desarrollo"],
  ["cierre", "(12) Actividad(es) de cierre"],
  ["actuaciones", "(13.1) Actuaciones directas"],
  ["entregables", "(13.1) Entregables"],
  ["criterios", "(13.2) Criterios"],
  ["diagnostica", "(13.3) Diagnóstica / instrumento"],
  ["formativa", "(13.3) Formativa / instrumento"],
  ["sumativa", "(13.3) Sumativa / instrumento"],
  ["observaciones", "(14) Observaciones"]
];

const $ = selector => document.querySelector(selector);
const grado = $("#grado");
const trimestre = $("#trimestre");

let profesor = "";
let fechas = {};
let libres = [];

function temasActuales() {
  return grado.value === "9"
    ? temas9[trimestre.value]
    : temas[grado.value];
}

function mostrarListaTemas() {
  const contenedor = $("#temas");

  contenedor.innerHTML = temasActuales()
    .map(
      (tema, indice) => `
        <label>
          <input type="checkbox" value="${indice}">
          <span>${tema}</span>
        </label>
      `
    )
    .join("");

  $("#estadoLibro").classList.toggle(
    "apagado",
    grado.value !== "9"
  );
}

function convertirFecha(fecha) {
  if (!fecha) return null;

  const [anio, mes, dia] = fecha.split("-").map(Number);
  return new Date(anio, mes - 1, dia);
}

function sumarDias(fecha, cantidad) {
  const nuevaFecha = new Date(fecha);
  nuevaFecha.setDate(nuevaFecha.getDate() + cantidad);
  return nuevaFecha;
}

function formatearFecha(fecha) {
  return fecha.toLocaleDateString("es-PA", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
}

function obtenerInicioElegido() {
  const numeroTrimestre = {
    I: 1,
    II: 2,
    III: 3
  }[trimestre.value];

  const campoConfigurado =
    `t${numeroTrimestre}_inicio`;

  return convertirFecha(
    $("#fechaInicio").value ||
    fechas[campoConfigurado]
  );
}

function obtenerIntervaloSemana(numeroSemana) {
  const fechaInicial = obtenerInicioElegido();

  if (!fechaInicial) return null;

  const lunes = sumarDias(
    fechaInicial,
    (numeroSemana - 1) * 7
  );

  return {
    lunes,
    viernes: sumarDias(lunes, 4)
  };
}

function mostrarRangoSemana(numeroSemana) {
  const intervalo =
    obtenerIntervaloSemana(numeroSemana);

  if (!intervalo) {
    return `Semana ${numeroSemana}`;
  }

  return (
    `del ${formatearFecha(intervalo.lunes)} ` +
    `al ${formatearFecha(intervalo.viernes)}`
  );
}

function obtenerDiasLibresSemana(numeroSemana) {
  const intervalo =
    obtenerIntervaloSemana(numeroSemana);

  if (!intervalo) return [];

  return libres.filter(diaLibre => {
    const fecha = convertirFecha(diaLibre.fecha);

    return (
      fecha >= intervalo.lunes &&
      fecha <= intervalo.viernes
    );
  });
}

function crearPropuesta(tema) {
  const temaMinuscula = tema.toLowerCase();

  const fuente =
    grado.value === "9"
      ? "del libro del estudiante"
      : "seleccionada por el docente";

  return {
    area: "Ciencias de la vida",

    competencia:
      "Pensamiento científico: analiza fenómenos naturales, " +
      "formula explicaciones basadas en evidencias y comunica " +
      "conclusiones con responsabilidad.",

    objetivo:
      `Analizar ${temaMinuscula}, mediante la observación, ` +
      "el diálogo y actividades prácticas, para explicar su " +
      "importancia en situaciones de la vida cotidiana.",

    conceptual: tema,

    procedimental:
      `Observación, comparación, análisis de información y ` +
      `elaboración de representaciones sobre ${temaMinuscula}.`,

    actitudinal:
      "Curiosidad científica, participación responsable, " +
      "respeto por las ideas de los demás y cuidado del ambiente.",

    indicador:
      `Explica ${temaMinuscula} mediante ejemplos, vocabulario ` +
      "científico y evidencias obtenidas durante las actividades.",

    inicio:
      "Explorar conocimientos previos mediante una pregunta " +
      `generadora y una lluvia de ideas sobre ${temaMinuscula}.`,

    desarrollo:
      `Analizar una lectura ${fuente}, construir un organizador ` +
      `gráfico y resolver en equipos una situación relacionada ` +
      `con ${temaMinuscula}.`,

    cierre:
      "Socializar conclusiones, corregir ideas iniciales y " +
      "completar un boleto de salida.",

    actuaciones:
      "Participación, explicación oral, trabajo colaborativo " +
      "y sustentación.",

    entregables:
      "Organizador gráfico, respuestas de la actividad y " +
      "boleto de salida.",

    criterios:
      "Comprensión, claridad, vocabulario científico, precisión, " +
      "creatividad, responsabilidad y trabajo colaborativo.",

    diagnostica:
      "Lluvia de ideas - Registro de observación.",

    formativa:
      "Organizador gráfico y trabajo colaborativo - Lista de cotejo.",

    sumativa:
      "Producto y explicación final - Rúbrica analítica.",

    observaciones: ""
  };
}

function crearPropuestaEspecial(tema) {
  if (tema === "SEMANA DE REPASO") {
    return {
      ...crearPropuesta("repaso trimestral"),

      objetivo:
        "Reforzar los aprendizajes del trimestre mediante " +
        "actividades de repaso para aclarar dudas y preparar " +
        "la evaluación.",

      conceptual:
        "Síntesis de los contenidos del trimestre.",

      inicio:
        "Identificación de dudas y contenidos que requieren refuerzo.",

      desarrollo:
        "Guía de repaso, estaciones de aprendizaje y resolución " +
        "colaborativa de ejercicios.",

      cierre:
        "Retroalimentación general y orientaciones para el examen.",

      entregables:
        "Guía de repaso resuelta.",

      sumativa:
        "No aplica: semana de preparación.",

      observaciones:
        "Semana reservada para repaso antes de exámenes."
    };
  }

  if (tema === "SEMANA DE EXÁMENES") {
    return {
      ...crearPropuesta("evaluación trimestral"),

      objetivo:
        "Valorar integralmente los aprendizajes logrados " +
        "durante el trimestre.",

      conceptual:
        "Contenidos evaluados del trimestre.",

      inicio:
        "Orientaciones y organización del espacio de evaluación.",

      desarrollo:
        "Aplicación de la evaluación trimestral.",

      cierre:
        "Entrega y verificación del instrumento aplicado.",

      entregables:
        "Prueba o producto de evaluación trimestral.",

      sumativa:
        "Examen trimestral - Prueba escrita o instrumento definido.",

      observaciones:
        "Semana reservada para exámenes trimestrales."
    };
  }

  return crearPropuesta(tema);
}

function crearHoja(tema, numeroSemana, indice) {
  const propuesta =
    crearPropuestaEspecial(tema);

  const diasLibres =
    obtenerDiasLibresSemana(numeroSemana);

  const avisoDiasLibres = diasLibres.length
    ? `
      <div class="aviso-libre">
        <b>Días libres de esta semana:</b>
        ${diasLibres
          .map(
            dia => `
              <span>
                ${formatearFecha(convertirFecha(dia.fecha))}:
                ${dia.motivo}
              </span>
            `
          )
          .join("")}
      </div>
    `
    : "";

  const contenidoCampos = campos
    .map(([nombre, etiqueta], posicion) => {
      const claseAncha =
        posicion === 0 || posicion === 16
          ? "ancho"
          : "";

      const filas =
        posicion === 6 ? 7 : 3;

      return `
        <label class="campo ${claseAncha}">
          <b>${etiqueta}</b>
          <textarea
            name="${nombre}"
            rows="${filas}"
          >${propuesta[nombre] || ""}</textarea>
        </label>
      `;
    })
    .join("");

  return `
    <form class="plan">
      <div class="plan-title">
        Planificación ${indice + 1}
        de <span class="total"></span>
        · ${tema}
      </div>

      <div class="official">
        <b>MINISTERIO DE EDUCACIÓN</b>

        <label>
          DIRECCIÓN REGIONAL DE EDUCACIÓN DE
          <input name="regional">
        </label>

        <strong>
          SECUENCIA DIDÁCTICA SEMANAL
        </strong>
      </div>

      <div class="meta">
        <label>
          Asignatura
          <input
            value="Ciencias Naturales"
            readonly
          >
        </label>

        <label>
          Horas
          <input name="horas" value="5">
        </label>

        <label>
          Grado
          <input
            value="${grado.value}.º"
            readonly
          >
        </label>

        <label>
          Docente(s)
          <input
            name="docente"
            value="${profesor}"
          >
        </label>

        <label>
          Semana
          <input
            name="semana"
            value="${mostrarRangoSemana(numeroSemana)}"
          >
        </label>

        <label>
          Trimestre
          <input
            value="${trimestre.value}"
            readonly
          >
        </label>
      </div>

      ${avisoDiasLibres}

      <div class="campos">
        ${contenidoCampos}
      </div>

      <div class="firmas">
        <span>
          (15) Firma del docente ____________________
        </span>

        <span>
          (16) Firma del coordinador ____________________
        </span>
      </div>
    </form>
  `;
}

function obtenerSemanasFinales() {
  const numeroTrimestre = {
    I: 1,
    II: 2,
    III: 3
  }[trimestre.value];

  const fechaFinal = convertirFecha(
    fechas[`t${numeroTrimestre}_fin`]
  );

  const fechaInicial = obtenerInicioElegido();

  if (!fechaFinal || !fechaInicial) {
    return null;
  }

  const desplazamientoLunes =
    (fechaFinal.getDay() + 6) % 7;

  const semanaExamen = sumarDias(
    fechaFinal,
    -desplazamientoLunes
  );

  const semanaRepaso =
    sumarDias(semanaExamen, -7);

  const fechaLimite =
    sumarDias(semanaRepaso, -3);

  return {
    examen: semanaExamen,
    repaso: semanaRepaso,
    limite: fechaLimite,

    numeroExamen:
      Math.floor(
        (semanaExamen - fechaInicial) /
        604800000
      ) + 1,

    numeroRepaso:
      Math.floor(
        (semanaRepaso - fechaInicial) /
        604800000
      ) + 1
  };
}

function generarPlanificaciones() {
  const listaActual = temasActuales();

  const temasSeleccionados = [
    ...document.querySelectorAll(
      "#temas input:checked"
    )
  ].map(elemento =>
    listaActual[Number(elemento.value)]
  );

  if (!temasSeleccionados.length) {
    alert("Seleccione al menos un tema.");
    return;
  }

  const semanaInicial = Math.max(
    1,
    Number($("#semanaInicial").value) || 1
  );

  const semanasFinales =
    obtenerSemanasFinales();

  if (
    semanasFinales &&
    semanaInicial +
      temasSeleccionados.length -
      1 >=
      semanasFinales.numeroRepaso
  ) {
    alert(
      "Hay demasiados temas para las semanas disponibles. " +
      "Los contenidos deben terminar antes del " +
      formatearFecha(semanasFinales.repaso) +
      "."
    );

    return;
  }

  const planificaciones =
    temasSeleccionados.map(
      (tema, indice) => ({
        tema,
        semana: semanaInicial + indice
      })
    );

  if (semanasFinales) {
    planificaciones.push(
      {
        tema: "SEMANA DE REPASO",
        semana: semanasFinales.numeroRepaso
      },
      {
        tema: "SEMANA DE EXÁMENES",
        semana: semanasFinales.numeroExamen
      }
    );
  }

  $("#planes").innerHTML =
    planificaciones
      .map((planificacion, indice) =>
        crearHoja(
          planificacion.tema,
          planificacion.semana,
          indice
        )
      )
      .join("");

  document
    .querySelectorAll(".total")
    .forEach(elemento => {
      elemento.textContent =
        planificaciones.length;
    });

  $("#planes").scrollIntoView({
    behavior: "smooth"
  });
}

function guardarPlanificaciones() {
  const contenido = $("#planes").innerHTML;

  if (!document.querySelector(".plan")) {
    alert("Primero genere las planificaciones.");
    return;
  }

  const clave =
    `planes-meduca-${grado.value}-${trimestre.value}`;

  localStorage.setItem(
    clave,
    JSON.stringify({
      html: contenido,
      libres,
      fechaInicio: $("#fechaInicio").value
    })
  );

  $("#guardar").textContent = "✓ Guardado";
}

function cargarPlanificaciones() {
  const clave =
    `planes-meduca-${grado.value}-${trimestre.value}`;

  const contenido =
    localStorage.getItem(clave);

  if (!contenido) return;

  try {
    const datos = JSON.parse(contenido);

    $("#planes").innerHTML =
      datos.html;

    libres =
      datos.libres || [];

    $("#fechaInicio").value =
      datos.fechaInicio ||
      $("#fechaInicio").value;

    mostrarDiasLibres();
  } catch {
    $("#planes").innerHTML = contenido;
  }
}

async function iniciar() {
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    location.href = "login.html";
    return;
  }

  const [
    { data: datosProfesor },
    { data: configuracion }
  ] = await Promise.all([
    supabase
      .from("profesores")
      .select("nombre_profesor")
      .eq(
        "correo_profesor",
        user.email.toLowerCase()
      )
      .maybeSingle(),

    supabase
      .from("configuracion")
      .select(
        "t1_inicio,t1_fin," +
        "t2_inicio,t2_fin," +
        "t3_inicio,t3_fin"
      )
      .eq("id", 1)
      .maybeSingle()
  ]);

  profesor =
    datosProfesor?.nombre_profesor || "";

  fechas =
    configuracion || {};

  mostrarInformacionTrimestre();
  cargarPlanificaciones();
}

function mostrarInformacionTrimestre() {
  const numeroTrimestre = {
    I: 1,
    II: 2,
    III: 3
  }[trimestre.value];

  const inicio =
    fechas[`t${numeroTrimestre}_inicio`];

  const final =
    fechas[`t${numeroTrimestre}_fin`];

  if (inicio && !$("#fechaInicio").value) {
    $("#fechaInicio").value = inicio;
  }

  const semanasFinales =
    obtenerSemanasFinales();

  if (inicio && final && semanasFinales) {
    $("#rango").textContent =
      `Trimestre ${trimestre.value}: ` +
      `${formatearFecha(convertirFecha(inicio))} al ` +
      `${formatearFecha(convertirFecha(final))}. ` +
      `Fecha límite para contenidos: ` +
      `${formatearFecha(semanasFinales.limite)}. ` +
      `Repaso: ${formatearFecha(semanasFinales.repaso)}. ` +
      `Exámenes: ${formatearFecha(semanasFinales.examen)}.`;
  } else {
    $("#rango").textContent =
      "Indique la fecha de inicio y configure " +
      "la fecha final del trimestre.";
  }
}

function mostrarDiasLibres() {
  $("#listaLibres").innerHTML =
    libres
      .map(
        (diaLibre, indice) => `
          <div>
            <span>
              <b>
                ${formatearFecha(
                  convertirFecha(diaLibre.fecha)
                )}
              </b>
              · ${diaLibre.motivo}
            </span>

            <button
              type="button"
              data-indice="${indice}"
            >
              Quitar
            </button>
          </div>
        `
      )
      .join("");

  document
    .querySelectorAll("#listaLibres button")
    .forEach(boton => {
      boton.onclick = () => {
        libres.splice(
          Number(boton.dataset.indice),
          1
        );

        mostrarDiasLibres();
      };
    });
}

function agregarDiaLibre() {
  const fecha =
    $("#fechaLibre").value;

  const motivo =
    $("#motivoLibre").value.trim();

  if (!fecha || !motivo) {
    alert(
      "Escriba la fecha y el motivo del día libre."
    );

    return;
  }

  libres.push({
    fecha,
    motivo
  });

  libres.sort(
    (a, b) =>
      a.fecha.localeCompare(b.fecha)
  );

  $("#fechaLibre").value = "";
  $("#motivoLibre").value = "";

  mostrarDiasLibres();
}

mostrarListaTemas();
iniciar();

grado.onchange = () => {
  mostrarListaTemas();
  cargarPlanificaciones();
};

trimestre.onchange = () => {
  $("#fechaInicio").value = "";
  mostrarListaTemas();
  mostrarInformacionTrimestre();
  cargarPlanificaciones();
};

$("#fechaInicio").onchange =
  mostrarInformacionTrimestre;

$("#agregarLibre").onclick =
  agregarDiaLibre;

$("#todos").onclick = () => {
  document
    .querySelectorAll("#temas input")
    .forEach(elemento => {
      elemento.checked = true;
    });
};

$("#generar").onclick =
  generarPlanificaciones;

$("#guardar").onclick =
  guardarPlanificaciones;

$("#imprimir").onclick = () =>
  window.print();

$("#limpiar").onclick = () => {
  if (
    confirm(
      "¿Eliminar las planificaciones mostradas?"
    )
  ) {
    $("#planes").innerHTML =
      '<p class="vacio">' +
      "Seleccione los temas y pulse " +
      "“Generar planificaciones”." +
      "</p>";
  }
};
