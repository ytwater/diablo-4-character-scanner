import { requireNativeView } from 'expo';
import * as React from 'react';

import { D4OcrViewProps } from './D4Ocr.types';

const NativeView: React.ComponentType<D4OcrViewProps> =
  requireNativeView('D4Ocr');

export default function D4OcrView(props: D4OcrViewProps) {
  return <NativeView {...props} />;
}
