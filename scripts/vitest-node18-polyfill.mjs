export async function load(url, context, nextLoad) {
  if (url === 'node:util') {
    return {
      format: 'module',
      shortCircuit: true,
      source: `
        import { createRequire } from 'node:module';
        const require = createRequire(process.cwd() + '/package.json');
        const util = require('node:util');
        export default util;
        export const format = util.format;
        export const formatWithOptions = util.formatWithOptions;
        export const inspect = util.inspect;
        export const promisify = util.promisify;
        export const callbackify = util.callbackify;
        export const styleText = util.styleText || ((format, text) => text);
        export const stripVTControlCharacters = util.stripVTControlCharacters || ((val) => String(val).replace(/\\x1B\\[[0-?]*[ -/]*[@-~]/g, ''));
        export const parseEnv = util.parseEnv || ((src) => ({}));
        export const types = util.types;
        export const TextDecoder = util.TextDecoder;
        export const TextEncoder = util.TextEncoder;
        export const parseArgs = util.parseArgs;
        export const deprecate = util.deprecate;
        export const isDeepStrictEqual = util.isDeepStrictEqual;
      `,
    };
  }
  return nextLoad(url, context);
}
