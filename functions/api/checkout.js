import { onRequest as handleApiRequest } from "./[[path]].js";

// Keep checkout on an explicit Pages Function route so it cannot fall
// through to the static HTML fallback. The shared handler validates the
// customer session and performs the existing order creation workflow.
export async function onRequest(context) {
  return handleApiRequest(context);
}
