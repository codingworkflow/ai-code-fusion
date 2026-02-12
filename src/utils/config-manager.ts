import fs from 'fs';
import path from 'path';

import yaml from 'yaml';

import type { ConfigObject } from '../types/ipc';

const APP_ROOT = path.resolve(__dirname, '../../..');
const DEFAULT_CONFIG_PATH = path.join(APP_ROOT, 'src', 'utils', 'config.default.yaml');

/**
 * Load the default configuration
 * @returns {string} The default configuration as a YAML string
 */
export function loadDefaultConfig(): string {
  try {
    return fs.readFileSync(DEFAULT_CONFIG_PATH, 'utf8');
  } catch (error) {
    console.error('Error loading default config:', error);
    return '{}';
  }
}

/**
 * Get default config as object
 * @returns {object} The default configuration as a JavaScript object
 */
export function getDefaultConfigObject(): ConfigObject {
  try {
    const configYaml = loadDefaultConfig();
    return (yaml.parse(configYaml) || {}) as ConfigObject;
  } catch (error) {
    console.error('Error parsing default config:', error);
    return {} as ConfigObject;
  }
}
