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
const SALONES = ['9A','9B','9C'];
let usuario, estudiante, archivos = new Map(), seleccion = new Map(), videoSeleccionado = null, estudiantesDelSalon = [];
const $ = (id) => document.getElementById(id);
function normalizarCedula(c){return String(c||'').trim().toLowerCase().replace(/[\s-]/g,'');}
function mostrarAlbum(mostrar){$('cuadriculaFotos').hidden=!mostrar;$('seccionVideo').hidden=!mostrar;$('seccionCollage').hidden=!mostrar;}

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
  return `<article class="ve-card" data-categoria="${id}"><div class="ve-card-head"><h3>${titulo}</h3><p>${ayuda}</p></div><div class="ve-preview"><div class="ve-placeholder"><strong>📷</strong>Falta esta fotografía</div></div><div class="ve-card-body">${profesor}<textarea class="ve-textarea descripcion" maxlength="180" placeholder="Escribe una breve historia (opcional). Se guarda sola."></textarea><input class="ve-file archivo" id="foto-${id}" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif"><label class="ve-upload-label" for="foto-${id}">Elegir fotografía</label><div class="ve-meta">Se sube sola en cuanto la eliges: se reduce automáticamente sin perder buena calidad.</div><div class="ve-actions"><button class="ve-btn primary guardar" hidden>Reintentar subida</button><button class="ve-btn danger eliminar" hidden>Eliminar</button></div></div></article>`;
}

async function pintarArchivo(card, dato){
  const preview=card.querySelector('.ve-preview');const eliminar=card.querySelector('.eliminar');
  if(!dato){preview.innerHTML='<div class="ve-placeholder"><strong>📷</strong>Falta esta fotografía</div>';eliminar.hidden=true;return;}
  const url=await urlFirmada(dato.ruta_storage);preview.innerHTML=`<img src="${url}" alt="${escapeHtml(dato.titulo)}"><span class="ve-status ${dato.estado}">${estadoTexto(dato.estado)}</span>`;
  card.querySelector('.descripcion').value=dato.descripcion||'';const pro=card.querySelector('.profesor');if(pro)pro.value=dato.profesor||'';eliminar.hidden=dato.estado==='aprobado';
}

function salonBonito(salon){return String(salon||'').replace('9','9.º ');}

function actualizarProgreso(){const completos=CATEGORIAS.filter(([id])=>archivos.has(id)).length+(archivos.has('video-agradecimiento')?1:0);$('textoProgreso').textContent=`${completos} de 13 completos`;$('barraProgreso').style.width=`${completos/13*100}%`;pintarCollage();}
async function pintarCollage(){
  const titulo=$('collageTitulo');if(titulo&&estudiante)titulo.textContent=`GRADUACIÓN 2026 · C.E.B.G. EL JIRAL · SALÓN ${salonBonito(estudiante.salon).toUpperCase()} · ${estudiante.nombre.toUpperCase()}`;
  const caja=$('collageVista');caja.innerHTML=CATEGORIAS.map(([id,t])=>`<div class="ve-collage-item" data-collage="${id}"><div class="ve-collage-falta">✕</div><div class="ve-collage-label">${t}</div></div>`).join('');
  await Promise.all(CATEGORIAS.map(async([id])=>{const d=archivos.get(id);if(!d)return;const url=await urlFirmada(d.ruta_storage);const item=caja.querySelector(`[data-collage="${id}"]`);item.insertAdjacentHTML('afterbegin',`<img src="${url}" alt="">`);item.querySelector('.ve-collage-falta').remove();}));
}

async function cargar(){
  const {data:{user}}=await supabase.auth.getUser();if(!user){location.replace('login.html');return}usuario=user;
  $('cuadriculaFotos').innerHTML=CATEGORIAS.map(tarjeta).join('');
  mostrarAlbum(false);
  conectarEventosFijos();
  await precargarSalonDesdeCuenta(user.email);
}

