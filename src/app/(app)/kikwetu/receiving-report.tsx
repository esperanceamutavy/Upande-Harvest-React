import { StyleSheet, View } from 'react-native';
import { Text } from 'tamagui';

export default function ReceivingReport() {
  return (
    <View style={styles.container}>
      <Text fontSize={16}>Receiving Report — coming in Phase 5</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
