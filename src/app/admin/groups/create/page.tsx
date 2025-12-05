"use client";

import * as React from "react";
import { PageHeading } from "@/components/layout/page-heading";
import { Card, CardContent, Button } from "@/components/ui";
import { FormWrapper, FormField, SubmitButton } from "@/components/forms";
import { createGroup } from "../actions";
import { useRouter } from "next/navigation";
import { createGroupSchema } from "../shared";

function CreateGroupForm({ onCancel }: { onCancel: () => void }) {
    return (
        <div className="space-y-6">
            <FormField
                name="name"
                label="Group Name"
                placeholder="e.g. Administrators"
                required
            />

            <FormField
                name="description"
                label="Description (Optional)"
                placeholder="e.g. Full access to all resources"
            />

            <div className="flex gap-3 pt-4">
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onCancel}
                >
                    Cancel
                </Button>
                <SubmitButton variant="primary" leftIcon="group_add">
                    Create Group
                </SubmitButton>
            </div>
        </div>
    );
}

export default function CreateGroupPage() {
    const router = useRouter();
    const [showSuccess, setShowSuccess] = React.useState(false);

    const handleSuccess = () => {
        setShowSuccess(true);
        setTimeout(() => {
            router.push("/admin/groups");
        }, 2000);
    };

    const handleCancel = () => {
        router.back();
    };

    const handleSubmit = async (_prevState: any, formData: FormData) => {
        const name = formData.get("name") as string;
        const description = formData.get("description") as string;

        try {
            await createGroup({ name, description });
            return { success: true };
        } catch (e) {
            return { success: false, error: "Failed to create group" };
        }
    };

    return (
        <div className="max-w-6xl mx-auto">
            <PageHeading
                title="Create New Group"
                description="Add a new group to manage permissions"
            />

            <Card>
                <CardContent className="pt-6">
                    {showSuccess ? (
                        <div className="text-center py-8">
                            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                                <span className="material-symbols-outlined text-green-500 text-[32px]">
                                    check_circle
                                </span>
                            </div>
                            <h3 className="text-lg font-semibold text-white mb-2">Group Created Successfully!</h3>
                            <p className="text-sm text-gray-400">
                                Redirecting to group list...
                            </p>
                        </div>
                    ) : (
                        <FormWrapper
                            schema={createGroupSchema}
                            action={handleSubmit}
                            onSuccess={handleSuccess}
                            className="space-y-6"
                        >
                            <CreateGroupForm onCancel={handleCancel} />
                        </FormWrapper>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
