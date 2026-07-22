import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export interface MergeNotice {
  addedLines: number;
  bumpedLines: number;
  cappedLines: number;
  droppedLines: number;
  at: number;
}

export interface CartUiState {
  /** Toast-style banner shown after "Add to cart" clicks. */
  lastAdded: {
    name: string;
    variantId: string;
    at: number;
  } | null;
  /** Populated after a successful guest→user cart merge on login so the UI
   *  can surface "we merged N items from your guest cart." Cleared when the
   *  user dismisses the toast or lands on a new route. */
  mergeNotice: MergeNotice | null;
  drawerOpen: boolean;
}

const initialState: CartUiState = {
  lastAdded: null,
  mergeNotice: null,
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
    setMergeNotice(
      state,
      action: PayloadAction<Omit<MergeNotice, "at">>,
    ) {
      // Only show when something actually happened — silent no-ops shouldn't
      // surface a toast.
      const { addedLines, bumpedLines, cappedLines, droppedLines } = action.payload;
      if (addedLines + bumpedLines + cappedLines + droppedLines === 0) return;
      state.mergeNotice = { ...action.payload, at: Date.now() };
    },
    clearMergeNotice(state) {
      state.mergeNotice = null;
    },
    openDrawer(state) {
      state.drawerOpen = true;
    },
    closeDrawer(state) {
      state.drawerOpen = false;
    },
  },
});

export const {
  setLastAdded,
  clearLastAdded,
  setMergeNotice,
  clearMergeNotice,
  openDrawer,
  closeDrawer,
} = cartSlice.actions;
export default cartSlice.reducer;
