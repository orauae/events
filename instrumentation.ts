/**
 * Next.js Instrumentation Hook
 *
 * Called once when the Next.js server starts. Used to initialise
 * pg-boss job queue workers and cron schedules.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only start the job queue on the server (not during build / edge)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerAllWorkers } = await import("@/lib/jobs/register-workers");
    await registerAllWorkers();
    console.log("[instrumentation] pg-boss workers registered");
  }
}
