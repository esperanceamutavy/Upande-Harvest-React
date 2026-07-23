import { StyleSheet, Text, View } from 'react-native';

export default function ErpDesk() {
  return (
    <View style={styles.container}>
      <Text style={{ fontSize: 16 }}>ERP Desk — coming in Phase 6</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
