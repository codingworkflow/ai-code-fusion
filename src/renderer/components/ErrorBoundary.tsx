import React, { Component, ErrorInfo, ReactNode } from 'react';

type ErrorBoundaryProps = {
  children: ReactNode;
  fallbackTitle: string;
  fallbackMessage: string;
  resetLabel: string;
  onReset?: () => void;
  resetKeys?: ReadonlyArray<unknown>;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

const haveResetKeysChanged = (
  previousKeys: ReadonlyArray<unknown> = [],
  nextKeys: ReadonlyArray<unknown> = []
) => {
  if (previousKeys.length !== nextKeys.length) {
    return true;
  }

  for (let index = 0; index < previousKeys.length; index += 1) {
    if (!Object.is(previousKeys[index], nextKeys[index])) {
      return true;
    }
  }

  return false;
};

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Renderer ErrorBoundary captured an error:', error, errorInfo);
  }

  componentDidUpdate(previousProps: ErrorBoundaryProps) {
    if (!this.state.hasError) {
      return;
    }

    if (haveResetKeysChanged(previousProps.resetKeys, this.props.resetKeys)) {
      this.setState({ hasError: false });
    }
  }

  private readonly handleReset = () => {
    this.props.onReset?.();
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div
        role='alert'
        className='m-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-800 dark:bg-red-900/30 dark:text-red-100'
      >
        <h2 className='text-base font-semibold'>{this.props.fallbackTitle}</h2>
        <p className='mt-2'>{this.props.fallbackMessage}</p>
        <button
          type='button'
          onClick={this.handleReset}
          className='mt-3 rounded border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100 dark:border-red-700 dark:bg-red-900/40 dark:text-red-100 dark:hover:bg-red-900/60'
        >
          {this.props.resetLabel}
        </button>
      </div>
    );
  }
}

export default ErrorBoundary;
