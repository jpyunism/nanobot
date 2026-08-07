import { describe, expect, it } from "vitest";

import { resources } from "@/i18n";

function flattenKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return flattenKeys(value as Record<string, unknown>, path);
    }
    return [path];
  });
}

describe("i18n locale parity", () => {
  it("every locale has the same common keys as English", () => {
    // Compare only the app's own `common` namespace. Channel-plugin namespaces
    // legitimately differ per locale (e.g. only zh-CN/zh-TW ship displayName
    // for dingtalk/feishu/wecom/weixin).
    const enKeys = flattenKeys(resources.en.common).sort();
    for (const [locale, bundle] of Object.entries(resources)) {
      if (locale === "en") continue;
      const keys = flattenKeys(bundle.common).sort();
      expect(keys, `locale ${locale} common key set differs from en`).toEqual(enKeys);
    }
  });
});
