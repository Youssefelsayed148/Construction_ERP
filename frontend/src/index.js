import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from './store';
import App from './App';
import { LocaleProvider } from './i18n/LocaleContext';
import { applyDocumentLocale, readStoredLocale } from './i18n/config';
import { ToastProvider } from './components/common/Toast';
import ServiceWorkerUpdatePrompt from './components/common/ServiceWorkerUpdatePrompt';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-400.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-500.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-600.css';
import './styles/index.css';

// Direction before the first paint (public/locale-init.js already did this; this covers a blocked script).
applyDocumentLocale(readStoredLocale());

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <LocaleProvider>
      <ToastProvider>
        <AuthProvider>
          <ServiceWorkerUpdatePrompt />
          <App />
        </AuthProvider>
      </ToastProvider>
    </LocaleProvider>
  </React.StrictMode>
);
