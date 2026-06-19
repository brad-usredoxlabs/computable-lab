import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parse as parseYaml } from 'yaml';
import { readFile } from 'fs/promises';
import { join } from 'path';

const ajv = new Ajv2020({ strict: true, strictRequired: false, allErrors: true });
addFormats(ajv);

const schemaDir = '/home/brad/git/computable-foundry/schema';

// Load common.schema.yaml
const commonContent = await readFile(join(schemaDir, 'core/common.schema.yaml'), 'utf8');
const commonSchema = parseYaml(commonContent);
ajv.addSchema(commonSchema, commonSchema.$id);

// Load material-instance.schema.yaml
const miContent = await readFile(join(schemaDir, 'lab/material-instance.schema.yaml'), 'utf8');
const miSchema = parseYaml(miContent);
ajv.addSchema(miSchema, miSchema.$id);

// Test validation with createdBy
const testPayload = {
  kind: 'material-instance',
  id: 'TEST-123',
  name: 'Test',
  material_ref: { kind: 'record', id: 'MAT-123', type: 'material' },
  status: 'available',
  createdBy: 'test-creator',
};

const validate = ajv.getSchema(miSchema.$id);
if (!validate) {
  console.log('ERROR: Schema not found:', miSchema.$id);
  process.exit(1);
}

const valid = validate(testPayload);
console.log('Valid:', valid);
if (!valid) {
  console.log('Errors:', JSON.stringify(validate.errors, null, 2));
}
