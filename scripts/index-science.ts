import {Catalog} from '../src/assets/catalog.ts';
import {inferScientificCategory} from '../src/assets/science.ts';
const c=new Catalog(process.env.FIGURE_DATA_DIR || 'data');let indexed=0;
try{const missing=c.db.prepare('SELECT a.id FROM assets a LEFT JOIN asset_science s ON s.assetId=a.id WHERE s.assetId IS NULL').all() as {id:string}[];
 for(const {id}of missing){const asset=c.get(id);c.annotate(id,asset.svg,asset);if(++indexed%500===0)console.log('Classified',indexed,'/',missing.length);}
 let reclassified=0;if(process.argv.includes('--reclassify'))for(const r of c.db.prepare("SELECT a.* FROM assets a JOIN asset_science s ON s.assetId=a.id WHERE s.scientificCategory='Unclassified'").all() as any[]){const next=inferScientificCategory(c.row(r));if(next!=='Unclassified'){c.db.prepare('UPDATE asset_science SET scientificCategory=? WHERE assetId=?').run(next,r.id);reclassified++;}}
 console.log(JSON.stringify({indexed,reclassified,uniqueGeometry:c.db.prepare('SELECT count(DISTINCT geometryHash) AS n FROM asset_science').get(),grades:c.db.prepare('SELECT quality,count(*) AS count FROM asset_science GROUP BY quality').all()}));
}finally{c.close();}
