import { supabase } from "./supabase.js";

// Este archivo había sido reemplazado por HTML y bloqueaba todo el panel.
const $ = (id) => document.getElementById(id);
const ui = {
  usuario: $("usuario"), nombre: $("nombreEstudiante"), salon: $("salonEstudiante"),
  materias: $("materias"), trimestre: $("filtroTrimestre"), aviso: $("avisoSoloLectura"),
  guardar: $("btnGuardarTodo"), salir: $("btnSalir"), jpg: $("btnJpg"), pdf: $("btnPdf"),
  apr: $("btnToggleApreciacion"), eje: $("btnToggleEjercicio"), toast: $("toast")
};
const TIPOS = ["apreciacion", "ejercicio", "examen"];
const ETIQUETAS = { apreciacion: "Apreciación", ejercicio: "Ejercicio", examen: "Examen" };
const MATERIAS = ["Español", "Matemática", "Ciencias Naturales", "Inglés", "Expresión Artística", "Música", "Educación Física", "Familia y Desarrollo Comunitario", "Historia", "Educación Agropecuaria", "Contabilidad", "Geografía", "Orientación", "Cívica", "Religión, Moral y Valores"];
let usuario, estudiante, notas = [], trimestreActivo = "Trimestre 1";
let ocultarApr = false, ocultarEje = false;
const cambios = new Map();

