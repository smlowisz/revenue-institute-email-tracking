#!/usr/bin/env node
/**
 * Update Pixel Bundle
 * Rebuilds the pixel and updates pixel-bundle.ts with base64-encoded code
 */

import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔨 Building pixel...');

try {
  // Build the pixel using Vite
  execSync('npm run build:pixel', { stdio: 'inherit' });
  console.log('✅ Pixel built successfully!');
  
  // Read the built pixel code
  const pixelPath = path.join(__dirname, '../dist/pixel.iife.js');
  if (!fs.existsSync(pixelPath)) {
    console.error('❌ Pixel file not found at:', pixelPath);
    process.exit(1);
  }
  
  const pixelCode = fs.readFileSync(pixelPath, 'utf8');
  console.log(`📦 Pixel size: ${(pixelCode.length / 1024).toFixed(2)} KB`);
  
  // Convert to base64
  const base64 = Buffer.from(pixelCode).toString('base64');
  console.log(`📦 Base64 size: ${(base64.length / 1024).toFixed(2)} KB`);
  
  // Update pixel-bundle.ts
  const bundlePath = path.join(__dirname, '../src/worker/pixel-bundle.ts');
  const content = `export const PIXEL_CODE_BASE64 = '${base64}';\n`;
  
  fs.writeFileSync(bundlePath, content);
  console.log('✅ Updated src/worker/pixel-bundle.ts');
  
  console.log('\n🎉 Pixel bundle updated successfully!');
  console.log('\nNext steps:');
  console.log('  1. Review changes: git diff src/worker/pixel-bundle.ts');
  console.log('  2. Deploy: wrangler deploy');
  
} catch (error) {
  console.error('❌ Failed to update pixel bundle:', error.message);
  process.exit(1);
}

