import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import ConfigTab from '../renderer/components/ConfigTab';

describe('ConfigTab', () => {
  const mockConfigContent = '# Test configuration\ninclude_extensions:\n  - .js\n  - .jsx';
  const mockOnConfigChange = jest.fn();

  beforeEach(() => {
    // Reset mock before each test
    mockOnConfigChange.mockClear();
  });

  test('renders textarea with config content', () => {
    render(<ConfigTab configContent={mockConfigContent} onConfigChange={mockOnConfigChange} />);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    expect(textarea.value).toBe(mockConfigContent);
  });

  test('calls onConfigChange when content changes', () => {
    render(<ConfigTab configContent={mockConfigContent} onConfigChange={mockOnConfigChange} />);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'New config content' } });

    expect(mockOnConfigChange).toHaveBeenCalledWith('New config content');
  });
});
