import { supabase } from './supabase.js';

const BUCKET = 'vida-estudiantil';
const MAX_FOTO = 25 * 1024 * 1024;
const MAX_VIDEO = 25 * 1024 * 1024;
const CATEGORIAS = [
  ['padres','Con mis padres o acudientes','Durante una actividad o celebración escolar.'],
  ['directora','Con la directora','En un acto, reunión o momento especial.'],
  ['profesores','Con mis profesores','Una fotografía con uno o varios docentes.'],
  ['personal','Con administrativos y colaboradores','Con personas que apoyan la vida escolar.'],
  ['companeros','Con mis compañeros','Una fotografía de nuestro grupo.'],
  ['salon','Aprendiendo en el salón','Realizando una tarea o actividad educativa.'],
  ['deportes','Practicando deportes','Fútbol, voleibol, atletismo u otro deporte.'],
  ['actividad','En una actividad escolar','Convivios, jornadas o celebraciones.'],
  ['patria','Celebrando el Mes de la Patria','Bandera, vestimenta típica o decoración patriótica.'],
  ['curiosa-1','Foto curiosa o divertida 1','Un momento espontáneo o gracioso.'],
  ['curiosa-2','Foto curiosa o divertida 2','Un recuerdo inesperado de la escuela.'],
  ['curiosa-3','Foto curiosa o divertida 3','Una fotografía con una historia especial.']
];
const PROFESORES = ['Yadira de Gracia — Español','Leonela Rivera — Matemática','Faustina Rodríguez — Historia / Geografía','Wendy Warren — Inglés','Nairobys Saez — Ciencias Naturales','Samuel Ortega — Ciencias Naturales','Juana Browns — Cívica','Leticia Cortes — Español','Guiliam Barría — Educación Física','Miriam Valencia — Artística','Alexis Del Mar — Agropecuaria','Erika Pimentel — Familia y Desarrollo','Willian Mitzi — Orientación','Thelma Alvarez — Religión'];
let usuario, estudiante, archivos = new Map(), seleccion = new Map(), videoSeleccionado = null;
const $ = (id) => document.getElementById(id);

