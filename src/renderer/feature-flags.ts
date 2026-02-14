const RENDERER_FEATURE_FLAGS = {
  aiSurfaces: true,
} as const;

const getBrowserWindow = (): Window | undefined => {
  return globalThis.window;
};

const isDevMode = (): boolean => {
  return getBrowserWindow()?.devUtils?.isDev === true;
};

export const isAiSurfacesEnabled = (): boolean => {
  return RENDERER_FEATURE_FLAGS.aiSurfaces && isDevMode();
};

export const rendererFeatureFlags = RENDERER_FEATURE_FLAGS;
