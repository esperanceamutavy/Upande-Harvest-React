import { StyleSheet, View } from 'react-native';
import { Text } from 'tamagui';

export default function ErpDesk() {
  return (
    <View style={styles.container}>
      <Text fontSize={16}>ERP Desk — coming in Phase 6</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
