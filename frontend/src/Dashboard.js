import React, { useEffect, useState } from 'react';
import API from './api'; // සාදාගත් api.js file එක import කිරීම

function Dashboard() {
  const [metrics, setMetrics] = useState(null);

  useEffect(() => {
    // URL එක ලෙස relative path එක පමණක් දුන්නාම ප්‍රමාණවත් වේ
    API.get('/api/dashboard-metrics?anonymize=false')
      .then((response) => {
        setMetrics(response.data);
      })
      .catch((error) => {
        console.error('Error fetching metrics:', error);
      });
  }, []);

  return (
    <div>
      <h2>Dashboard Metrics</h2>
      {metrics ? <pre>{JSON.stringify(metrics, null, 2)}</pre> : <p>Loading...</p>}
    </div>
  );
}

export default Dashboard;