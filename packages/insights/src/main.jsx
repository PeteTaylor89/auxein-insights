// main.jsx - Application entry point for Regional Intelligence
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { PublicAuthProvider } from './contexts/PublicAuthContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>

      <PublicAuthProvider>
        <App />
      </PublicAuthProvider>

  </React.StrictMode>
);