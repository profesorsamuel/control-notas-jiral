// =========================================================
// Panel del docente — Examen de Recuperación Ciencias Naturales 9°
// =========================================================

const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
const CONFIG = window.PRUEBA_CONFIG;
const T = CONFIG.tablas;

const REFRESCO_MS = 8000;
const CONECTADO_ACTIVO_SEG = 120; // si "ultima_actividad" es más vieja que esto, se considera desconectado

let tabActual = "conectados";
let cacheEstudiantes = [];
let cacheSesiones = [];
let cacheEventos = [];

// ---------- Acceso ----------
document.getElementById("btn-admin-entrar").addEventListener("click", entrar);
document.getElementById("admin-clave").addEventListener("keydown", (e) => { if (e.key === "Enter") entrar(); });

function entrar() {
  const clave = document.getElementById("admin-clave").value;
  if (clave !== CONFIG.claveAdmin) {
    document.getElementById("admin-login-error").hidden = false;
    return;
  }
  document.getElementById("admin-login").hidden = true;
  document.getElementById("admin-panel").hidden = false;
  document.getElementById("admin-titulo-examen").textContent = CONFIG.tituloExamen;
  cargarTodo();
  setInterval(cargarTodo, REFRESCO_MS);
}

// ---------- Tabs ----------
document.querySelectorAll(".admin-tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".admin-tab-btn").forEach((b) => b.classList.remove("activo"));
    btn.classList.add("activo");
    tabActual = btn.dataset.tab;
    renderTabla();
  });
});

// ---------- Carga de datos ----------
async function cargarTodo() {
  const [{ data: estudiantes }, { data: sesiones }, { data: eventos }] = await Promise.all([
    sb.from("estudiantes").select("id, nombre, salon, cedula").in("salon", CONFIG.salones),
    sb.from(T.sesiones).select("*").eq("codigo_examen", CONFIG.codigoExamen).eq("modo", "oficial"),
    sb.from(T.eventos).select("*").eq("codigo_examen", CONFIG.codigoExamen).order("creado_at", { ascending: false }).limit(50),
  ]);

  cacheEstudiantes = estudiantes || [];
  cacheSesiones = sesiones || [];
  cacheEventos = eventos || [];

  renderResumen();
  renderAlertas();
  renderRanking();
  renderTabla();
  document.getElementById("admin-actualizado").textContent = `Actualizado: ${new Date().toLocaleTimeString("es-PA")}`;
}

function sesionDe(cedula) {
  return cacheSesiones.find((s) => s.cedula === cedula.trim().toLowerCase().replace(/[\s-]/g, ""));
}
function estaConectadoAhora(sesion) {
  if (!sesion || sesion.estado !== "en_progreso") return false;
  const ultima = new Date(sesion.ultima_actividad || sesion.iniciado_at);
  return (Date.now() - ultima.getTime()) / 1000 < CONECTADO_ACTIVO_SEG;
}

// ---------- Resumen ----------
function renderResumen() {
  const total = cacheEstudiantes.length;
  const finalizados = cacheSesiones.filter((s) => s.estado === "finalizado").length;
  const conectados = cacheSesiones.filter((s) => estaConectadoAhora(s)).length;
  const conCedulaEnSesion = new Set(cacheSesiones.map((s) => s.cedula));
  const ausentes = cacheEstudiantes.filter((e) => !conCedulaEnSesion.has((e.cedula || "").trim().toLowerCase().replace(/[\s-]/g, ""))).length;

  document.getElementById("st-total").textContent = total;
  document.getElementById("st-conectados").textContent = conectados;
  document.getElementById("st-finalizados").textContent = finalizados;
  document.getElementById("st-ausentes").textContent = ausentes;
}

