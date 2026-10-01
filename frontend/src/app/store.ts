import { configureStore } from "@reduxjs/toolkit";
import { toastsReducer } from "@/features/toasts/toastSlice";
import { api } from "@/services/api";

export const store = configureStore({
  reducer: {
    [api.reducerPath]: api.reducer,
    toasts: toastsReducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(api.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
