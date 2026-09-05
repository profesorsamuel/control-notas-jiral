import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORREO_CONSEJERO = "profesorsamuelortega@gmail.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");

    if (!token) {
      return new Response(JSON.stringify({ error: "Falta el token de autorización." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Sesión inválida o expirada." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const correoQueLlama = (userData.user.email || "").toLowerCase();

    if (correoQueLlama !== CORREO_CONSEJERO) {
      return new Response(
        JSON.stringify({ error: "Solo el consejero puede cambiar el correo o la contraseña de un estudiante." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { correoActual, correoNuevo, nuevaPassword } = await req.json();

    if (!correoActual) {
      return new Response(
        JSON.stringify({ error: "Falta el dato: correoActual es obligatorio." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const nuevoCorreoLimpio = correoNuevo ? String(correoNuevo).trim().toLowerCase() : null;
    const nuevaPasswordLimpia = nuevaPassword ? String(nuevaPassword).trim() : null;

    if (!nuevoCorreoLimpio && !nuevaPasswordLimpia) {
      return new Response(
        JSON.stringify({ error: "Debes enviar al menos correoNuevo o nuevaPassword." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (nuevaPasswordLimpia && nuevaPasswordLimpia.length < 6) {
      return new Response(
        JSON.stringify({ error: "La nueva contraseña debe tener al menos 6 caracteres." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: listaUsuarios, error: listError } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (listError) {
      return new Response(JSON.stringify({ error: "Error buscando el usuario: " + listError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const usuarioEncontrado = listaUsuarios.users.find(
      (u) => (u.email || "").toLowerCase() === correoActual.toLowerCase()
    );

    if (!usuarioEncontrado) {
      return new Response(JSON.stringify({ error: "No se encontró ninguna cuenta con ese correo actual." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // -----------------------------------------------------
    // Construir el objeto de actualización solo con lo que
    // realmente se quiere cambiar (correo y/o contraseña).
    // -----------------------------------------------------
    const datosActualizar: Record<string, unknown> = {};

    if (nuevoCorreoLimpio) {
      datosActualizar.email = nuevoCorreoLimpio;
      datosActualizar.email_confirm = true;
    }

    if (nuevaPasswordLimpia) {
      datosActualizar.password = nuevaPasswordLimpia;
    }

    const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(
      usuarioEncontrado.id,
      datosActualizar
    );

    if (updateAuthError) {
      return new Response(
        JSON.stringify({ error: "Error actualizando la cuenta: " + updateAuthError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // El correo en las tablas del sistema solo se actualiza si
    // realmente cambió el correo (la contraseña no vive en estas tablas).
    if (nuevoCorreoLimpio) {
      const tablas = ["estudiantes", "notas", "datos_estudiante"];

      for (const tabla of tablas) {
        const { error: updTablaError } = await supabaseAdmin
          .from(tabla)
          .update({ correo: nuevoCorreoLimpio })
          .eq("correo", correoActual);

        if (updTablaError) {
          console.error(`Error actualizando tabla ${tabla}:`, updTablaError);
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, mensaje: "Cuenta actualizada correctamente." }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: "Error inesperado: " + error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});