/**
 * Минимальная подделка Figma Plugin API для тестов.
 *
 * Покрывает ровно те возможности, которые использует плагин: сцену из фреймов
 * и слайдов, абсолютные координаты, заливки/эффекты/blend mode, клонирование,
 * группировку и растровый экспорт. Это позволяет прогонять `applyFixes` и
 * `collectExportDocument` без запущенной Figma.
 */

export const MIXED = Symbol("figma.mixed");

export interface MockPaint {
  type: string;
  visible?: boolean;
  opacity?: number;
  color?: { r: number; g: number; b: number };
  gradientStops?: Array<{ position: number; color: { r: number; g: number; b: number; a: number } }>;
  imageHash?: string;
  scaleMode?: string;
  blendMode?: string;
}

export interface MockEffect {
  type: string;
  visible: boolean;
  radius?: number;
}

export interface MockNodeInit {
  id?: string;
  name?: string;
  type: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  opacity?: number;
  visible?: boolean;
  blendMode?: string;
  isMask?: boolean;
  clipsContent?: boolean;
  layoutMode?: string;
  fills?: MockPaint[] | typeof MIXED;
  strokes?: MockPaint[];
  strokeWeight?: number;
  effects?: MockEffect[];
  characters?: string;
  fontName?: { family: string; style: string } | typeof MIXED;
  fontSize?: number | typeof MIXED;
  textAlignHorizontal?: string;
  textAlignVertical?: string;
  lineHeight?: { unit: "AUTO" } | { unit: "PIXELS" | "PERCENT"; value: number } | typeof MIXED;
  letterSpacing?: { unit: "PIXELS" | "PERCENT"; value: number } | typeof MIXED;
  textDecoration?: string | typeof MIXED;
  getRangeListOptions?: (start: number, end: number) => { type: "NONE" | "ORDERED" | "UNORDERED" } | typeof MIXED;
  textTruncation?: string;
  cornerRadius?: number | typeof MIXED;
  cornerSmoothing?: number;
  arcData?: { startingAngle: number; endingAngle: number; innerRadius: number };
  children?: MockNodeInit[];
}

let idCounter = 0;

function nextId(): string {
  idCounter += 1;
  return `mock:${idCounter}`;
}

export function resetMockIds(): void {
  idCounter = 0;
}

export class MockNode {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  blendMode: string;
  isMask: boolean;
  clipsContent: boolean;
  layoutMode: string;
  fills: MockPaint[] | typeof MIXED;
  strokes: MockPaint[];
  strokeWeight: number;
  effects: MockEffect[];
  characters: string;
  fontName: { family: string; style: string } | typeof MIXED;
  fontSize: number | typeof MIXED;
  textAlignHorizontal: string;
  textAlignVertical: string;
  lineHeight: NonNullable<MockNodeInit["lineHeight"]>;
  letterSpacing: NonNullable<MockNodeInit["letterSpacing"]>;
  textDecoration: NonNullable<MockNodeInit["textDecoration"]>;
  getRangeListOptions: NonNullable<MockNodeInit["getRangeListOptions"]>;
  textTruncation: string;
  cornerRadius: number | typeof MIXED;
  cornerSmoothing: number;
  arcData?: MockNodeInit["arcData"];
  children: MockNode[];
  parent: MockNode | MockPage | null = null;
  removed = false;
  exportCalls: Array<Record<string, unknown>> = [];

