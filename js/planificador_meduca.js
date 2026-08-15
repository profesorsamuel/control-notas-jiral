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
  ],
  9: [
    "Divulgación de investigaciones científicas",
    "Material genético: ADN y ARN",
    "Ciclo celular",
    "Reproducción y desarrollo humano",
    "Genética",
    "Enfermedades genéticas y grupos sanguíneos",
    "Sexualidad responsable",
    "Origen de las especies y evolución",
    "Cambio climático",
    "Movimiento ondulatorio",
    "Energía eléctrica",
    "El sistema solar"
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

const libresT3 = [
  {
    fecha: "2026-10-27",
    motivo: "Día del Estudiante - día cívico escolar"
  },
  {
    fecha: "2026-11-02",
    motivo: "Día de los Difuntos"
  },
  {
    fecha: "2026-11-03",
    motivo: "Separación de Panamá de Colombia"
  },
  {
    fecha: "2026-11-04",
    motivo: "Día de los Símbolos Patrios"
  },
  {
    fecha: "2026-11-05",
    motivo: "Consolidación de la Separación"
  },
  {
    fecha: "2026-11-10",
    motivo: "Primer Grito de Independencia"
  },
  {
    fecha: "2026-12-01",
    motivo: "Día del Maestro - libre para estudiantes"
  },
  {
    fecha: "2026-12-08",
    motivo: "Día de la Madre"
  }
];

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
  if (grado.value === "9") {
    return temas9[trimestre.value];
  }

  return temas[grado.value];
}

