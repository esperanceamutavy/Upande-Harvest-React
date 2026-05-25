import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Eye, EyeOff } from 'lucide-react-native';

import { CLIENT_REGISTRY } from '../../lib/clients';
import { getClientIdByUrl } from '../../lib/instanceMapper';
import { STORAGE_KEYS, getStorageItem } from '../../lib/storage';
import { useLogin } from '../../features/auth/useLogin';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { Pill } from '../../components/ui/Pill';
import { colors, radii, spacing } from '../../components/ui/theme';

interface FormValues {
  url: string;
  email: string;
  password: string;
}

export default function LoginScreen() {
  const { submit, isLoading, error } = useLogin();
  const [clientName, setClientName] = useState<string | null>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: { url: '', email: '', password: '' },
  });

  const urlValue = watch('url');

  // Pre-fill URL and email from AsyncStorage backups
  useEffect(() => {
    async function prefill() {
      const [savedUrl, savedEmail] = await Promise.all([
        getStorageItem(STORAGE_KEYS.INSTANCE_URL_BACKUP),
        getStorageItem(STORAGE_KEYS.EMAIL_BACKUP),
      ]);
      if (savedUrl) {
        setValue('url', savedUrl.replace(/^https?:\/\//, '').replace(/\/+$/, ''));
      }
      if (savedEmail) {
        setValue('email', savedEmail);
      }
    }
    void prefill();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setValue]);

  // Client name badge — updates on every keystroke, pure synchronous lookup
  useEffect(() => {
    const trimmed = urlValue.trim();
    if (!trimmed) {
      setClientName(null);
      return;
    }
    const clientId = getClientIdByUrl(`https://${trimmed}`);
    setClientName(clientId ? CLIENT_REGISTRY[clientId].displayName : null);
  }, [urlValue]);

  const onSubmit = handleSubmit(({ url, email, password }) => {
    void submit({ url, email, password });
  });

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <Text style={styles.appName}>Upande Harvest</Text>

            <Field label="Server URL" error={errors.url?.message}>
              <Controller
                control={control}
                name="url"
                rules={{ required: 'URL required' }}
                render={({ field: { value, onChange, onBlur } }) => (
                  <TextInput
                    style={[styles.input, errors.url && styles.inputError]}
                    placeholder="Instance URL (e.g. demo.upande.com)"
                    placeholderTextColor={colors.muted}
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    autoCapitalize="none"
                    keyboardType="url"
                    autoCorrect={false}
                  />
                )}
              />
              {!errors.url && clientName ? (
                <Text style={styles.clientBadge}>{clientName}</Text>
              ) : null}
            </Field>

            <Field label="Email" error={errors.email?.message}>
              <Controller
                control={control}
                name="email"
                rules={{ required: 'Email required' }}
                render={({ field: { value, onChange, onBlur } }) => (
                  <TextInput
                    style={[styles.input, errors.email && styles.inputError]}
                    placeholder="Email"
                    placeholderTextColor={colors.muted}
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoComplete="email"
                    autoCorrect={false}
                  />
                )}
              />
            </Field>

            <Field label="Password" error={errors.password?.message}>
              <View style={styles.passwordRow}>
                <Controller
                  control={control}
                  name="password"
                  rules={{ required: 'Password required' }}
                  render={({ field: { value, onChange, onBlur } }) => (
                    <TextInput
                      style={[styles.input, styles.passwordInput, errors.password && styles.inputError]}
                      placeholder="Password"
                      placeholderTextColor={colors.muted}
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      secureTextEntry={!passwordVisible}
                    />
                  )}
                />
                <Pressable
                  onPress={() => setPasswordVisible((v) => !v)}
                  hitSlop={8}
                  style={styles.eyeBtn}
                >
                  {passwordVisible
                    ? <EyeOff size={20} color="#666" />
                    : <Eye size={20} color="#666" />}
                </Pressable>
              </View>
            </Field>

            {error ? <Pill variant="error">{error}</Pill> : null}

            <Button onPress={onSubmit} disabled={isLoading}>
              {isLoading ? 'Please wait...' : 'Log In'}
            </Button>

            <View style={styles.footer}>
              <Text style={styles.footerText}>Powered by:</Text>
              <Image
                source={require('../../../assets/images/upande_logo.png')}
                style={styles.logo}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 450,
    gap: spacing.lg,
    elevation: 4,
    shadowColor: 'black',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  appName: {
    fontSize: 26,
    fontWeight: '600',
    textAlign: 'center',
    color: colors.primary,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.primary,
    backgroundColor: colors.surface,
  },
  inputError: { borderColor: colors.error },
  clientBadge: { fontSize: 12, fontWeight: '500', color: colors.accent, marginTop: 2 },
  passwordRow: { flexDirection: 'row', alignItems: 'center' },
  passwordInput: { flex: 1 },
  eyeBtn: { padding: 4, marginLeft: spacing.sm },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  footerText: { fontSize: 13, color: '#888' },
  logo: { height: 28, width: 28, resizeMode: 'contain' },
});
