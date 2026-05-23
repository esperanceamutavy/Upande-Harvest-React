import { StyleSheet, View } from 'react-native';
import { Text } from 'tamagui';

export default function Dispatch() {
  return (
    <View style={styles.container}>
      <Text fontSize={16}>Dispatch — coming in Phase 4</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
