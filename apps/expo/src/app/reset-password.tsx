import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, Stack, useLocalSearchParams } from "expo-router";

import { authClient } from "~/utils/auth";

export default function ResetPasswordScreen() {
  const { token, error } = useLocalSearchParams<{
    token?: string;
    error?: string;
  }>();

  const [newPassword, setNewPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  if (!token || error) {
    return (
      <SafeAreaView className="bg-background">
        <Stack.Screen options={{ title: "Reset password" }} />
        <View className="h-full w-full items-center justify-center gap-4 p-4">
          <Text className="text-destructive text-center">
            This reset link is invalid or has expired.
          </Text>
          <Link href="/" className="text-primary">
            Back to home
          </Link>
        </View>
      </SafeAreaView>
    );
  }

  const submit = async () => {
    setStatus("idle");
    setMessage(null);
    const res = await authClient.resetPassword({ newPassword, token });
    if (res.error) {
      setStatus("error");
      setMessage(res.error.message ?? "Failed to reset password");
      return;
    }
    setStatus("success");
  };

  if (status === "success") {
    return (
      <SafeAreaView className="bg-background">
        <Stack.Screen options={{ title: "Reset password" }} />
        <View className="h-full w-full items-center justify-center gap-4 p-4">
          <Text className="text-foreground">Your password has been reset.</Text>
          <Link href="/" className="text-primary">
            Sign in
          </Link>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="bg-background">
      <Stack.Screen options={{ title: "Reset password" }} />
      <View className="h-full w-full gap-2 p-4">
        <Text className="text-foreground pb-2 text-center text-2xl font-bold">
          Reset your password
        </Text>
        <TextInput
          className="border-input bg-background text-foreground items-center rounded-md border px-3 text-lg leading-tight"
          value={newPassword}
          onChangeText={setNewPassword}
          placeholder="New password"
          secureTextEntry
        />
        {message && <Text className="text-destructive">{message}</Text>}
        <Pressable
          onPress={submit}
          className="bg-primary items-center rounded-sm p-2"
        >
          <Text>Reset password</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
