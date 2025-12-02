import { Badge, Icon } from "@/components/ui";

export interface SecretStatusRowProps {
  secret: {
    name: string;
    isSet: boolean;
    description: string;
  };
}

/**
 * Secret Status Row Component
 * Displays the status of environment secrets with tooltip descriptions
 * 
 * @example
 * <SecretStatusRow 
 *   secret={{
 *     name: "BETTER_AUTH_SECRET",
 *     isSet: true,
 *     description: "Secret for Better Auth integration"
 *   }}
 * />
 */
export function SecretStatusRow({ secret }: SecretStatusRowProps) {
  return (
    <div 
      className="flex items-start sm:items-center justify-between py-3 px-4 rounded-lg border border-border-dark gap-3 bg-input"
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <p className="text-white font-medium font-mono text-sm break-all">{secret.name}</p>
        <div className="relative group flex-shrink-0">
          <Icon name="info" className="!text-base text-white/50 cursor-pointer" />
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 border border-border-dark rounded-lg text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 bg-input">
            {secret.description}
          </div>
        </div>
      </div>
      <div className="flex-shrink-0">
        {secret.isSet ? (
          <Badge variant="success" dot>
            Set
          </Badge>
        ) : (
          <Badge variant="warning" dot>
            Not Set
          </Badge>
        )}
      </div>
    </div>
  );
}
