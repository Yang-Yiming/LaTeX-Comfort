import {
  SECRET_KEYS,
  providerSecretKey,
  type ProviderKind,
} from "@latex-comfort/shared";

export interface SecretStorageLike {
  get(key: string): PromiseLike<string | undefined>;
  store(key: string, value: string): PromiseLike<void>;
  delete(key: string): PromiseLike<void>;
}

export async function readProviderApiKey(
  secrets: SecretStorageLike,
  provider: ProviderKind,
): Promise<string | undefined> {
  const key = providerSecretKey(provider);
  if (!key) return undefined;

  const current = await secrets.get(key);
  if (current) return current;

  if (provider === "openai-compatible") {
    const legacy = await secrets.get(SECRET_KEYS.apiKeyLegacy);
    if (legacy) {
      await secrets.store(key, legacy);
      return legacy;
    }
  }

  return undefined;
}

export async function storeProviderApiKey(
  secrets: SecretStorageLike,
  provider: ProviderKind,
  apiKey: string,
): Promise<void> {
  const key = providerSecretKey(provider);
  if (!key) return;

  const value = apiKey.trim();
  if (value) {
    await secrets.store(key, value);
  } else {
    await secrets.delete(key);
  }
}
