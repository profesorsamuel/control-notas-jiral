// =====================================================
// campesino-platos.js
// Permite editar las columnas "Plato de comida / Actividad" y
// "Color a traer" de la tabla de docentes en dia-del-campesino.html,
// protegido por una contraseña individual (Elaisa, Miriam o Samuel).
// Los valores se guardan en Supabase (tabla campesino_platos) para que
// se vean igual desde cualquier celular o computadora.
//
// IMPORTANTE: esta contraseña es solo un filtro simple para evitar que
// cualquier visitante edite por accidente. No es seguridad robusta,
// porque el sitio es público y la llave de Supabase usada aquí es la
// llave pública (anon). Si se necesita seguridad real, habría que
// agregar inicio de sesión con Supabase Auth.
// =====================================================

import { supabase } from "./supabase.js";

// Cada encargada/o tiene su propia contraseña.
// Cámbialas aquí si quieres otras claves.
const PASSWORDS = {
  eo: "Elaisa Jaramillo",
  ma: "Miriam Valencia",
  sa: "Samuel Ortega",
};
const TABLE = "campesino_platos";

document.addEventListener("DOMContentLoaded", async () => {
  const btnEditar = document.getElementById("btn-editar-platos");
  const btnGuardar = document.getElementById("btn-guardar-platos");
  const estado = document.getElementById("platos-estado");
  const inputsPlato = Array.from(document.querySelectorAll(".plato-input"));
  const inputsColor = Array.from(document.querySelectorAll(".color-input"));
  const inputs = [...inputsPlato, ...inputsColor];

  if (!btnEditar || !inputs.length) return;

  let desbloqueado = false;

  // ---------- Cargar valores guardados ----------
  async function cargarPlatos() {
    try {
      const { data, error } = await supabase.from(TABLE).select("salon, plato, color");
      if (error) throw error;
      const mapaPlato = new Map((data || []).map((fila) => [fila.salon, fila.plato]));
      const mapaColor = new Map((data || []).map((fila) => [fila.salon, fila.color]));
      inputsPlato.forEach((input) => {
        const salon = input.dataset.salon;
        if (mapaPlato.has(salon) && mapaPlato.get(salon)) {
          input.value = mapaPlato.get(salon);
        }
      });
      inputsColor.forEach((input) => {
        const salon = input.dataset.salon;
        if (mapaColor.has(salon) && mapaColor.get(salon)) {
          input.value = mapaColor.get(salon);
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
      "Esta sección solo la puede editar la encargada (Elaisa, Miriam o Samuel).\n\nEscribe tu contraseña:"
    );
    if (clave === null) return; // canceló
    const clavePlana = clave.trim().toLowerCase();
    const nombre = PASSWORDS[clavePlana];
    if (nombre) {
      desbloqueado = true;
      inputs.forEach((input) => (input.disabled = false));
      btnEditar.textContent = "🔓 Bloquear";
      btnEditar.classList.add("desbloqueado");
      btnGuardar.classList.add("visible");
      estado.textContent = `Modo edición activo (${nombre}): escribe el plato/actividad y el color de cada docente y presiona Guardar.`;
    } else {
      window.alert("Contraseña incorrecta.");
    }
  }

  // ---------- Guardar cambios ----------
  async function guardarPlatos() {
    estado.textContent = "Guardando...";
    const filas = inputsPlato.map((input) => {
      const salon = input.dataset.salon;
      const colorInput = inputsColor.find((c) => c.dataset.salon === salon);
      return {
        salon,
        plato: input.value.trim(),
        color: colorInput ? colorInput.value.trim() : "",
        updated_at: new Date().toISOString(),
      };
    });

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
