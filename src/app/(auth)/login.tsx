import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Image, KeyboardAvoidingView, Platform, StyleSheet, TouchableOpacity } from 'react-native';
import { Button, Input, Text, XStack, YStack } from 'tamagui';

import { CLIENT_REGISTRY } from '../../lib/clients';
import { getClientIdByUrl } from '../../lib/instanceMapper';
import { STORAGE_KEYS, getStorageItem } from '../../lib/storage';
import { useLogin } from '../../features/auth/useLogin';

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
        setValue('url', savedUrl.replace(/^https?:\/\//, ''));
      }
      if (savedEmail) {
        setValue('email', savedEmail);
      }
    }
    void prefill();
  }, []);

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
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <YStack flex={1} justifyContent="center" alignItems="center" paddingHorizontal="$4">
        <YStack
          backgroundColor="white"
          borderRadius="$4"
          padding="$5"
          width="100%"
          maxWidth={450}
          gap="$4"
          // Shadow for Android
          elevation={4}
          // Shadow for iOS
          shadowColor="black"
          shadowOpacity={0.15}
          shadowRadius={8}
          shadowOffset={{ width: 0, height: 2 }}
        >
          <Text fontSize={26} fontWeight="600" textAlign="center" color="$primary">
            Upande Harvest
          </Text>

          {/* URL field + client name badge */}
          <YStack gap="$1">
            <Controller
              control={control}
              name="url"
              rules={{ required: 'URL required' }}
              render={({ field: { value, onChange, onBlur } }) => (
                <Input
                  placeholder="Instance URL (e.g. demo.upande.com)"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  autoCapitalize="none"
                  keyboardType="url"
                  autoCorrect={false}
                  borderColor={errors.url ? '$red8' : '$borderColor'}
                />
              )}
            />
            {errors.url ? (
              <Text color="$red10" fontSize={12}>{errors.url.message}</Text>
            ) : clientName ? (
              <Text color="$accent" fontSize={12} fontWeight="500">{clientName}</Text>
            ) : null}
          </YStack>

          {/* Email field */}
          <YStack gap="$1">
            <Controller
              control={control}
              name="email"
              rules={{ required: 'Email required' }}
              render={({ field: { value, onChange, onBlur } }) => (
                <Input
                  placeholder="Email"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoCorrect={false}
                  borderColor={errors.email ? '$red8' : '$borderColor'}
                />
              )}
            />
            {errors.email && (
              <Text color="$red10" fontSize={12}>{errors.email.message}</Text>
            )}
          </YStack>

          {/* Password field with show/hide toggle */}
          <YStack gap="$1">
            <XStack alignItems="center" gap="$2">
              <Controller
                control={control}
                name="password"
                rules={{ required: 'Password required' }}
                render={({ field: { value, onChange, onBlur } }) => (
                  <Input
                    flex={1}
                    placeholder="Password"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    secureTextEntry={!passwordVisible}
                    borderColor={errors.password ? '$red8' : '$borderColor'}
                  />
                )}
              />
              <TouchableOpacity
                onPress={() => setPasswordVisible((v) => !v)}
                hitSlop={8}
                style={styles.eyeButton}
              >
                <Text fontSize={18}>{passwordVisible ? '🙈' : '👁️'}</Text>
              </TouchableOpacity>
            </XStack>
            {errors.password && (
              <Text color="$red10" fontSize={12}>{errors.password.message}</Text>
            )}
          </YStack>

          {/* Submit button */}
          <Button
            onPress={onSubmit}
            disabled={isLoading}
            backgroundColor="$accent"
            color="white"
            fontWeight="600"
            fontSize={16}
            pressStyle={{ opacity: 0.8 }}
          >
            {isLoading ? 'Please wait...' : 'Log In'}
          </Button>

          {/* Login error */}
          {error ? (
            <Text color="$red10" fontSize={13} textAlign="center" lineHeight={18}>
              {error}
            </Text>
          ) : null}

          {/* Powered-by logo */}
          <XStack justifyContent="center" alignItems="center" gap="$2" marginTop="$1">
            <Text fontSize={13} color="$gray10">Powered by:</Text>
            <Image
              source={require('../../../assets/images/upande_logo.png')}
              style={styles.logo}
            />
          </XStack>
        </YStack>
      </YStack>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  logo: { height: 28, width: 28, resizeMode: 'contain' },
  eyeButton: { padding: 4 },
});
