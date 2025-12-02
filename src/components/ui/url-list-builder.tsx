"use client";

import * as React from "react";
import { Icon, Input, Button } from "@/components/ui";

export interface UrlListBuilderProps {
  urls: string[];
  onChange: (urls: string[]) => void;
  placeholder?: string;
  label?: string;
  description?: string;
  minUrls?: number;
  validateUrl?: boolean;
  className?: string;
}

/**
 * URL List Builder component for managing multiple URLs
 * Allows adding, removing, and validating URLs in a user-friendly interface
 * 
 * @example
 * <UrlListBuilder
 *   urls={redirectUrls}
 *   onChange={setRedirectUrls}
 *   placeholder="https://example.com/callback"
 *   label="Redirect URIs"
 *   minUrls={1}
 *   validateUrl
 * />
 */
export function UrlListBuilder({
  urls,
  onChange,
  placeholder = "https://example.com",
  label,
  description,
  minUrls = 1,
  validateUrl = true,
  className,
}: UrlListBuilderProps) {
  const [newUrl, setNewUrl] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const handleAdd = () => {
    setError(null);

    const trimmedUrl = newUrl.trim();

    if (!trimmedUrl) {
      setError("URL cannot be empty");
      return;
    }

    // Validate URL format if enabled
    if (validateUrl) {
      try {
        new URL(trimmedUrl);
      } catch {
        setError("Invalid URL format. Must be a valid URL (e.g., https://example.com)");
        return;
      }
    }

    if (urls.includes(trimmedUrl)) {
      setError("URL already exists in the list");
      return;
    }

    onChange([...urls, trimmedUrl]);
    setNewUrl("");
  };

  const handleRemove = (index: number) => {
    if (urls.length <= minUrls) {
      return; // Prevent removing if at minimum
    }
    onChange(urls.filter((_, i) => i !== index));
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-medium text-white mb-2">
          {label}
          {minUrls > 0 && <span className="text-red-400 ml-1">*</span>}
        </label>
      )}
      
      {description && (
        <p className="text-sm text-gray-400 mb-3">{description}</p>
      )}

      <div className="space-y-3">
        {/* Existing URLs - Individual input fields with delete buttons */}
        {urls.map((url, index) => (
          <div key={index} className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <Input
                value={url}
                onChange={(e) => {
                  const newUrls = [...urls];
                  newUrls[index] = e.target.value;
                  onChange(newUrls);
                }}
                className="bg-input border-slate-700"
              />
            </div>
            <button
              type="button"
              onClick={() => onRemove(index)}
              disabled={disabled}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-hover-primary hover:text-red-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-400"
            >
          </div>
        ))}

        {/* Add new URL */}
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <Input
              value={newUrl}
              onChange={(e) => {
                setNewUrl(e.target.value);
                setError(null);
              }}
              onKeyPress={handleKeyPress}
              placeholder={placeholder}
              error={error || undefined}
              className="bg-input border-slate-700"
            />
          </div>
        </div>
        
        {/* Add URI Button */}
        <Button
          type="button"
          variant="secondary"
          onClick={handleAdd}
          leftIcon="add"
          className="w-fit"
          size="sm"
        >
          Add URI
        </Button>
      </div>
    </div>
  );
}
