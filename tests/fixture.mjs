import { PDFDocument, PDFName, PDFString, degrees, rgb } from 'pdf-lib';
import { encode } from 'cbor-x';
export async function fixture() {
 const doc=await PDFDocument.create();
 doc.setTitle('Private test document');doc.setAuthor('TEST_AUTHOR_SECRET');doc.setSubject('Metadata removal fixture');doc.setKeywords(['TEST_KEYWORD_SECRET']);doc.setCreator('TEST_CREATOR_SECRET');doc.setCreationDate(new Date('2020-01-01T00:00:00Z'));
 const page=doc.addPage([360,480]);page.drawText('Visible content stays',{x:35,y:410,size:20});page.drawRectangle({x:35,y:300,width:150,height:50,color:rgb(.2,.5,.3)});
 const rotated=doc.addPage([240,360]);rotated.setRotation(degrees(90));rotated.drawText('Rotated second page',{x:20,y:270,size:15});
 const metadata=doc.context.flateStream('<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" dc:creator="TEST_XMP_SECRET"/></rdf:RDF></x:xmpmeta>',{Type:'Metadata',Subtype:'XML'});
 doc.catalog.set(PDFName.of('Metadata'),doc.context.register(metadata));
 await doc.attach(new TextEncoder().encode('TEST_ATTACHMENT_SECRET'),'private.txt',{description:'TEST_ATTACHMENT_DESCRIPTION'});
 doc.addJavaScript('test','var privateValue="TEST_SCRIPT_SECRET";');
 const payload=encode({actions:[{action:'c2pa.created',softwareAgent:'TEST_C2PA_SECRET'}]});
 const box=new Uint8Array(payload.length+8);new DataView(box.buffer).setUint32(0,box.length);box.set(new TextEncoder().encode('cbor'),4);box.set(payload,8);
 const provenance=doc.context.flateStream(box,{Type:'EmbeddedFile',Subtype:'application/jumbf'});doc.catalog.set(PDFName.of('C2PA'),doc.context.register(provenance));
 page.node.set(PDFName.of('Annots'),doc.context.obj([doc.context.register(doc.context.obj({Type:'Annot',Subtype:'Text',Rect:[20,20,50,50],T:PDFString.of('TEST_ANNOTATION_SECRET'),Contents:PDFString.of('A private comment')}))]));
 return doc.save({useObjectStreams:true});
}
if(process.argv.includes('--write')){const {mkdir,writeFile}=await import('node:fs/promises');await mkdir('tmp',{recursive:true});await writeFile('tmp/fixture.pdf',await fixture());}
