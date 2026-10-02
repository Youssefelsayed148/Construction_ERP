// Runs before the app bundle: sets <html lang> and dir from the stored locale so there is no
// LTR/RTL flash. Kept as a separate file (not inline) because the CSP allows script-src 'self' only.
// Keep the supported values and the storage key in sync with src/i18n/config.js.
(function () {
  var locale = 'ar';
  try {
    var stored = window.localStorage.getItem('locale');
    if (stored === 'en' || stored === 'ar') locale = stored;
  } catch (e) { /* storage blocked: default */ }
  var root = document.documentElement;
  root.lang = locale;
  root.dir = locale === 'ar' ? 'rtl' : 'ltr';
})();
