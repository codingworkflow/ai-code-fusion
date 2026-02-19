(function applyInitialTheme() {
  try {
    // Apply dark mode before React mounts to avoid a light-theme flash.
    const appWindow = globalThis;
    const savedMode = localStorage.getItem('darkMode');
    const prefersDark =
      typeof appWindow.matchMedia === 'function' &&
      appWindow.matchMedia('(prefers-color-scheme: dark)').matches;
    const shouldEnableDarkMode = savedMode === 'true' || (savedMode === null && prefersDark);

    if (shouldEnableDarkMode) {
      document.documentElement.classList.add('dark');
      return;
    }

    document.documentElement.classList.remove('dark');
  } catch (error) {
    // Fall back to light mode if storage/media APIs are unavailable.
    console.warn('Theme bootstrap failed', error);
    document.documentElement.classList.remove('dark');
  }
})();
