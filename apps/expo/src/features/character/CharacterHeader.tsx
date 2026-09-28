import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import type { RouterOutputs } from "~/utils/api";

type Character = RouterOutputs["character"]["byId"];

export function CharacterHeader(props: {
  character: Character;
  onSave: (patch: {
    name?: string;
    level?: number;
    paragon?: number | null;
    title?: string | null;
  }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(props.character.name);
  const [level, setLevel] = useState(String(props.character.level));
  const [paragon, setParagon] = useState(
    props.character.paragon?.toString() ?? "",
  );
  const [title, setTitle] = useState(props.character.title ?? "");

  if (!editing) {
    return (
      <Pressable onPress={() => setEditing(true)} className="gap-1 p-2">
        <Text className="text-foreground text-2xl font-bold">
          {props.character.name}
        </Text>
        <Text className="text-muted-foreground">
          {props.character.level === 70 && props.character.paragon != null
            ? `Level 70 · Paragon ${props.character.paragon}`
            : `Level ${props.character.level}`}
          {props.character.title ? ` · ${props.character.title}` : ""}
        </Text>
        {props.character.class && (
          <Text className="text-muted-foreground capitalize">
            {props.character.class}
          </Text>
        )}
      </Pressable>
    );
  }

  return (
    <View className="gap-2 p-2">
      <TextInput
        className="border-input rounded-md border px-2 py-1"
        value={name}
        onChangeText={setName}
      />
      <TextInput
        className="border-input rounded-md border px-2 py-1"
        value={level}
        onChangeText={setLevel}
        keyboardType="number-pad"
        placeholder="Level"
      />
      {Number(level) === 70 && (
        <TextInput
          className="border-input rounded-md border px-2 py-1"
          value={paragon}
          onChangeText={setParagon}
          keyboardType="number-pad"
          placeholder="Paragon"
        />
      )}
      <TextInput
        className="border-input rounded-md border px-2 py-1"
        value={title}
        onChangeText={setTitle}
        placeholder="Title"
      />
      <Pressable
        className="bg-primary items-center rounded-sm p-2"
        onPress={() => {
          props.onSave({
            name,
            level: Number(level),
            paragon: Number(level) === 70 && paragon ? Number(paragon) : null,
            title: title || null,
          });
          setEditing(false);
        }}
      >
        <Text className="text-foreground">Save</Text>
      </Pressable>
    </View>
  );
}
