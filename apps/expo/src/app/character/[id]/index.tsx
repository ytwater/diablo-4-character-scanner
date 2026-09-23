import type { Href } from "expo-router";
import { Link, router, Stack, useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { CharacterClass, ItemRarity, ItemSlot } from "@acme/validators";

import { CharacterHeader } from "~/features/character/CharacterHeader";
import { PaperDoll } from "~/features/character/PaperDoll";
import { orpc } from "~/utils/api";

// "/character/[id]/scan" doesn't exist as a route yet (it lands in Task 8),
// so it's outside the generated typed-routes union. Cast the same way
// apps/expo/src/app/character/new.tsx does for "/character/[id]" until the
// route file exists.
function scanHref(id: string, target: string): Href {
  return {
    pathname: "/character/[id]/scan",
    params: { id, target },
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

  const paperDollItems: { slot: ItemSlot; name: string; rarity?: ItemRarity }[] =
    character.items.map((item) => ({
      slot: item.slot,
      name: item.name,
      rarity: item.rarity ? (item.rarity as ItemRarity) : undefined,
    }));

  return (
    <SafeAreaView className="bg-background h-full">
      <Stack.Screen options={{ title: character.name }} />
      <View className="p-4">
        <CharacterHeader
          character={character}
          onSave={(patch) => updateMutation.mutate({ id, ...patch })}
        />
        <Link href={scanHref(id, "header")} className="text-primary py-2">
          Scan character sheet
        </Link>
        {/*
          Tapping a filled slot re-scans it directly for now. A real
          tooltip-with-Re-scan/Remove view is a known gap, not built here.
        */}
        <PaperDoll
          characterClass={character.class as CharacterClass}
          items={paperDollItems}
          onSlotPress={(slot: ItemSlot) => router.push(scanHref(id, slot))}
        />
      </View>
    </SafeAreaView>
  );
}
