const RENDERER_FEATURE_FLAGS = {
  aiSurfaces: true,
} as const;

const isDevMode = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.devUtils?.isDev === true;
};

export const isAiSurfacesEnabled = (): boolean => {
  return RENDERER_FEATURE_FLAGS.aiSurfaces && isDevMode();
};

export const rendererFeatureFlags = RENDERER_FEATURE_FLAGS;
