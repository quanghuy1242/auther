"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

export interface PaginationProps {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  totalPages?: number;
  onPageChange: (page: number) => void;
  isPending?: boolean;
  className?: string;
}

export function Pagination({
  currentPage,
  pageSize,
  totalItems,
  totalPages: explicitTotalPages,
  onPageChange,
  isPending = false,
  className,
}: PaginationProps) {
  const totalPages = explicitTotalPages ?? Math.ceil(totalItems / pageSize);
  const startItem = totalItems > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className={cn("mt-4 flex flex-col sm:flex-row items-center justify-between gap-4", className)}>
      <p className="text-sm text-gray-400">
        Showing{" "}
        <span className="font-medium text-white">{startItem}</span>{" "}
        to{" "}
        <span className="font-medium text-white">{endItem}</span>{" "}
        of{" "}
        <span className="font-medium text-white">{totalItems}</span>{" "}
        results
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={currentPage <= 1 || isPending}
          leftIcon="chevron_left"
          onClick={() => onPageChange(currentPage - 1)}
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={currentPage >= totalPages || isPending}
          rightIcon="chevron_right"
          onClick={() => onPageChange(currentPage + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}