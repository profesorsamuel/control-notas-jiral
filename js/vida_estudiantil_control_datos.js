export const CATEGORIAS={padres:'Padres o acudientes',directora:'Directora',profesores:'Profesores',personal:'Administrativos',companeros:'Compañeros',salon:'En el salón',deportes:'Deportes',actividad:'Actividad escolar',patria:'Mes de la Patria','curiosa-1':'Curiosa 1','curiosa-2':'Curiosa 2','curiosa-3':'Curiosa 3','video-agradecimiento':'Video'};
export function calcular(e){const entregas=new Set((e.entregas||[]).filter(c=>Object.hasOwn(CATEGORIAS,c))),total=entregas.size;return {...e,total,fotos:[...entregas].filter(c=>c!=='video-agradecimiento').length,video:entregas.has('video-agradecimiento'),nota:Math.round((1+4*total/13)*10)/10,pendientes:Object.keys(CATEGORIAS).filter(c=>!entregas.has(c))};}
export function seleccionar(datos,{salon='',estado='',buscar='',orden='nombre'}={}){
 const normal=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const lista=datos.filter(e=>(!salon||e.salon===salon)&&normal(e.nombre).includes(normal(buscar))&&(!estado||(estado==='completo'?e.total===13:estado==='incompleto'?e.total<13:estado==='cero'?e.total===0:estado==='sinvideo'?!e.video:true)));
 const nombre=(a,b)=>String(a.nombre).localeCompare(String(b.nombre),'es');
 return lista.sort((a,b)=>(orden==='nombre-desc'?-nombre(a,b):orden==='nota-desc'?b.nota-a.nota:orden==='nota-asc'?a.nota-b.nota:orden==='pendientes'?a.total-b.total:orden==='salon'?a.salon.localeCompare(b.salon):nombre(a,b))||nombre(a,b));
}
