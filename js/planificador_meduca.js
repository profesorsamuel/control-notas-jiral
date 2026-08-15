function diasLectivos(numeroSemana) {
  return Math.max(1, 5 - libresSemana(numeroSemana).length);
}

function generar() {
  const actuales = temasActuales();

  const seleccionados = [
    ...document.querySelectorAll("#temas input:checked")
  ].map(elemento => actuales[Number(elemento.value)]);

  if (!seleccionados.length) {
    alert("Seleccione al menos un tema.");
    return;
  }

  const semanaInicial = Math.max(
    1,
    Number(document.querySelector("#semanaInicial").value) || 1
  );

  const finales = semanasFinales();
  const items = [];

  if (finales) {
    const cantidadSemanas = finales.semRepaso - semanaInicial;

    if (cantidadSemanas <= 0) {
      alert("No hay semanas disponibles antes del repaso.");
      return;
    }

    const temasPendientes = [...seleccionados];

    for (
      let indice = 0;
      indice < cantidadSemanas && temasPendientes.length;
      indice++
    ) {
      const numeroSemana = semanaInicial + indice;
      const semanasRestantes = cantidadSemanas - indice;

      /*
       * Divide los temas entre las semanas disponibles.
       * Cuando sea necesario, coloca varios temas en una semana.
       */
      let cantidadTemas = Math.ceil(
        temasPendientes.length / semanasRestantes
      );

      /*
       * En una semana con dos días lectivos o menos,
       * intenta colocar solamente un tema.
       */
      if (
        diasLectivos(numeroSemana) <= 2 &&
        semanasRestantes > 1
      ) {
        cantidadTemas = 1;
      }

      const grupoDeTemas = temasPendientes.splice(
        0,
        Math.max(1, cantidadTemas)
      );

      items.push({
        t: grupoDeTemas.join(" + "),
        sem: numeroSemana
      });
    }

    /*
     * Las dos últimas semanas quedan reservadas.
     */
    items.push(
      {
        t: "SEMANA DE REPASO",
        sem: finales.semRepaso
      },
      {
        t: "SEMANA DE EXÁMENES",
        sem: finales.semExamen
      }
    );
  } else {
    seleccionados.forEach((tema, indice) => {
      items.push({
        t: tema,
        sem: semanaInicial + indice
      });
    });
  }

  document.querySelector("#planes").innerHTML = items
    .map((item, indice) => hoja(item.t, item.sem, indice))
    .join("");

  document.querySelectorAll(".total").forEach(elemento => {
    elemento.textContent = items.length;
  });

  document.querySelector("#planes").scrollIntoView({
    behavior: "smooth"
  });
}
