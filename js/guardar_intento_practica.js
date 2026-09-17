// =========================================================
// GUARDADO RESISTENTE DE INTENTOS DE PRÁCTICA (versión celular)
// C.E.B.G. EL JIRAL — usado por los 3 ejercicios de cada Clase
// (quiz, pareo de términos, pareo de fotos).
// =========================================================
// Qué cambió respecto a la versión anterior y POR QUÉ:
//
// 1) El envío ya NO pasa por la librería de Supabase: va con un
//    fetch directo a la API REST. Así podemos ver el error real
//    (código HTTP y mensaje) y, sobre todo, usar dos cosas que la
//    librería no nos dejaba usar:
//      - "keepalive": el navegador termina de enviar la nota AUNQUE
//        el estudiante cierre la pestaña, bloquee la pantalla o se
//        cambie de aplicación. En celular esto es clave: Chrome de
//        Android congela la página al salir de ella y las peticiones
//        a medio camino se cancelan solas. Esa es la explicación más
//        probable de por qué desde la computadora sí guardaba y
//        desde el celular no.
//      - un tiempo máximo de espera (15 s) por intento: con señal
//        débil, un fetch normal se queda colgado para siempre y el
//        estudiante se queda esperando sin saber qué pasa.
//
// 2) El aviso en pantalla ahora dice el error de verdad y trae dos
//    botones: "Reintentar ahora" y "Copiar código de respaldo".
//    El código de respaldo es la red de seguridad final: si el
//    celular de plano no logra conectarse, el estudiante le manda
//    ese texto al profesor por WhatsApp y la nota se registra a mano.
//
// 3) Se reintenta solo: al volver la señal, al volver a la pestaña,
//    al abrir cualquiera de los 3 ejercicios, cada 30 s mientras la
//    página siga abierta, y al salir de la página (con keepalive).
//
// 4) El intento se guarda SIEMPRE en el celular ANTES de enviarlo,
//    así que nunca se pierde mientras no se borren los datos del
//    navegador.
// =========================================================

