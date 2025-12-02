"use client";

import * as React from "react";

interface Column<T> {
  key: string;
  header: string;
  render: (item: T) => React.ReactNode;
  className?: string;
}

interface ResponsiveTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  mobileCardRender?: (item: T) => React.ReactNode;
  emptyMessage?: string;
}

/**
 * ResponsiveTable Component
 * Shows a traditional table on desktop (md+) and card-based list on mobile
 */
export function ResponsiveTable<T>({
  columns,
  data,
  keyExtractor,
  mobileCardRender,
  emptyMessage = "No data available",
}: ResponsiveTableProps<T>) {
  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <>
      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
        <table className="min-w-full divide-y divide-[#344d65]">
          <thead className="bg-[#1a2632]">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider ${column.className || ""}`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-[#1a2632] divide-y divide-[#344d65]">
            {data.map((item) => (
                      <tr key={keyExtractor(item)} className="hover:bg-hover-primary">
                        {columns.map((column) => (
                          <td                    key={column.key}
                    className={`px-6 py-4 whitespace-nowrap ${column.className || ""}`}
                  >
                    {column.render(item)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {mobileCardRender
          ? data.map((item) => (
              <div key={keyExtractor(item)}>{mobileCardRender(item)}</div>
            ))
          : data.map((item) => (
              <div
                key={keyExtractor(item)}
                className="bg-[#1a2632] rounded-lg p-4 space-y-3 border border-[#344d65]"
              >
                {columns.map((column) => (
                  <div key={column.key} className="flex justify-between items-start">
                    <span className="text-xs font-medium text-gray-400 uppercase">
                      {column.header}
                    </span>
                    <span className="text-sm text-white text-right flex-1 ml-4">
                      {column.render(item)}
                    </span>
                  </div>
                ))}
              </div>
            ))}
      </div>
    </>
  );
}
