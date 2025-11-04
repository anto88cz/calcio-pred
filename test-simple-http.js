// Test semplice HTTP
const http = require('http');

function testAPI() {
  console.log('🧪 Test API Backend...');
  
  const options = {
    hostname: 'localhost',
    port: 3001,
    path: '/health',
    method: 'GET',
    timeout: 5000
  };

  const req = http.request(options, (res) => {
    console.log(`✅ Status: ${res.statusCode}`);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      console.log(`📊 Response: ${data}`);
      
      // Test fixtures endpoint
      testFixtures();
    });
  });

  req.on('error', (err) => {
    console.error(`❌ Errore: ${err.message}`);
  });

  req.on('timeout', () => {
    console.error('❌ Timeout');
    req.destroy();
  });

  req.end();
}

function testFixtures() {
  console.log('\n🧪 Test Fixtures Endpoint...');
  
  const options = {
    hostname: 'localhost',
    port: 3001,
    path: '/api/fixtures',
    method: 'GET',
    timeout: 10000
  };

  const req = http.request(options, (res) => {
    console.log(`✅ Fixtures Status: ${res.statusCode}`);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      console.log(`📊 Fixtures Response (${data.length} chars): ${data.substring(0, 200)}...`);
      console.log('\n🎉 Test API completato!');
    });
  });

  req.on('error', (err) => {
    console.error(`❌ Fixtures Error: ${err.message}`);
  });

  req.on('timeout', () => {
    console.error('❌ Fixtures Timeout');
    req.destroy();
  });

  req.end();
}

testAPI();