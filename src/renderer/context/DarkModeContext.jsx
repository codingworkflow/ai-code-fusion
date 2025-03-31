import React, { createContext, useState, useEffect, useContext } from 'react';

const DarkModeContext = createContext();

export const DarkModeProvider = ({ children }) => {
  const [darkMode, setDarkMode] = useState(() => {
    // Get initial state from localStorage
    const savedMode = localStorage.getItem('darkMode');
    // If there's a saved preference, use it; otherwise, use system preference
    if (savedMode !== null) {
      return JSON.parse(savedMode);
    }
    // Check if user prefers dark mode at OS level
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  // Apply dark mode class to the document when the state changes
  useEffect(() => {
    const htmlElement = document.documentElement;
    if (darkMode) {
      htmlElement.classList.add('dark');
    } else {
      htmlElement.classList.remove('dark');
    }
    // Save the preference to localStorage
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
  }, [darkMode]);

  // Listen for system preference changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => {
      // Only update if the user hasn't made an explicit choice (no localStorage item)
      if (localStorage.getItem('darkMode') === null) {
        setDarkMode(e.matches);
      }
    };

    // Set up listener for dark mode changes
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    } else {
      // Legacy support for Safari
      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }
  }, []);

  const toggleDarkMode = () => {
    setDarkMode((prevMode) => !prevMode);
  };

  return (
    <DarkModeContext.Provider value={{ darkMode, toggleDarkMode }}>
      {children}
    </DarkModeContext.Provider>
  );
};

export const useDarkMode = () => {
  const context = useContext(DarkModeContext);
  if (context === undefined) {
    // Provide a fallback instead of throwing an error
    console.warn('useDarkMode was called outside of its Provider - using fallback values');
    
    // Return a fallback implementation that doesn't cause the app to crash
    return {
      darkMode: document.documentElement.classList.contains('dark'),
      toggleDarkMode: () => {
        const isDark = document.documentElement.classList.contains('dark');
        if (isDark) {
          document.documentElement.classList.remove('dark');
          localStorage.setItem('darkMode', 'false');
        } else {
          document.documentElement.classList.add('dark');
          localStorage.setItem('darkMode', 'true');
        }
      }
    };
  }
  return context;
};
