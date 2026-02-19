const loadThemeBootstrapScript = () => {
  jest.isolateModules(() => {
    require('../../../src/renderer/public/theme-bootstrap.js');
  });
};

const createMatchMediaMock = (matches) =>
  jest.fn().mockImplementation(() => ({
    matches,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));

describe('theme-bootstrap script', () => {
  let addSpy;
  let removeSpy;
  let matchMediaSpy;

  beforeEach(() => {
    jest.resetModules();
    addSpy = jest.spyOn(document.documentElement.classList, 'add');
    removeSpy = jest.spyOn(document.documentElement.classList, 'remove');
    matchMediaSpy = jest.spyOn(window, 'matchMedia').mockImplementation(createMatchMediaMock(false));
    window.localStorage.removeItem('darkMode');
  });

  afterEach(() => {
    addSpy.mockRestore();
    removeSpy.mockRestore();
    matchMediaSpy.mockRestore();
    jest.restoreAllMocks();
    document.documentElement.classList.remove('dark');
  });

  it('enables dark class when persisted setting is true', () => {
    window.localStorage.setItem('darkMode', 'true');

    loadThemeBootstrapScript();

    expect(addSpy).toHaveBeenCalledWith('dark');
    expect(removeSpy).not.toHaveBeenCalled();
  });

  it('falls back to system preference when persisted value is absent', () => {
    matchMediaSpy.mockImplementation(createMatchMediaMock(false));

    loadThemeBootstrapScript();

    expect(addSpy).not.toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalledWith('dark');
  });

  it('keeps light mode when storage access throws', () => {
    const warnSpy = jest.spyOn(console, 'warn');
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });

    loadThemeBootstrapScript();

    expect(removeSpy).toHaveBeenCalledWith('dark');
    expect(warnSpy).toHaveBeenCalled();
  });
});