function esc(valor) {
  const d = document.createElement("div"); d.textContent = valor == null ? "" : String(valor); return d.innerHTML;
}
function toast(texto, error = false) {
  ui.toast.textContent = texto; ui.toast.style.background = error ? "#b91c1c" : "#0f172a";
  ui.toast.classList.add("visible"); clearTimeout(toast.t);
  toast.t = setTimeout(() => ui.toast.classList.remove("visible"), 3500);
}
function promedio(valores) {
  const v = valores.map(Number).filter(Number.isFinite);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
function notasDe(materia, tipo) {
  return notas.filter(n => n.materia === materia && n.tipo === tipo).sort((a, b) => Number(a.numero) - Number(b.numero));
}
function materiasVisibles() {
  const base = estudiante?.salon === "8A" ? MATERIAS.map(m => m === "Contabilidad" ? "Informática" : m) : MATERIAS;
  return [...new Set([...base, ...notas.map(n => n.materia).filter(Boolean)])];
}

async function cargarPerfil() {
  const { data: auth, error } = await supabase.auth.getUser();
  usuario = auth?.user;
  if (error || !usuario) { location.replace("login.html"); return false; }
  const r = await supabase.from("estudiantes").select("id,codigo,nombre,salon,correo").eq("correo", usuario.email).maybeSingle();
  if (r.error || !r.data) {
    ui.usuario.textContent = "Esta cuenta no está vinculada con un estudiante.";
    ui.nombre.textContent = "Perfil no disponible"; ui.guardar.disabled = true;
    ui.materias.innerHTML = '<p style="color:#b91c1c">Avisa al administrador para que vincule la cuenta con el estudiante correcto.</p>';
    return false;
  }
  estudiante = r.data; ui.usuario.textContent = `Sesión iniciada: ${usuario.email}`;
  ui.nombre.textContent = estudiante.nombre || "Estudiante";
  ui.salon.textContent = estudiante.salon ? `Salón: ${estudiante.salon}` : "";
  return true;
}
async function cargarConfiguracion() {
  const { data } = await supabase.from("configuracion").select("trimestre_activo").eq("id", 1).maybeSingle();
  if (data?.trimestre_activo) trimestreActivo = data.trimestre_activo;
  ui.trimestre.value = trimestreActivo;
}
async function cargarNotas() {
  const columnas = "id,estudiante_id,correo,materia,tipo,numero,nota,tema,origen,estado";
  const trimestre = ui.trimestre.value;
  const resultados = await Promise.all([
    supabase.from("notas").select(columnas).eq("estudiante_id", estudiante.id).eq("trimestre", trimestre).is("eliminado_en", null),
    supabase.from("notas").select(columnas).is("estudiante_id", null).eq("correo", usuario.email).eq("trimestre", trimestre).is("eliminado_en", null)
  ]);
  const fallo = resultados.find(r => r.error); if (fallo) throw fallo.error;
  const unicas = new Map(); resultados.flatMap(r => r.data || []).forEach(n => unicas.set(n.id, n));
  notas = [...unicas.values()]; cambios.clear();
}

function render() {
  const editable = ui.trimestre.value === trimestreActivo;
  ui.aviso.style.display = editable ? "none" : "inline-block"; ui.guardar.disabled = !editable;
  ui.materias.innerHTML = materiasVisibles().map(materia => {
    const grupos = Object.fromEntries(TIPOS.map(t => [t, notasDe(materia, t)]));
    const max = Math.max(1, ...TIPOS.map(t => grupos[t].length));
    const cabecera = Array.from({length:max}, (_, i) => `<th>N.º ${i + 1}</th>`).join("");
    const filas = TIPOS.filter(t => !(t === "apreciacion" && ocultarApr) && !(t === "ejercicio" && ocultarEje)).map(tipo => {
      const lista = grupos[tipo];
      const celdas = Array.from({length:max}, (_, i) => {
        const n = lista[i]; if (!n) return '<td class="celda-vacia">—</td>';
        const valor = n.estado === "Intencional" ? 0 : n.nota;
        const bloqueada = !editable || n.origen === "profesor";
        return `<td><div class="celda-nota ${bloqueada ? "solo-lectura" : ""}"><input type="number" min="1" max="5" step="0.1" value="${esc(valor)}" ${bloqueada ? "disabled" : ""} data-id="${esc(n.id)}">${n.tema ? `<small title="${esc(n.tema)}">${esc(n.tema)}</small>` : ""}</div></td>`;
      }).join("");
      const p = promedio(lista.map(n => n.estado === "Intencional" ? 0 : n.nota));
      return `<tr><td><strong>${ETIQUETAS[tipo]}</strong></td>${celdas}<td class="celda-promedio">${p == null ? "—" : p.toFixed(1)}</td></tr>`;
    }).join("");
    const ps = TIPOS.map(t => promedio(grupos[t].map(n => n.estado === "Intencional" ? 0 : n.nota))).filter(v => v != null);
    const final = promedio(ps);
    const botones = editable ? `<div class="fila-botones-materia">
      <button class="btn-agregar-col" data-agregar="apreciacion" data-materia="${esc(materia)}">+ Apreciación</button>
      <button class="btn-agregar-col" data-agregar="ejercicio" data-materia="${esc(materia)}">+ Ejercicio</button>
      <button class="btn-agregar-col" data-agregar="examen" data-materia="${esc(materia)}">+ Examen</button>
    </div>` : "";
    return `<section class="materia-card"><h2>${esc(materia)}</h2><div class="tabla-contenedor"><table class="tabla-notas"><thead><tr><th>Tipo</th>${cabecera}<th>Promedio</th></tr></thead><tbody>${filas}</tbody></table></div><p><strong>Promedio actual:</strong> ${final == null ? "—" : final.toFixed(1)}</p>${botones}</section>`;
  }).join("");
  ui.materias.querySelectorAll('input[type="number"]:not(:disabled)').forEach(input => input.addEventListener("input", () => {
    const valor = Number(input.value);
    input.setCustomValidity(input.value !== "" && (!Number.isFinite(valor) || valor < 1 || valor > 5) ? "La nota debe estar entre 1.0 y 5.0" : "");
    cambios.set(input.dataset.id, { input, valor: input.value === "" ? null : valor });
  }));
  ui.materias.querySelectorAll("[data-agregar]").forEach(boton => boton.addEventListener("click", () => agregarNota(boton.dataset.materia, boton.dataset.agregar)));
}

async function agregarNota(materia, tipo) {
  const entrada = prompt(`Escribe la nota de ${ETIQUETAS[tipo]} (de 1.0 a 5.0):`);
  if (entrada === null) return;
  const valor = Number(String(entrada).replace(",", "."));
  if (!Number.isFinite(valor) || valor < 1 || valor > 5) return toast("La nota debe estar entre 1.0 y 5.0.", true);
  const tema = prompt("Tema o actividad (opcional):", "")?.trim() || null;
  const numero = Math.max(0, ...notasDe(materia, tipo).map(n => Number(n.numero) || 0)) + 1;
  const fila = {
    correo: usuario.email, estudiante_id: estudiante.id, materia, tipo, numero,
    tema, actividad: tema || `${ETIQUETAS[tipo]} ${numero}`,
    fecha: new Date().toISOString().slice(0, 10), nota: valor,
    observacion: "Agregada por el estudiante", trimestre: ui.trimestre.value,
    estado: "Activa", origen: "estudiante"
  };
  const { error } = await supabase.from("notas").insert([fila]);
  if (error) return toast(`No se pudo agregar la nota: ${error.message}`, true);
  toast("Nota agregada correctamente."); await cargarNotas(); render();
}

async function guardar() {
  if (!cambios.size) return toast("No hay cambios pendientes.");
  if (ui.trimestre.value !== trimestreActivo) return toast("Ese trimestre es solo de consulta.", true);
  const lista = [...cambios.values()]; if (lista.some(x => !x.input.reportValidity())) return;
  ui.guardar.disabled = true; ui.guardar.textContent = "Guardando…"; let fallos = 0;
  for (const item of lista) {
    const { error } = await supabase.from("notas").update({nota:item.valor, fecha:new Date().toISOString().slice(0,10), origen:"estudiante"}).eq("id", item.input.dataset.id);
    if (error) { fallos++; item.input.style.borderColor = "#dc2626"; }
  }
  ui.guardar.disabled = false; ui.guardar.textContent = "💾 Guardar todos los cambios";
  if (fallos) toast(`No se pudieron guardar ${fallos} cambio(s).`, true);
  else { toast("Cambios guardados correctamente."); await cargarNotas(); render(); }
}
async function jpg() {
  if (!window.html2canvas) return toast("No se pudo cargar la herramienta de imagen.", true);
  const canvas = await window.html2canvas(ui.materias, {scale:2, backgroundColor:"#f5f7fa"});
  const a = document.createElement("a"); a.download = `notas-${estudiante.nombre}.jpg`; a.href = canvas.toDataURL("image/jpeg", .92); a.click();
}
function pdf() {
  if (!window.jspdf?.jsPDF) return toast("No se pudo cargar la herramienta de PDF.", true);
  const doc = new window.jspdf.jsPDF({orientation:"landscape"});
  doc.setFontSize(16); doc.text("C.E.B.G. EL JIRAL - Boletín de notas", 14, 15);
  doc.setFontSize(11); doc.text(`${estudiante.nombre} · ${estudiante.salon} · ${ui.trimestre.value}`, 14, 23);
  const filas = materiasVisibles().map(m => { const ps = TIPOS.map(t => promedio(notasDe(m,t).map(n => n.estado === "Intencional" ? 0 : n.nota))); return [m,...ps.map(p => p == null ? "—" : p.toFixed(1)),promedio(ps.filter(p => p != null))?.toFixed(1) || "—"]; });
  doc.autoTable({startY:29, head:[["Materia","Apreciación","Ejercicio","Examen","Promedio"]], body:filas}); doc.save(`boletin-${estudiante.nombre}.pdf`);
}

ui.guardar.addEventListener("click", guardar);
ui.salir.addEventListener("click", async () => { await supabase.auth.signOut(); location.replace("login.html"); });
ui.trimestre.addEventListener("change", async () => { try { await cargarNotas(); render(); } catch { toast("No se pudieron cargar las notas.", true); } });
ui.apr.addEventListener("click", () => { ocultarApr = !ocultarApr; ui.apr.setAttribute("aria-pressed", ocultarApr); ui.apr.textContent = ocultarApr ? "👁️ Mostrar Apreciación" : "🙈 Ocultar Apreciación"; render(); });
ui.eje.addEventListener("click", () => { ocultarEje = !ocultarEje; ui.eje.setAttribute("aria-pressed", ocultarEje); ui.eje.textContent = ocultarEje ? "👁️ Mostrar Ejercicio" : "🙈 Ocultar Ejercicio"; render(); });
ui.jpg.addEventListener("click", jpg); ui.pdf.addEventListener("click", pdf);

(async () => {
  try { if (!await cargarPerfil()) return; await cargarConfiguracion(); await cargarNotas(); render(); }
  catch (error) { console.error(error); ui.materias.innerHTML = '<p style="color:#b91c1c">No se pudieron cargar las notas. Revisa la conexión e intenta nuevamente.</p>'; }
})();
