import type { ConfigLayer, ResolvedConfigEntry } from "../types.js";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * 계층을 낮은 우선순위 → 높은 우선순위 순으로 깊은 병합한다.
 * 객체는 재귀 병합, 배열과 스칼라는 상위 계층이 통째로 대체한다.
 */
export function mergeLayers(layers: ConfigLayer[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const layer of layers) deepMerge(out, layer.values);
  return out;
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(source)) {
    const existing = target[key];
    if (isPlainObject(existing) && isPlainObject(value)) {
      deepMerge(existing, value);
    } else if (isPlainObject(value)) {
      const copy: Record<string, unknown> = {};
      deepMerge(copy, value);
      target[key] = copy;
    } else {
      target[key] = value;
    }
  }
}

/**
 * 리프 키(dot path) 단위로 최종값·결정 계층·덮어쓰기 이력을 계산한다.
 * `bass config explain` 의 데이터 소스.
 */
export function explainLayers(layers: ConfigLayer[]): ResolvedConfigEntry[] {
  const history = new Map<string, Array<{ layer: string; source: string; value: unknown }>>();

  for (const layer of layers) {
    for (const [dotKey, value] of flatten(layer.values)) {
      const entries = history.get(dotKey) ?? [];
      entries.push({ layer: layer.name, source: layer.source, value });
      history.set(dotKey, entries);
    }
  }

  const result: ResolvedConfigEntry[] = [];
  for (const [key, entries] of history) {
    const finalEntry = entries[entries.length - 1]!;
    result.push({
      key,
      value: finalEntry.value,
      layer: finalEntry.layer,
      source: finalEntry.source,
      overridden: entries.slice(0, -1),
    });
  }
  return result.sort((a, b) => a.key.localeCompare(b.key));
}

function flatten(obj: Record<string, unknown>, prefix = ""): Array<[string, unknown]> {
  const out: Array<[string, unknown]> = [];
  for (const [key, value] of Object.entries(obj)) {
    const dotKey = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(value)) {
      out.push(...flatten(value, dotKey));
    } else {
      out.push([dotKey, value]);
    }
  }
  return out;
}

// 키의 마지막 세그먼트가 비밀정보 명칭으로 "끝나는" 경우만 마스킹한다.
// (token_consistency 같은 일반 설정 키를 오인하지 않도록 접미사 기준)
const SECRET_KEY_PATTERN = /(secret|token|password|passphrase|api[_-]?key|credential)s?$/i;

/** 비밀정보로 보이는 키의 값을 마스킹한다. */
export function maskSecrets(entries: ResolvedConfigEntry[]): ResolvedConfigEntry[] {
  return entries.map((e) =>
    SECRET_KEY_PATTERN.test(e.key)
      ? {
          ...e,
          value: "***masked***",
          overridden: e.overridden.map((o) => ({ ...o, value: "***masked***" })),
        }
      : e,
  );
}
