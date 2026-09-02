import { useState, useEffect, useRef } from "react";
import {
  ChevronRight, ChevronLeft, ChevronDown,
  AlertTriangle, CheckCircle, Info,
  Layers, Type, LayoutGrid, Zap,
  RotateCcw, ZoomIn, Wand2, EyeOff,
  Copy, FileText, ExternalLink, Shield, Sliders,
  Loader2, Circle, XCircle,
} from "lucide-react";
import type { IssueGroup } from "../shared/types";
import type { IssueDto, PluginToUiMessage, ScanScope, UiToPluginMessage } from "../shared/messages";

// ─── Types ─────────────────────────────────────────────────────────────────

type WizardStep = "source" | "scan" | "issues" | "detail" | "fixmode" | "applying" | "final";
type FixMode = "editable" | "fidelity" | "balanced";

type Issue = IssueDto;

// ─── Mock data ─────────────────────────────────────────────────────────────

const MOCK_ISSUES: Issue[] = [
  { id: "v1", group: "visual", severity: "critical", title: "Маска может сломаться", slide: "Слайд 12 — Product overview", layer: "Hero image / Mask group", why: "PowerPoint может не сохранить маску корректно. Изображение появится без обрезки или вовсе пропадёт.", fix: "Растеризовать группу в PNG перед экспортом." },
  { id: "v2", group: "visual", severity: "critical", title: "Маска в декоративном фоне", slide: "Слайд 3 — Team", layer: "Background / Circle mask", why: "Сложная маска с несколькими слоями внутри. В PPTX маски такого типа нестабильны.", fix: "Flatten группу и сохранить как PNG." },
  { id: "v3", group: "visual", severity: "critical", title: "Градиент заменится сплошным цветом", slide: "Слайд 1 — Cover", layer: "Background gradient", why: "Figma официально предупреждает: gradient fills при PPTX-экспорте заменяются на solid color.", fix: "Заменить на ближайший сплошной цвет или растеризовать фон." },
  { id: "v4", group: "visual", severity: "warning", title: "Background blur не поддерживается", slide: "Слайд 4 — Stats", layer: "Glass card / Blur bg", why: "Background blur в PPTX превращается в прозрачность без размытия.", fix: "Растеризовать карточку как PNG." },
  { id: "v5", group: "visual", severity: "warning", title: "Drop shadow может пропасть", slide: "Слайд 7 — Pricing", layer: "Card / Drop shadow", why: "PPTX поддерживает тени, но параметры Figma (spread, multi-shadow) могут не перенестись.", fix: "Упростить тень или растеризовать карточку." },
  { id: "t1", group: "text", severity: "critical", title: "Отсутствует шрифт: Gilroy-Bold", slide: "Слайды 1, 3, 5, 9", layer: "Несколько текстовых слоёв", why: "Шрифт Gilroy-Bold недоступен в PowerPoint. Все тексты заменятся на Calibri.", fix: "Установить шрифт на целевой машине или заменить на Arial Bold." },
  { id: "t2", group: "text", severity: "warning", title: "Нестандартный шрифт: Neue Montreal", slide: "Слайды 2, 6, 8", layer: "Body text layers", why: "Шрифт не входит в стандартный набор PowerPoint. Получатель должен его установить.", fix: "Предупредить получателя или заменить на системный шрифт." },
  { id: "t3", group: "text", severity: "warning", title: "Смешанные стили в 3 слоях", slide: "Слайд 6 — Features", layer: "Feature description / Mixed", why: "Текст с несколькими стилями внутри одного слоя может некорректно отображаться.", fix: "Разбить на отдельные текстовые слои." },
  { id: "t4", group: "text", severity: "suggestion", title: "Текст близко к краю фрейма", slide: "Слайд 10 — Contacts", layer: "Footer text", why: "Текст ближе 8px к краю слайда. При экспорте может быть обрезан.", fix: "Отступить от края минимум на 16px." },
  { id: "s1", group: "structure", severity: "critical", title: "Вложенный фрейм", slide: "Слайд 5 — Timeline", layer: "Content / Frame inside frame", why: "Вложенные фреймы не поддерживаются в Figma Slides. Слайд может не скопироваться.", fix: "Разгруппировать вложенный фрейм." },
  { id: "s2", group: "structure", severity: "critical", title: "Слайд 3 не попадает в 16:9", slide: "Слайд 3 — Team", layer: "Frame: 1280×800", why: "Figma Slides принимает фреймы от 4:3 до 16:9. Этот слайд не будет скопирован.", fix: "Изменить размер до 1920×1080." },
  { id: "s3", group: "structure", severity: "warning", title: "Объекты за пределами фрейма", slide: "Слайды 2, 8", layer: "Decorative shapes", why: "Элементы за границей слайда попадут в экспорт и могут появиться на соседних слайдах.", fix: "Обрезать или удалить элементы за пределами фрейма." },
  { id: "i1", group: "interactive", severity: "warning", title: "Прототипная ссылка станет статикой", slide: "Слайд 9 — CTA", layer: "Button / Prototype connection", why: "Figma документирует: prototype interactions при PPTX-экспорте экспортируются как static image.", fix: "Удалить или сохранить как иллюстрацию кнопки." },
  { id: "i2", group: "interactive", severity: "warning", title: "Видео-заливка не поддерживается", slide: "Слайд 11 — Demo", layer: "Product demo / Video fill", why: "Видео-заливки экспортируются как статичный кадр в PPTX.", fix: "Заменить на статичный скриншот или добавить ссылку на видео." },
];