function lista() {
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

function isoLocal(fecha) {
  if (!fecha) {
    return null;
  }

  const [anio, mes, dia] = fecha.split("-").map(Number);
  return new Date(anio, mes - 1, dia);
}

function sumar(fecha, dias) {
  const resultado = new Date(fecha);
  resultado.setDate(resultado.getDate() + dias);
  return resultado;
}

function fmt(fecha) {
  return fecha.toLocaleDateString("es-PA", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
}

function inicioElegido() {
  const numeroTrimestre = {
    I: 1,
    II: 2,
    III: 3
  }[trimestre.value];

  const campo = `t${numeroTrimestre}_inicio`;

  return isoLocal(
    $("#fechaInicio").value || fechas[campo]
  );
}

function intervaloSemana(numeroSemana) {
  const inicio = inicioElegido();

  if (!inicio) {
    return null;
  }

  const lunes = sumar(inicio, (numeroSemana - 1) * 7);

  return {
    lunes,
    viernes: sumar(lunes, 4)
  };
}

function rangoSemana(numeroSemana) {
  const intervalo = intervaloSemana(numeroSemana);

  if (!intervalo) {
    return `Semana ${numeroSemana}`;
  }

  return `del ${fmt(intervalo.lunes)} al ${fmt(intervalo.viernes)}`;
}

function libresSemana(numeroSemana) {
  const intervalo = intervaloSemana(numeroSemana);

  if (!intervalo) {
    return [];
  }

  return libres.filter(diaLibre => {
    const fecha = isoLocal(diaLibre.fecha);

    return (
      fecha >= intervalo.lunes &&
      fecha <= intervalo.viernes
    );
  });
}

function propuesta(tema) {
  const temaMinuscula = tema.toLowerCase();

  const fuente =
    grado.value === "9"
      ? "del libro del estudiante"
      : "seleccionada por el docente";

  return {
    area: "Ciencias de la vida",

    competencia:
      "Pensamiento científico: analiza fenómenos naturales, formula explicaciones basadas en evidencias y comunica conclusiones con responsabilidad.",

    objetivo:
      `Analizar ${temaMinuscula}, mediante la observación, el diálogo y actividades prácticas, para explicar su importancia en situaciones de la vida cotidiana.`,

    conceptual: tema,

    procedimental:
      `Observación, comparación, análisis de información y elaboración de representaciones sobre ${temaMinuscula}.`,

    actitudinal:
      "Curiosidad científica, participación responsable, respeto por las ideas de los demás y cuidado del ambiente.",

    indicador:
      `Explica ${temaMinuscula} mediante ejemplos, vocabulario científico y evidencias obtenidas durante las actividades de aula.`,

    inicio:
      `Explorar conocimientos previos mediante una pregunta generadora y una lluvia de ideas sobre ${temaMinuscula}.`,

    desarrollo:
      `Analizar una lectura ${fuente}, construir un organizador gráfico y resolver en equipos una situación relacionada con ${temaMinuscula}.`,

    cierre:
      "Socializar conclusiones, corregir ideas iniciales y completar un boleto de salida.",

    actuaciones:
      "Participación, explicación oral, trabajo colaborativo y sustentación.",

    entregables:
      "Organizador gráfico, respuestas de la actividad y boleto de salida.",

    criterios:
      "Comprensión, claridad, vocabulario científico, precisión, creatividad, responsabilidad y trabajo colaborativo.",

    diagnostica:
      "Lluvia de ideas - Registro de observación.",

    formativa:
      "Organizador gráfico y trabajo colaborativo - Lista de cotejo.",

    sumativa:
      "Producto y explicación final - Rúbrica analítica.",

    observaciones: ""
  };
}

function propuestaEspecial(tema) {
  if (tema === "SEMANA DE REPASO") {
    return {
      ...propuesta("repaso trimestral"),

      objetivo:
        "Reforzar los aprendizajes del trimestre mediante actividades de repaso para aclarar dudas y preparar la evaluación.",

      conceptual:
        "Síntesis de los contenidos del trimestre.",

      inicio:
        "Identificación de dudas y contenidos que requieren refuerzo.",

      desarrollo:
        "Guía de repaso, estaciones de aprendizaje y resolución colaborativa de ejercicios.",

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
      ...propuesta("evaluación trimestral"),

      objetivo:
        "Valorar integralmente los aprendizajes logrados durante el trimestre.",

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

  return propuesta(tema);
}

function hoja(tema, numeroSemana, indice) {
  const informacion = propuestaEspecial(tema);
  const diasLibres = libresSemana(numeroSemana);

  const aviso = diasLibres.length
    ? `
      <div class="aviso-libre">
        <b>Días libres de esta semana:</b>
        ${diasLibres
          .map(
            dia => `
              <span>
                ${fmt(isoLocal(dia.fecha))}: ${dia.motivo}
              </span>
            `
          )
          .join("")}
      </div>
    `
    : "";

  const camposHTML = campos
    .map(
      ([nombre, titulo], posicion) => `
        <label class="campo ${
          posicion === 0 || posicion === 16
            ? "ancho"
            : ""
        }">
          <b>${titulo}</b>
          <textarea
            name="${nombre}"
            rows="${posicion === 6 ? 7 : 3}"
          >${informacion[nombre] || ""}</textarea>
        </label>
      `
    )
    .join("");

  return `
    <form class="plan">
      <div class="plan-title">
        Planificación ${indice + 1} de
        <span class="total"></span> · ${tema}
      </div>

      <div class="official">
        <b>MINISTERIO DE EDUCACIÓN</b>

        <label>
          DIRECCIÓN REGIONAL DE EDUCACIÓN DE
          <input name="regional">
        </label>

        <strong>SECUENCIA DIDÁCTICA SEMANAL</strong>
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
            value="${rangoSemana(numeroSemana)}"
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

      ${aviso}

      <div class="campos">
        ${camposHTML}
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

function fechaFinalAplicable() {
  if (trimestre.value === "III") {
    return grado.value === "9"
      ? "2026-11-27"
      : "2026-12-11";
  }

  const numeroTrimestre = {
    I: 1,
    II: 2,
    III: 3
  }[trimestre.value];

  return fechas[`t${numeroTrimestre}_fin`] || "";
}

function cargarLibresAutomaticos() {
  if (trimestre.value !== "III") {
    return;
  }

  const fechaFinal = fechaFinalAplicable();

  libresT3
    .filter(dia => dia.fecha <= fechaFinal)
    .forEach(dia => {
      const yaExiste = libres.some(
        existente => existente.fecha === dia.fecha
      );

      if (!yaExiste) {
        libres.push({ ...dia });
      }
    });

  libres.sort((a, b) =>
    a.fecha.localeCompare(b.fecha)
  );

  pintarLibres();
}

function semanasFinales() {
  const fechaFinal = isoLocal(fechaFinalAplicable());
  const fechaInicial = inicioElegido();

  if (!fechaFinal || !fechaInicial) {
    return null;
  }

  const lunesExamen = sumar(
    fechaFinal,
    -((fechaFinal.getDay() + 6) % 7)
  );

  const lunesRepaso = sumar(lunesExamen, -7);
  const fechaLimite = sumar(lunesRepaso, -3);

  return {
    examen: lunesExamen,
    repaso: lunesRepaso,
    limite: fechaLimite,

    semExamen:
      Math.floor(
        (lunesExamen - fechaInicial) / 604800000
      ) + 1,

    semRepaso:
      Math.floor(
        (lunesRepaso - fechaInicial) / 604800000
      ) + 1
  };
}

function diasLectivos(numeroSemana) {
  return Math.max(
    1,
    5 - libresSemana(numeroSemana).length
  );
}

function generar() {
  const temasDisponibles = temasActuales();

  const seleccionados = [
    ...document.querySelectorAll(
      "#temas input:checked"
    )
  ].map(
    elemento =>
      temasDisponibles[Number(elemento.value)]
  );

  if (!seleccionados.length) {
    alert("Seleccione al menos un tema.");
    return;
  }

  const semanaInicial = Math.max(
    1,
    Number($("#semanaInicial").value) || 1
  );

  const semanasReservadas = semanasFinales();
  const planificaciones = [];

  if (semanasReservadas) {
    const cantidadSemanas =
      semanasReservadas.semRepaso - semanaInicial;

    if (cantidadSemanas <= 0) {
      alert(
        "No hay semanas disponibles antes del repaso."
      );
      return;
    }

    const temasPendientes = [...seleccionados];

    for (
      let indice = 0;
      indice < cantidadSemanas &&
      temasPendientes.length;
      indice++
    ) {
      const numeroSemana =
        semanaInicial + indice;

      const semanasRestantes =
        cantidadSemanas - indice;

      /*
       * Calcula cuántos temas deben estudiarse
       * en cada semana para que todos puedan
       * impartirse antes del repaso.
       */
      let cantidadTemas = Math.ceil(
        temasPendientes.length /
        semanasRestantes
      );

      /*
       * Si una semana tiene dos días lectivos
       * o menos, intenta colocar solo un tema.
       */
      if (
        diasLectivos(numeroSemana) <= 2 &&
        semanasRestantes > 1
      ) {
        cantidadTemas = 1;
      }

      const grupoDeTemas =
        temasPendientes.splice(
          0,
          Math.max(1, cantidadTemas)
        );

      planificaciones.push({
        t: grupoDeTemas.join(" + "),
        sem: numeroSemana
      });
    }

    planificaciones.push(
      {
        t: "SEMANA DE REPASO",
        sem: semanasReservadas.semRepaso
      },
      {
        t: "SEMANA DE EXÁMENES",
        sem: semanasReservadas.semExamen
      }
    );
  } else {
    seleccionados.forEach(
      (tema, indice) => {
        planificaciones.push({
          t: tema,
          sem: semanaInicial + indice
        });
      }
    );
  }

  $("#planes").innerHTML =
    planificaciones
      .map(
        (planificacion, indice) =>
          hoja(
            planificacion.t,
            planificacion.sem,
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

function guardar() {
  const contenido = $("#planes").innerHTML;

  if (!document.querySelector(".plan")) {
    alert("Primero genere las planificaciones.");
    return;
  }

  localStorage.setItem(
    `planes-meduca-${grado.value}-${trimestre.value}`,
    JSON.stringify({
      html: contenido,
      libres,
      fechaInicio: $("#fechaInicio").value
    })
  );

  $("#guardar").textContent = "✓ Guardado";
}

function cargar() {
  const contenidoGuardado = localStorage.getItem(
    `planes-meduca-${grado.value}-${trimestre.value}`
  );

  if (!contenidoGuardado) {
    return;
  }

  try {
    const datos = JSON.parse(contenidoGuardado);

    $("#planes").innerHTML = datos.html;
    libres = datos.libres || [];

    $("#fechaInicio").value =
      datos.fechaInicio ||
      $("#fechaInicio").value;

    pintarLibres();
  } catch {
    $("#planes").innerHTML =
      contenidoGuardado;
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
        "t1_inicio,t1_fin,t2_inicio,t2_fin,t3_inicio,t3_fin"
      )
      .eq("id", 1)
      .maybeSingle()
  ]);

  profesor =
    datosProfesor?.nombre_profesor || "";

  fechas = configuracion || {};

  mostrarRango();
  cargar();
  cargarLibresAutomaticos();
}

function mostrarRango() {
  const numeroTrimestre = {
    I: 1,
    II: 2,
    III: 3
  }[trimestre.value];

  const fechaInicial =
    fechas[`t${numeroTrimestre}_inicio`];

  const fechaFinal =
    fechaFinalAplicable();

  if (
    fechaInicial &&
    !$("#fechaInicio").value
  ) {
    $("#fechaInicio").value =
      fechaInicial;
  }

  const semanas = semanasFinales();

  $("#rango").textContent =
    fechaInicial && fechaFinal && semanas
      ? `Trimestre ${trimestre.value}: ${fmt(
          isoLocal(fechaInicial)
        )} al ${fmt(
          isoLocal(fechaFinal)
        )}. Fecha límite para contenidos: ${fmt(
          semanas.limite
        )}. Repaso: ${fmt(
          semanas.repaso
        )}. Exámenes: ${fmt(
          semanas.examen
        )}.`
      : "Indique la fecha de inicio y configure la fecha final del trimestre.";
}

function pintarLibres() {
  $("#listaLibres").innerHTML =
    libres
      .map(
        (dia, indice) => `
          <div>
            <span>
              <b>${fmt(isoLocal(dia.fecha))}</b>
              · ${dia.motivo}
            </span>

            <button
              type="button"
              data-i="${indice}"
            >
              Quitar
            </button>
          </div>
        `
      )
      .join("");

  document
    .querySelectorAll(
      "#listaLibres button"
    )
    .forEach(boton => {
      boton.onclick = () => {
        libres.splice(
          Number(boton.dataset.i),
          1
        );

        pintarLibres();
      };
    });
}

function agregarLibre() {
  const fecha = $("#fechaLibre").value;
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

  libres.sort((a, b) =>
    a.fecha.localeCompare(b.fecha)
  );

  $("#fechaLibre").value = "";
  $("#motivoLibre").value = "";

  pintarLibres();
}

lista();
iniciar();

grado.onchange = () => {
  lista();
  cargarLibresAutomaticos();
  mostrarRango();
  cargar();
};

trimestre.onchange = () => {
  $("#fechaInicio").value = "";

  lista();
  cargarLibresAutomaticos();
  mostrarRango();
  cargar();
};

$("#fechaInicio").onchange = mostrarRango;

$("#agregarLibre").onclick =
  agregarLibre;

$("#todos").onclick = () => {
  document
    .querySelectorAll("#temas input")
    .forEach(elemento => {
      elemento.checked = true;
    });
};

$("#generar").onclick = generar;
$("#guardar").onclick = guardar;
$("#imprimir").onclick = () => print();

$("#limpiar").onclick = () => {
  if (
    confirm(
      "¿Eliminar las planificaciones mostradas?"
    )
  ) {
    $("#planes").innerHTML = `
      <p class="vacio">
        Seleccione los temas y pulse
        “Generar planificaciones”.
      </p>
    `;
  }
};
