import * as React from 'react';

import { D4OcrViewProps } from './D4Ocr.types';

export default function D4OcrView(props: D4OcrViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
