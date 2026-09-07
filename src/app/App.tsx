import { useState, useEffect, useRef } from "react";
import {
  ChevronRight, ChevronLeft, ChevronDown,
  AlertTriangle, CheckCircle, Info,
  Layers, Type, LayoutGrid, Zap,
  RotateCcw, ZoomIn, Wand2,
  FileText, ExternalLink,
  Loader2, Circle, XCircle,
} from "lucide-react";
import type { IssueGroup } from "../shared/types";
import type { EnabledRuleGroups, FixRunResultDto, FixTargetDto, IssueDto, PluginToUiMessage, ScanScope, ScanSettings, UiToPluginMessage } from "../shared/messages";

// ─── Types ─────────────────────────────────────────────────────────────────

type WizardStep = "source" | "scan" | "issues" | "detail" | "fixmode" | "applying" | "final";
type Issue = IssueDto;

function isFixableIssue(issue: Issue): issue is Issue & { ruleId: string; nodeId: string } {
  return issue.fixAvailable === true && Boolean(issue.ruleId) && Boolean(issue.nodeId);
}

// ─── Mock data ─────────────────────────────────────────────────────────────

const MOCK_ISSUES: Issue[] = [
  { id: "v1", ruleId: "visual.mask", fixAvailable: false, group: "visual", severity: "critical", title: "Маска может сломаться", slide: "Слайд 12 — Product overview", layer: "Hero image / Mask group", why: "PowerPoint может не сохранить маску корректно. Изображение появится без обрезки или вовсе пропадёт.", fix: "Растеризовать группу в PNG перед экспортом." },
  { id: "v2", ruleId: "visual.mask", fixAvailable: false, group: "visual", severity: "critical", title: "Маска в декоративном фоне", slide: "Слайд 3 — Team", layer: "Background / Circle mask", why: "Сложная маска с несколькими слоями внутри. В PPTX маски такого типа нестабильны.", fix: "Flatten группу и сохранить как PNG." },
  { id: "v3", ruleId: "visual.gradient-fill", fixAvailable: false, group: "visual", severity: "critical", title: "Градиент заменится сплошным цветом", slide: "Слайд 1 — Cover", layer: "Background gradient", why: "Figma официально предупреждает: gradient fills при PPTX-экспорте заменяются на solid color.", fix: "Заменить на ближайший сплошной цвет или растеризовать фон." },
  { id: "v4", ruleId: "visual.background-blur", fixAvailable: false, group: "visual", severity: "warning", title: "Background blur не поддерживается", slide: "Слайд 4 — Stats", layer: "Glass card / Blur bg", why: "Background blur в PPTX превращается в прозрачность без размытия.", fix: "Растеризовать карточку как PNG." },
  { id: "v5", ruleId: "visual.multiple-shadows", fixAvailable: false, group: "visual", severity: "warning", title: "Drop shadow может пропасть", slide: "Слайд 7 — Pricing", layer: "Card / Drop shadow", why: "PPTX поддерживает тени, но параметры Figma (spread, multi-shadow) могут не перенестись.", fix: "Упростить тень или растеризовать карточку." },
  { id: "t1", ruleId: "text.non-system-font", fixAvailable: false, group: "text", severity: "critical", title: "Отсутствует шрифт: Gilroy-Bold", slide: "Слайды 1, 3, 5, 9", layer: "Несколько текстовых слоёв", why: "Шрифт Gilroy-Bold недоступен в PowerPoint. Все тексты заменятся на Calibri.", fix: "Установить шрифт на целевой машине или заменить на Arial Bold." },
  { id: "t2", ruleId: "text.non-system-font", fixAvailable: false, group: "text", severity: "warning", title: "Нестандартный шрифт: Neue Montreal", slide: "Слайды 2, 6, 8", layer: "Body text layers", why: "Шрифт не входит в стандартный набор PowerPoint. Получатель должен его установить.", fix: "Предупредить получателя или заменить на системный шрифт." },
  { id: "t3", ruleId: "text.mixed-styles", fixAvailable: false, group: "text", severity: "warning", title: "Смешанные стили в 3 слоях", slide: "Слайд 6 — Features", layer: "Feature description / Mixed", why: "Текст с несколькими стилями внутри одного слоя может некорректно отображаться.", fix: "Разбить на отдельные текстовые слои." },
  { id: "t4", ruleId: "text.near-slide-edge", fixAvailable: true, fixLabel: "Сдвинуть текст внутрь безопасной зоны", nodeId: "mock-text-edge", group: "text", severity: "suggestion", title: "Текст близко к краю фрейма", slide: "Слайд 10 — Contacts", layer: "Footer text", why: "Текст ближе 8px к краю слайда. При экспорте может быть обрезан.", fix: "Отступить от края минимум на 16px." },
  { id: "s1", ruleId: "structure.nested-frame", fixAvailable: false, group: "structure", severity: "critical", title: "Вложенный фрейм", slide: "Слайд 5 — Timeline", layer: "Content / Frame inside frame", why: "Вложенные фреймы не поддерживаются в Figma Slides. Слайд может не скопироваться.", fix: "Разгруппировать вложенный фрейм." },
  { id: "s2", ruleId: "structure.non-16-9-slide", fixAvailable: true, fixLabel: "Привести слайд к 16:9", nodeId: "mock-slide-ratio", group: "structure", severity: "critical", title: "Слайд 3 не попадает в 16:9", slide: "Слайд 3 — Team", layer: "Frame: 1280×800", why: "Figma Slides принимает фреймы от 4:3 до 16:9. Этот слайд не будет скопирован.", fix: "Изменить размер до 1920×1080." },
  { id: "s3", ruleId: "structure.object-outside-slide-bounds", fixAvailable: true, fixLabel: "Вернуть объект в границы слайда", nodeId: "mock-overflow-shape", group: "structure", severity: "warning", title: "Объекты за пределами фрейма", slide: "Слайды 2, 8", layer: "Decorative shapes", why: "Элементы за границей слайда попадут в экспорт и могут появиться на соседних слайдах.", fix: "Обрезать или удалить элементы за пределами фрейма." },
  { id: "i1", ruleId: "interactive.prototype-link", fixAvailable: false, group: "interactive", severity: "warning", title: "Прототипная ссылка станет статикой", slide: "Слайд 9 — CTA", layer: "Button / Prototype connection", why: "Figma документирует: prototype interactions при PPTX-экспорте экспортируются как static image.", fix: "Удалить или сохранить как иллюстрацию кнопки." },
  { id: "i2", ruleId: "interactive.video-fill", fixAvailable: false, group: "interactive", severity: "warning", title: "Видео-заливка не поддерживается", slide: "Слайд 11 — Demo", layer: "Product demo / Video fill", why: "Видео-заливки экспортируются как статичный кадр в PPTX.", fix: "Заменить на статичный скриншот или добавить ссылку на видео." },
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

const DEFAULT_ENABLED_GROUPS: EnabledRuleGroups = {
  visual: true,
  text: true,
  structure: true,
  interactive: true,
  export: true,
};

const DEFAULT_SCAN_SETTINGS: ScanSettings = {
  strictness: "standard",
  enabledGroups: DEFAULT_ENABLED_GROUPS,
};

function getScoreBreakdown(issues: Issue[]) {
  const crit = issues.filter(i => i.severity === "critical").length;
  const warn = issues.filter(i => i.severity === "warning").length;
  const sugg = issues.filter(i => i.severity === "suggestion").length;
  const penalty = crit * 8 + warn * 2 + sugg;

  return {
    score: Math.max(10, Math.min(100, 100 - penalty)),
    critical: crit,
    warning: warn,
    suggestion: sugg,
    penalty,
  };
}

function computeScore(issues: Issue[]): number {
  return getScoreBreakdown(issues).score;
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

function SourceStep({ onNext }: {
  onNext: (scope: ScanScope) => void;
}) {
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

function ScanStep({ scope, settings, onDone, onBack }: {
  scope: ScanScope;
  settings: ScanSettings;
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
      postToPlugin({ type: "SCAN_REQUEST", scope, settings });
    }
  }, [scope, settings]);

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

function IssuesStep({ issues, slideCount, fixableCount, onDetail, onFix, onRestart }: {
  issues: Issue[]; slideCount: number;
  fixableCount: number;
  onDetail: (issue: Issue) => void; onFix: () => void; onRestart: () => void;
}) {
  const slides = groupIssuesBySlide(issues);
  const [activeSlide, setActiveSlide] = useState(slides[0]?.name ?? "");
  const [open, setOpen] = useState<IssueGroup | null>(null);
  const [scoreOpen, setScoreOpen] = useState(false);
  const groups: IssueGroup[] = ["visual", "text", "structure", "interactive", "export"];
  const scoreDetails = getScoreBreakdown(issues);
  const score = scoreDetails.score;
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
            {slideCount} слайдов · {issues.length} проблем
          </p>
        </div>
        <button onClick={() => setScoreOpen(!scoreOpen)}
          className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/[0.07] text-white/25 hover:text-white/55 transition-colors">
          {scoreOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <Info className="w-3.5 h-3.5" />}
        </button>
      </div>

      {scoreOpen && (
        <div className="px-4 py-3 border-b border-white/[0.05] bg-black/15">
          <div className="grid grid-cols-3 gap-2 mb-2">
            <div className="rounded-lg border border-red-500/10 bg-red-500/[0.04] px-2 py-2">
              <p className="text-[9px] text-red-400/60 font-mono">Критично</p>
              <p className="text-[13px] text-red-300 font-semibold">{scoreDetails.critical}</p>
            </div>
            <div className="rounded-lg border border-amber-400/10 bg-amber-400/[0.04] px-2 py-2">
              <p className="text-[9px] text-amber-400/60 font-mono">Warning</p>
              <p className="text-[13px] text-amber-300 font-semibold">{scoreDetails.warning}</p>
            </div>
            <div className="rounded-lg border border-blue-400/10 bg-blue-400/[0.04] px-2 py-2">
              <p className="text-[9px] text-blue-400/60 font-mono">Советы</p>
              <p className="text-[13px] text-blue-300 font-semibold">{scoreDetails.suggestion}</p>
            </div>
          </div>
          <p className="text-[10.5px] text-white/35 leading-relaxed">
            Формула: 100 − критичные × 8 − предупреждения × 2 − рекомендации × 1. Минимум 10.
          </p>
        </div>
      )}

      {issues.length > 0 && (
        <div className="px-4 py-2 border-b border-white/[0.05] overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          <div className="flex gap-1.5 min-w-max">
            {slides.map((slide, index) => {
              const isActive = slide.name === activeSlideData?.name;
              const criticalCount = slide.issues.filter(issue => issue.severity === "critical").length;
              return (
                <button key={slide.name} onClick={() => { setActiveSlide(slide.name); setOpen(null); }}
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
          <button onClick={onFix} disabled={fixableCount === 0}
            className="w-full bg-lime-400 hover:bg-lime-300 active:bg-lime-500 disabled:bg-white/[0.03] border border-transparent disabled:border-white/[0.06] text-black disabled:text-white/25 text-[12px] font-medium py-2.5 rounded-xl transition-colors">
            {fixableCount > 0 ? `Исправить доступные проблемы: ${fixableCount}` : "Для этих проблем пока нет автофиксов"}
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

function DetailStep({ issue, onBack, onSelect, onFix }: {
  issue: Issue; onBack: () => void; onSelect: (nodeId: string) => void; onFix: (issue: Issue) => void;
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
        {issue.fixAvailable && issue.fixLabel && (
          <div className="mt-2 inline-flex items-center rounded-lg bg-lime-400/10 px-2 py-1 text-[10px] text-lime-300/70">
            Автофикс: {issue.fixLabel}
          </div>
        )}
      </div>
      <div className="px-4 py-3.5 space-y-2">
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { icon: ZoomIn, label: "К слою",       action: () => { if (issue.nodeId) onSelect(issue.nodeId); } },
            { icon: Wand2, label: "Исправить", action: () => onFix(issue), disabled: !isFixableIssue(issue) },
          ].map(({ icon: Icon, label, action, disabled }) => (
            <button key={label} onClick={action} disabled={disabled}
              className="flex flex-col items-center gap-1.5 py-2.5 rounded-xl border border-white/[0.07] hover:border-white/15 hover:bg-white/[0.04] disabled:bg-white/[0.02] text-white/35 hover:text-white/60 disabled:text-white/15 transition-all">
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

function FixModeStep({ issues, onNext }: {
  issues: Array<Issue & { ruleId: string; nodeId: string }>;
  onNext: (targets: FixTargetDto[]) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(issues.map(issue => issue.id)));
  const selectedIssues = issues.filter(issue => selectedIds.has(issue.id));

  function toggleIssue(issueId: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(issueId)) {
        next.delete(issueId);
      } else {
        next.add(issueId);
      }
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-5">
      <p className="text-[11.5px] text-white/35 leading-relaxed">
        Сейчас будут применены только безопасные алгоритмические исправления. Оригинальные слои изменятся, действие можно откатить через Undo в Figma.
      </p>
      <div className="rounded-xl border border-lime-400/15 bg-lime-400/[0.05] px-3.5 py-3">
        <p className="text-[12px] text-white/75 font-semibold">Выбрано автофиксов: {selectedIssues.length} из {issues.length}</p>
        <p className="text-[10.5px] text-white/35 mt-1 leading-relaxed">
          Маски, blur, blend modes и шрифты пока останутся ручными, чтобы не портить визуальную точность.
        </p>
      </div>
      <div className="space-y-1.5 overflow-y-auto" style={{ maxHeight: 290 }}>
        {issues.map(issue => (
          <label key={issue.id}
            className="flex items-start gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 hover:bg-white/[0.04] transition-colors">
            <input
              type="checkbox"
              checked={selectedIds.has(issue.id)}
              onChange={() => toggleIssue(issue.id)}
              className="mt-0.5 h-3.5 w-3.5 accent-lime-400"
            />
            <span className="min-w-0">
              <span className="block text-[11px] text-white/65 leading-tight">{issue.fixLabel ?? issue.title}</span>
              <span className="block text-[10px] text-white/24 mt-0.5 truncate font-mono">{issue.slide} · {issue.layer}</span>
            </span>
          </label>
        ))}
      </div>
      <PrimaryBtn onClick={() => onNext(selectedIssues.map(toFixTarget))} disabled={selectedIssues.length === 0}>
        <span className="flex items-center justify-center gap-2"><Wand2 className="w-3.5 h-3.5" />Применить автофиксы</span>
      </PrimaryBtn>
    </div>
  );
}

// ─── Step: Applying ───────────────────────────────────────────────────────

const APPLY_STEPS = [
  "Проверяю поддерживаемые правила…",
  "Исправляю геометрию слайдов…",
  "Возвращаю слои в границы…",
  "Двигаю текст в безопасную зону…",
  "Повторное сканирование…",
  "Готово",
];

function ApplyingStep({ scope, settings, targets, onDone, onError }: {
  scope: ScanScope;
  settings: ScanSettings;
  targets: FixTargetDto[];
  onDone: (result: FixRunResultDto) => void;
  onError: (message: string) => void;
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const calledRef = useRef(false);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data?.pluginMessage as PluginToUiMessage | undefined;
      if (!message || calledRef.current) return;

      if (message.type === "APPLY_FIXES_RESULT") {
        calledRef.current = true;
        onDone(message.result);
      }

      if (message.type === "APPLY_FIXES_ERROR") {
        calledRef.current = true;
        onError(message.message);
      }
    };

    let idx = 0;
    const tick = setInterval(() => {
      idx++;
      setCurrentStep(Math.min(idx, APPLY_STEPS.length - 1));
      if (idx >= APPLY_STEPS.length && isStandaloneBrowser()) {
        clearInterval(tick);
        setTimeout(() => {
          if (!calledRef.current) {
            calledRef.current = true;
            onDone({ applied: targets.length, skipped: 0, issues: MOCK_ISSUES.filter(issue => !isFixableIssue(issue)), slideCount: 12 });
          }
        }, 400);
      }
    }, 350);

    window.addEventListener("message", handleMessage);
    if (!isStandaloneBrowser()) {
      postToPlugin({ type: "APPLY_FIXES_REQUEST", scope, settings, targets });
    }

    return () => {
      clearInterval(tick);
      window.removeEventListener("message", handleMessage);
    };
  }, [onDone, onError, scope, settings, targets]);

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
      <p className="text-[10.5px] text-white/20 text-center">Изменения можно откатить через Undo в Figma</p>
    </div>
  );
}

// ─── Step: Final ──────────────────────────────────────────────────────────

function FinalStep({ onRestart, scoreBefore, scoreAfter, fixedCount, skippedCount, copyPageName, remainingIssues }: {
  onRestart: () => void;
  scoreBefore: number; scoreAfter: number; fixedCount: number; skippedCount: number;
  copyPageName: string; remainingIssues: Issue[];
}) {
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
    : ["Автофиксы не применялись"];

  const remaining = remainingIssues.length > 0
    ? remainingIssues.map(i => i.title)
    : ["Критичных ручных проблем не осталось"];

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
          {skippedCount > 0 && (
            <div className="flex items-center gap-2.5">
              <Info className="w-3 h-3 text-amber-400 flex-shrink-0" />
              <span className="text-[11px] text-white/40">{skippedCount} проблем пропущено: нужен ручной фикс</span>
            </div>
          )}
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
  const [skippedFixCount, setSkippedFixCount] = useState(0);
  const [scoreBeforeFix, setScoreBeforeFix] = useState(0);
  const [scoreAfterFix, setScoreAfterFix] = useState(0);
  const [copyPageName, setCopyPageName] = useState("");
  const [issues, setIssues] = useState<Issue[]>(MOCK_ISSUES);
  const [pendingFixIssues, setPendingFixIssues] = useState<Array<Issue & { ruleId: string; nodeId: string }>>([]);
  const [pendingFixTargets, setPendingFixTargets] = useState<FixTargetDto[]>([]);
  const [slideCount, setSlideCount] = useState(12);
  const [scanScope, setScanScope] = useState<ScanScope>("page");
  const [scanSettings, setScanSettings] = useState<ScanSettings>(DEFAULT_SCAN_SETTINGS);
  const [notice, setNotice] = useState<string | null>(null);

  const visibleIssues = issues;
  const fixableIssues = visibleIssues.filter(isFixableIssue);
  const scoreBefore = computeScore(visibleIssues);
  const stepIdx     = STEP_ORDER.indexOf(step === "detail" ? "issues" : step);
  const canGoBack = ["detail", "fixmode", "scan", "issues"].includes(step);

  function goBack() {
    if (step === "detail")  setStep("issues");
    if (step === "fixmode") setStep("issues");
    if (step === "scan")    setStep("source");
    if (step === "issues")  setStep("source");
  }

  const remainingIssues = visibleIssues;

  function startScan(scope: ScanScope) {
    setScanScope(scope);
    setStep("scan");
  }

  function finishScan(nextIssues: Issue[], nextSlideCount: number) {
    setIssues(nextIssues);
    setSlideCount(nextSlideCount);
    setStep("issues");
  }

  function selectNode(nodeId: string) {
    setNotice(null);
    postToPlugin({ type: "SELECT_NODE_REQUEST", nodeId });
  }

  function startFixes(nextIssues = fixableIssues) {
    if (nextIssues.length === 0) {
      setNotice("Для выбранных проблем пока нет автофикса");
      return;
    }

    setNotice(null);
    setPendingFixIssues(nextIssues);
    setPendingFixTargets(nextIssues.map(toFixTarget));
    setScoreBeforeFix(scoreBefore);
    setStep("fixmode");
  }

  function finishFixes(result: FixRunResultDto) {
    setIssues(result.issues);
    setSlideCount(result.slideCount);
    setFixedCount(result.applied);
    setSkippedFixCount(result.skipped);
    setScoreAfterFix(computeScore(result.issues));
    setCopyPageName("");
    setDetail(null);
    setStep("final");
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
          <ScanStep scope={scanScope} settings={scanSettings} onDone={finishScan} onBack={() => setStep("source")} key="scan" />
        )}
        {step === "issues" && (
          <IssuesStep issues={visibleIssues} slideCount={slideCount} fixableCount={fixableIssues.length}
            onDetail={(iss) => { setDetail(iss); setStep("detail"); }}
            onFix={() => startFixes()}
            onRestart={() => setStep("source")} />
        )}
        {step === "detail" && detail && (
          <DetailStep issue={detail} onBack={() => setStep("issues")} onSelect={selectNode}
            onFix={(issue) => { if (isFixableIssue(issue)) startFixes([issue]); }} />
        )}
        {step === "fixmode" && (
          <FixModeStep issues={pendingFixIssues} onNext={(targets) => { setPendingFixTargets(targets); setStep("applying"); }} />
        )}
        {step === "applying" && (
          <ApplyingStep scope={scanScope} settings={scanSettings} targets={pendingFixTargets} onDone={finishFixes}
            onError={(message) => { setNotice(message); setStep("issues"); }} />
        )}
        {step === "final" && (
          <FinalStep
            onRestart={() => { setStep("source"); setFixedCount(0); setSkippedFixCount(0); setScoreAfterFix(0); setPendingFixIssues([]); setPendingFixTargets([]); setCopyPageName(""); }}
            scoreBefore={scoreBeforeFix} scoreAfter={scoreAfterFix} fixedCount={fixedCount} skippedCount={skippedFixCount}
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

function toFixTarget(issue: Issue & { ruleId: string; nodeId: string }): FixTargetDto {
  return {
    issueId: issue.id,
    ruleId: issue.ruleId,
    nodeId: issue.nodeId,
  };
}

function isStandaloneBrowser(): boolean {
  return window.parent === window;
}
