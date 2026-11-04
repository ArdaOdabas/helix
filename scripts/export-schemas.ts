import {writeFileSync} from 'node:fs';
import {z} from 'zod';
import {manifestSchema} from '../src/assets/importer.ts';
import {planSchema} from '../src/core/plan.ts';
writeFileSync('examples/asset-manifest.schema.json',JSON.stringify(z.toJSONSchema(manifestSchema),null,2));
writeFileSync('examples/figure-plan.schema.json',JSON.stringify(z.toJSONSchema(planSchema),null,2));