// Si esta cuenta ya está asociada a un estudiante (por su correo interno),
// se elige su grupo automáticamente y se carga la lista de nombres para
// ahorrarle un paso; de todas formas deberá elegir su nombre y escribir
// su cédula para poder subir archivos.
async function precargarSalonDesdeCuenta(email){
  const {data:e}=await supabase.from('estudiantes').select('id,nombre,salon,correo').eq('correo',email).maybeSingle();
  if(!e||!SALONES.includes(e.salon))return;
  $('salonVida').value=e.salon;
  await cargarNombresDelSalon();
  const opcion=[...$('estudianteVida').options].find(o=>String(o.value)===String(e.id));
  if(opcion){$('estudianteVida').value=e.id;alElegirNombre();}
}

async function cargarNombresDelSalon(){
  const salon=$('salonVida').value;const selectNombre=$('estudianteVida');
  selectNombre.innerHTML='<option value="">Primero elige tu grupo</option>';selectNombre.disabled=true;
  $('cedulaVida').value='';$('cedulaVida').disabled=true;$('verCedula').disabled=true;$('verificarIdentidad').disabled=true;
  estudiante=null;estudiantesDelSalon=[];mostrarAlbum(false);
  if(!SALONES.includes(salon))return;
  selectNombre.innerHTML='<option value="">Cargando estudiantes…</option>';
  const {data,error}=await supabase.from('estudiantes').select('id,nombre,salon,cedula').eq('salon',salon).order('nombre',{ascending:true});
  if(error){selectNombre.innerHTML='<option value="">No se pudo cargar la lista. Recarga la página.</option>';mensaje('No se pudo cargar la lista de estudiantes de este grupo.','error');return}
  estudiantesDelSalon=data||[];
  if(!estudiantesDelSalon.length){selectNombre.innerHTML='<option value="">Este grupo aún no tiene estudiantes cargados.</option>';return}
  selectNombre.innerHTML='<option value="">Selecciona tu nombre</option>'+estudiantesDelSalon.map(e=>`<option value="${e.id}">${escapeHtml(e.nombre)}</option>`).join('');
  selectNombre.disabled=false;
}

function alElegirNombre(){
  const hayNombre=!!$('estudianteVida').value;
  $('cedulaVida').disabled=!hayNombre;$('verCedula').disabled=!hayNombre;$('verificarIdentidad').disabled=!hayNombre;
  if(!hayNombre)$('cedulaVida').value='';
}

async function verificarIdentidad(){
  const id=$('estudianteVida').value;const registro=estudiantesDelSalon.find(e=>String(e.id)===String(id));
  const cedulaEscrita=normalizarCedula($('cedulaVida').value);
  if(!registro){mensaje('Selecciona tu nombre de la lista.','error');return}
  if(!cedulaEscrita){mensaje('Escribe tu cédula para continuar.','error');return}
  const cedulaGuardada=normalizarCedula(registro.cedula);
  if(!cedulaGuardada){mensaje('Tu cédula todavía no está registrada en el sistema. Avisa a la dirección para que la agreguen.','error');return}
  if(cedulaEscrita!==cedulaGuardada){mensaje('La cédula no coincide con el nombre seleccionado. Verifica e intenta de nuevo.','error');return}
  estudiante={id:registro.id,nombre:registro.nombre,salon:registro.salon};
  $('nombreVida').textContent=estudiante.nombre;
  $('salonVida').disabled=true;$('estudianteVida').disabled=true;$('cedulaVida').disabled=true;$('verCedula').disabled=true;
  $('verificarIdentidad').hidden=true;$('cambiarIdentidad').hidden=false;
  mensaje(`¡Bienvenido(a), ${estudiante.nombre}! Ya puedes subir tus fotografías y tu video.`,'ok');
  await cargarArchivosDelEstudiante();
  mostrarAlbum(true);
}

function cambiarIdentidad(){
  estudiante=null;archivos=new Map();seleccion=new Map();videoSeleccionado=null;
  $('salonVida').disabled=false;$('estudianteVida').disabled=false;$('cedulaVida').disabled=false;$('cedulaVida').value='';$('verCedula').disabled=false;
  $('verificarIdentidad').hidden=false;$('verificarIdentidad').disabled=true;$('cambiarIdentidad').hidden=true;
  $('nombreVida').textContent='Preparando tu álbum…';
  mostrarAlbum(false);
  document.querySelectorAll('.ve-card').forEach(card=>pintarArchivo(card,null));
  $('previewVideo').innerHTML='<div class="ve-placeholder"><strong>🎬</strong>Agrega tu video horizontal</div>';$('eliminarVideo').hidden=true;
}

