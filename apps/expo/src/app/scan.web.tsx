import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Stack } from "expo-router";

import type {
  CharacterCandidates,
  ItemCandidates,
  ScanMode,
} from "@acme/validators";

import { useScan } from "~/features/scanner/useScan.web";

export default function ScanWebScreen() {
  const [mode, setMode] = useState<ScanMode>("character");
  const { candidates, status, error, scanFile, retake } = useScan(mode);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File | null | undefined) => {
    if (file) void scanFile(file);
  };

  const characterCandidates = candidates as CharacterCandidates;
  const itemCandidates = candidates as ItemCandidates;

  return (
    <View className="bg-background h-full w-full items-center justify-center p-4">
      <Stack.Screen options={{ title: "Scan" }} />
      <Text className="text-foreground pb-4 text-2xl font-bold">
        Scan a screenshot
      </Text>

      <View className="mb-4 flex-row gap-2">
        {(["character", "item"] as const).map((m) => (
          <Pressable
            key={m}
            onPress={() => setMode(m)}
            className="rounded-full px-4 py-2"
            style={{
              backgroundColor: mode === m ? "#22d3ee" : "rgba(0,0,0,0.2)",
            }}
          >
            <Text className="text-sm font-semibold capitalize">{m}</Text>
          </Pressable>
        ))}
      </View>

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

      {status === "done" && mode === "character" && (
        <View className="mt-4">
          <Text>Level: {characterCandidates.level ?? "—"}</Text>
          <Text>Title: {characterCandidates.title ?? "—"}</Text>
          <Text>Name: {characterCandidates.name ?? "—"}</Text>
          <Pressable
            onPress={retake}
            className="mt-2 rounded-full bg-cyan-400 px-6 py-3"
          >
            <Text>Scan another</Text>
          </Pressable>
        </View>
      )}

      {status === "done" && mode === "item" && (
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
            onPress={retake}
            className="mt-2 rounded-full bg-cyan-400 px-6 py-3"
          >
            <Text>Scan another</Text>
          </Pressable>
        </View>
      )}

      {status === "error" && (
        <View className="mt-4">
          <Text className="text-destructive">Error: {error}</Text>
          <Pressable
            onPress={retake}
            className="mt-2 rounded-full bg-cyan-400 px-6 py-3"
          >
            <Text>Try again</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
