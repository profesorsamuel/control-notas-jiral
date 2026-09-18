import { supabase } from './supabase.js';

const BUCKET = 'cuaderno-tareas-9c';
const SALON = '9C';
const MAX_FOTO = 25 * 1024 * 1024;
const COLORES = ['#d6f2dc','#dbeafe','#fef3c7','#fce7f3','#e0e7ff','#ffe4d6','#e2f5ea'];

let usuario, estudiante, tareas = [], progresoPorTarea = new Map(), fotosPorTarea = new Map();
let estudiantesDelSalon = [];
const $ = (id) => document.getElementById(id);

function normalizarCedula(c){ return String(c||'').trim().toLowerCase().replace(/[\s-]/g,''); }
function escapeHtml(s=''){ return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function mensaje(texto, tipo='info'){ const e=$('mensajeCuad'); e.textContent=texto; e.className=`ve-alert show ${tipo}`; window.scrollTo({top:0,behavior:'smooth'}); setTimeout(()=>e.classList.remove('show'),5000); }
function colorMateria(materia){
  let h = 0; for (const ch of materia) h = (h*31 + ch.charCodeAt(0)) >>> 0;
  return COLORES[h % COLORES.length];
}
function formatearFecha(f){
  if (!f) return '';
  const [a,m,d] = f.split('-');
  return `${d}/${m}/${a}`;
}
function estaVencida(f){
  if (!f) return false;
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  return new Date(f+'T00:00:00') < hoy;
}

async function cargar(){
  let {data:{user}} = await supabase.auth.getUser();
  if (!user) {
    const {data, error} = await supabase.auth.signInAnonymously();
    if (error) { mensaje('No se pudo abrir la página. Intenta de nuevo o avisa a tu profesor.','error'); return; }
    user = data.user;
  }
  usuario = user;
  await cargarEstudiantes();
  conectarEventosFijos();
}

async function cargarEstudiantes(){
  const select = $('estudianteCuad');
  select.innerHTML = '<option value="">Cargando estudiantes…</option>';
  const {data, error} = await supabase.rpc('obtener_estudiantes_por_salon', {p_salon: SALON});
  if (error) { select.innerHTML = '<option value="">No se pudo cargar la lista. Recarga la página.</option>'; mensaje('No se pudo cargar la lista de estudiantes de 9°C.','error'); return; }
  estudiantesDelSalon = data || [];
  if (!estudiantesDelSalon.length){ select.innerHTML = '<option value="">9°C aún no tiene estudiantes cargados.</option>'; return; }
  select.innerHTML = '<option value="">Selecciona tu nombre</option>' + estudiantesDelSalon.map(e=>`<option value="${e.id}">${escapeHtml(e.nombre)}</option>`).join('');
}

function alElegirNombre(){
  const hay = !!$('estudianteCuad').value;
  $('cedulaCuad').disabled = !hay; $('verCedulaCuad').disabled = !hay; $('verificarIdentidadCuad').disabled = !hay;
  if (!hay) $('cedulaCuad').value = '';
}

async function verificarIdentidad(){
  const id = $('estudianteCuad').value;
  const registro = estudiantesDelSalon.find(e=>String(e.id)===String(id));
  const cedulaEscrita = normalizarCedula($('cedulaCuad').value);
  if (!registro){ mensaje('Selecciona tu nombre de la lista.','error'); return; }
  if (!cedulaEscrita){ mensaje('Escribe tu cédula para continuar.','error'); return; }
  const cedulaGuardada = normalizarCedula(registro.cedula);
  if (!cedulaGuardada){ mensaje('Tu cédula todavía no está registrada en el sistema. Avisa a la dirección.','error'); return; }
  if (cedulaEscrita !== cedulaGuardada){ mensaje('La cédula no coincide con el nombre seleccionado. Verifica e intenta de nuevo.','error'); return; }
  estudiante = {id: registro.id, nombre: registro.nombre};
  $('tituloCuad').textContent = `Cuaderno de ${estudiante.nombre}`;
  $('estudianteCuad').disabled = true; $('cedulaCuad').disabled = true; $('verCedulaCuad').disabled = true;
  $('verificarIdentidadCuad').hidden = true; $('cambiarIdentidadCuad').hidden = false;
  await cargarTareas();
}

function cambiarIdentidad(){
  estudiante = null; tareas = []; progresoPorTarea = new Map(); fotosPorTarea = new Map();
  $('estudianteCuad').disabled = false; $('cedulaCuad').disabled = false; $('cedulaCuad').value = ''; $('verCedulaCuad').disabled = false;
  $('verificarIdentidadCuad').hidden = false; $('verificarIdentidadCuad').disabled = true; $('cambiarIdentidadCuad').hidden = true;
  $('tituloCuad').textContent = 'Preparando tu cuaderno…';
  $('listaMaterias').hidden = true; $('listaMaterias').innerHTML = '';
  actualizarProgreso();
}

async function cargarTareas(){
  const [{data: tData, error: tErr}, {data: pData, error: pErr}, {data: fData, error: fErr}] = await Promise.all([
    supabase.from('cuaderno_tareas_9c').select('*').order('materia', {ascending:true}).order('orden', {ascending:true}),
    supabase.from('cuaderno_tareas_9c_progreso').select('*').eq('usuario_id', usuario.id).eq('estudiante_id', String(estudiante.id)),
    supabase.from('cuaderno_tareas_9c_fotos').select('*').eq('usuario_id', usuario.id).eq('estudiante_id', String(estudiante.id)).order('creado_en', {ascending:true}),
  ]);
  if (tErr || pErr || fErr){ mensaje('No se pudo cargar el cuaderno. Recarga la página.','error'); return; }
  tareas = tData || [];
  progresoPorTarea = new Map((pData||[]).map(p=>[p.tarea_id, p]));
  fotosPorTarea = new Map();
  for (const f of (fData||[])){
    if (!fotosPorTarea.has(f.tarea_id)) fotosPorTarea.set(f.tarea_id, []);
    fotosPorTarea.get(f.tarea_id).push(f);
  }
  await pintarTareas();
  await cargarFirmasFotos();
}

async function pintarTareas(){
  const cont = $('listaMaterias');
  if (!tareas.length){ cont.hidden = false; cont.innerHTML = '<div class="ve-panel" style="padding:20px;text-align:center;color:var(--gris)">Todavía no hay tareas asignadas para 9°C.</div>'; actualizarProgreso(); return; }
  const porMateria = new Map();
  for (const t of tareas){ if (!porMateria.has(t.materia)) porMateria.set(t.materia, []); porMateria.get(t.materia).push(t); }
  let html = '';
  for (const [materia, lista] of porMateria){
    const hechas = lista.filter(t=>progresoPorTarea.get(t.id)?.completada).length;
    html += `<div class="cuad-materia">
      <div class="cuad-materia-head" style="background:${colorMateria(materia)}"><span>${escapeHtml(materia)}</span><span class="cuad-materia-count">${hechas} de ${lista.length}</span></div>
      ${lista.map(t=>tarjetaTarea(t)).join('')}
    </div>`;
  }
  cont.innerHTML = html;
  cont.hidden = false;
  cont.querySelectorAll('.cuad-check').forEach(chk=>chk.addEventListener('click', ()=>toggleCompletada(chk.dataset.id)));
  cont.querySelectorAll('.cuad-foto-add').forEach(btn=>btn.addEventListener('click', ()=>btn.nextElementSibling.click()));
  cont.querySelectorAll('.cuad-foto-input').forEach(inp=>inp.addEventListener('change', (e)=>subirFotos(inp.dataset.id, e.target.files)));
  cont.querySelectorAll('.cuad-foto-borrar').forEach(btn=>btn.addEventListener('click', ()=>borrarFoto(btn.dataset.fotoid, btn.dataset.id)));
  cont.querySelectorAll('.cuad-foto-item img').forEach(img=>img.addEventListener('click', ()=>abrirLightbox(img.src)));
  actualizarProgreso();
}

function tarjetaTarea(t){
  const p = progresoPorTarea.get(t.id);
  const hecha = !!p?.completada;
  const fotos = fotosPorTarea.get(t.id) || [];
  const vencida = !hecha && estaVencida(t.fecha_entrega);
  return `<div class="cuad-tarea ${hecha?'hecha':''}">
    <button type="button" class="cuad-check ${hecha?'on':''}" data-id="${t.id}" aria-label="Marcar como hecha">${hecha?'✓':''}</button>
    <div class="cuad-tarea-cuerpo">
      <div class="cuad-tarea-titulo">${escapeHtml(t.titulo)}</div>
      ${t.descripcion?`<div class="cuad-tarea-desc">${escapeHtml(t.descripcion)}</div>`:''}
      ${t.fecha_entrega?`<span class="cuad-tarea-fecha ${vencida?'vencida':''}">${vencida?'Venció el ':'Entrega: '}${formatearFecha(t.fecha_entrega)}</span>`:''}
      ${t.requiere_foto?`<div class="cuad-fotos-zona">
        <div class="cuad-fotos-tira" id="fotos-${t.id}">
          ${fotos.map(f=>`<div class="cuad-foto-item"><img data-src="${f.ruta_storage}" alt="Evidencia"><button type="button" class="cuad-foto-borrar" data-fotoid="${f.id}" data-id="${t.id}">✕</button></div>`).join('')}
          <label class="cuad-foto-add">＋<input type="file" accept="image/*" multiple class="cuad-foto-input" data-id="${t.id}"></label>
        </div>
      </div>`:''}
    </div>
  </div>`;
}

async function cargarFirmasFotos(){
  const imgs = document.querySelectorAll('.cuad-foto-item img[data-src]');
  await Promise.all([...imgs].map(async img=>{
    const ruta = img.dataset.src;
    const {data} = await supabase.storage.from(BUCKET).createSignedUrl(ruta, 3600);
    if (data?.signedUrl) img.src = data.signedUrl;
    img.removeAttribute('data-src');
  }));
}

function actualizarProgreso(){
  const total = tareas.length;
  const hechas = tareas.filter(t=>progresoPorTarea.get(t.id)?.completada).length;
  $('textoProgreso').textContent = `${hechas} de ${total} completas`;
  $('barraProgreso').style.width = total ? `${hechas/total*100}%` : '0%';
}

async function toggleCompletada(tareaId){
  const actual = progresoPorTarea.get(tareaId);
  const nuevoValor = !actual?.completada;
  const fila = {tarea_id: tareaId, usuario_id: usuario.id, estudiante_id: String(estudiante.id), nombre_estudiante: estudiante.nombre, completada: nuevoValor, completada_en: nuevoValor ? new Date().toISOString() : null};
  const {data, error} = await supabase.from('cuaderno_tareas_9c_progreso').upsert(fila, {onConflict: 'tarea_id,usuario_id,estudiante_id'}).select().single();
  if (error){ mensaje('No se pudo guardar. Intenta de nuevo.','error'); return; }
  progresoPorTarea.set(tareaId, data);
  await pintarTareas();
  await cargarFirmasFotos();
}

async function comprimirFoto(file){
  if (!file.type.startsWith('image/')) throw new Error('Selecciona una fotografía válida.');
  if (file.size > MAX_FOTO) throw new Error('La fotografía supera 25 MB.');
  const bmp = await createImageBitmap(file, {imageOrientation:'from-image'});
  let w = bmp.width, h = bmp.height; const max = 900;
  if (Math.max(w,h) > max){ const k = max/Math.max(w,h); w = Math.round(w*k); h = Math.round(h*k); }
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h); bmp.close();
  return await new Promise((ok,no)=>canvas.toBlob(b=>b?ok(b):no(new Error('No se pudo preparar la fotografía.')), 'image/webp', .55));
}

