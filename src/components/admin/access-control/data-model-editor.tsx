"use client";

import * as React from "react";
import { Button, Textarea, Alert, Icon, EmptyState } from "@/components/ui";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { SectionHeader } from "@/components/ui/section-header";
import { EntityListItem, RelationRow, PermissionRow, type Subject } from "./shared";

interface DataModelEditorProps {
  model: string;
  onChange: (value: string) => void;
  onSave: () => void;
  disabled?: boolean;
}

interface Relation {
  name: string;
  subjects: string;
}

interface Permission {
  name: string;
  requiredRelation: string;
}

interface Entity {
  name: string;
  relations: Relation[];
  permissions: Permission[];
}

// --- Helper Functions ---

function parseSubjects(subjectsStr: string): Subject[] {
  if (!subjectsStr.trim()) return [];
  return subjectsStr.split("|").map(s => {
    const [type, relation] = s.trim().split("#");
    return { type: type.trim(), relation: relation?.trim() };
  });
}

function buildSubjectsString(subjects: Subject[]): string {
  return subjects.map(s => s.relation ? `${s.type}#${s.relation}` : s.type).join(" | ");
}

// --- Main Component ---

export function DataModelEditor({ model, onChange, onSave, disabled }: DataModelEditorProps) {
  const [mode, setMode] = React.useState<"visual" | "json">("visual");
  const [entities, setEntities] = React.useState<Entity[]>([]);
  const [selectedEntityName, setSelectedEntityName] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [entityToDelete, setEntityToDelete] = React.useState<string | null>(null);

  // Parse JSON into UI Entities
  const parseModel = React.useCallback((json: string) => {
    try {
      const parsed = JSON.parse(json);
      const newEntities: Entity[] = [];

      if (parsed.types) {
        Object.entries(parsed.types as Record<string, {
          relations?: Record<string, string>;
          permissions?: Record<string, { relation: string }>;
        }>).forEach(([name, def]) => {
          const relations: Relation[] = [];
          const permissions: Permission[] = [];

          if (def.relations) {
            Object.entries(def.relations).forEach(([relName, subjects]) => {
              relations.push({ name: relName, subjects: String(subjects) });
            });
          }

          if (def.permissions) {
            Object.entries(def.permissions).forEach(([permName, permDef]) => {
              permissions.push({ name: permName, requiredRelation: permDef.relation || "" });
            });
          }

          newEntities.push({ name, relations, permissions });
        });
      }

      setEntities(newEntities);
      if (newEntities.length > 0 && !selectedEntityName) {
        setSelectedEntityName(newEntities[0].name);
      }
      setError(null);
      return true;
    } catch {
      setError("Invalid JSON schema. Switch to Code mode to fix syntax.");
      return false;
    }
  }, [selectedEntityName]);

  // Serialize UI Entities back to JSON
  const updateJson = React.useCallback((newEntities: Entity[]) => {
    try {
      const parsed = JSON.parse(model || "{}");
      const types: Record<string, {
        relations: Record<string, string>;
        permissions: Record<string, { relation: string }>;
      }> = {};

      newEntities.forEach(ent => {
        const relations: Record<string, string> = {};
        const permissions: Record<string, { relation: string }> = {};

        ent.relations.forEach(rel => {
          if (rel.name.trim()) {
            relations[rel.name] = rel.subjects;
          }
        });

        ent.permissions.forEach(perm => {
          if (perm.name.trim()) {
            permissions[perm.name] = { relation: perm.requiredRelation };
          }
        });

        types[ent.name] = { relations, permissions };
      });

      const newModel = JSON.stringify({ ...parsed, types }, null, 2);
      onChange(newModel);
    } catch (e) {
      console.error("Failed to serialize model", e);
    }
  }, [model, onChange]);

  // Track if we're updating from user action
  const isUserEditRef = React.useRef(false);

  // Initialize from model prop
  React.useEffect(() => {
    if (mode === "visual" && !isUserEditRef.current) {
      parseModel(model);
    }
    isUserEditRef.current = false;
  }, [model, mode, parseModel]);

  // Helper to update entities and sync to JSON
  const updateEntities = React.useCallback((updater: (prev: Entity[]) => Entity[]) => {
    isUserEditRef.current = true;
    setEntities(prev => {
      const newEntities = updater(prev);
      // Schedule JSON update after state is set
      setTimeout(() => updateJson(newEntities), 0);
      return newEntities;
    });
  }, [updateJson]);

  const handleSave = () => {
    onSave();
  };

  // --- Entity Handlers ---

  const handleAddEntity = () => {
    updateEntities(prev => {
      const name = `entity_${prev.length + 1}`;
      setSelectedEntityName(name);
      return [...prev, { name, relations: [], permissions: [] }];
    });
  };

  const handleDeleteEntity = (name: string) => {
    updateEntities(prev => {
      const newEntities = prev.filter(e => e.name !== name);
      if (selectedEntityName === name) {
        setSelectedEntityName(newEntities[0]?.name || null);
      }
      return newEntities;
    });
  };

  const handleUpdateEntityName = (oldName: string, newName: string) => {
    updateEntities(prev => {
      setSelectedEntityName(newName);
      return prev.map(e => e.name === oldName ? { ...e, name: newName } : e);
    });
  };

  // --- Relation Handlers ---

  const handleAddRelation = (entityName: string) => {
    updateEntities(prev => prev.map(e => {
      if (e.name === entityName) {
        return {
          ...e,
          relations: [...e.relations, { name: "", subjects: "" }]
        };
      }
      return e;
    }));
  };

  const handleUpdateRelation = (entityName: string, index: number, field: keyof Relation, value: string) => {
    updateEntities(prev => prev.map(e => {
      if (e.name === entityName) {
        const newRelations = [...e.relations];
        newRelations[index] = { ...newRelations[index], [field]: value };
        return { ...e, relations: newRelations };
      }
      return e;
    }));
  };

  const handleRemoveRelation = (entityName: string, index: number) => {
    updateEntities(prev => prev.map(e => {
      if (e.name === entityName) {
        return { ...e, relations: e.relations.filter((_, i) => i !== index) };
      }
      return e;
    }));
  };

  // --- Permission Handlers ---

  const handleAddPermission = (entityName: string) => {
    updateEntities(prev => prev.map(e => {
      if (e.name === entityName) {
        return {
          ...e,
          permissions: [...e.permissions, { name: "", requiredRelation: "" }]
        };
      }
      return e;
    }));
  };

  const handleUpdatePermission = (
    entityName: string,
    index: number,
    field: keyof Permission,
    value: string
  ) => {
    updateEntities(prev => prev.map(e => {
      if (e.name === entityName) {
        const newPermissions = [...e.permissions];
        newPermissions[index] = { ...newPermissions[index], [field]: value };
        return { ...e, permissions: newPermissions };
      }
      return e;
    }));
  };

  const handleRemovePermission = (entityName: string, index: number) => {
    updateEntities(prev => prev.map(e => {
      if (e.name === entityName) {
        return { ...e, permissions: e.permissions.filter((_, i) => i !== index) };
      }
      return e;
    }));
  };

  const selectedEntity = entities.find(e => e.name === selectedEntityName);



  return (
    <div className="space-y-4">
      <SectionHeader
        title="Authorization Schema"
        description="Define your entity types and relations."
        action={
          <div className="flex items-center gap-2">
            <SegmentedControl
              options={[
                { value: "visual", label: "Visual" },
                { value: "json", label: "Code (JSON)" },
              ]}
              value={mode}
              onChange={setMode}
            />
            <Button
              onClick={handleSave}
              disabled={disabled}
              leftIcon="save"
              variant="primary"
              className="h-[38px]"
            >
              Save Changes
            </Button>
          </div>
        }
      />

      {mode === "visual" && (
        <Alert variant="info" title="Defining Relations & Inheritance">
          <p className="mb-2">
            Relations define roles or actions. You can define inheritance by adding other relations.
          </p>
          <ul className="list-disc list-inside space-y-1 pl-1 text-xs">
            <li><strong>Name:</strong> The relation name (e.g. <code>viewer</code>).</li>
            <li><strong>Inherited Relations:</strong> Relations that imply this one. For example, if you add <code>editor</code> to the <code>viewer</code> relation, it means &quot;All Editors are also Viewers&quot;.</li>
          </ul>
        </Alert>
      )}

      {error && (
        <Alert variant="error" title="Parsing Error">
          {error}
        </Alert>
      )}

      {mode === "json" ? (
        <div className="relative w-full rounded-lg border border-slate-700 bg-[#111921] overflow-hidden group">
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <span className="text-xs text-slate-500 font-mono">json</span>
          </div>
          <Textarea
            value={model}
            onChange={(e) => onChange(e.target.value)}
            spellCheck={false}
            className="w-full h-[500px] bg-transparent text-sm font-mono text-blue-100 p-4 border-none focus:ring-0 resize-none leading-relaxed"
            containerClassName="space-y-0"
            disabled={disabled}
          />
        </div>
      ) : (
        <div className="flex h-[500px] border border-slate-700 rounded-lg overflow-hidden bg-[#111921]">
          {/* Sidebar: Entity List */}
          <div className="w-64 border-r border-slate-700 flex flex-col bg-[#1A2530]/30 h-full">
            <div className="p-3 border-b border-slate-700 flex justify-between items-center">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Entities</span>
              <button onClick={handleAddEntity} className="text-primary hover:text-blue-400 disabled:opacity-50 disabled:cursor-not-allowed" disabled={disabled}>
                <Icon name="add" size="sm" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {entities.map(ent => (
                <EntityListItem
                  key={ent.name}
                  name={ent.name}
                  isSelected={selectedEntityName === ent.name}
                  onSelect={() => setSelectedEntityName(ent.name)}
                  onDelete={() => setEntityToDelete(ent.name)}
                  disabled={disabled}
                />
              ))}
            </div>

            {/* Confirmation Modal */}
            <ConfirmationModal
              isOpen={!!entityToDelete}
              onClose={() => setEntityToDelete(null)}
              onConfirm={() => {
                if (entityToDelete) {
                  handleDeleteEntity(entityToDelete);
                  setEntityToDelete(null);
                }
              }}
              title="Delete Entity Type"
              description={`Are you sure you want to delete the "${entityToDelete}" entity type? This will remove all its relations and permissions.`}
              confirmText="Delete"
            />
          </div>

          {/* Main Panel: Entity Editor */}
          <div className="flex-1 flex flex-col bg-[#111921] h-full">
            {selectedEntity ? (
              <>
                {/* Entity Header */}
                <div className="p-6 border-b border-slate-700 flex items-center gap-4">
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 block mb-1">Entity Type Name</label>
                    <input
                      value={selectedEntity.name}
                      onChange={(e) => handleUpdateEntityName(selectedEntity.name, e.target.value)}
                      className="bg-transparent text-xl font-bold text-white border-none p-0 focus:ring-0 w-full placeholder-gray-600 disabled:opacity-50"
                      placeholder="e.g. invoice"
                      disabled={disabled}
                    />
                  </div>
                </div>

                {/* Relations List */}
                <div className="flex-1 overflow-y-auto p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-medium text-gray-300">Relations</h4>
                    <Button size="xs" variant="secondary" onClick={() => handleAddRelation(selectedEntity.name)} leftIcon="add" disabled={disabled}>
                      Add Relation
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {selectedEntity.relations.length === 0 && (
                      <p className="text-sm text-gray-500 italic text-center py-4">
                        No relations defined yet. Click &quot;Add Relation&quot; to start.
                      </p>
                    )}
                    {selectedEntity.relations.map((rel, idx) => (
                      <RelationRow
                        key={idx}
                        name={rel.name}
                        subjects={parseSubjects(rel.subjects)}
                        availableRelations={[
                          "user",
                          "group#member",
                          ...selectedEntity.relations
                            .map(r => r.name)
                            .filter(n => n !== rel.name && n.trim().length > 0)
                        ]}
                        onNameChange={(name) => handleUpdateRelation(selectedEntity.name, idx, "name", name)}
                        onSubjectsChange={(subjects) => handleUpdateRelation(selectedEntity.name, idx, "subjects", buildSubjectsString(subjects))}
                        onRemove={() => handleRemoveRelation(selectedEntity.name, idx)}
                        disabled={disabled}
                      />
                    ))}
                  </div>

                  {/* Permissions List */}
                  <div className="mt-8 pt-6 border-t border-slate-700">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-medium text-gray-300">Permissions</h4>
                      <Button size="xs" variant="secondary" onClick={() => handleAddPermission(selectedEntity.name)} leftIcon="add" disabled={disabled}>
                        Add Permission
                      </Button>
                    </div>

                    <div className="space-y-3">
                      {selectedEntity.permissions.length === 0 && (
                        <p className="text-sm text-gray-500 italic text-center py-4">
                          No permissions defined yet. Permissions map actions to relations.
                        </p>
                      )}
                      {selectedEntity.permissions.map((perm, idx) => (
                        <PermissionRow
                          key={idx}
                          name={perm.name}
                          requiredRelation={perm.requiredRelation}
                          availableRelations={selectedEntity.relations.map(r => r.name).filter(n => n.trim())}
                          onNameChange={(name) => handleUpdatePermission(selectedEntity.name, idx, "name", name)}
                          onRelationChange={(relation) => handleUpdatePermission(selectedEntity.name, idx, "requiredRelation", relation)}
                          onRemove={() => handleRemovePermission(selectedEntity.name, idx)}
                          disabled={disabled}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <EmptyState
                icon="schema"
                title="No entity selected"
                description="Select an entity type from the sidebar to edit its schema."
                className="flex-1"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}