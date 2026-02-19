describe('preload external URL guard', () => {
  const exposeInMainWorld = jest.fn();
  const invoke = jest.fn();
  const openExternal = jest.fn();

  const loadPreload = () => {
    jest.resetModules();
    exposeInMainWorld.mockReset();
    invoke.mockReset();
    openExternal.mockReset().mockResolvedValue(undefined);

    jest.doMock('electron', () => ({
      contextBridge: {
        exposeInMainWorld,
      },
      ipcRenderer: {
        invoke,
      },
      shell: {
        openExternal,
      },
    }));

    require('../../../src/main/preload');
  };

  const getElectronBridge = () => {
    const exposed = exposeInMainWorld.mock.calls.find(([name]) => name === 'electron');
    return exposed?.[1];
  };

  beforeEach(() => {
    loadPreload();
  });

  test('allows https URLs', async () => {
    const electronBridge = getElectronBridge();
    expect(electronBridge?.shell?.openExternal).toBeDefined();

    await expect(electronBridge.shell.openExternal('https://github.com')).resolves.toBeUndefined();
    expect(openExternal).toHaveBeenCalledWith('https://github.com');
  });

  test('blocks non-http(s) URLs', async () => {
    const electronBridge = getElectronBridge();
    await expect(electronBridge.shell.openExternal('file:///etc/passwd')).rejects.toThrow(
      /Blocked external URL/
    );
    expect(openExternal).not.toHaveBeenCalled();
  });
});
