import { describe, expect, it } from "vitest";
import { formatPdfTextItems, type PdfTextItem } from "./pdf-import";

function item(str: string, y: number, options: { x?: number; hasEOL?: boolean } = {}): PdfTextItem {
  return {
    str,
    transform: [1, 0, 0, 10, options.x ?? 40, y],
    width: str.length * 5,
    height: 10,
    hasEOL: options.hasEOL ?? false,
  };
}

describe("formatPdfTextItems", () => {
  it("preserves visual job boundaries", () => {
    const text = formatPdfTextItems([
      item("Software Engineer", 700),
      item("Hyros", 680),
      item("Junio 2025 - Presente", 660),
      item("Responsable de la arquitectura", 640),
      item("y evolucion tecnica.", 640, { x: 200, hasEOL: true }),
      item("Desarrollador Fullstack", 600),
      item("PANACA", 580),
      item("Enero 2025 - Junio 2025", 560),
      item("Desarrollo funcionalidades internas.", 540),
      item("Agente de Soporte Tecnico", 500),
      item("Holy Servers LLC.", 480),
      item("Brindo soporte a usuarios.", 460),
    ]);

    expect(text).toBe([
      "Software Engineer", "Hyros", "Junio 2025 - Presente",
      "Responsable de la arquitectura y evolucion tecnica.", "",
      "Desarrollador Fullstack", "PANACA", "Enero 2025 - Junio 2025",
      "Desarrollo funcionalidades internas.", "", "Agente de Soporte Tecnico",
      "Holy Servers LLC.", "Brindo soporte a usuarios.",
    ].join("\n"));
  });

  it("reconstructs two-column visual order", () => {
    const positioned = (str: string, x: number, y: number, width = str.length * 5): PdfTextItem => ({
      str, transform: [1, 0, 0, 10, x, y], width, height: 10, hasEOL: false,
    });
    const text = formatPdfTextItems([
      positioned("CONTACTO", 35, 700),
      positioned("correo@example.com", 35, 680),
      positioned("EXPERIENCIA PROFESIONAL", 220, 560, 180),
      positioned("Software Engineer", 220, 520, 100),
      positioned("Hyros", 220, 500),
      positioned("Desarrollador Fullstack", 220, 420, 120),
      positioned("PANACA", 220, 400),
      positioned("Agente de Soporte Tecnico", 220, 320, 130),
      positioned("Holy Servers LLC.", 220, 300),
      positioned("Arquitectura cloud en AWS.", 390, 520, 145),
      positioned("Pipelines CI/CD.", 390, 500, 85),
      positioned("Desarrollo funcionalidades internas.", 390, 420, 170),
      positioned("Soporte de servidores Linux.", 390, 320, 150),
    ], 600);

    expect(text.indexOf("correo@example.com")).toBeLessThan(text.indexOf("EXPERIENCIA PROFESIONAL"));
    expect(text.indexOf("Arquitectura cloud en AWS.")).toBeGreaterThan(text.indexOf("Software Engineer"));
    expect(text.indexOf("Arquitectura cloud en AWS.")).toBeLessThan(text.indexOf("Desarrollador Fullstack"));
    expect(text.indexOf("Desarrollo funcionalidades internas.")).toBeLessThan(text.indexOf("Agente de Soporte Tecnico"));
    expect(text.indexOf("Soporte de servidores Linux.")).toBeGreaterThan(text.indexOf("Agente de Soporte Tecnico"));
  });

  it("uses explicit PDF.js end-of-line markers without coordinates", () => {
    expect(formatPdfTextItems([
      { str: "First", hasEOL: false },
      { str: "line", hasEOL: true },
      { str: "Second line", hasEOL: true },
    ])).toBe("First line\nSecond line");
  });
});
