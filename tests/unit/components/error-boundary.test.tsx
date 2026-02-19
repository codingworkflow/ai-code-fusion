import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import ErrorBoundary from '../../../src/renderer/components/ErrorBoundary';

const ProblemChild = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('render boom');
  }
  return <div>child rendered</div>;
};

describe('ErrorBoundary', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('renders children when no error is thrown', () => {
    render(
      <ErrorBoundary
        fallbackTitle='Fallback title'
        fallbackMessage='Fallback message'
        resetLabel='Retry'
      >
        <ProblemChild shouldThrow={false} />
      </ErrorBoundary>
    );

    expect(screen.getByText('child rendered')).toBeInTheDocument();
  });

  it('shows fallback UI when a child throws', () => {
    render(
      <ErrorBoundary
        fallbackTitle='Fallback title'
        fallbackMessage='Fallback message'
        resetLabel='Retry'
      >
        <ProblemChild shouldThrow />
      </ErrorBoundary>
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Fallback title');
    expect(screen.getByRole('alert')).toHaveTextContent('Fallback message');
  });

  it('resets and renders children again when reset keys change', () => {
    const Harness = () => {
      const [shouldThrow, setShouldThrow] = useState(true);
      return (
        <>
          <button type='button' onClick={() => setShouldThrow(false)}>
            recover
          </button>
          <ErrorBoundary
            fallbackTitle='Fallback title'
            fallbackMessage='Fallback message'
            resetLabel='Retry'
            resetKeys={[shouldThrow]}
          >
            <ProblemChild shouldThrow={shouldThrow} />
          </ErrorBoundary>
        </>
      );
    };

    render(<Harness />);
    expect(screen.getByRole('alert')).toBeInTheDocument();

    fireEvent.click(screen.getByText('recover'));
    expect(screen.getByText('child rendered')).toBeInTheDocument();
  });

  it('calls onReset when retry button is clicked', () => {
    const onReset = jest.fn();

    render(
      <ErrorBoundary
        fallbackTitle='Fallback title'
        fallbackMessage='Fallback message'
        resetLabel='Retry'
        onReset={onReset}
      >
        <ProblemChild shouldThrow />
      </ErrorBoundary>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
