import { supabase } from "./supabase.js";

// =========================================================
// Se importa desde estudiante.html (además de estudiante.js,
// sin tocarlo). Pone una insignia con el número de tareas
// vencidas o próximas a vencer sobre el botón "📝 Mis tareas"
// del panel principal, para que el estudiante lo vea apenas
// entra, sin tener que abrir la sección de tareas.
// =========================================================

const DIAS_AVISO_PROXIMA = 2;

async function actualizarInsigniaTareas() {
    const enlace = document.getElementById("enlaceMisTareas");
    if (!enlace) return;

    const { data: { user }, error: errUser } = await supabase.auth.getUser();
    if (errUser || !user) return;

    const correo = (user.email || "").trim().toLowerCase();
    const { data: estudiante } = await supabase
        .from("estudiantes")
        .select("id")
        .eq("correo", correo)
        .maybeSingle();

    if (!estudiante?.id) return;

    const { data: asignaciones, error: errAsig } = await supabase
        .from("task_assignments")
        .select("task_id, estado")
        .eq("estudiante_id", estudiante.id)
        .neq("estado", "terminada");

    if (errAsig || !asignaciones || asignaciones.length === 0) return;

    const idsTareas = asignaciones.map(a => a.task_id);
    const { data: tareas, error: errTareas } = await supabase
        .from("tasks")
        .select("id, fecha_entrega")
        .in("id", idsTareas);

    if (errTareas || !tareas) return;

    const hoy = new Date().toISOString().slice(0, 10);
    const limite = new Date();
    limite.setDate(limite.getDate() + DIAS_AVISO_PROXIMA);
    const fechaLimite = limite.toISOString().slice(0, 10);

    const pendientesUrgentes = tareas.filter(t => t.fecha_entrega && t.fecha_entrega <= fechaLimite);
    if (pendientesUrgentes.length === 0) return;

    const vencidas = pendientesUrgentes.filter(t => t.fecha_entrega < hoy).length;

    const insignia = document.createElement("span");
    insignia.textContent = pendientesUrgentes.length;
    insignia.style.cssText = `
        display:inline-block; min-width:18px; margin-left:6px; padding:1px 6px;
        border-radius:999px; font-size:.72rem; font-weight:bold; color:#fff;
        background:${vencidas > 0 ? "#dc2626" : "#f59e0b"};
    `;
    enlace.appendChild(insignia);
}

actualizarInsigniaTareas();
