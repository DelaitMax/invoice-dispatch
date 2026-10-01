import { configureStore } from "@reduxjs/toolkit";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { afterEach, describe, expect, it, vi } from "vitest";
import { showToast, toastsReducer } from "@/features/toasts/toastSlice";
import { ToastViewport } from "@/features/toasts/ToastViewport";
import { api } from "@/services/api";

function setup() {
  const store = configureStore({
    reducer: { [api.reducerPath]: api.reducer, toasts: toastsReducer },
    middleware: (getDefault) => getDefault().concat(api.middleware),
  });
  const dispatchSpy = vi.spyOn(store, "dispatch");
  render(
    <Provider store={store}>
      <ToastViewport />
    </Provider>,
  );
  return { store, dispatchSpy };
}

describe("ToastViewport", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing without toasts", () => {
    setup();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a toast and closes it with the × button", async () => {
    const { store } = setup();
    act(() => void store.dispatch(showToast({ id: "a", kind: "error", message: "Что-то случилось" })));
    expect(screen.getByRole("alert")).toHaveTextContent("Что-то случилось");

    await userEvent.click(screen.getByRole("button", { name: "Закрыть уведомление" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("dismisses itself after a few seconds", () => {
    vi.useFakeTimers();
    const { store } = setup();
    act(() => void store.dispatch(showToast({ id: "a", kind: "error", message: "temp" })));
    expect(screen.getByRole("alert")).toBeInTheDocument();

    act(() => void vi.advanceTimersByTime(6000));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("the retry action refetches active queries and closes the toast", async () => {
    const { store, dispatchSpy } = setup();
    act(() => void store.dispatch(showToast({ id: "network", kind: "error", message: "Нет связи", action: "refetch" })));

    await userEvent.click(screen.getByRole("button", { name: "Повторить" }));

    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: "api/invalidateTags" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("offers no retry button on a plain toast", () => {
    const { store } = setup();
    act(() => void store.dispatch(showToast({ id: "a", kind: "error", message: "plain" })));
    expect(screen.queryByRole("button", { name: "Повторить" })).not.toBeInTheDocument();
  });
});
