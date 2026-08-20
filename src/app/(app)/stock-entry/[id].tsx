import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Screen } from '../../../components/ui/Screen';
import { colors, typography } from '../../../components/ui/theme';

export default function StockEntryDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  return (
    <Screen title="Stock Entry" onBack={() => router.back()} scroll={false}>
      <View style={styles.container}>
        <Text style={styles.placeholder}>Stock Entry {id} — detail view coming in Phase 6</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  placeholder: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
});
