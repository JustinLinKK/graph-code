import { describe, expect, it } from "vitest";
import { z } from "zod";
import { listCommands } from "../../commands";
import {
  buildAgentPrompt,
  DEEPGRAM_FUNCTIONS,
  resolveSpeakModel
} from "./functions";

function getZodShape(command: { argsSchema: z.ZodType<unknown> }) {
  const objectSchema = command.argsSchema as z.ZodObject<z.ZodRawShape>;
  const shape = objectSchema.shape ?? {};
  const properties = Object.keys(shape);
  const required = properties.filter((key) => !(shape[key] instanceof z.ZodOptional));
  return { properties, required };
}

describe("DEEPGRAM_FUNCTIONS", () => {
  it("contains only commands that exist in the registry", () => {
    const commandNames = new Set(listCommands().map((c) => c.name));
    for (const fn of DEEPGRAM_FUNCTIONS) {
      expect(commandNames).toContain(fn.name);
    }
  });

  it("excludes destructive commands", () => {
    const names = DEEPGRAM_FUNCTIONS.map((f) => f.name);
    expect(names).not.toContain("reset_workspace");
  });

  it("matches each registry command's zod shape", () => {
    const commands = listCommands();
    for (const fn of DEEPGRAM_FUNCTIONS) {
      const command = commands.find((c) => c.name === fn.name);
      expect(command).toBeDefined();
      const zodShape = getZodShape(command!);
      const schemaProperties = Object.keys(fn.parameters.properties);
      expect(new Set(schemaProperties)).toEqual(new Set(zodShape.properties));
      expect(new Set(fn.parameters.required ?? [])).toEqual(new Set(zodShape.required));
    }
  });

  it("uses an English Aura-2 voice for both languages (Chinese TTS is not available)", () => {
    expect(resolveSpeakModel("en-US")).toContain("aura-2");
    expect(resolveSpeakModel("zh-CN")).toContain("aura-2");
  });
});

describe("buildAgentPrompt", () => {
  it("mentions project and selected node", () => {
    const prompt = buildAgentPrompt(
      {
        projectId: "p1",
        projectName: "demo",
        selectedNodeId: "n1",
        scopeNodeId: null,
        nodes: [{ id: "n1", name: "parser" }],
        agentRuns: [],
        hasActiveCodingWorkflow: false
      },
      "en-US"
    );
    expect(prompt).toContain("demo");
    expect(prompt).toContain("parser");
    expect(prompt).toContain("summary");
  });

  it("caps the node list at 50 names", () => {
    const nodes = Array.from({ length: 60 }, (_, i) => ({ id: `n${i}`, name: `node-${i}` }));
    const prompt = buildAgentPrompt(
      {
        projectId: "p1",
        projectName: "demo",
        selectedNodeId: null,
        scopeNodeId: null,
        nodes,
        agentRuns: [],
        hasActiveCodingWorkflow: false
      },
      "zh-CN"
    );
    const matches = prompt.match(/node-\d+/g) ?? [];
    expect(matches.length).toBeLessThanOrEqual(50);
  });
});