async function cargarArchivosDelEstudiante(){
  const {data,error}=await supabase.from('vida_estudiantil_recuerdos').select('*').eq('usuario_id',usuario.id);
  if(error){mensaje('Primero debes ejecutar el archivo de configuración de Supabase.','error');return}
  archivos=new Map();(data||[]).forEach(d=>archivos.set(d.categoria,d));
  for(const [id] of CATEGORIAS) await pintarArchivo(document.querySelector(`[data-categoria="${id}"]`),archivos.get(id));
  await pintarVideo();actualizarProgreso();
}

function conectarEventosFijos(){
  document.querySelectorAll('.ve-card').forEach(card=>{const id=card.dataset.categoria,input=card.querySelector('.archivo'),guardar=card.querySelector('.guardar'),descripcion=card.querySelector('.descripcion'),profesor=card.querySelector('.profesor');
    input.addEventListener('change',async()=>{const f=input.files[0];if(!f)return;try{const blob=await comprimirFoto(f);seleccion.set(id,blob);card.querySelector('.ve-preview').innerHTML=`<img src="${URL.createObjectURL(blob)}" alt="Vista previa"><span class="ve-status pendiente">Subiendo…</span>`;card.querySelector('.ve-meta').textContent=`Preparada: ${(blob.size/1024).toFixed(0)} KB`;guardar.hidden=true;await subirFoto(card,id);}catch(e){mensaje(e.message,'error');input.value=''}});
    guardar.addEventListener('click',()=>subirFoto(card,id));card.querySelector('.eliminar').addEventListener('click',()=>eliminar(id));
    descripcion.addEventListener('blur',()=>guardarComentario(card,id));
    if(profesor)profesor.addEventListener('change',()=>guardarComentario(card,id));
  });
  $('salonVida').addEventListener('change',cargarNombresDelSalon);
  $('estudianteVida').addEventListener('change',alElegirNombre);
  $('verCedula').addEventListener('click',()=>{const oculto=$('cedulaVida').type==='password';$('cedulaVida').type=oculto?'text':'password';$('verCedula').textContent=oculto?'🙈':'👁️'});
  $('cedulaVida').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();verificarIdentidad();}});
  $('verificarIdentidad').addEventListener('click',verificarIdentidad);
  $('cambiarIdentidad').addEventListener('click',cambiarIdentidad);
  $('archivoVideo').addEventListener('change',validarVideo);$('guardarVideo').addEventListener('click',subirVideo);$('eliminarVideo').addEventListener('click',()=>eliminar('video-agradecimiento'));
  $('descargarCollage').addEventListener('click',descargarCollage);$('btnSalirVida').addEventListener('click',async e=>{e.preventDefault();await supabase.auth.signOut();location.replace('login.html')});
}

async function guardarComentario(card,id){
  const dato=archivos.get(id);if(!dato)return;
  const descripcion=card.querySelector('.descripcion').value.trim();
  const profesorEl=card.querySelector('.profesor');const profesor=profesorEl?(profesorEl.value||null):(dato.profesor||null);
  if(descripcion===(dato.descripcion||'')&&profesor===(dato.profesor||null))return;
  const {data,error}=await supabase.from('vida_estudiantil_recuerdos').update({descripcion,profesor,estado:'pendiente',motivo_rechazo:null}).eq('id',dato.id).select().single();
  if(error){mensaje('No se pudo guardar el comentario. Intenta de nuevo.','error');return}
  archivos.set(id,data);await pintarArchivo(card,data);mensaje('Comentario guardado.','ok');
}