// ---------- Alertas ----------
function renderAlertas() {
  const wrap = document.getElementById("admin-alertas-wrap");
  const lista = document.getElementById("admin-alertas-lista");
  const alertas = [];

  // Eventos registrados (cambios de pestaña, inactividad)
  cacheEventos.slice(0, 15).forEach((ev) => {
    alertas.push({
      texto: ev.tipo === "cambio_pestana" ? "Cambio de pestaña detectado" : "Inactividad prolongada",
      detalle: `${ev.detalle || ""} · ${new Date(ev.creado_at).toLocaleTimeString("es-PA")}`,
    });
  });

  // IPs duplicadas entre distintos estudiantes
  const porIp = {};
  cacheSesiones.forEach((s) => { if (s.ip) { (porIp[s.ip] = porIp[s.ip] || []).push(s.nombre); } });
  Object.entries(porIp).forEach(([ip, nombres]) => {
    const unicos = [...new Set(nombres)];
    if (unicos.length > 1) {
      alertas.push({
        texto: `Misma IP usada por ${unicos.length} estudiantes`,
        detalle: `${unicos.join(", ")} — IP: ${ip} (puede ser normal si comparten la red de la escuela)`,
      });
    }
  });

  if (alertas.length === 0) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  lista.innerHTML = alertas.map((a) => `
    <div class="alerta-item"><b>${a.texto}</b><small>${a.detalle}</small></div>
  `).join("");
}

// ---------- Ranking por salón ----------
function renderRanking() {
  const cont = document.getElementById("admin-ranking");
  const porSalon = {};
  CONFIG.salones.forEach((s) => (porSalon[s] = []));
  cacheSesiones.filter((s) => s.estado === "finalizado").forEach((s) => {
    if (!porSalon[s.salon]) porSalon[s.salon] = [];
    porSalon[s.salon].push(s.nota_meduca);
  });
  cont.innerHTML = Object.entries(porSalon).map(([salon, notas]) => {
    const prom = notas.length ? (notas.reduce((a, b) => a + b, 0) / notas.length).toFixed(2) : "—";
    return `<div class="ranking-item"><b>${prom}</b><span>${salon.replace(/(\d+)([A-Z])/, "$1°$2")} (${notas.length} finalizados)</span></div>`;
  }).join("");
}

// ---------- Tabla principal ----------
function renderTabla() {
  const head = document.getElementById("admin-tabla-head");
  const body = document.getElementById("admin-tabla-body");
  const vacio = document.getElementById("admin-tabla-vacio");

  let filas = [];
  let columnas = [];

  if (tabActual === "conectados") {
    columnas = ["Nombre", "Salón", "Ingreso", "Pregunta actual", "Estado"];
    filas = cacheSesiones.filter((s) => estaConectadoAhora(s)).map((s) => [
      s.nombre, s.salon.replace(/(\d+)([A-Z])/, "$1°$2"),
      new Date(s.iniciado_at).toLocaleTimeString("es-PA"),
      `${(s.pregunta_actual || 0) + 1} / ${CONFIG.preguntasExamenOficial}`,
      "🟢 Activo",
    ].map(String).concat([s.id]));
  } else if (tabActual === "finalizados") {
    columnas = ["Nombre", "Salón", "Correctas", "%", "Nota", "Tiempo"];
    filas = cacheSesiones.filter((s) => s.estado === "finalizado").map((s) => [
      s.nombre, s.salon.replace(/(\d+)([A-Z])/, "$1°$2"),
      `${s.correctas}/${s.correctas + s.incorrectas}`, `${s.porcentaje}%`, s.nota_meduca,
      formatoSeg(s.tiempo_total_seg),
    ].map(String).concat([s.id]));
  } else {
    columnas = ["Nombre", "Salón"];
    const conCedula = new Set(cacheSesiones.map((s) => s.cedula));
    filas = cacheEstudiantes.filter((e) => !conCedula.has((e.cedula || "").trim().toLowerCase().replace(/[\s-]/g, "")))
      .map((e) => [e.nombre, e.salon.replace(/(\d+)([A-Z])/, "$1°$2")].map(String).concat([null]));
  }

  head.innerHTML = columnas.map((c) => `<th>${c}</th>`).join("");
  vacio.hidden = filas.length > 0;
  body.innerHTML = filas.map((f) => {
    const id = f[f.length - 1];
    const celdas = f.slice(0, -1);
    return `<tr data-id="${id || ""}">${celdas.map((c) => `<td>${c}</td>`).join("")}</tr>`;
  }).join("");

  body.querySelectorAll("tr").forEach((tr) => {
    if (!tr.dataset.id) return;
    tr.addEventListener("click", () => abrirDetalle(tr.dataset.id));
  });
}

