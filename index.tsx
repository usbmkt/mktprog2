import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './client/src/App';
import './client/src/index.css'; // Assuming this is your global stylesheet

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} else {
  console.error("Root element not found. Make sure you have a div with id='root' in your HTML.");
}
