import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toggle } from "./Form";

/**
 * These cover the three ways the old switch misbehaved. Each one was a real
 * complaint, not a hypothetical:
 *
 *  - clicking the label did nothing, because only the 36px track was a button;
 *  - a server-backed switch did not move until the refetch landed, because the
 *    rendered position came straight from the `checked` prop;
 *  - two quick clicks sent the SAME value twice, because the second click also
 *    computed `!checked` from a prop that had not updated yet.
 */
describe("Toggle", () => {
  it("toggles when the LABEL is clicked, not just the track", async () => {
    const onChange = vi.fn();
    render(
      <Toggle
        checked={false}
        onChange={onChange}
        label="Visible on the storefront"
        description="Hidden categories 404."
      />,
    );

    await userEvent.click(screen.getByText("Visible on the storefront"));
    expect(onChange).toHaveBeenCalledWith(true);

    await userEvent.click(screen.getByText("Hidden categories 404."));
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("moves immediately on click, before the prop catches up", async () => {
    // `checked` deliberately never changes — this is the server-backed case,
    // where the new value only arrives after a round trip.
    render(<Toggle checked={false} onChange={() => {}} label="Active" />);
    const sw = screen.getByRole("switch");

    expect(sw).toHaveAttribute("aria-checked", "false");
    await userEvent.click(sw);
    expect(sw).toHaveAttribute("aria-checked", "true");
  });

  it("alternates on rapid repeated clicks", async () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} label="Active" />);
    const sw = screen.getByRole("switch");

    await userEvent.click(sw);
    await userEvent.click(sw);
    await userEvent.click(sw);

    expect(onChange.mock.calls.map(([v]) => v)).toEqual([true, false, true]);
  });

  it("reconciles to the prop once it arrives", async () => {
    const { rerender } = render(
      <Toggle checked={false} onChange={() => {}} label="Active" />,
    );
    const sw = screen.getByRole("switch");

    await userEvent.click(sw);
    expect(sw).toHaveAttribute("aria-checked", "true");

    rerender(<Toggle checked onChange={() => {}} label="Active" />);
    expect(sw).toHaveAttribute("aria-checked", "true");

    // A change driven from elsewhere (another row, a refetch) still wins.
    rerender(<Toggle checked={false} onChange={() => {}} label="Active" />);
    expect(sw).toHaveAttribute("aria-checked", "false");
  });

  it("snaps back when the write fails", async () => {
    const { rerender } = render(
      <Toggle
        checked={false}
        onChange={() => {}}
        label="Active"
        revertOn={false}
      />,
    );
    const sw = screen.getByRole("switch");

    await userEvent.click(sw);
    expect(sw).toHaveAttribute("aria-checked", "true");

    rerender(
      <Toggle checked={false} onChange={() => {}} label="Active" revertOn />,
    );
    expect(sw).toHaveAttribute("aria-checked", "false");
  });

  it("keeps the pending position when the failure flag merely clears", async () => {
    const { rerender } = render(
      <Toggle checked={false} onChange={() => {}} label="Active" revertOn />,
    );
    const sw = screen.getByRole("switch");

    await userEvent.click(sw);
    // A retry starting resets `isError` to false — that must not discard the
    // click that started it.
    rerender(
      <Toggle
        checked={false}
        onChange={() => {}}
        label="Active"
        revertOn={false}
      />,
    );
    expect(sw).toHaveAttribute("aria-checked", "true");
  });

  it("carries an accessible name with no visible label", () => {
    render(
      <Toggle checked onChange={() => {}} srLabel="Show the Deals section" />,
    );
    expect(
      screen.getByRole("switch", { name: "Show the Deals section" }),
    ).toBeInTheDocument();
  });

  it("does not fire when disabled", async () => {
    const onChange = vi.fn();
    render(
      <Toggle checked onChange={onChange} label="Featured" disabled />,
    );
    await userEvent.click(screen.getByText("Featured"));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });
});
