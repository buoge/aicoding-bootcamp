/** Render the authoritative FK groups as standalone SVGs; Mermaid source is also shipped. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const runtime=process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
const vizModule=process.env.VIZ_MODULE||(runtime?path.join(runtime,'@viz-js/viz/dist/viz.cjs'):'@viz-js/viz');
const {instance}=require(vizModule);
const sharp=require(process.env.SHARP_MODULE||(runtime?path.join(runtime,'sharp'):'sharp'));
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const groups=JSON.parse(fs.readFileSync(path.join(root,'config/er_groups.json'),'utf8'));
const schema=JSON.parse(fs.readFileSync(path.join(root,'config/schema_contract.json'),'utf8'));
const by=Object.fromEntries(schema.tables.map(t=>[t.name,t]));
const viz=await instance();
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
let rendered=[];
for(const [name,names] of Object.entries(groups)){
 let dot=['digraph ER {','graph [rankdir=TB, bgcolor="white", nodesep=0.28, ranksep=0.62, pad=0.28, splines=polyline, concentrate=false, fontname="DejaVu Sans"];','node [shape=plain, fontname="DejaVu Sans"];','edge [color="#688099", penwidth=1.1, arrowsize=0.55, fontsize=9, fontname="DejaVu Sans"];'];
 for(const tn of names){
  const t=by[tn];const pks=new Set(t.primary_key);const fk=new Set(t.foreign_keys.flatMap(f=>f.columns));
  const cols=t.columns.filter(c=>pks.has(c.name)||(fk.has(c.name)&&c.name!=='load_batch_id'));
  const rows=cols.map(c=>`<TR><TD ALIGN="LEFT"><FONT COLOR="${pks.has(c.name)?'#164a69':'#435c72'}">${pks.has(c.name)?'PK':'FK'}  ${esc(c.name)}${c.nullable?' ?':''}</FONT></TD></TR>`).join('');
  dot.push(`"${tn}" [label=<<TABLE BORDER="1" COLOR="#c4d2df" CELLBORDER="0" CELLSPACING="0" CELLPADDING="7"><TR><TD BGCOLOR="${t.cost_protected?'#714235':'#173c56'}"><FONT COLOR="white"><B>${tn}</B></FONT></TD></TR>${rows}</TABLE>>];`);
 }
 const seen=new Set();
 for(const tn of names){
  for(const f of by[tn].foreign_keys){const key=f.references+'>'+tn;if(!names.includes(f.references)||f.references===tn||seen.has(key))continue;seen.add(key);
   // Parent to child. The complete composite FK appears in the field dictionary.
   const optional=f.columns.some(c=>by[tn].columns.find(x=>x.name===c).nullable);
   dot.push(`"${f.references}" -> "${tn}" [taillabel="${optional?'0..1':'1'}", headlabel="0..N", labeldistance=1.5];`);
  }
 }
 dot.push('}');
 const source=dot.join('\n');fs.writeFileSync(path.join(root,'diagrams',name+'.dot'),source);
 const svg=viz.renderString(source,{format:'svg',engine:'dot'});
 const sp=path.join(root,'diagrams',name+'.svg');fs.writeFileSync(sp,svg);
 const pp=path.join(root,'diagrams',name+'.png');await sharp(Buffer.from(svg)).resize({width:1800,withoutEnlargement:false}).png().toFile(pp);
 rendered.push({name,nodes:names.length,svg:path.relative(root,sp),png:path.relative(root,pp)});
}
fs.writeFileSync(path.join(root,'validation/er_render_report.json'),JSON.stringify(rendered,null,2)+'\n');
console.log(JSON.stringify({diagrams:rendered.length}));
