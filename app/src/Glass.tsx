import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Platform, StyleSheet, View } from 'react-native';
import { colors } from './theme';

// A background layer that makes its parent look like glass. Put it first inside a view, and the
// view's other children sit on top of it.
//   iOS 26 and newer: the real Liquid Glass material.
//   older iOS: frosted blur.   Android: a plain translucent panel.
const hasLiquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();

type Props = {
  radius: number;
  tint?: string; // a faint color washed over the glass
  opaque?: boolean; // for sheets with lots of text: the fallbacks are nearly solid so the text stays easy to read
};

export function GlassFill({ radius, tint, opaque }: Props) {
  const rounded = { borderRadius: radius };

  if (hasLiquidGlass) {
    return <GlassView pointerEvents="none" glassEffectStyle="regular" tintColor={tint} style={[StyleSheet.absoluteFill, rounded]} />;
  }

  const wash = opaque ? colors.surface + 'F2' : colors.surface + 'B3';
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, rounded, styles.edge]}>
      {Platform.OS === 'ios' && <BlurView intensity={opaque ? 70 : 45} tint="light" style={StyleSheet.absoluteFill} />}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: wash }]} />
      {tint ? <View style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  edge: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
});
