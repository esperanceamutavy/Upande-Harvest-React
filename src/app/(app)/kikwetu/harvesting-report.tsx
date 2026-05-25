import { StyleSheet, Text, View } from 'react-native';

export default function HarvestingReport() {
  return (
    <View style={styles.container}>
      <Text style={{ fontSize: 16 }}>Harvesting Report — coming in Phase 5</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
