const axios = require('axios');

const fixtureId = 19441727;
const apiKey = 'Ug7hLwm9f7DtStxDjc61DZO9wKgdzAQ0AnjbgQiveBzJGF2mM97omCcXnDFd';

axios.get(`https://api.sportmonks.com/v3/football/fixtures/${fixtureId}`, {
  params: {
    api_token: apiKey,
    include: 'participants;statistics.type'
  }
}).then(res => {
  if (res.data.data && res.data.data.statistics) {
    console.log('Total statistics:', res.data.data.statistics.length);
    
    // Group by type
    const byType = {};
    res.data.data.statistics.forEach(stat => {
      const typeName = stat.type?.name || stat.type_id;
      if (!byType[typeName]) {
        byType[typeName] = {
          type_id: stat.type_id,
          count: 0,
          locations: []
        };
      }
      byType[typeName].count++;
      if (!byType[typeName].locations.includes(stat.location)) {
        byType[typeName].locations.push(stat.location);
      }
    });
    
    console.log('\nStatistics by type:');
    Object.entries(byType).sort((a,b) => a[0].localeCompare(b[0])).forEach(([name, info]) => {
      console.log(`  ${name} (ID: ${info.type_id}): ${info.count} - [${info.locations.join(', ')}]`);
    });
  }
}).catch(err => {
  console.error('Error:', err.response?.data || err.message);
});
