import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type ToastKind = "error" | "info";

export type ToastAction = "refetch";

export interface Toast {
  id: string;
  message: string;
  kind: ToastKind;
  action?: ToastAction;
  updatedAt: number;
}

interface ToastsState {
  items: Toast[];
}

export type ShowToastInput = Omit<Toast, "updatedAt">;

const initialState: ToastsState = { items: [] };

const toastSlice = createSlice({
  name: "toasts",
  initialState,
  reducers: {
    showToast: {
      reducer(state, action: PayloadAction<Toast>) {
        const index = state.items.findIndex((toast) => toast.id === action.payload.id);
        if (index === -1) {
          state.items.push(action.payload);
        } else {
          state.items[index] = action.payload;
        }
      },
      prepare(input: ShowToastInput) {
        return { payload: { ...input, updatedAt: Date.now() } };
      },
    },
    dismissToast(state, action: PayloadAction<string>) {
      state.items = state.items.filter((toast) => toast.id !== action.payload);
    },
  },
});

export const { showToast, dismissToast } = toastSlice.actions;
export const toastsReducer = toastSlice.reducer;