function formatoSeg(s) {
  if (!s && s !== 0) return "—";
  const m = Math.floor(s / 60), r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

// ---------- Modal de seguimiento individual ----------
function abrirDetalle(sesionId) {
  const s = cacheSesiones.find((x) => x.id === sesionId);
  if (!s) return;
  const modal = document.getElementById("admin-modal");
  const cont = document.getElementById("admin-modal-contenido");
  const respondidas = (s.respuestas || []).length;
  cont.innerHTML = `
    <h2>${s.nombre}</h2>
    <dl>
      <dt>Salón</dt><dd>${s.salon.replace(/(\d+)([A-Z])/, "$1°$2")}</dd>
      <dt>Estado</dt><dd>${s.estado}</dd>
      <dt>Hora de ingreso</dt><dd>${new Date(s.iniciado_at).toLocaleString("es-PA")}</dd>
      ${s.finalizado_at ? `<dt>Hora de finalización</dt><dd>${new Date(s.finalizado_at).toLocaleString("es-PA")}</dd>` : ""}
      <dt>Dirección IP</dt><dd>${s.ip || "No disponible"}</dd>
      <dt>Dispositivo</dt><dd style="word-break:break-word">${s.dispositivo || "No disponible"}</dd>
      <dt>Progreso</dt><dd>${respondidas} / ${CONFIG.preguntasExamenOficial} preguntas respondidas</dd>
      <dt>Cambios de pestaña detectados</dt><dd>${cacheEventos.filter((e) => e.sesion_id === s.id && e.tipo === "cambio_pestana").length}</dd>
      ${s.estado === "finalizado" ? `<dt>Resultado</dt><dd>${s.correctas}/${s.correctas + s.incorrectas} correctas · ${s.porcentaje}% · Nota MEDUCA ${s.nota_meduca}</dd>` : ""}
    </dl>
  `;
  modal.hidden = false;
}
document.getElementById("admin-modal-cerrar").addEventListener("click", () => { document.getElementById("admin-modal").hidden = true; });
document.getElementById("admin-modal").addEventListener("click", (e) => { if (e.target.id === "admin-modal") e.currentTarget.hidden = true; });

// ---------- Exportación ----------
function filasResultadosCompletos() {
  return cacheSesiones.filter((s) => s.estado === "finalizado").map((s) => ({
    Nombre: s.nombre, Salon: s.salon, Correctas: s.correctas, Incorrectas: s.incorrectas,
    Porcentaje: s.porcentaje, "Nota MEDUCA": s.nota_meduca, "Tiempo (seg)": s.tiempo_total_seg,
    "Fecha finalizacion": s.finalizado_at ? new Date(s.finalizado_at).toLocaleString("es-PA") : "",
  }));
}

document.getElementById("btn-exportar-excel").addEventListener("click", () => {
  const datos = filasResultadosCompletos();
  if (datos.length === 0) { alert("Todavía no hay resultados finalizados para exportar."); return; }
  const ws = XLSX.utils.json_to_sheet(datos);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Resultados");

  const ausentesWs = XLSX.utils.json_to_sheet(
    (() => {
      const conCedula = new Set(cacheSesiones.map((s) => s.cedula));
      return cacheEstudiantes
        .filter((e) => !conCedula.has((e.cedula || "").trim().toLowerCase().replace(/[\s-]/g, "")))
        .map((e) => ({ Nombre: e.nombre, Salon: e.salon }));
    })()
  );
  XLSX.utils.book_append_sheet(wb, ausentesWs, "Ausentes");

  XLSX.writeFile(wb, `resultados_${CONFIG.codigoExamen}.xlsx`);
});

document.getElementById("btn-exportar-pdf").addEventListener("click", () => {
  const datos = filasResultadosCompletos();
  if (datos.length === 0) { alert("Todavía no hay resultados finalizados para exportar."); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text(CONFIG.tituloExamen, 14, 16);
  doc.setFontSize(10);
  doc.text(CONFIG.escuela, 14, 22);
  doc.autoTable({
    startY: 28,
    head: [["Nombre", "Salón", "Correctas", "Incorrectas", "%", "Nota", "Tiempo"]],
    body: datos.map((d) => [d.Nombre, d.Salon, d.Correctas, d.Incorrectas, `${d.Porcentaje}%`, d["Nota MEDUCA"], formatoSeg(d["Tiempo (seg)"])]),
    styles: { fontSize: 9 },
  });
  doc.save(`resultados_${CONFIG.codigoExamen}.pdf`);
});
