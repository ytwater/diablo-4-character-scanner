import type { Href } from "expo-router";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, router, Stack } from "expo-router";
import { LegendList } from "@legendapp/list";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "~/utils/api";
import { ScanLink } from "~/components/scan-link";
import { orpc } from "~/utils/api";
import { authClient } from "~/utils/auth";

const WEB_APP_URL = "https://diablo-4-character-scanner.ytwater.workers.dev";

// "/character/[id]" and "/character/[id]/scan" don't exist as routes yet
// (they land in a later task), so they're outside the generated typed-routes
// union. Cast the same way scan-link.native.tsx/scan-link.web.tsx do for
// "/scan" until the route files exist.
function characterHref(id: string): Href {
  return { pathname: "/character/[id]", params: { id } } as unknown as Href;
}
function characterHeaderScanHref(id: string): Href {
  return {
    pathname: "/character/[id]/scan",
    params: { id, target: "header" },
  } as unknown as Href;
}

function EmailPasswordAuth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (mode: "signIn" | "signUp") => {
    setError(null);
    setInfo(null);
    try {
      if (mode === "signUp") {
        await authClient.signUp.email({ email, password, name: email });
      } else {
        await authClient.signIn.email({ email, password });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      console.error("Email/password auth failed", err);
    }
  };

  const forgotPassword = async () => {
    setError(null);
    setInfo(null);
    if (!email) {
      setError("Enter your email above first");
      return;
    }
    try {
      const res = await authClient.forgetPassword({
        email,
        redirectTo: `${WEB_APP_URL}/reset-password`,
      });
      if (res.error) {
        setError(res.error.message ?? "Failed to send reset email");
        return;
      }
      setInfo("If that email exists, a reset link has been sent.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      console.error("Forgot password failed", err);
    }
  };

  return (
    <View className="mt-2 gap-2">
      <TextInput
        className="border-input bg-background text-foreground items-center rounded-md border px-3 text-lg leading-tight"
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        className="border-input bg-background text-foreground items-center rounded-md border px-3 text-lg leading-tight"
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        secureTextEntry
      />
      {error && <Text className="text-destructive">{error}</Text>}
      {info && <Text className="text-muted-foreground">{info}</Text>}
      <View className="flex flex-row gap-2">
        <Pressable
          onPress={() => submit("signIn")}
          className="bg-primary flex-1 items-center rounded-sm p-2"
        >
          <Text>Sign In</Text>
        </Pressable>
        <Pressable
          onPress={() => submit("signUp")}
          className="bg-primary flex-1 items-center rounded-sm p-2"
        >
          <Text>Sign Up</Text>
        </Pressable>
      </View>
      <Pressable onPress={forgotPassword} className="items-center p-2">
        <Text className="text-muted-foreground underline">
          Forgot password?
        </Text>
      </Pressable>
    </View>
  );
}

function MobileAuth() {
  const { data: session } = authClient.useSession();

  return (
    <>
      <Text className="text-foreground pb-2 text-center text-xl font-semibold">
        {session?.user.name ? `Hello, ${session.user.name}` : "Not logged in"}
      </Text>
      <Pressable
        onPress={async () => {
          try {
            if (session) {
              await authClient.signOut();
            } else {
              await authClient.signIn.social({
                provider: "google",
                callbackURL: "/",
              });
            }
          } catch (error) {
            console.error("Google sign-in failed", error);
          }
        }}
        className="bg-primary flex items-center rounded-sm p-2"
      >
        <Text>{session ? "Sign Out" : "Sign In With Google"}</Text>
      </Pressable>
      {!session && <EmailPasswordAuth />}
    </>
  );
}

function CharacterRow(props: {
  character: RouterOutputs["character"]["list"][number];
}) {
  return (
    <Link asChild href={characterHref(props.character.id)}>
      <Pressable className="bg-muted flex flex-row items-center justify-between rounded-lg p-4">
        <View>
          <Text className="text-foreground text-lg font-semibold">
            {props.character.name}
          </Text>
          <Text className="text-muted-foreground capitalize">
            {props.character.class ?? "No class yet"} · Level{" "}
            {props.character.level}
            {props.character.paragon != null &&
              ` · Paragon ${props.character.paragon}`}
          </Text>
        </View>
        <Text className="text-muted-foreground">
          {props.character.filledSlots}/11 slots
        </Text>
      </Pressable>
    </Link>
  );
}

export default function Index() {
  const { data: session } = authClient.useSession();
  const queryClient = useQueryClient();
  const charactersQuery = useQuery({
    ...orpc.character.list.queryOptions(),
    enabled: !!session,
  });

  const createMutation = useMutation(
    orpc.character.create.mutationOptions({
      onSuccess: async (character) => {
        await queryClient.invalidateQueries({
          queryKey: orpc.character.list.key(),
        });
        // Class is picked later, when the player adds their first item —
        // jump straight into the header scan to fill in name/level/title.
        router.push(characterHref(character.id));
        router.push(characterHeaderScanHref(character.id));
      },
    }),
  );

  return (
    <SafeAreaView className="bg-background">
      {/* Changes page title visible on the header */}
      <Stack.Screen options={{ title: "My Characters" }} />
      <View className="bg-background h-full w-full p-4">
        <Text className="text-foreground pb-2 text-center text-5xl font-bold">
          Diablo 4 <Text className="text-primary">Scanner</Text>
        </Text>

        <MobileAuth />

        {session && (
          <>
            <Pressable
              disabled={createMutation.isPending}
              onPress={() => createMutation.mutate({})}
              style={{ backgroundColor: "#ec4899" }}
              className="my-2 items-center rounded-sm p-2"
            >
              <Text style={{ color: "#fff" }}>+ New Character</Text>
            </Pressable>
            <LegendList
              data={charactersQuery.data ?? []}
              estimatedItemSize={72}
              keyExtractor={(item) => item.id}
              ItemSeparatorComponent={() => <View className="h-2" />}
              renderItem={(c) => <CharacterRow character={c.item} />}
            />
          </>
        )}

        <ScanLink />
      </View>
    </SafeAreaView>
  );
}
