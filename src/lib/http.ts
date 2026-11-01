// Wraps API route handlers so storage problems (for example MySQL not running)
// reach the browser as a clear JSON message instead of a blank 500 page.
import { NextResponse } from "next/server";
import { StorageError } from "./db/mysql";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withErrors<A extends any[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (e) {
      if (e instanceof StorageError) return NextResponse.json({ error: e.message }, { status: 503 });
      console.error(e);
      return NextResponse.json({ error: "Something went wrong on the server. Check the terminal for details." }, { status: 500 });
    }
  };
}
