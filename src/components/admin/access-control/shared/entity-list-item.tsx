"use client";

import * as React from "react";
import { Icon } from "@/components/ui";

interface EntityListItemProps {
    name: string;
    isSelected: boolean;
    onSelect: () => void;
    onDelete: () => void;
}

export function EntityListItem({ name, isSelected, onSelect, onDelete }: EntityListItemProps) {
    return (
        <button
            onClick={onSelect}
            className={`w-full text-left px-3 py-2 rounded text-sm flex items-center justify-between group ${isSelected
                    ? "bg-[#243647] text-white"
                    : "text-gray-400 hover:text-white hover:bg-[#243647]/50"
                }`}
        >
            <span className="truncate">{name}</span>
            {isSelected && (
                <span
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete();
                    }}
                    className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-opacity"
                >
                    <Icon name="delete" className="text-[14px]" />
                </span>
            )}
        </button>
    );
}
