// AutoSearch brand wordmark. Picks light/dark variant from ThemeContext.
// Aspect ratio 4.17:1 (1192×286 = "A | SEARCH" lock-up).
import React from 'react';
import { Image, StyleProp, ImageStyle } from 'react-native';
import { useThemeContext } from '../context/ThemeContext';

type Props = {
  height?: number;
  style?: StyleProp<ImageStyle>;
  testID?: string;
};

const ASPECT = 1192 / 286; // ≈ 4.17

const DARK = require('../../assets/brand/logo-dark.png');
const LIGHT = require('../../assets/brand/logo-light.png');

export default function Brand({ height = 28, style, testID }: Props) {
  const { isDark } = useThemeContext();
  const source = isDark ? DARK : LIGHT;
  return (
    <Image
      source={source}
      style={[{ height, width: height * ASPECT }, style]}
      resizeMode="contain"
      testID={testID || 'brand-logo'}
    />
  );
}
