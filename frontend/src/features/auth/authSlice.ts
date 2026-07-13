import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type UserRole = "CUSTOMER" | "ADMIN";

export interface AuthUser {
  uid: string;
  email: string;
  name?: string | null;
  role: UserRole;
}

export interface AuthState {
  user: AuthUser | null;
  idToken: string | null;
  status: "idle" | "loading" | "authenticated" | "unauthenticated";
}

const initialState: AuthState = {
  user: null,
  idToken: null,
  status: "idle",
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setAuthLoading(state) {
      state.status = "loading";
    },
    setAuthenticated(
      state,
      action: PayloadAction<{ user: AuthUser; idToken: string }>,
    ) {
      state.user = action.payload.user;
      state.idToken = action.payload.idToken;
      state.status = "authenticated";
    },
    setUnauthenticated(state) {
      state.user = null;
      state.idToken = null;
      state.status = "unauthenticated";
    },
    setIdToken(state, action: PayloadAction<string>) {
      state.idToken = action.payload;
    },
  },
});

export const { setAuthLoading, setAuthenticated, setUnauthenticated, setIdToken } =
  authSlice.actions;

export default authSlice.reducer;
