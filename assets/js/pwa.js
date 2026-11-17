/* Independent of authentication, so installation is available on the public
   homepage and login screen as well as inside the app. */
(() => {
  const script = document.currentScript;
  const root = new URL('../../', script.src);
  const standalone = window.matchMedia('(display-mode: standalone)');
  let installPrompt = null;
  let prompting = false;
  const installed = () => standalone.matches || navigator.standalone === true;
  const buttons = () => document.querySelectorAll('[data-install-app]');

  function syncInstallButtons() {
    const host = document.querySelector('.sidebar-bottom') ||
      document.querySelector('#login-content') || document.querySelector('.landing-hero');
    if (installPrompt && !installed() && host && !host.querySelector('[data-install-app]')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button secondary install-app-button';
      button.dataset.installApp = '';
      button.textContent = 'Install AvilonX';
      host.append(button);
    }
    buttons().forEach(button => {
      button.hidden = !installPrompt || installed();
      button.disabled = prompting;
    });
  }
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    syncInstallButtons();
  });
  document.addEventListener('click', async event => {
    const button = event.target.closest?.('[data-install-app]');
    if (!button || !installPrompt || prompting) return;
    const prompt = installPrompt;
    prompting = true;
    syncInstallButtons();
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch (error) {
      console.warn('AvilonX installation prompt was unavailable:', error);
    } finally {
      installPrompt = null;
      prompting = false;
      syncInstallButtons();
    }
  });
  window.addEventListener('appinstalled', () => { installPrompt = null; syncInstallButtons(); });
  standalone.addEventListener('change', syncInstallButtons);
  // Login and route rendering can replace the content hosting the install button.
  new MutationObserver(syncInstallButtons).observe(document.body, {childList: true, subtree: true});
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register(new URL('sw.js', root).href, {scope: root.href, updateViaCache: 'none'})
      .catch(error => console.warn('AvilonX offline screen could not be registered:', error));
  }
})();
