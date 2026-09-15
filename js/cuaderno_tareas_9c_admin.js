import { supabase } from './supabase.js';

const SALON = '9C';
let materiasDelProfesor = [];
let tareas = [];
let totalEstudiantes9c = 0;
let editandoId = null;
const $ = (id) => document.getElementById(id);

function escapeHtml(s=''){ return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function mensaje(texto, tipo='info'){ const e=$('mensajeCuadAdmin'); e.textContent=texto; e.className=`ve-alert show ${tipo}`; window.scrollTo({top:0,behavior:'smooth'}); setTimeout(()=>e.classList.remove('show'),5000); }
function formatearFecha(f){ if (!f) return ''; const [a,m,d]=f.split('-'); return `${d}/${m}/${a}`; }

async function iniciar(){
  const {data:{user}} = await supabase.auth.getUser();
  if (!user){ location.replace('login.html'); return; }
  const correo = (user.email||'').trim().toLowerCase();
  const {data: materias, error} = await supabase.from('profesor_materias').select('materia, salon').eq('correo_profesor', correo).eq('salon', SALON);
  if (error || !materias || !materias.length){
    alert('Esta cuenta no tiene materias asignadas en 9°C. Contacta al administrador.');
    location.replace('login.html');
    return;
  }
  materiasDelProfesor = [...new Set(materias.map(m=>m.materia))];
  $('fMateria').innerHTML = materiasDelProfesor.map(m=>`<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');

  const {data: estudiantes} = await supabase.rpc('obtener_estudiantes_por_salon', {p_salon: SALON});
  totalEstudiantes9c = (estudiantes||[]).length;

  $('btnSalirCuadAdmin').addEventListener('click', async e=>{ e.preventDefault(); await supabase.auth.signOut(); location.replace('login.html'); });
  $('btnGuardarTarea').addEventListener('click', guardarTarea);
  $('btnCancelarEdicion').addEventListener('click', cancelarEdicion);

  await cargarTareas();
}

async function cargarTareas(){
  const {data, error} = await supabase.from('cuaderno_tareas_9c').select('*').in('materia', materiasDelProfesor).order('materia',{ascending:true}).order('orden',{ascending:true});
  if (error){ mensaje('No se pudo cargar la lista de tareas.','error'); return; }
  tareas = data || [];
  const {data: progreso} = await supabase.from('cuaderno_tareas_9c_progreso').select('tarea_id, completada').in('tarea_id', tareas.map(t=>t.id).length ? tareas.map(t=>t.id) : ['00000000-0000-0000-0000-000000000000']);
  const conteoPorTarea = new Map();
  for (const p of (progreso||[])){ if (!p.completada) continue; conteoPorTarea.set(p.tarea_id, (conteoPorTarea.get(p.tarea_id)||0)+1); }
  pintar(conteoPorTarea);
}

function pintar(conteoPorTarea){
  const cont = $('listaAdminMaterias');
  if (!tareas.length){ cont.innerHTML = '<div class="ve-panel" style="padding:20px;text-align:center;color:var(--gris)">Todavía no has agregado tareas.</div>'; return; }
  const porMateria = new Map();
  for (const t of tareas){ if (!porMateria.has(t.materia)) porMateria.set(t.materia, []); porMateria.get(t.materia).push(t); }
  let html = '';
  for (const [materia, lista] of porMateria){
    html += `<div class="cuad-materia"><div class="cuad-materia-head" style="background:var(--azul-claro)">${escapeHtml(materia)}</div>`;
    for (const t of lista){
      const hechos = conteoPorTarea.get(t.id) || 0;
      html += `<div class="cuad-tarea"><div class="cuad-admin-fila" style="width:100%">
        <div class="cuad-admin-info">
          <div class="cuad-tarea-titulo">${escapeHtml(t.titulo)}</div>
          ${t.descripcion?`<div class="cuad-tarea-desc">${escapeHtml(t.descripcion)}</div>`:''}
          <div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap;">
            ${t.fecha_entrega?`<span class="cuad-tarea-fecha">Entrega: ${formatearFecha(t.fecha_entrega)}</span>`:''}
            ${t.requiere_foto?'<span class="cuad-admin-badge">📷 Pide foto</span>':''}
            <span class="cuad-admin-badge">${hechos} de ${totalEstudiantes9c} completaron</span>
          </div>
        </div>
        <div class="cuad-admin-acciones">
          <button type="button" data-editar="${t.id}">✏️</button>
          <button type="button" data-borrar="${t.id}">🗑️</button>
        </div>
      </div></div>`;
    }
    html += `</div>`;
  }
  cont.innerHTML = html;
  cont.querySelectorAll('[data-editar]').forEach(b=>b.addEventListener('click', ()=>cargarEnFormulario(b.dataset.editar)));
  cont.querySelectorAll('[data-borrar]').forEach(b=>b.addEventListener('click', ()=>borrarTarea(b.dataset.borrar)));
}

function limpiarFormulario(){
  $('fTitulo').value=''; $('fDescripcion').value=''; $('fFecha').value=''; $('fRequiereFoto').checked=true;
  editandoId = null; $('btnGuardarTarea').textContent = '➕ Agregar tarea'; $('btnCancelarEdicion').hidden = true;
}

function cargarEnFormulario(id){
  const t = tareas.find(x=>String(x.id)===String(id));
  if (!t) return;
  $('fMateria').value = t.materia; $('fTitulo').value = t.titulo; $('fDescripcion').value = t.descripcion||'';
  $('fFecha').value = t.fecha_entrega||''; $('fRequiereFoto').checked = !!t.requiere_foto;
  editandoId = id; $('btnGuardarTarea').textContent = '💾 Guardar cambios'; $('btnCancelarEdicion').hidden = false;
  window.scrollTo({top:0,behavior:'smooth'});
}

function cancelarEdicion(){ limpiarFormulario(); }

async function guardarTarea(){
  const materia = $('fMateria').value;
  const titulo = $('fTitulo').value.trim();
  if (!materia || !titulo){ mensaje('Elige la materia y escribe el título de la tarea.','error'); return; }
  const fila = {
    materia,
    titulo,
    descripcion: $('fDescripcion').value.trim() || null,
    fecha_entrega: $('fFecha').value || null,
    requiere_foto: $('fRequiereFoto').checked,
  };
  let error;
  if (editandoId){
    ({error} = await supabase.from('cuaderno_tareas_9c').update(fila).eq('id', editandoId));
  } else {
    fila.orden = tareas.filter(t=>t.materia===materia).length;
    ({error} = await supabase.from('cuaderno_tareas_9c').insert(fila));
  }
  if (error){ mensaje('No se pudo guardar: ' + error.message,'error'); return; }
  mensaje(editandoId ? 'Tarea actualizada.' : 'Tarea agregada.','ok');
  limpiarFormulario();
  await cargarTareas();
}

async function borrarTarea(id){
  if (!confirm('¿Eliminar esta tarea? Los estudiantes perderán su avance y fotos de esta tarea.')) return;
  const {error} = await supabase.from('cuaderno_tareas_9c').delete().eq('id', id);
  if (error){ mensaje('No se pudo eliminar.','error'); return; }
  mensaje('Tarea eliminada.','ok');
  await cargarTareas();
}

iniciar();
