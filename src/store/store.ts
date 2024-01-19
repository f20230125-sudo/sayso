import {
  combineReducers,
  configureStore,
  createListenerMiddleware,
  type ThunkAction,
  type TypedStartListening,
  type UnknownAction,
} from "@reduxjs/toolkit";
import { accountReducer } from "./accountSlice";
import { conversationReducer } from "./conversationSlice";
import { save, type KeyValueStore } from "./persist";

const rootReducer = combineReducers({
  account: accountReducer,
  conversation: conversationReducer,
});

export type RootState = ReturnType<typeof rootReducer>;

/** Everything from outside that the thunks use. Tests pass stand-ins for all of it. */
export type Extra = {
  /** Where the account and the conversation are kept between visits. Null on the server. */
  storage: KeyValueStore | null;
  fetch: typeof fetch;
  /** The date and time, for "today". */
  now: () => Date;
  /** Milliseconds that only move forward, for timing calls. */
  clock: () => number;
  /** One per turn that is running, so it can be stopped. */
  controllers: Map<string, AbortController>;
};

export const SAVE_DELAY_MS = 250;

/**
 * Build a store. Everything it reaches outside itself for comes in through
 * `extra`, so the app hands it the browser and a test hands it stand-ins.
 */
export function makeStore(extra: Extra) {
  const listeners = createListenerMiddleware({ extra });
  const startListening = listeners.startListening as AppStartListening;

  // Save shortly after the account or the conversation stops changing. Each
  // change cancels the wait of the one before, so a burst leads to one save.
  startListening({
    predicate: (_action, state, previous) => state.account !== previous.account || state.conversation !== previous.conversation,
    effect: async (_action, listener) => {
      listener.cancelActiveListeners();
      await listener.delay(SAVE_DELAY_MS);
      const { account, conversation } = listener.getState();
      if (account.account) save(extra.storage, { account: account.account, turns: conversation.turns });
    },
  });

  return configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) => getDefaultMiddleware({ thunk: { extraArgument: extra } }).prepend(listeners.middleware),
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type AppDispatch = AppStore["dispatch"];
export type AppThunk<Result = void> = ThunkAction<Result, RootState, Extra, UnknownAction>;
export type AppStartListening = TypedStartListening<RootState, AppDispatch, Extra>;
