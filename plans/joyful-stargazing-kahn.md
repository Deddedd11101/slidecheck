# План: Рефакторинг структуры правил — реестр vs inline

## Context

Сейчас каждый issue-объект несёт в себе `why` и `fix` — текст, объясняющий суть проблемы и способ исправления. Это создаёт проблему: текст одного и того же правила (например, «градиент станет solid color») дублируется в каждом найденном экземпляре. При 8 градиентах на 8 слайдах — 8 копий одного и того же текста. Это не масштабируемо и неудобно при редактировании.

Пользователь правильно подметил: **`why` и `fix` — это атрибуты правила, а не конкретного нахождения**.

## Разделение на два уровня

| Уровень | Что содержит | Изменяется |
|---|---|---|
| **Rule** (правило) | `id`, `title`, `why`, `fix`, `group`, `severity` | Редко — при обновлении логики |
| **Finding** (нахождение) | `ruleId`, `slide`, `layer`, `nodeId` | Каждый раз при сканировании |

Это стандартный паттерн в линтерах (ESLint, Stylelint): правила определяются один раз, а результаты сканирования ссылаются на них по ID.

## Рекомендуемый подход

### 1. Создать `src/plugin/rules.ts` — реестр правил

```ts
export interface RuleDef {
  id: string;
  group: "visual" | "text" | "structure" | "interactive";
  severity: "critical" | "warning" | "suggestion";
  title: string;
  why: string;
  fix: string;
}

export const RULES: Record<string, RuleDef> = {
  "visual.mask": {
    id: "visual.mask",
    group: "visual",
    severity: "critical",
    title: "Маска может сломаться",
    why: "PowerPoint может не сохранить маску корректно...",
    fix: "Растеризуйте группу в PNG перед экспортом.",
  },
  "visual.gradient": { ... },
  "text.missing-font": { ... },
  // ...
};
```

### 2. Finding — только динамическая часть

```ts
export interface Finding {
  ruleId: string;   // ссылка на RULES
  slide: string;
  layer: string;
  nodeId?: string;
}
```

### 3. UI — объединяет Finding + RuleDef при рендере

```ts
// В App.tsx или IssuesStep
const fullIssue = { ...RULES[finding.ruleId], ...finding };
```

MOCK_ISSUES в App.tsx становятся массивом Finding-объектов без `why`/`fix`. Реестр RULES — единственное место, где редактируется текст.

## Что меняется

- **`src/plugin/rules.ts`** — новый файл, реестр ~14 правил (сейчас в MOCK_ISSUES App.tsx)
- **`src/app/App.tsx`** — MOCK_ISSUES становятся Finding[], компоненты IssuesStep/DetailStep получают объединённый объект через `getRuleFor(finding)`
- **`src/plugin/code.ts`** — при реальном сканировании создаёт Finding[] с ruleId, берёт title/why/fix из rules.ts

## Почему это ок для MVP, а не преждевременная абстракция

- Правил ~14 и они уже стабилизировались — реестр не раздует код
- Редактировать `why`/`fix` теперь в одном месте, а не искать по всему файлу
- Добавить новое правило = 1 запись в реестре, scan-функция отдельно
- Переводы / A/B тесты текста — без изменения логики сканера

## Verification

1. `node scripts/build-plugin.mjs` — билд без ошибок
2. В Make — демо-флоу: клик по проблеме → DetailStep показывает `why` и `fix` из реестра, не из Finding
3. Изменить текст одного правила в rules.ts → он обновляется во всех местах где это правило встречается
