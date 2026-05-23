import { StyleSheet, View } from 'react-native';
import { Text } from 'tamagui';

export default function Configure() {
  return (
    <View style={styles.container}>
      <Text fontSize={16}>Configure Farm — coming in Phase 3</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
