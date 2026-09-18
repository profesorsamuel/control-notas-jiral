import { supabase } from './supabase.js';
const BUCKET='vida-estudiantil';
const CATS=['padres','directora','profesores','personal','companeros','salon','deportes','actividad','patria','curiosa-1','curiosa-2','curiosa-3'];
const $=id=>document.getElementById(id);
const esc=(s='')=>String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
let salon='9A', estudiantes=[], recuerdos=[], urls=new Map();

function msg(t,k='info'){const e=$('mensajeAvances');e.textContent=t;e.className=`ve-alert show ${k}`;setTimeout(()=>e.classList.remove('show'),6000)}
async function firmado(path){if(!path)return '';if(urls.has(path))return urls.get(path);const {data}=await supabase.storage.from(BUCKET).createSignedUrl(path,3600);const u=data?.signedUrl||'';urls.set(path,u);return u}
function registrosDe(e){return recuerdos.filter(r=>String(r.estudiante_id)===String(e.id))}
function progreso(e){const rs=registrosDe(e);const fotos=new Set(rs.filter(r=>r.tipo!=='video').map(r=>r.categoria));const video=rs.some(r=>r.categoria==='video-agradecimiento'||r.tipo==='video');return Math.min(13,fotos.size+(video?1:0))}
function estadoPill(n){return n===13?'<span class="av-pill completo">✓ Completo</span>':n===0?'<span class="av-pill cero">Sin comenzar</span>':`<span class="av-pill proceso">${n}/13</span>`}

async function iniciar(){
 const {data:{user}}=await supabase.auth.getUser();
 if(!user){alert('Debe entrar como administrador para revisar los avances.');location.replace('login.html');return}
 const {data:p,error:pe}=await supabase.from('usuarios').select('rol').eq('auth_user_id',user.id).maybeSingle();
 if(pe||p?.rol!=='admin'){alert('Este panel es exclusivo para administración.');location.replace('vida_estudiantil.html');return}
 document.querySelectorAll('.av-tab').forEach(b=>b.onclick=()=>{salon=b.dataset.salon;document.querySelectorAll('.av-tab').forEach(x=>x.classList.toggle('activo',x===b));pintar()});
 $('filtroAvance').onchange=pintar;$('buscarAvance').oninput=pintar;$('recargarAvances').onclick=cargar;
 $('cerrarFotos').onclick=()=>$('modalFotos').classList.remove('open');
 $('modalFotos').onclick=e=>{if(e.target===$('modalFotos'))$('modalFotos').classList.remove('open')};
 await cargar();
}
async function cargar(){
 $('listaAvances').innerHTML='<div class="ve-empty">Cargando estudiantes y fotografías…</div>';urls.clear();
 const [{data:es,error:ee},{data:rs,error:er}]=await Promise.all([
   supabase.from('estudiantes').select('id,nombre,salon').in('salon',['9A','9B','9C']).order('nombre'),
   supabase.from('vida_estudiantil_recuerdos').select('id,estudiante_id,nombre_estudiante,salon,categoria,tipo,ruta_storage,estado,titulo').in('salon',['9A','9B','9C'])
 ]);
 if(ee){msg('No se pudo leer la lista de estudiantes: '+ee.message,'error');return}
 if(er){msg('No se pudieron leer los recuerdos: '+er.message,'error');return}
 estudiantes=es||[];recuerdos=rs||[];
 const completos=estudiantes.filter(e=>progreso(e)===13).length, iniciados=estudiantes.filter(e=>progreso(e)>0).length;
 $('totalesAvances').textContent=`${estudiantes.length} estudiantes · ${iniciados} iniciaron · ${completos} completos`;
 pintar();
}
async function miniCollage(e){
 const rs=registrosDe(e).filter(r=>r.tipo!=='video'), por=new Map(rs.map(r=>[r.categoria,r]));
 const celdas=await Promise.all(CATS.map(async cat=>{const r=por.get(cat);if(!r)return '<div class="av-falta">+</div>';const u=await firmado(r.ruta_storage);return u?`<img loading="lazy" src="${u}" alt="">`:'<div class="av-falta">!</div>'}));
 return celdas.join('');
}
async function pintar(){
 const filtro=$('filtroAvance').value,q=$('buscarAvance').value.trim().toLowerCase();
 let lista=estudiantes.filter(e=>e.salon===salon);
 const total=lista.length,iniciados=lista.filter(e=>progreso(e)>0).length, completos=lista.filter(e=>progreso(e)===13).length;
 $('resumenSalon').innerHTML=`<strong>${salon.replace('9','9.º ')}</strong> · ${total} estudiantes · ${iniciados} iniciaron · ${completos} completos · ${total-iniciados} sin comenzar`;
 lista=lista.filter(e=>{const n=progreso(e);if(filtro==='completos'&&n!==13)return false;if(filtro==='incompletos'&&!(n>0&&n<13))return false;if(filtro==='sin-comenzar'&&n!==0)return false;return !q||String(e.nombre).toLowerCase().includes(q)});
 if(!lista.length){$('listaAvances').innerHTML='<div class="ve-empty">No hay estudiantes con este filtro.</div>';return}
 $('listaAvances').innerHTML='<div class="ve-empty">Preparando collages…</div>';
 const cards=await Promise.all(lista.map(async e=>{const n=progreso(e),coll=await miniCollage(e);return `<article class="av-card" data-id="${e.id}">
 <div class="av-card-top"><div><h3>${esc(e.nombre)}</h3><div class="av-sub">${esc(e.salon)} · ${n} de 13 completos</div></div>${estadoPill(n)}</div>
 <div class="av-bar"><span style="width:${n/13*100}%"></span></div>
 <div class="av-collage">${coll}</div>
 <button class="ve-btn primary ver-fotos">Ver collage grande</button>
 </article>`}));
 $('listaAvances').innerHTML=cards.join('');
 $('listaAvances').querySelectorAll('.av-card').forEach(c=>c.querySelector('.ver-fotos').onclick=()=>abrir(c.dataset.id));
}
async function abrir(id){
 const e=estudiantes.find(x=>String(x.id)===String(id));if(!e)return;
 $('modalNombre').textContent=e.nombre;$('modalProgreso').textContent=`${e.salon} · ${progreso(e)} de 13 completos`;
 $('modalCollage').innerHTML=await miniCollage(e);$('modalFotos').classList.add('open');
}
iniciar();