function exigirEstudiante(){if(!estudiante)throw new Error('Primero elige tu grupo, tu nombre y escribe tu cédula para verificar tu identidad.');return estudiante.salon;}
async function subirFoto(card,id){
  const blob=seleccion.get(id);if(!blob)return;const btn=card.querySelector('.guardar');try{const salon=exigirEstudiante();btn.disabled=true;btn.textContent='Subiendo…';const path=`${usuario.id}/fotos/${id}.webp`;const {error:up}=await supabase.storage.from(BUCKET).upload(path,blob,{contentType:'image/webp',upsert:true});if(up)throw up;
    const cat=CATEGORIAS.find(x=>x[0]===id);const fila={usuario_id:usuario.id,estudiante_id:estudiante.id,nombre_estudiante:estudiante.nombre,salon,categoria:id,titulo:cat[1],tipo:'foto',ruta_storage:path,mime_type:'image/webp',peso_bytes:blob.size,descripcion:card.querySelector('.descripcion').value.trim(),profesor:card.querySelector('.profesor')?.value||null,estado:'pendiente',motivo_rechazo:null};
    const {data,error}=await supabase.from('vida_estudiantil_recuerdos').upsert(fila,{onConflict:'usuario_id,categoria'}).select().single();if(error)throw error;archivos.set(id,data);seleccion.delete(id);await pintarArchivo(card,data);actualizarProgreso();mensaje('Fotografía subida y agregada a tu collage.','ok');btn.hidden=true;
  }catch(e){mensaje(e.message||'No se pudo subir la fotografía. Toca "Reintentar subida".','error');btn.hidden=false;const estado=card.querySelector('.ve-status');if(estado){estado.textContent='Error, reintenta';estado.className='ve-status rechazado'}}finally{btn.textContent='Reintentar subida';btn.disabled=!seleccion.has(id)}}

async function validarVideo(){const f=$('archivoVideo').files[0];$('guardarVideo').disabled=true;$('guardarVideo').hidden=true;if(!f)return;if(f.size>MAX_VIDEO){mensaje('El video supera 25 MB. Redúcelo antes de subirlo.','error');return}const url=URL.createObjectURL(f),v=document.createElement('video');v.preload='metadata';v.src=url;v.onloadedmetadata=async()=>{if(v.duration>60.5){mensaje('El video debe durar un minuto o menos.','error');URL.revokeObjectURL(url);return}if(v.videoWidth<=v.videoHeight){mensaje('El video debe estar grabado horizontalmente.','error');URL.revokeObjectURL(url);return}videoSeleccionado=f;$('previewVideo').innerHTML=`<video controls src="${url}"></video><span class="ve-status pendiente">Subiendo…</span>`;$('metaVideo').textContent=`${Math.ceil(v.duration)} segundos · ${(f.size/1024/1024).toFixed(1)} MB`;await subirVideo();};}
async function subirVideo(){const f=videoSeleccionado;if(!f)return;const btn=$('guardarVideo');try{const salon=exigirEstudiante();btn.disabled=true;btn.textContent='Subiendo…';const ext=(f.name.split('.').pop()||'mp4').toLowerCase();const path=`${usuario.id}/video/agradecimiento.${ext}`;const {error:up}=await supabase.storage.from(BUCKET).upload(path,f,{contentType:f.type||'video/mp4',upsert:true});if(up)throw up;const fila={usuario_id:usuario.id,estudiante_id:estudiante.id,nombre_estudiante:estudiante.nombre,salon,categoria:'video-agradecimiento',titulo:'Video final de agradecimiento',tipo:'video',ruta_storage:path,mime_type:f.type||'video/mp4',peso_bytes:f.size,estado:'pendiente',motivo_rechazo:null};const {data,error}=await supabase.from('vida_estudiantil_recuerdos').upsert(fila,{onConflict:'usuario_id,categoria'}).select().single();if(error)throw error;archivos.set('video-agradecimiento',data);videoSeleccionado=null;await pintarVideo();actualizarProgreso();mensaje('Video subido y agregado a tu álbum.','ok');btn.hidden=true;}catch(e){mensaje(e.message||'No se pudo subir el video. Toca "Reintentar subida".','error');btn.hidden=false;const estado=document.querySelector('#previewVideo .ve-status');if(estado){estado.textContent='Error, reintenta';estado.className='ve-status rechazado'}}finally{btn.textContent='Reintentar subida';btn.disabled=!videoSeleccionado}}
async function pintarVideo(){const d=archivos.get('video-agradecimiento');if(!d)return;const url=await urlFirmada(d.ruta_storage);$('previewVideo').innerHTML=`<video controls src="${url}"></video><span class="ve-status ${d.estado}">${estadoTexto(d.estado)}</span>`;$('eliminarVideo').hidden=d.estado==='aprobado';}
async function eliminar(id){const d=archivos.get(id);if(!d||!confirm('¿Seguro que deseas eliminar este archivo?'))return;const {error:a}=await supabase.storage.from(BUCKET).remove([d.ruta_storage]);if(a){mensaje(a.message,'error');return}const {error:b}=await supabase.from('vida_estudiantil_recuerdos').delete().eq('id',d.id);if(b){mensaje(b.message,'error');return}archivos.delete(id);if(id==='video-agradecimiento'){$('previewVideo').innerHTML='<div class="ve-placeholder"><strong>🎬</strong>Agrega tu video horizontal</div>';$('eliminarVideo').hidden=true}else await pintarArchivo(document.querySelector(`[data-categoria="${id}"]`),null);actualizarProgreso();mensaje('Archivo eliminado.','ok');}

