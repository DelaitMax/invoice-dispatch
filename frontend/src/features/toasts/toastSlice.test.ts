import { describe, expect, it } from "vitest";
import { dismissToast, showToast, toastsReducer } from "@/features/toasts/toastSlice";

const empty = { items: [] };

describe("toastSlice", () => {
  it("adds a toast", () => {
    const state = toastsReducer(empty, showToast({ id: "a", kind: "error", message: "boom" }));
    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toMatchObject({ id: "a", message: "boom" });
  });

  it("replaces a toast with the same id instead of stacking a duplicate", () => {
    let state = toastsReducer(empty, showToast({ id: "network", kind: "error", message: "first" }));
    state = toastsReducer(state, showToast({ id: "network", kind: "error", message: "second" }));
    expect(state.items).toHaveLength(1);
    expect(state.items[0]?.message).toBe("second");
  });

  it("keeps toasts with different ids side by side", () => {
    let state = toastsReducer(empty, showToast({ id: "a", kind: "error", message: "1" }));
    state = toastsReducer(state, showToast({ id: "b", kind: "info", message: "2" }));
    expect(state.items.map((toast) => toast.id)).toEqual(["a", "b"]);
  });

  it("dismisses only the toast with the given id", () => {
    let state = toastsReducer(empty, showToast({ id: "a", kind: "error", message: "1" }));
    state = toastsReducer(state, showToast({ id: "b", kind: "error", message: "2" }));
    state = toastsReducer(state, dismissToast("a"));
    expect(state.items.map((toast) => toast.id)).toEqual(["b"]);
  });
});