const GROUP_META: Record<IssueGroup, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  visual:      { label: "Визуальная точность", icon: Layers },
  text:        { label: "Текст и шрифты",       icon: Type },
  structure:   { label: "Структура слайдов",    icon: LayoutGrid },
  interactive: { label: "Интерактивность",      icon: Zap },
  export:      { label: "Экспорт",              icon: FileText },
};

const SEV_CONFIG = {
  critical:   { dot: "bg-red-500",     badge: "bg-red-500/15 text-red-400",     label: "Критично" },
  warning:    { dot: "bg-amber-400",   badge: "bg-amber-400/15 text-amber-400", label: "Предупреждение" },
  suggestion: { dot: "bg-blue-400",    badge: "bg-blue-400/15 text-blue-400",   label: "Рекомендация" },
};

function computeScore(issues: Issue[]): number {
  const crit = issues.filter(i => i.severity === "critical").length;
  const warn = issues.filter(i => i.severity === "warning").length;
  const sugg = issues.filter(i => i.severity === "suggestion").length;
  return Math.max(10, Math.min(100, 100 - crit * 8 - warn * 2 - sugg));
}

const STEP_ORDER: WizardStep[] = ["source", "scan", "issues", "fixmode", "applying", "final"];
const STEP_TITLES: Partial<Record<WizardStep, string>> = {
  source:   "Источник",
  scan:     "Сканирование",
  issues:   "Проблемы",
  detail:   "Детали",
  fixmode:  "Режим исправления",
  applying: "Применение",
  final:    "Готово",
};

// ─── Shared primitives ─────────────────────────────────────────────────────

function ScoreRing({ score, size = 72 }: { score: number; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  const color = score >= 80 ? "#34d399" : score >= 55 ? "#fbbf24" : "#f87171";
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={6} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ - fill}
        style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.4s" }} />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="middle"
        fill={color} fontSize={size * 0.24} fontWeight="700" fontFamily="'JetBrains Mono', monospace"
        style={{ transform: `rotate(90deg)`, transformOrigin: `${size/2}px ${size/2}px` }}>
        {score}
      </text>
    </svg>
  );
}

function PrimaryBtn({ onClick, children, disabled }: { onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="w-full bg-lime-400 hover:bg-lime-300 active:bg-lime-500 disabled:opacity-40 text-black text-[12.5px] font-semibold py-2.5 rounded-xl transition-colors">
      {children}
    </button>
  );
}

function GhostBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className="w-full border border-white/[0.1] hover:border-white/20 hover:bg-white/[0.04] text-white/45 hover:text-white/65 text-[12px] font-medium py-2.5 rounded-xl transition-colors">
      {children}
    </button>
  );
}

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={`rounded-full transition-all duration-300 ${
          i < current ? "w-1.5 h-1.5 bg-lime-400" :
          i === current ? "w-3 h-1.5 bg-lime-400" : "w-1.5 h-1.5 bg-white/15"
        }`} />
      ))}
    </div>
  );
}

// ─── Step: Source ─────────────────────────────────────────────────────────

