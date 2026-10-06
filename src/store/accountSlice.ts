import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { localDay } from "@/airline/dates";
import type { Account, OrderResult } from "@/airline/schema";

// The traveller's account: who they are and what they have booked. It lives in
// the browser only. The server is handed a booking with each request and hands
// its new state back; this slice is where that new state is kept.

export type AccountState = {
  /** Null until the browser's storage has been read. */
  account: Account | null;
};

const initialState: AccountState = { account: null };

const accountSlice = createSlice({
  name: "account",
  initialState,
  reducers: {
    accountLoaded(state, action: PayloadAction<Account>) {
      state.account = action.payload;
    },
    /** An order went through: keep the booking as it now stands, and note the payment. */
    orderPlaced(state, action: PayloadAction<OrderResult>) {
      const { account } = state;
      if (!account) return;
      const { booking, receipt } = action.payload;
      const index = account.bookings.findIndex((entry) => entry.code === booking.code);
      if (index === -1) account.bookings.push(booking);
      else account.bookings[index] = booking;

      if (receipt.total !== 0) {
        account.payments.unshift({
          id: receipt.id,
          date: localDay(new Date(receipt.at)),
          amount: receipt.total,
          what: receipt.lines.map((line) => line.label).join("; "),
          route: `${booking.flight.fromCity} to ${booking.flight.toCity}`,
          bookingCode: booking.code,
        });
      }
    },
  },
});

export const accountActions = accountSlice.actions;
export const accountReducer = accountSlice.reducer;
