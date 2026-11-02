import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

// A soft fade of the page colour, so content scrolling up behind the status bar and the dynamic island
// melts away instead of fighting with the clock and battery icons.
export function EdgeFade({ height, color = '#F7F2E8' }: { height: number; color?: string }) {
  return (
    <View pointerEvents="none" style={[styles.top, { height }]}>
      <Svg width="100%" height={height}>
        <Defs>
          <LinearGradient id="fadeTop" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={0.92} />
            <Stop offset="0.55" stopColor={color} stopOpacity={0.55} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height={height} fill="url(#fadeTop)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({ top: { position: 'absolute', top: 0, left: 0, right: 0 } });
