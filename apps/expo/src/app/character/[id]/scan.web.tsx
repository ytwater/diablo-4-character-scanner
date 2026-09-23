import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { CharacterCandidates, ItemCandidates } from "@acme/validators";

import { interpretBadge } from "~/features/scanner/interpretBadge";
import { useScan } from "~/features/scanner/useScan.web";
import { orpc } from "~/utils/api";

export default function CharacterScanWebScreen() {
  const { id, target } = useLocalSearchParams<{ id: string; target: string }>();
  const isHeader = target === "header";
  const { candidates, status, error, scanFile, retake } = useScan(
    isHeader ? "character" : "item",
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [treatAsParagon, setTreatAsParagon] = useState(false);

  const characterQueryOptions = orpc.character.byId.queryOptions({
    input: { id },
  });
  const characterQuery = useQuery(characterQueryOptions);

  const updateMutation = useMutation(orpc.character.update.mutationOptions());
  const upsertItemMutation = useMutation(
    orpc.character.upsertItem.mutationOptions(),
  );

  const characterCandidates = candidates as CharacterCandidates;
  const itemCandidates = candidates as ItemCandidates;
  const levelCandidate = isHeader ? characterCandidates.level : undefined;

  const handleFile = (file: File | null | undefined) => {
    if (file) void scanFile(file);
  };

  const save = async () => {
    if (isHeader) {
      const patch: {
        name?: string;
        title?: string | null;
        level?: number;
        paragon?: number | null;
      } = {};
      if (characterCandidates.name) patch.name = characterCandidates.name;
      if (characterCandidates.title) patch.title = characterCandidates.title;

      const n = characterCandidates.level
        ? parseInt(characterCandidates.level, 10)
        : undefined;
      const currentCharacter = characterQuery.data;
      if (n !== undefined && !Number.isNaN(n) && currentCharacter) {
        if (treatAsParagon) {
          patch.level = 70;
          patch.paragon = n;
        } else {
          const badge = interpretBadge(n, {
            level: currentCharacter.level,
            paragon: currentCharacter.paragon,
          });
          patch.level = badge.level;
          patch.paragon = badge.paragon;
        }
      }
      await updateMutation.mutateAsync({ id, ...patch });
    } else {
      await upsertItemMutation.mutateAsync({
        characterId: id,
        slot: target,
        name: itemCandidates.name ?? "Unknown item",
        typeLine: itemCandidates.type,
        rarity: itemCandidates.rarity as never,
        lines: itemCandidates.affixes.map((text) => ({
          kind: "other" as const,
          text,
        })),
      });
    }
    await queryClient.invalidateQueries({
      queryKey: characterQueryOptions.queryKey,
    });
    router.back();
  };

  return (
    <View className="bg-background h-full w-full items-center justify-center p-4">
      <Stack.Screen
        options={{ title: isHeader ? "Scan Character Sheet" : "Scan Item" }}
      />
      <Text className="text-foreground pb-4 text-2xl font-bold">
        {isHeader ? "Scan character sheet" : "Scan item"}
      </Text>

      <div
        onPaste={(e) => {
          const item = Array.from(e.clipboardData.items).find((i) =>
            i.type.startsWith("image/"),
          );
          handleFile(item?.getAsFile());
        }}
        style={{
          border: "2px dashed #888",
          borderRadius: 8,
          padding: 32,
          textAlign: "center",
          width: "100%",
          maxWidth: 480,
        }}
      >
        <p>Paste a screenshot here, or</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>

      {status === "processing" && <Text className="mt-4">Scanning…</Text>}

      {status === "done" && isHeader && (
        <View className="mt-4">
          <Text>Level: {characterCandidates.level ?? "—"}</Text>
          <Text>Title: {characterCandidates.title ?? "—"}</Text>
          <Text>Name: {characterCandidates.name ?? "—"}</Text>
          {levelCandidate && (
            <Pressable onPress={() => setTreatAsParagon((v) => !v)}>
              <Text style={{ color: treatAsParagon ? "#22d3ee" : undefined }}>
                {treatAsParagon ? "☑" : "☐"} Max level — treat as Paragon
              </Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => void save()}
            className="mt-2 rounded-full bg-cyan-400 px-6 py-3"
          >
            <Text>Save</Text>
          </Pressable>
          <Pressable onPress={retake} className="mt-2 rounded-full bg-zinc-700 px-6 py-3">
            <Text>Retake</Text>
          </Pressable>
        </View>
      )}

      {status === "done" && !isHeader && (
        <View className="mt-4">
          <Text>Name: {itemCandidates.name ?? "—"}</Text>
          <Text>Rarity: {itemCandidates.rarity ?? "—"}</Text>
          <Text>Type: {itemCandidates.type ?? "—"}</Text>
          <Text>Affixes:</Text>
          {itemCandidates.affixes.length === 0 ? (
            <Text>—</Text>
          ) : (
            itemCandidates.affixes.map((affix, i) => (
              <Text key={i}>{affix}</Text>
            ))
          )}
          <Pressable
            onPress={() => void save()}
            className="mt-2 rounded-full bg-cyan-400 px-6 py-3"
          >
            <Text>Save</Text>
          </Pressable>
          <Pressable onPress={retake} className="mt-2 rounded-full bg-zinc-700 px-6 py-3">
            <Text>Retake</Text>
          </Pressable>
        </View>
      )}

      {status === "error" && (
        <View className="mt-4">
          <Text className="text-destructive">Error: {error}</Text>
          <Pressable onPress={retake} className="mt-2 rounded-full bg-cyan-400 px-6 py-3">
            <Text>Try again</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
