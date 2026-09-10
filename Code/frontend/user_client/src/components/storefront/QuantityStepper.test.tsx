import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuantityStepper } from "./QuantityStepper";

/**
 * +/- quantity control (FR-303). The UI must not let the shopper step below `min`
 * or above `max` (live stock); the server clamps regardless.
 */
describe("QuantityStepper", () => {
  it("renders the current value", () => {
    render(<QuantityStepper value={3} onChange={() => {}} />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("increments and decrements via the buttons", async () => {
    const onChange = vi.fn();
    render(<QuantityStepper value={2} max={5} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("Increase quantity"));
    await userEvent.click(screen.getByLabelText("Decrease quantity"));
    expect(onChange).toHaveBeenNthCalledWith(1, 3);
    expect(onChange).toHaveBeenNthCalledWith(2, 1);
  });

  it("disables decrement at the minimum", () => {
    render(<QuantityStepper value={1} min={1} onChange={() => {}} />);
    expect(screen.getByLabelText("Decrease quantity")).toBeDisabled();
    expect(screen.getByLabelText("Increase quantity")).toBeEnabled();
  });

  it("disables increment at the maximum (live stock)", () => {
    render(<QuantityStepper value={5} max={5} onChange={() => {}} />);
    expect(screen.getByLabelText("Increase quantity")).toBeDisabled();
  });

  it("disables both controls when disabled", () => {
    render(<QuantityStepper value={3} max={5} disabled onChange={() => {}} />);
    expect(screen.getByLabelText("Increase quantity")).toBeDisabled();
    expect(screen.getByLabelText("Decrease quantity")).toBeDisabled();
  });
});
