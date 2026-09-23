import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, Stack } from "expo-router";
import { LegendList } from "@legendapp/list";
import { ORPCError } from "@orpc/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ScanLink } from "~/components/scan-link";
import type { RouterOutputs } from "~/utils/api";
import { orpc } from "~/utils/api";
import { authClient } from "~/utils/auth";

export function PostCard(props: {
  post: RouterOutputs["post"]["all"][number];
  onDelete: () => void;
}) {
  return (
    <View className="bg-muted flex flex-row rounded-lg p-4">
      <View className="grow">
        <Link
          asChild
          href={{
            pathname: "/post/[id]",
            params: { id: props.post.id },
          }}
        >
          <Pressable className="">
            <Text className="text-primary text-xl font-semibold">
              {props.post.title}
            </Text>
            <Text className="text-foreground mt-2">{props.post.content}</Text>
          </Pressable>
        </Link>
      </View>
      <Pressable onPress={props.onDelete}>
        <Text className="text-primary font-bold uppercase">Delete</Text>
      </Pressable>
    </View>
  );
}

function getFieldErrors(error: unknown) {
  if (
    !(error instanceof ORPCError) ||
    error.code !== "INPUT_VALIDATION_FAILED"
  ) {
    return undefined;
  }

  const data = error.data as
    | {
        fieldErrors?: Record<string, string[] | undefined>;
      }
    | undefined;

  return data?.fieldErrors;
}

function CreatePost() {
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const { mutate, error } = useMutation(
    orpc.post.create.mutationOptions({
      async onSuccess() {
        setTitle("");
        setContent("");
        await queryClient.invalidateQueries({
          queryKey: orpc.post.all.key(),
        });
      },
    }),
  );

  const fieldErrors = getFieldErrors(error);

  return (
    <View className="mt-4 flex gap-2">
      <TextInput
        className="border-input bg-background text-foreground items-center rounded-md border px-3 text-lg leading-tight"
        value={title}
        onChangeText={setTitle}
        placeholder="Title"
      />
      {fieldErrors?.title && (
        <Text className="text-destructive mb-2">{fieldErrors.title}</Text>
      )}
      <TextInput
        className="border-input bg-background text-foreground items-center rounded-md border px-3 text-lg leading-tight"
        value={content}
        onChangeText={setContent}
        placeholder="Content"
      />
      {fieldErrors?.content && (
        <Text className="text-destructive mb-2">{fieldErrors.content}</Text>
      )}
      <Pressable
        className="bg-primary flex items-center rounded-sm p-2"
        onPress={() => {
          mutate({
            title,
            content,
          });
        }}
      >
        <Text className="text-foreground">Create</Text>
      </Pressable>
      {error instanceof ORPCError && error.code === "UNAUTHORIZED" && (
        <Text className="text-destructive mt-2">
          You need to be logged in to create a post
        </Text>
      )}
    </View>
  );
}

const WEB_APP_URL = "https://diablo-4-character-scanner.ytwater.workers.dev";

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

export default function Index() {
  const queryClient = useQueryClient();

  const postQuery = useQuery(orpc.post.all.queryOptions());

  const deletePostMutation = useMutation(
    orpc.post.delete.mutationOptions({
      onSettled: () =>
        queryClient.invalidateQueries({ queryKey: orpc.post.all.key() }),
    }),
  );

  return (
    <SafeAreaView className="bg-background">
      {/* Changes page title visible on the header */}
      <Stack.Screen options={{ title: "Home Page" }} />
      <View className="bg-background h-full w-full p-4">
        <Text className="text-foreground pb-2 text-center text-5xl font-bold">
          Diablo 4 <Text className="text-primary">Scanner</Text>
        </Text>

        <MobileAuth />

        <ScanLink />

        <View className="py-2">
          <Text className="text-primary font-semibold italic">
            Press on a post
          </Text>
        </View>

        <LegendList
          data={postQuery.data ?? []}
          estimatedItemSize={20}
          keyExtractor={(item) => item.id}
          ItemSeparatorComponent={() => <View className="h-2" />}
          renderItem={(p) => (
            <PostCard
              post={p.item}
              onDelete={() => deletePostMutation.mutate(p.item.id)}
            />
          )}
        />

        <CreatePost />
      </View>
    </SafeAreaView>
  );
}
