import { registerWebModule, NativeModule } from 'expo';

import { ChangeEventPayload } from './D4Ocr.types';

type D4OcrModuleEvents = {
  onChange: (params: ChangeEventPayload) => void;
}

class D4OcrModule extends NativeModule<D4OcrModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
};

export default registerWebModule(D4OcrModule, 'D4OcrModule');
