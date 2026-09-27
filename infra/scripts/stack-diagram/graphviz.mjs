import { execFileSync } from 'node:child_process';

export class Graphviz {
  static read(file) {
    return Graphviz.#run(['-Tdot_json', file]);
  }

  static layout(source) {
    return Graphviz.#run(['-Tjson'], source);
  }

  static route(source, attempts) {
    for (const [splines, inset] of attempts) {
      try {
        return {
          splines,
          graph: Graphviz.#run(
            ['-Kneato', '-n2', '-Tjson', `-Gsplines=${splines}`],
            source(inset),
          ),
        };
      } catch {}
    }
    return { splines: undefined, graph: { edges: [] } };
  }

  static #run(args, input) {
    const output = execFileSync('dot', args, {
      input,
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    return JSON.parse(output.toString());
  }
}
