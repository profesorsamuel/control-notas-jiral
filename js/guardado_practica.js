// ⚠️ ARCHIVO EN DESUSO — NO SE CARGA EN NINGUNA PÁGINA.
// El guardado real de los ejercicios lo hace js/guardar_intento_practica.js
// (ese sí está enlazado en las 3 páginas de ejercicios de la Clase 1).
// Se deja aquí solo como referencia histórica; si se edita, no pasa nada,
// porque ningún HTML lo incluye. Para evitar confusiones, cualquier cambio
// en la lógica de guardado va en js/guardar_intento_practica.js.
// =========================================================
// GUARDADO ROBUSTO DE INTENTOS DE PRÁCTICA
// C.E.B.G. EL JIRAL — usado por los 3 ejercicios de cada Clase
// (quiz, pareo de términos, pareo de fotos) en prueba_ciencias.js,
// pareo_claseN.js y fotos_claseN.js.
// =========================================================
// Por qué existe este archivo:
// Antes, cada ejercicio hacía el upsert a Supabase "a ciegas": si
// fallaba (sin señal, error del servidor, lo que sea), el error
// solo quedaba en console.error y el estudiante veía su resultado
// igual, como si todo se hubiera guardado. Así fue como se
// perdieron intentos sin que nadie —ni el estudiante ni el
// profesor— se enterara.
//
// Este módulo reemplaza ese upsert "a ciegas" por:
//   1) Reintentos automáticos con espera creciente (2s, 5s, 15s).
//   2) Si aun así falla, deja el intento guardado en localStorage
//      del propio celular (nunca se pierde) y sigue intentando
//      solo cuando el navegador detecta que volvió la conexión.
//   3) Un aviso visual en pantalla ("guardando" / "guardado" /
//      "reintentando" / "pendiente") para que nunca sea un
//      misterio si de verdad quedó guardado.
//   4) Al abrir CUALQUIERA de los 3 ejercicios, se revisa primero
//      si quedó algo pendiente de una sesión anterior (de este
//      mismo celular) y se intenta guardar de una vez.
//
// Solo se guarda UN pendiente por ejercicio (mismo criterio que ya
// usa el UNIQUE de Supabase: codigo_examen + tipo_ejercicio +
// cedula) — si el estudiante repite el ejercicio sin señal varias
// veces, el pendiente nuevo reemplaza al viejo, nunca se acumulan.
// =========================================================

(function () {
  const CLAVE_COLA = "cola_intentos_practica_pendientes";
  const ESPERAS_REINTENTO_MS = [2000, 5000, 15000]; // 2s, 5s, 15s

  function leerCola() {
    try {
      return JSON.parse(localStorage.getItem(CLAVE_COLA) || "{}");
    } catch {
      return {};
    }
  }

  function guardarCola(cola) {
    try {
      localStorage.setItem(CLAVE_COLA, JSON.stringify(cola));
    } catch {
      // Si el localStorage está lleno o bloqueado, no hay más remedio
      // que dejarlo pasar — el aviso en pantalla igual le mostrará al
      // estudiante que no se pudo guardar, para que avise al profesor.
    }
  }

  // Un pendiente por ejercicio+estudiante: si se repite, reemplaza al
  // anterior (igual que el UNIQUE de la tabla en Supabase).
  function claveDe(payload) {
    return `${payload.codigo_examen}|${payload.tipo_ejercicio}|${payload.cedula}`;
  }

  function esperar(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Un solo intento de guardado contra Supabase. true = se guardó bien.
  async function intentarUnaVez(sb, tabla, payload) {
    try {
      const { error } = await sb
        .from(tabla)
        .upsert(payload, { onConflict: "codigo_examen,tipo_ejercicio,cedula" });
      return !error;
    } catch {
      // fetch falló directo (sin señal, DNS, etc.) — cuenta como fallo.
      return false;
    }
  }

  let escuchandoOnline = false;
  function asegurarEscuchaOnline(sb) {
    if (escuchandoOnline) return;
    escuchandoOnline = true;
    window.addEventListener("online", () => reintentarPendientes(sb));
  }

  // ---------------------------------------------------------
  // Punto de entrada principal: llamar esto en vez de hacer el
  // upsert directo al terminar un ejercicio.
  //   sb      -> cliente de Supabase ya creado
  //   tabla   -> normalmente T.intentosPractica ("prueba_intentos_practica")
  //   payload -> el mismo objeto que ya se armaba antes del upsert
  //   onEstado(estado) -> se llama con:
  //     "guardando" | "reintentando" | "guardado" | "pendiente"
  // No hay que esperar (await) esta función para mostrar el
  // resultado en pantalla — los reintentos pueden tardar hasta ~20s
  // y el estudiante no debe quedarse viendo una pantalla en blanco.
  // ---------------------------------------------------------
  async function guardarIntento(sb, tabla, payload, onEstado) {
    const notificar = (estado) => { if (typeof onEstado === "function") onEstado(estado); };
    notificar("guardando");

    for (let intento = 0; intento <= ESPERAS_REINTENTO_MS.length; intento++) {
      const ok = await intentarUnaVez(sb, tabla, payload);
      if (ok) {
        const cola = leerCola();
        delete cola[claveDe(payload)];
        guardarCola(cola);
        notificar("guardado");
        return true;
      }
      if (intento < ESPERAS_REINTENTO_MS.length) {
        notificar("reintentando");
        await esperar(ESPERAS_REINTENTO_MS[intento]);
      }
    }

    // Se agotaron los reintentos automáticos: queda pendiente en este
    // celular y se reintentará solo cuando vuelva la señal, o la
    // próxima vez que el estudiante abra cualquiera de los 3 ejercicios.
    const cola = leerCola();
    cola[claveDe(payload)] = { tabla, payload, guardadoEn: Date.now() };
    guardarCola(cola);
    notificar("pendiente");
    asegurarEscuchaOnline(sb);
    return false;
  }

  // ---------------------------------------------------------
  // Reintento manual inmediato (para el botón "Reintentar ahora").
  // A diferencia de guardarIntento(), NO espera entre reintentos:
  // es un solo intento ya, porque lo pidió el estudiante a propósito.
  // ---------------------------------------------------------
  async function reintentarAhora(sb, tabla, payload, onEstado) {
    const notificar = (estado) => { if (typeof onEstado === "function") onEstado(estado); };
    notificar("reintentando");
    const ok = await intentarUnaVez(sb, tabla, payload);
    if (ok) {
      const cola = leerCola();
      delete cola[claveDe(payload)];
      guardarCola(cola);
      notificar("guardado");
    } else {
      notificar("pendiente");
    }
    return ok;
  }

  // ---------------------------------------------------------
  // Revisa si quedó algo pendiente en este celular (de cualquier
  // ejercicio, de una sesión anterior) e intenta guardarlo ahora.
  // Se llama sola al reconectar (evento "online"), y conviene
  // llamarla también al abrir cualquiera de los 3 ejercicios.
  // ---------------------------------------------------------
  async function reintentarPendientes(sb) {
    const cola = leerCola();
    const claves = Object.keys(cola);
    for (const clave of claves) {
      const { tabla, payload } = cola[clave];
      const ok = await intentarUnaVez(sb, tabla, payload);
      if (ok) {
        delete cola[clave];
        guardarCola(cola);
      }
    }
  }

  function hayPendientes() {
    return Object.keys(leerCola()).length > 0;
  }

  window.GuardadoPractica = {
    guardarIntento,
    reintentarAhora,
    reintentarPendientes,
    hayPendientes,
  };
})();