async function subirFotos(tareaId, files){
  if (!files || !files.length) return;
  const zona = $(`fotos-${tareaId}`);
  const aviso = document.createElement('div'); aviso.className = 'cuad-foto-subiendo'; aviso.textContent = 'Subiendo fotos…';
  zona.appendChild(aviso);
  try {
    for (const file of files){
      const blob = await comprimirFoto(file);
      const path = `${usuario.id}/${estudiante.id}/${tareaId}/${Date.now()}-${Math.random().toString(36).slice(2,7)}.webp`;
      const {error: up} = await supabase.storage.from(BUCKET).upload(path, blob, {contentType:'image/webp'});
      if (up) throw up;
      const {data, error} = await supabase.from('cuaderno_tareas_9c_fotos').insert({tarea_id: tareaId, usuario_id: usuario.id, estudiante_id: String(estudiante.id), nombre_estudiante: estudiante.nombre, ruta_storage: path}).select().single();
      if (error) throw error;
      if (!fotosPorTarea.has(tareaId)) fotosPorTarea.set(tareaId, []);
      fotosPorTarea.get(tareaId).push(data);
    }
    // Subir una foto marca la tarea como completa automáticamente si aún no lo estaba.
    if (!progresoPorTarea.get(tareaId)?.completada){
      const fila = {tarea_id: tareaId, usuario_id: usuario.id, estudiante_id: String(estudiante.id), nombre_estudiante: estudiante.nombre, completada: true, completada_en: new Date().toISOString()};
      const {data: pd} = await supabase.from('cuaderno_tareas_9c_progreso').upsert(fila, {onConflict:'tarea_id,usuario_id,estudiante_id'}).select().single();
      if (pd) progresoPorTarea.set(tareaId, pd);
    }
    mensaje('Fotos subidas.','ok');
  } catch (e){
    mensaje(e.message || 'No se pudieron subir las fotos.','error');
  } finally {
    await pintarTareas();
    await cargarFirmasFotos();
  }
}

