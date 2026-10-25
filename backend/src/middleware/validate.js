import { ApiError } from "./errorHandler.js";

/** Validates req[source] against a zod schema, replacing it with the parsed
 * (typed + defaulted) value on success, or raising a 400 with field details. */
export function validate(schema, source = "body") {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
      return next(new ApiError(400, "Invalid request", details));
    }
    req[source] = result.data;
    next();
  };
}