  constructor(init: MockNodeInit) {
    this.id = init.id ?? nextId();
    this.name = init.name ?? this.type ?? "Node";
    this.type = init.type;
    this.name = init.name ?? init.type;
    this.x = init.x ?? 0;
    this.y = init.y ?? 0;
    this.width = init.width ?? 100;
    this.height = init.height ?? 100;
    this.rotation = init.rotation ?? 0;
    this.opacity = init.opacity ?? 1;
    this.visible = init.visible ?? true;
    this.blendMode = init.blendMode ?? (init.type === "GROUP" ? "PASS_THROUGH" : "NORMAL");
    this.isMask = init.isMask ?? false;
    this.clipsContent = init.clipsContent ?? false;
    this.layoutMode = init.layoutMode ?? "NONE";
    this.fills = init.fills ?? [];
    this.strokes = init.strokes ?? [];
    this.strokeWeight = init.strokeWeight ?? 1;
    this.effects = init.effects ?? [];
    this.characters = init.characters ?? "";
    this.fontName = init.fontName ?? { family: "Inter", style: "Regular" };
    this.fontSize = init.fontSize ?? 16;
    this.textAlignHorizontal = init.textAlignHorizontal ?? "LEFT";
    this.textAlignVertical = init.textAlignVertical ?? "TOP";
    this.lineHeight = init.lineHeight ?? { unit: "AUTO" };
    this.letterSpacing = init.letterSpacing ?? { unit: "PIXELS", value: 0 };
    this.textDecoration = init.textDecoration ?? "NONE";
    this.getRangeListOptions = init.getRangeListOptions ?? (() => ({ type: "NONE" }));
    this.textTruncation = init.textTruncation ?? "DISABLED";
    this.cornerRadius = init.cornerRadius ?? 0;
    this.cornerSmoothing = init.cornerSmoothing ?? 0;
    this.arcData = init.arcData ? { ...init.arcData } : undefined;
    this.children = (init.children ?? []).map(child => new MockNode(child));
    for (const child of this.children) child.parent = this;
  }

  get absoluteTransform(): [[number, number, number], [number, number, number]] {
    // Figma positive rotation is counterclockwise in a Y-down coordinate system.
    const radians = this.rotation * Math.PI / 180;
    const c = Math.cos(radians);
    const s = Math.sin(radians);
    if (!(this.parent instanceof MockNode)) return [[c, s, this.x], [-s, c, this.y]];
    const [[a, b, tx], [d, e, ty]] = this.parent.absoluteTransform;
    return [
      [a * c - b * s, a * s + b * c, a * this.x + b * this.y + tx],
      [d * c - e * s, d * s + e * c, d * this.x + e * this.y + ty],
    ];
  }

  get absoluteBoundingBox(): { x: number; y: number; width: number; height: number } {
    const [[a, b, tx], [d, e, ty]] = this.absoluteTransform;
    const corners = [[0, 0], [this.width, 0], [0, this.height], [this.width, this.height]];
    const xs = corners.map(([x, y]) => a * x + b * y + tx);
    const ys = corners.map(([x, y]) => d * x + e * y + ty);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
  }

  get absoluteRenderBounds(): { x: number; y: number; width: number; height: number } {
    return this.absoluteBoundingBox;
  }

  resize(width: number, height: number): void {
    if (this.type === "SLIDE") {
      throw new Error("Slides cannot be resized");
    }
    this.width = width;
    this.height = height;
  }

  async setFillsAsync(fills: MockPaint[]): Promise<void> {
    this.fills = fills;
  }

  clone(): MockNode {
    const copy = new MockNode({ type: this.type });
    copy.name = this.name;
    copy.x = this.x;
    copy.y = this.y;
    copy.width = this.width;
    copy.height = this.height;
    copy.rotation = this.rotation;
    copy.opacity = this.opacity;
    copy.visible = this.visible;
    copy.blendMode = this.blendMode;
    copy.isMask = this.isMask;
    copy.clipsContent = this.clipsContent;
    copy.layoutMode = this.layoutMode;
    copy.fills = Array.isArray(this.fills) ? this.fills.map(fill => ({ ...fill })) : this.fills;
    copy.strokes = this.strokes.map(stroke => ({ ...stroke }));
    copy.effects = this.effects.map(effect => ({ ...effect }));
    copy.characters = this.characters;
    copy.fontName = this.fontName;
    copy.fontSize = this.fontSize;
    copy.textAlignHorizontal = this.textAlignHorizontal;
    copy.textAlignVertical = this.textAlignVertical;
    copy.lineHeight = typeof this.lineHeight === "symbol" ? this.lineHeight : { ...this.lineHeight };
    copy.letterSpacing = typeof this.letterSpacing === "symbol" ? this.letterSpacing : { ...this.letterSpacing };
    copy.textDecoration = this.textDecoration;
    copy.getRangeListOptions = this.getRangeListOptions;
    copy.textTruncation = this.textTruncation;
    copy.cornerRadius = this.cornerRadius;
    copy.cornerSmoothing = this.cornerSmoothing;
    copy.arcData = this.arcData ? { ...this.arcData } : undefined;
    copy.children = this.children.map(child => {
      const clonedChild = child.clone();
      clonedChild.parent = copy;
      return clonedChild;
    });
    registerNode(copy);

    const parent = this.parent;
    if (parent) {
      copy.parent = parent;
      parent.children.push(copy);
    }
    return copy;
  }

