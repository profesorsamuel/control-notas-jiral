// Guardado resistente para ejercicios hechos desde celulares.
// Conserva una copia local antes de enviar, reintenta y vuelve a enviar
// automáticamente cuando regresa la conexión.
(function () {
  "use strict";

  const CLAVE_PENDIENTES = "jiral_intentos_practica_pendientes_v1";
  let enviandoPendientes = false;

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

  function obtenerAviso() {
    let aviso = document.getElementById("aviso-guardado-practica");
    if (aviso) return aviso;
    aviso = document.createElement("div");
    aviso.id = "aviso-guardado-practica";
    aviso.setAttribute("role", "status");
    aviso.setAttribute("aria-live", "polite");
    Object.assign(aviso.style, {
      position: "fixed", left: "12px", right: "12px", bottom: "12px",
      zIndex: "99999", maxWidth: "620px", margin: "auto", padding: "14px 16px",
      borderRadius: "12px", color: "#fff", fontWeight: "700", textAlign: "center",
      boxShadow: "0 6px 24px rgba(0,0,0,.28)", display: "none"
    });
    document.body.appendChild(aviso);
    return aviso;
  }

  function mostrarAviso(texto, tipo) {
    const aviso = obtenerAviso();
    aviso.textContent = texto;
    aviso.style.background = tipo === "ok" ? "#177245" : tipo === "error" ? "#b42318" : "#2457a7";
    aviso.style.display = "block";
    if (tipo === "ok") setTimeout(() => { aviso.style.display = "none"; }, 5000);
  }

  async function enviarUnaVez(sb, tabla, payload) {
    const peticion = sb
      .from(tabla)
      .upsert(payload, { onConflict: "codigo_examen,tipo_ejercicio,cedula" });
    const { error } = await peticion;
    if (error) throw error;
  }

  async function enviarConReintentos(sb, tabla, payload, intentos) {
    let ultimoError = null;
    const pausas = [0, 1000, 2500, 5000];
    for (let i = 0; i < intentos; i++) {
      if (pausas[i]) await esperar(pausas[i]);
      try {
        await enviarUnaVez(sb, tabla, payload);
        return;
      } catch (error) {
        ultimoError = error;
        console.error(`Intento de guardado ${i + 1}/${intentos}:`, error);
      }
    }
    throw ultimoError || new Error("No se pudo guardar el intento");
  }

  window.guardarIntentoPracticaSeguro = async function (sb, tabla, payload) {
    guardarCopiaLocal(tabla, payload);
    mostrarAviso("⏳ Guardando tu calificación… No cierres esta página.", "proceso");
    try {
      await enviarConReintentos(sb, tabla, payload, 4);
      quitarCopiaLocal(payload);
      mostrarAviso("✅ Calificación guardada correctamente.", "ok");
      return true;
    } catch (error) {
      mostrarAviso("⚠️ Aún no se guardó. No borres los datos del navegador; se reintentará al recuperar conexión.", "error");
      return false;
    }
  };

  window.reenviarIntentosPracticaPendientes = async function (sb) {
    if (enviandoPendientes || !navigator.onLine) return;
    const pendientes = leerPendientes();
    if (!pendientes.length) return;
    enviandoPendientes = true;
    mostrarAviso("⏳ Recuperando una calificación pendiente…", "proceso");
    for (const item of pendientes) {
      try {
        await enviarConReintentos(sb, item.tabla, item.payload, 2);
        quitarCopiaLocal(item.payload);
      } catch (error) {
        console.error("El intento sigue pendiente:", error);
      }
    }
    enviandoPendientes = false;
    if (!leerPendientes().length) mostrarAviso("✅ Calificación pendiente recuperada y guardada.", "ok");
  };

  window.addEventListener("online", () => {
    if (window.sbPractica) window.reenviarIntentosPracticaPendientes(window.sbPractica);
  });
})();
