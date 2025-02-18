import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { NO_AI, storeAiConfig, type AiConfig } from "@/ai/settings";
import type { AppThunk } from "./store";

// Settings that belong to the visitor: which model the desk may ask, if any.
// They are kept in the browser and never sent to Sayso's server.

export type SettingsState = {
  ai: AiConfig;
  /** Whether the settings dialog is showing. */
  open: boolean;
};

const initialState: SettingsState = { ai: NO_AI, open: false };

const settingsSlice = createSlice({
  name: "settings",
  initialState,
  reducers: {
    aiConfigSet(state, action: PayloadAction<AiConfig>) {
      state.ai = action.payload;
    },
    settingsOpened(state) {
      state.open = true;
    },
    settingsClosed(state) {
      state.open = false;
    },
  },
});

export const settingsActions = settingsSlice.actions;
export const settingsReducer = settingsSlice.reducer;

/** Apply new model settings and remember them in the browser. */
export const saveAiConfig =
  (config: AiConfig): AppThunk =>
  (dispatch, _getState, { storage }) => {
    dispatch(settingsActions.aiConfigSet(config));
    storeAiConfig(storage, config);
  };
