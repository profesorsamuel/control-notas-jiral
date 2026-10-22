import {supabase} from './supabase.js';
import {calcular,seleccionar,CATEGORIAS} from './vida_estudiantil_control_datos.js';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let token='',datos=[],visible=[],cargando=false;
function aviso(t){$('aviso').textContent=t;}
function cerrar(){token='';datos=[];visible=[];$('filas').innerHTML='';$('resumen').innerHTML='';$('panel').hidden=true;$('salir').hidden=true;$('acceso').hidden=false;$('clave').value='';}
$('acceso').addEventListener('submit',async e=>{
 e.preventDefault();if(cargando)return;cargando=true;$('entrar').disabled=true;aviso('Comprobando acceso…');
 try{
  let {data:{user},error}=await supabase.auth.getUser();
  if(!user){const resultado=await supabase.auth.signInAnonymously();if(resultado.error)throw resultado.error;}
  const r=await supabase.rpc('vida_control_entrar',{p_clave:$('clave').value});
  if(r.error)throw r.error;if(r.data?.error)throw new Error(r.data.error);if(!r.data?.token)throw new Error('No se pudo verificar el acceso.');
  token=r.data.token;$('clave').value='';$('acceso').hidden=true;$('panel').hidden=false;$('salir').hidden=false;aviso('');
 }catch(e){aviso(e.message+' Si falta la función, ejecuta el SQL incluido.');}
 finally{cargando=false;$('entrar').disabled=false;}
 if(token)await cargar();
});
async function cargar(){
 if(!token||cargando)return;cargando=true;$('actualizar').disabled=true;$('csv').disabled=true;aviso('Cargando entregas…');
 try{const {data,error}=await supabase.rpc('vida_control_listar',{p_token:token});if(error)throw error;
 datos=(data||[]).map(calcular);pintar();$('fecha').textContent='Actualizado: '+new Date().toLocaleString('es-PA');aviso('');
 }catch(e){cerrar();aviso(e.message);}
 finally{cargando=false;$('actualizar').disabled=false;$('csv').disabled=false;}
}
function pintar(){
 const opciones=Object.fromEntries(['salon','estado','buscar','orden'].map(k=>[k,$(k).value.trim()]));visible=seleccionar(datos,opciones);
 const grupo=datos.filter(e=>!opciones.salon||e.salon===opciones.salon);
 $('resumen').innerHTML=[[grupo.length,'Estudiantes'],[grupo.filter(e=>e.total===13).length,'Completos'],[grupo.filter(e=>e.total<13).length,'Incompletos'],[grupo.filter(e=>e.total===0).length,'Sin comenzar']].map(([n,t])=>`<div><strong>${n}</strong>${t}</div>`).join('');
 $('cantidad').textContent=`${visible.length} estudiantes en la lista · resumen del salón seleccionado`;
 $('filas').innerHTML=visible.length?visible.map(e=>`<tr class="${e.total===13?'completo':''}">${[e.nombre,e.salon,e.fotos+'/12',e.video?'Sí':'No',e.total+'/13',e.nota.toFixed(1),e.pendientes.length?e.pendientes.map(c=>CATEGORIAS[c]).join(', '):'✓ Todo entregado'].map((v,i)=>`<td data-label="${['Nombre','Salón','Fotos','Video','Total','Nota','Faltan'][i]}" class="${i===5?'control-nota':''}">${esc(v)}</td>`).join('')}</tr>`).join(''):'<tr><td colspan="7">No hay estudiantes con estos filtros.</td></tr>';
}
for(const k of ['salon','estado','orden'])$(k).addEventListener('change',pintar);$('buscar').addEventListener('input',pintar);$('actualizar').addEventListener('click',cargar);
$('salir').addEventListener('click',async()=>{const anterior=token;cerrar();aviso('Acceso cerrado.');if(anterior)await supabase.rpc('vida_control_salir',{p_token:anterior});});
$('imprimir').addEventListener('click',()=>window.print());
$('csv').addEventListener('click',()=>{
 if(!visible.length)return aviso('No hay estudiantes para descargar.');
 const celda=v=>'"'+String(v).replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';
 const filas=[['Nombre','Salón','Fotos de 12','Video','Entregas de 13','Nota de 1 a 5','Pendientes'],...visible.map(e=>[e.nombre,e.salon,e.fotos,e.video?'Sí':'No',e.total,e.nota.toFixed(1),e.pendientes.map(c=>CATEGORIAS[c]).join(', ')])];
 const url=URL.createObjectURL(new Blob(['\ufeff'+filas.map(f=>f.map(celda).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='Entregas_graduandos.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
