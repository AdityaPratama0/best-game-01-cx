// Hands the entry in: copies game/ (the playable static files) and screenshots/ beside this file to
// MAKEFUN_OUTPUT_DIR (default /output), then writes dossier.json there with the kit's buildDossier.
// The scorer runs this twice and requires both runs to write the same bytes, so nothing here reads
// the clock, a random source or the environment besides the output directory.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repository = fileURLToPath(new URL('.', import.meta.url));
const output = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(output, { recursive: true });

// game/ is copied whole; screenshots/ only when one was taken, so an early run still writes a dossier.
cpSync(join(repository, 'game'), join(output, 'game'), { recursive: true });
if (existsSync(join(repository, 'screenshots'))) {
  cpSync(join(repository, 'screenshots'), join(output, 'screenshots'), { recursive: true });
}

// The caps the bounty's gate holds the entry to: the text cap shapes the dossier's bytes, the rest
// refuse exactly what the scorer would refuse (game/ file and byte totals, path lengths, images).
writeFileSync(
  join(output, 'dossier.json'),
  buildDossier(output, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

console.log(`wrote ${join(output, 'dossier.json')}`);
