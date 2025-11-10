#!/usr/bin/env tsx
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '../..');

const ajv = new Ajv({ allErrors: true, verbose: true });
addFormats(ajv);

async function validateSchemas() {
  console.log('🔍 Validating JSON Schemas...\n');

  const schemasDir = join(ROOT_DIR, 'schemas/canonical');
  let totalSchemas = 0;
  let validSchemas = 0;
  let errors: string[] = [];

  try {
    const schemaFiles = readdirSync(schemasDir).filter(f => f.endsWith('.json'));
    
    for (const file of schemaFiles) {
      totalSchemas++;
      const filePath = join(schemasDir, file);
      const schemaContent = readFileSync(filePath, 'utf-8');
      
      try {
        const schema = JSON.parse(schemaContent);
        
        ajv.compile(schema);
        
        console.log(`✅ ${file} - Valid`);
        validSchemas++;
      } catch (err: any) {
        console.log(`❌ ${file} - Invalid`);
        errors.push(`${file}: ${err.message}`);
      }
    }
    
    console.log(`\n📊 Summary:`);
    console.log(`   Total schemas: ${totalSchemas}`);
    console.log(`   Valid: ${validSchemas}`);
    console.log(`   Invalid: ${totalSchemas - validSchemas}`);
    
    if (errors.length > 0) {
      console.log('\n❌ Errors:');
      errors.forEach(err => console.log(`   ${err}`));
      process.exit(1);
    } else {
      console.log('\n✅ All schemas are valid!');
    }
  } catch (err: any) {
    console.error('❌ Failed to validate schemas:', err.message);
    process.exit(1);
  }
}

validateSchemas();
