// =====================================================
// campesino-platos.js
// Permite editar la columna "Plato de comida / Actividad" de la tabla
// de docentes en dia-del-campesino.html, protegido por una contraseña
// compartida (encargada: Elaisa, Miriam o Samuel). Los valores se guardan
// en Supabase (tabla campesino_platos) para que se vean igual desde
// cualquier celular o computadora.
//
// IMPORTANTE: esta contraseña es solo un filtro simple para evitar que
// cualquier visitante edite por accidente. No es seguridad robusta,
// porque el sitio es público y la llave de Supabase usada aquí es la
// llave pública (anon). Si se necesita seguridad real, habría que
// agregar inicio de sesión con Supabase Auth.
// =====================================================

import { supabase } from "./supabase.js";

const PASSWORD = "Jiral2026"; // <-- cámbiala aquí si quieres otra clave
const TABLE = "campesino_platos";

document.addEventListener("DOMContentLoaded", async () => {
  const btnEditar = document.getElementById("btn-editar-platos");
  const btnGuardar = document.getElementById("btn-guardar-platos");
  const estado = document.getElementById("platos-estado");
  const inputs = Array.from(document.querySelectorAll(".plato-input"));

  if (!btnEditar || !inputs.length) return;

  let desbloqueado = false;

  // ---------- Cargar valores guardados ----------
  async function cargarPlatos() {
    try {
      const { data, error } = await supabase.from(TABLE).select("salon, plato");
      if (error) throw error;
      const mapa = new Map((data || []).map((fila) => [fila.salon, fila.plato]));
      inputs.forEach((input) => {
        const salon = input.dataset.salon;
        if (mapa.has(salon) && mapa.get(salon)) {
          input.value = mapa.get(salon);
        }
      });
    } catch (err) {
      console.error("No se pudieron cargar los platos:", err);
    }
  }

  // ---------- Desbloquear edición ----------
  function pedirContrasena() {
    if (desbloqueado) {
      // Volver a bloquear
      desbloqueado = false;
      inputs.forEach((input) => (input.disabled = true));
      btnEditar.textContent = "🔒 Editar (encargada)";
      btnEditar.classList.remove("desbloqueado");
      btnGuardar.classList.remove("visible");
      estado.textContent = "";
      return;
    }

    const clave = window.prompt(
      "Esta sección solo la puede editar la encargada (Elaisa, Miriam o Samuel).\n\nEscribe la contraseña:"
    );
    if (clave === null) return; // canceló
    if (clave.trim() === PASSWORD) {
      desbloqueado = true;
      inputs.forEach((input) => (input.disabled = false));
      btnEditar.textContent = "🔓 Bloquear";
      btnEditar.classList.add("desbloqueado");
      btnGuardar.classList.add("visible");
      estado.textContent = "Modo edición activo: escribe el plato o actividad de cada docente y presiona Guardar.";
    } else {
      window.alert("Contraseña incorrecta.");
    }
  }

  // ---------- Guardar cambios ----------
  async function guardarPlatos() {
    estado.textContent = "Guardando...";
    const filas = inputs.map((input) => ({
      salon: input.dataset.salon,
      plato: input.value.trim(),
      updated_at: new Date().toISOString(),
    }));

    try {
      const { error } = await supabase.from(TABLE).upsert(filas, { onConflict: "salon" });
      if (error) throw error;
      estado.textContent = "✅ Cambios guardados. Ya se ven en todos los dispositivos.";
    } catch (err) {
      console.error("Error al guardar:", err);
      estado.textContent = "⚠️ No se pudo guardar. Revisa tu conexión e intenta de nuevo.";
    }
  }

  btnEditar.addEventListener("click", pedirContrasena);
  btnGuardar.addEventListener("click", guardarPlatos);

  cargarPlatos();
});
