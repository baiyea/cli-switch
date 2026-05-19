import '../styles.css';
import '@xterm/xterm/css/xterm.css';

import React from 'react';
import { createRoot } from 'react-dom/client';

import { logBridge } from '../shared/bridge';
import { AppShell } from './AppShell';

window.addEventListener('error', (event) => {
  logBridge.write({
    level: 'error',
    scope: 'renderer',
    message: 'Unhandled window error',
    meta: {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack || '',
    },
  });
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  logBridge.write({
    level: 'error',
    scope: 'renderer',
    message: 'Unhandled promise rejection',
    meta: {
      reason:
        typeof reason === 'object' && reason
          ? {
              message: reason.message,
              stack: reason.stack,
            }
          : String(reason),
    },
  });
});

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppShell />
  </React.StrictMode>,
);
