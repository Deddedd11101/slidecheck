import { createRequire } from "node:module";
import PptxGenJS from "pptxgenjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExportDocumentDto, ExportElementDto, ExportShapeDto, ExportTextDto } from "../../shared/export";
import { createEditablePptx, createEditablePptxFile } from "./editable-pptx";
import { collectExportDocument } from "../../plugin/adapter/collect-export-document";
import { installMockFigma, MockNode, uninstallMockFigma } from "../../plugin/testing/figma-mock";

// Resolve the ZIP library already shipped with pptxgenjs, including pnpm installs.
const require = createRequire(import.meta.url);
const JSZip = createRequire(require.resolve("pptxgenjs"))("jszip");
const png = Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
  "base64",
));
const bounds = { x: 120, y: 90, width: 300, height: 120, rotation: 0, opacity: 1 };
const text: ExportTextDto = {
  ...bounds, kind: "text", id: "text", text: "Hello & <PPTX>", fontFamily: "Arial",
  fontSize: 24, color: "123456", colorOpacity: 1, bold: true, italic: false, align: "left",
};

function document(elements: ExportElementDto[], width = 1920): ExportDocumentDto {
  return { slides: [{ id: "slide", name: "Slide", width, height: width * 9 / 16, mode: "editable", elements }] };
}

async function archive(dto: ExportDocumentDto) {
  const data = await createEditablePptx(dto).write({ outputType: "nodebuffer" });
  return JSZip.loadAsync(data);
}

async function slideXml(elements: ExportElementDto[], width = 1920): Promise<string> {
  const zip = await archive(document(elements, width));
  return zip.file("ppt/slides/slide1.xml").async("string");
}

afterEach(() => vi.restoreAllMocks());

