import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { GlassFill } from './Glass';
import { colors, radius, spacing, type } from './theme';

type Props = {
  visible: boolean;
  title: string;
  message?: string;
  initial: string;
  placeholder: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: (name: string) => void;
};

// A small calm sheet with one text field.
export function NameDialog({ visible, title, message, initial, placeholder, confirmLabel, onCancel, onConfirm }: Props) {
  const [text, setText] = useState(initial);
  useEffect(() => {
    if (visible) setText(initial);
  }, [visible, initial]);

  const name = text.trim();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <View style={styles.sheet}>
          <GlassFill radius={radius.lg} opaque />
          <Text style={styles.title}>{title}</Text>
          {message && <Text style={styles.message}>{message}</Text>}
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={placeholder}
            placeholderTextColor={colors.textMuted}
            autoFocus
            maxLength={30}
            returnKeyType="done"
            onSubmitEditing={() => name && onConfirm(name)}
            style={styles.input}
          />
          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={styles.button}>
              <Text style={styles.cancel}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => name && onConfirm(name)}
              style={[styles.button, styles.confirm, !name && { opacity: 0.4 }]}
            >
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#3A3A3299', justifyContent: 'center', padding: spacing.lg },
  sheet: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: { ...type.heading, color: colors.text },
  message: { ...type.body, color: colors.textMuted },
  input: {
    ...type.body,
    color: colors.text,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.md,
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  button: {
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg - 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border + '88',
  },
  cancel: { ...type.body, color: colors.textMuted },
  confirm: { backgroundColor: colors.moss },
  confirmText: { ...type.body, fontWeight: '600', color: colors.surface },
});
