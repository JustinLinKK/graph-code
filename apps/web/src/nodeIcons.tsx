import { extensionNodeDefinitionForKind, type GraphNodeKind } from "@graphcode/graph-model";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Box,
  BrainCircuit,
  Braces,
  Code2,
  Cpu,
  Database,
  File,
  FileArchive,
  FileInput,
  FileJson,
  FileOutput,
  FileType,
  FlaskConical,
  FolderTree,
  Gauge,
  Globe2,
  KeyRound,
  Layers,
  LayoutDashboard,
  LineChart,
  Microchip,
  Network,
  Package,
  PanelsTopLeft,
  Plug,
  Radio,
  RadioTower,
  Settings2,
  SlidersHorizontal,
  Square,
  Terminal,
  Timer,
  Wand,
  Workflow,
  Zap
} from "lucide-react";

const builtInIcons: Record<string, LucideIcon> = {
  framework: LayoutDashboard,
  module: FolderTree,
  website: Globe2,
  ui_component: PanelsTopLeft,
  function: Braces,
  object: Box,
  dependency: Package,
  input: FileInput,
  output: FileOutput,
  process: Workflow,
  format: FileType,
  environment: Code2,
  config: Settings2,
  secret: KeyRound,
  command: Terminal,
  file: File,
  database: Database,
  api: Globe2,
  event: Radio,
  artifact: FileArchive,
  custom: Square
};

const extensionIcons: Record<string, LucideIcon> = {
  activity: Activity,
  box: Box,
  "brain-circuit": BrainCircuit,
  cpu: Cpu,
  database: Database,
  "file-archive": FileArchive,
  "file-input": FileInput,
  "flask-conical": FlaskConical,
  gauge: Gauge,
  layers: Layers,
  "line-chart": LineChart,
  microchip: Microchip,
  network: Network,
  plug: Plug,
  radio: Radio,
  "radio-tower": RadioTower,
  "sliders-horizontal": SlidersHorizontal,
  terminal: Terminal,
  timer: Timer,
  wand: Wand,
  workflow: Workflow,
  zap: Zap
};

export function iconForNodeKind(kind: GraphNodeKind): LucideIcon {
  const extensionIcon = extensionNodeDefinitionForKind(kind)?.icon;
  return (extensionIcon ? extensionIcons[extensionIcon] : null) ?? builtInIcons[kind] ?? FileJson;
}
