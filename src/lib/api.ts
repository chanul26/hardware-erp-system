import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

/**
 * Every API route in this app returns one of two shapes:
 *   success -> { success: true,  data: <payload> }
 *   failure -> { success: false, error: <safe message>, details?: <field errors> }
 *
 * Internal error text is never sent to the client. It is logged server-side and
 * replaced with a generic message, so database structure and stack details do
 * not leak through the API.
 */

export type ApiSuccess<T> = { success: true; data: T };
export type ApiFailure = { success: false; error: string; details?: unknown };

/** An error whose message is safe to show the user, carrying an HTTP status. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const badRequest = (msg: string, details?: unknown) =>
  new HttpError(400, msg, details);
export const unauthorized = (msg = "You must be signed in.") =>
  new HttpError(401, msg);
export const forbidden = (msg = "You do not have permission to do that.") =>
  new HttpError(403, msg);
export const notFound = (msg = "Not found.") => new HttpError(404, msg);
export const conflict = (msg: string) => new HttpError(409, msg);

export function ok<T>(data: T, status = 200) {
  return NextResponse.json<ApiSuccess<T>>({ success: true, data }, { status });
}

export function fail(error: string, status: number, details?: unknown) {
  const body: ApiFailure = { success: false, error };
  if (details !== undefined) body.details = details;
  return NextResponse.json(body, { status });
}

/**
 * Turns any thrown value into a safe response. Known error types get a useful
 * message and correct status; everything else becomes a generic 500 with the
 * real cause logged for the operator.
 */
export function toErrorResponse(scope: string, error: unknown) {
  if (error instanceof HttpError) {
    return fail(error.message, error.status, error.details);
  }

  if (error instanceof ZodError) {
    // Flatten to { fieldName: ["message"] } so forms can highlight inputs.
    const details = error.issues.reduce<Record<string, string[]>>(
      (acc, issue) => {
        const key = issue.path.join(".") || "_";
        (acc[key] ??= []).push(issue.message);
        return acc;
      },
      {}
    );
    return fail("Some fields are invalid.", 400, details);
  }

  if (error instanceof SyntaxError) {
    // Thrown by req.json() on a malformed body.
    return fail("Request body is not valid JSON.", 400);
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case "P2002": {
        const target = (error.meta?.target as string[] | undefined)?.join(", ");
        return fail(
          target
            ? `A record with this ${target} already exists.`
            : "A record with these details already exists.",
          409
        );
      }
      case "P2003":
        return fail(
          "This record is still referenced by other records and cannot be changed.",
          409
        );
      case "P2025":
        return fail("The record you are trying to change no longer exists.", 404);
    }
  }

  console.error(`[${scope}]`, error);
  return fail("Something went wrong. Please try again.", 500);
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/**
 * Wraps a route handler so no exception can escape as an unhandled 500 with a
 * leaked stack trace. Use for every route.
 */
export function route<C = unknown>(scope: string, handler: Handler<C>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      return await handler(req, ctx);
    } catch (error) {
      return toErrorResponse(scope, error);
    }
  };
}

/** Parses and validates a JSON body, throwing ZodError/SyntaxError for `route` to map. */
export async function parseBody<T>(
  req: Request,
  schema: { parse: (v: unknown) => T }
): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw badRequest("Request body is not valid JSON.");
  }
  return schema.parse(raw);
}

/** Parses and validates query-string params. */
export function parseQuery<T>(
  req: Request,
  schema: { parse: (v: unknown) => T }
): T {
  const params = Object.fromEntries(new URL(req.url).searchParams.entries());
  return schema.parse(params);
}
