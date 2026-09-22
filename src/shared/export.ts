export type ExportMode = "editable" | "image-only";

export interface ExportDocumentDto {
  slides: ExportSlideDto[];
}

export interface ExportSlideDto {
  id: string;
  name: string;
  width: number;
  height: number;
  mode: ExportMode;
  elements: ExportElementDto[];
  fallbackPng?: Uint8Array;
  fallbackReason?: string;
  /** Почему отдельные слои пришлось растеризовать, для отчёта в UI. */
  rasterReasons?: string[];
}

export type ExportElementDto = ExportTextDto | ExportShapeDto | ExportImageDto;

export interface ExportBoundsDto {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
}

export interface ExportTextDto extends ExportBoundsDto {
  kind: "text";
  id: string;
  text: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  colorOpacity: number;
  bold: boolean;
  italic: boolean;
  align: "left" | "center" | "right";
  valign?: "top" | "mid" | "bottom";
}

export interface ExportShapeDto extends ExportBoundsDto {
  kind: "shape";
  id: string;
  shape: "rect" | "ellipse" | "line";
  fill?: ExportPaintDto;
  stroke?: ExportPaintDto;
  /** Толщина обводки в пикселях макета. */
  strokeWidth?: number;
  /** Радиус скругления в пикселях макета. */
  cornerRadius?: number;
}

export interface ExportPaintDto {
  color: string;
  opacity: number;
}

export interface ExportImageDto extends ExportBoundsDto {
  kind: "image";
  id: string;
  bytes: Uint8Array;
}
