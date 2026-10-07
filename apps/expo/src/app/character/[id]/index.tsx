import type { Href } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, router, Stack, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { CharacterClass, ItemRarity, ItemSlot } from "@acme/validators";
import { CharacterClassSchema } from "@acme/validators";

import { CharacterHeader } from "~/features/character/CharacterHeader";
import { PaperDoll } from "~/features/character/PaperDoll";
import { orpc } from "~/utils/api";

// Shown in place of <PaperDoll> until a class is set — items can't be added
// (or their slots validated) without one. See character router's
// `assertValidSlot`.
function ClassPicker(props: { onPick: (cls: CharacterClass) => void }) {
  return (
    <View className="gap-2 py-2">
      <Text className="text-foreground text-lg">
        Pick a class to start adding items
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {CharacterClassSchema.options.map((option) => (
          <Pressable
            key={option}
            onPress={() => props.onPick(option)}
            style={{ backgroundColor: "#3f3f46" }}
            className="rounded-full px-4 py-2"
          >
            <Text className="text-white capitalize">{option}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

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

function itemHref(id: string, slot: string): Href {
  return {
    pathname: "/character/[id]/item/[slot]",
    params: { id, slot },
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
        <Text className="text-destructive">Couldn't load this character.</Text>
        <Text onPress={() => characterQuery.refetch()} className="text-primary">
          Retry
        </Text>
      </SafeAreaView>
    );
  }

  const character = characterQuery.data;

  const paperDollItems: {
    slot: ItemSlot;
    name: string;
    rarity?: ItemRarity;
  }[] = character.items.map((item) => ({
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
        {character.class ? (
          <PaperDoll
            characterClass={character.class as CharacterClass}
            items={paperDollItems}
            onSlotPress={(slot: ItemSlot) => {
              const filled = character.items.some((i) => i.slot === slot);
              router.push(filled ? itemHref(id, slot) : scanHref(id, slot));
            }}
          />
        ) : (
          <ClassPicker
            onPick={(cls) => updateMutation.mutate({ id, class: cls })}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
