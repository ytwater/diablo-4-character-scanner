// Reexport the native module. On web, it will be resolved to D4OcrModule.web.ts
// and on native platforms to D4OcrModule.ts
export { default } from './src/D4OcrModule';
export { default as D4OcrView } from './src/D4OcrView';
export * from  './src/D4Ocr.types';