async function borrarFoto(fotoId, tareaId){
  if (!confirm('¿Quitar esta foto?')) return;
  const lista = fotosPorTarea.get(tareaId) || [];
  const foto = lista.find(f=>String(f.id)===String(fotoId));
  if (!foto) return;
  const {error: e1} = await supabase.storage.from(BUCKET).remove([foto.ruta_storage]);
  if (e1){ mensaje('No se pudo quitar la foto.','error'); return; }
  const {error: e2} = await supabase.from('cuaderno_tareas_9c_fotos').delete().eq('id', fotoId);
  if (e2){ mensaje('No se pudo quitar la foto.','error'); return; }
  fotosPorTarea.set(tareaId, lista.filter(f=>String(f.id)!==String(fotoId)));
  await pintarTareas();
  await cargarFirmasFotos();
}

function abrirLightbox(src){
  $('lightboxImg').src = src;
  $('lightboxCuad').classList.add('open');
}

function conectarEventosFijos(){
  $('estudianteCuad').addEventListener('change', alElegirNombre);
  $('verCedulaCuad').addEventListener('click', ()=>{ const i=$('cedulaCuad'); i.type = i.type==='password' ? 'text' : 'password'; });
  $('verificarIdentidadCuad').addEventListener('click', verificarIdentidad);
  $('cambiarIdentidadCuad').addEventListener('click', cambiarIdentidad);
  $('btnSalirCuad').addEventListener('click', async e=>{ e.preventDefault(); await supabase.auth.signOut(); location.replace('portal-clase.html'); });
  $('cerrarLightbox').addEventListener('click', ()=>$('lightboxCuad').classList.remove('open'));
  $('lightboxCuad').addEventListener('click', (e)=>{ if (e.target.id==='lightboxCuad') $('lightboxCuad').classList.remove('open'); });
}

cargar();