function SourceStep({ onNext }: { onNext: (scope: ScanScope) => void }) {
  const [selected, setSelected] = useState<ScanScope>("page");
  const options = [
    { id: "page",     label: "Все фреймы на странице",  desc: "Сканирует все top-level фреймы" },
    { id: "selected", label: "Только выбранные фреймы", desc: "Сначала выдели нужные фреймы в Figma" },
  ];
  return (
    <div className="flex flex-col gap-4 px-4 py-5">
      <p className="text-[11.5px] text-white/35 leading-relaxed">
        Что проверяем на совместимость с PowerPoint?
      </p>
      <div className="space-y-2">
        {options.map(opt => (
          <button key={opt.id} onClick={() => setSelected(opt.id as ScanScope)}
            className={`w-full text-left px-3.5 py-3.5 rounded-xl border transition-all ${
              selected === opt.id ? "border-lime-500/50 bg-lime-500/8" : "border-white/[0.07] bg-white/[0.02] hover:border-white/15"
            }`}>
            <div className="flex items-center gap-3">
              <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                selected === opt.id ? "border-lime-400" : "border-white/20"
              }`}>
                {selected === opt.id && <div className="w-1.5 h-1.5 rounded-full bg-lime-400" />}
              </div>
              <div>
                <p className={`text-[12.5px] font-medium leading-tight ${selected === opt.id ? "text-white/90" : "text-white/55"}`}>{opt.label}</p>
                <p className={`text-[10.5px] mt-0.5 ${selected === opt.id ? "text-white/35" : "text-white/20"}`}>{opt.desc}</p>
              </div>
            </div>
          </button>
        ))}
      </div>
      <PrimaryBtn onClick={() => onNext(selected)}>Начать сканирование →</PrimaryBtn>
    </div>
  );
}

// ─── Step: Scan ───────────────────────────────────────────────────────────

const SCAN_CHECKS = [
  { id: "frame",       label: "Структура фреймов" },
  { id: "font",        label: "Шрифты" },
  { id: "mask",        label: "Маски и клиппинг" },
  { id: "gradient",    label: "Градиенты и эффекты" },
  { id: "text",        label: "Текст и отступы" },
  { id: "interactive", label: "Интерактивность" },
];

function ScanStep({ scope, onDone, onBack }: {
  scope: ScanScope;
  onDone: (issues: Issue[], slideCount: number) => void;
  onBack: () => void;
}) {
  const [currentCheck, setCurrentCheck] = useState(0);
  const [allDone, setAllDone] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    let idx = 0;
    const tick = setInterval(() => {
      idx++;
      setCurrentCheck(Math.min(idx, SCAN_CHECKS.length - 1));
      if (idx >= SCAN_CHECKS.length) {
        clearInterval(tick);
        setAllDone(true);
      }
    }, 380);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data?.pluginMessage as PluginToUiMessage | undefined;
      if (!message || completedRef.current) return;

      if (message.type === "SCAN_RESULT") {
        completedRef.current = true;
        onDone(message.issues, message.slideCount);
      }

      if (message.type === "SCAN_ERROR") {
        completedRef.current = true;
        setScanError(message.message);
      }
    };

    window.addEventListener("message", handleMessage);

    if (isStandaloneBrowser()) {
      const timeout = window.setTimeout(() => {
        if (completedRef.current) return;

        completedRef.current = true;
        onDone(MOCK_ISSUES, 12);
      }, 1200);

      return () => {
        window.clearTimeout(timeout);
        window.removeEventListener("message", handleMessage);
      };
    }

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [onDone, scope]);

  useEffect(() => {
    if (!isStandaloneBrowser()) {
      postToPlugin({ type: "SCAN_REQUEST", scope });
    }
  }, [scope]);

  return (
    <div className="flex flex-col gap-5 px-4 py-5">
      <div className="flex items-center gap-2.5">
        <div className="relative w-5 h-5 flex-shrink-0">
          <div className="w-5 h-5 rounded-full border-2 border-lime-500/20" />
          {!allDone && <div className="absolute inset-0 rounded-full border-2 border-lime-500 border-t-transparent animate-spin" style={{ animationDuration: "0.75s" }} />}
          {allDone && <CheckCircle className="absolute inset-0 w-5 h-5 text-lime-400" />}
        </div>
        <span className="text-[12px] text-white/50">
          {allDone ? "Сканирование завершено" : SCAN_CHECKS[currentCheck]?.label ?? "Завершаю…"}
        </span>
      </div>

      <div className="space-y-1.5">
        {SCAN_CHECKS.map((check, i) => {
          const isDone   = allDone || i < currentCheck;
          const isActive = !allDone && i === currentCheck;
          return (
            <div key={check.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${isActive ? "bg-white/[0.05]" : ""}`}>
              <div className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
                {isDone   && <CheckCircle className="w-4 h-4 text-lime-400" />}
                {isActive && <Loader2 className="w-4 h-4 text-lime-400 animate-spin" />}
                {!isDone && !isActive && <Circle className="w-4 h-4 text-white/15" />}
              </div>
              <span className={`text-[12px] leading-none ${isDone ? "text-white/50" : isActive ? "text-white/80 font-medium" : "text-white/20"}`}>
                {check.label}
              </span>
              {isDone   && <span className="ml-auto text-[10px] text-white/20 font-mono">Готово</span>}
              {isActive && <span className="ml-auto text-[10px] text-lime-400/60 font-mono">Проверяю…</span>}
            </div>
          );
        })}
      </div>
      {scanError && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2">
          <p className="text-[11px] text-red-300 leading-relaxed">{scanError}</p>
          <button onClick={onBack} className="mt-2 text-[11px] text-white/45 hover:text-white/70">
            Вернуться к выбору источника
          </button>
        </div>
      )}
    </div>
  );
}


// ─── Step: Issues ─────────────────────────────────────────────────────────

