import type { Href } from "expo-router";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack } from "expo-router";
import { useMutation } from "@tanstack/react-query";

import type { CharacterClass } from "@acme/validators";
import { CharacterClassSchema } from "@acme/validators";

import { orpc } from "~/utils/api";

// "/character/[id]" doesn't exist as a route yet (it lands in Task 7), so
// it's outside the generated typed-routes union. Cast the same way
// apps/expo/src/app/index.tsx does for "/character/new" until the route
// file exists.
function characterHref(id: string): Href {
  return { pathname: "/character/[id]", params: { id } } as unknown as Href;
}

export default function NewCharacterScreen() {
  const [name, setName] = useState("");
  const [cls, setCls] = useState<CharacterClass>();

  const { mutate, isPending, error } = useMutation(
    orpc.character.create.mutationOptions({
      onSuccess: (character) => {
        router.replace(characterHref(character.id));
      },
    }),
  );

  return (
    <SafeAreaView className="bg-background h-full">
      <Stack.Screen options={{ title: "New Character" }} />
      <View className="gap-4 p-4">
        <TextInput
          className="border-input bg-background text-foreground rounded-md border px-3 py-2 text-lg"
          placeholder="Character name"
          value={name}
          onChangeText={setName}
        />
        <View className="flex-row flex-wrap gap-2">
          {CharacterClassSchema.options.map((option) => (
            <Pressable
              key={option}
              onPress={() => setCls(option)}
              className="rounded-full px-4 py-2"
              style={{ backgroundColor: cls === option ? "#ec4899" : "#3f3f46" }}
            >
              <Text className="capitalize text-white">{option}</Text>
            </Pressable>
          ))}
        </View>
        {error && <Text className="text-destructive">{error.message}</Text>}
        <Pressable
          disabled={!name || !cls || isPending}
          onPress={() => cls && mutate({ name, class: cls })}
          className="bg-primary items-center rounded-sm p-3"
        >
          <Text className="text-foreground font-semibold">Create</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
