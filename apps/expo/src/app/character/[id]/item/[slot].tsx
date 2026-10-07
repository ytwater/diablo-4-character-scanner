import type { Href } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import type { ItemLine, ItemRarity } from "@acme/validators";

import { ItemTooltip } from "~/features/character/ItemTooltip";
import { orpc } from "~/utils/api";

// "/character/[id]/scan" doesn't exist as a route yet at the type-generation
// point this file was written against — cast the same way
// apps/expo/src/app/character/[id]/index.tsx does.
function scanHref(id: string, target: string): Href {
  return {
    pathname: "/character/[id]/scan",
    params: { id, target },
  } as unknown as Href;
}

export default function ItemDetailScreen() {
  const { id, slot } = useLocalSearchParams<{ id: string; slot: string }>();
  const characterQuery = useQuery(
    orpc.character.byId.queryOptions({ input: { id } }),
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
        <Text className="text-destructive">Couldn't load this item.</Text>
        <Text onPress={() => characterQuery.refetch()} className="text-primary">
          Retry
        </Text>
      </SafeAreaView>
    );
  }

  const item = characterQuery.data.items.find((i) => i.slot === slot);

  return (
    <SafeAreaView className="bg-background h-full">
      <Stack.Screen options={{ title: item?.name ?? slot }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        {item ? (
          <ItemTooltip
            item={{
              name: item.name,
              rarity: item.rarity ? (item.rarity as ItemRarity) : undefined,
              typeLine: item.typeLine ?? undefined,
              lines: item.lines as ItemLine[],
            }}
          />
        ) : (
          <Text className="text-muted-foreground">
            This slot hasn't been scanned yet.
          </Text>
        )}
        <View className="pt-2">
          <Pressable
            onPress={() => router.push(scanHref(id, slot))}
            className="bg-primary items-center rounded-sm p-3"
          >
            <Text className="text-foreground font-semibold">Re-scan</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
