import { StyleSheet, View } from 'react-native';
import { Text } from 'tamagui';

export default function Harvesting() {
  return (
    <View style={styles.container}>
      <Text fontSize={16}>Harvesting — coming in Phase 4</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
