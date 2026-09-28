'use strict';
const $ = id => document.getElementById(id);
const cfg = window.XIAOMAI_CONFIG || {};
let source, output, busy = false, aborter;
const endpoint = cfg.endpoint || ''; 
const names = { sky:'晴空蓝海', sunset:'自然黄昏' };
const effect = () => document.querySelector('[name=effect]:checked').value;
const status = (s, error=false) => { $('status').textContent=s; $('status').dataset.error=error; };
const canvas = (w,h) => { const c=document.createElement('canvas'); c.width=w; c.height=h; return c; };
const load = src => new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('图片无法读取'));i.src=src;});
const blobOf = c => new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('无法导出图片')),'image/png'));
function hasLargeNewSubject(original, generated) {
 const scale=640/Math.max(original.width,original.height), w=Math.max(64,Math.round(original.width*scale)), h=Math.max(64,Math.round(original.height*scale));
 const before=canvas(w,h), after=canvas(w,h);
 before.getContext('2d',{willReadFrequently:true}).drawImage(original,0,0,w,h);
 after.getContext('2d',{willReadFrequently:true}).drawImage(generated,0,0,w,h);
 return detectLargeNewSubject(before.getContext('2d').getImageData(0,0,w,h).data,after.getContext('2d').getImageData(0,0,w,h).data,w,h);
}
function clearResult(){if(output)URL.revokeObjectURL(output.url);output=null;['afterLayer','divider','afterLabel','compare','download'].forEach(id=>$(id).hidden=true);}
function sync(){
 $('generate').disabled=busy||!source; $('generate').textContent=busy?'处理中…':'免费生成照片 ↗';
 $('replace').disabled=busy; $('cancel').hidden=!busy;
 document.querySelectorAll('[name=effect]').forEach(el=>el.disabled=busy);
}
$('upload').onclick=$('replace').onclick=()=>{if(!busy)$('file').click();};
$('file').onchange=async()=>{
 const file=$('file').files[0];$('file').value='';if(!file||busy)return;
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024)return status('请选择不超过 10 MB 的 JPG、PNG 或 WebP 图片',true);
 busy=true;sync();const u=URL.createObjectURL(file);
 try{const img=await load(u);if(img.naturalWidth*img.naturalHeight>40000000)throw Error('图片过大，请先缩小至 4000 万像素以内');
 const scale=Math.min(1,2560/Math.max(img.naturalWidth,img.naturalHeight));const c=canvas(Math.round(img.naturalWidth*scale),Math.round(img.naturalHeight*scale));c.getContext('2d').drawImage(img,0,0,c.width,c.height);
 clearResult();if(source)URL.revokeObjectURL(source.url);source={canvas:c,url:URL.createObjectURL(await blobOf(c))};$('original').src=source.url;
 $('frame').style.aspectRatio=`${c.width}/${c.height}`;$('frame').style.width=`min(100%,${42*c.width/c.height}svh)`;
 $('preview').hidden=false;$('upload').hidden=true;$('replace').hidden=false;
 status('照片已载入，选择模式后生成。');
 }catch(e){status(e.message,true);}finally{URL.revokeObjectURL(u);busy=false;sync();}
};
async function show(c){const blob=await blobOf(c);output={blob,url:URL.createObjectURL(blob),name:names[effect()]};$('result').src=output.url;['afterLayer','divider','afterLabel','compare','download'].forEach(id=>$(id).hidden=false);$('compare').value=50;compare();$('previewHint').hidden=false;}
$('generate').onclick=async()=>{
 if(!source||busy)return;
 clearResult();busy=true;sync();let timer;
 try{const c=canvas(source.canvas.width,source.canvas.height);c.getContext('2d').drawImage(source.canvas,0,0);
 status('正在调用 AI，一次生成一次请求，请勿重复提交。');aborter=new AbortController();timer=setTimeout(()=>aborter.abort(),cfg.timeoutMs||180000);
 const response=await fetch(endpoint||'/invoke',{method:'POST',headers:{'Content-Type':'application/json'},signal:aborter.signal,body:JSON.stringify({mode:effect()==='sky'?'sunny':'sunset',image:c.toDataURL('image/jpeg',0.92),width:c.width,height:c.height})});
 const data=await response.json();if(!response.ok||!data.ok)throw Error(`${data.error||'调用失败'}${data.code?'（'+data.code+'）':''}`);
 if(!/^data:image\/(png|jpeg|webp);base64,/.test(data.image))throw Error('后端未返回图片 Data URL，请部署新版后端');
 const edited=await load(data.image);if(aborter.signal.aborted)throw Error('请求已取消或超时');if(Math.abs((edited.naturalWidth/edited.naturalHeight)/(c.width/c.height)-1)>0.015)throw Error('返回比例不一致，未合成结果');
 if(hasLargeNewSubject(source.canvas,edited))throw Error('生成结果疑似新增大面积人物或物体，已拦截本次结果。请稍后再试，或换一张照片。');
 c.getContext('2d').drawImage(edited,0,0,c.width,c.height);await show(c);status('AI 处理完成，请对比确认人物及场景细节。');
 }catch(e){status(e.name==='AbortError'?'已取消或超时；后端可能仍在处理，请勿连续重试。':e instanceof TypeError?'无法连接 AI 服务，请稍后重试。':e.message,true);}finally{clearTimeout(timer);aborter=null;busy=false;sync();}
};
function compare(){const v=$('compare').value;$('afterLayer').style.clipPath=`inset(0 0 0 ${v}%)`;$('divider').style.left=v+'%';}
$('compare').oninput=compare;$('cancel').onclick=()=>aborter?.abort();
 document.querySelectorAll('[name=effect]').forEach(el=>el.onchange=()=>{clearResult();sync();status('已选择固定效果，点击 AI 生成。');});
$('download').onclick=()=>{if(!output)return;const a=document.createElement('a');a.href=output.url;a.download=`小麦岛-${output.name}-${Date.now()}.png`;a.click();};
sync();

