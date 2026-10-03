import { Skill, SkillFile } from '../domain/skill.entity';
import { SkillsBackend } from './skills.backend';

function skill(name: string, extra: Partial<{ references: SkillFile[] }> = {}) {
  return Skill.create({
    name,
    description: `${name} description`,
    body: `# ${name}\n\nbody`,
    ...extra,
  });
}

describe('rendering skills into a filesystem', () => {
  it('puts each skill where its directory says it is', () => {
    const handoff = skill('handoff-to-human');

    expect(SkillsBackend.directoriesOf([handoff])).toEqual([
      '/skills/handoff-to-human/',
    ]);
    expect(SkillsBackend.pathOf(handoff)).toBe(
      '/skills/handoff-to-human/SKILL.md',
    );
    expect(Object.keys(SkillsBackend.filesOf([handoff]))).toEqual([
      '/handoff-to-human/SKILL.md',
    ]);
  });

  it('renders frontmatter and body as one SKILL.md', () => {
    const content = SkillsBackend.filesOf([skill('consulta-juridica')])[
      '/consulta-juridica/SKILL.md'
    ];

    expect(content).toContain('name: consulta-juridica');
    expect(content).toContain(
      'description: >-\n  consulta-juridica description',
    );
    expect(content).toContain('# consulta-juridica');
  });

  it('bundles references alongside the skill that owns them', () => {
    const files = SkillsBackend.filesOf([
      skill('attach-document', {
        references: [new SkillFile('contract.md', 'the contract')],
      }),
    ]);

    expect(files['/attach-document/references/contract.md']).toBe(
      'the contract',
    );
  });

  it('serves what it rendered', async () => {
    const backend = new SkillsBackend([skill('handoff-to-human')]);
    const read = await backend.read('/handoff-to-human/SKILL.md');

    expect(JSON.stringify(read)).toContain('handoff-to-human');
  });

  it('mounts them where their directories say, beside an agent’s own files', async () => {
    const handoff = skill('handoff-to-human');
    const backend = SkillsBackend.mount([handoff]);

    const read = await backend.read(SkillsBackend.pathOf(handoff));

    expect(read.error).toBeUndefined();
    expect(read.content).toContain('# handoff-to-human');
  });
});

describe('collecting skills across an agent tree', () => {
  it('takes them from agents and bare lists alike', () => {
    const chat = { skills: [skill('handoff-to-human')] };
    const legal = { skills: [skill('consulta-juridica')] };

    expect(
      SkillsBackend.collect([skill('own')], chat, legal).map((s) => s.name),
    ).toEqual(['own', 'handoff-to-human', 'consulta-juridica']);
  });

  it('ignores a contributor that declares none', () => {
    expect(SkillsBackend.collect({ skills: [] }, {}, undefined)).toEqual([]);
  });

  it('keeps the first declaration when a name repeats', () => {
    const mine = skill('attach-document');
    const theirs = Skill.create({
      name: 'attach-document',
      description: 'a different one',
      body: 'different',
    });

    const collected = SkillsBackend.collect([mine], { skills: [theirs] });
    expect(collected).toHaveLength(1);
    expect(collected[0].description).toBe('attach-document description');
  });
});

describe('what a supervisor may actually read', () => {
  const handoff = skill('handoff-to-human');
  const consulta = skill('consulta-juridica');
  const all = [consulta, handoff];

  it('leaves a skill an inline subagent claimed to that subagent', () => {
    const chat = { name: 'chat', skills: ['/skills/handoff-to-human/'] };

    expect(SkillsBackend.supervisorDirectories(all, [chat as never])).toEqual([
      '/skills/consulta-juridica/',
    ]);
  });

  it('takes on the skills of a compiled subagent, which cannot claim any', () => {
    const legal = { name: 'LegalKnowledgeGraphAgent', runnable: {} };

    expect(SkillsBackend.supervisorDirectories(all, [legal as never])).toEqual([
      '/skills/consulta-juridica/',
      '/skills/handoff-to-human/',
    ]);
  });

  it('discloses nothing when every skill was claimed', () => {
    const chat = {
      name: 'chat',
      skills: ['/skills/handoff-to-human/', '/skills/consulta-juridica/'],
    };

    expect(SkillsBackend.supervisorDirectories(all, [chat as never])).toEqual(
      [],
    );
  });
});
