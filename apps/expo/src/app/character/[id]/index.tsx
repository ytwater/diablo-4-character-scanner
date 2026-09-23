import type { Href } from "expo-router";
import { Link, Stack, useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { CharacterHeader } from "~/features/character/CharacterHeader";
import { orpc } from "~/utils/api";

// "/character/[id]/scan" doesn't exist as a route yet (it lands in Task 8),
// so it's outside the generated typed-routes union. Cast the same way
// apps/expo/src/app/character/new.tsx does for "/character/[id]" until the
// route file exists.
function scanHref(id: string): Href {
  return {
    pathname: "/character/[id]/scan",
    params: { id, target: "header" },
  } as unknown as Href;
}

export default function CharacterScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const characterQuery = useQuery(
    orpc.character.byId.queryOptions({ input: { id } }),
  );

  const updateMutation = useMutation(
    orpc.character.update.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: orpc.character.byId.key({ input: { id } }),
        }),
    }),
  );

  if (characterQuery.isPending) {
    return (
      <SafeAreaView className="bg-background h-full items-center justify-center">
        <Text className="text-foreground">Loading…</Text>
      </SafeAreaView>
    );
  }
  if (characterQuery.isError) {
    return (
      <SafeAreaView className="bg-background h-full items-center justify-center gap-2">
        <Text className="text-destructive">
          Couldn't load this character.
        </Text>
        <Text
          onPress={() => characterQuery.refetch()}
          className="text-primary"
        >
          Retry
        </Text>
      </SafeAreaView>
    );
  }

  const character = characterQuery.data;

  return (
    <SafeAreaView className="bg-background h-full">
      <Stack.Screen options={{ title: character.name }} />
      <View className="p-4">
        <CharacterHeader
          character={character}
          onSave={(patch) => updateMutation.mutate({ id, ...patch })}
        />
        <Link href={scanHref(id)} className="text-primary py-2">
          Scan character sheet
        </Link>
        {/* Task 10 replaces this list with <PaperDoll> */}
        {character.items.map((item) => (
          <Text key={item.id} className="text-foreground py-1">
            {item.slot}: {item.name}
          </Text>
        ))}
      </View>
    </SafeAreaView>
  );
}
