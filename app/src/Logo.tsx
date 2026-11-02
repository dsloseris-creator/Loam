import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, ink, type } from './theme';

// The mark: a mound of soil with a sprout growing out of it. A rough first version, to be refined later.
export function Logo({ size = 32, color = colors.moss, soil = '#9C7B58' }: { size?: number; color?: string; soil?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {/* the sprout */}
      <Path d="M50 62 C50 54 50 46 50 36" stroke={color} strokeWidth={5} strokeLinecap="round" fill="none" />
      <Path d="M50 46 C38 46 30 39 29 28 C41 28 49 35 50 46Z" fill={color} />
      <Path d="M50 38 C61 38 69 31 70 20 C58 20 51 27 50 38Z" fill={color} />
      {/* the soil: a mound, with a paler layer inside it */}
      <Path d="M10 90 C10 70 28 60 50 60 C72 60 90 70 90 90 Z" fill={soil} />
      <Path d="M24 90 C26 79 37 73 50 73 C63 73 74 79 76 90 Z" fill="#FFFFFF" fillOpacity={0.22} />
    </Svg>
  );
}

export const APP_NAME = 'Loam'; // a working name

// The name, with the mark beside it (logo={false} for the name alone)
export function Wordmark({ size = 26, logo = true }: { size?: number; logo?: boolean }) {
  return (
    <View style={styles.row}>
      {logo && <Logo size={size} />}
      <Text style={[styles.name, { fontSize: size * 0.78 }]}>{APP_NAME}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { ...type.heading, color: ink.moss, fontWeight: '700', letterSpacing: 0.4 },
});
