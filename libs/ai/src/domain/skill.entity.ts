export class SkillFile {
  constructor(
    public readonly name: string,
    public readonly content: string,
  ) {}
}

export class SkillProps {
  name!: string;
  description!: string;
  body!: string;
  references: SkillFile[];
  scripts: SkillFile[];
  assets: SkillFile[];
  tags: string[];

  constructor(props: {
    name: string;
    description: string;
    body: string;
    references?: SkillFile[];
    scripts?: SkillFile[];
    assets?: SkillFile[];
    tags?: string[];
  }) {
    this.name = props.name;
    this.description = props.description;
    this.body = props.body;
    this.references = props.references ?? [];
    this.scripts = props.scripts ?? [];
    this.assets = props.assets ?? [];
    this.tags = props.tags ?? [];
  }
}

export class Skill {
  constructor(
    private readonly props: SkillProps,
    private _id?: string,
  ) {}

  get id(): string {
    return this._id || this.props.name;
  }

  get name(): string {
    return this.props.name;
  }

  set name(value: string) {
    this.props.name = value;
  }

  get description(): string {
    return this.props.description;
  }

  set description(value: string) {
    this.props.description = value;
  }

  get body(): string {
    return this.props.body;
  }

  set body(value: string) {
    this.props.body = value;
  }

  get references(): SkillFile[] {
    return this.props.references;
  }

  set references(value: SkillFile[]) {
    this.props.references = value;
  }

  get scripts(): SkillFile[] {
    return this.props.scripts;
  }

  set scripts(value: SkillFile[]) {
    this.props.scripts = value;
  }

  get assets(): SkillFile[] {
    return this.props.assets;
  }

  set assets(value: SkillFile[]) {
    this.props.assets = value;
  }

  get tags(): string[] {
    return this.props.tags;
  }

  set tags(value: string[]) {
    this.props.tags = value;
  }

  /**
   * The `SKILL.md` a skills loader reads: YAML frontmatter, then the body.
   *
   * The description is emitted as a FOLDED BLOCK SCALAR (`>-`), never as a plain
   * one, and that is load-bearing rather than stylistic. A description is prose,
   * and prose contains colons — `... com \`dryRun: true\`, ...` inside a plain
   * scalar is not text, it is a mapping indicator, so the parser reads
   * `` ... `dryRun `` as a key and fails the whole document with
   * `BLOCK_AS_IMPLICIT_KEY`.
   *
   * That failure is silent: deepagents' `parseSkillMetadataFromContent` logs a
   * warning and returns `null`, so the skill simply is not there. The agent
   * keeps answering, minus a capability, and nothing on the request path says
   * so. Folding is what makes the content unreadable as structure.
   */
  get content(): string {
    return `---
name: ${this.name}
description: >-
${this.description
  .split('\n')
  .map((line) => `  ${line}`)
  .join('\n')}
---

${this.body}
`;
  }

  static create(props: ConstructorParameters<typeof SkillProps>[0]): Skill {
    const entity = new Skill(new SkillProps(props));
    return entity;
  }
}
