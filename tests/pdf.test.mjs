import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDocument, PDFName } from 'pdf-lib';
import { inspectStructure, cleanRenderedPdf, verifyCleanPdf, provenanceDetails } from '../src/pdf.js';
import { fixture } from './fixture.mjs';

globalThis.document={createElement(name){assert.equal(name,'canvas');const canvas=createCanvas(1,1);canvas.toBlob=callback=>callback(new Blob([canvas.toBuffer('image/png')],{type:'image/png'}));return canvas;}};
const source=await fixture();
const params={data:source.slice(),isEvalSupported:false,standardFontDataUrl:new URL('../node_modules/pdfjs-dist/standard_fonts/',import.meta.url).pathname};
test('extracts custom metadata, compressed XMP, attachment details and compressed C2PA CBOR',async()=>{const result=await inspectStructure(source);const values=JSON.stringify(result);for(const secret of ['TEST_AUTHOR_SECRET','TEST_XMP_SECRET','TEST_C2PA_SECRET','TEST_ANNOTATION_SECRET'])assert.ok(values.includes(secret),secret);assert.equal(result.marker,true);});
test('rebuild removes hidden data, preserves dimensions/rotation and renders matching page pixels',async()=>{
 const input=await pdfjs.getDocument(params).promise;const progress=[];
 const bytes=await cleanRenderedPdf(input,{dpi:180,onProgress:n=>progress.push(n)});
 assert.ok(await verifyCleanPdf(bytes,2));assert.deepEqual(progress,[0,1,2]);
 const output=await PDFDocument.load(bytes,{updateMetadata:false});assert.equal(output.context.trailerInfo.Info,undefined);assert.equal(output.catalog.get(PDFName.of('Metadata')),undefined);
 assert.deepEqual(output.getPages().map(p=>[p.getWidth(),p.getHeight()]),[[360,480],[360,240]]);
 assert.equal(new TextDecoder().decode(bytes).includes('TEST_'),false);
 const rendered=await pdfjs.getDocument({data:bytes.slice()}).promise;
 for(let n=1;n<=2;n++){
  const before=await input.getPage(n),after=await rendered.getPage(n);const viewport=before.getViewport({scale:1});
  const a=createCanvas(viewport.width,viewport.height),b=createCanvas(viewport.width,viewport.height);
  await before.render({canvasContext:a.getContext('2d'),viewport,annotationMode:0}).promise;
  await after.render({canvasContext:b.getContext('2d'),viewport:after.getViewport({scale:1}),annotationMode:0}).promise;
  const x=a.getContext('2d').getImageData(0,0,a.width,a.height).data,y=b.getContext('2d').getImageData(0,0,b.width,b.height).data;
  let error=0;for(let i=0;i<x.length;i++)error+=Math.abs(x[i]-y[i]);assert.ok(error/x.length<3,'Visual pixel difference within tolerance');
  assert.equal((await after.getTextContent()).items.length,0);assert.equal((await after.getAnnotations()).length,0);
 }
 assert.equal(await rendered.getAttachments(),null);await input.destroy();await rendered.destroy();
});
test('aborting prevents output',async()=>{const pdf=await pdfjs.getDocument({...params,data:source.slice()}).promise;const abort=new AbortController();abort.abort();await assert.rejects(()=>cleanRenderedPdf(pdf,{signal:abort.signal}),{name:'AbortError'});await pdf.destroy();});
test('verification rejects source documents with personal data',async()=>{await assert.rejects(()=>verifyCleanPdf(source,2));});
test('malformed provenance boxes are bounded and ignored',()=>{assert.deepEqual(provenanceDetails(new Uint8Array([255,255,255,255,99,98,111,114,0])),[]);});
