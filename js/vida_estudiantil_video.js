// Conversión local: mantiene el audio y nunca envía el original a terceros.
const LIMITE=25*1024*1024;
export async function prepararVideo(file, progreso=()=>{}){
  if(file.size>200*1024*1024)throw new Error('El original supera 200 MB. Elige un video más pequeño.');
  const url=URL.createObjectURL(file), video=document.createElement('video');
  video.playsInline=true;video.preload='auto';video.src=url;
  let stream,recorder,timer;
  try {
    progreso('Revisando duración y formato…');
    await new Promise((resolve,reject)=>{
      const t=setTimeout(()=>reject(new Error('No se pudo leer el video en 20 segundos. Prueba con MP4 H.264.')),20000);
      video.onloadedmetadata=()=>{clearTimeout(t);resolve();};
      video.onerror=()=>{clearTimeout(t);reject(new Error('Este teléfono no puede leer el formato. Conviértelo a MP4 H.264 con audio AAC y vuelve a elegirlo.'));};
    });
    if(!Number.isFinite(video.duration)||video.duration<=0||video.duration>60.5)throw new Error('El video debe durar entre 1 segundo y 1 minuto.');
    if(!video.videoWidth||video.videoWidth<=video.videoHeight)throw new Error('Graba el video horizontalmente (ancho mayor que alto).');
    const ext=file.name.split('.').pop().toLowerCase();
    if(['mp4','webm'].includes(ext)&&file.size<=LIMITE){
      return new File([file],`agradecimiento.${ext}`,{type:ext==='mp4'?'video/mp4':'video/webm'});
    }
    const capture=video.captureStream||video.mozCaptureStream;
    const mime=window.MediaRecorder&&['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/webm;codecs=vp8,opus','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
    if(!capture||!mime){
      if(ext==='mov'&&file.size<=LIMITE){progreso('Video MOV compatible con este teléfono. Preparando subida…');return new File([file],'agradecimiento.mov',{type:'video/quicktime'});}
      throw new Error('Este navegador no permite convertir este video. Usa MP4 H.264 de hasta 25 MB o intenta desde Chrome en Android o computadora.');
    }
    progreso('Convirtiendo video… Mantén esta pantalla abierta hasta terminar (máximo un minuto).');
    // La reproducción audible conserva el audio en la captura. No silenciar el elemento.
    await video.play();video.pause();video.currentTime=0;
    stream=capture.call(video);
    if(!stream.getVideoTracks().length)throw new Error('No se pudo capturar la imagen del video. Prueba con MP4 H.264.');
    recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:1800000,audioBitsPerSecond:128000});
    const chunks=[];
    const blob=await new Promise((resolve,reject)=>{
      let size=0;
      timer=setTimeout(()=>{reject(new Error('La conversión tardó demasiado. Mantén la página abierta e inténtalo otra vez.'));},90000);
      recorder.ondataavailable=e=>{if(e.data.size){size+=e.data.size;chunks.push(e.data);if(size>LIMITE)reject(new Error('El video convertido supera 25 MB. Reduce su resolución.'));}};
      recorder.onerror=()=>reject(new Error('No se pudo convertir el video. Usa MP4 H.264.'));
      recorder.onstop=()=>resolve(new Blob(chunks,{type:mime.split(';')[0]}));
      video.onended=()=>{if(recorder.state!=='inactive')recorder.stop();};
      video.ontimeupdate=()=>progreso(`Convirtiendo… ${Math.min(99,Math.round(video.currentTime/video.duration*100))}% · No cierres la página.`);
      recorder.start(500);video.play().catch(reject);
    });
    if(!blob.size||blob.size>LIMITE)throw new Error('La conversión no produjo un video válido de hasta 25 MB.');
    return new File([blob],mime.startsWith('video/mp4')?'agradecimiento.mp4':'agradecimiento.webm',{type:blob.type});
  } finally {
    clearTimeout(timer);if(recorder&&recorder.state!=='inactive')recorder.stop();video.pause();stream?.getTracks().forEach(t=>t.stop());video.removeAttribute('src');video.load();URL.revokeObjectURL(url);
  }
}
