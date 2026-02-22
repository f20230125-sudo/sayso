import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { conversationActions } from "./conversationSlice";

// What is open on the page, as opposed to what has been said or booked.

export type UiState = {
  /** Whether the "How it worked" panel is showing. */
  panelOpen: boolean;
  /** The turn the panel is about. Null means "whichever is latest". */
  panelTurn: string | null;
};

const initialState: UiState = { panelOpen: false, panelTurn: null };

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    /** Open the panel on one turn, or on the latest when none is named. */
    panelOpened(state, action: PayloadAction<string | null>) {
      state.panelOpen = true;
      state.panelTurn = action.payload;
    },
    panelClosed(state) {
      state.panelOpen = false;
    },
  },
  extraReducers: (builder) => {
    // Something new was asked: an open panel follows it.
    builder.addCase(conversationActions.turnAdded, (state) => {
      state.panelTurn = null;
    });
    builder.addCase(conversationActions.conversationLoaded, (state) => {
      state.panelTurn = null;
    });
  },
});

export const uiActions = uiSlice.actions;
export const uiReducer = uiSlice.reducer;
