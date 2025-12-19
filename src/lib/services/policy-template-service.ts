import {
    policyTemplateRepo,
    PolicyTemplate,
    NewPolicyTemplate,
} from "@/lib/repositories/platform-access-repository";
import { TupleRepository } from "@/lib/repositories/tuple-repository";

const tupleRepo = new TupleRepository();

// ========================================
// System Templates (seeded on first run)
// ========================================

export const SYSTEM_TEMPLATES: Omit<NewPolicyTemplate, "id">[] = [
    {
        name: "Super Administrator",
        description: "Full platform access - manage all features and settings",
        category: "platform",
        isSystem: true,
        permissions: [
            { entityType: "platform", relation: "super_admin" },
        ],
    },
    {
        name: "Platform Administrator",
        description: "Manage users, clients, and view all platform data",
        category: "platform",
        isSystem: true,
        permissions: [
            { entityType: "platform", relation: "admin" },
            { entityType: "users", relation: "admin" },
            { entityType: "clients", relation: "admin" },
            { entityType: "groups", relation: "admin" },
        ],
    },
    {
        name: "User Manager",
        description: "Create, update, and manage user accounts",
        category: "platform",
        isSystem: true,
        permissions: [
            { entityType: "users", relation: "admin" },
            { entityType: "groups", relation: "editor" },
        ],
    },
    {
        name: "Webhook Operator",
        description: "Create and manage webhooks, view deliveries",
        category: "platform",
        isSystem: true,
        permissions: [
            { entityType: "webhooks", relation: "editor" },
        ],
    },
    {
        name: "Pipeline Developer",
        description: "Create and edit Lua scripts for pipelines",
        category: "platform",
        isSystem: true,
        permissions: [
            { entityType: "pipelines", relation: "editor" },
        ],
    },
    {
        name: "Read-Only Access",
        description: "View all platform data without modification rights",
        category: "platform",
        isSystem: true,
        permissions: [
            { entityType: "platform", relation: "member" },
            { entityType: "users", relation: "viewer" },
            { entityType: "clients", relation: "viewer" },
            { entityType: "webhooks", relation: "viewer" },
            { entityType: "pipelines", relation: "viewer" },
            { entityType: "groups", relation: "viewer" },
            { entityType: "keys", relation: "viewer" },
        ],
    },
    {
        name: "API Key Self-Service",
        description: "Create and manage own API keys only",
        category: "platform",
        isSystem: true,
        permissions: [
            { entityType: "api_keys", relation: "viewer" },
        ],
    },
];

/**
 * Service for managing policy templates.
 */
export class PolicyTemplateService {
    /**
     * Get all templates.
     */
    async getAllTemplates(): Promise<PolicyTemplate[]> {
        return policyTemplateRepo.findAll();
    }

    /**
     * Get a template by ID.
     */
    async getTemplate(id: string): Promise<PolicyTemplate | null> {
        return policyTemplateRepo.findById(id);
    }

    /**
     * Get system templates only.
     */
    async getSystemTemplates(): Promise<PolicyTemplate[]> {
        return policyTemplateRepo.findSystemTemplates();
    }

    /**
     * Get custom templates only.
     */
    async getCustomTemplates(): Promise<PolicyTemplate[]> {
        return policyTemplateRepo.findByCategory("custom");
    }

    /**
     * Create a new custom template.
     */
    async createTemplate(
        data: Omit<NewPolicyTemplate, "id" | "isSystem">
    ): Promise<PolicyTemplate> {
        return policyTemplateRepo.create({
            ...data,
            isSystem: false,
        });
    }

    /**
     * Update a custom template.
     */
    async updateTemplate(
        id: string,
        data: Partial<Omit<NewPolicyTemplate, "id" | "isSystem">>
    ): Promise<PolicyTemplate | null> {
        return policyTemplateRepo.update(id, data);
    }

    /**
     * Delete a custom template.
     */
    async deleteTemplate(id: string): Promise<boolean> {
        return policyTemplateRepo.delete(id);
    }

    /**
     * Apply a template to a user.
     * Creates access tuples for each permission in the template.
     */
    async applyTemplateToUser(templateId: string, userId: string): Promise<void> {
        const template = await policyTemplateRepo.findById(templateId);
        if (!template) {
            throw new Error("Template not found");
        }

        for (const perm of template.permissions) {
            await tupleRepo.createIfNotExists({
                entityType: perm.entityType,
                entityId: perm.entityId || "*",
                relation: perm.relation,
                subjectType: "user",
                subjectId: userId,
            });
        }
    }

    /**
     * Remove all permissions granted by a template from a user.
     */
    async removeTemplateFromUser(templateId: string, userId: string): Promise<void> {
        const template = await policyTemplateRepo.findById(templateId);
        if (!template) {
            throw new Error("Template not found");
        }

        for (const perm of template.permissions) {
            await tupleRepo.delete({
                entityType: perm.entityType,
                entityId: perm.entityId || "*",
                relation: perm.relation,
                subjectType: "user",
                subjectId: userId,
            });
        }
    }

    /**
     * Seed system templates if they don't exist.
     * Call this on application startup.
     */
    async seedSystemTemplates(): Promise<void> {
        const existing = await policyTemplateRepo.findSystemTemplates();
        const existingNames = new Set(existing.map((t) => t.name));

        for (const template of SYSTEM_TEMPLATES) {
            if (!existingNames.has(template.name)) {
                await policyTemplateRepo.create(template);
                console.log(`Seeded system template: ${template.name}`);
            }
        }
    }

    /**
     * Clone a template to create a custom version.
     */
    async cloneTemplate(
        templateId: string,
        newName: string
    ): Promise<PolicyTemplate> {
        const source = await policyTemplateRepo.findById(templateId);
        if (!source) {
            throw new Error("Source template not found");
        }

        return policyTemplateRepo.create({
            name: newName,
            description: `Cloned from: ${source.name}`,
            category: "custom",
            isSystem: false,
            permissions: source.permissions,
        });
    }
}

// Export singleton instance
export const policyTemplateService = new PolicyTemplateService();