  remove(): void {
    const parent = this.parent;
    if (parent) {
      const index = parent.children.indexOf(this);
      if (index >= 0) parent.children.splice(index, 1);
    }
    this.parent = null;
    this.removed = true;
  }

  async exportAsync(settings: Record<string, unknown> = {}): Promise<Uint8Array> {
    this.exportCalls.push(settings);
    // Complete transparent RGBA 1x1 PNG, including CRCs and compressed pixel data.
    return new Uint8Array([
      137, 80, 78, 71, 13, 10, 26, 10,
      0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1,
      8, 6, 0, 0, 0, 31, 21, 196, 137,
      0, 0, 0, 11, 73, 68, 65, 84, 120, 156, 99, 96, 0, 2,
      0, 0, 5, 0, 1, 122, 94, 171, 63,
      0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
    ]);
  }
}

export class MockPage {
  type = "PAGE" as const;
  id = "page:1";
  name = "Page 1";
  children: MockNode[] = [];
  selection: MockNode[] = [];
  parent: null = null;
  focusedSlide: MockNode | null = null;
}

const registry = new Map<string, MockNode>();

function registerNode(node: MockNode): void {
  registry.set(node.id, node);
  for (const child of node.children) registerNode(child);
}

export interface MockFigmaOptions {
  editorType?: "figma" | "slides";
  availableFonts?: string[];
}

export interface MockFigma {
  page: MockPage;
  groupCalls: number;
  loadedFonts: Array<{ family: string; style: string }>;
  getNode(id: string): MockNode | undefined;
}

/**
 * Ставит глобальный `figma` и возвращает хэндл для проверок в тестах.
 */
export function installMockFigma(roots: MockNodeInit[], options: MockFigmaOptions = {}): MockFigma {
  resetMockIds();
  registry.clear();

  const page = new MockPage();
  for (const init of roots) {
    const node = new MockNode(init);
    node.parent = page;
    page.children.push(node);
    registerNode(node);
  }

  const availableFonts = new Set(options.availableFonts ?? ["Arial", "Inter", "Roboto"]);
  const handle: MockFigma = {
    page,
    groupCalls: 0,
    loadedFonts: [],
    getNode: (id: string) => registry.get(id),
  };

  const figma = {
    mixed: MIXED,
    editorType: options.editorType ?? "figma",
    currentPage: page,
    root: { children: [page] },
    async getNodeByIdAsync(id: string) {
      return registry.get(id) ?? null;
    },
    getSlideGrid() {
      return [page.children.filter(node => node.type === "SLIDE")];
    },
    createRectangle() {
      const rect = new MockNode({ type: "RECTANGLE" });
      rect.parent = page;
      page.children.push(rect);
      registerNode(rect);
      return rect;
    },
    async loadFontAsync(font: { family: string; style: string }) {
      handle.loadedFonts.push(font);
      if (!availableFonts.has(font.family)) {
        throw new Error(`Font not available: ${font.family}`);
      }
    },
    group(nodes: MockNode[], parent: MockNode | MockPage, index?: number) {
      handle.groupCalls += 1;
      const first = nodes[0];
      const group = new MockNode({
        type: "GROUP",
        x: first?.x ?? 0,
        y: first?.y ?? 0,
        width: first?.width ?? 0,
        height: first?.height ?? 0,
      });
      for (const node of nodes) {
        if (node.parent) {
          const currentIndex = node.parent.children.indexOf(node);
          if (currentIndex >= 0) node.parent.children.splice(currentIndex, 1);
        }
        node.parent = group;
      }
      group.children = nodes;
      group.parent = parent;
      parent.children.splice(index ?? parent.children.length, 0, group);
      registerNode(group);
      return group;
    },
    notify(message: string) {
      return { message, cancel() {} };
    },
    viewport: {
      center: { x: 0, y: 0 },
      zoom: 1,
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      scrollAndZoomIntoView() {},
    },
    ui: {
      postMessage() {},
      onmessage: null,
    },
    showUI() {},
  };

  (globalThis as unknown as { figma: unknown }).figma = figma;
  return handle;
}

export function uninstallMockFigma(): void {
  delete (globalThis as unknown as { figma?: unknown }).figma;
  registry.clear();
}
