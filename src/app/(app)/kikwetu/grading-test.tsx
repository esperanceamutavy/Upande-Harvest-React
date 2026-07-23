import { StyleSheet, Text, View } from 'react-native';

export default function GradingTest() {
  return (
    <View style={styles.container}>
      <Text style={{ fontSize: 16 }}>Grading Test — coming in Phase 4</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
