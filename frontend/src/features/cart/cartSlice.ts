import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export interface CartUiState {
  /** Toast-style banner shown after "Add to cart" clicks. */
  lastAdded: {
    name: string;
    variantId: string;
    at: number;
  } | null;
  drawerOpen: boolean;
}

const initialState: CartUiState = {
  lastAdded: null,
  drawerOpen: false,
};

const cartSlice = createSlice({
  name: "cartUi",
  initialState,
  reducers: {
    setLastAdded(
      state,
      action: PayloadAction<{ name: string; variantId: string }>,
    ) {
      state.lastAdded = { ...action.payload, at: Date.now() };
      // Also pop the drawer so the user sees what they added.
      state.drawerOpen = true;
    },
    clearLastAdded(state) {
      state.lastAdded = null;
    },
    openDrawer(state) {
      state.drawerOpen = true;
    },
    closeDrawer(state) {
      state.drawerOpen = false;
    },
  },
});

export const { setLastAdded, clearLastAdded, openDrawer, closeDrawer } =
  cartSlice.actions;
export default cartSlice.reducer;
