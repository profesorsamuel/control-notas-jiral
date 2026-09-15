// Rastreador aislado para el panel "Tareas de práctica en casa".
// No modifica ni reemplaza el guardado de notas de los ejercicios.
(function () {
  "use strict";

  const INTERVALO_MS = 20000;
  let cliente = null;
  let activo = false;
  let iniciadoAt = null;
  let latido = null;
  let revisionPendiente = false;

  function visible(elemento) {
    if (!elemento || elemento.hidden) return false;
    return getComputedStyle(elemento).display !== "none";
  }

  function contexto() {
    const config = window.PRUEBA_CONFIG || null;
    if (config && config.codigoExamen) {
      let tipo = "quiz";
      let ejercicio = document.getElementById("vista-quiz");
      let resultado = document.getElementById("vista-resultado");

      if (document.getElementById("vista-ejercicio-pareo")) {
        tipo = "pareo";
        ejercicio = document.getElementById("vista-ejercicio-pareo");
        resultado = document.getElementById("vista-resultado-pareo");
      } else if (document.getElementById("vista-ejercicio-fotos")) {
        tipo = "fotos";
        ejercicio = document.getElementById("vista-ejercicio-fotos");
        resultado = document.getElementById("vista-resultado-fotos");
      }

      return {
        codigo: config.codigoExamen,
        tipo,
        ejercicio,
        resultado,
        claveEstudiante: `examen_${config.codigoExamen}`,
        salonPredeterminado: null,
        esPractica: () => tipo !== "quiz" ||
          /práctica|practica/i.test(document.getElementById("quiz-modo-label")?.textContent || ""),
      };
    }

    if (/ejercicios_ciencias_8\.html$/i.test(location.pathname)) {
      const parametros = new URLSearchParams(location.search);
      const clase = Math.min(4, Math.max(1, Number(parametros.get("clase")) || 1));
      const tipoUrl = parametros.get("tipo");
      const tipo = tipoUrl === "pareo" ? "pareo" : tipoUrl === "fotos" ? "fotos" : "quiz";
      const codigo = `cn8a-clase${clase}-2026`;
      return {
        codigo,
        tipo,
        ejercicio: document.getElementById("exercise"),
        resultado: document.getElementById("result"),
        claveEstudiante: `practice_${codigo}`,
        salonPredeterminado: "8A",
        esPractica: () => true,
      };
    }

    return null;
  }

  function estudianteActual(ctx) {
    try {
      const dato = JSON.parse(localStorage.getItem(ctx.claveEstudiante) || "null");
      if (!dato) return null;
      const cedula = String(dato.cedula || dato.idcard || "").trim();
      const nombre = String(dato.nombre || dato.name || "").trim();
      const salon = String(dato.salon || ctx.salonPredeterminado || "").trim();
      if (!cedula || !nombre || !salon) return null;
      return { cedula, nombre, salon };
    } catch {
      return null;
    }
  }

  function obtenerCliente() {
    if (cliente) return cliente;
    if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) return null;
    cliente = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    return cliente;
  }

  async function avisar(estado) {
    const ctx = contexto();
    const estudiante = ctx && estudianteActual(ctx);
    const sb = obtenerCliente();
    if (!ctx || !estudiante || !sb) return;

    const { error } = await sb.rpc("registrar_presencia_practica", {
      p_codigo_examen: ctx.codigo,
      p_tipo_ejercicio: ctx.tipo,
      p_cedula: estudiante.cedula,
      p_nombre: estudiante.nombre,
      p_salon: estudiante.salon,
      p_estado: estado,
      p_iniciado_at: iniciadoAt,
    });
    if (error) console.warn("El aviso de presencia no pudo enviarse; la nota no se afecta.", error.message);
  }

  function iniciar() {
    if (activo) return;
    activo = true;
    iniciadoAt = new Date().toISOString();
    avisar("en_progreso");
    clearInterval(latido);
    latido = setInterval(() => { if (activo) avisar("en_progreso"); }, INTERVALO_MS);
  }

  function finalizar() {
    if (!activo) return;
    activo = false;
    clearInterval(latido);
    latido = null;
    avisar("finalizado");
  }

  function revisar() {
    revisionPendiente = false;
    const ctx = contexto();
    if (!ctx) return;
    if (activo && visible(ctx.resultado)) {
      finalizar();
      return;
    }
    if (!activo && visible(ctx.ejercicio) && ctx.esPractica()) iniciar();
  }

  function programarRevision() {
    if (revisionPendiente) return;
    revisionPendiente = true;
    setTimeout(revisar, 0);
  }

  function arrancar() {
    revisar();
    const observador = new MutationObserver(programarRevision);
    observador.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden", "style", "class"],
    });
    document.addEventListener("click", programarRevision, true);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) programarRevision();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", arrancar, { once: true });
  } else {
    arrancar();
  }
})();
