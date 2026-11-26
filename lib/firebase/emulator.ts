/**
 * When the browser code may talk to the local Firebase emulators instead of a real project (S5-07/S5-09/S5-10 test setup).
 * Pure, so the rule is tested: it needs the explicit flag AND a project id that starts with `demo-` (the prefix Firebase reserves for
 * emulator-only projects). A real deployment never sets the flag, and even if it did, its project id would not start with `demo-`.
 */
export type EmulatorHosts = { auth: { host: string; port: number }; firestore: { host: string; port: number } };

export function emulatorConfig(env: { flag?: string; projectId?: string; authHost?: string; firestoreHost?: string }): EmulatorHosts | null {
  if (env.flag !== "1" || !(env.projectId ?? "").startsWith("demo-")) return null;
  const split = (hostPort: string | undefined, fallback: string) => {
    const [host, port] = (hostPort || fallback).split(":");
    return { host, port: Number(port) };
  };
  return { auth: split(env.authHost, "127.0.0.1:9099"), firestore: split(env.firestoreHost, "127.0.0.1:8080") };
}
