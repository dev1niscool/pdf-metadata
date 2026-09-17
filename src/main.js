import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { inspectStructure, cleanRenderedPdf, formatSize } from './pdf.js';
import './style.css';
pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;
const icon=(name,size=20)=>`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${{file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',shield:'<path d="M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7z"/><path d="m8 12 3 3 5-6"/>',upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 16v4h16v-4"/>',arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',check:'<path d="m5 12 4 4L19 6"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',x:'<path d="m6 6 12 12M6 18 18 6"/>'}[name]}</svg>`;
document.querySelector('#app').innerHTML=`
<header><a class="brand" href="./"><span class="brand-icon">${icon('file',23)}</span>clearpage<span class="brand-dot">.</span></a><span class="header-label">PDF METADATA VIEWER</span><span class="privacy">${icon('shield',17)} Files stay on your device</span></header>
<main><div class="intro"><div><p class="eyebrow">A LITTLE LESS ATTACHED.</p><h1>Your PDF. Without the baggage.</h1><p class="subtitle">See what’s inside your file. Keep only what belongs.</p></div><span class="local-badge"><span></span> 100% in your browser</span></div>
<section id="dropzone" class="dropzone" aria-label="Drop a PDF here"><div class="upload-icon">${icon('upload',26)}</div><h2>Drop your PDF here</h2><p>or choose a file to inspect its metadata</p><button id="choose" class="button primary">Choose PDF ${icon('arrow',17)}</button><input id="file-input" type="file" accept=".pdf,application/pdf" hidden><span class="file-limit">One PDF at a time · up to 100 MB · never uploaded</span></section>
<div id="notice" role="status" aria-live="polite" hidden></div>
<section id="workspace" hidden>
<div class="filebar"><div class="file-avatar">${icon('file',24)}</div><div class="file-info"><h2 id="filename"></h2><p id="file-summary"></p></div><button id="replace" class="button ghost">Change PDF</button></div>
<div class="workspace-grid"><section class="metadata-panel"><div class="panel-title"><div><p class="eyebrow">LOOK UNDER THE COVER</p><h2>File insights <span id="count" class="count"></span></h2></div><span class="pill">Original file</span></div><div class="tabs" role="tablist" aria-label="Metadata categories"><button class="tab active" id="tab-meta" role="tab" aria-selected="true" aria-controls="metadata-body">Metadata</button><button class="tab" id="tab-extra" role="tab" aria-selected="false" aria-controls="metadata-body" tabindex="-1">Embedded & provenance</button><button class="tab" id="tab-file" role="tab" aria-selected="false" aria-controls="metadata-body" tabindex="-1">File details</button></div><div id="metadata-body" role="tabpanel" aria-labelledby="tab-meta"></div></section>
<aside class="clean-panel"><div class="clean-icon">${icon('shield',26)}</div><p class="eyebrow">A FRESH START</p><h2>Remove all metadata</h2><p class="clean-description">Rebuild your visible pages into a fresh PDF, leaving the hidden information behind.</p><ul class="checklist"><li>${icon('check',16)} Author, title, dates & software</li><li>${icon('check',16)} XMP, document IDs & C2PA data</li><li>${icon('check',16)} Attachments, scripts & hidden objects</li></ul><label class="quality-label" for="quality">Page quality</label><select id="quality"><option value="180">Balanced · 180 DPI</option><option value="240">High quality · 240 DPI</option><option value="300">Print quality · 300 DPI</option></select><div class="tradeoff"><strong>Creates an image-only PDF</strong><p>Text search, links, forms, annotations, accessibility tags and digital signatures are removed. Visible names or other identifying content remain. Large pages may use a lower resolution.</p></div><button id="clean" class="button primary">${icon('download',18)} Remove metadata & download</button><button id="cancel" class="button ghost" hidden>Cancel</button><progress id="progress" max="100" value="0" hidden aria-label="Cleaning progress"></progress><p id="clean-status" aria-live="polite">Your original file stays untouched.</p></aside></div></section>
<section id="empty-guide" class="guide"><article><span class="step">01</span><h3>Inspect the invisible</h3><p>Find authors, creation dates, software details and embedded provenance.</p></article><article><span class="step">02</span><h3>Leave less behind</h3><p>Create a fresh copy from the visible pages, without carrying hidden data over.</p></article><article><span class="step">03</span><h3>Keep it private</h3><p>Your PDF is processed on your device. No accounts, uploads or file storage.</p></article></section>
<details class="limits"><summary>What can—and can’t—be removed?</summary><p>The clean copy contains rendered page images and the basic PDF structure needed to display them. PDF version, file type, page count and file size are structural facts, not personal metadata. Your operating system assigns the download’s filename, timestamps and permissions; a website cannot erase those. The filename defaults to cleaned.pdf.</p><p>Cleaning removes embedded C2PA/provenance records and invalidates original signatures. It does not redact visible content or guarantee anonymity: text or watermarks visible on the page remain. The viewer reports supported metadata and detected provenance; it is not an exhaustive forensic scanner or a C2PA signature verifier.</p><p>Files are never uploaded. This site has no analytics, and its PDF libraries are served with the site. Password-protected files require their password to open.</p></details>
<footer><span>Made for a cleaner handoff.</span><span>${icon('shield',14)} Local processing. A little peace of mind.</span></footer></main>
<dialog id="password-dialog"><form method="dialog"><h2>This PDF is locked</h2><p id="password-message">Enter its password to inspect it locally.</p><label for="password">PDF password</label><input id="password" type="password" autocomplete="off" required><div class="dialog-buttons"><button id="password-cancel" type="button" class="button ghost">Cancel</button><button class="button primary" value="open">Open PDF</button></div></form></dialog>`;
const $=s=>document.querySelector(s);
let current=null, rows=[], tab='meta', busy=false, controller=null, loadingTask=null, downloadUrl=null;
const setNotice=(text,error=false)=>{const n=$('#notice');n.hidden=!text;n.textContent=text;n.className=error?'notice error':'notice';};
function setBusy(value){busy=value;for(const id of ['choose','replace','clean','quality']) $('#'+id).disabled=value;$('#dropzone').classList.toggle('busy',value);}
function tableRows(list){
  const holder=document.createElement('div');holder.className='metadata-list';
  if(!list.length){const p=document.createElement('p');p.className='empty-meta';p.textContent='No fields detected in this category.';holder.append(p);return holder;}
  for(const row of list){const item=document.createElement('div');item.className='metadata-row';const key=document.createElement('div');key.className='metadata-key';key.textContent=row.key;const value=document.createElement('div');value.className='metadata-value';value.textContent=String(row.value);item.append(key,value);holder.append(item);}return holder;
}
function showTab(name){tab=name;const body=$('#metadata-body');body.replaceChildren();for(const key of ['meta','extra','file']){const button=$('#tab-'+key);button.classList.toggle('active',key===name);button.setAttribute('aria-selected',key===name);button.tabIndex=key===name?0:-1;}body.setAttribute('aria-labelledby','tab-'+name);const selected=rows.filter(r=>r.tab===tab);body.append(tableRows(selected));if(name==='extra'){const p=document.createElement('p');p.className='table-note';p.textContent='Detected fields and supported payloads. Provenance signatures are not verified; an empty result does not prove that no hidden data exists.';body.append(p);}if(name==='file'){const p=document.createElement('p');p.className='table-note';p.textContent='File-system timestamps and names belong to your device. File type, size, version and page count remain necessary in the clean copy.';body.append(p);}}
for(const key of ['meta','extra','file']) {$('#tab-'+key).onclick=()=>showTab(key);$('#tab-'+key).onkeydown=e=>{const keys=['meta','extra','file'];if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();let i=keys.indexOf(key);i=e.key==='Home'?0:e.key==='End'?2:(i+(e.key==='ArrowRight'?1:2))%3;showTab(keys[i]);$('#tab-'+keys[i]).focus();}};}
function passwordRequest(update,reason){const dialog=$('#password-dialog');$('#password-message').textContent=reason===pdfjs.PasswordResponses.INCORRECT_PASSWORD?'That password did not work. Try again.':'Enter its password to inspect it locally.';$('#password').value='';dialog.onclose=()=>{if(dialog.returnValue==='open'){const password=$('#password').value;$('#password').value='';update(password);}else{loadingTask?.destroy();}};dialog.returnValue='';dialog.showModal();$('#password').focus();}
$('#password-cancel').onclick=()=>$('#password-dialog').close('cancel');
async function openFile(file){
 if(busy||!file)return;
 if(file.size>100*1024*1024){setNotice('Choose a PDF smaller than 100 MB.',true);return;}
 if(!/\.pdf$/i.test(file.name)&&file.type!=='application/pdf'){setNotice('Please choose a PDF file.',true);return;}
 setBusy(true);setNotice('Reading your PDF locally…');let next=null;
 try {
   const bytes=new Uint8Array(await file.arrayBuffer());
   if(!new TextDecoder().decode(bytes.subarray(0,1024)).includes('%PDF-'))throw new Error('This file does not appear to be a PDF.');
   const assetBase=new URL('.',window.location.href).href;
   loadingTask=pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false,enableXfa:false,stopAtErrors:true,cMapUrl:assetBase+'cmaps/',cMapPacked:true,standardFontDataUrl:assetBase+'standard_fonts/',wasmUrl:assetBase+'wasm/'});
   loadingTask.onPassword=passwordRequest;next=await loadingTask.promise;
   const [metadata,structure]=await Promise.all([next.getMetadata(),inspectStructure(bytes)]);
   const attachments=await next.getAttachments();
   rows=structure.rows.map(r=>({...r,tab:r.group==='Document metadata'?'meta':'extra'}));
   const seen=new Set(rows.filter(r=>r.tab==='meta').map(r=>r.key));
   for(const [key,value] of Object.entries(metadata.info))if(value!=null && !seen.has(key)&&!['PDFFormatVersion','IsLinearized','IsAcroFormPresent','IsXFAPresent','IsCollectionPresent','IsSignaturesPresent','Language','EncryptFilter'].includes(key))rows.push({tab:'meta',key,value:typeof value==='object'?JSON.stringify(value):String(value)});
   if(metadata.metadata)for(const [key,value] of metadata.metadata)rows.push({tab:'extra',key,value:typeof value==='object'?JSON.stringify(value):value});
   rows.push({tab:'extra',key:'C2PA / JUMBF markers',value:structure.marker?'Detected (not cryptographically verified)':'Not detected in inspected data'});
   for(const entry of structure.provenance)rows.push({...entry,tab:'extra'});
   for(const [name,value] of Object.entries(attachments||{}))rows.push({tab:'extra',key:'Attachment',value:`${name} (${formatSize(value.content.length)})`});
   for(const [key,value] of Object.entries({'File name':file.name,'File size':formatSize(file.size),'File modified (device)':file.lastModified?new Date(file.lastModified).toLocaleString():'Unavailable','File type':'PDF · application/pdf','PDF version':metadata.info.PDFFormatVersion||'Unknown','Pages':next.numPages,'Linearized':metadata.info.IsLinearized?'Yes':'No','Interactive forms':metadata.info.IsAcroFormPresent?'Yes':'No','Signatures':metadata.info.IsSignaturesPresent?'Present':'Not reported','File permissions / inode / access time':'Not exposed to websites'}))rows.push({tab:'file',key,value});
   if(current)await current.pdf.destroy();current={pdf:next,file};next=null;
   $('#filename').textContent=file.name;$('#file-summary').textContent=`${formatSize(file.size)} · ${current.pdf.numPages} ${current.pdf.numPages===1?'page':'pages'} · Ready to inspect`;
   $('#count').textContent=rows.filter(r=>r.tab==='meta').length;
   $('#workspace').hidden=false;$('#empty-guide').hidden=true;$('#dropzone').hidden=true;
   $('#clean-status').textContent='Your original file stays untouched.';$('#clean-status').className='';showTab('meta');setNotice(structure.warnings.join(' '));
 } catch(error){if(next)await next.destroy();setNotice(error.message?.includes('Worker was destroyed')?'Opening cancelled.':`Could not open PDF. ${error.message||'Try another file.'}`,true);} finally {loadingTask=null;setBusy(false);$('#file-input').value='';}
}
$('#choose').onclick=$('#replace').onclick=()=>$('#file-input').click();$('#file-input').onchange=e=>openFile(e.target.files[0]);
let dragDepth=0;
document.addEventListener('dragover',e=>{e.preventDefault();if(!busy)$('#dropzone').classList.add('dragging');});
document.addEventListener('dragenter',e=>{e.preventDefault();dragDepth++;});
document.addEventListener('dragleave',()=>{if(--dragDepth<=0){dragDepth=0;$('#dropzone').classList.remove('dragging');}});
document.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;$('#dropzone').classList.remove('dragging');if(e.dataTransfer.files.length>1){setNotice('Drop one PDF at a time.',true);return;}openFile(e.dataTransfer.files[0]);});
$('#cancel').onclick=()=>controller?.abort();
$('#clean').onclick=async()=>{
 if(!current||busy)return;setBusy(true);setNotice('');controller=new AbortController();$('#cancel').hidden=false;$('#progress').hidden=false;$('#progress').value=0;$('#clean-status').className='';
 try {
  const bytes=await cleanRenderedPdf(current.pdf,{dpi:Number($('#quality').value),signal:controller.signal,onProgress:(n,total)=>{$('#progress').value=n/total*100;$('#clean-status').textContent=n===total?'Checking the clean copy…':`Rebuilding page ${n+1} of ${total}…`;}});
  if(downloadUrl)URL.revokeObjectURL(downloadUrl);downloadUrl=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));const a=document.createElement('a');a.href=downloadUrl;a.download='cleaned.pdf';document.body.append(a);a.click();a.remove();
  $('#clean-status').textContent=`Clean copy downloaded · ${formatSize(bytes.length)}. Metadata checks passed.`;$('#clean-status').className='success';
 }catch(error){$('#clean-status').textContent=controller.signal.aborted?'Cancelled. Your original file is unchanged.':`Cleaning failed: ${error.message}`;}finally{controller=null;setBusy(false);$('#cancel').hidden=true;$('#progress').hidden=true;}
};
