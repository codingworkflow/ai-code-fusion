import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import LanguageSelector from '../../../src/renderer/components/LanguageSelector';
import i18n from '../../../src/renderer/i18n';
import { LOCALE_STORAGE_KEY } from '../../../src/renderer/i18n/settings';

describe('LanguageSelector', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await i18n.changeLanguage('en');
  });

  test('renders supported locale options', () => {
    render(<LanguageSelector />);

    const languageSelect = screen.getByTestId('language-selector');
    expect(languageSelect).toHaveValue('en');

    const optionValues = Array.from(screen.getAllByRole('option')).map((option) => option.getAttribute('value'));
    expect(optionValues).toEqual(['en', 'es', 'fr', 'de']);
  });

  test('changes locale and persists it to localStorage', async () => {
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');
    render(<LanguageSelector />);

    fireEvent.change(screen.getByTestId('language-selector'), { target: { value: 'es' } });

    await waitFor(() => {
      expect(i18n.resolvedLanguage?.startsWith('es') || i18n.language.startsWith('es')).toBe(true);
      expect(setItemSpy).toHaveBeenCalledWith(LOCALE_STORAGE_KEY, 'es');
      expect(screen.getByLabelText('Idioma')).toBeInTheDocument();
    });

    setItemSpy.mockRestore();
  });
});
