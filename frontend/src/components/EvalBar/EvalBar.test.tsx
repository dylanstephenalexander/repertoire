import { render, screen } from "@testing-library/react";
import { EvalBar } from "./EvalBar";

function getBarDivs() {
  const bar = screen.getByLabelText("Evaluation bar");
  const [top, bottom] = Array.from(bar.children) as HTMLElement[];
  return { top, bottom };
}

function height(el: HTMLElement): number {
  const match = el.getAttribute("style")?.match(/height:\s*([\d.]+)%/);
  if (!match) throw new Error(`No height style on element: ${el.outerHTML}`);
  return parseFloat(match[1]);
}

describe("EvalBar", () => {
  it("renders the bar element", () => {
    render(<EvalBar evalCp={0} orientation="white" />);
    expect(screen.getByLabelText("Evaluation bar")).toBeInTheDocument();
  });

  it("null eval renders 50/50", () => {
    render(<EvalBar evalCp={null} orientation="white" />);
    const { top, bottom } = getBarDivs();
    expect(height(top)).toBe(50);
    expect(height(bottom)).toBe(50);
  });

  it("positive eval tilts toward white (white orientation — white is bottom)", () => {
    render(<EvalBar evalCp={500} orientation="white" />);
    const { top, bottom } = getBarDivs();
    // top = black section, bottom = white section; white should be larger
    expect(height(bottom)).toBeGreaterThan(height(top));
  });

  it("mate score pins bar fully to white", () => {
    render(<EvalBar evalCp={30000} orientation="white" />);
    const { top, bottom } = getBarDivs();
    expect(height(top)).toBe(0);
    expect(height(bottom)).toBe(100);
  });

  it("negative mate score pins bar fully to black", () => {
    render(<EvalBar evalCp={-30000} orientation="white" />);
    const { top, bottom } = getBarDivs();
    expect(height(top)).toBe(100);
    expect(height(bottom)).toBe(0);
  });

  it("orientation=black flips which section is on top", () => {
    // With positive eval, white is ahead.
    // white orientation → white section is at bottom (small black section on top)
    // black orientation → bar flips → white section is at top (large top section)
    const { container: cW } = render(<EvalBar evalCp={500} orientation="white" />);
    const { container: cB } = render(<EvalBar evalCp={500} orientation="black" />);

    const topW = height(Array.from(cW.querySelector('[aria-label]')!.children)[0] as HTMLElement);
    const topB = height(Array.from(cB.querySelector('[aria-label]')!.children)[0] as HTMLElement);
    // White orientation: small black section on top. Black orientation: larger section on top.
    expect(topB).toBeGreaterThan(topW);
  });
});
