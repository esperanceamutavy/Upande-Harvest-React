import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '../../components/ui/Button';
import { colors, radii, spacing } from '../../components/ui/theme';
import { validateOverride } from './sprayOverride';

// Unbunched Spray Roses never arrive as a full bucket, so the stem count is
// asked for automatically instead of relying on the packer to remember the
// "Partial" mode.
//
// Typing in a coldroom is slow, so the three usual counts are one tap each and
// post immediately. The field is for everything else.

const QUICK_PICKS = [10, 30, 50] as const;

interface StemCountPromptProps {
    visible: boolean;
    /** The variety on the scanned bucket, shown so a mis-scan is visible. */
    itemCode: string;
    /** Stems in a full bucket. The server rejects anything above this. */
    standard: number | null;
    busy: boolean;
    onConfirm: (stems: number) => void;
    onCancel: () => void;
}

export function StemCountPrompt({
    visible,
    itemCode,
    standard,
    busy,
    onConfirm,
    onCancel,
}: StemCountPromptProps) {
    const [text, setText] = useState('');
    const [error, setError] = useState<string | null>(null);

    function submit(raw: string) {
        const verdict = validateOverride(raw, standard);
        if (!verdict.ok) {
            setError(verdict.reason);
            return;
        }
        setError(null);
        onConfirm(verdict.qty);
    }

    // A fresh prompt per bucket: React remounts on the `visible` key change in
    // the parent, so local state starts empty every time.
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
            <View style={styles.backdrop}>
                <View style={styles.card}>
                    <Text style={styles.title}>How many stems?</Text>
                    <Text style={styles.subtitle}>
                        {itemCode} is unbunched — enter the stems in this bucket.
                    </Text>
                    {standard != null ? (
                        <Text style={styles.standard}>A full bucket is {standard} stems.</Text>
                    ) : null}

                    <View style={styles.quickRow}>
                        {QUICK_PICKS.map((n) => (
                            <Pressable
                                key={n}
                                disabled={busy}
                                onPress={() => submit(String(n))}
                                style={({ pressed }) => [
                                    styles.quick,
                                    pressed && styles.quickPressed,
                                    busy && styles.quickDisabled,
                                ]}
                            >
                                <Text style={styles.quickText}>{n}</Text>
                            </Pressable>
                        ))}
                    </View>

                    <View style={styles.otherRow}>
                        <TextInput
                            style={styles.input}
                            value={text}
                            onChangeText={(t) => {
                                setText(t.replace(/[^0-9]/g, ''));
                                setError(null);
                            }}
                            keyboardType="number-pad"
                            placeholder="Other"
                            placeholderTextColor={colors.muted}
                            editable={!busy}
                            returnKeyType="done"
                            onSubmitEditing={() => submit(text)}
                        />
                        <Button
                            label="Record"
                            onPress={() => submit(text)}
                            disabled={busy || text.trim().length === 0}
                            loading={busy}
                        />
                    </View>

                    {error ? <Text style={styles.error}>{error}</Text> : null}

                    <Button label="Cancel" variant="ghost" onPress={onCancel} disabled={busy} />
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: colors.overlay,
        justifyContent: 'center',
        padding: spacing.lg,
    },
    card: {
        backgroundColor: colors.surface,
        borderRadius: radii.lg,
        padding: spacing.lg,
        gap: spacing.md,
    },
    title: { fontSize: 18, fontWeight: '700', color: colors.text },
    subtitle: { fontSize: 14, color: colors.textSecondary },
    standard: { fontSize: 13, color: colors.muted },
    quickRow: { flexDirection: 'row', gap: spacing.sm },
    quick: {
        flex: 1,
        paddingVertical: spacing.lg,
        borderRadius: radii.md,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceAlt,
        alignItems: 'center',
    },
    quickPressed: { backgroundColor: colors.pressed },
    quickDisabled: { opacity: 0.5 },
    quickText: { fontSize: 22, fontWeight: '700', color: colors.text },
    otherRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    input: {
        flex: 1,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radii.md,
        paddingHorizontal: spacing.md,
        paddingVertical: 10,
        fontSize: 16,
        color: colors.text,
        backgroundColor: colors.surface,
    },
    error: { fontSize: 13, color: colors.error },
});
