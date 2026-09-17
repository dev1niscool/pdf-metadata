import { PDFDocument, PDFName, PDFDict, PDFRawStream, PDFString, PDFHexString, decodePDFRawStream } from 'pdf-lib';
import { decodeMultiple } from 'cbor-x';

const textDecoder = new TextDecoder();
export const formatSize = bytes => bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
function stringify(value) {
  if (value instanceof Uint8Array) return `[Binary data: ${value.length} bytes]`;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Map) return Object.fromEntries(value);
  return value;
}
function display(obj) {
  if(obj instanceof PDFRawStream) return `[PDF stream: ${obj.contents.length} bytes]`;
  if(obj instanceof PDFString || obj instanceof PDFHexString) { try {return obj.decodeText();} catch {} }
  return String(obj);
}
export function provenanceDetails(bytes) {
  // JUMBF boxes are length-prefixed big-endian ISO boxes. Scan for bounded
  // cbor/json/xml payload boxes; this is inspection, not signature verification.
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries=[];
  for(let i=4;i+4<bytes.length;i++) {
    if(bytes[i]!==99 && bytes[i]!==106 && bytes[i]!==120) continue;
    const type=String.fromCharCode(...bytes.subarray(i,i+4));
    if(!['cbor','json','xml '].includes(type)) continue;
    const size=view.getUint32(i-4);
    if(size<8 || i-4+size>bytes.length || size>8_000_000) continue;
    const payload=bytes.subarray(i+4,i-4+size);
    try {
      const value=type==='cbor' ? decodeMultiple(payload) : textDecoder.decode(payload);
      entries.push({key:`${type.trim().toUpperCase()} payload ${entries.length+1}`,value:typeof value==='string'?value:JSON.stringify(value,(_,v)=>stringify(v),2)});
    } catch {entries.push({key:`${type.trim().toUpperCase()} payload`,value:`${payload.length} bytes (could not decode)`});}
    i+=size-5;
  }
  return entries;
}
export async function inspectStructure(bytes) {
  let doc;
  try {doc=await PDFDocument.load(bytes,{updateMetadata:false,throwOnInvalidObject:true});}
  catch {return {rows:[],provenance:[],warnings:['Extended object inspection was unavailable. Standard metadata and rendered cleaning are still available.']};}
  const rows=[],provenance=[];
  const info=doc.context.lookup(doc.context.trailerInfo.Info);
  if(info instanceof PDFDict) for(const [key,value] of info.entries()) rows.push({group:'Document metadata',key:key.decodeText(),value:display(doc.context.lookup(value))});
  if(doc.context.trailerInfo.ID) rows.push({group:'Document metadata',key:'Document IDs',value:display(doc.context.trailerInfo.ID)});
  for(const [ref,obj] of doc.context.enumerateIndirectObjects()) {
    const dict=obj instanceof PDFRawStream?obj.dict:obj instanceof PDFDict?obj:null;
    if(!dict) continue;
    const type=display(dict.get(PDFName.of('Type')));
    if(obj instanceof PDFRawStream && (type==='/Metadata'||type==='/EmbeddedFile'||dict.has(PDFName.of('C2PA'))||display(dict.get(PDFName.of('Subtype'))).includes('jumbf'))) {
      let content; try {content=decodePDFRawStream(obj).decode();} catch {content=obj.contents;}
      if(type==='/Metadata') rows.push({group:'XMP & embedded data',key:`Metadata stream (${ref})`,value:textDecoder.decode(content).slice(0,100000)});
      else rows.push({group:'XMP & embedded data',key:`${type.slice(1)||'Embedded'} stream (${ref})`,value:formatSize(content.length)});
      provenance.push(...provenanceDetails(content));
    }
    for(const [key,value] of dict.entries()) {
      if(['C2PA','AF','EmbeddedFiles','JUMBF','URI','F','UF','Desc','NM','T','M','CreationDate','ModDate','LastModified','PieceInfo'].includes(key.decodeText()))
        rows.push({group:'Object details',key:`${key.decodeText()} · object ${ref}`,value:display(doc.context.lookup(value)).slice(0,10000)});
    }
  }
  provenance.push(...provenanceDetails(bytes));
  const unique=[...new Map(provenance.map(e=>[e.value,e])).values()];
  const raw=textDecoder.decode(bytes);
  const marker=/c2pa|jumbf/i.test(raw)||unique.length>0;
  return {rows,provenance:unique,marker,warnings:[]};
}
export async function cleanRenderedPdf(pdf, {dpi=180,onProgress=()=>{},signal}={}) {
  const output=await PDFDocument.create({updateMetadata:false});
  for(let n=1;n<=pdf.numPages;n++) {
    if(signal?.aborted) throw new DOMException('Cancelled','AbortError');
    onProgress(n-1,pdf.numPages);
    const page=await pdf.getPage(n);
    const base=page.getViewport({scale:1});
    const scale=Math.min(dpi/72,Math.sqrt(16_000_000/(base.width*base.height)),8192/Math.max(base.width,base.height));
    const viewport=page.getViewport({scale});
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.ceil(viewport.width));canvas.height=Math.max(1,Math.ceil(viewport.height));
    const context=canvas.getContext('2d',{alpha:false});
    const render=page.render({canvasContext:context,viewport,background:'rgb(255,255,255)',annotationMode:0});
    const cancel=()=>render.cancel();signal?.addEventListener('abort',cancel,{once:true});
    try {
      await render.promise;
      if(signal?.aborted) throw new DOMException('Cancelled','AbortError');
      const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Could not render this page.')),'image/png'));
      const image=await output.embedPng(await blob.arrayBuffer());
      const outputPage=output.addPage([base.width,base.height]);
      outputPage.drawImage(image,{x:0,y:0,width:base.width,height:base.height});
      outputPage.node.delete(PDFName.of('Annots'));

    } finally {signal?.removeEventListener('abort',cancel);canvas.width=0;canvas.height=0;page.cleanup();}
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  delete output.context.trailerInfo.Info;
  delete output.context.trailerInfo.ID;
  const result=await output.save({useObjectStreams:false});
  await verifyCleanPdf(result,pdf.numPages);
  onProgress(pdf.numPages,pdf.numPages);
  return result;
}
export async function verifyCleanPdf(bytes,pageCount) {
  const doc=await PDFDocument.load(bytes,{updateMetadata:false});
  if(doc.getPageCount()!==pageCount||doc.context.trailerInfo.Info||doc.context.trailerInfo.ID) throw new Error('Output validation failed. No file was downloaded.');
  const forbidden=['Metadata','EmbeddedFiles','AF','AcroForm','Annots','OpenAction','AA','JavaScript','PieceInfo','C2PA'];
  for(const [,obj] of doc.context.enumerateIndirectObjects()) {
    const dict=obj instanceof PDFRawStream?obj.dict:obj instanceof PDFDict?obj:null;
    if(dict&&forbidden.some(key=>dict.has(PDFName.of(key)))) throw new Error('Output contains unexpected metadata. No file was downloaded.');
  }
  return true;
}
