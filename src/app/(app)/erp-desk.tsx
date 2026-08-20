import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Screen } from '../../components/ui/Screen';
import { colors, typography } from '../../components/ui/theme';

export default function ErpDesk() {
  const router = useRouter();

  return (
    <Screen title="ERP Desk" onBack={() => router.back()} scroll={false}>
      <View style={styles.container}>
        <Text style={styles.placeholder}>ERP Desk — coming in Phase 6</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  placeholder: { ...typography.body, color: colors.textMuted },
});
