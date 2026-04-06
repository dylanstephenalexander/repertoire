import { describe, it, expect } from "vitest";
import { sanToEnglish, translateExplanation } from "./notation";

describe("sanToEnglish", () => {
  it("converts pawn move", () => {
    expect(sanToEnglish("e4")).toBe("pawn to E4");
  });

  it("converts pawn capture", () => {
    expect(sanToEnglish("exd5")).toBe("pawn takes D5");
  });

  it("converts piece move", () => {
    expect(sanToEnglish("Nf3")).toBe("knight to F3");
    expect(sanToEnglish("Bc4")).toBe("bishop to C4");
    expect(sanToEnglish("Qd4")).toBe("queen to D4");
    expect(sanToEnglish("Rd1")).toBe("rook to D1");
    expect(sanToEnglish("Ke2")).toBe("king to E2");
  });

  it("converts piece capture", () => {
    expect(sanToEnglish("Bxc6")).toBe("bishop takes C6");
    expect(sanToEnglish("Nxe5")).toBe("knight takes E5");
  });

  it("appends check suffix", () => {
    expect(sanToEnglish("Qd7+")).toBe("queen to D7 (check)");
  });

  it("appends checkmate suffix", () => {
    expect(sanToEnglish("Qxf7#")).toBe("queen takes F7 (checkmate)");
  });

  it("converts promotion", () => {
    expect(sanToEnglish("e8=Q")).toBe("pawn to E8 promotes to queen");
  });

  it("converts kingside castling", () => {
    expect(sanToEnglish("O-O")).toBe("kingside castle");
  });

  it("converts queenside castling", () => {
    expect(sanToEnglish("O-O-O")).toBe("queenside castle");
  });
});

describe("translateExplanation", () => {
  it("notation mode leaves text unchanged", () => {
    const text = "Best was Nf3. Mainline: e4.";
    expect(translateExplanation(text, "notation")).toBe(text);
  });

  it("readable mode replaces SAN tokens", () => {
    const result = translateExplanation("Best was Nf3.", "readable");
    expect(result).toBe("Best was knight to F3.");
  });

  it("both mode appends original in parentheses", () => {
    const result = translateExplanation("Try e4 instead.", "both");
    expect(result).toBe("Try pawn to E4 (e4) instead.");
  });

  it("handles multiple moves in one explanation", () => {
    const result = translateExplanation("Mainline was Nf3, but Bc4 is fine.", "readable");
    expect(result).toBe("Mainline was knight to F3, but bishop to C4 is fine.");
  });

  it("handles castling in text", () => {
    const result = translateExplanation("Consider O-O to castle.", "readable");
    expect(result).toBe("Consider kingside castle to castle.");
  });
});
