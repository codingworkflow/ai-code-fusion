const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

// Default config path
const DEFAULT_CONFIG_PATH = path.join(__dirname, 'config.default.yaml');

/**
 * Load the default configuration
 * @returns {string} The default configuration as a YAML string
 */
function loadDefaultConfig() {
  try {
    return fs.readFileSync(DEFAULT_CONFIG_PATH, 'utf8');
  } catch (error) {
    console.error('Error loading default config:', error);
    return '{}'; // Return empty config object as fallback
  }
}

/**
 * Get default config as object
 * @returns {object} The default configuration as a JavaScript object
 */
function getDefaultConfigObject() {
  try {
    const configYaml = loadDefaultConfig();
    return yaml.parse(configYaml);
  } catch (error) {
    console.error('Error parsing default config:', error);
    return {}; 
  }
}

module.exports = {
  loadDefaultConfig,
  getDefaultConfigObject
};
