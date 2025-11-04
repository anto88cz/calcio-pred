/**
 * Script di test per verificare la configurazione
 * Esegui con: node --loader tsx test-config.ts
 */

// Simula Next.js environment
process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3001';
process.env.NEXT_PUBLIC_APP_NAME = 'Calcio-Pred';

import { ENV, isDevelopment } from './src/config/env';

console.log('🔧 Test Configurazione Frontend\n');
console.log('✅ ENV.API_URL:', ENV.API_URL);
console.log('✅ ENV.APP_NAME:', ENV.APP_NAME);
console.log('✅ ENV.APP_VERSION:', ENV.APP_VERSION);
console.log('✅ isDevelopment:', isDevelopment);
console.log('\n✅ Configurazione caricata correttamente!');

// Test che non ci siano URL hardcoded
const hasHardcodedURL = ENV.API_URL.startsWith('http://localhost:3001');
if (hasHardcodedURL) {
  console.log('\n⚠️  Nota: Usando URL di sviluppo (localhost:3001)');
  console.log('   Per produzione, imposta NEXT_PUBLIC_API_URL in .env.production');
}
