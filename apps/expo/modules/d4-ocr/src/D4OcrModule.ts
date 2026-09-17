import { NativeModule, requireNativeModule } from 'expo';

import { D4OcrModuleEvents, TextBlock } from './D4Ocr.types';

declare class D4OcrModule extends NativeModule<D4OcrModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
  recognizeTextFromUri(uri: string): Promise<TextBlock[]>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<D4OcrModule>('D4Ocr');
