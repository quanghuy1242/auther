"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui";
import { FormWrapper, FormField, SubmitButton } from "@/components/forms";
import { updateGroupSchema } from "../../shared";
import { updateGroup } from "../../actions";
import { toast } from "@/lib/toast";

interface GroupOverviewTabProps {
    group: {
        id: string;
        name: string;
        description: string | null;
    };
}

export function GroupOverviewTab({ group }: GroupOverviewTabProps) {
    const [key, setKey] = React.useState(0); // Force re-mount on successful save to reset dirty state if needed

    const handleSubmit = async (_prevState: any, formData: FormData) => {
        const name = formData.get("name") as string;
        const description = formData.get("description") as string;

        // We handle the server action manually by extracting form data
        try {
            await updateGroup(group.id, {
                name,
                description,
            });
            return { success: true };
        } catch (error) {
            return { success: false, error: "Failed to update group" };
        }
    };

    const handleSuccess = () => {
        toast.success("Group updated successfully");
        setKey((prev) => prev + 1);
    };

    return (
        <Card className="max-w-2xl">
            <CardContent className="pt-6">
                <FormWrapper
                    key={key}
                    schema={updateGroupSchema}
                    defaultValues={{
                        name: group.name,
                        description: group.description || "",
                    }}
                    action={handleSubmit}
                    onSuccess={handleSuccess}
                    className="space-y-6"
                >
                    <FormField
                        name="name"
                        label="Group Name"
                        placeholder="e.g. Admin Team"
                        required
                    />

                    <FormField
                        name="description"
                        label="Description"
                        placeholder="Optional description"
                    />

                    <div className="flex justify-end pt-2">
                        <SubmitButton variant="primary">
                            Save Changes
                        </SubmitButton>
                    </div>
                </FormWrapper>
            </CardContent>
        </Card>
    );
}
