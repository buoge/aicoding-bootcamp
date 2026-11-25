/** Render the two process diagrams as offline SVG; the authoritative Mermaid remains in the main document. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const runtime=process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
const {instance}=require(process.env.VIZ_MODULE||(runtime?path.join(runtime,'@viz-js/viz/dist/viz.cjs'):'@viz-js/viz'));
const sharp=require(process.env.SHARP_MODULE||(runtime?path.join(runtime,'sharp'):'sharp'));
const viz=await instance();
const tick=String.fromCharCode(96).repeat(3);
const mmd=[...fs.readFileSync(path.join(root,'docs/technical_design.md'),'utf8').matchAll(new RegExp(tick+'mermaid\\n([\\s\\S]*?)'+tick,'g'))].map(x=>x[1]);
const definitions=[
 {name:'10_order_lifecycle',nodes:{A:'Create order',B:'Atomic inventory reserve',C:'Cancel: STOCK_LOCK_FAILED',D:'Await payment',E:'Cancel and release reserve',F:'Ship by package',G:'Deliver: revenue and COGS',H:'RTO: restore original stock; refund',I:'Return request and inspection',J:'Accept: reverse revenue; refund later',K:'Sellable restock: reverse original COGS',L:'Damaged: keep original COGS'},edges:[['A','B'],['B','C','Shortage'],['B','D','Reserved'],['D','E','Timeout / cancel'],['D','F','Fully paid'],['F','G'],['F','H','Delivery failed'],['G','I'],['I','J','Accepted'],['J','K','Sellable'],['J','L','Damaged']]},
 {name:'11_production_dag',nodes:{A:'Freeze source and master data',B:'Contoso: export weights',C:'Compile assortment and price context',D:'Allocate exact order slots',E:'Contoso: propose baskets',F:'Opening stock and supply plans',G:'Simulate business events in time order',H:'Canonical facts and source arrivals',I:'Snapshots, metrics and independent gates',J:'Commit immutable release manifest'},edges:[['A','B'],['A','C'],['B','D'],['C','D'],['D','E'],['A','F'],['E','G'],['F','G'],['G','H'],['H','I'],['I','J']]}
];
if(mmd.length!==definitions.length)throw new Error('Expected exactly two process Mermaid blocks.');
for(const [i,d] of definitions.entries()){
 const lines=['digraph process {','graph [rankdir=TB, bgcolor="white", nodesep=0.3, ranksep=0.55, pad=0.25, splines=polyline];','node [shape=box, style="rounded,filled", fillcolor="#eef4f8", color="#b5c9d8", fontname="DejaVu Sans", fontsize=12, margin="0.18,0.12"];','edge [fontname="DejaVu Sans", fontsize=10, color="#6b8296", arrowsize=0.6];'];
 for(const [key,label] of Object.entries(d.nodes))lines.push(key+' [label='+JSON.stringify(label)+'];');
 for(const [a,b,label] of d.edges)lines.push(a+' -> '+b+(label?' [label='+JSON.stringify(label)+']':'')+';');
 lines.push('}');
 const source=lines.join('\n');
 const svg=viz.renderString(source,{format:'svg',engine:'dot'});
 fs.writeFileSync(path.join(root,'diagrams',d.name+'.dot'),source+'\n');
 fs.writeFileSync(path.join(root,'diagrams',d.name+'.mmd'),mmd[i]);
 fs.writeFileSync(path.join(root,'diagrams',d.name+'.svg'),svg);
 await sharp(Buffer.from(svg)).resize({width:1600}).png().toFile(path.join(root,'diagrams',d.name+'.png'));
}
console.log(JSON.stringify({process_diagrams:definitions.length}));
