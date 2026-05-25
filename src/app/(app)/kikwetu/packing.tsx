import { StyleSheet, Text, View } from 'react-native';

export default function Packing() {
  return (
    <View style={styles.container}>
      <Text style={{ fontSize: 16 }}>Packing — coming in Phase 4</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
