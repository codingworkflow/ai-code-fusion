import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type DarkModeContextValue = {
  darkMode: boolean;
  toggleDarkMode: () => void;
};

type DarkModeProviderProps = {
  children: React.ReactNode;
};

const DarkModeContext = createContext<DarkModeContextValue | undefined>(undefined);
const appWindow = globalThis as Window & typeof globalThis;

const getInitialDarkMode = (): boolean => {
  const savedMode = localStorage.getItem('darkMode');
  if (savedMode !== null) {
    try {
      return JSON.parse(savedMode) === true;
    } catch {
      return false;
    }
  }

  if (typeof appWindow.matchMedia === 'function') {
    return appWindow.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  return false;
};

export const DarkModeProvider = ({ children }: DarkModeProviderProps) => {
  const [darkMode, setDarkMode] = useState<boolean>(getInitialDarkMode);

  useEffect(() => {
    const htmlElement = document.documentElement;
    if (darkMode) {
      htmlElement.classList.add('dark');
    } else {
      htmlElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
  }, [darkMode]);

  useEffect(() => {
    if (typeof appWindow.matchMedia !== 'function') {
      return undefined;
    }

    const mediaQuery = appWindow.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => {
      if (localStorage.getItem('darkMode') === null) {
        setDarkMode(event.matches);
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const toggleDarkMode = useCallback(() => {
    setDarkMode((prevMode) => !prevMode);
  }, []);

  const contextValue = useMemo(
    () => ({
      darkMode,
      toggleDarkMode,
    }),
    [darkMode, toggleDarkMode]
  );

  return (
    <DarkModeContext.Provider value={contextValue}>{children}</DarkModeContext.Provider>
  );
};

export const useDarkMode = (): DarkModeContextValue => {
  const context = useContext(DarkModeContext);
  if (!context) {
    throw new Error('useDarkMode must be used within DarkModeProvider');
  }
  return context;
};
