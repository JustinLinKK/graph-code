import type { LucideIcon } from "lucide-react";
import {
  Boxes,
  Code2,
  Database,
  File,
  FileArchive,
  FileInput,
  FileOutput,
  FlaskConical,
  Globe2,
  KeyRound,
  Package,
  Radio,
  Settings2,
  Square,
  Terminal,
  Workflow
} from "lucide-react";

export type CustomBlockIconOption = {
  key: string;
  label: string;
  Icon: LucideIcon;
};

export const defaultCustomBlockIcon = "square";

export const customBlockIconOptions: CustomBlockIconOption[] = [
  { key: "square", label: "Square", Icon: Square },
  { key: "boxes", label: "Blocks", Icon: Boxes },
  { key: "workflow", label: "Workflow", Icon: Workflow },
  { key: "code-2", label: "Code", Icon: Code2 },
  { key: "terminal", label: "Command", Icon: Terminal },
  { key: "file", label: "File", Icon: File },
  { key: "file-input", label: "Input", Icon: FileInput },
  { key: "file-output", label: "Output", Icon: FileOutput },
  { key: "database", label: "Database", Icon: Database },
  { key: "globe-2", label: "API", Icon: Globe2 },
  { key: "package", label: "Dependency", Icon: Package },
  { key: "settings-2", label: "Config", Icon: Settings2 },
  { key: "key-round", label: "Secret", Icon: KeyRound },
  { key: "radio", label: "Event", Icon: Radio },
  { key: "file-archive", label: "Artifact", Icon: FileArchive },
  { key: "flask-conical", label: "Experiment", Icon: FlaskConical }
];

export function iconForCustomBlockType(iconKey: string | null | undefined): LucideIcon {
  return customBlockIconOptions.find((option) => option.key === iconKey)?.Icon ?? Square;
}
