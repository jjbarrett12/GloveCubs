import { describe, expect, it } from "vitest";
import { parseGloveInvoiceLine, parsePackAndUom } from "./index";

describe("parseGloveInvoiceLine", () => {
  it("parses NITR GLV BLK XL 100/BX", () => {
    const p = parseGloveInvoiceLine("NITR GLV BLK XL 100/BX");
    expect(p.material).toBe("nitrile");
    expect(p.color).toBe("black");
    expect(p.size).toBe("xl");
    expect(p.gloves_per_box).toBe(100);
    expect(p.quantity_uom).toBe("BX");
    expect(p.pack_notation).toMatch(/100\/BX/i);
  });

  it("parses NITRILE EXAM BLU LG 200/BX 10BX/CS", () => {
    const p = parseGloveInvoiceLine("NITRILE EXAM BLU LG 200/BX 10BX/CS");
    expect(p.material).toBe("nitrile");
    expect(p.grade).toBe("exam");
    expect(p.color).toBe("blue");
    expect(p.size).toBe("l");
    expect(p.gloves_per_box).toBe(200);
    expect(p.boxes_per_case).toBe(10);
    expect(p.gloves_per_case).toBe(2000);
    expect(p.quantity_uom).toBe("CS");
  });

  it("parses VINYL PF MED 100EA/BX", () => {
    const p = parseGloveInvoiceLine("VINYL PF MED 100EA/BX");
    expect(p.material).toBe("vinyl");
    expect(p.powder).toBe("powder_free");
    expect(p.size).toBe("m");
    expect(p.gloves_per_box).toBe(100);
    expect(p.quantity_uom).toBe("BX");
  });

  it("does not treat UNIT as nitrile (NIT substring)", () => {
    const p = parseGloveInvoiceLine("UNIT PRICE EACH");
    expect(p.material).toBeNull();
  });

  it("distinguishes CS vs BX in pack parser", () => {
    const cs = parsePackAndUom("4 CS @ $96");
    expect(cs.quantity_uom).toBe("CS");
    const bx = parsePackAndUom("4 BX @ $96");
    expect(bx.quantity_uom).toBe("BX");
  });

  it("parses 2M/CS as 2000 gloves per case", () => {
    const p = parsePackAndUom("NITRILE 2M/CS");
    expect(p.gloves_per_case).toBe(2000);
  });

  it("parses LATEX WHT SM 500/BX 5BX/CS", () => {
    const p = parseGloveInvoiceLine("LATEX WHT SM 500/BX 5BX/CS");
    expect(p.material).toBe("latex");
    expect(p.color).toBe("white");
    expect(p.size).toBe("s");
    expect(p.gloves_per_box).toBe(500);
    expect(p.boxes_per_case).toBe(5);
    expect(p.gloves_per_case).toBe(2500);
  });
});
