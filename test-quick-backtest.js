// 🧪 QUICK BACKTEST - Test rapido su piccolo sample
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function quickBacktest() {
  console.log('🧪 ==========================================');
  console.log('🧪 QUICK BACKTEST - Small Sample Test');
  console.log('🧪 ==========================================\n');
  
  console.log('⚙️  Configuration:');
  console.log('   Period: Sep-Nov 2025 (Season 2025/26)');
  console.log('   Leagues: Europa League (3)');
  console.log('   Limit: 20 fixtures (fast test)');
  console.log('   Expected time: ~2-3 minutes\n');
  
  console.log('🚀 Starting backtest...\n');
  
  // Use actual historical dates with REAL finished fixtures
  const startStr = '2025-09-19';
  const endStr = '2025-11-02';
  
  const command = `cd api && npx tsx src/scripts/run-backtest.ts --start ${startStr} --end ${endStr} --leagues 3 --limit 20 --output quick-backtest.json`;
  
  console.log(`📋 Command: ${command}\n`);
  
  try {
    const { stdout, stderr } = await execPromise(command, {
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });
    
    console.log(stdout);
    
    if (stderr) {
      console.error('⚠️  Warnings/Errors:', stderr);
    }
    
    console.log('\n✅ Quick backtest completed!');
    console.log('📄 See quick-backtest.json for full report\n');
    
  } catch (error) {
    console.error('\n❌ Backtest failed:', error.message);
    if (error.stdout) console.log(error.stdout);
    if (error.stderr) console.error(error.stderr);
    process.exit(1);
  }
}

quickBacktest();
