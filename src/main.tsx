import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './globals.css';
import './i18n';
import { installChunkReloadGuard } from './utils/chunk-reload.logic';

// Pages are separate chunks: after a release, reload once instead of a blank page.
installChunkReloadGuard(window);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <BrowserRouter basename="/admin">
    <App />
  </BrowserRouter>,
);
