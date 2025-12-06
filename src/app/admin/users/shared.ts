export type ProviderConfig = {
  id: string;
  name: string;
  icon: string;
};

export const PROVIDERS: Record<string, ProviderConfig> = {
  google: { id: "google", name: "Google", icon: "https://www.google.com/favicon.ico" },
  github: { id: "github", name: "GitHub", icon: "https://github.com/favicon.ico" },
  credential: { id: "credential", name: "Email/Password", icon: "mail" },
};

export function getProviderConfig(providerId: string): ProviderConfig {
  return PROVIDERS[providerId] || { id: providerId, name: providerId, icon: "key" };
}