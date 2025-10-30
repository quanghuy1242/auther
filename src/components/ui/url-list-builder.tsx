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

      <div className="space-y-4">
        {/* Existing URLs */}
        <div className="space-y-2">
          {urls.map((url, index) => (
            <div
              key={index}
              className="flex items-center gap-2 p-3 bg-[#111921] rounded-lg border border-white/10"
            >
              <Icon name="check_circle" className="text-green-400 flex-shrink-0" />
              <span className="flex-1 text-white text-sm font-mono break-all">{url}</span>
              {urls.length > minUrls && (
                <button
                  type="button"
                  onClick={() => handleRemove(index)}
                  className="p-1 rounded-md hover:bg-white/10 text-white/70 hover:text-red-400 transition-colors flex-shrink-0"
                  title="Remove URL"
                >
                  <Icon name="close" className="!text-lg" />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Add new URL */}
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              value={newUrl}
              onChange={(e) => {
                setNewUrl(e.target.value);
                setError(null);
              }}
              onKeyPress={handleKeyPress}
              placeholder={placeholder}
              error={error || undefined}
              leftIcon="add"
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={handleAdd}
            leftIcon="add"
          >
            Add URL
          </Button>
        </div>
      </div>
    </div>
  );
}