describe("editable PPTX serialization", () => {
  it.each([[1920, 24, 1200], [1280, 24, 1800], [1920, 64, 3200], [1920, 0.1, 100]])(
    "serializes %ipx-wide layout with %ipx font as %i hundredths of a point",
    async (width, fontSize, expected) => {
      const xml = await slideXml([{ ...text, fontSize }], width);
      expect(xml).toMatch(new RegExp(`<a:rPr[^>]* sz="${expected}"`));
      expect(xml).toContain('<a:latin typeface="Arial"');
      expect(xml).toContain("Hello &amp; &lt;PPTX&gt;");
    },
  );

  it.each([
    [undefined, "t"], ["top", "t"], ["mid", "ctr"], ["bottom", "b"],
  ] as const)("serializes valign %s as %s", async (valign, anchor) => {
    const xml = await slideXml([{ ...text, valign }]);
    expect(xml).toMatch(new RegExp(`<a:bodyPr[^>]* anchor="${anchor}"`));
  });

  it.each([15, -15, 90, 0, 375])("serializes %i-degree rotations for text, shapes and images", async rotation => {
    const elements: ExportElementDto[] = [
      { ...text, rotation },
      { ...bounds, kind: "shape", id: "shape", shape: "rect", rotation },
      { ...bounds, kind: "image", id: "image", bytes: png, rotation },
    ];
    const xml = await slideXml(elements);
    const transforms = [...xml.matchAll(/<p:spPr>\s*<a:xfrm\b([^>]*)>/g)].map(match => match[1]);
    expect(transforms).toHaveLength(3);
    const expected = ((-rotation % 360 + 360) % 360) * 60000;
    for (const transform of transforms) {
      const actual = Number(/\brot="(\d+)"/.exec(transform)?.[1] ?? 0);
      expect(actual).toBe(expected);
    }
  });

  it.each(["rect", "ellipse", "line", "roundRect"])("writes native %s with explicit stroke or no stroke", async preset => {
    const shape: ExportShapeDto = {
      ...bounds, kind: "shape", id: "shape",
      shape: preset === "roundRect" ? "rect" : preset as ExportShapeDto["shape"],
      cornerRadius: preset === "roundRect" ? 12 : undefined,
      fill: { color: "AABBCC", opacity: 0.5 }, opacity: 0.5,
    };
    const xml = await slideXml([shape, {
      ...shape, id: "stroked", stroke: { color: "FF0000", opacity: 0.5 }, strokeWidth: 4,
    }]);
    const shapes = [...xml.matchAll(/<p:sp>.*?<\/p:sp>/gs)].map(match => match[0]);
    expect(shapes).toHaveLength(2);
    for (const item of shapes) {
      expect(item).toContain(`<a:prstGeom prst="${preset}">`);
      expect(item).toContain('<a:srgbClr val="AABBCC"><a:alpha val="25000"/></a:srgbClr>');
    }
    expect(shapes[0]).toMatch(/<a:ln\b[^>]*><a:solidFill><a:srgbClr val="FFFFFF"><a:alpha val="0"\/><\/a:srgbClr><\/a:solidFill>/);
    expect(shapes[1]).toContain('<a:ln w="25400"');
    expect(shapes[1]).toContain('<a:srgbClr val="FF0000"><a:alpha val="25000"/></a:srgbClr>');
  });

  it("embeds the valid PNG bytes with a matching picture relationship and content type", async () => {
    const zip = await archive(document([{ ...bounds, kind: "image", id: "image", bytes: png }]));
    const xml = await zip.file("ppt/slides/slide1.xml").async("string");
    const rels = await zip.file("ppt/slides/_rels/slide1.xml.rels").async("string");
    const embed = /<a:blip r:embed="([^"]+)"/.exec(xml)?.[1];
    expect(embed).toBeTruthy();
    const relationship = rels.match(new RegExp(`<Relationship[^>]*Id="${embed}"[^>]*/>`))?.[0];
    expect(relationship).toContain('/image"');
    const target = /Target="\.\.\/(media\/[^" ]+)"/.exec(relationship ?? "")?.[1];
    expect(target).toBeTruthy();
    expect(await zip.file(`ppt/${target}`).async("uint8array")).toEqual(png);
    expect(await zip.file("[Content_Types].xml").async("string")).toContain('ContentType="image/png"');
    expect(xml).toContain("<p:pic>");
  });

  it("preserves slide order and contains the whole-slide PNG fallback", async () => {
    const dto = document([text]);
    dto.slides.push({ id: "fallback", name: "Fallback", width: 1000, height: 1000, mode: "image-only", fallbackPng: png, elements: [text] });
    const zip = await archive(dto);
    const first = await zip.file("ppt/slides/slide1.xml").async("string");
    const second = await zip.file("ppt/slides/slide2.xml").async("string");
    expect(first).toContain("Hello &amp;");
    expect(second).toContain("<p:pic>");
    expect(second).not.toContain("<p:sp>");
    expect(second).toContain('<a:off x="2666848" y="0"/>');
    expect(second).toContain('<a:ext cx="6858000" cy="6858000"/>');
  });

  it("rejects empty exports before writing", async () => {
    expect(() => createEditablePptx({ slides: [] })).toThrow("Нет слайдов для экспорта");
    await expect(createEditablePptxFile({ slides: [] })).rejects.toThrow("Нет слайдов для экспорта");
  });

  it("serializes adapter output containing native text, native shape and raster fallback", async () => {
    const black = { type: "SOLID", color: { r: 0, g: 0, b: 0 } };
    vi.spyOn(MockNode.prototype, "exportAsync").mockResolvedValue(png);
    installMockFigma([{
      type: "FRAME", width: 1920, height: 1080, fills: [], children: [
        { type: "TEXT", ...bounds, characters: "Native title", fontSize: 64,
          fontName: { family: "Arial", style: "Regular" }, textAlignVertical: "CENTER", fills: [black] },
        { type: "RECTANGLE", ...bounds, fills: [black] },
        { type: "VECTOR", ...bounds, name: "Raster icon", fills: [black] },
      ],
    }]);
    try {
      const dto = await collectExportDocument("page");
      expect(dto.slides[0].mode).toBe("editable");
      expect(dto.slides[0].elements.map(element => element.kind)).toEqual(["text", "shape", "image"]);
      const zip = await archive(dto);
      const xml = await zip.file("ppt/slides/slide1.xml").async("string");
      expect(xml).toContain("<a:t>Native title</a:t>");
      expect(xml).toMatch(/<a:rPr[^>]* sz="3200"/);
      expect(xml).toMatch(/<a:bodyPr[^>]* anchor="ctr"/);
      expect(xml).toContain('<a:prstGeom prst="rect">');
      expect(xml).toContain('<a:alpha val="0"/>');
      expect(xml).toContain("<p:pic>");
      const media = zip.file(/^ppt\/media\/.*\.png$/);
      expect(media).toHaveLength(1);
      expect(await media[0].async("uint8array")).toEqual(png);
    } finally {
      uninstallMockFigma();
    }
  });

  it("keeps the UI download filename and propagates write failures", async () => {
    vi.spyOn(Date.prototype, "toISOString").mockReturnValue("2026-09-22T12:00:00.000Z");
    const write = vi.spyOn(PptxGenJS.prototype, "writeFile").mockResolvedValue("ignored");
    await expect(createEditablePptxFile(document([text]))).resolves.toBe("slidecheck-editable-2026-09-22.pptx");
    expect(write).toHaveBeenCalledWith({ fileName: "slidecheck-editable-2026-09-22.pptx" });
    write.mockRejectedValueOnce(new Error("Download failed"));
    await expect(createEditablePptxFile(document([text]))).rejects.toThrow("Download failed");
  });
});