function mensaje(texto, tipo='info'){const e=$('mensajeVida');e.textContent=texto;e.className=`ve-alert show ${tipo}`;window.scrollTo({top:0,behavior:'smooth'});setTimeout(()=>e.classList.remove('show'),6000)}
function estadoTexto(v){return v==='aprobado'?'Aprobado':v==='rechazado'?'Debe corregirse':'Pendiente';}
function escapeHtml(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
async function urlFirmada(path){const {data}=await supabase.storage.from(BUCKET).createSignedUrl(path,3600);return data?.signedUrl||'';}

async function comprimirFoto(file){
  if(!file.type.startsWith('image/')) throw new Error('Selecciona una fotografía válida.');
  if(file.size>MAX_FOTO) throw new Error('La fotografía original supera 25 MB.');
  const bmp=await createImageBitmap(file,{imageOrientation:'from-image'});let w=bmp.width,h=bmp.height;const max=1920;
  if(Math.max(w,h)>max){const k=max/Math.max(w,h);w=Math.round(w*k);h=Math.round(h*k)}
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;canvas.getContext('2d').drawImage(bmp,0,0,w,h);bmp.close();
  return await new Promise((ok,no)=>canvas.toBlob(b=>b?ok(b):no(new Error('No se pudo preparar la fotografía.')),'image/webp',.84));
}

function tarjeta([id,titulo,ayuda]){
  const profesor=id==='profesores'?`<select class="ve-select profesor"><option value="">Profesor(a) que aparece (opcional)</option>${PROFESORES.map(p=>`<option>${escapeHtml(p)}</option>`).join('')}</select>`:'';
  return `<article class="ve-card" data-categoria="${id}"><div class="ve-card-head"><h3>${titulo}</h3><p>${ayuda}</p></div><div class="ve-preview"><div class="ve-placeholder"><strong>📷</strong>Falta esta fotografía</div></div><div class="ve-card-body">${profesor}<textarea class="ve-textarea descripcion" maxlength="180" placeholder="Escribe una breve historia (opcional)"></textarea><input class="ve-file archivo" id="foto-${id}" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif"><label class="ve-upload-label" for="foto-${id}">Elegir fotografía</label><div class="ve-meta">Se reducirá automáticamente sin perder buena calidad.</div><div class="ve-actions"><button class="ve-btn primary guardar" disabled>Subir foto</button><button class="ve-btn danger eliminar" hidden>Eliminar</button></div></div></article>`;
}

async function pintarArchivo(card, dato){
  const preview=card.querySelector('.ve-preview');const eliminar=card.querySelector('.eliminar');
  if(!dato){preview.innerHTML='<div class="ve-placeholder"><strong>📷</strong>Falta esta fotografía</div>';eliminar.hidden=true;return;}
  const url=await urlFirmada(dato.ruta_storage);preview.innerHTML=`<img src="${url}" alt="${escapeHtml(dato.titulo)}"><span class="ve-status ${dato.estado}">${estadoTexto(dato.estado)}</span>`;
  card.querySelector('.descripcion').value=dato.descripcion||'';const pro=card.querySelector('.profesor');if(pro)pro.value=dato.profesor||'';eliminar.hidden=dato.estado==='aprobado';
}

function actualizarProgreso(){const completos=CATEGORIAS.filter(([id])=>archivos.has(id)).length+(archivos.has('video-agradecimiento')?1:0);$('textoProgreso').textContent=`${completos} de 13 completos`;$('barraProgreso').style.width=`${completos/13*100}%`;pintarCollage();}
async function pintarCollage(){
  const caja=$('collageVista');caja.innerHTML=CATEGORIAS.map(([id,t])=>`<div class="ve-collage-item" data-collage="${id}"><div class="ve-collage-falta">✕</div><div class="ve-collage-label">${t}</div></div>`).join('');
  await Promise.all(CATEGORIAS.map(async([id])=>{const d=archivos.get(id);if(!d)return;const url=await urlFirmada(d.ruta_storage);const item=caja.querySelector(`[data-collage="${id}"]`);item.insertAdjacentHTML('afterbegin',`<img src="${url}" alt="">`);item.querySelector('.ve-collage-falta').remove();}));
}

async function cargar(){
  const {data:{user}}=await supabase.auth.getUser();if(!user){location.replace('login.html');return}usuario=user;
  const {data:e}=await supabase.from('estudiantes').select('id,nombre,salon,correo').eq('correo',user.email).maybeSingle();if(!e){mensaje('No encontramos tu registro de estudiante.','error');return}estudiante=e;
  $('nombreVida').textContent=e.nombre;$('salonVida').value=['9A','9B','9C'].includes(e.salon)?e.salon:'';
  $('cuadriculaFotos').innerHTML=CATEGORIAS.map(tarjeta).join('');
  const {data, error}=await supabase.from('vida_estudiantil_recuerdos').select('*').eq('usuario_id',user.id);if(error){mensaje('Primero debes ejecutar el archivo de configuración de Supabase.','error');return}
  (data||[]).forEach(d=>archivos.set(d.categoria,d));
  for(const [id] of CATEGORIAS) await pintarArchivo(document.querySelector(`[data-categoria="${id}"]`),archivos.get(id));
  await pintarVideo();actualizarProgreso();conectarEventos();
}

function conectarEventos(){
  document.querySelectorAll('.ve-card').forEach(card=>{const id=card.dataset.categoria,input=card.querySelector('.archivo'),guardar=card.querySelector('.guardar');
    input.addEventListener('change',async()=>{const f=input.files[0];if(!f)return;try{const blob=await comprimirFoto(f);seleccion.set(id,blob);card.querySelector('.ve-preview').innerHTML=`<img src="${URL.createObjectURL(blob)}" alt="Vista previa"><span class="ve-status pendiente">Lista para subir</span>`;guardar.disabled=false;card.querySelector('.ve-meta').textContent=`Preparada: ${(blob.size/1024).toFixed(0)} KB`;}catch(e){mensaje(e.message,'error');input.value=''}});
    guardar.addEventListener('click',()=>subirFoto(card,id));card.querySelector('.eliminar').addEventListener('click',()=>eliminar(id));
  });
  $('salonVida').addEventListener('change',()=>{if(!['9A','9B','9C'].includes($('salonVida').value))return;mensaje(`Grupo seleccionado: ${$('salonVida').selectedOptions[0].textContent}`,'ok')});
  $('archivoVideo').addEventListener('change',validarVideo);$('guardarVideo').addEventListener('click',subirVideo);$('eliminarVideo').addEventListener('click',()=>eliminar('video-agradecimiento'));
  $('descargarCollage').addEventListener('click',descargarCollage);$('btnSalirVida').addEventListener('click',async e=>{e.preventDefault();await supabase.auth.signOut();location.replace('login.html')});
}

function exigirSalon(){const salon=$('salonVida').value;if(!['9A','9B','9C'].includes(salon))throw new Error('Selecciona primero si perteneces a 9.º A, 9.º B o 9.º C.');return salon;}
async function subirFoto(card,id){
  const blob=seleccion.get(id);if(!blob)return;const btn=card.querySelector('.guardar');try{const salon=exigirSalon();btn.disabled=true;btn.textContent='Subiendo…';const path=`${usuario.id}/fotos/${id}.webp`;const {error:up}=await supabase.storage.from(BUCKET).upload(path,blob,{contentType:'image/webp',upsert:true});if(up)throw up;
    const cat=CATEGORIAS.find(x=>x[0]===id);const fila={usuario_id:usuario.id,estudiante_id:estudiante.id,nombre_estudiante:estudiante.nombre,salon,categoria:id,titulo:cat[1],tipo:'foto',ruta_storage:path,mime_type:'image/webp',peso_bytes:blob.size,descripcion:card.querySelector('.descripcion').value.trim(),profesor:card.querySelector('.profesor')?.value||null,estado:'pendiente',motivo_rechazo:null};
    const {data,error}=await supabase.from('vida_estudiantil_recuerdos').upsert(fila,{onConflict:'usuario_id,categoria'}).select().single();if(error)throw error;archivos.set(id,data);seleccion.delete(id);await pintarArchivo(card,data);actualizarProgreso();mensaje('Fotografía entregada correctamente.','ok');
  }catch(e){mensaje(e.message||'No se pudo subir la fotografía.','error')}finally{btn.textContent='Subir foto';btn.disabled=!seleccion.has(id)}}

async function validarVideo(){const f=$('archivoVideo').files[0];$('guardarVideo').disabled=true;if(!f)return;if(f.size>MAX_VIDEO){mensaje('El video supera 25 MB. Redúcelo antes de subirlo.','error');return}const url=URL.createObjectURL(f),v=document.createElement('video');v.preload='metadata';v.src=url;v.onloadedmetadata=()=>{if(v.duration>60.5){mensaje('El video debe durar un minuto o menos.','error');URL.revokeObjectURL(url);return}if(v.videoWidth<=v.videoHeight){mensaje('El video debe estar grabado horizontalmente.','error');URL.revokeObjectURL(url);return}videoSeleccionado=f;$('previewVideo').innerHTML=`<video controls src="${url}"></video>`;$('metaVideo').textContent=`${Math.ceil(v.duration)} segundos · ${(f.size/1024/1024).toFixed(1)} MB`;$('guardarVideo').disabled=false;};}
async function subirVideo(){const f=videoSeleccionado;if(!f)return;const btn=$('guardarVideo');try{const salon=exigirSalon();btn.disabled=true;btn.textContent='Subiendo…';const ext=(f.name.split('.').pop()||'mp4').toLowerCase();const path=`${usuario.id}/video/agradecimiento.${ext}`;const {error:up}=await supabase.storage.from(BUCKET).upload(path,f,{contentType:f.type||'video/mp4',upsert:true});if(up)throw up;const fila={usuario_id:usuario.id,estudiante_id:estudiante.id,nombre_estudiante:estudiante.nombre,salon,categoria:'video-agradecimiento',titulo:'Video final de agradecimiento',tipo:'video',ruta_storage:path,mime_type:f.type||'video/mp4',peso_bytes:f.size,estado:'pendiente',motivo_rechazo:null};const {data,error}=await supabase.from('vida_estudiantil_recuerdos').upsert(fila,{onConflict:'usuario_id,categoria'}).select().single();if(error)throw error;archivos.set('video-agradecimiento',data);videoSeleccionado=null;await pintarVideo();actualizarProgreso();mensaje('Video entregado correctamente.','ok');}catch(e){mensaje(e.message||'No se pudo subir el video.','error')}finally{btn.textContent='Subir video';btn.disabled=!videoSeleccionado}}
async function pintarVideo(){const d=archivos.get('video-agradecimiento');if(!d)return;const url=await urlFirmada(d.ruta_storage);$('previewVideo').innerHTML=`<video controls src="${url}"></video><span class="ve-status ${d.estado}">${estadoTexto(d.estado)}</span>`;$('eliminarVideo').hidden=d.estado==='aprobado';}
async function eliminar(id){const d=archivos.get(id);if(!d||!confirm('¿Seguro que deseas eliminar este archivo?'))return;const {error:a}=await supabase.storage.from(BUCKET).remove([d.ruta_storage]);if(a){mensaje(a.message,'error');return}const {error:b}=await supabase.from('vida_estudiantil_recuerdos').delete().eq('id',d.id);if(b){mensaje(b.message,'error');return}archivos.delete(id);if(id==='video-agradecimiento'){$('previewVideo').innerHTML='<div class="ve-placeholder"><strong>🎬</strong>Agrega tu video horizontal</div>';$('eliminarVideo').hidden=true}else await pintarArchivo(document.querySelector(`[data-categoria="${id}"]`),null);actualizarProgreso();mensaje('Archivo eliminado.','ok');}

function cargarImagen(url){return new Promise((ok,no)=>{const i=new Image();i.crossOrigin='anonymous';i.onload=()=>ok(i);i.onerror=no;i.src=url})}
function cover(ctx,img,x,y,w,h){const k=Math.max(w/img.width,h/img.height),sw=w/k,sh=h/k,sx=(img.width-sw)/2,sy=(img.height-sh)/2;ctx.drawImage(img,sx,sy,sw,sh,x,y,w,h)}
async function descargarCollage(){
  const salon=exigirSalon(),btn=$('descargarCollage');btn.disabled=true;btn.textContent='Creando collage…';try{const c=document.createElement('canvas');c.width=2400;c.height=1500;const x=c.getContext('2d');const grad=x.createLinearGradient(0,0,2400,0);grad.addColorStop(0,'#073b67');grad.addColorStop(.72,'#0b5c99');grad.addColorStop(1,'#c1121f');x.fillStyle=grad;x.fillRect(0,0,2400,210);x.fillStyle='#fff';x.textAlign='center';x.font='bold 72px Arial';x.fillText('ESTUDIANTES GRADUANDOS 2026',1200,92);x.font='bold 42px Arial';x.fillText(`C.E.B.G. EL JIRAL · ${estudiante.nombre} · ${salon.replace('9','9.º ')}`,1200,158);
    const gap=12,cols=4,cellW=(2400-gap*(cols+1))/cols,cellH=370,startY=222;
    for(let n=0;n<CATEGORIAS.length;n++){const [id,titulo]=CATEGORIAS[n],col=n%4,row=Math.floor(n/4),px=gap+col*(cellW+gap),py=startY+row*(cellH+gap),d=archivos.get(id);x.fillStyle='#fff';x.fillRect(px,py,cellW,cellH);if(d){const url=await urlFirmada(d.ruta_storage);try{cover(x,await cargarImagen(url),px,py,cellW,cellH)}catch{}}else{x.strokeStyle='#d6dee7';x.lineWidth=12;x.beginPath();x.moveTo(px+100,py+70);x.lineTo(px+cellW-100,py+cellH-90);x.moveTo(px+cellW-100,py+70);x.lineTo(px+100,py+cellH-90);x.stroke()}
      x.fillStyle='#001b33d9';x.fillRect(px,py+cellH-58,cellW,58);x.fillStyle='#fff';x.font='bold 24px Arial';x.textAlign='center';x.fillText(titulo.length>38?titulo.slice(0,36)+'…':titulo,px+cellW/2,py+cellH-21);
    }x.fillStyle='#073b67';x.fillRect(0,1380,2400,120);x.fillStyle='#fff';x.font='bold 34px Arial';x.fillText('MI VIDA ESTUDIANTIL · RECUERDOS QUE LLEVARÉ SIEMPRE',1200,1452);const a=document.createElement('a');a.download=`collage-graduando-${estudiante.nombre.replace(/\s+/g,'-')}.jpg`;a.href=c.toDataURL('image/jpeg',.92);a.click();mensaje('Collage horizontal descargado.','ok');}catch(e){mensaje(e.message||'No se pudo crear el collage.','error')}finally{btn.disabled=false;btn.textContent='✨ Descargar collage horizontal'}}

cargar();
