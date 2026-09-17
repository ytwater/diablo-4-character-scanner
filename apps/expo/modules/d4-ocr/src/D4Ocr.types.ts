import type { StyleProp, ViewStyle } from 'react-native';

export type OnLoadEventPayload = {
  url: string;
};

export type D4OcrModuleEvents = {
  onChange: (params: ChangeEventPayload) => void;
};

export type TextBlockFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type TextBlock = {
  text: string;
  frame: TextBlockFrame;
};

export type ChangeEventPayload = {
  value: string;
};

export type D4OcrViewProps = {
  url: string;
  onLoad: (event: { nativeEvent: OnLoadEventPayload }) => void;
  style?: StyleProp<ViewStyle>;
};