function cargarImagen(url){return new Promise((ok,no)=>{const i=new Image();i.crossOrigin='anonymous';i.onload=()=>ok(i);i.onerror=no;i.src=url})}
function cover(ctx,img,x,y,w,h){const k=Math.max(w/img.width,h/img.height),sw=w/k,sh=h/k,sx=(img.width-sw)/2,sy=(img.height-sh)/2;ctx.drawImage(img,sx,sy,sw,sh,x,y,w,h)}
async function descargarCollage(){
  const salon=exigirEstudiante(),btn=$('descargarCollage');btn.disabled=true;btn.textContent='Creando collage…';try{const c=document.createElement('canvas');c.width=2400;c.height=1500;const x=c.getContext('2d');const grad=x.createLinearGradient(0,0,2400,0);grad.addColorStop(0,'#073b67');grad.addColorStop(.72,'#0b5c99');grad.addColorStop(1,'#c1121f');x.fillStyle=grad;x.fillRect(0,0,2400,210);x.fillStyle='#fff';x.textAlign='center';x.font='bold 72px Arial';x.fillText('GRADUACIÓN 2026',1200,92);x.font='bold 40px Arial';x.fillText(`C.E.B.G. EL JIRAL · SALÓN ${salonBonito(salon).toUpperCase()} · ${estudiante.nombre.toUpperCase()}`,1200,158);
    const gap=12,cols=4,cellW=(2400-gap*(cols+1))/cols,cellH=370,startY=222;
    for(let n=0;n<CATEGORIAS.length;n++){const [id,titulo]=CATEGORIAS[n],col=n%4,row=Math.floor(n/4),px=gap+col*(cellW+gap),py=startY+row*(cellH+gap),d=archivos.get(id);x.fillStyle='#fff';x.fillRect(px,py,cellW,cellH);if(d){const url=await urlFirmada(d.ruta_storage);try{cover(x,await cargarImagen(url),px,py,cellW,cellH)}catch{}}else{x.strokeStyle='#d6dee7';x.lineWidth=12;x.beginPath();x.moveTo(px+100,py+70);x.lineTo(px+cellW-100,py+cellH-90);x.moveTo(px+cellW-100,py+70);x.lineTo(px+100,py+cellH-90);x.stroke()}
      x.fillStyle='#001b33d9';x.fillRect(px,py+cellH-58,cellW,58);x.fillStyle='#fff';x.font='bold 24px Arial';x.textAlign='center';x.fillText(titulo.length>38?titulo.slice(0,36)+'…':titulo,px+cellW/2,py+cellH-21);
    }x.fillStyle='#073b67';x.fillRect(0,1380,2400,120);x.fillStyle='#fff';x.font='bold 34px Arial';x.fillText('MI VIDA ESTUDIANTIL · RECUERDOS QUE LLEVARÉ SIEMPRE',1200,1452);const a=document.createElement('a');a.download=`collage-graduando-${estudiante.nombre.replace(/\s+/g,'-')}.jpg`;a.href=c.toDataURL('image/jpeg',.92);a.click();mensaje('Collage horizontal descargado.','ok');}catch(e){mensaje(e.message||'No se pudo crear el collage.','error')}finally{btn.disabled=false;btn.textContent='✨ Descargar collage horizontal'}}

cargar();
