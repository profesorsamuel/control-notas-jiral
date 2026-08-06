import { supabase } from "./supabase.js";

// =================================================
// Registro de accesos (login/logout) para estadísticas
// =================================================

const CLAVE_ID = "accesoIdActual";
const CLAVE_HEARTBEAT = "accesoHeartbeatActivo";
let intervaloHeartbeat = null;

/**
 * Llamar justo después de un login exitoso.
 * Crea la fila en "accesos" e inicia el latido (heartbeat).
 */
export async function registrarEntrada(correo, rol) {
    if (!correo) return;

    try {
        const { data, error } = await supabase
            .from("accesos")
            .insert([{ correo, rol: rol || null, user_agent: navigator.userAgent }])
            .select("id")
            .single();

        if (error) {
            console.error("❌ No se pudo registrar el acceso:", error);
            return;
        }

        if (data?.id) {
            sessionStorage.setItem(CLAVE_ID, data.id);
            iniciarHeartbeat();
        }
    } catch (e) {
        console.error("❌ Error al registrar entrada:", e);
    }
}

/**
 * Mantiene "fin" actualizado cada 30s mientras la pestaña esté abierta,
 * para poder calcular una salida aproximada aunque el usuario cierre
 * el navegador sin presionar "Salir".
 */
export function iniciarHeartbeat() {
    if (intervaloHeartbeat) return;
    if (sessionStorage.getItem(CLAVE_HEARTBEAT) === "1") return;

    sessionStorage.setItem(CLAVE_HEARTBEAT, "1");
    intervaloHeartbeat = setInterval(() => actualizarLatido(), 30000);

    window.addEventListener("beforeunload", () => {
        actualizarLatido();
    });

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") actualizarLatido();
    });
}

async function actualizarLatido() {
    const id = sessionStorage.getItem(CLAVE_ID);
    if (!id) return;

    try {
        await supabase.from("accesos").update({ fin: new Date().toISOString() }).eq("id", id);
    } catch (e) {
        // Best effort: en beforeunload puede no llegar a completarse.
    }
}

/**
 * Llamar justo ANTES de supabase.auth.signOut() en cada botón "Salir".
 */
export async function registrarSalida() {
    const id = sessionStorage.getItem(CLAVE_ID);

    if (intervaloHeartbeat) {
        clearInterval(intervaloHeartbeat);
        intervaloHeartbeat = null;
    }

    if (id) {
        try {
            await supabase.from("accesos").update({ fin: new Date().toISOString() }).eq("id", id);
        } catch (e) {
            console.error("❌ Error al registrar salida:", e);
        }
    }

    sessionStorage.removeItem(CLAVE_ID);
    sessionStorage.removeItem(CLAVE_HEARTBEAT);
}
