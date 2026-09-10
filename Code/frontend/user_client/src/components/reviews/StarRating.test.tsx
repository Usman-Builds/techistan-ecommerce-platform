import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Stars, StarInput } from "./StarRating";

describe("Stars (read-only)", () => {
  it("exposes the rating to assistive tech", () => {
    render(<Stars value={4.5} />);
    expect(screen.getByRole("img", { name: "4.5 out of 5 stars" })).toBeInTheDocument();
  });
});

describe("StarInput (interactive)", () => {
  it("renders a 5-option radiogroup", () => {
    render(<StarInput value={0} onChange={() => {}} />);
    expect(screen.getByRole("radiogroup", { name: "Rating" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(5);
  });

  it("marks the selected rating as checked", () => {
    render(<StarInput value={3} onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: "3 stars" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "1 star" })).not.toBeChecked();
  });

  it("reports the picked rating", async () => {
    const onChange = vi.fn();
    render(<StarInput value={0} onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "4 stars" }));
    expect(onChange).toHaveBeenCalledWith(4);
  });
});
