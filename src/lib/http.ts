import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AIError } from "./ai";

/** Wraps a route handler: validation and AI errors become readable JSON errors. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof z.ZodError) return NextResponse.json({ error: "Some fields are missing or invalid." }, { status: 400 });
      if (e instanceof AIError) return NextResponse.json({ error: e.message }, { status: 502 });
      console.error(e);
      return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
    }
  };
}

export const notFound = () => NextResponse.json({ error: "Not found." }, { status: 404 });
