'use strict';

const IPC_CHANNEL_PATTERN = /^[a-z][a-zA-Z0-9-]*:[a-z][a-zA-Z0-9-]*(?::[a-z][a-zA-Z0-9-]*)*$/;
const IPC_METHODS_REQUIRING_CHANNEL = new Set(['handle', 'on', 'once', 'invoke', 'send', 'sendSync']);
const RENDERER_PATH_PATTERN = /[\\/]src[\\/]renderer[\\/]/;

const getStaticPropertyName = (property) => {
  if (!property || property.type !== 'Property') {
    return null;
  }

  if (!property.computed && property.key.type === 'Identifier') {
    return property.key.name;
  }

  if (property.key.type === 'Literal' && typeof property.key.value === 'string') {
    return property.key.value;
  }

  return null;
};

const findObjectProperty = (objectNode, propertyName) => {
  if (!objectNode || objectNode.type !== 'ObjectExpression') {
    return null;
  }

  for (const property of objectNode.properties) {
    if (property.type !== 'Property') {
      continue;
    }

    if (getStaticPropertyName(property) === propertyName) {
      return property;
    }
  }

  return null;
};

const isBooleanLiteral = (node, expectedValue) => {
  return Boolean(node && node.type === 'Literal' && node.value === expectedValue);
};

const isBrowserWindowConstructor = (callee) => {
  if (!callee) {
    return false;
  }

  if (callee.type === 'Identifier' && callee.name === 'BrowserWindow') {
    return true;
  }

  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'BrowserWindow'
  );
};

const isRendererFile = (context) => {
  const filename = context.filename || context.getFilename();
  return typeof filename === 'string' && RENDERER_PATH_PATTERN.test(filename);
};

module.exports = {
  rules: {
    'safe-browser-window-webpreferences': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Require BrowserWindow webPreferences to explicitly set nodeIntegration:false and contextIsolation:true',
        },
        schema: [],
        messages: {
          requireWebPreferences:
            'BrowserWindow must define webPreferences with security flags.',
          requireNodeIntegrationFalse:
            'BrowserWindow webPreferences.nodeIntegration must be set to false.',
          requireContextIsolationTrue:
            'BrowserWindow webPreferences.contextIsolation must be set to true.',
        },
      },
      create(context) {
        return {
          NewExpression(node) {
            if (!isBrowserWindowConstructor(node.callee)) {
              return;
            }

            const options = node.arguments[0];
            if (!options || options.type !== 'ObjectExpression') {
              context.report({ node, messageId: 'requireWebPreferences' });
              return;
            }

            const webPreferences = findObjectProperty(options, 'webPreferences');
            if (!webPreferences || webPreferences.value.type !== 'ObjectExpression') {
              context.report({ node, messageId: 'requireWebPreferences' });
              return;
            }

            const nodeIntegration = findObjectProperty(webPreferences.value, 'nodeIntegration');
            if (!nodeIntegration || !isBooleanLiteral(nodeIntegration.value, false)) {
              context.report({ node: webPreferences.value, messageId: 'requireNodeIntegrationFalse' });
            }

            const contextIsolation = findObjectProperty(webPreferences.value, 'contextIsolation');
            if (!contextIsolation || !isBooleanLiteral(contextIsolation.value, true)) {
              context.report({ node: webPreferences.value, messageId: 'requireContextIsolationTrue' });
            }
          },
        };
      },
    },
    'ipc-channel-namespaced': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Require ipcMain/ipcRenderer channels to be namespaced string literals',
        },
        schema: [],
        messages: {
          invalidChannel:
            'IPC channel names must be string literals in namespaced format (example: "repo:process").',
        },
      },
      create(context) {
        return {
          CallExpression(node) {
            if (!node.callee || node.callee.type !== 'MemberExpression') {
              return;
            }

            const object = node.callee.object;
            const property = node.callee.property;
            const isIpcObject =
              object.type === 'Identifier' && (object.name === 'ipcMain' || object.name === 'ipcRenderer');

            if (!isIpcObject || node.callee.computed || property.type !== 'Identifier') {
              return;
            }

            if (!IPC_METHODS_REQUIRING_CHANNEL.has(property.name)) {
              return;
            }

            const channelArgument = node.arguments[0];
            const hasValidNamespacedLiteral =
              channelArgument &&
              channelArgument.type === 'Literal' &&
              typeof channelArgument.value === 'string' &&
              IPC_CHANNEL_PATTERN.test(channelArgument.value);

            if (!hasValidNamespacedLiteral) {
              context.report({ node, messageId: 'invalidChannel' });
            }
          },
        };
      },
    },
    'no-electron-import-in-renderer': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Disallow importing electron in renderer code',
        },
        schema: [],
        messages: {
          noElectronImport:
            'Do not import electron directly in renderer files; use the preload bridge APIs instead.',
        },
      },
      create(context) {
        if (!isRendererFile(context)) {
          return {};
        }

        return {
          ImportDeclaration(node) {
            if (node.source && node.source.type === 'Literal' && node.source.value === 'electron') {
              context.report({ node, messageId: 'noElectronImport' });
            }
          },
          CallExpression(node) {
            if (
              node.callee.type === 'Identifier' &&
              node.callee.name === 'require' &&
              node.arguments[0] &&
              node.arguments[0].type === 'Literal' &&
              node.arguments[0].value === 'electron'
            ) {
              context.report({ node, messageId: 'noElectronImport' });
            }
          },
        };
      },
    },
  },
};