function IssuesStep({ issues, slideCount, ignoredCount, onDetail, onRestart, onResetIgnored }: {
  issues: Issue[]; slideCount: number;
  ignoredCount: number;
  onDetail: (issue: Issue) => void; onRestart: () => void; onResetIgnored: () => void;
}) {
  const slides = groupIssuesBySlide(issues);
  const [activeSlide, setActiveSlide] = useState(slides[0]?.name ?? "");
  const [open, setOpen] = useState<IssueGroup | null>(getFirstIssueGroup(slides[0]?.issues ?? []));
  const groups: IssueGroup[] = ["visual", "text", "structure", "interactive", "export"];
  const score = computeScore(issues);
  const activeSlideData = slides.find(slide => slide.name === activeSlide) ?? slides[0];

  useEffect(() => {
    if (!activeSlideData && activeSlide) {
      setActiveSlide("");
    }

    if (activeSlideData && activeSlide !== activeSlideData.name) {
      setActiveSlide(activeSlideData.name);
    }
  }, [activeSlide, activeSlideData]);

  return (
    <div className="flex flex-col">
      <div className="px-4 py-3 border-b border-white/[0.05] flex items-center gap-3">
        <ScoreRing score={score} size={40} />
        <div className="flex-1">
          <p className="text-[11.5px] text-white/60 font-medium leading-none">Готовность к PPTX</p>
          <p className="text-[10px] text-white/20 mt-0.5 font-mono">
            {slideCount} слайдов · {issues.length} проблем{ignoredCount > 0 ? ` · скрыто: ${ignoredCount}` : ""}
          </p>
        </div>
      </div>

      {issues.length > 0 && (
        <div className="px-4 py-2 border-b border-white/[0.05] overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          <div className="flex gap-1.5 min-w-max">
            {slides.map((slide, index) => {
              const isActive = slide.name === activeSlideData?.name;
              const criticalCount = slide.issues.filter(issue => issue.severity === "critical").length;
              return (
                <button key={slide.name} onClick={() => { setActiveSlide(slide.name); setOpen(getFirstIssueGroup(slide.issues)); }}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-left transition-colors ${
                    isActive ? "border-lime-400/45 bg-lime-400/10" : "border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04]"
                  }`}>
                  <span className={`text-[10px] font-mono ${isActive ? "text-lime-300" : "text-white/25"}`}>
                    {index + 1}
                  </span>
                  <span className={`max-w-[90px] truncate text-[10.5px] ${isActive ? "text-white/80" : "text-white/40"}`}>
                    {slide.shortName}
                  </span>
                  <span className={`text-[9.5px] font-mono px-1.5 py-0.5 rounded ${
                    criticalCount > 0 ? "bg-red-500/15 text-red-400" : "bg-amber-400/15 text-amber-400"
                  }`}>
                    {slide.issues.length}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="overflow-y-auto" style={{ maxHeight: 340, scrollbarWidth: "none" }}>
        {issues.length === 0 && (
          <div className="px-4 py-10 flex flex-col items-center text-center gap-2">
            <CheckCircle className="w-8 h-8 text-emerald-400" />
            <p className="text-[13px] text-white/75 font-semibold">Проблем не найдено</p>
            <p className="text-[11px] text-white/30 leading-relaxed">
              Сканер не нашёл известных рисков PPTX-экспорта в выбранном наборе фреймов.
            </p>
          </div>
        )}
        {issues.length > 0 && activeSlideData && (
          <div className="px-4 py-3 border-b border-white/[0.05] bg-black/10">
            <p className="text-[12.5px] text-white/80 font-semibold truncate">{activeSlideData.name}</p>
            <p className="text-[10px] text-white/25 mt-0.5 font-mono">
              {activeSlideData.issues.length} проблем · {getGroupSummary(activeSlideData.issues)}
            </p>
          </div>
        )}
        {issues.length > 0 && activeSlideData && groups.map(g => {
          const meta  = GROUP_META[g];
          const Icon  = meta.icon;
          const items = activeSlideData.issues.filter(i => i.group === g);
          const crit  = items.filter(i => i.severity === "critical").length;
          const warn  = items.filter(i => i.severity === "warning").length;
          const isOpen = open === g;
          if (items.length === 0) return null;
          return (
            <div key={g} className="border-b border-white/[0.05] last:border-b-0">
              <button onClick={() => setOpen(isOpen ? null : g)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors text-left">
                <Icon className="w-3.5 h-3.5 text-white/30 flex-shrink-0" />
                <span className="flex-1 text-[12.5px] text-white/70 font-medium">{meta.label}</span>
                <div className="flex items-center gap-1">
                  {crit > 0 && <span className="text-[9.5px] font-mono px-1.5 py-0.5 rounded bg-red-500/15 text-red-400">{crit}</span>}
                  {warn > 0 && <span className="text-[9.5px] font-mono px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-400">{warn}</span>}
                  {crit === 0 && warn === 0 && <span className="text-[9.5px] font-mono px-1.5 py-0.5 rounded bg-blue-400/15 text-blue-400">{items.length}</span>}
                </div>
                {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-white/20 flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-white/20 flex-shrink-0" />}
              </button>
              {isOpen && (
                <div className="bg-black/20">
                  {items.map(issue => {
                    const sc = SEV_CONFIG[issue.severity];
                    return (
                      <button key={issue.id} onClick={() => onDetail(issue)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.04] transition-colors text-left group">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sc.dot}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11.5px] text-white/55 leading-tight truncate">{issue.title}</p>
                          <p className="text-[10px] text-white/20 mt-0.5 truncate font-mono">{issue.layer}</p>
                        </div>
                        <ChevronRight className="w-3 h-3 text-white/15 flex-shrink-0 group-hover:text-white/35 transition-colors" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="px-4 py-3 border-t border-white/[0.05] space-y-2">
        {issues.length > 0 && (
          <button disabled
            className="w-full bg-white/[0.03] border border-white/[0.06] text-white/25 text-[12px] font-medium py-2.5 rounded-xl">
            Автоисправления будут во второй итерации
          </button>
        )}
        {ignoredCount > 0 && (
          <button onClick={onResetIgnored}
            className="w-full border border-white/[0.08] hover:border-white/15 hover:bg-white/[0.04] text-white/35 hover:text-white/60 text-[11px] font-medium py-2.5 rounded-xl transition-all">
            Вернуть скрытые проблемы
          </button>
        )}
        <GhostBtn onClick={onRestart}>Новая проверка</GhostBtn>
      </div>
    </div>
  );
}

function groupIssuesBySlide(issues: Issue[]) {
  const map = new Map<string, Issue[]>();

  for (const issue of issues) {
    const key = issue.slide || "Без слайда";
    map.set(key, [...(map.get(key) ?? []), issue]);
  }

  return Array.from(map.entries()).map(([name, slideIssues]) => ({
    name,
    shortName: shortenSlideName(name),
    issues: slideIssues,
  }));
}

function shortenSlideName(name: string): string {
  return name.replace(/^Слайд\s*/i, "").replace(/^Slide\s*/i, "").trim() || name;
}

function getFirstIssueGroup(issues: Issue[]): IssueGroup | null {
  return issues[0]?.group ?? null;
}

function getGroupSummary(issues: Issue[]): string {
  const counts = issues.reduce<Record<IssueGroup, number>>((acc, issue) => {
    acc[issue.group] += 1;
    return acc;
  }, { visual: 0, text: 0, structure: 0, interactive: 0, export: 0 });

  return (Object.entries(counts) as Array<[IssueGroup, number]>)
    .filter(([, count]) => count > 0)
    .map(([group, count]) => `${GROUP_META[group].label}: ${count}`)
    .join(" · ");
}

// ─── Step: Detail ─────────────────────────────────────────────────────────

function DetailStep({ issue, onBack, onSelect, onIgnore }: {
  issue: Issue; onBack: () => void; onSelect: (nodeId: string) => void; onIgnore: (issueId: string) => void;
}) {
  const sc = SEV_CONFIG[issue.severity];
  return (
    <div className="flex flex-col">
      <div className="px-4 py-4 border-b border-white/[0.05]">
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-[9.5px] font-mono px-1.5 py-0.5 rounded ${sc.badge}`}>{sc.label}</span>
          <span className="text-[9.5px] text-white/20 font-mono">{GROUP_META[issue.group].label}</span>
        </div>
        <p className="text-[13px] text-white/85 font-semibold leading-snug">{issue.title}</p>
      </div>
      <div className="px-4 py-3 border-b border-white/[0.05] space-y-1.5">
        <p className="text-[9.5px] text-white/25 font-mono uppercase tracking-widest">Где найдено</p>
        <div className="flex items-start gap-2">
          <LayoutGrid className="w-3 h-3 text-white/25 flex-shrink-0 mt-0.5" />
          <p className="text-[11.5px] text-white/55">{issue.slide}</p>
        </div>
        <div className="flex items-start gap-2">
          <Layers className="w-3 h-3 text-white/25 flex-shrink-0 mt-0.5" />
          <p className="text-[11.5px] text-white/35 font-mono">{issue.layer}</p>
        </div>
      </div>
      <div className="px-4 py-3 border-b border-white/[0.05]">
        <p className="text-[9.5px] text-white/25 font-mono uppercase tracking-widest mb-1.5">Почему важно</p>
        <p className="text-[11.5px] text-white/50 leading-relaxed">{issue.why}</p>
      </div>
      <div className="px-4 py-3 border-b border-white/[0.05]">
        <p className="text-[9.5px] text-white/25 font-mono uppercase tracking-widest mb-1.5">Рекомендуемое исправление</p>
        <p className="text-[11.5px] text-white/50 leading-relaxed">{issue.fix}</p>
      </div>
      <div className="px-4 py-3.5 space-y-2">
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { icon: ZoomIn, label: "К слою",       action: () => { if (issue.nodeId) onSelect(issue.nodeId); } },
            { icon: EyeOff, label: "Скрыть", action: () => onIgnore(issue.id) },
          ].map(({ icon: Icon, label, action }) => (
            <button key={label} onClick={action}
              className="flex flex-col items-center gap-1.5 py-2.5 rounded-xl border border-white/[0.07] hover:border-white/15 hover:bg-white/[0.04] text-white/35 hover:text-white/60 transition-all">
              <Icon className="w-3.5 h-3.5" />
              <span className="text-[10px] font-medium">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Step: Fix Mode ───────────────────────────────────────────────────────

function FixModeStep({ onNext }: { onNext: () => void }) {
  const [selected, setSelected] = useState<FixMode>("balanced");
  const modes: { id: FixMode; icon: React.ComponentType<{ className?: string }>; label: string; note: string; items: string[] }[] = [
    { id: "balanced",  icon: Sliders, label: "Сбалансированный", note: "★ Рекомендуется", items: ["Текст остаётся редактируемым", "Фоны и декор растеризуются", "Маски и blur → PNG"] },
    { id: "editable",  icon: Type,    label: "Максимальная правка", note: "Для редактирования в PPT", items: ["Всё остаётся слоями", "Градиент → ближайший цвет", "Шрифты → системные"] },
    { id: "fidelity",  icon: Shield,  label: "Точное воспроизведение", note: "Один в один визуально", items: ["Сложные элементы → PNG", "Меньше редактируемости"] },
  ];
  return (
    <div className="flex flex-col gap-4 px-4 py-5">
      <p className="text-[11.5px] text-white/35 leading-relaxed">
        Плагин создаст безопасную копию. Оригинал не изменится.
      </p>
      <div className="space-y-2">
        {modes.map(mode => {
          const Icon = mode.icon;
          const isSel = selected === mode.id;
          return (
            <button key={mode.id} onClick={() => setSelected(mode.id)}
              className={`w-full text-left px-3.5 py-3 rounded-xl border transition-all ${
                isSel ? "border-lime-500/50 bg-lime-500/8" : "border-white/[0.07] bg-white/[0.02] hover:border-white/15"
              }`}>
              <div className="flex items-start gap-3">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${isSel ? "bg-lime-500/15" : "bg-white/[0.05]"}`}>
                  <Icon className={`w-3.5 h-3.5 ${isSel ? "text-lime-400" : "text-white/30"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className={`text-[12px] font-semibold ${isSel ? "text-white/90" : "text-white/55"}`}>{mode.label}</p>
                    {mode.id === "balanced" && <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-lime-500/15 text-lime-400/80">★ Рек.</span>}
                  </div>
                  <p className={`text-[10px] mb-1.5 ${isSel ? "text-lime-400/50" : "text-white/20"}`}>{mode.note}</p>
                  {mode.items.map(item => (
                    <div key={item} className="flex items-center gap-1.5">
                      <span className={`w-0.5 h-0.5 rounded-full flex-shrink-0 ${isSel ? "bg-white/40" : "bg-white/15"}`} />
                      <span className={`text-[10px] ${isSel ? "text-white/40" : "text-white/20"}`}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <PrimaryBtn onClick={onNext}>
        <span className="flex items-center justify-center gap-2"><Copy className="w-3.5 h-3.5" />Создать безопасную копию</span>
      </PrimaryBtn>
    </div>
  );
}

// ─── Step: Applying ───────────────────────────────────────────────────────

const APPLY_STEPS = [
  "Дублирую страницу…",
  "Растеризую маски…",
  "Обрабатываю градиенты…",
  "Конвертирую вложенные фреймы…",
  "Убираю элементы за краями…",
  "Повторное сканирование…",
  "Вычисляю новый рейтинг…",
  "Готово",
];

function ApplyingStep({ onDone }: {
  onDone: (fixedCount: number, copyName: string) => void;
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const calledRef = useRef(false);

  useEffect(() => {
    let idx = 0;
    const tick = setInterval(() => {
      idx++;
      setCurrentStep(Math.min(idx, APPLY_STEPS.length - 1));
      if (idx >= APPLY_STEPS.length) {
        clearInterval(tick);
        setTimeout(() => {
          if (!calledRef.current) { calledRef.current = true; onDone(14, ""); }
        }, 400);
      }
    }, 350);
    return () => clearInterval(tick);
  }, [onDone]);

  return (
    <div className="flex flex-col gap-5 px-4 py-5">
      <div className="flex items-center gap-2.5">
        <div className="relative w-5 h-5 flex-shrink-0">
          <div className="w-5 h-5 rounded-full border-2 border-emerald-400/20" />
          <div className="absolute inset-0 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" style={{ animationDuration: "0.9s" }} />
        </div>
        <span className="text-[12px] text-white/50">{APPLY_STEPS[currentStep]}</span>
      </div>
      <div className="space-y-1.5">
        {APPLY_STEPS.map((step, i) => {
          const isDone   = i < currentStep;
          const isActive = i === currentStep;
          return (
            <div key={step} className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${isActive ? "bg-white/[0.05]" : ""}`}>
              <div className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
                {isDone   && <CheckCircle className="w-4 h-4 text-emerald-400" />}
                {isActive && <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />}
                {!isDone && !isActive && <Circle className="w-4 h-4 text-white/15" />}
              </div>
              <span className={`text-[12px] ${isDone ? "text-white/40" : isActive ? "text-white/80 font-medium" : "text-white/20"}`}>{step}</span>
              {isDone && <span className="ml-auto text-[10px] text-white/20 font-mono">Done</span>}
            </div>
          );
        })}
      </div>
      <p className="text-[10.5px] text-white/20 text-center">Оригинал не изменяется</p>
    </div>
  );
}

// ─── Step: Final ──────────────────────────────────────────────────────────

function FinalStep({ onRestart, scoreBefore, fixedCount, copyPageName, remainingIssues }: {
  onRestart: () => void;
  scoreBefore: number; fixedCount: number;
  copyPageName: string; remainingIssues: Issue[];
}) {
  const scoreAfter = Math.min(100, scoreBefore + Math.max(fixedCount * 2, 26));
  const [animAfter, setAnimAfter] = useState(scoreBefore);
  const colorBefore = scoreBefore >= 80 ? "#34d399" : scoreBefore >= 55 ? "#fbbf24" : "#f87171";
  const colorAfter  = scoreAfter  >= 80 ? "#34d399" : scoreAfter  >= 55 ? "#fbbf24" : "#f87171";

  useEffect(() => {
    let v = scoreBefore;
    const run = () => { v = Math.min(v + 1, scoreAfter); setAnimAfter(v); if (v < scoreAfter) requestAnimationFrame(run); };
    const t = setTimeout(() => requestAnimationFrame(run), 600);
    return () => clearTimeout(t);
  }, [scoreBefore, scoreAfter]);

  const fixedList = fixedCount > 0
    ? [`${fixedCount} элементов исправлено`]
    : ["7 масок растеризованы в PNG", "4 градиента заменены", "2 вложенных фрейма конвертированы", "Объекты за краями удалены"];

  const remaining = remainingIssues.length > 0
    ? remainingIssues.map(i => i.title)
    : ["Нестандартные шрифты — нужна установка на целевой машине"];

  return (
    <div className="flex flex-col">
      {/* Score block */}
      <div className="px-4 py-4 border-b border-white/[0.05]">
        <p className="text-[10px] text-white/25 font-mono uppercase tracking-widest mb-3">Результат аудита</p>
        <div className="flex items-center gap-3">
          {/* Before */}
          <div className="flex-1 flex flex-col items-center gap-2 bg-white/[0.02] border border-white/[0.06] rounded-2xl py-3">
            <p className="text-[9.5px] text-white/20 font-mono uppercase tracking-widest">До</p>
            <ScoreRing score={scoreBefore} size={64} />
            <p className="text-[10px] font-mono" style={{ color: colorBefore }}>{scoreBefore}/100</p>
          </div>

          {/* Arrow + delta */}
          <div className="flex flex-col items-center gap-1 flex-shrink-0">
            <ChevronRight className="w-5 h-5 text-white/20" />
            <span className="text-[10px] text-emerald-400/70 font-mono font-bold">+{scoreAfter - scoreBefore}</span>
          </div>

          {/* After */}
          <div className="flex-1 flex flex-col items-center gap-2 bg-emerald-400/[0.05] border border-emerald-400/20 rounded-2xl py-3">
            <p className="text-[9.5px] text-emerald-400/40 font-mono uppercase tracking-widest">После</p>
            <ScoreRing score={animAfter} size={64} />
            <p className="text-[10px] font-mono" style={{ color: colorAfter }}>{animAfter}/100</p>
          </div>
        </div>
      </div>

      {/* Fixed */}
      <div className="px-4 py-3 border-b border-white/[0.05]">
        <p className="text-[9.5px] text-white/25 font-mono uppercase tracking-widest mb-2">Исправлено</p>
        <div className="space-y-1.5">
          {fixedList.map((item, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <CheckCircle className="w-3 h-3 text-emerald-400 flex-shrink-0" />
              <span className="text-[11px] text-white/45">{item}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Remaining */}
      <div className="px-4 py-3 border-b border-white/[0.05]">
        <p className="text-[9.5px] text-white/25 font-mono uppercase tracking-widest mb-2">Осталось вручную</p>
        <div className="space-y-1.5">
          {remaining.map((item, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <Info className="w-3 h-3 text-amber-400 flex-shrink-0 mt-0.5" />
              <span className="text-[11px] text-white/40 leading-relaxed">{item}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 py-3 space-y-2">
        {copyPageName && (
          <div className="flex items-center gap-2 px-3 py-2 bg-emerald-400/[0.07] border border-emerald-400/20 rounded-lg">
            <CheckCircle className="w-3 h-3 text-emerald-400 flex-shrink-0" />
            <span className="text-[10.5px] text-emerald-400/70 truncate">Копия: {copyPageName}</span>
          </div>
        )}
        <button className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-white/[0.08] hover:border-white/15 hover:bg-white/[0.04] text-white/35 hover:text-white/60 text-[11px] font-medium transition-all">
          <ExternalLink className="w-3 h-3" />Открыть исправленную копию
        </button>
        <GhostBtn onClick={onRestart}>
          <span className="flex items-center justify-center gap-1.5">
            <RotateCcw className="w-3 h-3" />Новая проверка
          </span>
        </GhostBtn>
      </div>
    </div>
  );
}

// ─── App shell ─────────────────────────────────────────────────────────────

export default function App() {
  const [step, setStep]             = useState<WizardStep>("source");
  const [detail, setDetail]         = useState<Issue | null>(null);
  const [fixedCount, setFixedCount] = useState(0);
  const [copyPageName, setCopyPageName] = useState("");
  const [issues, setIssues] = useState<Issue[]>(MOCK_ISSUES);
  const [ignoredIssueIds, setIgnoredIssueIds] = useState<Set<string>>(new Set());
  const [slideCount, setSlideCount] = useState(12);
  const [scanScope, setScanScope] = useState<ScanScope>("page");
  const [notice, setNotice] = useState<string | null>(null);

  const visibleIssues = issues.filter(issue => !ignoredIssueIds.has(issue.id));
  const scoreBefore = computeScore(visibleIssues);
  const stepIdx     = STEP_ORDER.indexOf(step === "detail" ? "issues" : step);
  const canGoBack = ["detail", "fixmode", "scan", "issues"].includes(step);

  function goBack() {
    if (step === "detail")  setStep("issues");
    if (step === "fixmode") setStep("issues");
    if (step === "scan")    setStep("source");
    if (step === "issues")  setStep("source");
  }

  const remainingIssues = visibleIssues.filter(i => i.severity === "critical" && i.group === "text");

  function startScan(scope: ScanScope) {
    setScanScope(scope);
    setStep("scan");
  }

  function finishScan(nextIssues: Issue[], nextSlideCount: number) {
    setIssues(nextIssues);
    setIgnoredIssueIds(new Set());
    setSlideCount(nextSlideCount);
    setStep("issues");
  }

  function selectNode(nodeId: string) {
    setNotice(null);
    postToPlugin({ type: "SELECT_NODE_REQUEST", nodeId });
  }

  function ignoreIssue(issueId: string) {
    setIgnoredIssueIds(prev => {
      const next = new Set(prev);
      next.add(issueId);
      return next;
    });
    setDetail(null);
    setStep("issues");
  }

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data?.pluginMessage as PluginToUiMessage | undefined;
      if (!message) return;

      if (message.type === "SELECT_NODE_ERROR") {
        setNotice(message.message);
      }

      if (message.type === "SELECT_NODE_RESULT") {
        setNotice("Слой выбран в Figma");
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return (
    <div className="w-full h-screen flex flex-col bg-[#111111] overflow-hidden"
      style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* Global scrollbar hide */}
      <style>{`* { scrollbar-width: none; } *::-webkit-scrollbar { display: none; }`}</style>

      {/* Header — no branding, just nav */}
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2.5 flex-shrink-0">
        {canGoBack ? (
          <button onClick={goBack}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/[0.07] text-white/30 hover:text-white/60 transition-colors flex-shrink-0">
            <ChevronLeft className="w-4 h-4" />
          </button>
        ) : (
          <div className="w-7 h-7" />
        )}

        <div className="flex-1 min-w-0">
          <span className="text-[12.5px] font-semibold text-white/80 truncate">
            {STEP_TITLES[step]}
          </span>
        </div>

        <StepDots current={stepIdx} total={STEP_ORDER.length} />
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {notice && (
          <div className="mx-4 mt-3 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2">
            <p className="text-[11px] text-white/45 leading-relaxed">{notice}</p>
          </div>
        )}
        {step === "source" && (
          <SourceStep onNext={startScan} />
        )}
        {step === "scan" && (
          <ScanStep scope={scanScope} onDone={finishScan} onBack={() => setStep("source")} key="scan" />
        )}
        {step === "issues" && (
          <IssuesStep issues={visibleIssues} slideCount={slideCount} ignoredCount={ignoredIssueIds.size}
            onDetail={(iss) => { setDetail(iss); setStep("detail"); }}
            onRestart={() => setStep("source")}
            onResetIgnored={() => setIgnoredIssueIds(new Set())} />
        )}
        {step === "detail" && detail && (
          <DetailStep issue={detail} onBack={() => setStep("issues")} onSelect={selectNode} onIgnore={ignoreIssue} />
        )}
        {step === "fixmode" && (
          <FixModeStep onNext={() => setStep("applying")} />
        )}
        {step === "applying" && (
          <ApplyingStep onDone={(cnt, name) => { setFixedCount(cnt); setCopyPageName(name); setStep("final"); }} />
        )}
        {step === "final" && (
          <FinalStep
            onRestart={() => { setStep("source"); setFixedCount(0); setCopyPageName(""); }}
            scoreBefore={scoreBefore} fixedCount={fixedCount}
            copyPageName={copyPageName} remainingIssues={remainingIssues}
          />
        )}
      </div>
    </div>
  );
}

function postToPlugin(message: UiToPluginMessage): void {
  window.parent?.postMessage({ pluginMessage: message }, "*");
}

function isStandaloneBrowser(): boolean {
  return window.parent === window;
}
