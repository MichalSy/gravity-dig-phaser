export interface NestableFile {
  name: string;
  path: string;
  kind: 'directory' | 'file';
}

export interface NestedFileRelation {
  primaryPath: string;
  childPath: string;
  ruleId: string;
  label: string;
  priority: number;
  order: number;
}

export interface NestedFileRule {
  id: string;
  resolve(files: readonly NestableFile[]): NestedFileRelation[];
}

export interface NestedFileChild<T extends NestableFile> {
  file: T;
  ruleId: string;
  label: string;
  order: number;
}

export interface NestedFileBundle<T extends NestableFile> {
  primary: T;
  children: NestedFileChild<T>[];
}

export interface NestedFileBundleResult<T extends NestableFile> {
  bundles: NestedFileBundle<T>[];
  bundledChildPaths: Set<string>;
  conflictedChildPaths: Set<string>;
}