(function () {
  "use strict";

  const CLAVE_PENDIENTES = "jiral_intentos_practica_pendientes_v1";
  const ESPERA_MAX_MS = 8000;                  // tope por intento (antes 15 s: se sentía "colgado")
  const PAUSAS_MS = [0, 1500, 4000, 8000];     // 4 intentos con espera creciente (~22 s máx.)
  const REINTENTO_FONDO_MS = 30000;            // barrido cada 30 s con la página abierta

  let enviandoPendientes = false;
  let temporizadorFondo = null;
  let ultimoError = "";

  // ---------------------------------------------------------
  // Cola local (localStorage)
  // ---------------------------------------------------------
  function leerPendientes() {
    try {
      const valor = JSON.parse(localStorage.getItem(CLAVE_PENDIENTES) || "[]");
      return Array.isArray(valor) ? valor : [];
    } catch {
      return [];
    }
  }

  function escribirPendientes(pendientes) {
    try {
      localStorage.setItem(CLAVE_PENDIENTES, JSON.stringify(pendientes));
    } catch (error) {
      console.error("No se pudo conservar el intento pendiente:", error);
    }
  }

  function claveIntento(payload) {
    return [payload.codigo_examen, payload.tipo_ejercicio, payload.cedula].join("|");
  }

  function guardarCopiaLocal(tabla, payload) {
    const clave = claveIntento(payload);
    const pendientes = leerPendientes().filter((item) => item.clave !== clave);
    pendientes.push({ clave, tabla, payload, guardado_local_at: new Date().toISOString() });
    escribirPendientes(pendientes);
  }

  function quitarCopiaLocal(payload) {
    const clave = claveIntento(payload);
    escribirPendientes(leerPendientes().filter((item) => item.clave !== clave));
  }

  function esperar(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ---------------------------------------------------------
  // Código de respaldo: lo que el estudiante le manda al profesor
  // si el celular nunca logra conectarse.
  // ---------------------------------------------------------
  function codigoRespaldo(payload) {
    const f = new Date(payload.finalizado_at || Date.now());
    const dd = String(f.getDate()).padStart(2, "0");
    const mm = String(f.getMonth() + 1).padStart(2, "0");
    const hh = String(f.getHours()).padStart(2, "0");
    const mi = String(f.getMinutes()).padStart(2, "0");
    return [
      "JIRAL-NOTA",
      payload.salon || "?",
      payload.nombre || "?",
      payload.cedula || "?",
      payload.codigo_examen || "?",
      payload.tipo_ejercicio || "?",
      `nota=${payload.nota_meduca}`,
      `${payload.correctas}/${(payload.correctas || 0) + (payload.incorrectas || 0)}`,
      `${payload.porcentaje}%`,
      `${dd}/${mm} ${hh}:${mi}`,
    ].join(" | ");
  }

  function textoRespaldoPendientes() {
    return leerPendientes().map((item) => codigoRespaldo(item.payload)).join("\n");
  }

  // ---------------------------------------------------------
  // Aviso en pantalla
  // ---------------------------------------------------------
  let refs = null;
  function obtenerAviso() {
    if (refs && document.body.contains(refs.caja)) return refs;

    const caja = document.createElement("div");
    caja.id = "aviso-guardado-practica";
    caja.setAttribute("role", "status");
    caja.setAttribute("aria-live", "polite");
    Object.assign(caja.style, {
      position: "fixed", left: "12px", right: "12px", bottom: "12px",
      zIndex: "99999", maxWidth: "620px", margin: "auto", padding: "10px 14px",
      borderRadius: "12px", color: "#fff", fontWeight: "700", textAlign: "center",
      boxShadow: "0 6px 24px rgba(0,0,0,.28)", display: "none",
      fontSize: "clamp(12px, 3vw, 15px)", lineHeight: "1.3",
      // En celulares acostados (poca altura) el aviso puede terminar
      // ocupando media pantalla y tapando el botón de "Finalizar".
      // Con esto, si el contenido no cabe, el AVISO se hace scrollable
      // por dentro en vez de crecer hacia arriba y tapar el botón.
      maxHeight: "42vh", overflowY: "auto",
    });

    const texto = document.createElement("div");

    const detalle = document.createElement("div");
    Object.assign(detalle.style, {
      display: "none", marginTop: "6px", fontWeight: "400", fontSize: "11.5px",
      opacity: ".95", wordBreak: "break-word", textAlign: "left",
      background: "rgba(0,0,0,.18)", borderRadius: "8px", padding: "8px",
      maxHeight: "16vh", overflowY: "auto",
    });

    const botones = document.createElement("div");
    Object.assign(botones.style, {
      display: "none", gap: "8px", marginTop: "10px",
      justifyContent: "center", flexWrap: "wrap",
    });

    const estiloBoton = {
      background: "#fff", border: "0", borderRadius: "8px", padding: "9px 12px",
      fontWeight: "700", fontSize: "13px", cursor: "pointer", color: "#111",
    };

    const btnReintentar = document.createElement("button");
    btnReintentar.type = "button";
    btnReintentar.textContent = "🔄 Reintentar ahora";
    Object.assign(btnReintentar.style, estiloBoton);

    const btnCopiar = document.createElement("button");
    btnCopiar.type = "button";
    btnCopiar.textContent = "📋 Copiar código de respaldo";
    Object.assign(btnCopiar.style, estiloBoton);

    const btnDetalle = document.createElement("button");
    btnDetalle.type = "button";
    btnDetalle.textContent = "Ver detalle técnico";
    Object.assign(btnDetalle.style, estiloBoton, { background: "rgba(255,255,255,.22)", color: "#fff" });

    btnReintentar.addEventListener("click", () => {
      if (window.sbPractica) window.reenviarIntentosPracticaPendientes(window.sbPractica, true);
    });

    btnCopiar.addEventListener("click", async () => {
      const txt = textoRespaldoPendientes();
      try {
        await navigator.clipboard.writeText(txt);
        btnCopiar.textContent = "✅ Copiado — envíaselo al profesor";
      } catch {
        // Si el navegador no deja copiar (pasa en algunos celulares),
        // al menos se lo mostramos para que lo escriba o le tome foto.
        detalle.style.display = "block";
        detalle.textContent = txt;
        btnCopiar.textContent = "👆 Cópialo de aquí arriba";
      }
    });

    btnDetalle.addEventListener("click", () => {
      const visible = detalle.style.display === "block";
      detalle.style.display = visible ? "none" : "block";
      if (!visible) {
        detalle.textContent =
          (ultimoError ? `Error: ${ultimoError}\n\n` : "") +
          `Conexión del celular: ${navigator.onLine ? "en línea" : "SIN CONEXIÓN"}\n\n` +
          `Código de respaldo:\n${textoRespaldoPendientes()}`;
      }
      ajustarEspacioParaAviso();
    });

    botones.append(btnReintentar, btnCopiar, btnDetalle);
    caja.append(texto, detalle, botones);
    document.body.appendChild(caja);

    refs = { caja, texto, detalle, botones };
    return refs;
  }

  // ---------------------------------------------------------
  // Reservar espacio para el aviso (celulares pequeños/acostados)
  // ---------------------------------------------------------
  // El aviso es "position:fixed", así que SIEMPRE queda encima de lo
  // que haya al fondo de la página, sin importar el scroll. En un
  // celular acostado (poca altura de pantalla) eso tapaba el botón
  // "Finalizar y guardar". La solución: cuando el aviso está visible,
  // le agregamos ese mismo alto como "padding-bottom" al body, para
  // que siempre quede un espacio en blanco debajo del botón y el
  // aviso no tape nada.
  let paddingOriginalBody = null;
  function ajustarEspacioParaAviso() {
    requestAnimationFrame(() => {
      if (!refs) return;
      if (paddingOriginalBody === null) paddingOriginalBody = document.body.style.paddingBottom || "";
      const visible = refs.caja.style.display !== "none";
      document.body.style.paddingBottom = visible
        ? `${refs.caja.offsetHeight + 24}px`
        : paddingOriginalBody;
    });
  }

  function mostrarAviso(mensaje, tipo) {
    const { caja, texto, detalle, botones } = obtenerAviso();
    texto.textContent = mensaje;
    caja.style.background = tipo === "ok" ? "#177245" : tipo === "error" ? "#b42318" : "#2457a7";
    caja.style.display = "block";
    botones.style.display = tipo === "error" ? "flex" : "none";
    if (tipo !== "error") detalle.style.display = "none";
    ajustarEspacioParaAviso();
    if (tipo === "ok") setTimeout(() => { caja.style.display = "none"; ajustarEspacioParaAviso(); }, 6000);
  }

  function ocultarAviso() {
    if (refs) refs.caja.style.display = "none";
    ajustarEspacioParaAviso();
  }

  // ---------------------------------------------------------
  // Envío real (fetch directo a la API REST de Supabase)
  //   keepalive = true -> el navegador lo termina aunque la página
  //   se cierre o el celular bloquee la pantalla.
  // ---------------------------------------------------------
  async function enviarUnaVez(tabla, payload, opciones) {
    const keepalive = !!(opciones && opciones.keepalive);
    const base = window.SUPABASE_URL;
    const llave = window.SUPABASE_ANON_KEY;
    if (!base || !llave) throw new Error("Falta la configuración de Supabase en este dispositivo.");

    const url = `${base}/rest/v1/${tabla}?on_conflict=codigo_examen,tipo_ejercicio,cedula`;
    const controlador = typeof AbortController !== "undefined" ? new AbortController() : null;
    // Con keepalive no ponemos cronómetro: la idea justamente es que
    // el navegador lo complete por su cuenta después de que salgamos.
    const cronometro = (!keepalive && controlador)
      ? setTimeout(() => controlador.abort(), ESPERA_MAX_MS)
      : null;

    try {
      const respuesta = await fetch(url, {
        method: "POST",
        headers: {
          apikey: llave,
          Authorization: `Bearer ${llave}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(payload),
        cache: "no-store",
        keepalive,
        signal: (!keepalive && controlador) ? controlador.signal : undefined,
      });

      if (!respuesta.ok) {
        let cuerpo = "";
        try { cuerpo = (await respuesta.text()).slice(0, 300); } catch { /* da igual */ }
        const fallo = new Error(`HTTP ${respuesta.status} ${respuesta.statusText}${cuerpo ? " — " + cuerpo : ""}`);
        // 400–499 = el servidor SÍ contestó y dijo que no (permisos, datos
        // mal formados, etc.). Reintentar eso mil veces no sirve de nada y
        // solo deja al estudiante mirando el aviso azul; se corta de una.
        fallo.permanente = respuesta.status >= 400 && respuesta.status < 500 && respuesta.status !== 408 && respuesta.status !== 429;
        throw fallo;
      }
      return true;
    } catch (error) {
      if (error && error.name === "AbortError") {
        throw new Error(`La conexión tardó más de ${ESPERA_MAX_MS / 1000} s y se cortó (señal muy débil).`);
      }
      throw error;
    } finally {
      if (cronometro) clearTimeout(cronometro);
    }
  }

  async function enviarConReintentos(tabla, payload, intentos, textoProgreso) {
    let error = null;
    for (let i = 0; i < intentos; i++) {
      if (PAUSAS_MS[i]) await esperar(PAUSAS_MS[i]);
      if (textoProgreso) mostrarAviso(`${textoProgreso} (intento ${i + 1} de ${intentos})`, "proceso");
      try {
        await enviarUnaVez(tabla, payload);
        return;
      } catch (e) {
        error = e;
        ultimoError = (e && e.message) || String(e);
        console.error(`Intento de guardado ${i + 1}/${intentos}:`, e);
        // El servidor contestó y rechazó: no tiene sentido insistir.
        if (e && e.permanente) break;
      }
    }
    throw error || new Error("No se pudo guardar el intento");
  }

  // ---------------------------------------------------------
  // Barrido de fondo mientras la página siga abierta
  // ---------------------------------------------------------
  function programarBarrido() {
    if (temporizadorFondo) return;
    temporizadorFondo = setInterval(() => {
      if (!leerPendientes().length) {
        clearInterval(temporizadorFondo);
        temporizadorFondo = null;
        return;
      }
      if (navigator.onLine && !document.hidden) {
        window.reenviarIntentosPracticaPendientes(window.sbPractica);
      }
    }, REINTENTO_FONDO_MS);
  }

  // ---------------------------------------------------------
  // Diagnóstico: separa "el celular no llega a internet" de
  // "el servidor contestó y rechazó el guardado" (permisos, etc.).
  // Sin esto había que adivinar, que es justo lo que nos tenía
  // dando vueltas con el caso de Yamal.
  // ---------------------------------------------------------
  async function diagnosticar() {
    const lineas = [];
    lineas.push(`Conexión del celular: ${navigator.onLine ? "en línea" : "SIN CONEXIÓN"}`);

    const base = window.SUPABASE_URL;
    const llave = window.SUPABASE_ANON_KEY;
    if (!base || !llave) {
      lineas.push("Configuración de Supabase: FALTA en este dispositivo (¿script viejo en caché?).");
      return lineas.join("\n");
    }

    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch(`${base}/rest/v1/prueba_intentos_practica?select=id&limit=1`, {
        headers: { apikey: llave, Authorization: `Bearer ${llave}` },
        cache: "no-store",
        signal: ctrl.signal,
      });
      clearTimeout(t);
      lineas.push(`Prueba de lectura a Supabase: HTTP ${r.status} ${r.statusText}`);
      lineas.push(r.ok
        ? "→ El celular SÍ llega al servidor. El problema está en el permiso de escritura (revisar políticas de INSERT y UPDATE de la tabla)."
        : "→ El servidor contestó pero rechazó la lectura.");
    } catch (e) {
      lineas.push(`Prueba de lectura a Supabase: falló (${(e && e.message) || e})`);
      lineas.push("→ El celular NO está llegando al servidor: es la red/señal, no los permisos.");
    }
    return lineas.join("\n");
  }

  // Muestra el aviso rojo YA con el error abierto, y le agrega el
  // diagnóstico cuando termine (para que se pueda capturar en foto).
  function mostrarErrorConDetalle(mensaje) {
    mostrarAviso(mensaje, "error");
    const { detalle } = obtenerAviso();
    const cabecera = (ultimoError ? `Error: ${ultimoError}\n\n` : "") ;
    detalle.style.display = "block";
    detalle.textContent = `${cabecera}Revisando la conexión…\n\nCódigo de respaldo:\n${textoRespaldoPendientes()}`;
    ajustarEspacioParaAviso();
    diagnosticar().then((info) => {
      detalle.textContent = `${cabecera}${info}\n\nCódigo de respaldo:\n${textoRespaldoPendientes()}`;
      ajustarEspacioParaAviso();
    });
  }

  // ---------------------------------------------------------
  // API pública (la firma no cambió: sigue recibiendo sb para no
  // tener que tocar los ejercicios que ya la llaman así)
  // ---------------------------------------------------------
  window.guardarIntentoPracticaSeguro = async function (sb, tabla, payload) {
    guardarCopiaLocal(tabla, payload);
    mostrarAviso("⏳ Guardando tu calificación… No cierres esta página.", "proceso");
    try {
      await enviarConReintentos(tabla, payload, PAUSAS_MS.length, "⏳ Guardando tu calificación… No cierres esta página.");
      quitarCopiaLocal(payload);
      mostrarAviso("✅ Calificación guardada correctamente.", "ok");
      return true;
    } catch {
      mostrarErrorConDetalle(
        "⚠️ Todavía no se guardó tu nota. Queda guardada en este celular y se reintentará sola. " +
        "No borres los datos del navegador. Si sigue en rojo, copia el código de respaldo y envíaselo al profesor."
      );
      programarBarrido();
      return false;
    }
  };

  window.reenviarIntentosPracticaPendientes = async function (sb, forzado) {
    if (enviandoPendientes) return;
    const pendientes = leerPendientes();
    if (!pendientes.length) { ocultarAviso(); return; }
    if (!navigator.onLine && !forzado) {
      mostrarAviso(
        "⚠️ Tienes una calificación sin enviar y el celular está sin conexión. " +
        "Se enviará sola apenas vuelva la señal.",
        "error"
      );
      programarBarrido();
      return;
    }

    enviandoPendientes = true;
    mostrarAviso("⏳ Enviando una calificación que quedó pendiente…", "proceso");
    for (const item of pendientes) {
      try {
        await enviarConReintentos(item.tabla, item.payload, forzado ? 2 : 3, "⏳ Enviando una calificación que quedó pendiente…");
        quitarCopiaLocal(item.payload);
      } catch (error) {
        console.error("El intento sigue pendiente:", error);
      }
    }
    enviandoPendientes = false;

    if (!leerPendientes().length) {
      mostrarAviso("✅ Calificación pendiente recuperada y guardada.", "ok");
    } else {
      mostrarErrorConDetalle(
        "⚠️ Todavía no se pudo enviar tu nota desde este celular. Queda guardada aquí y se seguirá reintentando. " +
        "Si sigue en rojo, copia el código de respaldo y envíaselo al profesor."
      );
      programarBarrido();
    }
  };

  // ---------------------------------------------------------
  // Disparadores de reintento
  // ---------------------------------------------------------
  window.addEventListener("online", () => {
    window.reenviarIntentosPracticaPendientes(window.sbPractica);
  });

  // En celular, "online" muchas veces no se dispara; volver a la
  // pestaña sí es un momento confiable para reintentar.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) window.reenviarIntentosPracticaPendientes(window.sbPractica);
  });
  window.addEventListener("pageshow", () => {
    window.reenviarIntentosPracticaPendientes(window.sbPractica);
  });

  // Último cartucho: si el estudiante cierra la página o bloquea la
  // pantalla con algo pendiente, se manda con keepalive para que el
  // navegador lo termine aunque la página ya no exista.
  function despedida() {
    const pendientes = leerPendientes();
    for (const item of pendientes) {
      try { enviarUnaVez(item.tabla, item.payload, { keepalive: true }); } catch { /* nada más que hacer */ }
    }
  }
  window.addEventListener("pagehide", despedida);
  document.addEventListener("visibilitychange", () => { if (document.hidden) despedida(); });
})();
