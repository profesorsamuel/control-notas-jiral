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

async function sha256(s){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function autorizar(){
 const KEY='jiral_avances_admin_ok';
 if(localStorage.getItem(KEY)==='1'){document.getElementById('avAcceso').style.display='none';document.getElementById('contenidoAvances').hidden=false;return true}
 return new Promise(resolve=>{
   const input=$('cedulaAdmin'),err=$('errorAcceso');
   $('verCedula').onclick=()=>input.type=input.type==='password'?'text':'password';
   $('entrarAdmin').onclick=async()=>{
     if(await sha256(input.value.trim())==='e9caba241775b802167d9dff753073be03a78ba48b65320a729414dfabd8235a'){localStorage.setItem(KEY,'1');document.getElementById('avAcceso').style.display='none';document.getElementById('contenidoAvances').hidden=false;resolve(true)}
     else{err.textContent='Cédula incorrecta.';input.select()}
   };
   input.addEventListener('keydown',e=>{if(e.key==='Enter')$('entrarAdmin').click()});
 })
}
async function iniciar(){
 if(!await autorizar())return;
 document.querySelectorAll('.av-tab').forEach(b=>b.onclick=()=>{salon=b.dataset.salon;document.querySelectorAll('.av-tab').forEach(x=>x.classList.toggle('activo',x===b));pintar()});
 $('filtroAvance').onchange=pintar;$('buscarAvance').oninput=pintar;$('recargarAvances').onclick=cargar;
 $('pdfSalon').onclick=()=>pdfGrupo(estudiantes.filter(e=>e.salon===salon),`Collages_${salon}.pdf`);
 $('pdfTodos').onclick=()=>pdfGrupo(estudiantes,`Collages_Graduandos_2026.pdf`);
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
 <div class="av-actions"><button class="ve-btn primary ver-fotos">Ver collage grande</button><button class="ve-btn pdf-individual">⬇ Descargar collage</button></div>
 </article>`}));
 $('listaAvances').innerHTML=cards.join('');
 $('listaAvances').querySelectorAll('.av-card').forEach(c=>{
 c.querySelector('.ver-fotos').onclick=()=>abrir(c.dataset.id);
 c.querySelector('.pdf-individual').onclick=()=>pdfEstudiante(c.dataset.id);
});
}
async function abrir(id){
 const e=estudiantes.find(x=>String(x.id)===String(id));if(!e)return;
 $('modalNombre').textContent=e.nombre;$('modalProgreso').textContent=`${e.salon} · ${progreso(e)} de 13 completos`;
 $('modalCollage').innerHTML=await miniCollage(e);$('modalFotos').classList.add('open');
}

async function imagenData(url){
 return await new Promise((res,rej)=>{const im=new Image();im.crossOrigin='anonymous';im.onload=()=>{const c=document.createElement('canvas');const max=900,s=Math.min(1,max/im.width);c.width=Math.round(im.width*s);c.height=Math.round(im.height*s);c.getContext('2d').drawImage(im,0,0,c.width,c.height);res(c.toDataURL('image/jpeg',.78))};im.onerror=rej;im.src=url})
}
async function paginaEstudiante(doc,e,nueva=false){
 if(nueva)doc.addPage();
 doc.setFontSize(15);doc.text(String(e.nombre),12,15);doc.setFontSize(10);doc.text(`${e.salon} · ${progreso(e)} de 13 completos`,12,21);
 const rs=registrosDe(e).filter(r=>r.tipo!=='video'), por=new Map(rs.map(r=>[r.categoria,r]));
 const W=44,H=37,g=3,x0=12,y0=27;
 for(let i=0;i<CATS.length;i++){
   const col=i%4,row=Math.floor(i/4),x=x0+col*(W+g),y=y0+row*(H+8);
   doc.setDrawColor(210);doc.rect(x,y,W,H);
   const r=por.get(CATS[i]);
   if(r){try{const u=await firmado(r.ruta_storage);if(u){const d=await imagenData(u);doc.addImage(d,'JPEG',x,y,W,H)}}catch{}}
   doc.setFontSize(6);doc.text(CATS[i].replaceAll('-',' '),x,y+H+4,{maxWidth:W});
 }
}
async function pdfEstudiante(id){
 const e=estudiantes.find(x=>String(x.id)===String(id));if(!e)return;
 const {jsPDF}=window.jspdf,doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
 await paginaEstudiante(doc,e);doc.save(`Collage_${String(e.nombre).replace(/[^a-z0-9]+/gi,'_')}.pdf`);
}
async function pdfGrupo(lista,nombre){
 if(!lista.length)return msg('No hay estudiantes para generar el PDF.','error');
 msg(`Preparando PDF de ${lista.length} estudiantes…`);
 const {jsPDF}=window.jspdf,doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
 for(let i=0;i<lista.length;i++)await paginaEstudiante(doc,lista[i],i>0);
 doc.save(nombre);msg('PDF preparado correctamente.','success');
}

iniciar();