import * as React from "react";
import { Label, Input } from "@/components/ui";

interface UserFormFieldsProps {
  defaultValues: {
    name: string;
    email: string;
    username?: string | null;
    displayUsername?: string | null;
  };
  errors?: Record<string, string>;
  isEditing?: boolean;
}

export function UserFormFields({ defaultValues, errors, isEditing = true }: UserFormFieldsProps) {
  if (!isEditing) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <Label className="text-gray-400">Full Name</Label>
          <p className="text-base text-white mt-1">{defaultValues.name}</p>
        </div>
        <div>
          <Label className="text-gray-400">Email Address</Label>
          <p className="text-base text-white mt-1">{defaultValues.email}</p>
        </div>
        <div>
          <Label className="text-gray-400">Username</Label>
          <p className="text-base text-white mt-1">{defaultValues.username || "Not set"}</p>
        </div>
        <div>
          <Label className="text-gray-400">Display Username</Label>
          <p className="text-base text-white mt-1">
            {defaultValues.displayUsername || "Not set"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="name">Full Name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={defaultValues.name}
          error={errors?.name}
        />
      </div>
      <div>
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          name="username"
          defaultValue={defaultValues.username || ""}
          placeholder="Optional"
          error={errors?.username}
        />
      </div>
      <div>
        <Label htmlFor="displayUsername">Display Username</Label>
        <Input
          id="displayUsername"
          name="displayUsername"
          defaultValue={defaultValues.displayUsername || ""}
          placeholder="Optional"
          error={errors?.displayUsername}
        />
      </div>
      <div>
        <Label htmlFor="email">Email Address</Label>
        <Input
          id="email"
          value={defaultValues.email}
          disabled
          className="opacity-50"
        />
        <p className="text-xs text-gray-400 mt-1">
          Email cannot be changed
        </p>
      </div>
    </div>
  );
}
