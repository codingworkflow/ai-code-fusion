import React from 'react';
import { createRoot } from 'react-dom/client';

import App from './components/App';

const container = document.getElementById('app');

if (!container) {
  throw new Error('Renderer root element "#app" was not found');
}

const root = createRoot(container);
root.render(<App />);
