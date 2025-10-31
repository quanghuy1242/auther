"use client";

import { Control, Controller } from "react-hook-form";
import { StyledCheckbox } from "@/components/ui";
import { cn } from "@/lib/utils/cn";

export interface EventOption {
  value: string;
  label: string;
  description?: string;
}

interface EventSelectorProps {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any>;
  events: EventOption[];
  label?: string;
  className?: string;
}

/**
 * EventSelector - Multi-select checkbox grid for webhook event subscriptions
 * 3 columns on desktop, 1 column on mobile
 * Integrates with react-hook-form via Controller
 * 
 * @example
 * <EventSelector
 *   name="events"
 *   control={form.control}
 *   events={WEBHOOK_EVENT_TYPES}
 *   label="Select events to subscribe to"
 * />
 */
export function EventSelector({ name, control, events, label, className }: EventSelectorProps) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => {
        const selectedEvents = Array.isArray(field.value) ? field.value : [];

        const toggleEvent = (eventValue: string) => {
          const newSelected = selectedEvents.includes(eventValue)
            ? selectedEvents.filter((e) => e !== eventValue)
            : [...selectedEvents, eventValue];
          field.onChange(newSelected);
        };

        return (
          <div className={className}>
            {label && (
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-3">
                {label}
              </label>
            )}

            {/* Event Grid - 4 columns on desktop, 2 on tablet, 1 on mobile */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {events.map((event) => {
                const isSelected = selectedEvents.includes(event.value);

                return (
                  <div
                    key={event.value}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border transition-all",
                      "hover:border-[var(--color-primary)]/50",
                      isSelected
                        ? "bg-[var(--color-primary)]/10 border-[var(--color-primary)]/50"
                        : "border-white/10"
                    )}
                    style={!isSelected ? { backgroundColor: '#1a2632' } : undefined}
                  >
                    <StyledCheckbox
                      checked={isSelected}
                      onChange={() => toggleEvent(event.value)}
                      label={event.value}
                    />
                  </div>
                );
              })}
            </div>

            {/* Error message */}
            {fieldState.error && (
              <p className="mt-2 text-sm text-red-500">{fieldState.error.message}</p>
            )}

            {/* Helper text */}
            <p className="mt-3 text-xs text-[var(--color-text-tertiary)]">
              Select all events you want to be notified about. You can modify this selection later.
            </p>
          </div>
        );
      }}
    />
  );
}
