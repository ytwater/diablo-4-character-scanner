import { useRef, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Camera, useCameraDevice, useCameraPermission } from "react-native-vision-camera";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { CharacterCandidates, ItemCandidates } from "@acme/validators";

import { classifyLines } from "~/features/scanner/classifyLines";
import { interpretBadge } from "~/features/scanner/interpretBadge";
import { itemConfig, scannerConfig } from "~/features/scanner/config";
import { useScan } from "~/features/scanner/useScan";
import { orpc } from "~/utils/api";

export default function CharacterScanScreen() {
  const { id, target } = useLocalSearchParams<{ id: string; target: string }>();
  const isHeader = target === "header";
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("back");
  const cameraRef = useRef<Camera>(null);
  const { candidates, status, photoPath, error, blocks, capture, retake } = useScan(
    isHeader ? "character" : "item",
    cameraRef,
  );
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
  const roi = isHeader ? scannerConfig.roi : itemConfig.roi;
  const levelCandidate = isHeader ? characterCandidates.level : undefined;

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
      // Native has per-block OCR text/frame/color data (blocks, from
      // useScan.native.ts), so classifyLines can actually distinguish item
      // power/armor/dps/socket/implicit/aspect/affix lines. See
      // scan.web.tsx for why the web path can't do this.
      const lines = blocks
        ? classifyLines(blocks)
        : itemCandidates.affixes.map((text) => ({
            kind: "other" as const,
            text,
          }));
      await upsertItemMutation.mutateAsync({
        characterId: id,
        slot: target,
        name: itemCandidates.name ?? "Unknown item",
        typeLine: itemCandidates.type,
        rarity: itemCandidates.rarity as never,
        lines,
      });
    }
    await queryClient.invalidateQueries({
      queryKey: characterQueryOptions.queryKey,
    });
    router.back();
  };

  if (!hasPermission) {
    void requestPermission();
    return (
      <View className="bg-background h-full w-full items-center justify-center">
        <Stack.Screen options={{ title: "Scan" }} />
        <Text className="text-foreground">Requesting camera permission…</Text>
      </View>
    );
  }

  if (!device) {
    return (
      <View className="bg-background h-full w-full items-center justify-center">
        <Stack.Screen options={{ title: "Scan" }} />
        <Text className="text-foreground">No camera device found.</Text>
      </View>
    );
  }

  const showPhoto = status !== "idle" && photoPath;

  return (
    <View className="h-full w-full">
      <Stack.Screen
        options={{ title: isHeader ? "Scan Character Sheet" : "Scan Item" }}
      />
      {showPhoto ? (
        <Image
          source={{ uri: photoPath }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      ) : (
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={true}
          photo={true}
        />
      )}
      {status === "idle" && (
        <View
          className="absolute"
          style={{
            left: `${roi.x * 100}%`,
            top: `${roi.y * 100}%`,
            width: `${roi.width * 100}%`,
            height: `${roi.height * 100}%`,
            borderWidth: 2,
            borderColor: "#22d3ee",
          }}
        />
      )}
      {(status === "capturing" || status === "processing") && (
        <View className="absolute inset-0 items-center justify-center bg-black/40">
          <Text className="text-base" style={{ color: "#ffffff" }}>
            Scanning…
          </Text>
        </View>
      )}
      {status === "idle" && (
        <View className="absolute inset-x-4 bottom-16 items-center">
          <Pressable
            onPress={() => void capture()}
            className="rounded-full bg-cyan-400 px-6 py-3"
          >
            <Text
              className="text-base font-semibold"
              style={{ color: "#000000" }}
            >
              Take Picture
            </Text>
          </Pressable>
        </View>
      )}
      {status === "done" && (
        <View className="absolute inset-x-4 bottom-16 gap-2 rounded-lg bg-black/60 p-3">
          {isHeader ? (
            <>
              <Text className="mb-1 text-base" style={{ color: "#ffffff" }}>
                Level: {characterCandidates.level ?? "—"}
              </Text>
              <Text className="mb-1 text-base" style={{ color: "#ffffff" }}>
                Title: {characterCandidates.title ?? "—"}
              </Text>
              <Text className="mb-1 text-base" style={{ color: "#ffffff" }}>
                Name: {characterCandidates.name ?? "—"}
              </Text>
              {levelCandidate && (
                <Pressable onPress={() => setTreatAsParagon((v) => !v)}>
                  <Text style={{ color: treatAsParagon ? "#22d3ee" : "#ffffff" }}>
                    {treatAsParagon ? "☑" : "☐"} Max level — treat as Paragon
                  </Text>
                </Pressable>
              )}
            </>
          ) : (
            <>
              <Text className="mb-1 text-base" style={{ color: "#ffffff" }}>
                Name: {itemCandidates.name ?? "—"}
              </Text>
              <Text className="mb-1 text-base" style={{ color: "#ffffff" }}>
                Rarity: {itemCandidates.rarity ?? "—"}
              </Text>
              <Text className="mb-1 text-base" style={{ color: "#ffffff" }}>
                Type: {itemCandidates.type ?? "—"}
              </Text>
              <Text className="mb-1 text-base" style={{ color: "#ffffff" }}>
                Affixes:
              </Text>
              {itemCandidates.affixes.length === 0 ? (
                <Text className="mb-1 text-base" style={{ color: "#ffffff" }}>
                  —
                </Text>
              ) : (
                itemCandidates.affixes.map((affix, i) => (
                  <Text
                    key={i}
                    className="mb-1 text-base"
                    style={{ color: "#ffffff" }}
                  >
                    {affix}
                  </Text>
                ))
              )}
            </>
          )}
          <Pressable
            onPress={() => void save()}
            className="items-center rounded-full bg-cyan-400 px-6 py-3"
          >
            <Text
              className="text-base font-semibold"
              style={{ color: "#000000" }}
            >
              Save
            </Text>
          </Pressable>
          <Pressable
            onPress={retake}
            className="items-center rounded-full bg-zinc-700 px-6 py-3"
          >
            <Text
              className="text-base font-semibold"
              style={{ color: "#ffffff" }}
            >
              Retake
            </Text>
          </Pressable>
        </View>
      )}
      {status === "error" && (
        <View className="absolute inset-x-4 bottom-16 rounded-lg bg-black/60 p-3">
          <Text className="mb-3 text-base" style={{ color: "#ffffff" }}>
            Error: {error}
          </Text>
          <Pressable
            onPress={retake}
            className="items-center rounded-full bg-cyan-400 px-6 py-3"
          >
            <Text
              className="text-base font-semibold"
              style={{ color: "#000000" }}
            >
              Retake
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
