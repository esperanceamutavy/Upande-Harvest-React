import { StyleSheet, Text, View } from 'react-native';

export default function Grading() {
  return (
    <View style={styles.container}>
      <Text style={{ fontSize: 16 }}>Grading — coming in Phase 4</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
