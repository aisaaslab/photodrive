import { describe, expect, it } from "vitest";
import { emulatorConfig } from "@/lib/firebase/emulator";

describe("browser emulator switch", () => {
  it("is off unless the flag is exactly 1", () => {
    for (const flag of [undefined, "", "0", "true", "yes"]) expect(emulatorConfig({ flag, projectId: "demo-photodrive" })).toBeNull();
  });

  it("is off for any project that is not a demo- project, even with the flag (a real deployment can never use it)", () => {
    for (const projectId of [undefined, "", "photodrive-prod", "my-demo-project", "placeholder", "Demo-x"]) {
      expect(emulatorConfig({ flag: "1", projectId })).toBeNull();
    }
  });

  it("is on for the flag plus a demo- project, with default or given hosts", () => {
    expect(emulatorConfig({ flag: "1", projectId: "demo-photodrive" })).toEqual({
      auth: { host: "127.0.0.1", port: 9099 },
      firestore: { host: "127.0.0.1", port: 8080 },
    });
    expect(emulatorConfig({ flag: "1", projectId: "demo-x", authHost: "localhost:9199", firestoreHost: "db:8181" })).toEqual({
      auth: { host: "localhost", port: 9199 },
      firestore: { host: "db", port: 8181 },
    });
  });
});
