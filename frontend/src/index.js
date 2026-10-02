import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import store from './store';
import App from './App';
import { LocaleProvider } from './i18n/LocaleContext';
import { applyDocumentLocale, readStoredLocale } from './i18n/config';
import './styles/index.css';

// Direction before the first paint (public/locale-init.js already did this; this covers a blocked script).
applyDocumentLocale(readStoredLocale());

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <LocaleProvider>
      <Provider store={store}>
        <App />
      </Provider>
    </LocaleProvider>
  </React.StrictMode>
);
