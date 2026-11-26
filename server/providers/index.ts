import { claudeProvider } from "./claude";
import { geminiProvider } from "./gemini";
import { Provider } from "./types";

/** To add a provider, implement the Provider interface and list it here. */
const ALL: Provider[] = [geminiProvider, claudeProvider];

export function availableProviders(): Provider[] {
  return ALL.filter((p) => p.isConfigured());
}

export function getProvider(id: string): Provider | undefined {
  return availableProviders().find((p) => p.id === id);
}
